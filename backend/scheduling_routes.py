"""BotNira — Scheduling Hub (Phase 1: native scheduling core + booking page).

Extends the existing Appointments module WITHOUT touching any existing
appointment behaviour. Adds, per vendor:
  • Availability settings (weekly schedule with multiple sessions/day + breaks,
    timezone, default buffers, exceptions/holidays, vacation mode)
  • Appointment Types (name, description, duration, colour, location, ...)
  • Public booking page slot computation (double-booking prevention + buffers)
  • Enhanced appointment ops (status change, internal notes, reschedule, cancel)
    with a full activity/audit log.

Google Calendar / Calendly / Google Meet sync land in later phases.
"""
from datetime import datetime, timedelta, timezone, date, time
from typing import Optional, List, Dict, Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

import server as _s

router = APIRouter()          # vendor-authenticated, mounted at /scheduling
public_router = APIRouter()   # public booking, mounted at /public/booking

WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

DEFAULT_WEEK = {
    "mon": [{"start": "09:00", "end": "17:00"}],
    "tue": [{"start": "09:00", "end": "17:00"}],
    "wed": [{"start": "09:00", "end": "17:00"}],
    "thu": [{"start": "09:00", "end": "17:00"}],
    "fri": [{"start": "09:00", "end": "17:00"}],
    "sat": [],
    "sun": [],
}

APPT_STATUSES = [
    "pending", "scheduled", "confirmed", "completed",
    "cancelled", "rescheduled", "no_show",
]


# ------------------------------- Models --------------------------------------
class Session(BaseModel):
    start: str  # "HH:MM"
    end: str    # "HH:MM"


class Exception_(BaseModel):
    date: str                       # "YYYY-MM-DD"
    type: str = "closed"            # "closed" | "custom"
    label: Optional[str] = ""
    sessions: Optional[List[Session]] = None  # for custom hours


class SettingsReq(BaseModel):
    timezone: Optional[str] = None
    week: Optional[Dict[str, List[Session]]] = None
    buffer_before: Optional[int] = None
    buffer_after: Optional[int] = None
    default_duration: Optional[int] = None
    slot_interval: Optional[int] = None
    booking_enabled: Optional[bool] = None
    min_notice_hours: Optional[int] = None
    exceptions: Optional[List[Exception_]] = None
    vacation: Optional[Dict[str, Any]] = None  # {enabled, start, end}


class AppointmentTypeReq(BaseModel):
    name: str
    description: str = ""
    duration_minutes: int = 30
    color: str = "#002FA7"
    location: str = ""
    instructions: str = ""
    buffer_before: Optional[int] = None
    buffer_after: Optional[int] = None
    is_active: bool = True


class BookReq(BaseModel):
    appointment_type_id: Optional[str] = None
    start_at: str                    # ISO 8601 (UTC or with offset)
    customer_name: str
    customer_contact: str = ""       # email or phone
    customer_timezone: Optional[str] = None
    notes: str = ""


class RescheduleReq(BaseModel):
    start_at: str
    reason: Optional[str] = ""


class StatusReq(BaseModel):
    status: str
    reason: Optional[str] = ""


class NotesReq(BaseModel):
    internal_notes: str


# ------------------------------- Helpers -------------------------------------
def _tz(name: Optional[str]) -> ZoneInfo:
    try:
        return ZoneInfo(name or "UTC")
    except Exception:
        return ZoneInfo("UTC")


def _parse_iso(s: str) -> Optional[datetime]:
    if not s:
        return None
    try:
        # tolerate trailing Z
        s2 = s.replace("Z", "+00:00")
        d = datetime.fromisoformat(s2)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d.astimezone(timezone.utc)
    except Exception:
        return None


async def get_settings(vendor_id: str) -> dict:
    doc = await _s.db.scheduling_settings.find_one({"vendor_id": vendor_id}, {"_id": 0})
    if not doc:
        doc = {
            "vendor_id": vendor_id,
            "timezone": "America/Toronto",
            "week": DEFAULT_WEEK,
            "buffer_before": 0,
            "buffer_after": 0,
            "default_duration": 30,
            "slot_interval": 30,
            "booking_enabled": True,
            "min_notice_hours": 2,
            "exceptions": [],
            "vacation": {"enabled": False, "start": None, "end": None},
            "created_at": _s.now_iso(),
        }
        await _s.db.scheduling_settings.insert_one(dict(doc))
        doc.pop("_id", None)
    return doc


