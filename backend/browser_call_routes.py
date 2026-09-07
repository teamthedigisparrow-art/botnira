"""BotNira — In-browser human callback (Twilio Voice JS SDK / WebRTC).

Lets a human agent click "Call back" inside the Inbox and talk to the customer
straight from the browser mic/speakers (WhatsApp-Web style). Reuses the vendor's
existing Twilio SUBACCOUNT + purchased number as the caller ID. This is a plain
person-to-person <Dial> — it does NOT go through the AI media-stream bridge.

Flow
----
1. Browser → POST /api/voice/browser/token  (auth: vendor JWT)
   • gate: voice channel allowed + minutes > 0 + a number is provisioned
   • idempotently provisions (per subaccount) an API Key + a TwiML App
   • mints a short-lived Voice AccessToken (VoiceGrant → the TwiML App)
2. Browser SDK device.connect({params:{To, ConversationId}}) → Twilio calls the
   TwiML App Voice URL → POST /api/voice/browser/twiml
   • returns <Dial callerId=<vendor number>><Number>To</Number></Dial>
3. On dial completion Twilio hits the <Dial action> → POST /api/voice/browser/status
   • deducts voice minutes (unless exempt) and logs the outgoing call into the
     SAME conversation thread + a call_records row.
"""
from urllib.parse import quote
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import Response
from pydantic import BaseModel

import server as _s

from twilio.jwt.access_token import AccessToken
from twilio.jwt.access_token.grants import VoiceGrant
from twilio.twiml.voice_response import VoiceResponse
from twilio.base.exceptions import TwilioRestException

router = APIRouter()

TOKEN_TTL = 3600
_E164 = _s.re.compile(r"^\+[1-9]\d{7,15}$")
IDENTITY_PREFIX = "agent_"


async def _ensure_browser_calling(vendor_id: str, base: str) -> dict:
    """Idempotently create the subaccount-scoped API Key + TwiML App used to
    mint browser Voice tokens, and keep the TwiML App's Voice URL pointed at the
    base URL the agent's browser is actually on (so preview + prod both work).

    Returns {account_sid, api_key_sid, api_key_secret, twiml_app_sid, from_number}.
    """
    conn = await _s.db.voice_connections.find_one({"vendor_id": vendor_id}, {"_id": 0})
    if not conn or not conn.get("phone_number"):
        raise HTTPException(400, "No phone number provisioned. Go to Channels → Voice and buy a number first.")
    sub = await _s.db.voice_subaccounts.find_one({"vendor_id": vendor_id}, {"_id": 0})
    if not sub or not sub.get("account_sid") or not sub.get("auth_token"):
        raise HTTPException(400, "Voice is not fully set up for this account yet.")

    sub_sid = sub["account_sid"]
    cli = _s._twilio_subaccount_client(sub_sid, sub["auth_token"])
    voice_url = f"{base}/api/voice/browser/twiml?base={quote(base, safe='')}"

    key_sid = sub.get("browser_api_key_sid")
    key_secret = sub.get("browser_api_key_secret")
    app_sid = sub.get("browser_twiml_app_sid")

    updates = {}
    # API Key (secret is only returned once → must persist it)
    if not key_sid or not key_secret:
        key = cli.new_keys.create(friendly_name="BotNira browser calling")
        key_sid, key_secret = key.sid, key.secret
        updates["browser_api_key_sid"] = key_sid
        updates["browser_api_key_secret"] = key_secret

    # TwiML App — create once, then keep its Voice URL current every token issue.
    if not app_sid:
        appc = cli.applications.create(
            friendly_name="BotNira browser calling",
            voice_url=voice_url, voice_method="POST",
        )
        app_sid = appc.sid
        updates["browser_twiml_app_sid"] = app_sid
    else:
        try:
            cli.applications(app_sid).update(voice_url=voice_url, voice_method="POST")
        except TwilioRestException as e:
            _s.logger.warning("[browser-call] twiml app update failed: %s", e)

    if updates:
        await _s.db.voice_subaccounts.update_one({"vendor_id": vendor_id}, {"$set": updates})

    return {
        "account_sid": sub_sid,
        "api_key_sid": key_sid,
        "api_key_secret": key_secret,
        "twiml_app_sid": app_sid,
        "from_number": conn["phone_number"],
    }


@router.post("/token")
async def browser_token(request: _s._StripeRequest, user: dict = Depends(_s.require_vendor)):
    """Mint a short-lived Voice access token for in-browser outbound calling."""
    vendor_id = user["vendor_id"]
    ok, reason = await _s._vendor_can_use_channel(vendor_id, "voice")
    if not ok:
        raise HTTPException(402, reason)

    base = _s._public_base_url_from_request(request) or (_s.PUBLIC_BASE_URL or "").rstrip("/")
    if not base:
        raise HTTPException(500, "Public URL not resolvable.")

    creds = await _ensure_browser_calling(vendor_id, base)
    identity = f"{IDENTITY_PREFIX}{vendor_id}"
    token = AccessToken(
        creds["account_sid"], creds["api_key_sid"], creds["api_key_secret"],
        identity=identity, ttl=TOKEN_TTL,
    )
    token.add_grant(VoiceGrant(outgoing_application_sid=creds["twiml_app_sid"], incoming_allow=False))
    jwt_str = token.to_jwt()
    if isinstance(jwt_str, bytes):
        jwt_str = jwt_str.decode("utf-8")
    return {
        "token": jwt_str,
        "identity": identity,
        "from_number": creds["from_number"],
        "expires_in": TOKEN_TTL,
    }


