"""BotNira — WhatsApp Business Calling (Meta Cloud API) + TURN for WebRTC.

Capabilities
------------
- TURN credentials via Twilio Network Traversal Service (browser WebRTC).
- Enable / read WhatsApp calling settings on the vendor's WABA number.
- Handle inbound WhatsApp call webhooks: log the call into the SAME inbox
  thread and (best-effort) ring the agent's browser over a signaling WS.
- Signaling WS relays SDP offer/answer + call actions (connect / accept /
  reject / terminate) between the agent's browser and Meta's Graph API.
- Outbound (business-initiated) calls: only where Meta allows it. For numbers
  whose country is US/Canada/Egypt/Vietnam/Nigeria, Meta blocks business-
  initiated calls, so the UI falls back to a Twilio PSTN call instead.

Meta bills WhatsApp calls separately from Twilio voice minutes, so these calls
are logged (call_records + thread) but do NOT deduct Twilio voice minutes.
"""
import json
import asyncio
import os
from typing import Optional, Dict, Any, Set

import httpx
import jwt
from fastapi import APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect

import server as _s

router = APIRouter()

# The WhatsApp Business CALLING API requires Graph API v23.0+ (messaging uses an
# older pinned version elsewhere). Keep this independent + env-overridable.
GRAPH_CALL_VERSION = os.environ.get("GRAPH_CALL_VERSION", "v23.0")
GRAPH_CALL_BASE = f"https://graph.facebook.com/{GRAPH_CALL_VERSION}"

# Business-initiated calling is unavailable for these business-number country
# codes (Meta restriction). Longest prefixes first for correct matching.
BLOCKED_OUTBOUND_CC = ["234", "84", "20", "1"]


# --------------------------------------------------------------------------- #
# Signaling hub: vendor_id -> set of connected agent browsers
# --------------------------------------------------------------------------- #
_rooms: Dict[str, Set[WebSocket]] = {}


async def _broadcast(vendor_id: str, message: dict):
    dead = []
    for ws in _rooms.get(vendor_id, set()):
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _rooms.get(vendor_id, set()).discard(ws)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _digits(s: str) -> str:
    return "".join(ch for ch in (s or "") if ch.isdigit())


def _outbound_supported(display_number: str) -> bool:
    d = _digits(display_number)
    for cc in BLOCKED_OUTBOUND_CC:
        if d.startswith(cc):
            return False
    return True


async def _graph_get(path: str, token: str, params: dict = None):
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{GRAPH_CALL_BASE}/{path}",
                         headers={"Authorization": f"Bearer {token}"}, params=params or {})
        r.raise_for_status()
        return r.json()


async def _graph_post(path: str, token: str, body: dict):
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(f"{GRAPH_CALL_BASE}/{path}",
                         headers={"Authorization": f"Bearer {token}"}, json=body)
        if r.status_code >= 400:
            _s.logger.warning("[wa-call] graph %s -> %s %s", path, r.status_code, r.text[:300])
        r.raise_for_status()
        return r.json()


def _friendly_calling_error(text: str) -> str:
    """Turn Meta's raw calling-API error JSON into an actionable message."""
    err = {}
    try:
        err = (json.loads(text) or {}).get("error", {}) or {}
    except Exception:
        pass
    code = err.get("code")
    if code == 138015:
        return (
            "WhatsApp calling can't be turned on for this number yet. Meta only allows it once the "
            "number reaches a messaging limit of at least 2,000 customers per day AND your app is "
            "subscribed to the 'calls' webhook field. New numbers start at a lower tier — keep sending "
            "WhatsApp messages to quality contacts to grow your tier, subscribe to the 'calls' webhook "
            "in Meta App settings, then try again. (Meta error 138015)"
        )
    msg = err.get("message") or "Meta could not enable WhatsApp calling for this number right now."
    details = ((err.get("error_data") or {}).get("details")) or ""
    return f"{msg}{(' — ' + details) if details else ''}"


async def _get_wc(vendor_id: str) -> dict:
    wc = await _s.db.whatsapp_connections.find_one({"vendor_id": vendor_id}, {"_id": 0})
    if not wc or not wc.get("phone_number_id"):
        raise HTTPException(400, "WhatsApp is not connected for this account.")
    return wc


