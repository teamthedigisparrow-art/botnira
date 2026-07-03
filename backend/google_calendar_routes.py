"""BotNira — Google Calendar + Google Meet integration (Phase 2).

Per-vendor OAuth: ONE BotNira Google Cloud OAuth client, many vendor
authorizations. Each vendor connects their own Google account; we store their
access + refresh tokens and refresh automatically.

Two-way sync (polling baseline):
  • Push: when a Botnira appointment is booked / rescheduled / cancelled we
    create / update / delete the matching event on the vendor's Google Calendar
    (optionally with a Google Meet link).
  • Pull: a background poller imports the vendor's external Google events as
    blocking entries (source='google_calendar') so they show up in Botnira and
    prevent double-booking.

Credentials come from env GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET. When absent
the endpoints degrade gracefully (report not-configured) instead of crashing.
"""
import os
import asyncio
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import jwt
import requests as _rq
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse

import server as _s
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build

CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
]

router = APIRouter()        # mounted at /scheduling/google (vendor-authenticated)
oauth_router = APIRouter()  # mounted at /oauth/calendar (public callback)


def configured() -> bool:
    return bool(CLIENT_ID and CLIENT_SECRET)


def _redirect_uri(origin: str) -> str:
    return f"{origin.rstrip('/')}/api/oauth/calendar/callback"


def _state_token(vendor_id: str, origin: str) -> str:
    return jwt.encode(
        {"vendor_id": vendor_id, "origin": origin,
         "exp": datetime.now(timezone.utc) + timedelta(minutes=15)},
        _s.JWT_SECRET, algorithm="HS256",
    )


def _read_state(token: str) -> dict:
    return jwt.decode(token, _s.JWT_SECRET, algorithms=["HS256"])


# ------------------------------- token / creds -------------------------------
def _parse_expiry(iso: str):
    if not iso:
        return None
    try:
        d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return d.astimezone(timezone.utc).replace(tzinfo=None)  # google expects naive UTC
    except Exception:
        return None


