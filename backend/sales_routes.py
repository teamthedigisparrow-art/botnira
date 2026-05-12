"""BotNira — Sales Assistance (outbound email marketing) routes.

Plan gating: Growth & Pro paid plans only (Starter/trial blocked); exempt
vendors always allowed.

Design notes
------------
• One campaign = one subject + body (text/html), targets ALL active
  prospects in the vendor's list at creation time. Recipients are
  snapshotted into `sales_campaign_recipients` so subsequent uploads
  don't affect an in-flight campaign.
• Sender runs as a single asyncio loop (started on FastAPI startup).
  Every ~20s it finds 'sending' campaigns whose `next_send_at` is due
  and ships **one** email per campaign per tick — then schedules the
  next send 5–45 min in the future (random jitter).
  This keeps the vendor's domain warm and avoids spam-trap heuristics.
• Tracking: invisible 1×1 GIF pixel — first hit per (campaign, prospect)
  marks `opened_at`.
• Compliance: every email gets a `List-Unsubscribe` header + a visible
  one-click "Unsubscribe" link in the footer. Hits flip the prospect's
  `status` to `unsubscribed` so future campaigns skip them.
• Reuses the vendor's already-connected SMTP from the inbox `email`
  channel (Hostinger / Gmail / Outlook / custom). No second SMTP setup.
"""
import asyncio
import csv
import io
import random
import re
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Query
from fastapi.responses import Response, HTMLResponse
from pydantic import BaseModel, EmailStr, Field

import server as _s
from email_routes import _dec_password  # reuse the inbox SMTP password vault

router = APIRouter()

# ---------------------------------------------------------------- constants ---
SEND_DELAY_MIN_SEC = 5 * 60      # 5 minutes
SEND_DELAY_MAX_SEC = 45 * 60     # 45 minutes
SCHEDULER_TICK_SEC = 20          # how often the loop wakes
GIF_1X1 = bytes.fromhex("47494638396101000100800000ffffff00000021f90401000000002c00000000010001000002024401003b")

# A 1×1 transparent GIF response (no body, no caching) used as the open pixel.
_PIXEL_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}


# ---------------------------------------------------------------- helpers ---
def _public_base() -> str:
    return (_s.PUBLIC_BASE_URL or "").rstrip("/")


def _sales_enabled_for(vendor: Optional[dict]) -> Dict[str, Any]:
    """Decide whether a vendor can use Sales Assistance.
    Allowed: exempt OR (subscription_status=='active' AND plan in {growth, pro}).
    """
    if not vendor:
        return {"enabled": False, "plan_label": "none", "reason": "No vendor"}
    if vendor.get("is_exempt"):
        return {"enabled": True, "plan_label": "exempt", "reason": ""}
    sub = vendor.get("subscription_status")
    plan = (vendor.get("plan") or "").lower()
    if sub == "active" and plan in {"growth", "pro"}:
        return {"enabled": True, "plan_label": plan, "reason": ""}
    if sub == "trialing":
        return {"enabled": False, "plan_label": "trial",
                "reason": "Sales Assistant is a paid feature. Upgrade to Growth or Pro to unlock."}
    if sub == "active" and plan == "starter":
        return {"enabled": False, "plan_label": "starter",
                "reason": "Sales Assistant requires the Growth or Pro plan. Upgrade from Billing."}
    return {"enabled": False, "plan_label": plan or "none",
            "reason": "Subscribe to Growth or Pro to unlock Sales Assistant."}


async def _require_sales_vendor(user: dict = Depends(_s.require_vendor)) -> dict:
    vendor = await _s.db.vendors.find_one({"id": user["vendor_id"]}, {"_id": 0})
    gate = _sales_enabled_for(vendor)
    if not gate["enabled"]:
        raise HTTPException(status_code=403, detail=gate["reason"])
    return user


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _norm_email(s: str) -> str:
    return (s or "").strip().lower()


# Email of the BotNira-internal vendor that receives landing-page contact form
# submissions. We funnel every public inquiry into THIS vendor's "Main list".
_BOTNIRA_INTAKE_VENDOR_EMAIL = "kamal@thedigisparrow.com"


# ---------------------------------------------------------------- access ---
@router.get("/access")
async def sales_access(user: dict = Depends(_s.require_vendor)):
    vendor = await _s.db.vendors.find_one({"id": user["vendor_id"]}, {"_id": 0})
    return _sales_enabled_for(vendor)


# ---------------------------------------------------------------- lists ---
# A vendor can organise prospects into named lists. A prospect is
# *canonical* per (vendor_id, email) — the same email across lists is the
# SAME entity (field `list_ids: List[str]`). Campaigns may target one or
# more lists; recipients are deduped by prospect identity.

async def _ensure_default_list(vid: str) -> str:
    """Every vendor has at least one 'Main list' so prospects never live
    orphaned. Returns its id."""
    existing = await _s.db.sales_prospect_lists.find_one(
        {"vendor_id": vid}, {"_id": 0, "id": 1}, sort=[("created_at", 1)]
    )
    if existing:
        return existing["id"]
    lid = _s.new_id()
    await _s.db.sales_prospect_lists.insert_one({
        "id": lid, "vendor_id": vid, "name": "Main list", "description": "",
        "created_at": _s.now_iso(), "updated_at": _s.now_iso(),
    })
    # Fold any legacy prospect (pre-list era) into this list
    await _s.db.sales_prospects.update_many(
        {"vendor_id": vid, "list_ids": {"$exists": False}},
        {"$set": {"list_ids": [lid], "updated_at": _s.now_iso()}},
    )
    return lid


class ListIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    description: Optional[str] = Field("", max_length=300)