async def log_activity(vendor_id: str, appointment_id: str, action: str, detail: str = "", actor: str = "system"):
    try:
        await _s.db.appointment_activity.insert_one({
            "id": _s.new_id(),
            "vendor_id": vendor_id,
            "appointment_id": appointment_id,
            "action": action,
            "detail": detail,
            "actor": actor,
            "created_at": _s.now_iso(),
        })
    except Exception as e:
        _s.logger.warning("activity log failed: %s", e)


def _appt_window(appt: dict) -> Optional[tuple]:
    """Return (start_utc, end_utc) for an existing appointment, tolerant of
    legacy docs that only have `scheduled_at` and no duration."""
    start = _parse_iso(appt.get("start_at") or appt.get("scheduled_at") or "")
    if not start:
        return None
    dur = appt.get("duration_minutes") or 30
    end = _parse_iso(appt.get("end_at") or "") or (start + timedelta(minutes=dur))
    return (start, end)


BLOCKING_STATUSES = {"pending", "scheduled", "confirmed"}


async def _busy_windows(vendor_id: str, exclude_id: Optional[str] = None) -> List[tuple]:
    appts = await _s.db.appointments.find(
        {"vendor_id": vendor_id}, {"_id": 0}
    ).to_list(2000)
    out = []
    for a in appts:
        if exclude_id and a.get("id") == exclude_id:
            continue
        st = (a.get("status") or "scheduled").lower()
        if st not in BLOCKING_STATUSES and st != "attended":
            # cancelled / completed / no_show / rescheduled do not block
            if st in ("cancelled", "no_show", "rescheduled", "completed", "cancelled_by_customer"):
                continue
        w = _appt_window(a)
        if w:
            out.append(w)
    return out


def _overlaps(a_start, a_end, b_start, b_end) -> bool:
    return a_start < b_end and b_start < a_end


async def compute_slots(vendor_id: str, settings: dict, duration: int,
                        buffer_before: int, buffer_after: int, day_str: str) -> List[str]:
    tz = _tz(settings.get("timezone"))
    try:
        day = date.fromisoformat(day_str)
    except Exception:
        return []

    # Vacation mode
    vac = settings.get("vacation") or {}
    if vac.get("enabled") and vac.get("start") and vac.get("end"):
        try:
            if date.fromisoformat(vac["start"]) <= day <= date.fromisoformat(vac["end"]):
                return []
        except Exception:
            pass

    # Exceptions (holiday / custom hours)
    sessions = None
    for exc in settings.get("exceptions", []) or []:
        if exc.get("date") == day_str:
            if exc.get("type") == "closed":
                return []
            sessions = exc.get("sessions") or []
            break
    if sessions is None:
        wk = settings.get("week") or DEFAULT_WEEK
        sessions = wk.get(WEEKDAYS[day.weekday()], [])
    if not sessions:
        return []

    interval = max(5, int(settings.get("slot_interval") or duration or 30))
    min_notice = int(settings.get("min_notice_hours") or 0)
    now_utc = datetime.now(timezone.utc)
    earliest = now_utc + timedelta(hours=min_notice)

    busy = await _busy_windows(vendor_id)
    # Expand each existing appointment by the buffers so new bookings keep a
    # gap before/after neighbouring appointments (prevents back-to-back).
    padded_busy = [
        (b0 - timedelta(minutes=buffer_before), b1 + timedelta(minutes=buffer_after))
        for (b0, b1) in busy
    ]

    slots: List[str] = []
    for sess in sessions:
        try:
            sh, sm = [int(x) for x in sess["start"].split(":")]
            eh, em = [int(x) for x in sess["end"].split(":")]
        except Exception:
            continue
        sess_start = datetime.combine(day, time(sh, sm), tzinfo=tz)
        sess_end = datetime.combine(day, time(eh, em), tzinfo=tz)
        cur = sess_start
        while cur + timedelta(minutes=duration) <= sess_end + timedelta(seconds=1):
            slot_start = cur.astimezone(timezone.utc)
            slot_end = slot_start + timedelta(minutes=duration)
            if slot_start >= earliest:
                conflict = any(_overlaps(slot_start, slot_end, b0, b1) for (b0, b1) in padded_busy)
                if not conflict:
                    slots.append(slot_start.isoformat())
            cur += timedelta(minutes=interval)
    return slots