async def _display_number(wc: dict) -> str:
    if wc.get("display_phone_number"):
        return wc["display_phone_number"]
    token = wc.get("access_token") or _s.META_SYSTEM_USER_TOKEN
    try:
        data = await _graph_get(wc["phone_number_id"], token, {"fields": "display_phone_number"})
        disp = data.get("display_phone_number", "")
        if disp:
            await _s.db.whatsapp_connections.update_one(
                {"vendor_id": wc["vendor_id"]}, {"$set": {"display_phone_number": disp}})
        return disp
    except Exception:
        return ""


# --------------------------------------------------------------------------- #
# TURN (Twilio Network Traversal Service)
# --------------------------------------------------------------------------- #
@router.get("/voice/turn")
async def turn_credentials(user: dict = Depends(_s.require_vendor)):
    """Short-lived ICE (STUN+TURN) servers for browser WebRTC (WhatsApp calls)."""
    if not (_s.TWILIO_ACCOUNT_SID and _s.TWILIO_AUTH_TOKEN):
        # STUN-only fallback
        return {"ice_servers": [{"urls": "stun:stun.l.google.com:19302"}]}
    try:
        from twilio.rest import Client as TwilioClient
        cli = TwilioClient(_s.TWILIO_ACCOUNT_SID, _s.TWILIO_AUTH_TOKEN)
        tok = cli.tokens.create(ttl=3600)
        return {"ice_servers": tok.ice_servers, "ttl": 3600}
    except Exception as e:
        _s.logger.warning("[wa-call] TURN create failed: %s", e)
        return {"ice_servers": [{"urls": "stun:stun.l.google.com:19302"}]}


# --------------------------------------------------------------------------- #
# Calling settings (enable / status)
# --------------------------------------------------------------------------- #
@router.get("/whatsapp/calling/status")
async def calling_status(user: dict = Depends(_s.require_vendor)):
    wc = await _get_wc(user["vendor_id"])
    display = await _display_number(wc)
    return {
        "connected": True,
        "display_phone_number": display,
        "calling_enabled": bool(wc.get("calling_enabled")),
        "outbound_supported": _outbound_supported(display),
    }


@router.post("/whatsapp/calling/enable")
async def calling_enable(user: dict = Depends(_s.require_vendor)):
    wc = await _get_wc(user["vendor_id"])
    token = wc.get("access_token") or _s.META_SYSTEM_USER_TOKEN
    body = {"calling": {
        "status": "ENABLED",
        "call_icon_visibility": "DEFAULT",
        "callback_permission_status": "ENABLED",
        "sip": {"status": "DISABLED"},
    }}
    try:
        await _graph_post(f"{wc['phone_number_id']}/settings", token, body)
    except httpx.HTTPStatusError as e:
        raise HTTPException(400, _friendly_calling_error(e.response.text))
    await _s.db.whatsapp_connections.update_one(
        {"vendor_id": user["vendor_id"]}, {"$set": {"calling_enabled": True}})
    display = await _display_number(wc)
    return {"calling_enabled": True, "outbound_supported": _outbound_supported(display)}


# --------------------------------------------------------------------------- #
# Inbound / status webhook handling (called from server.whatsapp_webhook)
# --------------------------------------------------------------------------- #
async def _find_or_make_conv(vendor_id: str, wa_id: str, name: str) -> dict:
    conv = await _s.db.conversations.find_one(
        {"vendor_id": vendor_id, "channel": "whatsapp", "customer_contact": wa_id}, {"_id": 0})
    if conv:
        return conv
    return await _s._ensure_conversation(vendor_id, None, "whatsapp", name or wa_id, wa_id)


def _fmt_dur(secs) -> str:
    try:
        s = int(secs)
    except (TypeError, ValueError):
        return ""
    return f"{s // 60}m {s % 60}s" if s >= 60 else f"{s}s"