@router.get("/lists")
async def list_lists(user: dict = Depends(_require_sales_vendor)):
    vid = user["vendor_id"]
    await _ensure_default_list(vid)
    cur = _s.db.sales_prospect_lists.find({"vendor_id": vid}, {"_id": 0}).sort("created_at", 1)
    items = await cur.to_list(200)
    # Attach counts per list (single aggregate)
    pipeline = [
        {"$match": {"vendor_id": vid}},
        {"$unwind": "$list_ids"},
        {"$group": {"_id": {"list_id": "$list_ids", "status": "$status"}, "n": {"$sum": 1}}},
    ]
    agg = await _s.db.sales_prospects.aggregate(pipeline).to_list(5000)
    counts: Dict[str, Dict[str, int]] = {}
    for row in agg:
        lid = row["_id"]["list_id"]
        st = row["_id"]["status"] or "active"
        counts.setdefault(lid, {"active": 0, "unsubscribed": 0, "bounced": 0})
        if st in counts[lid]:
            counts[lid][st] += row["n"]
    for it in items:
        c = counts.get(it["id"], {"active": 0, "unsubscribed": 0, "bounced": 0})
        it["counts"] = c
        it["total"] = c["active"] + c["unsubscribed"] + c["bounced"]
    return {"items": items}


@router.post("/lists")
async def create_list(payload: ListIn, user: dict = Depends(_require_sales_vendor)):
    vid = user["vendor_id"]
    lid = _s.new_id()
    doc = {
        "id": lid, "vendor_id": vid,
        "name": payload.name.strip(),
        "description": (payload.description or "").strip(),
        "created_at": _s.now_iso(), "updated_at": _s.now_iso(),
    }
    await _s.db.sales_prospect_lists.insert_one(doc.copy())
    return {"list": doc}


