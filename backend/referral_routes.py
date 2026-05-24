"""BotNira Referral Program — vendors earn 15% recurring commission on every
referred customer's successful payment. Commissions accrue per invoice and are
finalized at the end of each month for automatic payout."""
from __future__ import annotations

import os
import re
import logging
import secrets
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

# We re-use the auth helpers, db handle and id generator from the main server
# module rather than duplicate state.
from server import db, require_vendor, require_admin, new_id, now_iso, slugify, logger  # type: ignore

router = APIRouter()
admin_router = APIRouter()

# 15% commission, recurring on every paid invoice from a referred vendor.
COMMISSION_RATE = 0.15


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class BankAccountReq(BaseModel):
    account_holder: str = Field(min_length=2, max_length=120)
    account_number: str = Field(min_length=4, max_length=64)
    bank_name: str = Field(min_length=2, max_length=120)
    swift_or_routing: str = Field(default="", max_length=64)
    iban: str = Field(default="", max_length=64)
    country: str = Field(min_length=2, max_length=64)
    address: str = Field(default="", max_length=400)


# ---------------------------------------------------------------------------
# Public helpers (imported by server.py)
# ---------------------------------------------------------------------------
def _slug_base(name: str) -> str:
    """Lowercase, hyphenated, alphanumeric-only base for the referral code."""
    base = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")
    return (base or "vendor")[:32]


async def ensure_referral_code(vendor_id: str, vendor_name: str) -> str:
    """Idempotent. Returns the vendor's unique referral code, creating one if
    missing. Code format: <slug>-<6 char token>, e.g. `acme-dental-x7k2a9`."""
    existing = await db.referral_codes.find_one({"vendor_id": vendor_id}, {"_id": 0})
    if existing:
        return existing["code"]
    # Generate a unique code. Re-roll the token if a (very unlikely) collision
    # is detected so we never duplicate codes across vendors.
    base = _slug_base(vendor_name)
    for _ in range(8):
        token = secrets.token_hex(3)  # 6 hex chars
        code = f"{base}-{token}"
        clash = await db.referral_codes.find_one({"code": code}, {"_id": 0})
        if not clash:
            await db.referral_codes.insert_one({
                "id": new_id(),
                "vendor_id": vendor_id,
                "code": code,
                "created_at": now_iso(),
            })
            return code
    # Fallback: pure random
    code = f"{base}-{secrets.token_hex(6)}"
    await db.referral_codes.insert_one({
        "id": new_id(), "vendor_id": vendor_id, "code": code,
        "created_at": now_iso(),
    })
    return code


async def resolve_referrer_by_code(code: str) -> Optional[str]:
    """Returns the referrer vendor_id for a given code, or None."""
    if not code:
        return None
    doc = await db.referral_codes.find_one({"code": code.strip().lower()}, {"_id": 0})
    return doc.get("vendor_id") if doc else None