async def _summarize_wa_call(vendor_id: str, conv_id: str):
    """Generate a short AI summary of a just-ended WhatsApp call and post it
    into the same thread (best-effort — same style as Twilio call summaries)."""
    msgs = await _s.db.messages.find(
        {"conversation_id": conv_id, "role": {"$in": ["user", "bot"]}},
        {"_id": 0, "role": 1, "content": 1}).sort("created_at", 1).to_list(60)
    turns = [m for m in msgs if not (m.get("content") or "").startswith("📞")]
    if len(turns) < 2:
        return
    transcript = "\n".join(f"{'Caller' if m['role'] == 'user' else 'AI'}: {m['content']}" for m in turns[-40:])
    system = ("Summarize this WhatsApp voice call between an AI receptionist and a caller in ONE short "
              "sentence (<=180 chars), focusing on what the caller wanted and any outcome/booking. "
              "Return only the sentence, no quotes.")
    try:
        chat = _s.LlmChat(api_key=_s.EMERGENT_LLM_KEY, session_id=f"wacallsum-{conv_id}",
                          system_message=system).with_model("anthropic", "claude-sonnet-4-5-20250929")
        summary = (await asyncio.wait_for(chat.send_message(_s.UserMessage(text=transcript)), timeout=25) or "").strip()
    except Exception as e:
        _s.logger.warning("[wa-call] summary llm failed: %s", e)
        return
    if summary:
        await _s._push_message(conv_id, vendor_id, "agent", f"📝 Call summary: {summary}",
                               extra={"call_kind": "whatsapp_summary"})


async def handle_whatsapp_calls(value: dict, wc: dict):
    """Process the `calls` field from a WhatsApp webhook change."""
    vendor_id = wc["vendor_id"]
    contacts = value.get("contacts", []) or []
    cname = ""
    if contacts and contacts[0].get("profile"):
        cname = contacts[0]["profile"].get("name", "")

    for call in value.get("calls", []) or []:
        event = call.get("event")
        direction = call.get("direction", "")
        wa_id = call.get("from") if direction != "BUSINESS_INITIATED" else call.get("to")
        conv = await _find_or_make_conv(vendor_id, wa_id or "", cname)
        call_id = call.get("id")

        if event == "connect":
            if direction == "BUSINESS_INITIATED":
                # Meta's SDP answer for our outbound call → relay to the browser.
                await _broadcast(vendor_id, {"type": "wa_call_answer", "call_id": call_id,
                                             "session": call.get("session")})
            else:
                # Inbound call: log it, then let the AI ANSWER it (like Twilio calls).
                await _s._push_message(conv["id"], vendor_id, "user",
                                       "📞 Incoming WhatsApp call", external_id=call_id,
                                       extra={"call_kind": "whatsapp_inbound", "call_status": "ringing"})
                await _s.db.conversations.update_one({"id": conv["id"]}, {"$set": {"unread": True}})
                try:
                    from whatsapp_ai_answer import start_ai_answer
                    await start_ai_answer(call, wc, conv["id"])
                except Exception as e:
                    _s.logger.warning("[wa-call] AI answer failed to start: %s", e)
            await _s.db.wa_calls.update_one({"id": call_id},
                {"$set": {"id": call_id, "vendor_id": vendor_id, "conversation_id": conv["id"],
                          "wa_id": wa_id, "direction": direction, "status": "connect",
                          "updated_at": _s.now_iso()}}, upsert=True)

        elif event == "terminate":
            status = call.get("status", "")
            dur = call.get("duration")
            human = _fmt_dur(dur)
            out = direction == "BUSINESS_INITIATED"
            if status == "COMPLETED" and dur:
                label = (f"📞 {'Outgoing' if out else 'Incoming'} WhatsApp call — {human}")
            elif not dur:
                label = (f"📞 {'Outgoing' if out else 'Incoming'} WhatsApp call — "
                         f"{'no answer' if not out else 'not answered'}")
            else:
                label = f"📞 WhatsApp call — {status.lower()}"
            await _s._push_message(conv["id"], vendor_id, "agent" if out else "user", label,
                                   external_id=f"{call_id}:end",
                                   extra={"call_kind": "whatsapp_" + ("outbound" if out else "inbound")})
            await _s.db.call_records.insert_one({
                "id": _s.new_id(), "vendor_id": vendor_id, "call_sid": call_id,
                "to_number": wa_id, "from_number": "",
                "direction": "whatsapp_outbound" if out else "whatsapp_inbound",
                "conversation_id": conv["id"], "status": status or "ended",
                "minutes": round((int(dur) / 60.0), 2) if dur else 0.0,
                "started_at": _s.now_iso(), "ended_at": _s.now_iso(),
            })
            await _broadcast(vendor_id, {"type": "wa_call_terminate", "call_id": call_id, "status": status})
            try:
                from whatsapp_ai_answer import stop_ai_answer
                await stop_ai_answer(call_id)
            except Exception:
                pass
            # Post-call AI summary into the same thread (best-effort).
            if not out:
                try:
                    await _summarize_wa_call(vendor_id, conv["id"])
                except Exception as e:
                    _s.logger.warning("[wa-call] summary failed: %s", e)
            await _s.db.wa_calls.update_one({"id": call_id},
                {"$set": {"status": "terminate", "duration": dur, "updated_at": _s.now_iso()}}, upsert=True)

    # Outbound call status events (RINGING/ACCEPTED/REJECTED)
    for st in value.get("statuses", []) or []:
        if st.get("type") != "call":
            continue
        await _broadcast(vendor_id, {"type": "wa_call_status", "call_id": st.get("id"),
                                     "status": st.get("status")})