async def _get_creds(vendor_id: str):
    if not configured():
        return None
    conn = await _s.db.gcal_connections.find_one({"vendor_id": vendor_id})
    if not conn or not conn.get("refresh_token"):
        return None
    creds = Credentials(
        token=conn.get("access_token"),
        refresh_token=conn["refresh_token"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=CLIENT_ID, client_secret=CLIENT_SECRET, scopes=SCOPES,
    )
    creds.expiry = _parse_expiry(conn.get("token_expiry"))

    def _refresh():
        if not creds.valid:
            creds.refresh(GoogleRequest())
        return creds
    try:
        await asyncio.to_thread(_refresh)
    except Exception as e:
        _s.logger.warning("gcal refresh failed for %s: %s", vendor_id, e)
        await _s.db.gcal_connections.update_one(
            {"vendor_id": vendor_id}, {"$set": {"status": "error", "error": str(e)[:200]}}
        )
        return None
    await _s.db.gcal_connections.update_one(
        {"vendor_id": vendor_id},
        {"$set": {
            "access_token": creds.token,
            "token_expiry": (creds.expiry.replace(tzinfo=timezone.utc).isoformat() if creds.expiry else None),
            "status": "connected", "error": None,
        }},
    )
    return creds


def _service(creds):
    return build("calendar", "v3", credentials=creds, cache_discovery=False)


# ------------------------------- push / update / delete ----------------------
def _wants_meet(appt: dict) -> bool:
    loc = (appt.get("location") or "").lower()
    return any(k in loc for k in ("meet", "google meet", "online", "video", "zoom-less"))


async def push_appointment(vendor_id: str, appt: dict):
    creds = await _get_creds(vendor_id)
    if not creds:
        return
    create_meet = _wants_meet(appt)

    def _do():
        service = _service(creds)
        body = {
            "summary": f"{appt.get('appointment_type_name') or 'Appointment'} — {appt.get('customer_name', '')}".strip(" —"),
            "description": ((appt.get("notes") or "") + f"\n\nBooked via BotNira ({appt.get('source', 'botnira')}).").strip(),
            "start": {"dateTime": appt["start_at"], "timeZone": "UTC"},
            "end": {"dateTime": appt.get("end_at") or appt["start_at"], "timeZone": "UTC"},
        }
        if appt.get("location"):
            body["location"] = appt["location"]
        contact = appt.get("customer_contact") or ""
        if "@" in contact:
            body["attendees"] = [{"email": contact}]
        kwargs = {"calendarId": "primary", "body": body, "sendUpdates": "all"}
        if create_meet:
            body["conferenceData"] = {"createRequest": {
                "requestId": appt["id"],
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }}
            kwargs["conferenceDataVersion"] = 1
        return service.events().insert(**kwargs).execute()
    try:
        ev = await asyncio.to_thread(_do)
        upd = {"google_event_id": ev.get("id")}
        if ev.get("hangoutLink"):
            upd["meet_link"] = ev["hangoutLink"]
        await _s.db.appointments.update_one({"id": appt["id"]}, {"$set": upd})
    except Exception as e:
        _s.logger.warning("gcal push failed: %s", e)


async def update_appointment(vendor_id: str, appt: dict):
    eid = appt.get("google_event_id")
    if not eid:
        return await push_appointment(vendor_id, appt)
    creds = await _get_creds(vendor_id)
    if not creds:
        return

    def _do():
        service = _service(creds)
        ev = service.events().get(calendarId="primary", eventId=eid).execute()
        ev["start"] = {"dateTime": appt["start_at"], "timeZone": "UTC"}
        ev["end"] = {"dateTime": appt.get("end_at") or appt["start_at"], "timeZone": "UTC"}
        return service.events().update(calendarId="primary", eventId=eid, body=ev, sendUpdates="all").execute()
    try:
        await asyncio.to_thread(_do)
    except Exception as e:
        _s.logger.warning("gcal update failed: %s", e)


async def delete_appointment(vendor_id: str, appt: dict):
    eid = appt.get("google_event_id")
    if not eid:
        return
    creds = await _get_creds(vendor_id)
    if not creds:
        return

    def _do():
        _service(creds).events().delete(calendarId="primary", eventId=eid, sendUpdates="all").execute()
    try:
        await asyncio.to_thread(_do)
    except Exception as e:
        _s.logger.warning("gcal delete failed: %s", e)


# ------------------------------- pull (import external events) ---------------
async def pull_vendor(vendor_id: str):
    creds = await _get_creds(vendor_id)
    if not creds:
        return

    def _list():
        service = _service(creds)
        tmin = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        tmax = (datetime.now(timezone.utc) + timedelta(days=60)).isoformat()
        return service.events().list(
            calendarId="primary", timeMin=tmin, timeMax=tmax,
            singleEvents=True, maxResults=250, orderBy="startTime",
        ).execute()
    try:
        res = await asyncio.to_thread(_list)
    except Exception as e:
        _s.logger.warning("gcal pull failed for %s: %s", vendor_id, e)
        await _s.db.gcal_connections.update_one(
            {"vendor_id": vendor_id}, {"$set": {"status": "error", "error": str(e)[:200]}})
        return

    ours = await _s.db.appointments.find(
        {"vendor_id": vendor_id, "google_event_id": {"$ne": None}}, {"google_event_id": 1}
    ).to_list(3000)
    ours_ids = {a["google_event_id"] for a in ours if a.get("source") != "google_calendar"}

    for ev in res.get("items", []):
        eid = ev.get("id")
        if ev.get("status") == "cancelled":
            await _s.db.appointments.delete_one(
                {"vendor_id": vendor_id, "source": "google_calendar", "google_event_id": eid})
            continue
        if eid in ours_ids:
            continue  # this event is one WE pushed — already represented
        start = (ev.get("start") or {}).get("dateTime")
        end = (ev.get("end") or {}).get("dateTime")
        if not start:
            continue  # skip all-day / date-only events
        try:
            s = datetime.fromisoformat(start.replace("Z", "+00:00")).astimezone(timezone.utc)
            e = datetime.fromisoformat((end or start).replace("Z", "+00:00")).astimezone(timezone.utc)
            dur = max(5, int((e - s).total_seconds() // 60))
        except Exception:
            continue
        await _s.db.appointments.update_one(
            {"vendor_id": vendor_id, "source": "google_calendar", "google_event_id": eid},
            {"$set": {
                "customer_name": ev.get("summary") or "Google Calendar event",
                "customer_contact": "",
                "scheduled_at": s.isoformat(), "start_at": s.isoformat(),
                "end_at": e.isoformat(), "duration_minutes": dur,
                "status": "scheduled", "attended": False, "updated_at": _s.now_iso(),
            }, "$setOnInsert": {"id": _s.new_id(), "conversation_id": None, "created_at": _s.now_iso()}},
            upsert=True,
        )
    await _s.db.gcal_connections.update_one(
        {"vendor_id": vendor_id}, {"$set": {"last_sync_at": _s.now_iso(), "status": "connected", "error": None}})


async def poller_loop():
    await asyncio.sleep(20)
    while True:
        try:
            if configured():
                conns = await _s.db.gcal_connections.find(
                    {"refresh_token": {"$ne": None}}, {"vendor_id": 1}).to_list(1000)
                for c in conns:
                    await pull_vendor(c["vendor_id"])
        except Exception as e:
            _s.logger.warning("gcal poller error: %s", e)
        await asyncio.sleep(90)


# ------------------------------- vendor endpoints ----------------------------
@router.get("/status")
async def status(user: dict = Depends(_s.require_vendor)):
    conn = await _s.db.gcal_connections.find_one({"vendor_id": user["vendor_id"]}, {"_id": 0, "access_token": 0})
    return {
        "configured": configured(),
        "connected": bool(conn and conn.get("refresh_token")),
        "email": (conn or {}).get("email"),
        "status": (conn or {}).get("status", "not_connected"),
        "last_sync_at": (conn or {}).get("last_sync_at"),
        "error": (conn or {}).get("error"),
    }


@router.get("/connect")
async def connect(origin: str = Query(...), user: dict = Depends(_s.require_vendor)):
    if not configured():
        raise HTTPException(status_code=400, detail="Google Calendar isn't configured on the server yet.")
    params = {
        "client_id": CLIENT_ID,
        "redirect_uri": _redirect_uri(origin),
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": _state_token(user["vendor_id"], origin),
    }
    return {"authorization_url": "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)}


@router.post("/disconnect")
async def disconnect(user: dict = Depends(_s.require_vendor)):
    conn = await _s.db.gcal_connections.find_one({"vendor_id": user["vendor_id"]})
    if conn and conn.get("access_token"):
        try:
            await asyncio.to_thread(lambda: _rq.post(
                "https://oauth2.googleapis.com/revoke",
                params={"token": conn["access_token"]},
                headers={"content-type": "application/x-www-form-urlencoded"}, timeout=10))
        except Exception:
            pass
    await _s.db.gcal_connections.delete_one({"vendor_id": user["vendor_id"]})
    # drop imported blocking entries
    await _s.db.appointments.delete_many({"vendor_id": user["vendor_id"], "source": "google_calendar"})
    return {"ok": True}


@router.post("/sync-now")
async def sync_now(user: dict = Depends(_s.require_vendor)):
    if not configured():
        raise HTTPException(status_code=400, detail="Not configured")
    await pull_vendor(user["vendor_id"])
    return {"ok": True}


# ------------------------------- public callback -----------------------------
@oauth_router.get("/callback")
async def callback(code: str = None, state: str = None, error: str = None):
    try:
        st = _read_state(state or "")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or expired state")
    origin = st["origin"]
    vendor_id = st["vendor_id"]
    dest = f"{origin.rstrip('/')}/app/appointments"
    if error or not code:
        return RedirectResponse(f"{dest}?gcal=error")

    redirect_uri = _redirect_uri(origin)

    def _exchange():
        return _rq.post("https://oauth2.googleapis.com/token", data={
            "code": code, "client_id": CLIENT_ID, "client_secret": CLIENT_SECRET,
            "redirect_uri": redirect_uri, "grant_type": "authorization_code",
        }, timeout=20).json()

    def _userinfo(access_token):
        return _rq.get("https://www.googleapis.com/oauth2/v2/userinfo",
                       headers={"Authorization": f"Bearer {access_token}"}, timeout=20).json()

    tok = await asyncio.to_thread(_exchange)
    if "access_token" not in tok:
        _s.logger.warning("gcal token exchange failed: %s", tok)
        return RedirectResponse(f"{dest}?gcal=error")
    prof = await asyncio.to_thread(_userinfo, tok["access_token"])

    existing = await _s.db.gcal_connections.find_one({"vendor_id": vendor_id})
    refresh_token = tok.get("refresh_token") or (existing or {}).get("refresh_token")
    expiry = datetime.now(timezone.utc) + timedelta(seconds=tok.get("expires_in", 3600))
    await _s.db.gcal_connections.update_one(
        {"vendor_id": vendor_id},
        {"$set": {
            "vendor_id": vendor_id,
            "email": prof.get("email"),
            "access_token": tok["access_token"],
            "refresh_token": refresh_token,
            "token_expiry": expiry.isoformat(),
            "scopes": SCOPES,
            "status": "connected",
            "error": None,
            "connected_at": _s.now_iso(),
        }},
        upsert=True,
    )
    # kick off an initial pull in the background
    try:
        asyncio.create_task(pull_vendor(vendor_id))
    except Exception:
        pass
    return RedirectResponse(f"{dest}?gcal=connected")