@router.post("/twiml")
async def browser_twiml(request: _s._StripeRequest):
    """TwiML App Voice URL. Twilio calls this when the browser places a call.
    Returns a <Dial> that bridges the browser leg to the customer's PSTN number
    using the vendor's own number as caller ID."""
    form = await request.form()
    frm = (form.get("From") or "")            # "client:agent_<vendor_id>"
    to = (form.get("To") or "").strip()
    conv_id = (form.get("ConversationId") or "").strip()
    base = (request.query_params.get("base") or _s.PUBLIC_BASE_URL or "").rstrip("/")

    vr = VoiceResponse()
    # Derive vendor from the authenticated caller identity (never trust the browser
    # for caller ID). From looks like "client:agent_<vendor_id>".
    vendor_id = ""
    if frm.startswith("client:"):
        ident = frm.split("client:", 1)[1]
        if ident.startswith(IDENTITY_PREFIX):
            vendor_id = ident[len(IDENTITY_PREFIX):]

    if not vendor_id or not _E164.match(to):
        vr.say("Sorry, this call could not be completed.")
        vr.hangup()
        return Response(content=str(vr), media_type="application/xml")

    conn = await _s.db.voice_connections.find_one({"vendor_id": vendor_id}, {"_id": 0})
    caller_id = (conn or {}).get("phone_number")
    if not caller_id:
        vr.say("Sorry, no outbound number is configured.")
        vr.hangup()
        return Response(content=str(vr), media_type="application/xml")

    action = (
        f"{base}/api/voice/browser/status"
        f"?vendor_id={quote(vendor_id, safe='')}"
        f"&conversation_id={quote(conv_id, safe='')}"
        f"&to={quote(to, safe='')}"
    )
    dial = vr.dial(caller_id=caller_id, answer_on_bridge=True, timeout=30,
                   action=action, method="POST")
    dial.number(to)
    return Response(content=str(vr), media_type="application/xml")


@router.post("/status")
async def browser_status(request: _s._StripeRequest):
    """<Dial action> callback. Meters minutes and logs the call into the thread."""
    form = await request.form()
    qp = request.query_params
    vendor_id = qp.get("vendor_id") or ""
    conv_id = qp.get("conversation_id") or ""
    to = qp.get("to") or ""
    dial_status = (form.get("DialCallStatus") or "").lower()   # completed|busy|no-answer|failed|canceled
    dial_sid = form.get("DialCallSid") or ""
    duration = form.get("DialCallDuration")                    # seconds (child leg)

    mins = 0.0
    if duration:
        try:
            mins = round(float(duration) / 60.0, 2)
        except ValueError:
            mins = 0.0

    if vendor_id:
        # Deduct minutes (unless exempt)
        if mins > 0:
            v = await _s.db.vendors.find_one({"id": vendor_id}, {"_id": 0, "is_exempt": 1})
            if v and not v.get("is_exempt"):
                await _s.db.vendors.update_one(
                    {"id": vendor_id},
                    {"$inc": {"minutes_balance": -mins, "minutes_used_total": mins}},
                )
        # Record the outbound human call for history
        await _s.db.call_records.insert_one({
            "id": _s.new_id(),
            "vendor_id": vendor_id,
            "call_sid": dial_sid,
            "from_number": "",  # caller id is the vendor number; not needed for history
            "to_number": to,
            "direction": "outbound_human",
            "conversation_id": conv_id or None,
            "status": dial_status or "completed",
            "minutes": mins,
            "started_at": _s.now_iso(),
            "ended_at": _s.now_iso(),
        })
        # Log into the SAME conversation thread (like inbound calls appear).
        if conv_id:
            label = {
                "completed": f"📞 Outgoing call to {to} — connected, {mins:g} min",
                "no-answer": f"📞 Outgoing call to {to} — no answer",
                "busy": f"📞 Outgoing call to {to} — busy",
                "failed": f"📞 Outgoing call to {to} — failed",
                "canceled": f"📞 Outgoing call to {to} — canceled",
            }.get(dial_status, f"📞 Outgoing call to {to} — {dial_status or 'ended'}")
            try:
                await _s._push_message(conv_id, vendor_id, "agent", label,
                                       extra={"call_kind": "outbound_human"})
            except Exception as e:
                _s.logger.warning("[browser-call] thread log failed: %s", e)

    vr = VoiceResponse()
    vr.hangup()
    return Response(content=str(vr), media_type="application/xml")