# --------------------------------------------------------------------------- #
# Signaling WebSocket (browser <-> Graph API)
# --------------------------------------------------------------------------- #
@router.websocket("/ws/wa-call")
async def wa_call_ws(ws: WebSocket):
    token = ws.query_params.get("token", "")
    try:
        payload = jwt.decode(token, _s.JWT_SECRET, algorithms=[_s.JWT_ALG])
        user = await _s.db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
        vendor_id = user["vendor_id"]
    except Exception:
        await ws.close(code=4401)
        return

    await ws.accept()
    _rooms.setdefault(vendor_id, set()).add(ws)
    wc = await _s.db.whatsapp_connections.find_one({"vendor_id": vendor_id}, {"_id": 0})
    phone_id = (wc or {}).get("phone_number_id")
    tok = (wc or {}).get("access_token") or _s.META_SYSTEM_USER_TOKEN

    try:
        while True:
            msg = await ws.receive_json()
            action = msg.get("action")
            if not phone_id:
                await ws.send_json({"type": "error", "detail": "WhatsApp not connected"})
                continue
            body = {"messaging_product": "whatsapp", "action": action}
            if action == "connect":
                # Outbound: check permission first
                to = msg.get("to")
                try:
                    perm = await _graph_get(f"{phone_id}/call_permissions", tok, {"user_wa_id": _digits(to)})
                    can = any(a.get("action_name") == "start_call" and a.get("can_perform_action")
                              for a in perm.get("actions", []))
                except Exception:
                    can = False
                if not can:
                    # Request permission via WhatsApp, tell the browser to abort.
                    try:
                        await _graph_post(f"{phone_id}/messages", tok, {
                            "messaging_product": "whatsapp", "recipient_type": "individual",
                            "to": _digits(to), "type": "interactive",
                            "interactive": {"type": "call_permission_request",
                                            "body": {"text": "May we call you on WhatsApp?"},
                                            "action": {"name": "call_permission_request"}},
                        })
                    except Exception as e:
                        _s.logger.warning("[wa-call] permission request failed: %s", e)
                    await ws.send_json({"type": "call_permission_needed"})
                    continue
                body.update({"to": _digits(to),
                             "session": {"sdp_type": "offer", "sdp": msg.get("sdp")}})
            elif action in ("pre_accept", "accept"):
                body.update({"call_id": msg.get("call_id"),
                             "session": {"sdp_type": "answer", "sdp": msg.get("sdp")}})
            else:  # reject / terminate
                body["call_id"] = msg.get("call_id")
            try:
                result = await _graph_post(f"{phone_id}/calls", tok, body)
                await ws.send_json({"type": "graph_result", "action": action, "result": result})
            except httpx.HTTPStatusError as e:
                await ws.send_json({"type": "error", "action": action, "detail": e.response.text[:300]})
    except WebSocketDisconnect:
        pass
    finally:
        _rooms.get(vendor_id, set()).discard(ws)