@router.patch("/lists/{lid}")
async def update_list(lid: str, payload: ListIn, user: dict = Depends(_require_sales_vendor)):
    res = await _s.db.sales_prospect_lists.update_one(
        {"id": lid, "vendor_id": user["vendor_id"]},
        {"$set": {"name": payload.name.strip(),
                    "description": (payload.description or "").strip(),
                    "updated_at": _s.now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="List not found")
    return {"ok": True}


@router.delete("/lists/{lid}")
async def delete_list(lid: str, user: dict = Depends(_require_sales_vendor)):
    """Hard delete a list. Prospects that belong ONLY to this list are
    deleted as well; prospects that also belong to other lists stay (the
    list is simply removed from their memberships)."""
    vid = user["vendor_id"]
    target = await _s.db.sales_prospect_lists.find_one({"id": lid, "vendor_id": vid}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="List not found")

    # 1. Delete prospects whose ONLY membership is this list
    deleted_prospects = await _s.db.sales_prospects.delete_many(
        {"vendor_id": vid, "list_ids": [lid]}
    )
    # 2. Remove the list from prospects that have multiple memberships
    updated_prospects = await _s.db.sales_prospects.update_many(
        {"vendor_id": vid, "list_ids": lid},
        {"$pull": {"list_ids": lid}, "$set": {"updated_at": _s.now_iso()}},
    )
    # 3. Delete the list metadata
    await _s.db.sales_prospect_lists.delete_one({"id": lid, "vendor_id": vid})
    # 4. Guarantee at least one list exists for the vendor
    await _ensure_default_list(vid)
    return {
        "deleted": True,
        "prospects_deleted": deleted_prospects.deleted_count,
        "prospects_kept_in_other_lists": updated_prospects.modified_count,
    }


# ---------------------------------------------------------------- prospects ---
class ProspectIn(BaseModel):
    email: EmailStr
    name: Optional[str] = ""
    company: Optional[str] = ""
    list_id: Optional[str] = None


class ProspectPatch(BaseModel):
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    company: Optional[str] = None
    phone: Optional[str] = None


@router.get("/prospects")
async def list_prospects(
    user: dict = Depends(_require_sales_vendor),
    list_id: Optional[str] = None,
    q: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    vid = user["vendor_id"]
    await _ensure_default_list(vid)
    flt: Dict[str, Any] = {"vendor_id": vid}
    if list_id:
        flt["list_ids"] = list_id
    if status in ("active", "unsubscribed", "bounced"):
        flt["status"] = status
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        flt["$or"] = [{"email": rx}, {"name": rx}, {"company": rx}]
    total = await _s.db.sales_prospects.count_documents(flt)
    cur = _s.db.sales_prospects.find(flt, {"_id": 0}).sort("created_at", -1).skip(offset).limit(limit)
    items = await cur.to_list(limit)
    vendor_filter = {"vendor_id": vid}
    if list_id:
        vendor_filter["list_ids"] = list_id
    counts = {
        "active": await _s.db.sales_prospects.count_documents({**vendor_filter, "status": "active"}),
        "unsubscribed": await _s.db.sales_prospects.count_documents({**vendor_filter, "status": "unsubscribed"}),
        "bounced": await _s.db.sales_prospects.count_documents({**vendor_filter, "status": "bounced"}),
    }
    return {"items": items, "total": total, "limit": limit, "offset": offset, "counts": counts}


@router.post("/prospects")
async def add_prospect(p: ProspectIn, user: dict = Depends(_require_sales_vendor)):
    vid = user["vendor_id"]
    lid = p.list_id or await _ensure_default_list(vid)
    # Confirm list belongs to vendor
    target_list = await _s.db.sales_prospect_lists.find_one({"id": lid, "vendor_id": vid}, {"_id": 0, "id": 1})
    if not target_list:
        raise HTTPException(status_code=404, detail="List not found")

    em = _norm_email(p.email)
    if not _EMAIL_RE.match(em):
        raise HTTPException(status_code=400, detail="Invalid email")
    existing = await _s.db.sales_prospects.find_one({"vendor_id": vid, "email": em}, {"_id": 0})
    if existing:
        # Add to this list if not already a member
        if lid not in (existing.get("list_ids") or []):
            await _s.db.sales_prospects.update_one(
                {"id": existing["id"]},
                {"$addToSet": {"list_ids": lid}, "$set": {"updated_at": _s.now_iso()}},
            )
            existing["list_ids"] = list(set((existing.get("list_ids") or []) + [lid]))
        return {"prospect": existing, "duplicate": True}

    doc = {
        "id": _s.new_id(),
        "vendor_id": vid,
        "email": em,
        "name": (p.name or "").strip(),
        "company": (p.company or "").strip(),
        "list_ids": [lid],
        "status": "active",
        "source": "manual",
        "created_at": _s.now_iso(),
        "updated_at": _s.now_iso(),
    }
    await _s.db.sales_prospects.insert_one(doc.copy())
    return {"prospect": doc, "duplicate": False}


@router.patch("/prospects/{pid}")
async def update_prospect(pid: str, payload: ProspectPatch, user: dict = Depends(_require_sales_vendor)):
    vid = user["vendor_id"]
    current = await _s.db.sales_prospects.find_one({"id": pid, "vendor_id": vid}, {"_id": 0})
    if not current:
        raise HTTPException(status_code=404, detail="Prospect not found")
    updates: Dict[str, Any] = {"updated_at": _s.now_iso()}
    if payload.email is not None:
        new_em = _norm_email(payload.email)
        if not _EMAIL_RE.match(new_em):
            raise HTTPException(status_code=400, detail="Invalid email")
        if new_em != current["email"]:
            clash = await _s.db.sales_prospects.find_one(
                {"vendor_id": vid, "email": new_em, "id": {"$ne": pid}}, {"_id": 0, "id": 1}
            )
            if clash:
                raise HTTPException(status_code=409, detail=f"Another prospect already has {new_em}")
            updates["email"] = new_em
    if payload.name is not None:
        updates["name"] = payload.name.strip()
    if payload.company is not None:
        updates["company"] = payload.company.strip()
    if payload.phone is not None:
        updates["phone"] = payload.phone.strip()
    await _s.db.sales_prospects.update_one({"id": pid, "vendor_id": vid}, {"$set": updates})
    refreshed = await _s.db.sales_prospects.find_one({"id": pid, "vendor_id": vid}, {"_id": 0})
    return {"prospect": refreshed}


@router.delete("/prospects/{pid}")
async def delete_prospect(
    pid: str,
    user: dict = Depends(_require_sales_vendor),
    list_id: Optional[str] = None,
):
    """If `list_id` is provided, the prospect is only removed from THAT
    list — they remain reachable through any other lists they belong to.
    If the list_id was the prospect's only membership, the prospect is
    hard-deleted. Without list_id, the prospect is fully removed from
    every list."""
    vid = user["vendor_id"]
    current = await _s.db.sales_prospects.find_one({"id": pid, "vendor_id": vid}, {"_id": 0})
    if not current:
        raise HTTPException(status_code=404, detail="Prospect not found")
    if list_id:
        lists = current.get("list_ids") or []
        if list_id not in lists:
            raise HTTPException(status_code=400, detail="Prospect is not in that list")
        if len(lists) == 1:
            await _s.db.sales_prospects.delete_one({"id": pid, "vendor_id": vid})
            return {"deleted": True, "removed_from_list": True}
        await _s.db.sales_prospects.update_one(
            {"id": pid, "vendor_id": vid},
            {"$pull": {"list_ids": list_id}, "$set": {"updated_at": _s.now_iso()}},
        )
        return {"deleted": False, "removed_from_list": True}
    await _s.db.sales_prospects.delete_one({"id": pid, "vendor_id": vid})
    return {"deleted": True, "removed_from_list": False}


@router.post("/prospects/clear")
async def clear_prospects(
    user: dict = Depends(_require_sales_vendor),
    list_id: Optional[str] = None,
):
    """With `list_id`: clears prospects belonging ONLY to that list (and
    removes the list from prospects that also belong to other lists).
    Without `list_id`: deletes every prospect in the vendor workspace."""
    vid = user["vendor_id"]
    if list_id:
        deleted = await _s.db.sales_prospects.delete_many(
            {"vendor_id": vid, "list_ids": [list_id]}
        )
        await _s.db.sales_prospects.update_many(
            {"vendor_id": vid, "list_ids": list_id},
            {"$pull": {"list_ids": list_id}, "$set": {"updated_at": _s.now_iso()}},
        )
        return {"deleted": deleted.deleted_count, "scope": "list"}
    res = await _s.db.sales_prospects.delete_many({"vendor_id": vid})
    return {"deleted": res.deleted_count, "scope": "all"}


@router.post("/prospects/upload")
async def upload_prospects(
    file: UploadFile = File(...),
    list_id: Optional[str] = None,
    user: dict = Depends(_require_sales_vendor),
):
    """Accepts a CSV with a header row (`email, name, company` — case
    insensitive; extra columns ignored) and uploads prospects into the
    target `list_id`. If the list is omitted, the vendor's default
    'Main list' is used. If a prospect email already exists (same
    vendor), we simply add the list membership — no overwrite, no dupe.
    """
    vid = user["vendor_id"]
    lid = list_id or await _ensure_default_list(vid)
    target_list = await _s.db.sales_prospect_lists.find_one({"id": lid, "vendor_id": vid}, {"_id": 0, "id": 1})
    if not target_list:
        raise HTTPException(status_code=404, detail="List not found")

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1", errors="ignore")

    reader = csv.reader(io.StringIO(text))
    rows = [r for r in reader if any((c or "").strip() for c in r)]
    if not rows:
        raise HTTPException(status_code=400, detail="CSV has no rows")

    header = [h.strip().lower() for h in rows[0]]
    has_header = any(h in {"email", "e-mail", "email address"} for h in header)
    if has_header:
        idx_email = next((i for i, h in enumerate(header) if h in {"email", "e-mail", "email address"}), 0)
        idx_name = next((i for i, h in enumerate(header) if h in {"name", "full name", "first name"}), -1)
        idx_company = next((i for i, h in enumerate(header) if h in {"company", "organization", "business"}), -1)
        data_rows = rows[1:]
    else:
        idx_email, idx_name, idx_company = 0, 1, 2
        data_rows = rows

    # Pull all existing prospects for this vendor so we can merge (add list_id)
    existing_by_email: Dict[str, dict] = {}
    cur = _s.db.sales_prospects.find({"vendor_id": vid}, {"_id": 0, "id": 1, "email": 1, "list_ids": 1})
    async for d in cur:
        existing_by_email[d["email"]] = d

    inserted = 0
    merged_into_list = 0  # already-on-other-list prospects added to this list
    already_in_list = 0
    invalid = 0
    seen_in_file: set = set()
    docs_to_insert: List[dict] = []
    ids_to_add_list: List[str] = []

    for r in data_rows:
        if idx_email >= len(r):
            invalid += 1
            continue
        em = _norm_email(r[idx_email])
        if not _EMAIL_RE.match(em):
            invalid += 1
            continue
        if em in seen_in_file:
            continue
        seen_in_file.add(em)
        nm = r[idx_name].strip() if 0 <= idx_name < len(r) else ""
        co = r[idx_company].strip() if 0 <= idx_company < len(r) else ""
        existing = existing_by_email.get(em)
        if existing:
            lists = existing.get("list_ids") or []
            if lid in lists:
                already_in_list += 1
            else:
                ids_to_add_list.append(existing["id"])
                merged_into_list += 1
            continue
        docs_to_insert.append({
            "id": _s.new_id(),
            "vendor_id": vid,
            "email": em,
            "name": nm,
            "company": co,
            "list_ids": [lid],
            "status": "active",
            "source": "csv",
            "created_at": _s.now_iso(),
            "updated_at": _s.now_iso(),
        })
        inserted += 1

    if docs_to_insert:
        await _s.db.sales_prospects.insert_many([d.copy() for d in docs_to_insert])
    if ids_to_add_list:
        await _s.db.sales_prospects.update_many(
            {"id": {"$in": ids_to_add_list}, "vendor_id": vid},
            {"$addToSet": {"list_ids": lid}, "$set": {"updated_at": _s.now_iso()}},
        )

    return {
        "inserted": inserted,
        "duplicates_skipped": already_in_list,  # already in THIS list
        "merged_into_list": merged_into_list,   # existed elsewhere, added to this list
        "invalid_skipped": invalid,
        "total_in_file": len(data_rows),
    }


# ---------------------------------------------------------------- campaigns ---
class CampaignIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    subject: str = Field(..., min_length=1, max_length=240)
    body_type: str = Field("text", description="'text' or 'html'")
    body: str = Field(..., min_length=1)
    list_ids: List[str] = Field(default_factory=list,
                                 description="Target list IDs. Empty = all lists.")
    start_now: bool = True
    scheduled_at: Optional[str] = None  # ISO; only used if start_now=False


def _replace_merge_tags(s: str, prospect: dict) -> str:
    if not s:
        return s
    name = prospect.get("name") or ""
    first = (name.split() or [""])[0]
    return (
        s.replace("{{name}}", name)
         .replace("{{first_name}}", first)
         .replace("{{company}}", prospect.get("company") or "")
         .replace("{{email}}", prospect.get("email") or "")
    )


@router.post("/campaigns")
async def create_campaign(payload: CampaignIn, user: dict = Depends(_require_sales_vendor)):
    vid = user["vendor_id"]
    if payload.body_type not in ("text", "html"):
        raise HTTPException(status_code=400, detail="body_type must be 'text' or 'html'")

    # Vendor MUST have a connected SMTP — we reuse the inbox email connection
    conn = await _s.db.email_connections.find_one({"vendor_id": vid}, {"_id": 0})
    if not conn or not conn.get("enabled"):
        raise HTTPException(
            status_code=400,
            detail="Connect your email server in Channels → Email before launching a campaign.",
        )

    # Snapshot ACTIVE prospects from the selected list(s) (union, deduped
    # by prospect identity since each email is one entity per vendor).
    prospect_filter: Dict[str, Any] = {"vendor_id": vid, "status": "active"}
    # Dedupe incoming list_ids to protect the count check below.
    target_list_ids = list(dict.fromkeys(payload.list_ids or []))
    if target_list_ids:
        # Validate lists belong to vendor
        valid_lists = await _s.db.sales_prospect_lists.count_documents(
            {"vendor_id": vid, "id": {"$in": target_list_ids}}
        )
        if valid_lists != len(target_list_ids):
            raise HTTPException(status_code=400, detail="One or more selected lists don't exist")
        prospect_filter["list_ids"] = {"$in": target_list_ids}

    prospects: List[dict] = []
    cur = _s.db.sales_prospects.find(prospect_filter, {"_id": 0}).sort("created_at", 1)
    async for p in cur:
        prospects.append(p)
    if not prospects:
        raise HTTPException(
            status_code=400,
            detail="No active prospects in the selected list(s). Upload a CSV first.",
        )

    cid = _s.new_id()
    now = _s.now_iso()

    # Decide kickoff time
    if payload.start_now:
        next_send_at = now
        status = "sending"
        started_at = now
    else:
        if not payload.scheduled_at:
            raise HTTPException(status_code=400, detail="scheduled_at required when start_now=False")
        next_send_at = payload.scheduled_at
        status = "scheduled"
        started_at = None

    campaign = {
        "id": cid,
        "vendor_id": vid,
        "name": payload.name.strip(),
        "subject": payload.subject.strip(),
        "body_type": payload.body_type,
        "body": payload.body,
        "from_email": conn["email_address"],
        "list_ids": target_list_ids,
        "status": status,
        "total": len(prospects),
        "sent_count": 0,
        "opened_count": 0,
        "failed_count": 0,
        "unsubscribed_count": 0,
        "next_send_at": next_send_at,
        "started_at": started_at,
        "completed_at": None,
        "created_at": now,
        "updated_at": now,
    }
    await _s.db.sales_campaigns.insert_one(campaign.copy())

    # Roster docs — one per prospect, status=pending
    roster = [{
        "id": _s.new_id(),
        "campaign_id": cid,
        "vendor_id": vid,
        "prospect_id": p["id"],
        "email": p["email"],
        "name": p.get("name", ""),
        "company": p.get("company", ""),
        "status": "pending",
        "sent_at": None,
        "opened_at": None,
        "message_id": None,
        "error": None,
        "created_at": now,
    } for p in prospects]
    await _s.db.sales_campaign_recipients.insert_many([r.copy() for r in roster])

    return {"campaign": campaign}


@router.get("/campaigns")
async def list_campaigns(user: dict = Depends(_require_sales_vendor)):
    vid = user["vendor_id"]
    cur = _s.db.sales_campaigns.find({"vendor_id": vid}, {"_id": 0}).sort("created_at", -1).limit(200)
    return {"items": await cur.to_list(200)}


@router.get("/campaigns/{cid}")
async def get_campaign(cid: str, user: dict = Depends(_require_sales_vendor)):
    vid = user["vendor_id"]
    c = await _s.db.sales_campaigns.find_one({"id": cid, "vendor_id": vid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    recipients = await _s.db.sales_campaign_recipients.find(
        {"campaign_id": cid}, {"_id": 0}
    ).sort("sent_at", -1).limit(500).to_list(500)
    return {"campaign": c, "recipients": recipients}


@router.post("/campaigns/{cid}/pause")
async def pause_campaign(cid: str, user: dict = Depends(_require_sales_vendor)):
    res = await _s.db.sales_campaigns.update_one(
        {"id": cid, "vendor_id": user["vendor_id"], "status": {"$in": ["sending", "scheduled"]}},
        {"$set": {"status": "paused", "updated_at": _s.now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=400, detail="Campaign cannot be paused (already done?)")
    return {"ok": True}


@router.post("/campaigns/{cid}/resume")
async def resume_campaign(cid: str, user: dict = Depends(_require_sales_vendor)):
    # Reset next_send_at to now so the loop picks it up immediately
    res = await _s.db.sales_campaigns.update_one(
        {"id": cid, "vendor_id": user["vendor_id"], "status": "paused"},
        {"$set": {"status": "sending", "next_send_at": _s.now_iso(), "updated_at": _s.now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=400, detail="Campaign is not paused")
    return {"ok": True}


@router.post("/campaigns/{cid}/cancel")
async def cancel_campaign(cid: str, user: dict = Depends(_require_sales_vendor)):
    res = await _s.db.sales_campaigns.update_one(
        {"id": cid, "vendor_id": user["vendor_id"], "status": {"$nin": ["completed", "canceled"]}},
        {"$set": {"status": "canceled", "completed_at": _s.now_iso(), "updated_at": _s.now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=400, detail="Campaign cannot be canceled")
    return {"ok": True}


# ---------------------------------------------------------------- analytics ---
@router.get("/analytics")
async def sales_analytics(user: dict = Depends(_require_sales_vendor),
                          days: int = Query(30, ge=1, le=365)):
    vid = user["vendor_id"]
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    # Totals across all campaigns
    sent_total = await _s.db.sales_campaign_recipients.count_documents(
        {"vendor_id": vid, "status": {"$in": ["sent", "opened"]}})
    opened_total = await _s.db.sales_campaign_recipients.count_documents(
        {"vendor_id": vid, "opened_at": {"$ne": None}})
    failed_total = await _s.db.sales_campaign_recipients.count_documents(
        {"vendor_id": vid, "status": "failed"})
    unsub_total = await _s.db.sales_prospects.count_documents(
        {"vendor_id": vid, "status": "unsubscribed"})

    # Daily series — count sends/opens/failed/bounced per day
    by_day: Dict[str, Dict[str, int]] = {}
    cur_sent = _s.db.sales_campaign_recipients.find(
        {"vendor_id": vid, "sent_at": {"$gte": since},
         "status": {"$in": ["sent", "opened", "failed", "bounced"]}},
        {"_id": 0, "sent_at": 1, "opened_at": 1, "status": 1},
    )
    async for r in cur_sent:
        sa = (r.get("sent_at") or "")[:10]
        if not sa:
            continue
        slot = by_day.setdefault(sa, {"sent": 0, "opened": 0, "bounced": 0})
        if r.get("status") in ("sent", "opened"):
            slot["sent"] += 1
        if r.get("opened_at"):
            slot["opened"] += 1
        if r.get("status") == "bounced":
            slot["bounced"] += 1

    series = [{"date": d, **v} for d, v in sorted(by_day.items())]
    open_rate = round((opened_total / sent_total) * 100, 1) if sent_total else 0.0
    return {
        "totals": {
            "sent": sent_total,
            "opened": opened_total,
            "failed": failed_total,
            "open_rate_pct": open_rate,
            "unsubscribed": unsub_total,
        },
        "series": series,
        "days": days,
    }


# ---------------------------------------------------------------- tracking ---
@router.get("/track/open/{cid}/{rid}.gif")
async def track_open(cid: str, rid: str):
    """Public 1x1 GIF — flips opened_at on first hit. No auth."""
    rec = await _s.db.sales_campaign_recipients.find_one(
        {"id": rid, "campaign_id": cid}, {"_id": 0, "opened_at": 1, "vendor_id": 1}
    )
    if rec and not rec.get("opened_at"):
        now = _s.now_iso()
        await _s.db.sales_campaign_recipients.update_one(
            {"id": rid, "campaign_id": cid},
            {"$set": {"opened_at": now, "status": "opened"}},
        )
        await _s.db.sales_campaigns.update_one(
            {"id": cid}, {"$inc": {"opened_count": 1}, "$set": {"updated_at": now}}
        )
    return Response(content=GIF_1X1, media_type="image/gif", headers=_PIXEL_HEADERS)


@router.get("/unsubscribe/{vendor_id}/{prospect_id}")
async def unsubscribe_page(vendor_id: str, prospect_id: str):
    """Public confirmation page. Hitting it actually unsubscribes (single-click,
    CASL/CAN-SPAM friendly)."""
    res = await _s.db.sales_prospects.update_one(
        {"id": prospect_id, "vendor_id": vendor_id},
        {"$set": {"status": "unsubscribed", "updated_at": _s.now_iso()}},
    )
    ok = res.matched_count > 0
    body = (
        "<html><body style='font-family:sans-serif;text-align:center;padding:60px 20px;'>"
        "<h2>You're unsubscribed.</h2>"
        "<p>You will not receive any further marketing emails from this sender.</p>"
        "</body></html>"
        if ok else
        "<html><body style='font-family:sans-serif;text-align:center;padding:60px 20px;'>"
        "<h2>Link expired.</h2><p>This unsubscribe link is no longer valid.</p>"
        "</body></html>"
    )
    return HTMLResponse(content=body, status_code=200 if ok else 404)


# ------------------------------------------------- public landing inquiry ---
class InquiryIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    business_name: Optional[str] = Field("", max_length=160)
    email: EmailStr
    phone: Optional[str] = Field("", max_length=40)
    message: str = Field(..., min_length=1, max_length=4000)
    # Honeypot field — bots fill it, real humans never see it. Submissions
    # with anything in this field are silently dropped.
    website: Optional[str] = ""


@router.post("/inquiry")
async def submit_inquiry(payload: InquiryIn):
    """Public endpoint (no auth) hit by the landing-page Contact Us form.
    Every submission is funneled into BotNira's own internal Sales
    Assistant pipeline (the exempt account's 'Main list') so the team
    can run cold outreach against it later."""
    # Spam honeypot — bots almost always fill hidden fields
    if (payload.website or "").strip():
        _s.logger.info("[inquiry] honeypot triggered, dropping submission")
        return {"ok": True}  # lie politely so bots think they succeeded

    # Resolve the internal intake vendor via the `users` collection.
    # (The `vendors` collection stores the BUSINESS name; the login email
    # lives on `users`.)
    intake_user = await _s.db.users.find_one(
        {"email": _BOTNIRA_INTAKE_VENDOR_EMAIL}, {"_id": 0, "vendor_id": 1}
    )
    vid = (intake_user or {}).get("vendor_id")
    if not vid:
        _s.logger.error("[inquiry] intake user %s not found", _BOTNIRA_INTAKE_VENDOR_EMAIL)
        raise HTTPException(status_code=500, detail="Inquiry intake is unavailable. Please email us directly.")
    list_id = await _ensure_default_list(vid)
    em = _norm_email(payload.email)
    if not _EMAIL_RE.match(em):
        raise HTTPException(status_code=400, detail="Invalid email")

    now = _s.now_iso()
    # 1) Upsert the prospect (merge into Main list, dedupe by email)
    existing = await _s.db.sales_prospects.find_one(
        {"vendor_id": vid, "email": em}, {"_id": 0}
    )
    if existing:
        update: Dict[str, Any] = {"updated_at": now}
        if payload.name:
            update["name"] = payload.name.strip()
        if payload.business_name:
            update["company"] = payload.business_name.strip()
        if payload.phone:
            update["phone"] = payload.phone.strip()
        if payload.message:
            update["notes"] = payload.message.strip()
        if existing.get("status") != "active":
            update["status"] = "active"
        await _s.db.sales_prospects.update_one(
            {"id": existing["id"]},
            {"$set": update, "$addToSet": {"list_ids": list_id}},
        )
    else:
        await _s.db.sales_prospects.insert_one({
            "id": _s.new_id(),
            "vendor_id": vid,
            "email": em,
            "name": (payload.name or "").strip(),
            "company": (payload.business_name or "").strip(),
            "phone": (payload.phone or "").strip(),
            "notes": (payload.message or "").strip(),
            "list_ids": [list_id],
            "status": "active",
            "source": "landing_inquiry",
            "created_at": now,
            "updated_at": now,
        })

    # 2) Log the full inquiry (so multiple submissions don't overwrite)
    await _s.db.sales_inquiries.insert_one({
        "id": _s.new_id(),
        "vendor_id": vid,
        "email": em,
        "name": (payload.name or "").strip(),
        "business_name": (payload.business_name or "").strip(),
        "phone": (payload.phone or "").strip(),
        "message": (payload.message or "").strip(),
        "created_at": now,
    })

    _s.logger.info("[inquiry] new landing inquiry from %s (%s)", em, payload.name)
    return {"ok": True}


@router.get("/inquiries")
async def list_inquiries(user: dict = Depends(_require_sales_vendor),
                          limit: int = Query(200, ge=1, le=500)):
    """Auth'd endpoint — BotNira's internal team uses this to review every
    landing-page inquiry chronologically."""
    cur = _s.db.sales_inquiries.find(
        {"vendor_id": user["vendor_id"]}, {"_id": 0}
    ).sort("created_at", -1).limit(limit)
    items = await cur.to_list(limit)
    return {"items": items, "total": len(items)}


# ---------------------------------------------------------------- sender ---
def _wrap_html(body_html: str, unsubscribe_url: str, pixel_url: str) -> str:
    """Append a CASL-compliant unsubscribe footer + invisible tracking pixel.
    Footer is monochrome / minimal so it blends with the vendor's design."""
    footer = (
        '<div style="margin-top:32px;padding-top:14px;border-top:1px solid #e5e5e5;'
        'font:12px/1.5 Arial,sans-serif;color:#666;text-align:center;">'
        f'You received this because you were added to a contact list. '
        f'<a href="{unsubscribe_url}" style="color:#666;text-decoration:underline;">Unsubscribe</a>'
        '</div>'
        f'<img src="{pixel_url}" width="1" height="1" alt="" style="display:none;border:0;" />'
    )
    if "</body>" in body_html.lower():
        # Insert footer before closing body tag
        idx = body_html.lower().rfind("</body>")
        return body_html[:idx] + footer + body_html[idx:]
    return body_html + footer


def _wrap_text(body_text: str, unsubscribe_url: str) -> str:
    return (body_text or "") + (
        "\n\n———\nYou received this because you were added to a contact list.\n"
        f"Unsubscribe: {unsubscribe_url}\n"
    )


def _send_marketing_email_sync(conn: dict, recipient: dict, campaign: dict,
                               from_name: str, unsubscribe_url: str,
                               pixel_url: str) -> tuple[bool, Optional[str], Optional[str]]:
    """Returns (ok, message_id, error_str). Synchronous — call via to_thread."""
    pwd = _dec_password(conn["password_encrypted"])
    if not pwd:
        return False, None, "SMTP password missing"

    prospect = {
        "name": recipient.get("name") or "",
        "company": recipient.get("company") or "",
        "email": recipient["email"],
    }
    subject = _replace_merge_tags(campaign["subject"], prospect)
    body = _replace_merge_tags(campaign["body"], prospect)

    msg = EmailMessage()
    msg["From"] = formataddr((from_name or "BotNira", conn["email_address"]))
    msg["To"] = recipient["email"]
    msg["Subject"] = subject
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain=conn["email_address"].split("@", 1)[-1])
    msg["List-Unsubscribe"] = f"<{unsubscribe_url}>"
    msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
    msg["X-BotNira-Campaign"] = campaign["id"]

    if campaign["body_type"] == "html":
        # Plain-text fallback (strip tags very loosely)
        plain_fallback = re.sub(r"<[^>]+>", "", body)
        msg.set_content(_wrap_text(plain_fallback, unsubscribe_url))
        html_full = _wrap_html(body, unsubscribe_url, pixel_url)
        msg.add_alternative(html_full, subtype="html")
    else:
        # Text only — append plain unsubscribe + use a minimal HTML twin so the
        # tracking pixel still works (most clients render the html part).
        plain = _wrap_text(body, unsubscribe_url)
        msg.set_content(plain)
        html_twin = (
            f'<html><body style="font:14px/1.6 Arial,sans-serif;color:#222;'
            f'white-space:pre-wrap;">{body.replace("<", "&lt;").replace(">", "&gt;")}'
            f'</body></html>'
        )
        msg.add_alternative(_wrap_html(html_twin, unsubscribe_url, pixel_url), subtype="html")

    try:
        smtp_port = conn.get("smtp_port", 587)
        if smtp_port == 465:
            with smtplib.SMTP_SSL(conn["smtp_host"], smtp_port, timeout=25) as s:
                s.login(conn["email_address"], pwd)
                s.send_message(msg)
        else:
            with smtplib.SMTP(conn["smtp_host"], smtp_port, timeout=25) as s:
                s.starttls()
                s.login(conn["email_address"], pwd)
                s.send_message(msg)
        return True, msg["Message-ID"], None
    except smtplib.SMTPRecipientsRefused as e:
        return False, None, f"recipient-refused: {e}"
    except Exception as e:
        return False, None, str(e)[:300]


async def _process_one_campaign(camp: dict):
    """Send the next pending recipient for one campaign, then schedule the
    next slot. If all done, mark completed."""
    cid = camp["id"]
    vid = camp["vendor_id"]

    # Pull SMTP connection
    conn = await _s.db.email_connections.find_one({"vendor_id": vid}, {"_id": 0})
    if not conn or not conn.get("enabled"):
        await _s.db.sales_campaigns.update_one(
            {"id": cid},
            {"$set": {"status": "paused", "updated_at": _s.now_iso(),
                       "last_error": "Email server disconnected. Reconnect in Channels → Email."}},
        )
        return

    # Pick next pending recipient (FIFO)
    recipient = await _s.db.sales_campaign_recipients.find_one(
        {"campaign_id": cid, "status": "pending"}, {"_id": 0}, sort=[("created_at", 1)],
    )
    if not recipient:
        # Nothing pending — mark completed
        await _s.db.sales_campaigns.update_one(
            {"id": cid},
            {"$set": {"status": "completed", "completed_at": _s.now_iso(),
                       "next_send_at": None, "updated_at": _s.now_iso()}},
        )
        return

    # Skip if prospect has since unsubscribed/bounced
    prospect = await _s.db.sales_prospects.find_one(
        {"id": recipient["prospect_id"], "vendor_id": vid}, {"_id": 0, "status": 1}
    )
    if prospect and prospect.get("status") != "active":
        await _s.db.sales_campaign_recipients.update_one(
            {"id": recipient["id"]},
            {"$set": {"status": "skipped", "error": f"prospect {prospect.get('status')}",
                       "sent_at": _s.now_iso()}},
        )
        await _s.db.sales_campaigns.update_one(
            {"id": cid}, {"$set": {"next_send_at": _s.now_iso(), "updated_at": _s.now_iso()}}
        )
        return

    # Build tracking + unsubscribe URLs
    base = _public_base()
    unsub = f"{base}/api/sales/unsubscribe/{vid}/{recipient['prospect_id']}"
    pixel = f"{base}/api/sales/track/open/{cid}/{recipient['id']}.gif"

    # Use the vendor's business name as the visible "From" — customers
    # recognize the vendor, not BotNira.
    vendor = await _s.db.vendors.find_one({"id": vid}, {"_id": 0, "name": 1})
    from_name = (vendor or {}).get("name") or "BotNira"

    ok, mid, err = await asyncio.to_thread(
        _send_marketing_email_sync, conn, recipient, camp, from_name, unsub, pixel
    )

    now = _s.now_iso()
    if ok:
        await _s.db.sales_campaign_recipients.update_one(
            {"id": recipient["id"]},
            {"$set": {"status": "sent", "sent_at": now, "message_id": mid, "error": None}},
        )
        await _s.db.sales_campaigns.update_one(
            {"id": cid}, {"$inc": {"sent_count": 1}, "$set": {"last_send_at": now, "updated_at": now}}
        )
        # Treat hard recipient bounces as bounced for future campaigns
    else:
        is_bounce = err and ("recipient-refused" in err or "550" in err or "5.1.1" in err)
        await _s.db.sales_campaign_recipients.update_one(
            {"id": recipient["id"]},
            {"$set": {"status": "failed", "sent_at": now, "error": err}},
        )
        await _s.db.sales_campaigns.update_one(
            {"id": cid}, {"$inc": {"failed_count": 1}, "$set": {"last_send_at": now, "updated_at": now}}
        )
        if is_bounce:
            await _s.db.sales_prospects.update_one(
                {"id": recipient["prospect_id"], "vendor_id": vid},
                {"$set": {"status": "bounced", "updated_at": now}},
            )

    # Schedule next slot. If no more pending → mark complete on next tick.
    pending_left = await _s.db.sales_campaign_recipients.count_documents(
        {"campaign_id": cid, "status": "pending"}
    )
    if pending_left == 0:
        await _s.db.sales_campaigns.update_one(
            {"id": cid},
            {"$set": {"status": "completed", "completed_at": _s.now_iso(),
                       "next_send_at": None, "updated_at": _s.now_iso()}},
        )
    else:
        delay = random.randint(SEND_DELAY_MIN_SEC, SEND_DELAY_MAX_SEC)
        next_at = (datetime.now(timezone.utc) + timedelta(seconds=delay)).isoformat()
        await _s.db.sales_campaigns.update_one(
            {"id": cid}, {"$set": {"next_send_at": next_at, "updated_at": _s.now_iso()}}
        )


async def _sales_sender_loop():
    """Wakes every SCHEDULER_TICK_SEC and processes any campaign whose
    next_send_at has passed."""
    _s.logger.info("[sales] sender loop started")
    while True:
        try:
            now_iso = _s.now_iso()
            cur = _s.db.sales_campaigns.find(
                {"status": {"$in": ["sending", "scheduled"]},
                 "next_send_at": {"$lte": now_iso}},
                {"_id": 0},
            ).limit(50)
            campaigns = await cur.to_list(50)
            for c in campaigns:
                # If it was 'scheduled', flip to 'sending' on first tick
                if c.get("status") == "scheduled":
                    await _s.db.sales_campaigns.update_one(
                        {"id": c["id"]},
                        {"$set": {"status": "sending", "started_at": _s.now_iso(),
                                   "updated_at": _s.now_iso()}},
                    )
                    c["status"] = "sending"
                try:
                    await _process_one_campaign(c)
                except Exception as e:
                    _s.logger.exception("[sales] campaign %s failed: %s", c.get("id"), e)
        except Exception as e:
            _s.logger.exception("[sales] loop tick error: %s", e)
        await asyncio.sleep(SCHEDULER_TICK_SEC)


_SENDER_TASK_STARTED = False


async def _start_sales_sender():
    """FastAPI startup hook — fire-and-forget the loop. Module-level guard
    prevents a duplicate loop spawning when Uvicorn hot-reloads."""
    global _SENDER_TASK_STARTED
    if _SENDER_TASK_STARTED:
        return
    _SENDER_TASK_STARTED = True
    asyncio.create_task(_sales_sender_loop())
    # Ensure useful indexes
    try:
        await _s.db.sales_prospects.create_index([("vendor_id", 1), ("email", 1)], unique=True)
        await _s.db.sales_prospects.create_index([("vendor_id", 1), ("status", 1)])
        await _s.db.sales_prospects.create_index([("vendor_id", 1), ("list_ids", 1)])
        await _s.db.sales_prospect_lists.create_index([("vendor_id", 1), ("created_at", 1)])
        await _s.db.sales_campaigns.create_index([("vendor_id", 1), ("created_at", -1)])
        await _s.db.sales_campaigns.create_index([("status", 1), ("next_send_at", 1)])
        await _s.db.sales_campaign_recipients.create_index([("campaign_id", 1), ("status", 1)])
        await _s.db.sales_campaign_recipients.create_index([("vendor_id", 1), ("sent_at", -1)])
        await _s.db.sales_campaign_recipients.create_index([("vendor_id", 1), ("email", 1), ("sent_at", -1)])
        await _s.db.sales_inquiries.create_index([("vendor_id", 1), ("created_at", -1)])
    except Exception as e:
        _s.logger.warning("[sales] index create warning: %s", e)
    # One-time migration for pre-list prospects
    try:
        distinct_vendors = await _s.db.sales_prospects.distinct(
            "vendor_id", {"list_ids": {"$exists": False}}
        )
        for vid in distinct_vendors:
            await _ensure_default_list(vid)
        # Legacy campaigns predate multi-list — backfill empty list_ids so
        # the API always returns the field.
        await _s.db.sales_campaigns.update_many(
            {"list_ids": {"$exists": False}}, {"$set": {"list_ids": []}},
        )
    except Exception as e:
        _s.logger.warning("[sales] migration warning: %s", e)