async def attach_referral_on_signup(
    new_vendor_id: str,
    new_vendor_email: str,
    referral_code: Optional[str],
    signup_ip: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Called from signup(): records the new vendor as referred when a valid
    code is supplied. Self-referral (same email / IP / vendor) is blocked."""
    if not referral_code:
        return None
    referrer_vid = await resolve_referrer_by_code(referral_code)
    if not referrer_vid:
        return None
    if referrer_vid == new_vendor_id:
        return None  # cannot refer self (same vendor id — defensive)

    # Check referrer's email / IP. Block obvious self-referrals so an account
    # holder can't pay themselves a 15% kickback by using their own link.
    ref_user = await db.users.find_one(
        {"vendor_id": referrer_vid, "role": "vendor"}, {"_id": 0, "email": 1, "signup_ip": 1}
    )
    if ref_user:
        if (ref_user.get("email") or "").lower() == (new_vendor_email or "").lower():
            return None
        if signup_ip and ref_user.get("signup_ip") and ref_user["signup_ip"] == signup_ip:
            return None

    # Insert the immutable referral record
    rec = {
        "id": new_id(),
        "referrer_vendor_id": referrer_vid,
        "referred_vendor_id": new_vendor_id,
        "code_used": referral_code.strip().lower(),
        "status": "active",  # active | cancelled
        "signup_at": now_iso(),
    }
    await db.referrals.insert_one(rec)
    await db.vendors.update_one(
        {"id": new_vendor_id},
        {"$set": {
            "referred_by_vendor_id": referrer_vid,
            "referred_by_code": referral_code.strip().lower(),
        }},
    )
    return rec


async def record_commission_for_invoice(
    referred_vendor_id: str,
    invoice_id: str,
    payment_amount_usd: float,
    paid_at_iso: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Called from Stripe `invoice.paid` webhook. Idempotent (keyed on
    stripe_invoice_id)."""
    if payment_amount_usd <= 0:
        return None
    ref = await db.referrals.find_one(
        {"referred_vendor_id": referred_vendor_id, "status": "active"},
        {"_id": 0},
    )
    if not ref:
        return None
    # Dedup on the invoice id so retries don't double-credit.
    if invoice_id:
        existing = await db.referral_commissions.find_one(
            {"stripe_invoice_id": invoice_id}, {"_id": 0}
        )
        if existing:
            return existing

    paid_at = paid_at_iso or now_iso()
    try:
        paid_dt = datetime.fromisoformat(paid_at.replace("Z", "+00:00"))
    except Exception:
        paid_dt = datetime.now(timezone.utc)
    commission_month = paid_dt.strftime("%Y-%m")
    commission_amount = round(payment_amount_usd * COMMISSION_RATE, 2)
    doc = {
        "id": new_id(),
        "referrer_vendor_id": ref["referrer_vendor_id"],
        "referred_vendor_id": referred_vendor_id,
        "stripe_invoice_id": invoice_id or "",
        "payment_amount_usd": round(float(payment_amount_usd), 2),
        "commission_amount_usd": commission_amount,
        "commission_rate": COMMISSION_RATE,
        "commission_month": commission_month,
        # Accrued during the month; finalized + paid out at month-end.
        "status": "accrued",  # accrued | paid | reversed
        "paid_at": paid_at,
        "created_at": now_iso(),
    }
    await db.referral_commissions.insert_one(doc)
    return doc


async def mark_referral_cancelled(referred_vendor_id: str) -> None:
    """Called from `customer.subscription.deleted`. Future commissions stop;
    historical ones are preserved."""
    await db.referrals.update_one(
        {"referred_vendor_id": referred_vendor_id, "status": "active"},
        {"$set": {"status": "cancelled", "cancelled_at": now_iso()}},
    )


# ---------------------------------------------------------------------------
# Helpers used by /me + dashboard endpoints
# ---------------------------------------------------------------------------
def _public_base_url() -> str:
    return (os.environ.get("PUBLIC_BASE_URL") or "").rstrip("/")


def _build_referral_link(code: str) -> str:
    base = _public_base_url() or "https://botnira.com"
    return f"{base}/r/{code}"


async def _summary_for_vendor(vendor_id: str) -> Dict[str, Any]:
    """Aggregate dashboard counters: total customers, active customers,
    lifetime earnings, current-month accrued, last-month paid."""
    total_customers = await db.referrals.count_documents({"referrer_vendor_id": vendor_id})
    active_customers = await db.referrals.count_documents(
        {"referrer_vendor_id": vendor_id, "status": "active"}
    )
    pipeline_total = [
        {"$match": {"referrer_vendor_id": vendor_id}},
        {"$group": {"_id": None, "total": {"$sum": "$commission_amount_usd"}}},
    ]
    pipeline_paid = [
        {"$match": {"referrer_vendor_id": vendor_id, "status": "paid"}},
        {"$group": {"_id": None, "total": {"$sum": "$commission_amount_usd"}}},
    ]
    pipeline_pending = [
        {"$match": {"referrer_vendor_id": vendor_id, "status": "accrued"}},
        {"$group": {"_id": None, "total": {"$sum": "$commission_amount_usd"}}},
    ]
    cur_month = datetime.now(timezone.utc).strftime("%Y-%m")
    pipeline_this_month = [
        {"$match": {"referrer_vendor_id": vendor_id, "commission_month": cur_month}},
        {"$group": {"_id": None, "total": {"$sum": "$commission_amount_usd"}}},
    ]

    async def _sum(pipe):
        agg = await db.referral_commissions.aggregate(pipe).to_list(1)
        return float(agg[0]["total"]) if agg else 0.0

    return {
        "total_customers": total_customers,
        "active_customers": active_customers,
        "lifetime_earnings_usd": round(await _sum(pipeline_total), 2),
        "paid_earnings_usd": round(await _sum(pipeline_paid), 2),
        "pending_earnings_usd": round(await _sum(pipeline_pending), 2),
        "this_month_earnings_usd": round(await _sum(pipeline_this_month), 2),
        "commission_rate_percent": int(COMMISSION_RATE * 100),
    }


# ---------------------------------------------------------------------------
# Endpoints  (mounted at /api/referrals/*)
# ---------------------------------------------------------------------------
@router.get("/me")
async def my_referral(user: dict = Depends(require_vendor)):
    """Returns the vendor's referral link + headline stats. Accessible even
    when the trial paywall is active — referrals is a side-income module."""
    vendor = await db.vendors.find_one({"id": user["vendor_id"]}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    code = await ensure_referral_code(vendor["id"], vendor.get("name", "vendor"))
    summary = await _summary_for_vendor(vendor["id"])
    bank = await db.referral_bank_accounts.find_one({"vendor_id": vendor["id"]}, {"_id": 0})
    return {
        "code": code,
        "referral_link": _build_referral_link(code),
        "summary": summary,
        "bank_account_on_file": bool(bank),
        "currency": "USD",
    }


@router.get("/customers")
async def my_referred_customers(user: dict = Depends(require_vendor)):
    """List of vendors that signed up using my referral link."""
    rows = await db.referrals.find(
        {"referrer_vendor_id": user["vendor_id"]}, {"_id": 0}
    ).sort("signup_at", -1).to_list(500)
    enriched = []
    for r in rows:
        v = await db.vendors.find_one({"id": r["referred_vendor_id"]}, {"_id": 0}) or {}
        u = await db.users.find_one(
            {"vendor_id": r["referred_vendor_id"], "role": "vendor"},
            {"_id": 0, "email": 1, "full_name": 1},
        ) or {}
        # Commission earned to-date from this customer
        agg = await db.referral_commissions.aggregate([
            {"$match": {
                "referrer_vendor_id": user["vendor_id"],
                "referred_vendor_id": r["referred_vendor_id"],
            }},
            {"$group": {"_id": None, "total": {"$sum": "$commission_amount_usd"}}},
        ]).to_list(1)
        earned = float(agg[0]["total"]) if agg else 0.0
        enriched.append({
            "referral_id": r["id"],
            "referred_vendor_id": r["referred_vendor_id"],
            "business_name": v.get("name", ""),
            "contact_email": u.get("email", ""),
            "contact_name": u.get("full_name", ""),
            "plan": v.get("plan", "trial"),
            "subscription_status": v.get("subscription_status", "trialing"),
            "signup_at": r.get("signup_at"),
            "status": r.get("status", "active"),
            "earned_usd": round(earned, 2),
        })
    return {"customers": enriched}


@router.get("/commissions")
async def my_commissions(user: dict = Depends(require_vendor)):
    """Returns flat commission rows + a month-by-month rollup so the vendor
    can see exactly which month produced which earnings."""
    rows = await db.referral_commissions.find(
        {"referrer_vendor_id": user["vendor_id"]}, {"_id": 0}
    ).sort("paid_at", -1).to_list(1000)

    # Resolve referred business names once
    referred_ids = {r["referred_vendor_id"] for r in rows}
    name_map: Dict[str, str] = {}
    if referred_ids:
        async for v in db.vendors.find({"id": {"$in": list(referred_ids)}}, {"_id": 0, "id": 1, "name": 1}):
            name_map[v["id"]] = v.get("name", "")

    flat = [{
        "id": r["id"],
        "referred_vendor_id": r["referred_vendor_id"],
        "business_name": name_map.get(r["referred_vendor_id"], ""),
        "payment_amount_usd": r.get("payment_amount_usd", 0.0),
        "commission_amount_usd": r.get("commission_amount_usd", 0.0),
        "commission_month": r.get("commission_month"),
        "status": r.get("status", "accrued"),
        "paid_at": r.get("paid_at"),
        "stripe_invoice_id": r.get("stripe_invoice_id", ""),
    } for r in rows]

    # Monthly rollup
    monthly: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        m = r.get("commission_month") or "unknown"
        bucket = monthly.setdefault(m, {
            "month": m, "gross_payments_usd": 0.0,
            "commission_usd": 0.0, "invoices": 0,
            "paid_usd": 0.0, "accrued_usd": 0.0,
        })
        bucket["gross_payments_usd"] += float(r.get("payment_amount_usd", 0))
        bucket["commission_usd"] += float(r.get("commission_amount_usd", 0))
        bucket["invoices"] += 1
        if r.get("status") == "paid":
            bucket["paid_usd"] += float(r.get("commission_amount_usd", 0))
        else:
            bucket["accrued_usd"] += float(r.get("commission_amount_usd", 0))
    monthly_list = sorted(monthly.values(), key=lambda x: x["month"], reverse=True)
    for m in monthly_list:
        for k in ("gross_payments_usd", "commission_usd", "paid_usd", "accrued_usd"):
            m[k] = round(m[k], 2)
    return {"commissions": flat, "monthly": monthly_list}


@router.get("/payouts")
async def my_payouts(user: dict = Depends(require_vendor)):
    """Past payouts (wires) sent to the vendor. Created by admin in the
    upcoming admin-side referral module — for now we expose the read endpoint
    so the dashboard renders an empty 'no payouts yet' state cleanly."""
    rows = await db.referral_payouts.find(
        {"vendor_id": user["vendor_id"]}, {"_id": 0}
    ).sort("paid_at", -1).to_list(500)
    return {"payouts": rows}


@router.get("/bank-account")
async def get_bank_account(user: dict = Depends(require_vendor)):
    bank = await db.referral_bank_accounts.find_one(
        {"vendor_id": user["vendor_id"]}, {"_id": 0}
    )
    return {"bank_account": bank or None}


@router.post("/bank-account")
async def save_bank_account(req: BankAccountReq, user: dict = Depends(require_vendor)):
    """Upsert the vendor's payout bank details. Payments are wired in USD."""
    payload = req.model_dump()
    payload.update({
        "vendor_id": user["vendor_id"],
        "currency": "USD",
        "updated_at": now_iso(),
    })
    existing = await db.referral_bank_accounts.find_one(
        {"vendor_id": user["vendor_id"]}, {"_id": 0}
    )
    if existing:
        await db.referral_bank_accounts.update_one(
            {"vendor_id": user["vendor_id"]}, {"$set": payload}
        )
    else:
        payload["id"] = new_id()
        payload["created_at"] = now_iso()
        await db.referral_bank_accounts.insert_one(payload)
    return {"ok": True, "bank_account": {**payload, "_id": None}}


@router.get("/public/resolve/{code}")
async def public_resolve(code: str):
    """Public — used by the /r/:code redirect page and Signup ref form to
    confirm a code is valid and surface the referring business's name."""
    code_clean = (code or "").strip().lower()
    rec = await db.referral_codes.find_one({"code": code_clean}, {"_id": 0})
    if not rec:
        return {"valid": False}
    vendor = await db.vendors.find_one({"id": rec["vendor_id"]}, {"_id": 0, "name": 1})
    return {
        "valid": True,
        "code": code_clean,
        "referrer_business_name": (vendor or {}).get("name", ""),
    }



# ===========================================================================
# Admin endpoints — mounted at /api/admin/referrals/*
# ===========================================================================
class PayoutMarkPaidReq(BaseModel):
    vendor_id: str
    month: str = Field(min_length=7, max_length=7)  # YYYY-MM
    amount_usd: float = Field(gt=0)
    payout_method: str = Field(default="Wire (USD)", max_length=64)
    reference: str = Field(default="", max_length=120)
    note: str = Field(default="", max_length=400)


async def _vendor_lookup_map(vendor_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """Fetch vendor docs + their owning user's email in one shot."""
    if not vendor_ids:
        return {}
    out: Dict[str, Dict[str, Any]] = {}
    async for v in db.vendors.find({"id": {"$in": vendor_ids}}, {"_id": 0}):
        out[v["id"]] = {"vendor": v, "email": "", "full_name": ""}
    async for u in db.users.find(
        {"vendor_id": {"$in": vendor_ids}, "role": "vendor"},
        {"_id": 0, "vendor_id": 1, "email": 1, "full_name": 1},
    ):
        if u["vendor_id"] in out:
            out[u["vendor_id"]]["email"] = u.get("email", "")
            out[u["vendor_id"]]["full_name"] = u.get("full_name", "")
    return out


@admin_router.get("/overview")
async def admin_referral_overview(user: dict = Depends(require_admin)):
    """Returns global summary + every vendor who has ever referred at least
    one customer. Vendors with zero referrals are excluded — admin only cares
    about the ones who actually earn."""
    # Build the unique set of referrer_vendor_ids from referrals + commissions.
    referrer_ids: set[str] = set()
    async for r in db.referrals.find({}, {"_id": 0, "referrer_vendor_id": 1}):
        referrer_ids.add(r["referrer_vendor_id"])
    async for c in db.referral_commissions.find({}, {"_id": 0, "referrer_vendor_id": 1}):
        referrer_ids.add(c["referrer_vendor_id"])

    vendors_map = await _vendor_lookup_map(list(referrer_ids))

    # Aggregate per-referrer totals
    rows: List[Dict[str, Any]] = []
    g_pending = 0.0
    g_paid = 0.0
    g_lifetime = 0.0
    g_customers = 0
    g_active_customers = 0

    for vid in referrer_ids:
        total_customers = await db.referrals.count_documents({"referrer_vendor_id": vid})
        active_customers = await db.referrals.count_documents(
            {"referrer_vendor_id": vid, "status": "active"}
        )

        async def _sum(match):
            agg = await db.referral_commissions.aggregate([
                {"$match": match},
                {"$group": {"_id": None, "total": {"$sum": "$commission_amount_usd"}}},
            ]).to_list(1)
            return float(agg[0]["total"]) if agg else 0.0

        lifetime = await _sum({"referrer_vendor_id": vid})
        paid = await _sum({"referrer_vendor_id": vid, "status": "paid"})
        pending = await _sum({"referrer_vendor_id": vid, "status": "accrued"})

        # Last payout (any)
        last_payout = await db.referral_payouts.find_one(
            {"vendor_id": vid}, {"_id": 0}, sort=[("paid_at", -1)]
        )
        # Bank on file?
        bank = await db.referral_bank_accounts.find_one(
            {"vendor_id": vid}, {"_id": 0, "id": 1}
        )
        rcode = await db.referral_codes.find_one({"vendor_id": vid}, {"_id": 0, "code": 1})

        info = vendors_map.get(vid) or {}
        rows.append({
            "vendor_id": vid,
            "business_name": (info.get("vendor") or {}).get("name", ""),
            "contact_email": info.get("email", ""),
            "contact_name": info.get("full_name", ""),
            "referral_code": (rcode or {}).get("code", ""),
            "total_customers": total_customers,
            "active_customers": active_customers,
            "lifetime_usd": round(lifetime, 2),
            "paid_usd": round(paid, 2),
            "pending_usd": round(pending, 2),
            "bank_on_file": bool(bank),
            "last_payout_at": (last_payout or {}).get("paid_at"),
        })

        g_customers += total_customers
        g_active_customers += active_customers
        g_lifetime += lifetime
        g_paid += paid
        g_pending += pending

    # Sort: vendors with pending payouts first, then by lifetime desc.
    rows.sort(key=lambda r: (-r["pending_usd"], -r["lifetime_usd"]))

    return {
        "summary": {
            "total_referrers": len(referrer_ids),
            "total_referred_customers": g_customers,
            "total_active_referred_customers": g_active_customers,
            "global_pending_usd": round(g_pending, 2),
            "global_paid_usd": round(g_paid, 2),
            "global_lifetime_usd": round(g_lifetime, 2),
            "commission_rate_percent": int(COMMISSION_RATE * 100),
        },
        "referrers": rows,
    }


@admin_router.get("/vendor/{vendor_id}")
async def admin_referral_vendor(vendor_id: str, user: dict = Depends(require_admin)):
    """Drill-down: everything we know about a single referrer — month-wise
    commission breakdown, every referred customer, every commission row, every
    payout sent, plus their bank details so admin can wire from one screen."""
    vendor = await db.vendors.find_one({"id": vendor_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    owner = await db.users.find_one(
        {"vendor_id": vendor_id, "role": "vendor"},
        {"_id": 0, "email": 1, "full_name": 1, "created_at": 1},
    ) or {}
    code_doc = await db.referral_codes.find_one({"vendor_id": vendor_id}, {"_id": 0})
    bank = await db.referral_bank_accounts.find_one({"vendor_id": vendor_id}, {"_id": 0})
    summary = await _summary_for_vendor(vendor_id)

    # Customers
    customers_raw = await db.referrals.find(
        {"referrer_vendor_id": vendor_id}, {"_id": 0}
    ).sort("signup_at", -1).to_list(1000)
    referred_ids = [c["referred_vendor_id"] for c in customers_raw]
    ref_vendors = await _vendor_lookup_map(referred_ids)
    customers = []
    for c in customers_raw:
        rv = ref_vendors.get(c["referred_vendor_id"]) or {}
        agg = await db.referral_commissions.aggregate([
            {"$match": {
                "referrer_vendor_id": vendor_id,
                "referred_vendor_id": c["referred_vendor_id"],
            }},
            {"$group": {"_id": None, "total": {"$sum": "$commission_amount_usd"}}},
        ]).to_list(1)
        earned = float(agg[0]["total"]) if agg else 0.0
        customers.append({
            "referral_id": c["id"],
            "referred_vendor_id": c["referred_vendor_id"],
            "business_name": (rv.get("vendor") or {}).get("name", ""),
            "contact_email": rv.get("email", ""),
            "plan": (rv.get("vendor") or {}).get("plan", ""),
            "subscription_status": (rv.get("vendor") or {}).get("subscription_status", ""),
            "signup_at": c.get("signup_at"),
            "status": c.get("status", "active"),
            "earned_usd": round(earned, 2),
        })

    # All commissions
    rows = await db.referral_commissions.find(
        {"referrer_vendor_id": vendor_id}, {"_id": 0}
    ).sort("paid_at", -1).to_list(2000)
    name_map = {rid: (ref_vendors.get(rid, {}).get("vendor") or {}).get("name", "")
                for rid in referred_ids}
    commissions = [{
        "id": r["id"],
        "referred_vendor_id": r["referred_vendor_id"],
        "business_name": name_map.get(r["referred_vendor_id"], ""),
        "payment_amount_usd": r.get("payment_amount_usd", 0.0),
        "commission_amount_usd": r.get("commission_amount_usd", 0.0),
        "commission_month": r.get("commission_month"),
        "status": r.get("status", "accrued"),
        "paid_at": r.get("paid_at"),
        "stripe_invoice_id": r.get("stripe_invoice_id", ""),
        "payout_id": r.get("payout_id", ""),
    } for r in rows]

    # Monthly rollup with breakdown of paid vs pending
    monthly: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        m = r.get("commission_month") or "unknown"
        bucket = monthly.setdefault(m, {
            "month": m, "invoices": 0,
            "gross_payments_usd": 0.0, "commission_usd": 0.0,
            "paid_usd": 0.0, "accrued_usd": 0.0,
        })
        bucket["invoices"] += 1
        bucket["gross_payments_usd"] += float(r.get("payment_amount_usd", 0))
        bucket["commission_usd"] += float(r.get("commission_amount_usd", 0))
        if r.get("status") == "paid":
            bucket["paid_usd"] += float(r.get("commission_amount_usd", 0))
        else:
            bucket["accrued_usd"] += float(r.get("commission_amount_usd", 0))
    monthly_list = sorted(monthly.values(), key=lambda x: x["month"], reverse=True)
    for m in monthly_list:
        for k in ("gross_payments_usd", "commission_usd", "paid_usd", "accrued_usd"):
            m[k] = round(m[k], 2)

    # Payouts already sent
    payouts = await db.referral_payouts.find(
        {"vendor_id": vendor_id}, {"_id": 0}
    ).sort("paid_at", -1).to_list(500)

    return {
        "vendor": {
            "id": vendor["id"],
            "name": vendor.get("name", ""),
            "plan": vendor.get("plan"),
            "subscription_status": vendor.get("subscription_status"),
            "created_at": vendor.get("created_at"),
        },
        "owner": owner,
        "referral_code": (code_doc or {}).get("code", ""),
        "bank_account": bank,
        "summary": summary,
        "customers": customers,
        "monthly": monthly_list,
        "commissions": commissions,
        "payouts": payouts,
    }


@admin_router.get("/payouts/pending")
async def admin_pending_payouts(user: dict = Depends(require_admin)):
    """Payout queue grouped by (vendor, month). Each row is one wire admin
    needs to send. Skips rows where the vendor has no bank account on file
    (still surfaces them with bank_on_file=false so admin can chase them)."""
    pipeline = [
        {"$match": {"status": "accrued"}},
        {"$group": {
            "_id": {"vendor_id": "$referrer_vendor_id", "month": "$commission_month"},
            "amount_usd": {"$sum": "$commission_amount_usd"},
            "commission_count": {"$sum": 1},
            "oldest_paid_at": {"$min": "$paid_at"},
            "latest_paid_at": {"$max": "$paid_at"},
        }},
    ]
    rows: List[Dict[str, Any]] = []
    vendor_ids: set[str] = set()
    async for r in db.referral_commissions.aggregate(pipeline):
        vendor_ids.add(r["_id"]["vendor_id"])
        rows.append(r)

    vmap = await _vendor_lookup_map(list(vendor_ids))
    banks: Dict[str, Dict[str, Any]] = {}
    async for b in db.referral_bank_accounts.find(
        {"vendor_id": {"$in": list(vendor_ids)}}, {"_id": 0}
    ):
        banks[b["vendor_id"]] = b

    pending: List[Dict[str, Any]] = []
    total = 0.0
    for r in rows:
        vid = r["_id"]["vendor_id"]
        info = vmap.get(vid) or {}
        bank = banks.get(vid)
        pending.append({
            "vendor_id": vid,
            "month": r["_id"]["month"],
            "business_name": (info.get("vendor") or {}).get("name", ""),
            "contact_email": info.get("email", ""),
            "amount_usd": round(float(r["amount_usd"]), 2),
            "commission_count": r["commission_count"],
            "oldest_paid_at": r.get("oldest_paid_at"),
            "latest_paid_at": r.get("latest_paid_at"),
            "bank_on_file": bool(bank),
            "bank_account": bank,
        })
        total += float(r["amount_usd"])

    # Group by month asc → oldest months first (those should be paid first).
    pending.sort(key=lambda x: (x["month"] or "", -x["amount_usd"]))
    return {"pending": pending, "total_pending_usd": round(total, 2)}


@admin_router.post("/payouts")
async def admin_record_payout(req: PayoutMarkPaidReq, user: dict = Depends(require_admin)):
    """Mark all accrued commissions for (vendor, month) as paid and record a
    payout row. Idempotent: if no accrued rows match, the API errors out so
    admin doesn't accidentally double-pay."""
    vendor = await db.vendors.find_one({"id": req.vendor_id}, {"_id": 0, "name": 1})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    accrued_rows = await db.referral_commissions.find(
        {"referrer_vendor_id": req.vendor_id, "commission_month": req.month, "status": "accrued"},
        {"_id": 0},
    ).to_list(2000)
    if not accrued_rows:
        raise HTTPException(status_code=400, detail="No accrued commissions found for that vendor and month")
    expected_total = round(sum(float(r.get("commission_amount_usd", 0)) for r in accrued_rows), 2)
    payout_id = new_id()
    payout = {
        "id": payout_id,
        "vendor_id": req.vendor_id,
        "amount": round(float(req.amount_usd), 2),
        "expected_amount": expected_total,
        "period_start": f"{req.month}-01",
        "period_end": f"{req.month}-end",
        "month": req.month,
        "commission_count": len(accrued_rows),
        "payout_method": req.payout_method,
        "reference": req.reference,
        "note": req.note,
        "status": "paid",
        "currency": "USD",
        "paid_at": now_iso(),
        "paid_by_admin_id": user.get("id"),
        "created_at": now_iso(),
    }
    await db.referral_payouts.insert_one(payout)
    # Flip all matching accrued rows → paid + link them to this payout
    await db.referral_commissions.update_many(
        {"referrer_vendor_id": req.vendor_id, "commission_month": req.month, "status": "accrued"},
        {"$set": {"status": "paid", "payout_id": payout_id, "paid_at": now_iso()}},
    )
    payout.pop("_id", None)
    return {"ok": True, "payout": payout}
