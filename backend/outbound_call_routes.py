"""BotNira — Outbound AI Sales Calling Engine (Phase 1: core engine).

Plan gating: Growth & Pro only (reuses sales_routes._require_sales_vendor).

How it works
------------
• A vendor builds a campaign (industry, goal, script, language, voice, business
  hours, daily limit, retry rules) targeting one or more existing prospect lists.
• On launch we SNAPSHOT the prospects of the selected lists into
  `campaign_prospects` (deduped by phone). Non-NA (+1) numbers are blocked
  (`invalid_intl`) because Twilio voice is North-America only, matching the
  rest of BotNira. Invalid / DNC numbers are skipped.
• A single asyncio dialer loop (started on FastAPI startup) wakes every
  DIALER_TICK_SEC and, for every RUNNING campaign, respects:
    - business hours + timezone
    - daily call limit
    - remaining prepaid voice minutes (auto-pauses the campaign at 0)
    - per-campaign concurrency
    - retry rules (no-answer / busy / voicemail, max attempts, retry-after)
    - Do-Not-Call flags
  then places a REAL outbound Twilio call that bridges to OpenAI Realtime using
  the campaign's own system prompt / voice.
• Every call is stored as a `call_records` row AND surfaces as a `conversations`
  thread (channel="voice") so it shows in the exact Inbox viewer.
• Minutes are deducted on Twilio's status callback (same as inbound). When the
  balance hits 0 all running campaigns are paused with reason "no_minutes" and
  the vendor is prompted to recharge — we NEVER auto-charge.
"""
import asyncio
import csv
import io
import json
import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Optional, List, Dict, Any

import httpx
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

import server as _s
from sales_routes import _require_sales_vendor, _combine_e164, _norm_phone_digits

from twilio.rest import Client as TwilioClient
from twilio.twiml.voice_response import VoiceResponse, Connect, Stream
from twilio.base.exceptions import TwilioRestException

router = APIRouter()

DIALER_TICK_SEC = 15
MAX_CONCURRENT_PER_CAMPAIGN = 2
CALL_TIMEOUT_SEC = 28  # ring time before Twilio marks no-answer

# Terminal (never re-dialed) outcomes
TERMINAL_OUTCOMES = {"answered", "appointment_booked", "interested", "not_interested",
                     "transferred", "do_not_call", "wrong_number", "existing_customer", "failed"}
# Retryable Twilio dispositions
RETRYABLE = {"no_answer", "busy", "voicemail"}

DAILY_LIMIT_OPTIONS = [25, 50, 100, 250, 500, 1000]
INDUSTRIES = [
    "Dental Clinic", "Medical Clinic", "Law Firm", "Real Estate", "Immigration Consultant",
    "Auto Repair", "Driving School", "HVAC", "Plumbing", "Electrician", "Restaurant",
    "Salon", "Insurance", "Accounting", "Mortgage Broker",
]
GOALS = [
    {"id": "book_appointment", "label": "Book Appointment"},
    {"id": "qualify_lead", "label": "Qualify Lead"},
    {"id": "sell_product", "label": "Sell Product"},
    {"id": "schedule_demo", "label": "Schedule Demo"},
    {"id": "collect_information", "label": "Collect Information"},
    {"id": "transfer_to_human", "label": "Transfer To Human"},
    {"id": "survey_customers", "label": "Survey Customers"},
]
VOICE_TONES = ["Friendly", "Professional", "Casual", "Premium"]

# Map (gender, tone) → OpenAI Realtime voice name.
def _openai_voice(gender: str, tone: str) -> str:
    g = (gender or "").lower()
    if g == "male":
        return "ash" if (tone or "").lower() != "casual" else "verse"
    if g == "female":
        return "shimmer" if (tone or "").lower() != "premium" else "coral"
    return "alloy"


# ------------------------------------------------------------------ models ---
class BusinessHours(BaseModel):
    days: List[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4])  # 0=Mon..6=Sun
    open: str = "09:00"
    close: str = "17:00"
    timezone: str = "America/Toronto"


class RetryRules(BaseModel):
    on_no_answer: bool = True
    on_busy: bool = True
    on_voicemail: bool = False
    max_attempts: int = 2
    retry_after: str = "2h"          # 30m | 2h | tomorrow | custom
    retry_after_minutes: Optional[int] = None  # used when retry_after == "custom"


class VoiceCfg(BaseModel):
    gender: str = "female"           # female | male
    tone: str = "Friendly"


class CampaignIn(BaseModel):
    name: str
    description: Optional[str] = ""
    list_ids: List[str] = Field(default_factory=list)
    industry: Optional[str] = ""
    goal: str = "book_appointment"
    goal_custom: Optional[str] = ""
    script: str = ""
    language: Optional[str] = "English"
    voice: VoiceCfg = Field(default_factory=VoiceCfg)
    business_hours: BusinessHours = Field(default_factory=BusinessHours)
    daily_limit: int = 50
    retry: RetryRules = Field(default_factory=RetryRules)