# ------------------------------- Vendor: settings ----------------------------
@router.get("/settings")
async def read_settings(user: dict = Depends(_s.require_vendor)):
    return await get_settings(user["vendor_id"])


@router.put("/settings")
async def update_settings(req: SettingsReq, user: dict = Depends(_s.require_vendor)):
    await get_settings(user["vendor_id"])  # ensure exists
    updates: Dict[str, Any] = {}
    payload = req.model_dump(exclude_none=True)
    for k in ("timezone", "buffer_before", "buffer_after", "default_duration",
              "slot_interval", "booking_enabled", "min_notice_hours"):
        if k in payload:
            updates[k] = payload[k]
    if req.week is not None:
        updates["week"] = {kk: [s.model_dump() for s in vv] for kk, vv in req.week.items()}
    if req.exceptions is not None:
        updates["exceptions"] = [e.model_dump() for e in req.exceptions]
    if req.vacation is not None:
        updates["vacation"] = req.vacation
    if updates:
        updates["updated_at"] = _s.now_iso()
        await _s.db.scheduling_settings.update_one(
            {"vendor_id": user["vendor_id"]}, {"$set": updates}
        )
    return await get_settings(user["vendor_id"])


# ------------------------------- Vendor: appointment types -------------------
@router.get("/types")
async def list_types(user: dict = Depends(_s.require_vendor)):
    items = await _s.db.appointment_types.find(
        {"vendor_id": user["vendor_id"]}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    return {"items": items}


@router.post("/types")
async def create_type(req: AppointmentTypeReq, user: dict = Depends(_s.require_vendor)):
    doc = {
        "id": _s.new_id(),
        "vendor_id": user["vendor_id"],
        **req.model_dump(),
        "created_at": _s.now_iso(),
    }
    await _s.db.appointment_types.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@router.put("/types/{type_id}")
async def update_type(type_id: str, req: AppointmentTypeReq, user: dict = Depends(_s.require_vendor)):
    existing = await _s.db.appointment_types.find_one(
        {"id": type_id, "vendor_id": user["vendor_id"]}, {"_id": 0}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Appointment type not found")
    await _s.db.appointment_types.update_one(
        {"id": type_id, "vendor_id": user["vendor_id"]},
        {"$set": {**req.model_dump(), "updated_at": _s.now_iso()}},
    )
    return await _s.db.appointment_types.find_one(
        {"id": type_id, "vendor_id": user["vendor_id"]}, {"_id": 0}
    )


@router.delete("/types/{type_id}")
async def delete_type(type_id: str, user: dict = Depends(_s.require_vendor)):
    res = await _s.db.appointment_types.delete_one(
        {"id": type_id, "vendor_id": user["vendor_id"]}
    )
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Appointment type not found")
    return {"ok": True}


# ------------------------------- Vendor: enhanced appointment ops ------------
@router.get("/appointments/{appt_id}/activity")
async def appointment_activity(appt_id: str, user: dict = Depends(_s.require_vendor)):
    appt = await _s.db.appointments.find_one(
        {"id": appt_id, "vendor_id": user["vendor_id"]}, {"_id": 0}
    )
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    items = await _s.db.appointment_activity.find(
        {"appointment_id": appt_id, "vendor_id": user["vendor_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return {"appointment": appt, "activity": items}


@router.post("/appointments/{appt_id}/status")
async def change_status(appt_id: str, req: StatusReq, user: dict = Depends(_s.require_vendor)):
    if req.status not in APPT_STATUSES + ["attended"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    appt = await _s.db.appointments.find_one(
        {"id": appt_id, "vendor_id": user["vendor_id"]}, {"_id": 0}
    )
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    updates = {"status": req.status, "updated_at": _s.now_iso()}
    if req.status == "completed":
        updates["attended"] = True
        updates["attended_at"] = _s.now_iso()
    await _s.db.appointments.update_one(
        {"id": appt_id, "vendor_id": user["vendor_id"]}, {"$set": updates}
    )
    await log_activity(user["vendor_id"], appt_id, "status_changed",
                       f"{appt.get('status')} → {req.status}" + (f" ({req.reason})" if req.reason else ""),
                       actor=user.get("email", "vendor"))
    return await _s.db.appointments.find_one(
        {"id": appt_id, "vendor_id": user["vendor_id"]}, {"_id": 0}
    )


@router.put("/appointments/{appt_id}/notes")
async def update_notes(appt_id: str, req: NotesReq, user: dict = Depends(_s.require_vendor)):
    appt = await _s.db.appointments.find_one(
        {"id": appt_id, "vendor_id": user["vendor_id"]}, {"_id": 0}
    )
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    await _s.db.appointments.update_one(
        {"id": appt_id, "vendor_id": user["vendor_id"]},
        {"$set": {"internal_notes": req.internal_notes, "updated_at": _s.now_iso()}},
    )
    await log_activity(user["vendor_id"], appt_id, "notes_updated", "", actor=user.get("email", "vendor"))
    return await _s.db.appointments.find_one(
        {"id": appt_id, "vendor_id": user["vendor_id"]}, {"_id": 0}
    )


@router.post("/appointments/{appt_id}/reschedule")
async def reschedule(appt_id: str, req: RescheduleReq, user: dict = Depends(_s.require_vendor)):
    appt = await _s.db.appointments.find_one(
        {"id": appt_id, "vendor_id": user["vendor_id"]}, {"_id": 0}
    )
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    start = _parse_iso(req.start_at)
    if not start:
        raise HTTPException(status_code=400, detail="Invalid start time")
    dur = appt.get("duration_minutes") or 30
    end = start + timedelta(minutes=dur)
    # conflict check (exclude self)
    busy = await _busy_windows(user["vendor_id"], exclude_id=appt_id)
    if any(_overlaps(start, end, b0, b1) for (b0, b1) in busy):
        raise HTTPException(status_code=409, detail="That time conflicts with another appointment")
    old = appt.get("start_at") or appt.get("scheduled_at")
    await _s.db.appointments.update_one(
        {"id": appt_id, "vendor_id": user["vendor_id"]},
        {"$set": {
            "start_at": start.isoformat(),
            "end_at": end.isoformat(),
            "scheduled_at": start.isoformat(),
            "status": "rescheduled",
            "updated_at": _s.now_iso(),
        }},
    )
    await log_activity(user["vendor_id"], appt_id, "rescheduled",
                       f"{old} → {start.isoformat()}" + (f" ({req.reason})" if req.reason else ""),
                       actor=user.get("email", "vendor"))
    updated = await _s.db.appointments.find_one(
        {"id": appt_id, "vendor_id": user["vendor_id"]}, {"_id": 0}
    )
    try:
        import google_calendar_routes as _gc, asyncio as _aio
        _aio.create_task(_gc.update_appointment(user["vendor_id"], updated))
    except Exception as e:
        _s.logger.warning("gcal update (reschedule) skipped: %s", e)
    return updated


@router.post("/appointments/{appt_id}/cancel")
async def cancel(appt_id: str, req: StatusReq = None, user: dict = Depends(_s.require_vendor)):
    appt = await _s.db.appointments.find_one(
        {"id": appt_id, "vendor_id": user["vendor_id"]}, {"_id": 0}
    )
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    reason = (req.reason if req else "") or ""
    await _s.db.appointments.update_one(
        {"id": appt_id, "vendor_id": user["vendor_id"]},
        {"$set": {"status": "cancelled", "updated_at": _s.now_iso()}},
    )
    await log_activity(user["vendor_id"], appt_id, "cancelled", reason, actor=user.get("email", "vendor"))
    try:
        import google_calendar_routes as _gc, asyncio as _aio
        _aio.create_task(_gc.delete_appointment(user["vendor_id"], appt))
    except Exception as e:
        _s.logger.warning("gcal delete (cancel) skipped: %s", e)
    return await _s.db.appointments.find_one(
        {"id": appt_id, "vendor_id": user["vendor_id"]}, {"_id": 0}
    )


# ------------------------------- Public booking page -------------------------
@public_router.get("/{slug}")
async def public_booking_info(slug: str):
    vendor = await _s.db.vendors.find_one({"slug": slug}, {"_id": 0})
    if not vendor or vendor.get("status") == "suspended":
        raise HTTPException(status_code=404, detail="Booking page not found")
    settings = await get_settings(vendor["id"])
    types = await _s.db.appointment_types.find(
        {"vendor_id": vendor["id"], "is_active": True}, {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    # If no types defined, offer a single default one so booking still works.
    if not types:
        types = [{
            "id": "default",
            "name": "Appointment",
            "description": "",
            "duration_minutes": settings.get("default_duration", 30),
            "color": "#002FA7",
            "location": "",
            "instructions": "",
        }]
    return {
        "vendor": {"id": vendor["id"], "name": vendor["name"], "slug": vendor["slug"]},
        "timezone": settings.get("timezone"),
        "booking_enabled": settings.get("booking_enabled", True),
        "types": types,
    }


@public_router.get("/{slug}/slots")
async def public_slots(slug: str, date: str = Query(...), type_id: Optional[str] = None):
    vendor = await _s.db.vendors.find_one({"slug": slug}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Booking page not found")
    settings = await get_settings(vendor["id"])
    if not settings.get("booking_enabled", True):
        return {"slots": [], "timezone": settings.get("timezone")}
    duration = settings.get("default_duration", 30)
    bb = settings.get("buffer_before", 0)
    ba = settings.get("buffer_after", 0)
    if type_id and type_id != "default":
        t = await _s.db.appointment_types.find_one(
            {"id": type_id, "vendor_id": vendor["id"]}, {"_id": 0}
        )
        if t:
            duration = t.get("duration_minutes", duration)
            if t.get("buffer_before") is not None:
                bb = t["buffer_before"]
            if t.get("buffer_after") is not None:
                ba = t["buffer_after"]
    slots = await compute_slots(vendor["id"], settings, duration, bb, ba, date)
    return {"slots": slots, "timezone": settings.get("timezone"), "duration": duration}


@public_router.post("/{slug}/book")
async def public_book(slug: str, req: BookReq):
    vendor = await _s.db.vendors.find_one({"slug": slug}, {"_id": 0})
    if not vendor or vendor.get("status") == "suspended":
        raise HTTPException(status_code=404, detail="Booking page not found")
    settings = await get_settings(vendor["id"])
    if not settings.get("booking_enabled", True):
        raise HTTPException(status_code=403, detail="Online booking is currently disabled")

    start = _parse_iso(req.start_at)
    if not start:
        raise HTTPException(status_code=400, detail="Invalid time")

    duration = settings.get("default_duration", 30)
    type_name = "Appointment"
    color = "#002FA7"
    location = ""
    if req.appointment_type_id and req.appointment_type_id != "default":
        t = await _s.db.appointment_types.find_one(
            {"id": req.appointment_type_id, "vendor_id": vendor["id"]}, {"_id": 0}
        )
        if t:
            duration = t.get("duration_minutes", duration)
            type_name = t.get("name", type_name)
            color = t.get("color", color)
            location = t.get("location", "")
    end = start + timedelta(minutes=duration)

    # Final double-booking guard (race-safe enough for Phase 1).
    busy = await _busy_windows(vendor["id"])
    if any(_overlaps(start, end, b0, b1) for (b0, b1) in busy):
        raise HTTPException(status_code=409, detail="Sorry, that slot was just taken. Please pick another time.")

    appt = {
        "id": _s.new_id(),
        "vendor_id": vendor["id"],
        "customer_name": req.customer_name,
        "customer_contact": req.customer_contact,
        "scheduled_at": start.isoformat(),
        "start_at": start.isoformat(),
        "end_at": end.isoformat(),
        "duration_minutes": duration,
        "appointment_type_id": req.appointment_type_id,
        "appointment_type_name": type_name,
        "color": color,
        "location": location,
        "customer_timezone": req.customer_timezone or settings.get("timezone"),
        "notes": req.notes,
        "status": "scheduled",
        "source": "booking_page",
        "attended": False,
        "conversation_id": None,
        "created_at": _s.now_iso(),
    }
    await _s.db.appointments.insert_one(dict(appt))
    appt.pop("_id", None)
    await log_activity(vendor["id"], appt["id"], "created", f"Booked via booking page ({type_name})", actor="customer")
    # Push to the vendor's Google Calendar (best-effort, non-blocking).
    try:
        import google_calendar_routes as _gc
        import asyncio as _aio
        _aio.create_task(_gc.push_appointment(vendor["id"], appt))
    except Exception as e:
        _s.logger.warning("gcal push (book) skipped: %s", e)
    # Reuse existing notification helpers (vendor + customer confirmation email).
    try:
        await _s._send_appointment_email(vendor["id"], appt)
    except Exception as e:
        _s.logger.warning("booking vendor email failed: %s", e)
    try:
        await _s._send_customer_appointment_confirmation(vendor["id"], appt)
    except Exception as e:
        _s.logger.warning("booking customer email failed: %s", e)
    return {"ok": True, "appointment": appt}