# ------------------------------------------------------------------ utils ---
def _tz(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except Exception:
        return ZoneInfo("America/Toronto")


def _within_business_hours(camp: dict) -> bool:
    bh = camp.get("business_hours") or {}
    tz = _tz(bh.get("timezone") or "America/Toronto")
    now = datetime.now(tz)
    if now.weekday() not in (bh.get("days") or [0, 1, 2, 3, 4]):
        return False
    try:
        oh, om = [int(x) for x in (bh.get("open") or "09:00").split(":")]
        ch, cm = [int(x) for x in (bh.get("close") or "17:00").split(":")]
    except Exception:
        oh, om, ch, cm = 9, 0, 17, 0
    cur = now.hour * 60 + now.minute
    return (oh * 60 + om) <= cur < (ch * 60 + cm)


def _day_key(camp: dict) -> str:
    bh = camp.get("business_hours") or {}
    return datetime.now(_tz(bh.get("timezone") or "America/Toronto")).strftime("%Y-%m-%d")


def _retry_minutes(retry: dict) -> int:
    code = (retry or {}).get("retry_after") or "2h"
    return {"30m": 30, "2h": 120, "tomorrow": 1440}.get(
        code, int((retry or {}).get("retry_after_minutes") or 120))


async def _vendor_minutes(vendor_id: str) -> tuple[float, bool]:
    v = await _s.db.vendors.find_one({"id": vendor_id}, {"_id": 0, "minutes_balance": 1, "is_exempt": 1})
    if not v:
        return 0.0, False
    return float(v.get("minutes_balance", 0.0)), bool(v.get("is_exempt"))


def _clean(doc: dict) -> dict:
    return {k: v for k, v in (doc or {}).items() if k != "_id"}


# ------------------------------------------------------------------ access ---
@router.get("/dashboard")
async def dashboard(user: dict = Depends(_require_sales_vendor)):
    vid = user["vendor_id"]
    mins, _exempt = await _vendor_minutes(vid)

    async def _count(status_list):
        return await _s.db.campaign_out.count_documents({"vendor_id": vid, "status": {"$in": status_list}})

    # campaign status buckets
    active = await _count(["running"])
    draft = await _count(["draft"])
    completed = await _count(["completed", "finished"])
    paused = await _count(["paused"])

    # call-level aggregates
    agg = await _s.db.campaign_calls.aggregate([
        {"$match": {"vendor_id": vid}},
        {"$group": {
            "_id": None,
            "completed": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
            "in_progress": {"$sum": {"$cond": [{"$in": ["$status", ["initiated", "ringing", "in-progress", "answered"]]}, 1, 0]}},
            "minutes": {"$sum": {"$ifNull": ["$minutes", 0]}},
            "duration": {"$sum": {"$ifNull": ["$duration_sec", 0]}},
            "answered": {"$sum": {"$cond": [{"$eq": ["$outcome", "answered"]}, 1, 0]}},
            "no_answer": {"$sum": {"$cond": [{"$eq": ["$outcome", "no_answer"]}, 1, 0]}},
            "busy": {"$sum": {"$cond": [{"$eq": ["$outcome", "busy"]}, 1, 0]}},
            "voicemail": {"$sum": {"$cond": [{"$eq": ["$outcome", "voicemail"]}, 1, 0]}},
            "interested": {"$sum": {"$cond": [{"$eq": ["$outcome", "interested"]}, 1, 0]}},
            "not_interested": {"$sum": {"$cond": [{"$eq": ["$outcome", "not_interested"]}, 1, 0]}},
            "callback": {"$sum": {"$cond": [{"$eq": ["$outcome", "callback_requested"]}, 1, 0]}},
            "appointments": {"$sum": {"$cond": [{"$eq": ["$outcome", "appointment_booked"]}, 1, 0]}},
        }},
    ]).to_list(1)
    a = agg[0] if agg else {}
    scheduled = await _s.db.campaign_prospects.count_documents({"vendor_id": vid, "status": "pending"})
    completed_calls = int(a.get("completed", 0))
    dur = float(a.get("duration", 0))
    avg_dur = round(dur / completed_calls, 1) if completed_calls else 0.0

    # calls-per-day (last 14 days)
    per_day = await _s.db.campaign_calls.aggregate([
        {"$match": {"vendor_id": vid, "started_at": {"$exists": True}}},
        {"$group": {"_id": {"$substr": ["$started_at", 0, 10]},
                    "calls": {"$sum": 1},
                    "answered": {"$sum": {"$cond": [{"$eq": ["$outcome", "answered"]}, 1, 0]}}}},
        {"$sort": {"_id": -1}}, {"$limit": 14},
    ]).to_list(14)
    per_day = list(reversed(per_day))

    return {
        "campaigns": {"active": active, "draft": draft, "completed": completed, "paused": paused},
        "calls": {
            "scheduled": scheduled,
            "completed": completed_calls,
            "in_progress": int(a.get("in_progress", 0)),
            "answered": int(a.get("answered", 0)),
            "no_answer": int(a.get("no_answer", 0)),
            "busy": int(a.get("busy", 0)),
            "voicemail": int(a.get("voicemail", 0)),
            "interested": int(a.get("interested", 0)),
            "not_interested": int(a.get("not_interested", 0)),
            "callback_requested": int(a.get("callback", 0)),
            "appointments_booked": int(a.get("appointments", 0)),
        },
        "avg_call_duration_sec": avg_dur,
        "voice_minutes_used": round(float(a.get("minutes", 0)), 1),
        "voice_minutes_remaining": round(mins, 1),
        "per_day": [{"day": d["_id"], "calls": d["calls"], "answered": d["answered"]} for d in per_day],
        "options": {"industries": INDUSTRIES, "goals": GOALS, "tones": VOICE_TONES,
                    "daily_limits": DAILY_LIMIT_OPTIONS},
    }


# --------------------------------------------------------------- campaigns ---
@router.get("/campaigns")
async def list_campaigns(user: dict = Depends(_require_sales_vendor)):
    vid = user["vendor_id"]
    cur = _s.db.campaign_out.find({"vendor_id": vid}, {"_id": 0}).sort("created_at", -1).limit(200)
    items = await cur.to_list(200)
    # attach lightweight progress
    for c in items:
        total = await _s.db.campaign_prospects.count_documents({"campaign_id": c["id"]})
        done = await _s.db.campaign_prospects.count_documents(
            {"campaign_id": c["id"], "status": {"$in": ["completed"]}})
        c["total_prospects"] = total
        c["completed_prospects"] = done
    return {"items": items}


@router.post("/campaigns")
async def create_campaign(payload: CampaignIn, user: dict = Depends(_require_sales_vendor)):
    vid = user["vendor_id"]
    if not payload.name.strip():
        raise HTTPException(400, "Campaign name is required")
    # validate lists belong to vendor
    valid_lists = []
    for lid in payload.list_ids:
        l = await _s.db.sales_prospect_lists.find_one({"id": lid, "vendor_id": vid}, {"_id": 0, "id": 1})
        if l:
            valid_lists.append(lid)
    doc = {
        "id": _s.new_id(),
        "vendor_id": vid,
        "name": payload.name.strip(),
        "description": (payload.description or "").strip(),
        "list_ids": valid_lists,
        "industry": payload.industry or "",
        "goal": payload.goal,
        "goal_custom": payload.goal_custom or "",
        "script": payload.script or "",
        "language": payload.language or "English",
        "voice": payload.voice.model_dump(),
        "business_hours": payload.business_hours.model_dump(),
        "daily_limit": int(payload.daily_limit or 50),
        "retry": payload.retry.model_dump(),
        "status": "draft",
        "paused_reason": None,
        "calls_today": 0,
        "day_key": None,
        "stats": {"minutes_used": 0.0},
        "created_at": _s.now_iso(),
        "updated_at": _s.now_iso(),
        "started_at": None,
        "completed_at": None,
    }
    await _s.db.campaign_out.insert_one(doc.copy())
    return _clean(doc)


@router.put("/campaigns/{cid}")
async def update_campaign(cid: str, payload: CampaignIn, user: dict = Depends(_require_sales_vendor)):
    vid = user["vendor_id"]
    c = await _s.db.campaign_out.find_one({"id": cid, "vendor_id": vid}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Campaign not found")
    if c["status"] not in ("draft", "paused"):
        raise HTTPException(400, "Only draft or paused campaigns can be edited")
    valid_lists = []
    for lid in payload.list_ids:
        l = await _s.db.sales_prospect_lists.find_one({"id": lid, "vendor_id": vid}, {"_id": 0, "id": 1})
        if l:
            valid_lists.append(lid)
    await _s.db.campaign_out.update_one({"id": cid}, {"$set": {
        "name": payload.name.strip(), "description": payload.description or "",
        "list_ids": valid_lists, "industry": payload.industry or "", "goal": payload.goal,
        "goal_custom": payload.goal_custom or "", "script": payload.script or "",
        "language": payload.language or "English", "voice": payload.voice.model_dump(),
        "business_hours": payload.business_hours.model_dump(),
        "daily_limit": int(payload.daily_limit or 50), "retry": payload.retry.model_dump(),
        "updated_at": _s.now_iso(),
    }})
    return _clean(await _s.db.campaign_out.find_one({"id": cid}, {"_id": 0}))


@router.get("/campaigns/{cid}")
async def get_campaign(cid: str, user: dict = Depends(_require_sales_vendor)):
    c = await _s.db.campaign_out.find_one({"id": cid, "vendor_id": user["vendor_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Campaign not found")
    # prospect status breakdown
    breakdown = await _s.db.campaign_prospects.aggregate([
        {"$match": {"campaign_id": cid}},
        {"$group": {"_id": "$status", "n": {"$sum": 1}}},
    ]).to_list(50)
    c["prospect_breakdown"] = {b["_id"]: b["n"] for b in breakdown}
    c["total_prospects"] = sum(b["n"] for b in breakdown)
    return c


async def _enqueue_prospects(camp: dict) -> Dict[str, int]:
    """Snapshot prospects from selected lists into campaign_prospects.
    Dedupe by E.164 phone. Block non-NA (+1) and invalid numbers."""
    vid = camp["vendor_id"]
    flt = {"vendor_id": vid, "status": "active"}
    if camp.get("list_ids"):
        flt["list_ids"] = {"$in": camp["list_ids"]}
    cur = _s.db.sales_prospects.find(flt, {"_id": 0})
    seen = set()
    added = blocked_intl = invalid = dnc = 0
    async for p in cur:
        e164 = _combine_e164(p.get("country_code") or "", p.get("phone") or "")
        digits = _norm_phone_digits(e164)
        if not digits or len(digits) < 10:
            invalid += 1
            continue
        if digits in seen:
            continue
        seen.add(digits)
        if p.get("do_not_call"):
            dnc += 1
            status = "do_not_call"
        elif not (digits.startswith("1") and len(digits) == 11):
            blocked_intl += 1
            status = "invalid_intl"
        else:
            status = "pending"
            added += 1
        await _s.db.campaign_prospects.update_one(
            {"campaign_id": camp["id"], "phone": digits},
            {"$setOnInsert": {
                "id": _s.new_id(), "campaign_id": camp["id"], "vendor_id": vid,
                "prospect_id": p.get("id"), "name": p.get("name") or "",
                "company": p.get("company") or "", "phone": digits,
                "e164": f"+{digits}", "status": status, "attempts": 0,
                "next_attempt_at": None, "outcome": None, "last_call_id": None,
                "created_at": _s.now_iso(), "updated_at": _s.now_iso(),
            }},
            upsert=True,
        )
    return {"queued": added, "blocked_international": blocked_intl, "invalid": invalid, "do_not_call": dnc}


@router.post("/campaigns/{cid}/launch")
async def launch_campaign(cid: str, user: dict = Depends(_require_sales_vendor)):
    vid = user["vendor_id"]
    c = await _s.db.campaign_out.find_one({"id": cid, "vendor_id": vid}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Campaign not found")
    if c["status"] not in ("draft", "paused"):
        raise HTTPException(400, f"Campaign is already {c['status']}")
    # Must have a provisioned voice number
    conn = await _s.db.voice_connections.find_one({"vendor_id": vid}, {"_id": 0})
    if not conn:
        raise HTTPException(400, "No phone number provisioned. Buy a voice number in Channels first.")
    # Must have voice minutes
    mins, exempt = await _vendor_minutes(vid)
    if not exempt and mins <= 0:
        raise HTTPException(402, "No voice minutes remaining. Recharge from Billing to launch.")
    # Snapshot prospects (only on first launch of a draft)
    stats = {}
    if c["status"] == "draft":
        stats = await _enqueue_prospects(c)
        if stats["queued"] == 0:
            # Nothing callable — tell the vendor exactly why
            if stats["blocked_international"] > 0:
                raise HTTPException(400, "All selected prospects are international. BotNira outbound calling supports US/Canada (+1) numbers only.")
            raise HTTPException(400, "No callable prospects found in the selected lists.")
    await _s.db.campaign_out.update_one({"id": cid}, {"$set": {
        "status": "running", "paused_reason": None, "started_at": c.get("started_at") or _s.now_iso(),
        "updated_at": _s.now_iso(),
    }})
    return {"ok": True, "status": "running", "enqueue": stats}


@router.post("/campaigns/{cid}/pause")
async def pause_campaign(cid: str, user: dict = Depends(_require_sales_vendor)):
    r = await _s.db.campaign_out.update_one(
        {"id": cid, "vendor_id": user["vendor_id"], "status": "running"},
        {"$set": {"status": "paused", "paused_reason": "manual", "updated_at": _s.now_iso()}})
    if not r.matched_count:
        raise HTTPException(404, "Running campaign not found")
    return {"ok": True, "status": "paused"}


@router.post("/campaigns/{cid}/resume")
async def resume_campaign(cid: str, user: dict = Depends(_require_sales_vendor)):
    vid = user["vendor_id"]
    c = await _s.db.campaign_out.find_one({"id": cid, "vendor_id": vid, "status": "paused"}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Paused campaign not found")
    mins, exempt = await _vendor_minutes(vid)
    if not exempt and mins <= 0:
        raise HTTPException(402, "No voice minutes remaining. Recharge from Billing to resume.")
    await _s.db.campaign_out.update_one({"id": cid}, {"$set": {
        "status": "running", "paused_reason": None, "updated_at": _s.now_iso()}})
    return {"ok": True, "status": "running"}


@router.post("/campaigns/{cid}/cancel")
async def cancel_campaign(cid: str, user: dict = Depends(_require_sales_vendor)):
    r = await _s.db.campaign_out.update_one(
        {"id": cid, "vendor_id": user["vendor_id"], "status": {"$in": ["running", "paused", "draft"]}},
        {"$set": {"status": "cancelled", "updated_at": _s.now_iso()}})
    if not r.matched_count:
        raise HTTPException(404, "Campaign not found")
    return {"ok": True, "status": "cancelled"}


@router.delete("/campaigns/{cid}")
async def delete_campaign(cid: str, user: dict = Depends(_require_sales_vendor)):
    vid = user["vendor_id"]
    c = await _s.db.campaign_out.find_one({"id": cid, "vendor_id": vid}, {"_id": 0, "status": 1})
    if not c:
        raise HTTPException(404, "Campaign not found")
    if c["status"] == "running":
        raise HTTPException(400, "Pause or cancel the campaign before deleting")
    await _s.db.campaign_out.delete_one({"id": cid, "vendor_id": vid})
    await _s.db.campaign_prospects.delete_many({"campaign_id": cid})
    return {"ok": True}


def _calls_query(cid: str, vid: str, outcome, status, q, date_from, date_to) -> dict:
    flt: Dict[str, Any] = {"campaign_id": cid, "vendor_id": vid}
    if outcome:
        flt["outcome"] = outcome
    if status:
        flt["status"] = status
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        flt["$or"] = [{"name": rx}, {"company": rx}, {"phone": rx}]
    if date_from or date_to:
        rng = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to + "T23:59:59"
        flt["started_at"] = rng
    return flt


@router.get("/campaigns/{cid}/calls")
async def campaign_calls(cid: str, user: dict = Depends(_require_sales_vendor),
                         outcome: Optional[str] = None, status: Optional[str] = None,
                         q: Optional[str] = None, date_from: Optional[str] = None,
                         date_to: Optional[str] = None, sort: str = "started_at",
                         order: int = -1, limit: int = Query(50, ge=1, le=200),
                         offset: int = Query(0, ge=0)):
    vid = user["vendor_id"]
    c = await _s.db.campaign_out.find_one({"id": cid, "vendor_id": vid}, {"_id": 0, "id": 1})
    if not c:
        raise HTTPException(404, "Campaign not found")
    flt = _calls_query(cid, vid, outcome, status, q, date_from, date_to)
    sort_field = sort if sort in ("started_at", "duration_sec", "attempt_no", "outcome") else "started_at"
    total = await _s.db.campaign_calls.count_documents(flt)
    cur = _s.db.campaign_calls.find(flt, {"_id": 0}).sort(sort_field, 1 if order > 0 else -1).skip(offset).limit(limit)
    items = await cur.to_list(limit)
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/campaigns/{cid}/calls/export")
async def export_calls(cid: str, fmt: str = "csv", user: dict = Depends(_require_sales_vendor),
                       outcome: Optional[str] = None, status: Optional[str] = None,
                       q: Optional[str] = None, date_from: Optional[str] = None,
                       date_to: Optional[str] = None):
    vid = user["vendor_id"]
    camp = await _s.db.campaign_out.find_one({"id": cid, "vendor_id": vid}, {"_id": 0, "name": 1})
    if not camp:
        raise HTTPException(404, "Campaign not found")
    flt = _calls_query(cid, vid, outcome, status, q, date_from, date_to)
    rows = await _s.db.campaign_calls.find(flt, {"_id": 0}).sort("started_at", -1).to_list(10000)
    headers = ["Name", "Company", "Phone", "Date", "Duration (s)", "Attempt", "Status", "Outcome"]

    def _row(r):
        return [r.get("name", ""), r.get("company", ""), r.get("phone", ""),
                (r.get("started_at") or "")[:19].replace("T", " "), r.get("duration_sec", 0),
                r.get("attempt_no", ""), r.get("status", ""), (r.get("outcome") or "")]

    safe = re.sub(r"[^a-zA-Z0-9]+", "_", camp["name"])[:40] or "campaign"
    if fmt == "xlsx":
        from openpyxl import Workbook
        wb = Workbook()
        ws = wb.active
        ws.title = "Calls"
        ws.append(headers)
        for r in rows:
            ws.append(_row(r))
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        return StreamingResponse(
            buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={safe}_calls.xlsx"})
    # CSV
    sio = io.StringIO()
    w = csv.writer(sio)
    w.writerow(headers)
    for r in rows:
        w.writerow(_row(r))
    return Response(content=sio.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f"attachment; filename={safe}_calls.csv"})


@router.get("/campaigns/{cid}/analytics")
async def campaign_analytics(cid: str, user: dict = Depends(_require_sales_vendor)):
    vid = user["vendor_id"]
    camp = await _s.db.campaign_out.find_one({"id": cid, "vendor_id": vid}, {"_id": 0})
    if not camp:
        raise HTTPException(404, "Campaign not found")
    total_prospects = await _s.db.campaign_prospects.count_documents({"campaign_id": cid})
    remaining = await _s.db.campaign_prospects.count_documents(
        {"campaign_id": cid, "status": {"$in": ["pending", "claiming", "calling"]}})
    dist = await _s.db.campaign_calls.aggregate([
        {"$match": {"campaign_id": cid}},
        {"$group": {"_id": "$outcome", "n": {"$sum": 1}}},
    ]).to_list(50)
    outcome_dist = {(d["_id"] or "pending"): d["n"] for d in dist}
    agg = await _s.db.campaign_calls.aggregate([
        {"$match": {"campaign_id": cid}},
        {"$group": {"_id": None, "completed": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
                    "minutes": {"$sum": {"$ifNull": ["$minutes", 0]}},
                    "duration": {"$sum": {"$ifNull": ["$duration_sec", 0]}}}},
    ]).to_list(1)
    a = agg[0] if agg else {}
    completed = int(a.get("completed", 0))
    answered = outcome_dist.get("answered", 0) + outcome_dist.get("interested", 0) + outcome_dist.get("appointment_booked", 0) + outcome_dist.get("not_interested", 0) + outcome_dist.get("callback_requested", 0)
    interested = outcome_dist.get("interested", 0) + outcome_dist.get("hot_lead", 0) + outcome_dist.get("warm_lead", 0)
    appointments = outcome_dist.get("appointment_booked", 0)
    per_day = await _s.db.campaign_calls.aggregate([
        {"$match": {"campaign_id": cid}},
        {"$group": {"_id": {"$substr": ["$started_at", 0, 10]}, "calls": {"$sum": 1},
                    "answered": {"$sum": {"$cond": [{"$in": ["$outcome", ["answered", "interested", "appointment_booked", "not_interested", "callback_requested"]]}, 1, 0]}}}},
        {"$sort": {"_id": 1}},
    ]).to_list(60)
    retry_count = await _s.db.campaign_calls.count_documents({"campaign_id": cid, "attempt_no": {"$gt": 1}})
    mins, _ex = await _vendor_minutes(vid)
    rate = lambda n, d: round((n / d) * 100, 1) if d else 0.0
    return {
        "total_prospects": total_prospects,
        "completed_calls": completed,
        "remaining_calls": remaining,
        "outcome_distribution": outcome_dist,
        "answered": answered, "appointments": appointments, "interested": interested,
        "transferred": outcome_dist.get("transferred", 0),
        "no_answer": outcome_dist.get("no_answer", 0), "busy": outcome_dist.get("busy", 0),
        "voicemail": outcome_dist.get("voicemail", 0),
        "avg_duration_sec": round(float(a.get("duration", 0)) / completed, 1) if completed else 0.0,
        "voice_minutes_used": round(float(a.get("minutes", 0)), 1),
        "voice_minutes_remaining": round(mins, 1),
        "answer_rate": rate(answered, completed),
        "interest_rate": rate(interested, completed),
        "conversion_rate": rate(appointments, completed),
        "retry_count": retry_count,
        "completion_percentage": rate(total_prospects - remaining, total_prospects),
        "per_day": [{"day": d["_id"], "calls": d["calls"], "answered": d["answered"]} for d in per_day if d["_id"]],
    }


@router.get("/calls/{call_id}")
async def call_detail(call_id: str, user: dict = Depends(_require_sales_vendor)):
    vid = user["vendor_id"]
    cc = await _s.db.campaign_calls.find_one({"id": call_id, "vendor_id": vid}, {"_id": 0})
    if not cc:
        raise HTTPException(404, "Call not found")
    rec = await _s.db.call_records.find_one({"id": call_id}, {"_id": 0}) or {}
    summary = await _s.db.call_ai_summaries.find_one({"call_id": call_id}, {"_id": 0})
    transcript = []
    if cc.get("conversation_id"):
        msgs = await _s.db.messages.find(
            {"conversation_id": cc["conversation_id"]}, {"_id": 0}).sort("created_at", 1).to_list(300)
        transcript = [{"role": m["role"], "content": m.get("content", ""), "at": m.get("created_at")} for m in msgs]
    prospect = None
    if cc.get("campaign_prospect_id"):
        prospect = await _s.db.campaign_prospects.find_one(
            {"id": cc["campaign_prospect_id"]}, {"_id": 0, "attempts": 1, "outcome": 1, "next_attempt_at": 1, "status": 1})
    campaign = await _s.db.campaign_out.find_one(
        {"id": cc["campaign_id"]}, {"_id": 0, "name": 1, "industry": 1, "goal": 1, "language": 1, "voice": 1})
    return {
        "call": cc,
        "meta": {"call_sid": rec.get("call_sid"), "direction": rec.get("direction"),
                 "from": rec.get("from_number"), "to": rec.get("to_number"),
                 "started_at": rec.get("started_at"), "ended_at": rec.get("ended_at"),
                 "minutes": rec.get("minutes"), "language": (campaign or {}).get("language"),
                 "voice": (campaign or {}).get("voice"), "model": _s.OPENAI_REALTIME_MODEL},
        "campaign": campaign,
        "prospect": prospect,
        "summary": summary,
        "transcript": transcript,
        "has_recording": bool(cc.get("recording_url")),
    }


@router.get("/calls/{call_id}/recording")
async def stream_recording(call_id: str, user: dict = Depends(_require_sales_vendor)):
    cc = await _s.db.campaign_calls.find_one(
        {"id": call_id, "vendor_id": user["vendor_id"]}, {"_id": 0, "recording_url": 1})
    if not cc or not cc.get("recording_url"):
        raise HTTPException(404, "No recording available")
    # Twilio media is protected by HTTP basic auth; the PARENT account can read
    # sub-account recordings, so we authenticate with the master credentials.
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(cc["recording_url"], auth=(_s.TWILIO_ACCOUNT_SID, _s.TWILIO_AUTH_TOKEN))
    if r.status_code != 200:
        raise HTTPException(502, "Could not fetch recording from Twilio")
    return Response(content=r.content, media_type="audio/mpeg")


@router.post("/recording/{call_id}")
async def outbound_recording(call_id: str, request: _s._StripeRequest):
    """Twilio recording-status callback — store the recording media URL."""
    form = await request.form()
    rec_sid = form.get("RecordingSid")
    rec_url = form.get("RecordingUrl")
    if rec_url:
        media = rec_url if rec_url.endswith(".mp3") else rec_url + ".mp3"
        await _s.db.campaign_calls.update_one({"id": call_id}, {"$set": {"recording_sid": rec_sid, "recording_url": media}})
        await _s.db.call_records.update_one({"id": call_id}, {"$set": {"recording_url": media}})
    return {"ok": True}


# --------------------------------------------------------- public webhooks ---
@router.post("/twiml/{call_id}")
async def outbound_twiml(call_id: str, request: _s._StripeRequest):
    """Twilio fetches this when the outbound call connects. Returns TwiML that
    opens a Media Stream into the shared voice bridge (campaign-aware)."""
    vr = VoiceResponse()
    call = await _s.db.call_records.find_one({"id": call_id}, {"_id": 0})
    if not call:
        vr.say("Sorry, this call could not be connected. Goodbye.", voice="alice")
        vr.hangup()
        return Response(content=str(vr), media_type="application/xml")
    base_ws = _s.PUBLIC_BASE_URL.replace("https://", "wss://").replace("http://", "ws://").rstrip("/")
    ws_url = f"{base_ws}/api/voice/stream/{call_id}"
    connect = Connect()
    stream = Stream(url=ws_url)
    stream.parameter(name="vendor_id", value=call["vendor_id"])
    stream.parameter(name="call_id", value=call_id)
    connect.append(stream)
    vr.append(connect)
    return Response(content=str(vr), media_type="application/xml")


@router.post("/status/{call_id}")
async def outbound_status(call_id: str, request: _s._StripeRequest):
    """Twilio call lifecycle callback. Finalises the call, deducts minutes,
    records the outcome, schedules retries, and auto-pauses at 0 minutes."""
    form = await request.form()
    status = form.get("CallStatus")           # initiated|ringing|in-progress|completed|busy|no-answer|failed|canceled
    duration = form.get("CallDuration")        # seconds (on completed)
    answered_by = (form.get("AnsweredBy") or "").lower()  # human|machine_*|unknown (AMD)

    call = await _s.db.call_records.find_one({"id": call_id}, {"_id": 0})
    if not call:
        return {"ok": True}
    cid = call.get("campaign_id")

    # progress states — just track
    if status in ("initiated", "ringing", "in-progress"):
        await _s.db.call_records.update_one({"id": call_id}, {"$set": {"status": status}})
        await _s.db.campaign_calls.update_one({"id": call_id}, {"$set": {"status": status}})
        return {"ok": True}

    # terminal — compute outcome + minutes
    mins = 0.0
    if duration:
        try:
            mins = round(float(duration) / 60.0, 2)
        except Exception:
            mins = 0.0
    if status == "completed":
        outcome = "voicemail" if answered_by.startswith("machine") else "answered"
    elif status == "busy":
        outcome = "busy"
    elif status == "no-answer":
        outcome = "no_answer"
    else:
        outcome = "failed"

    updates = {"status": "completed", "ended_at": _s.now_iso(), "minutes": mins}
    await _s.db.call_records.update_one({"id": call_id}, {"$set": updates})
    await _s.db.campaign_calls.update_one({"id": call_id}, {"$set": {
        "status": "completed", "ended_at": _s.now_iso(), "minutes": mins,
        "duration_sec": int(float(duration)) if duration else 0, "outcome": outcome,
    }})

    # Deduct minutes (unless exempt)
    v = await _s.db.vendors.find_one({"id": call["vendor_id"]}, {"_id": 0, "is_exempt": 1})
    if v and not v.get("is_exempt") and mins > 0:
        await _s.db.vendors.update_one({"id": call["vendor_id"]},
                                       {"$inc": {"minutes_balance": -mins, "minutes_used_total": mins}})

    # Advance the campaign prospect (retry or complete)
    cp_id = call.get("campaign_prospect_id")
    if cp_id and cid:
        cp = await _s.db.campaign_prospects.find_one({"id": cp_id}, {"_id": 0})
        camp = await _s.db.campaign_out.find_one({"id": cid}, {"_id": 0})
        if cp and camp:
            retry = camp.get("retry") or {}
            attempts = int(cp.get("attempts", 0))
            will_retry = (
                outcome in RETRYABLE
                and attempts < int(retry.get("max_attempts", 2))
                and retry.get(f"on_{outcome}", False)
            )
            if will_retry:
                nxt = (datetime.now(timezone.utc) + timedelta(minutes=_retry_minutes(retry))).isoformat()
                await _s.db.campaign_prospects.update_one({"id": cp_id}, {"$set": {
                    "status": "pending", "outcome": outcome, "next_attempt_at": nxt,
                    "updated_at": _s.now_iso()}})
            else:
                await _s.db.campaign_prospects.update_one({"id": cp_id}, {"$set": {
                    "status": "completed", "outcome": outcome, "updated_at": _s.now_iso()}})

    # Auto-pause all running campaigns if minutes hit 0
    if v and not v.get("is_exempt"):
        bal = await _s.db.vendors.find_one({"id": call["vendor_id"]}, {"_id": 0, "minutes_balance": 1})
        if bal and float(bal.get("minutes_balance", 0)) <= 0:
            await _s.db.campaign_out.update_many(
                {"vendor_id": call["vendor_id"], "status": "running"},
                {"$set": {"status": "paused", "paused_reason": "no_minutes", "updated_at": _s.now_iso()}})

    # Kick off AI post-call analysis for answered calls (transcript-based).
    if outcome == "answered":
        asyncio.create_task(_generate_call_summary(call_id))
    return {"ok": True}


# ------------------------------------------------------------------ dialer ---
async def _place_call(camp: dict, cp: dict, conn: dict) -> bool:
    """Place ONE outbound Twilio call for a campaign prospect. Returns True on success."""
    vid = camp["vendor_id"]
    cli = _s._twilio_subaccount_client_for_conn(conn)
    if not cli:
        _s.logger.warning("[outbound] no twilio client for vendor %s", vid)
        return False
    call_id = _s.new_id()
    base = _s.PUBLIC_BASE_URL.rstrip("/")
    to_e164 = cp.get("e164") or f"+{cp['phone']}"
    # Pre-create the call_records + campaign_calls rows so the TwiML/stream/status
    # handlers can find context immediately.
    await _s.db.call_records.insert_one({
        "id": call_id, "vendor_id": vid, "direction": "outbound",
        "campaign_id": camp["id"], "campaign_prospect_id": cp["id"],
        "from_number": conn["phone_number"], "to_number": to_e164,
        "customer_name": cp.get("name") or cp.get("company") or to_e164,
        "customer_contact": to_e164,
        "started_at": _s.now_iso(), "minutes": 0.0, "status": "queued",
    })
    await _s.db.campaign_calls.insert_one({
        "id": call_id, "campaign_id": camp["id"], "vendor_id": vid,
        "campaign_prospect_id": cp["id"], "prospect_id": cp.get("prospect_id"),
        "name": cp.get("name") or "", "company": cp.get("company") or "",
        "phone": to_e164, "attempt_no": int(cp.get("attempts", 0)) + 1,
        "status": "initiated", "outcome": None, "minutes": 0.0, "duration_sec": 0,
        "conversation_id": None, "started_at": _s.now_iso(),
    })
    try:
        cli.calls.create(
            to=to_e164, from_=conn["phone_number"],
            url=f"{base}/api/sales/outbound/twiml/{call_id}", method="POST",
            status_callback=f"{base}/api/sales/outbound/status/{call_id}",
            status_callback_method="POST",
            status_callback_event=["initiated", "ringing", "answered", "completed"],
            machine_detection="DetectMessageEnd",
            record=True,
            recording_status_callback=f"{base}/api/sales/outbound/recording/{call_id}",
            recording_status_callback_method="POST",
            recording_status_callback_event=["completed"],
            timeout=CALL_TIMEOUT_SEC,
        )
    except TwilioRestException as e:
        _s.logger.warning("[outbound] twilio create failed to %s: %s", to_e164, e.msg)
        await _s.db.call_records.update_one({"id": call_id}, {"$set": {"status": "failed"}})
        await _s.db.campaign_calls.update_one({"id": call_id}, {"$set": {"status": "completed", "outcome": "failed"}})
        await _s.db.campaign_prospects.update_one({"id": cp["id"]}, {"$set": {
            "status": "completed", "outcome": "failed", "updated_at": _s.now_iso()}})
        return False
    except Exception as e:
        _s.logger.exception("[outbound] place_call error: %s", e)
        return False
    # Mark prospect as calling + increment attempts + daily counter
    await _s.db.campaign_prospects.update_one({"id": cp["id"]}, {
        "$set": {"status": "calling", "last_call_id": call_id, "updated_at": _s.now_iso()},
        "$inc": {"attempts": 1},
    })
    return True


async def _process_campaign(camp: dict):
    vid = camp["vendor_id"]
    # 1) business hours
    if not _within_business_hours(camp):
        return
    # 2) minutes
    mins, exempt = await _vendor_minutes(vid)
    if not exempt and mins <= 0:
        await _s.db.campaign_out.update_one({"id": camp["id"]}, {"$set": {
            "status": "paused", "paused_reason": "no_minutes", "updated_at": _s.now_iso()}})
        return
    # 3) daily limit (reset counter when campaign-local day rolls over)
    dk = _day_key(camp)
    calls_today = int(camp.get("calls_today", 0))
    if camp.get("day_key") != dk:
        calls_today = 0
        await _s.db.campaign_out.update_one({"id": camp["id"]}, {"$set": {"day_key": dk, "calls_today": 0}})
    if calls_today >= int(camp.get("daily_limit", 50)):
        return
    # 4) concurrency
    in_flight = await _s.db.campaign_calls.count_documents(
        {"campaign_id": camp["id"], "status": {"$in": ["initiated", "ringing", "in-progress", "answered", "queued"]}})
    if in_flight >= MAX_CONCURRENT_PER_CAMPAIGN:
        return
    # 5) voice connection
    conn = await _s.db.voice_connections.find_one({"vendor_id": vid}, {"_id": 0})
    if not conn:
        await _s.db.campaign_out.update_one({"id": camp["id"]}, {"$set": {
            "status": "paused", "paused_reason": "no_number", "updated_at": _s.now_iso()}})
        return

    slots = min(MAX_CONCURRENT_PER_CAMPAIGN - in_flight, int(camp.get("daily_limit", 50)) - calls_today)
    now = _s.now_iso()
    placed = 0
    for _ in range(max(0, slots)):
        cp = await _s.db.campaign_prospects.find_one_and_update(
            {"campaign_id": camp["id"], "status": "pending",
             "$or": [{"next_attempt_at": None}, {"next_attempt_at": {"$lte": now}}]},
            {"$set": {"status": "claiming", "updated_at": now}},
            sort=[("created_at", 1)],
        )
        if not cp:
            break
        ok = await _place_call(camp, _clean(cp), conn)
        if ok:
            placed += 1
        else:
            # release claim
            await _s.db.campaign_prospects.update_one({"id": cp["id"]}, {"$set": {"status": "pending"}})
    if placed:
        await _s.db.campaign_out.update_one({"id": camp["id"]}, {"$inc": {"calls_today": placed}})

    # 6) completion check — no pending left AND nothing in flight
    remaining = await _s.db.campaign_prospects.count_documents(
        {"campaign_id": camp["id"], "status": {"$in": ["pending", "claiming", "calling"]}})
    still_flying = await _s.db.campaign_calls.count_documents(
        {"campaign_id": camp["id"], "status": {"$in": ["initiated", "ringing", "in-progress", "answered", "queued"]}})
    if remaining == 0 and still_flying == 0:
        await _s.db.campaign_out.update_one({"id": camp["id"]}, {"$set": {
            "status": "completed", "completed_at": _s.now_iso(), "updated_at": _s.now_iso()}})


async def _dialer_loop():
    _s.logger.info("[outbound] dialer loop started")
    while True:
        try:
            cur = _s.db.campaign_out.find({"status": "running"}, {"_id": 0}).limit(50)
            camps = await cur.to_list(50)
            for c in camps:
                try:
                    await _process_campaign(c)
                except Exception as e:
                    _s.logger.exception("[outbound] campaign %s error: %s", c.get("id"), e)
        except Exception as e:
            _s.logger.exception("[outbound] dialer tick error: %s", e)
        await asyncio.sleep(DIALER_TICK_SEC)


_DIALER_STARTED = False


async def start_outbound_dialer():
    global _DIALER_STARTED
    if _DIALER_STARTED:
        return
    _DIALER_STARTED = True
    try:
        await _s.db.campaign_out.create_index([("vendor_id", 1), ("created_at", -1)])
        await _s.db.campaign_out.create_index([("status", 1)])
        await _s.db.campaign_prospects.create_index([("campaign_id", 1), ("phone", 1)], unique=True)
        await _s.db.campaign_prospects.create_index([("campaign_id", 1), ("status", 1), ("next_attempt_at", 1)])
        await _s.db.campaign_calls.create_index([("campaign_id", 1), ("started_at", -1)])
        await _s.db.campaign_calls.create_index([("vendor_id", 1), ("started_at", -1)])
    except Exception as e:
        _s.logger.warning("[outbound] index warning: %s", e)
    asyncio.create_task(_dialer_loop())


# ------------------------------------------------------------ AI summary ---
LEAD_OUTCOMES = [
    "interested", "hot_lead", "warm_lead", "cold_lead", "callback_requested",
    "appointment_booked", "transferred", "existing_customer", "wrong_number",
    "do_not_call", "not_interested", "voicemail", "no_answer", "busy", "failed", "unknown",
]


async def _generate_call_summary(call_id: str):
    """Read the call transcript and produce a structured AI summary + refined
    lead outcome. Runs as a fire-and-forget task after an answered call."""
    await asyncio.sleep(4)  # allow final transcripts to flush
    if not _s.EMERGENT_LLM_KEY:
        return
    call = await _s.db.call_records.find_one({"id": call_id}, {"_id": 0})
    if not call or not call.get("conversation_id"):
        return
    msgs = await _s.db.messages.find(
        {"conversation_id": call["conversation_id"]}, {"_id": 0}).sort("created_at", 1).to_list(300)
    body = [m for m in msgs if (m.get("content") or "").strip()]
    if not body:
        return
    transcript = "\n".join(
        f"{'CUSTOMER' if m['role'] == 'user' else 'AGENT'}: {m['content']}" for m in body)
    system = (
        "You analyze an outbound sales phone call transcript between an AI AGENT and a CUSTOMER. "
        "Return STRICT JSON only (no markdown fences, no prose). Schema: "
        '{"summary": "<=280 char recap", "intent": "short phrase", '
        '"sentiment": "positive|neutral|negative", "key_questions": ["..."], '
        '"notes": "important notes", "next_action": "recommended next step", '
        '"confidence": 0-100 integer, '
        f'"outcome": one of {LEAD_OUTCOMES}, '
        '"entities": {"email": "", "business_name": "", "decision_maker": "", '
        '"preferred_callback_time": "", "appointment_date": ""}}. '
        "Choose the single best outcome. Use empty strings for unknown entities."
    )
    try:
        chat = _s.LlmChat(
            api_key=_s.EMERGENT_LLM_KEY, session_id=f"callsum-{call_id}", system_message=system,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        raw = (await asyncio.wait_for(chat.send_message(_s.UserMessage(text=transcript)), timeout=30) or "").strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.I | re.S).strip()
        data = json.loads(raw)
    except Exception as e:
        _s.logger.warning("[outbound] summary failed for %s: %s", call_id, e)
        return
    outcome = data.get("outcome") if data.get("outcome") in LEAD_OUTCOMES else "unknown"
    doc = {
        "call_id": call_id, "vendor_id": call["vendor_id"],
        "campaign_id": call.get("campaign_id"),
        "summary": data.get("summary", ""), "intent": data.get("intent", ""),
        "sentiment": data.get("sentiment", "neutral"),
        "key_questions": data.get("key_questions", []) or [],
        "notes": data.get("notes", ""), "next_action": data.get("next_action", ""),
        "confidence": int(data.get("confidence", 0) or 0),
        "outcome": outcome, "entities": data.get("entities", {}) or {},
        "created_at": _s.now_iso(),
    }
    await _s.db.call_ai_summaries.update_one({"call_id": call_id}, {"$set": doc}, upsert=True)
    # Refine outcome only for calls that were actually answered by a human.
    cc = await _s.db.campaign_calls.find_one(
        {"id": call_id}, {"_id": 0, "outcome": 1, "campaign_prospect_id": 1})
    if cc and cc.get("outcome") == "answered":
        await _s.db.campaign_calls.update_one(
            {"id": call_id}, {"$set": {"outcome": outcome, "ai_summary": doc}})
        if cc.get("campaign_prospect_id"):
            await _s.db.campaign_prospects.update_one(
                {"id": cc["campaign_prospect_id"]}, {"$set": {"outcome": outcome}})
