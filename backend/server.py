"""BotNira - Multi-tenant AI Receptionist platform backend."""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Response, UploadFile, File, Request as FastAPIRequest
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import json
import asyncio
import logging
import uuid
import bcrypt
import jwt
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from collections import defaultdict

from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ------------------------------ Env / DB -------------------------------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret")
JWT_ALG = "HS256"
JWT_EXP_HOURS = 24 * 7
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "")

# Stripe billing
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
import stripe as _stripe
if STRIPE_SECRET_KEY:
    _stripe.api_key = STRIPE_SECRET_KEY

# Plans (recurring monthly subscriptions)
# `channels` whitelists the customer-facing channels each plan unlocks.
# Voice/SMS need a paid Twilio number → only included from Starter ↑.
PLANS = {
    "basic":   {"name": "Basic",   "price_usd": 29.0,  "voice_min": 0,    "messages": 1000,
                "channels": ["whatsapp", "email", "web"]},
    "starter": {"name": "Starter", "price_usd": 49.0,  "voice_min": 100,  "messages": 2000,
                "channels": ["whatsapp", "email", "web", "voice", "sms"]},
    "growth":  {"name": "Growth",  "price_usd": 149.0, "voice_min": 500,  "messages": 8000,
                "channels": ["whatsapp", "email", "web", "voice", "sms"]},
    "pro":     {"name": "Pro",     "price_usd": 399.0, "voice_min": 1500, "messages": 25000,
                "channels": ["whatsapp", "email", "web", "voice", "sms"]},
}


def plan_allows_channel(plan_key: Optional[str], channel: str) -> bool:
    """Returns True if the given subscription plan unlocks `channel`. Exempt /
    None plans default to all-allowed."""
    if not plan_key:
        return True
    cfg = PLANS.get(plan_key)
    if not cfg:
        return True
    allowed = cfg.get("channels")
    return (not allowed) or channel in allowed
# Prepaid top-up packs (one-time purchase, never expire)
TOPUPS = {
    "spark":   {"name": "Spark",   "price_usd": 125.0,  "voice_min": 100,  "messages": 1000},
    "boost":   {"name": "Boost",   "price_usd": 249.0,  "voice_min": 200,  "messages": 2000},
    "rocket":  {"name": "Rocket",  "price_usd": 599.0,  "voice_min": 500,  "messages": 5000},
    "jet":     {"name": "Jet",     "price_usd": 1199.0, "voice_min": 1000, "messages": 10000},
    "fleet":   {"name": "Fleet",   "price_usd": 2899.0, "voice_min": 2500, "messages": 25000},
    "armada":  {"name": "Armada",  "price_usd": 5499.0, "voice_min": 5000, "messages": 50000},
}
TRIAL_DAYS = 5
TRIAL_ALLOWED_CHANNELS = {"web", "whatsapp"}
TRIAL_MESSAGE_CAP = 100  # hard cap on AI msgs during trial
EXEMPT_EMAILS = {"kamal@thedigisparrow.com"}  # always free, never hit paywall
# Stripe Price ID cache, populated on startup
STRIPE_PRICE_IDS = {"plans": {}, "topups": {}}
# 13% HST applied to every BotNira charge (subscriptions + topups). The actual
# Stripe Tax Rate object is created/found on startup and its ID stored here.
HST_RATE_PERCENT = 13.0
HST_TAX_RATE_ID: Optional[str] = None

# Meta / WhatsApp Cloud API
META_APP_ID = os.environ.get("META_APP_ID", "")
META_APP_SECRET = os.environ.get("META_APP_SECRET", "")
META_SYSTEM_USER_TOKEN = os.environ.get("META_SYSTEM_USER_TOKEN", "")
META_VERIFY_TOKEN = os.environ.get("META_VERIFY_TOKEN", "botnira_whatsapp_2026")
META_TEST_PHONE_NUMBER_ID = os.environ.get("META_TEST_PHONE_NUMBER_ID", "")
META_TEST_WABA_ID = os.environ.get("META_TEST_WABA_ID", "")
GRAPH_BASE = "https://graph.facebook.com/v22.0"

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="BotNira API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("botnira")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


# ------------------------------ Models ---------------------------------------
class Vendor(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    slug: str
    business_description: str = ""
    status: str = "active"  # active | suspended  # noqa: F811 — Pydantic field name, not the fastapi import
    plan: str = "free"
    created_at: str


class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    full_name: str
    role: str  # superadmin | vendor
    vendor_id: Optional[str] = None
    created_at: str


class SignupReq(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str
    business_name: str
    referral_code: Optional[str] = None


class LoginReq(BaseModel):
    email: EmailStr
    password: str


class BotConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    vendor_id: str
    bot_name: str = "BotNira"
    greeting: str = "Hi! How can I help you today?"
    tone: str = "friendly and professional"
    business_description: str = ""
    faqs: List[Dict[str, str]] = []
    fallback_message: str = (
        "I'm not sure about that based on our business info. Let me have our team get back to you."
    )
    is_active: bool = True
    updated_at: str


class BotUpdate(BaseModel):
    bot_name: Optional[str] = None
    greeting: Optional[str] = None
    tone: Optional[str] = None
    business_description: Optional[str] = None
    faqs: Optional[List[Dict[str, str]]] = None
    fallback_message: Optional[str] = None
    is_active: Optional[bool] = None


class ChatMessageReq(BaseModel):
    vendor_id: str
    conversation_id: Optional[str] = None
    message: str
    customer_name: Optional[str] = "Guest"
    customer_contact: Optional[str] = ""
    channel: Optional[str] = "web"


class SimulateInboundReq(BaseModel):
    customer_name: str = "Customer"
    customer_contact: str = ""
    message: str


class AppointmentReq(BaseModel):
    customer_name: str
    customer_contact: str = ""
    scheduled_at: str  # ISO
    notes: str = ""
    conversation_id: Optional[str] = None


class ChannelUpdate(BaseModel):
    status: str  # connected | disconnected
    config: Optional[Dict[str, Any]] = None


class VendorStatusUpdate(BaseModel):
    status: str  # active | suspended


# ------------------------------ Auth helpers ---------------------------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode(), hashed.encode())


def create_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXP_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def require_vendor(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "vendor" or not user.get("vendor_id"):
        raise HTTPException(status_code=403, detail="Vendor access required")
    # ensure vendor not suspended
    vendor = await db.vendors.find_one({"id": user["vendor_id"]}, {"_id": 0})
    if not vendor or vendor.get("status") == "suspended":
        raise HTTPException(status_code=403, detail="Vendor suspended")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    return user


def slugify(txt: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", txt.lower()).strip("-")
    return s or "vendor"


# ------------------------------ Seed superadmin ------------------------------
@app.on_event("startup")
async def seed_admin():
    # Canonical seed credentials — kept in sync with /app/memory/test_credentials.md.
    # The superadmin login was rotated to a personal email; we migrate the old
    # seeded account in-place so the existing JWT/permissions stay intact.
    NEW_ADMIN_EMAIL = "sidhuboys000@gmail.com"
    NEW_ADMIN_PW = "Kamala98@pamo"
    OLD_ADMIN_EMAIL = "admin@botnira.com"

    # If the legacy admin still exists, rename + repassword it. Drop a stale
    # row at the new email first so the rename isn't blocked by a unique index.
    legacy_admin = await db.users.find_one({"email": OLD_ADMIN_EMAIL}, {"_id": 0})
    if legacy_admin:
        await db.users.delete_many({"email": NEW_ADMIN_EMAIL, "id": {"$ne": legacy_admin["id"]}})
        await db.users.update_one(
            {"id": legacy_admin["id"]},
            {"$set": {
                "email": NEW_ADMIN_EMAIL,
                "password_hash": hash_password(NEW_ADMIN_PW),
                "email_verified": True,
                "role": "superadmin",
            }},
        )
        logger.info("Migrated superadmin %s → %s", OLD_ADMIN_EMAIL, NEW_ADMIN_EMAIL)

    SEED_PASSWORDS = {
        NEW_ADMIN_EMAIL: NEW_ADMIN_PW,
        "demo@botnira.com": "demo123",
        "kamal@thedigisparrow.com": "Kamala98@hmu",
    }

    # Force-resync passwords on every startup so a stale DB (older hash from a
    # previous build) can never lock us out. This is the deployment_agent fix.
    for _email, _pw in SEED_PASSWORDS.items():
        existing_u = await db.users.find_one({"email": _email}, {"_id": 0, "password_hash": 1})
        if existing_u:
            stored_hash = existing_u.get("password_hash") or ""
            try:
                ok = stored_hash and verify_password(_pw, stored_hash)
            except Exception:
                ok = False
            if not ok:
                await db.users.update_one(
                    {"email": _email},
                    {"$set": {
                        "password_hash": hash_password(_pw),
                        "email_verified": True,
                    }},
                )
                logger.info("Resynced seed password for %s", _email)
            else:
                # ensure email_verified flag is True for seed accounts
                await db.users.update_one(
                    {"email": _email, "email_verified": {"$ne": True}},
                    {"$set": {"email_verified": True}},
                )

    admin_email = NEW_ADMIN_EMAIL
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one(
            {
                "id": new_id(),
                "email": admin_email,
                "password_hash": hash_password(NEW_ADMIN_PW),
                "full_name": "Super Admin",
                "role": "superadmin",
                "vendor_id": None,
                "email_verified": True,
                "created_at": now_iso(),
            }
        )
        logger.info("Seeded superadmin %s", admin_email)

    # seed one demo vendor for easy exploration
    demo_email = "demo@botnira.com"
    if not await db.users.find_one({"email": demo_email}):
        vid = new_id()
        await db.vendors.insert_one(
            {
                "id": vid,
                "name": "Acme Dental Clinic",
                "slug": "acme-dental",
                "business_description": (
                    "Acme Dental Clinic is a family dental practice open Mon-Sat 9am-6pm. "
                    "We offer cleanings, fillings, whitening, root canals and braces. "
                    "Address: 221 Baker Street. Phone: +1 555 0100. Emergency line: +1 555 0199. "
                    "We accept Visa, Mastercard and most insurance plans."
                ),
                "status": "active",
                "plan": "free",
                "created_at": now_iso(),
            }
        )
        await db.users.insert_one(
            {
                "id": new_id(),
                "email": demo_email,
                "password_hash": hash_password(SEED_PASSWORDS[demo_email]),
                "full_name": "Dr. Demo",
                "role": "vendor",
                "vendor_id": vid,
                "email_verified": True,
                "created_at": now_iso(),
            }
        )
        await db.bots.insert_one(
            {
                "id": new_id(),
                "vendor_id": vid,
                "bot_name": "Acme Assistant",
                "greeting": "Hi! Welcome to Acme Dental Clinic. How can I help you today?",
                "tone": "warm, professional, concise",
                "business_description": (
                    "Acme Dental Clinic. Hours: Mon-Sat 9am-6pm. Services: cleanings, "
                    "fillings, whitening, root canals, braces. Booking requires name, "
                    "phone and preferred date. Emergencies: call +1 555 0199."
                ),
                "faqs": [
                    {"q": "What are your hours?", "a": "Mon to Sat, 9am to 6pm. Closed Sundays."},
                    {"q": "Do you accept insurance?", "a": "Yes, we accept most major insurance plans."},
                    {"q": "How do I book?", "a": "Share your name, phone and preferred date; I'll schedule it."},
                ],
                "fallback_message": "I don't have that detail. A team member will follow up shortly.",
                "is_active": True,
                "updated_at": now_iso(),
            }
        )
        logger.info("Seeded demo vendor demo@botnira.com / demo123")

    # Ensure internal test vendor (unlimited, never billed)
    test_email = "kamal@thedigisparrow.com"
    if not await db.users.find_one({"email": test_email}):
        tv = new_id()
        await db.vendors.insert_one({
            "id": tv,
            "name": "The Digi Sparrow (Test)",
            "slug": "digi-sparrow-test",
            "business_description": (
                "The Digi Sparrow is a digital marketing agency based in Toronto. "
                "We help businesses grow through SEO, paid ads, and AI-powered automation. "
                "Hours: Mon-Fri 10am-6pm ET. Email: hello@thedigisparrow.com."
            ),
            "status": "active",
            "plan": "unlimited",
            "is_exempt": True,
            "created_at": now_iso(),
        })
        await db.users.insert_one({
            "id": new_id(),
            "email": test_email,
            "password_hash": hash_password(SEED_PASSWORDS[test_email]),
            "full_name": "Kamal (Test Vendor)",
            "role": "vendor",
            "vendor_id": tv,
            "email_verified": True,
            "created_at": now_iso(),
        })
        await db.bots.insert_one({
            "id": new_id(),
            "vendor_id": tv,
            "bot_name": "Sparrow Assistant",
            "greeting": "Hi! Welcome to The Digi Sparrow — how can I help?",
            "tone": "warm and witty",
            "business_description": (
                "The Digi Sparrow is a digital marketing agency. Services: SEO, Google Ads, "
                "Meta Ads, AI chatbots, website audits. Hours: Mon-Fri 10am-6pm ET. "
                "Contact: hello@thedigisparrow.com."
            ),
            "faqs": [
                {"q": "What do you do?", "a": "We help businesses grow with SEO, paid ads, and AI automation."},
                {"q": "How much does it cost?", "a": "Every project is custom. Share your goals and we'll quote."},
            ],
            "fallback_message": "Great question — let me have Kamal follow up with you.",
            "is_active": True,
            "updated_at": now_iso(),
        })
        for ch in ["web", "whatsapp", "email", "sms", "voice"]:
            await db.channels.insert_one({
                "id": new_id(), "vendor_id": tv, "channel": ch,
                "status": "connected" if ch == "web" else "disconnected",
                "config": {}, "updated_at": now_iso(),
            })
        logger.info("Seeded exempt test vendor %s", test_email)
    else:
        # Make sure the exempt flag is present on the vendor doc
        u = await db.users.find_one({"email": test_email}, {"_id": 0})
        if u and u.get("vendor_id"):
            await db.vendors.update_one(
                {"id": u["vendor_id"]},
                {"$set": {"is_exempt": True, "plan": "unlimited"}},
            )

    # Auto-bind the Meta test WhatsApp number to the internal test vendor so
    # you can demo WhatsApp end-to-end before Embedded Signup / App Review is live.
    if META_TEST_PHONE_NUMBER_ID and META_TEST_WABA_ID:
        tu = await db.users.find_one({"email": test_email}, {"_id": 0})
        if tu and tu.get("vendor_id"):
            existing = await db.whatsapp_connections.find_one(
                {"vendor_id": tu["vendor_id"]}, {"_id": 0}
            )
            if not existing:
                await db.whatsapp_connections.insert_one({
                    "id": new_id(),
                    "vendor_id": tu["vendor_id"],
                    "phone_number_id": META_TEST_PHONE_NUMBER_ID,
                    "waba_id": META_TEST_WABA_ID,
                    "display_phone_number": "(Meta test number)",
                    "access_token": META_SYSTEM_USER_TOKEN,
                    "status": "active",
                    "is_meta_test": True,
                    "created_at": now_iso(),
                })
                await db.channels.update_one(
                    {"vendor_id": tu["vendor_id"], "channel": "whatsapp"},
                    {"$set": {"status": "connected", "updated_at": now_iso()}},
                )
                logger.info("Bound Meta WhatsApp test number to %s", test_email)

    # Ensure demo vendor always has 5 default channels (idempotent)
    demo = await db.users.find_one({"email": demo_email}, {"_id": 0})
    if demo and demo.get("vendor_id"):
        for ch in ["web", "whatsapp", "email", "sms", "voice"]:
            existing_ch = await db.channels.find_one(
                {"vendor_id": demo["vendor_id"], "channel": ch}
            )
            if not existing_ch:
                await db.channels.insert_one(
                    {
                        "id": new_id(),
                        "vendor_id": demo["vendor_id"],
                        "channel": ch,
                        "status": "connected" if ch == "web" else "disconnected",
                        "config": {},
                        "updated_at": now_iso(),
                    }
                )


# ------------------------------ Auth routes ----------------------------------
@api_router.post("/auth/signup")
async def signup(req: SignupReq, request: FastAPIRequest = None):
    if await db.users.find_one({"email": req.email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    # Capture client IP for referral self-attribution checks (best-effort).
    signup_ip = ""
    try:
        if request is not None:
            xf = request.headers.get("x-forwarded-for", "")
            signup_ip = (xf.split(",")[0].strip() if xf else (request.client.host if request.client else "")) or ""
    except Exception:
        signup_ip = ""
    vid = new_id()
    trial_ends = (datetime.now(timezone.utc) + timedelta(days=TRIAL_DAYS)).isoformat()
    await db.vendors.insert_one(
        {
            "id": vid,
            "name": req.business_name,
            "slug": slugify(req.business_name) + "-" + vid[:4],
            "business_description": "",
            "status": "active",
            "plan": "trial",
            "subscription_status": "trialing",
            "trial_ends_at": trial_ends,
            "stripe_customer_id": None,
            "stripe_subscription_id": None,
            "current_period_end": None,
            "minutes_balance": 0.0,
            "messages_balance": TRIAL_MESSAGE_CAP,
            "plan_minutes_monthly": 0,
            "plan_messages_monthly": 0,
            "is_exempt": False,
            "created_at": now_iso(),
        }
    )
    uid = new_id()
    await db.users.insert_one(
        {
            "id": uid,
            "email": req.email.lower(),
            "password_hash": hash_password(req.password),
            "full_name": req.full_name,
            "role": "vendor",
            "vendor_id": vid,
            "email_verified": False,
            "signup_ip": signup_ip,
            "created_at": now_iso(),
        }
    )
    # default bot
    await db.bots.insert_one(
        {
            "id": new_id(),
            "vendor_id": vid,
            "bot_name": "BotNira",
            "greeting": f"Hi! Welcome to {req.business_name}. How can I help?",
            "tone": "friendly and professional",
            "business_description": "",
            "faqs": [],
            "fallback_message": "I'm not sure about that. Let me have our team follow up.",
            "is_active": True,
            "updated_at": now_iso(),
        }
    )
    # default channel statuses
    for ch in ["web", "whatsapp", "email", "sms", "voice"]:
        await db.channels.insert_one(
            {
                "id": new_id(),
                "vendor_id": vid,
                "channel": ch,
                "status": "connected" if ch == "web" else "disconnected",
                "config": {},
                "updated_at": now_iso(),
            }
        )
    # Provision this vendor's own referral code immediately so they can start
    # sharing their link from minute one.
    try:
        await _ensure_referral_code(vid, req.business_name)
    except Exception as e:
        logger.warning("referral code provisioning failed for %s: %s", vid, e)
    # If the signup came in with a ?ref=<code>, attribute the new vendor to
    # the referrer (15% recurring commission on any future paid invoice).
    if req.referral_code:
        try:
            await _attach_referral_on_signup(vid, req.email.lower(), req.referral_code, signup_ip)
        except Exception as e:
            logger.warning("referral attribution failed: %s", e)
    token = create_token(uid, "vendor")
    # Fire verification OTP (non-blocking)
    try:
        otp = await _generate_and_store_otp_async(req.email.lower(), "signup")
        _send_otp_email(req.email.lower(), otp, "signup")
    except Exception as e:
        logger.warning("signup OTP send failed: %s", e)
    return {"token": token, "role": "vendor", "vendor_id": vid, "email_verified": False}


@api_router.post("/auth/login")
async def login(req: LoginReq):
    user = await db.users.find_one({"email": req.email.lower()})
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user["role"] == "vendor":
        vendor = await db.vendors.find_one({"id": user["vendor_id"]})
        if vendor and vendor.get("status") == "suspended":
            raise HTTPException(status_code=403, detail="Account suspended")
        if vendor and vendor.get("mfa_enabled"):
            # Issue a short-lived MFA session; require OTP verification before real JWT.
            mfa_session = new_id()
            await db.mfa_sessions.insert_one({
                "id": mfa_session,
                "user_id": user["id"],
                "created_at": now_iso(),
                "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
            })
            otp = await _generate_and_store_otp_async(user["email"], "login")
            _send_otp_email(user["email"], otp, "login")
            return {"mfa_required": True, "mfa_session": mfa_session, "email": user["email"]}
    token = create_token(user["id"], user["role"])
    return {"token": token, "role": user["role"], "vendor_id": user.get("vendor_id")}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    vendor = None
    access = None
    if user.get("vendor_id"):
        vendor = await db.vendors.find_one({"id": user["vendor_id"]}, {"_id": 0})
        if vendor:
            a = _plan_for_vendor(vendor)
            access = {
                "paywall": a["paywall"],
                "trial": a["trial"],
                "trial_days_left": a["trial_days_left"],
                "allowed_channels": sorted(list(a["allowed_channels"])),
                "plan_label": a["plan_label"],
                "is_exempt": a["is_exempt"],
                "minutes_balance": a.get("minutes_balance", 0.0),
                "messages_balance": a.get("messages_balance", 0),
            }
    # Make sure email_verified + mfa_enabled are surfaced to frontend
    if user.get("vendor_id"):
        user = {**user, "email_verified": user.get("email_verified", True)}
    return {"user": user, "vendor": vendor, "access": access}


# ------------------------------ Vendor profile -------------------------------
@api_router.get("/vendor/me")
async def vendor_me(user: dict = Depends(require_vendor)):
    v = await db.vendors.find_one({"id": user["vendor_id"]}, {"_id": 0})
    return v


@api_router.put("/vendor/me")
async def vendor_update(payload: Dict[str, Any], user: dict = Depends(require_vendor)):
    allowed = {k: v for k, v in payload.items() if k in ("name", "business_description")}
    if allowed:
        await db.vendors.update_one({"id": user["vendor_id"]}, {"$set": allowed})
    v = await db.vendors.find_one({"id": user["vendor_id"]}, {"_id": 0})
    return v


# ------------------------------ Bot studio -----------------------------------
@api_router.get("/bot")
async def get_bot(user: dict = Depends(require_vendor)):
    bot = await db.bots.find_one({"vendor_id": user["vendor_id"]}, {"_id": 0})
    return bot


@api_router.put("/bot")
async def update_bot(payload: BotUpdate, user: dict = Depends(require_vendor)):
    update = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    update["updated_at"] = now_iso()
    await db.bots.update_one({"vendor_id": user["vendor_id"]}, {"$set": update})
    bot = await db.bots.find_one({"vendor_id": user["vendor_id"]}, {"_id": 0})
    return bot


# ------------------------------ Chat / AI ------------------------------------
def build_system_prompt(bot: dict, vendor: dict) -> str:
    faqs_txt = "\n".join([f"- Q: {f.get('q','')}\n  A: {f.get('a','')}" for f in bot.get("faqs", [])])
    return f"""You are {bot.get('bot_name','BotNira')}, an AI receptionist for "{vendor.get('name','this business')}".

Your tone: {bot.get('tone','friendly and professional')}.

## BUSINESS INFORMATION (your ONLY source of truth)
{bot.get('business_description','')}

## FREQUENTLY ASKED QUESTIONS
{faqs_txt if faqs_txt else '(none)'}

## STRICT RULES
1. Answer ONLY using the BUSINESS INFORMATION and FAQs above.
2. If the answer is not clearly covered, reply exactly: "{bot.get('fallback_message', 'I am not sure about that.')}"
3. Do NOT invent hours, prices, locations, policies, or services.
4. Never answer unrelated general-knowledge questions; politely steer back to the business.
5. If the user wants to book an appointment, collect (one question at a time if needed): full name, phone or email, preferred date AND time, reason for the visit. Once you have all four, CONFIRM by restating the details and saying something like "You're booked for <date time>, <name>" — that confirmation is what registers the appointment.
6. CRITICAL: Do NOT re-ask for information the user has already provided earlier in this conversation. Scan the full conversation history before asking anything. If the user already said their name, phone, date, or reason — skip that question and move to the next missing piece.
7. APPOINTMENT MANAGEMENT: If customer wants to VIEW, CANCEL, or RESCHEDULE an existing appointment:
   a) Ask for their phone number or email if not already provided
   b) Confirm you found their appointment (mention date/time/reason)
   c) If CANCEL: Say "I've cancelled your appointment for [date/time]. You're all set!"
   d) If RESCHEDULE: Ask "What new date and time works for you?" → Once provided, say "Done! Your appointment is now [new date/time]"
   e) After any change, inform them: "The business owner has been notified of this change."
8. Keep replies short and scannable (1-3 short paragraphs). Use a blank line between paragraphs.
9. When listing 3+ items (services, hours, steps), use "- " bullet points on separate lines.
10. Never use markdown tables. Use **bold** only for key details (price, date, phone).
11. When you share a URL, phone number, or email, output it as plain text — the UI will auto-link it.
"""


async def get_ai_reply(vendor_id: str, conversation_id: str, user_text: str) -> str:
    vendor = await db.vendors.find_one({"id": vendor_id}, {"_id": 0})
    bot = await db.bots.find_one({"vendor_id": vendor_id}, {"_id": 0})
    if not vendor or not bot:
        return "This business is not available right now."
    if not bot.get("is_active", True):
        return "This bot is currently disabled."
    if not EMERGENT_LLM_KEY:
        return bot.get("fallback_message", "I'm not able to respond right now.")

    system_prompt = build_system_prompt(bot, vendor)
    
    # CRITICAL FIX: Fetch MORE history to prevent context loss during multi-turn
    # conversations (e.g., appointment booking where customer provides info across
    # 10-15 messages). Previous limit of 40 caused bot to forget phone numbers.
    history = await db.messages.find(
        {"conversation_id": conversation_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(100)  # Increased from 50 to 100
    
    # Extract key conversation facts to always include in context
    # (prevents loss of critical info like phone number, name, email)
    context_facts = []
    customer_name = None
    customer_phone = None
    customer_email = None
    
    for m in history:
        content = m.get("content", "").lower()
        # Extract phone number if mentioned
        phone_match = re.search(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b|\b\+\d{10,15}\b', m.get("content", ""))
        if phone_match and not customer_phone:
            customer_phone = phone_match.group(0)
        # Extract email if mentioned
        email_match = re.search(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', m.get("content", ""))
        if email_match and not customer_email:
            customer_email = email_match.group(0)
        # Extract name from "my name is X" or "I'm X" patterns
        name_match = re.search(r"(?:my name is|i'?m|call me)\s+([a-z]{2,})", content)
        if name_match and not customer_name and m.get("role") == "user":
            customer_name = name_match.group(1).capitalize()
    
    # Build context facts string
    if customer_name:
        context_facts.append(f"Customer name: {customer_name}")
    if customer_phone:
        context_facts.append(f"Customer phone: {customer_phone}")
    if customer_email:
        context_facts.append(f"Customer email: {customer_email}")
    
    # Use last 60 messages (up from 40) to maintain more context
    history_txt = "\n".join(
        [f"{m['role'].upper()}: {m['content']}" for m in history[-60:]]
    )
    
    # Prepend extracted facts to ensure they're always in context
    if context_facts:
        facts_str = "CONTEXT INFO: " + ", ".join(context_facts)
        composed = (
            f"{facts_str}\n\nRecent conversation:\n{history_txt}\n\nCUSTOMER: {user_text}\nASSISTANT:"
            if history_txt
            else f"{facts_str}\n\nCUSTOMER: {user_text}\nASSISTANT:"
        )
    else:
        composed = (
            f"Recent conversation:\n{history_txt}\n\nCUSTOMER: {user_text}\nASSISTANT:"
            if history_txt
            else user_text
        )

    # Try providers in order; auto-fallback if one is down.
    # NOTE: OpenAI GPT-5.2 proxy had a 502 outage — Claude Sonnet 4.5 is
    # primary until that recovers (behavior is identical for grounded Q&A).
    providers = [
        ("anthropic", "claude-sonnet-4-5-20250929"),
        ("gemini", "gemini-2.5-flash"),
        ("openai", "gpt-5.2"),
    ]
    for provider, model in providers:
        try:
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=conversation_id,
                system_message=system_prompt,
            ).with_model(provider, model)
            reply = await asyncio.wait_for(
                chat.send_message(UserMessage(text=composed)), timeout=15
            )
            reply = (reply or "").strip()
            if reply:
                return reply
        except Exception as e:
            logger.warning("LLM %s/%s failed: %s", provider, model, str(e)[:120])
            continue
    return bot.get("fallback_message", "Sorry, I'm having trouble responding.")


# --------- Appointment auto-extraction from chat transcripts ---------------
_BOOKING_KEYWORDS = re.compile(
    r"\b(book(?:ed|ing)?|schedul(?:ed|e|ing)?|reserved?|confirm(?:ed)?|"
    r"appointment|see you on|slot|i['\u2019]ve set|you['\u2019]re set)\b",
    re.IGNORECASE,
)


async def _maybe_book_appointment(vendor_id: str, conversation_id: str, latest_bot_reply: str):
    """If the bot just confirmed a booking, extract structured info and save it.

    Fires only when (a) the bot's newest reply contains booking keywords AND
    (b) this conversation does not already have an appointment row.
    Uses a second, cheap LLM pass that must return JSON only.
    """
    if not latest_bot_reply or not _BOOKING_KEYWORDS.search(latest_bot_reply):
        return None
    # Legacy guard: "one appointment per conversation" blocked repeat bookings
    # on long-running email / WhatsApp threads where the customer books for a
    # second time. We now dedupe by (conversation_id, scheduled_at) AFTER we
    # know the scheduled_at from the extractor — still protects against the
    # same confirmation replying twice.
    if not EMERGENT_LLM_KEY:
        return None

    msgs = await db.messages.find(
        {"conversation_id": conversation_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(10)
    msgs.reverse()
    transcript = "\n".join(
        f"{m['role'].upper()}: {m['content']}" for m in msgs
    )
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    system = (
        "You extract confirmed appointment bookings from customer-bot chat transcripts. "
        f"Today's date is {today}. "
        "Respond with STRICT JSON (no markdown fences, no prose). "
        'If a booking was just CONFIRMED (customer supplied name AND phone/email AND '
        'a specific date/time, AND the bot acknowledged it), return: '
        '{"booked": true, "customer_name": "...", "customer_contact": "...", '
        '"scheduled_at": "YYYY-MM-DDTHH:MM", "notes": "short summary"}. '
        'Otherwise return: {"booked": false}. '
        "Resolve relative dates (tomorrow, Saturday) against today's date."
    )
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"extract-{conversation_id}",
            system_message=system,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        raw = await asyncio.wait_for(
            chat.send_message(UserMessage(text=transcript)), timeout=10
        )
        raw = (raw or "").strip()
        # strip code fences if model sneaks them in
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.I | re.S).strip()
        data = json.loads(raw)
        if not data.get("booked"):
            return None
        scheduled_at = data.get("scheduled_at", "") or ""
        # Dedupe: skip if the same conversation already has an appointment
        # for the exact same scheduled_at (prevents creating a duplicate
        # when the vendor sends the confirmation reply twice). Empty
        # scheduled_at falls back to the legacy one-per-convo rule.
        if scheduled_at:
            dup = await db.appointments.find_one({
                "conversation_id": conversation_id,
                "scheduled_at": scheduled_at,
            })
        else:
            dup = await db.appointments.find_one({"conversation_id": conversation_id})
        if dup:
            return None
        # Resolve source (channel) from the conversation
        conv = await db.conversations.find_one({"id": conversation_id}, {"_id": 0, "channel": 1})
        source = (conv or {}).get("channel") or "web"
        appt = {
            "id": new_id(),
            "vendor_id": vendor_id,
            "customer_name": data.get("customer_name", "Guest") or "Guest",
            "customer_contact": data.get("customer_contact", "") or "",
            "scheduled_at": scheduled_at,
            "notes": data.get("notes", "Booked via BotNira chat"),
            "status": "scheduled",
            "source": source,
            "attended": False,
            "conversation_id": conversation_id,
            "created_at": now_iso(),
        }
        await db.appointments.insert_one(appt)
        logger.info("Auto-booked appointment for vendor=%s conv=%s", vendor_id, conversation_id)
        # Notify vendor by email (non-blocking)
        try:
            await _send_appointment_email(vendor_id, appt)
        except Exception as e:
            logger.warning("appt email failed: %s", e)
        # Send the customer their own confirmation if they shared an email.
        # Independent try/except so a customer-side failure never affects the
        # vendor notification or the booking record itself.
        try:
            await _send_customer_appointment_confirmation(vendor_id, appt)
        except Exception as e:
            logger.warning("customer appt email failed: %s", e)
        return {k: v for k, v in appt.items() if k != "_id"}
    except Exception as e:
        logger.warning("booking extraction failed: %s", str(e)[:120])
        return None


async def _maybe_manage_appointment(vendor_id: str, conversation_id: str, latest_bot_reply: str, customer_phone: str = None):
    """Detect if bot just cancelled or rescheduled an appointment in-chat.
    
    Looks for keywords like "cancelled your appointment" or "rescheduled to"
    and extracts the action from bot's reply. Updates appointment in database
    and notifies vendor.
    """
    cancel_pattern = re.compile(
        r"(cancel+ed|removed|deleted)\s+(your|the)\s+appointment",
        re.IGNORECASE
    )
    reschedule_pattern = re.compile(
        r"(rescheduled?|moved|changed)\s+(your|the)\s+appointment|"
        r"(appointment|it)\s+is\s+now\s+(scheduled|set|booked)\s+(for|on|at)",
        re.IGNORECASE
    )
    
    is_cancel = cancel_pattern.search(latest_bot_reply)
    is_reschedule = reschedule_pattern.search(latest_bot_reply)
    
    if not is_cancel and not is_reschedule:
        return None
    
    # Find customer's appointment (use phone from context or extract from convo)
    if not customer_phone:
        # Try to extract phone from conversation messages
        msgs = await db.messages.find(
            {"conversation_id": conversation_id}, {"_id": 0}
        ).sort("created_at", -1).limit(20).to_list(20)
        for m in msgs:
            phone_match = re.search(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b|\b\+\d{10,15}\b', m.get("content", ""))
            if phone_match:
                customer_phone = phone_match.group(0)
                break
    
    if not customer_phone:
        logger.warning("Cannot manage appointment: no customer phone found")
        return None
    
    # Find most recent scheduled appointment for this customer
    phone_clean = re.sub(r'[^\d+]', '', customer_phone)
    appt = await db.appointments.find_one(
        {
            "vendor_id": vendor_id,
            "customer_contact": {"$regex": phone_clean, "$options": "i"},
            "status": {"$in": ["scheduled", "rescheduled_by_customer"]}
        },
        {"_id": 0}
    )
    
    if not appt:
        logger.info("No appointment found to manage for phone=%s", customer_phone)
        return None
    
    updates = {"updated_at": now_iso()}
    change_log = []
    
    if is_cancel:
        updates["status"] = "cancelled_by_customer"
        updates["cancelled_at"] = now_iso()
        change_log.append("Cancelled by customer via chat")
        logger.info("Customer cancelled appointment %s via chat", appt["id"])
    
    elif is_reschedule:
        # Extract new date/time from bot reply
        date_match = re.search(
            r'\b(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2})?)\b|'
            r'\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}(?:\s+at\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?)\b|'
            r'\b((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[,\s]+\w+\s+\d{1,2}(?:st|nd|rd|th)?\s+at\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)\b',
            latest_bot_reply,
            re.IGNORECASE
        )
        if date_match:
            new_time = date_match.group(1) or date_match.group(2) or date_match.group(3)
            old_time = appt.get("scheduled_at", "")
            updates["scheduled_at"] = new_time
            updates["status"] = "rescheduled_by_customer"
            updates["rescheduled_at"] = now_iso()
            change_log.append(f"Rescheduled by customer via chat from {old_time} to {new_time}")
            logger.info("Customer rescheduled appointment %s to %s", appt["id"], new_time)
        else:
            logger.warning("Reschedule detected but couldn't extract new date/time")
            return None
    
    # Add change log
    if change_log:
        updates["customer_changes"] = appt.get("customer_changes", []) + [{
            "timestamp": now_iso(),
            "changes": change_log,
            "source": "chat"
        }]
    
    # Update appointment
    await db.appointments.update_one({"id": appt["id"]}, {"$set": updates})
    
    # Notify vendor
    try:
        vendor = await db.vendors.find_one({"id": vendor_id}, {"_id": 0})
        if vendor:
            await _send_vendor_appointment_change_notification(vendor, appt, change_log)
    except Exception as e:
        logger.warning("Failed to notify vendor of customer appointment change: %s", e)
    
    return appt


async def _push_message(conversation_id: str, vendor_id: str, role: str, content: str, external_id: Optional[str] = None, extra: Optional[Dict[str, Any]] = None):
    msg = {
        "id": new_id(),
        "conversation_id": conversation_id,
        "vendor_id": vendor_id,
        "role": role,
        "content": content,
        "created_at": now_iso(),
    }
    if external_id:
        msg["external_id"] = external_id
    if extra:
        for k, v in extra.items():
            if v is not None:
                msg[k] = v
    await db.messages.insert_one(msg)
    # A customer message flips the thread to unread so the vendor sees a
    # clear indicator; bot/agent replies leave the read-state alone.
    conv_update: Dict[str, Any] = {
        "updated_at": now_iso(),
        "last_message_preview": content[:120],
    }
    if role == "user":
        conv_update["unread"] = True
    await db.conversations.update_one(
        {"id": conversation_id},
        {"$set": conv_update},
    )
    return {k: v for k, v in msg.items() if k != "_id"}


async def _ensure_conversation(
    vendor_id: str,
    conversation_id: Optional[str],
    channel: str,
    customer_name: str,
    customer_contact: str,
) -> dict:
    if conversation_id:
        conv = await db.conversations.find_one(
            {"id": conversation_id, "vendor_id": vendor_id}, {"_id": 0}
        )
        if conv:
            return conv
    conv = {
        "id": new_id(),
        "vendor_id": vendor_id,
        "channel": channel,
        "customer_name": customer_name or "Guest",
        "customer_contact": customer_contact or "",
        "status": "open",
        "last_message_preview": "",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.conversations.insert_one(conv)
    conv.pop("_id", None)
    return conv


@api_router.post("/chat/message")
async def chat_message(req: ChatMessageReq):
    """Public endpoint used by the embeddable web widget and the live preview."""
    vendor = await db.vendors.find_one({"id": req.vendor_id}, {"_id": 0})
    if not vendor or vendor.get("status") == "suspended":
        raise HTTPException(status_code=404, detail="Vendor unavailable")
    channel = req.channel or "web"
    ok, reason = await _vendor_can_use_channel(req.vendor_id, channel)
    if not ok:
        raise HTTPException(status_code=402, detail=reason)
    conv = await _ensure_conversation(
        req.vendor_id,
        req.conversation_id,
        channel,
        req.customer_name or "Guest",
        req.customer_contact or "",
    )
    await _push_message(conv["id"], req.vendor_id, "user", req.message)
    reply = await get_ai_reply(req.vendor_id, conv["id"], req.message)
    bot_msg = await _push_message(conv["id"], req.vendor_id, "bot", reply)
    await _decrement_message_balance(req.vendor_id)
    await _maybe_book_appointment(req.vendor_id, conv["id"], reply)
    await _maybe_manage_appointment(req.vendor_id, conv["id"], reply, req.customer_contact)
    return {"conversation_id": conv["id"], "reply": reply, "message": bot_msg}


@api_router.get("/chat/poll/{vendor_id}/{conversation_id}")
async def chat_poll(vendor_id: str, conversation_id: str, since: Optional[str] = None):
    """Public: the web widget polls this every few seconds to pick up agent/bot
    messages that arrive between the visitor's own turns (e.g., a human
    operator jumping in from the Inbox)."""
    # validate vendor match so you can't poll some other vendor's conversation
    conv = await db.conversations.find_one(
        {"id": conversation_id, "vendor_id": vendor_id}, {"_id": 0}
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Not found")
    query: Dict[str, Any] = {"conversation_id": conversation_id, "role": {"$in": ["bot", "agent"]}}
    if since:
        query["created_at"] = {"$gt": since}
    msgs = await db.messages.find(query, {"_id": 0}).sort("created_at", 1).to_list(50)
    return {"messages": msgs, "server_time": now_iso()}


# ------------------------------ Conversations (inbox) ------------------------
@api_router.get("/conversations")
async def list_conversations(
    channel: Optional[str] = None,
    status: Optional[str] = None,  # noqa: F811 — function param, not the fastapi import
    q: Optional[str] = None,       # free-text search across name / contact / preview
    limit: int = 30,
    offset: int = 0,
    user: dict = Depends(require_vendor),
):
    """Paginated + server-side searchable conversation list.

    - default `limit=30` keeps the inbox snappy on vendors with thousands of threads.
    - `q` searches `customer_name`, `customer_contact`, `last_message_preview`, and
      `subject` (case-insensitive). When `q` is set, the UI lifts the pagination
      to scan the full dataset — we raise the effective limit to 200 so search feels
      global.
    - Returns `{items, total, has_more, unread_total}`.
    """
    # Hard caps to protect the DB
    limit = max(1, min(int(limit), 200))
    offset = max(0, int(offset))

    mongo_q: Dict[str, Any] = {"vendor_id": user["vendor_id"]}
    if channel:
        mongo_q["channel"] = channel
    if status:
        mongo_q["status"] = status
    if q and q.strip():
        # Escape regex metacharacters in the user's query so dots, brackets, etc. are
        # treated literally. Still case-insensitive.
        escaped = re.escape(q.strip())
        mongo_q["$or"] = [
            {"customer_name":        {"$regex": escaped, "$options": "i"}},
            {"customer_contact":     {"$regex": escaped, "$options": "i"}},
            {"last_message_preview": {"$regex": escaped, "$options": "i"}},
            {"subject":              {"$regex": escaped, "$options": "i"}},
        ]
        # When searching, broaden the window so the result set isn't cut mid-search.
        limit = 200

    total = await db.conversations.count_documents(mongo_q)
    items = await (
        db.conversations.find(mongo_q, {"_id": 0})
        .sort("updated_at", -1)
        .skip(offset)
        .limit(limit)
        .to_list(limit)
    )
    # Unread count respects the channel/status filters so the UI can show a
    # badge per current view. Not affected by `offset` — it's the full count.
    unread_q = dict(mongo_q, unread=True)
    unread_total = await db.conversations.count_documents(unread_q)
    return {
        "items": items,
        "total": total,
        "has_more": offset + len(items) < total,
        "unread_total": unread_total,
    }


@api_router.post("/conversations/{cid}/read")
async def mark_conversation_read(cid: str, user: dict = Depends(require_vendor)):
    """Flip a conversation from unread → read when the vendor opens it."""
    res = await db.conversations.update_one(
        {"id": cid, "vendor_id": user["vendor_id"]},
        {"$set": {"unread": False}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@api_router.get("/conversations/{cid}")
async def get_conversation(cid: str, user: dict = Depends(require_vendor)):
    conv = await db.conversations.find_one(
        {"id": cid, "vendor_id": user["vendor_id"]}, {"_id": 0}
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Not found")
    messages = await db.messages.find(
        {"conversation_id": cid}, {"_id": 0}
    ).sort("created_at", 1).to_list(1000)
    return {"conversation": conv, "messages": messages}


@api_router.post("/conversations/{cid}/resolve")
async def resolve_conversation(cid: str, user: dict = Depends(require_vendor)):
    res = await db.conversations.update_one(
        {"id": cid, "vendor_id": user["vendor_id"]},
        {"$set": {"status": "resolved", "updated_at": now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@api_router.post("/conversations/{cid}/reply")
async def agent_reply(cid: str, payload: Dict[str, str], user: dict = Depends(require_vendor)):
    conv = await db.conversations.find_one(
        {"id": cid, "vendor_id": user["vendor_id"]}, {"_id": 0}
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Not found")
    content = (payload.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Empty message")

    # Save the outbound agent message first (so we always have a record,
    # even if delivery to the customer fails for some reason).
    msg = await _push_message(cid, user["vendor_id"], "agent", content)

    channel = conv.get("channel")
    delivery = {"channel": channel, "ok": True}
    if channel == "whatsapp":
        wa_to = conv.get("customer_contact", "")
        wc = await db.whatsapp_connections.find_one(
            {"vendor_id": user["vendor_id"], "status": "active"}, {"_id": 0}
        )
        if not wc:
            delivery = {"channel": channel, "ok": False, "error": "WhatsApp not connected for this vendor"}
        elif not wa_to:
            delivery = {"channel": channel, "ok": False, "error": "No customer WhatsApp number on this conversation"}
        else:
            resp = await _whatsapp_send(wc["phone_number_id"], wa_to.lstrip("+"), content, wc["access_token"])
            if not resp:
                delivery = {
                    "channel": channel,
                    "ok": False,
                    "error": (
                        "Meta rejected the send. Most likely: the customer's last message "
                        "was more than 24 hours ago (WhatsApp session window) — you can only "
                        "free-reply within 24h. Approved templates are needed to message outside that."
                    ),
                }
    elif channel == "sms":
        sms_to = conv.get("customer_contact", "")
        conn = await db.voice_connections.find_one(
            {"vendor_id": user["vendor_id"]}, {"_id": 0}
        )
        if not conn:
            delivery = {"channel": channel, "ok": False, "error": "No phone number provisioned — go to Channels → Voice and buy a number first."}
        elif not sms_to:
            delivery = {"channel": channel, "ok": False, "error": "No customer phone number on this conversation"}
        else:
            sent = await _twilio_send_sms(conn, sms_to, content)
            if not sent:
                delivery = {
                    "channel": channel,
                    "ok": False,
                    "error": "Twilio rejected the SMS — check the customer number is a valid US/CA number (international SMS is not supported yet).",
                }
            else:
                # Bill 1 message per outbound SMS we send.
                await _decrement_message_balance(user["vendor_id"])
    elif channel == "email":
        # Live-agent reply via the vendor's own SMTP. Threads off the most
        # recent inbound Message-ID so the customer's mail client groups it.
        from email_routes import _get_email_connection, _email_send_async  # late import — avoids circular
        to_email = conv.get("customer_contact", "")
        ec = await _get_email_connection(user["vendor_id"])
        if not ec or not ec.get("enabled"):
            delivery = {"channel": channel, "ok": False, "error": "Email channel is not connected — go to Channels → Email and connect an inbox."}
        elif not to_email:
            delivery = {"channel": channel, "ok": False, "error": "No customer email on this conversation"}
        else:
            last_user = await db.messages.find_one(
                {"conversation_id": cid, "role": "user", "external_id": {"$ne": None}},
                sort=[("created_at", -1)], projection={"_id": 0, "external_id": 1},
            )
            in_reply_to = last_user.get("external_id") if last_user else None
            subject = conv.get("subject") or "Re: your message"
            if not subject.lower().startswith("re:"):
                subject = "Re: " + subject
            new_mid = await _email_send_async(
                ec, to_email, subject, content,
                in_reply_to=in_reply_to, references=in_reply_to,
            )
            if not new_mid:
                delivery = {"channel": channel, "ok": False, "error": "Email could not be sent — check your IMAP/SMTP credentials in Channels → Email."}
            else:
                # Stamp the saved agent message with the new Message-ID for threading
                await db.messages.update_one(
                    {"id": msg["id"]}, {"$set": {"external_id": new_mid}}
                )
                await db.email_connections.update_one(
                    {"vendor_id": user["vendor_id"]}, {"$inc": {"total_sent": 1}}
                )
                await _decrement_message_balance(user["vendor_id"])
    # For web channel the message is saved; widget will poll and
    # deliver it to the visitor in ~3 seconds (see /api/chat/poll).

    if not delivery["ok"]:
        # Surface the delivery error so the UI can show a toast.
        raise HTTPException(status_code=502, detail=delivery["error"])

    # If the vendor (or the AI draft they sent) just confirmed a booking in
    # this reply, extract + persist the appointment. Same pathway used by
    # every inbound channel's auto-reply — just plugged in here too so that
    # live-agent / Generate-AI-reply sends are also captured.
    try:
        await _maybe_book_appointment(user["vendor_id"], cid, content)
        await _maybe_manage_appointment(user["vendor_id"], cid, content)
    except Exception as e:
        logger.warning("[agent_reply] booking extraction failed: %s", e)

    return {"message": msg, "delivery": delivery}


# ------------------------------ Inbound simulators ---------------------------
@api_router.post("/simulate/{channel}")
async def simulate_inbound(
    channel: str,
    req: SimulateInboundReq,
    user: dict = Depends(require_vendor),
):
    if channel not in {"whatsapp", "email", "sms", "voice"}:
        raise HTTPException(status_code=400, detail="Invalid channel")
    ok, reason = await _vendor_can_use_channel(user["vendor_id"], channel)
    if not ok:
        raise HTTPException(status_code=402, detail=reason)
    conv = await _ensure_conversation(
        user["vendor_id"], None, channel, req.customer_name, req.customer_contact
    )
    await _push_message(conv["id"], user["vendor_id"], "user", req.message)
    reply = await get_ai_reply(user["vendor_id"], conv["id"], req.message)
    await _push_message(conv["id"], user["vendor_id"], "bot", reply)
    await _decrement_message_balance(user["vendor_id"])
    await _maybe_book_appointment(user["vendor_id"], conv["id"], reply)
    await _maybe_manage_appointment(user["vendor_id"], conv["id"], reply, req.customer_contact)
    return {"conversation_id": conv["id"], "reply": reply}


# ------------------------------ Appointments ---------------------------------
@api_router.get("/appointments")
async def list_appointments(
    user: dict = Depends(require_vendor),
    limit: int = 30,
    offset: int = 0,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    source: Optional[str] = None,
    appt_status: Optional[str] = None,
    attended: Optional[bool] = None,
):
    """List appointments with pagination, sorting, and filters.
    
    Filters:
    - date_from/date_to: ISO date strings for scheduled_at range
    - source: web, whatsapp, email, sms, voice, manual
    - appt_status: scheduled, cancelled_by_customer, rescheduled_by_customer, cancelled, attended
    - attended: true/false
    """
    query = {"vendor_id": user["vendor_id"]}
    
    # Date range filter
    if date_from or date_to:
        query["scheduled_at"] = {}
        if date_from:
            query["scheduled_at"]["$gte"] = date_from
        if date_to:
            # Add 23:59:59 to include the entire end date
            query["scheduled_at"]["$lte"] = f"{date_to}T23:59:59"
    
    # Source filter
    if source and source != "all":
        query["source"] = source
    
    # Status filter
    if appt_status and appt_status != "all":
        query["status"] = appt_status
    
    # Attended filter
    if attended is not None:
        query["attended"] = attended
    
    # Get total count for pagination
    total = await db.appointments.count_documents(query)
    
    # Fetch paginated results, sorted by scheduled_at descending (latest first)
    items = await db.appointments.find(
        query, {"_id": 0}
    ).sort("scheduled_at", -1).skip(offset).limit(limit).to_list(limit)
    
    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(items) < total,
    }


@api_router.post("/appointments")
async def create_appointment(req: AppointmentReq, user: dict = Depends(require_vendor)):
    # Determine source: vendor-created (manual) or inferred from linked conversation
    source = "manual"
    if req.conversation_id:
        conv = await db.conversations.find_one({"id": req.conversation_id}, {"_id": 0, "channel": 1})
        if conv:
            source = conv.get("channel") or "manual"
    appt = {
        "id": new_id(),
        "vendor_id": user["vendor_id"],
        "customer_name": req.customer_name,
        "customer_contact": req.customer_contact,
        "scheduled_at": req.scheduled_at,
        "notes": req.notes,
        "status": "scheduled",
        "source": source,
        "attended": False,
        "conversation_id": req.conversation_id,
        "created_at": now_iso(),
    }
    await db.appointments.insert_one(appt)
    try:
        await _send_appointment_email(user["vendor_id"], appt)
    except Exception as e:
        logger.warning("appt email failed: %s", e)
    # Customer-side confirmation (only if customer email was captured)
    try:
        await _send_customer_appointment_confirmation(user["vendor_id"], appt)
    except Exception as e:
        logger.warning("customer appt email failed: %s", e)
    return {k: v for k, v in appt.items() if k != "_id"}


class AppointmentPatchReq(BaseModel):
    attended: Optional[bool] = None
    status: Optional[str] = None  # noqa: F811 — Pydantic field, not the fastapi import
    notes: Optional[str] = None


@api_router.patch("/appointments/{appt_id}")
async def update_appointment(appt_id: str, req: AppointmentPatchReq, user: dict = Depends(require_vendor)):
    existing = await db.appointments.find_one(
        {"id": appt_id, "vendor_id": user["vendor_id"]}, {"_id": 0}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Appointment not found")
    updates = {}
    if req.attended is not None:
        updates["attended"] = bool(req.attended)
        updates["attended_at"] = now_iso() if req.attended else None
    if req.status is not None:
        updates["status"] = req.status
    if req.notes is not None:
        updates["notes"] = req.notes
    if not updates:
        return existing
    updates["updated_at"] = now_iso()
    await db.appointments.update_one(
        {"id": appt_id, "vendor_id": user["vendor_id"]}, {"$set": updates}
    )
    updated = await db.appointments.find_one(
        {"id": appt_id, "vendor_id": user["vendor_id"]}, {"_id": 0}
    )
    return updated


# ------------------------------ Customer Appointment Management --------------
class CustomerAppointmentLookupReq(BaseModel):
    phone: Optional[str] = None
    email: Optional[str] = None


@api_router.post("/public/appointments/lookup")
async def customer_lookup_appointments(req: CustomerAppointmentLookupReq, vendor_id: str):
    """Allow customers to view their appointments by providing phone or email.
    Public endpoint (no auth required) - customers access via chat or link."""
    if not req.phone and not req.email:
        raise HTTPException(status_code=400, detail="Phone or email required")
    
    query = {"vendor_id": vendor_id}
    if req.phone:
        # Normalize phone number for matching (strip spaces, dashes)
        phone_clean = re.sub(r'[^\d+]', '', req.phone)
        query["customer_contact"] = {"$regex": phone_clean, "$options": "i"}
    elif req.email:
        query["customer_contact"] = {"$regex": re.escape(req.email), "$options": "i"}
    
    appointments = await db.appointments.find(
        query, {"_id": 0}
    ).sort("scheduled_at", -1).to_list(50)
    
    return {"appointments": appointments}


class CustomerAppointmentUpdateReq(BaseModel):
    scheduled_at: Optional[str] = None
    notes: Optional[str] = None
    action: Optional[str] = None  # "cancel" or "reschedule"


@api_router.patch("/public/appointments/{appt_id}")
async def customer_update_appointment(appt_id: str, req: CustomerAppointmentUpdateReq):
    """Allow customers to update or cancel their appointments.
    Public endpoint - customers access via confirmation email link."""
    appt = await db.appointments.find_one({"id": appt_id}, {"_id": 0})
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    
    updates = {"updated_at": now_iso()}
    change_log = []
    
    if req.action == "cancel":
        updates["status"] = "cancelled_by_customer"
        updates["cancelled_at"] = now_iso()
        change_log.append("Cancelled by customer")
    elif req.action == "reschedule" and req.scheduled_at:
        old_time = appt.get("scheduled_at", "")
        updates["scheduled_at"] = req.scheduled_at
        updates["status"] = "rescheduled_by_customer"
        updates["rescheduled_at"] = now_iso()
        change_log.append(f"Rescheduled by customer from {old_time} to {req.scheduled_at}")
    
    if req.notes:
        old_notes = appt.get("notes", "")
        updates["notes"] = f"{old_notes}\n[Customer update]: {req.notes}" if old_notes else req.notes
        change_log.append(f"Customer added note: {req.notes}")
    
    if not updates or len(updates) == 1:  # Only has updated_at
        return appt
    
    # Add change log to appointment
    if change_log:
        updates["customer_changes"] = appt.get("customer_changes", []) + [{
            "timestamp": now_iso(),
            "changes": change_log
        }]
    
    await db.appointments.update_one({"id": appt_id}, {"$set": updates})
    
    # Notify vendor about customer change
    try:
        vendor = await db.vendors.find_one({"id": appt["vendor_id"]}, {"_id": 0})
        if vendor and vendor.get("email"):
            await _send_vendor_appointment_change_notification(vendor, appt, change_log)
    except Exception as e:
        logger.warning("Failed to notify vendor of customer appointment change: %s", e)
    
    updated = await db.appointments.find_one({"id": appt_id}, {"_id": 0})
    return updated


# ------------------------------ Channels -------------------------------------
@api_router.get("/channels")
async def list_channels(user: dict = Depends(require_vendor)):
    items = await db.channels.find(
        {"vendor_id": user["vendor_id"]}, {"_id": 0}
    ).to_list(100)
    return items


@api_router.put("/channels/{channel}")
async def update_channel(channel: str, payload: ChannelUpdate, user: dict = Depends(require_vendor)):
    update = {"status": payload.status, "updated_at": now_iso()}
    if payload.config is not None:
        update["config"] = payload.config
    await db.channels.update_one(
        {"vendor_id": user["vendor_id"], "channel": channel}, {"$set": update}
    )
    return await db.channels.find_one(
        {"vendor_id": user["vendor_id"], "channel": channel}, {"_id": 0}
    )


# ------------------------------ Analytics ------------------------------------
async def _analytics_for(vendor_filter: Dict[str, Any]) -> Dict[str, Any]:
    total_convs = await db.conversations.count_documents(vendor_filter)
    resolved = await db.conversations.count_documents({**vendor_filter, "status": "resolved"})
    appts = await db.appointments.count_documents(vendor_filter)
    total_msgs = await db.messages.count_documents(vendor_filter)

    by_channel: Dict[str, int] = defaultdict(int)
    convs = await db.conversations.find(vendor_filter, {"_id": 0, "channel": 1, "created_at": 1}).to_list(5000)
    hourly: Dict[int, int] = defaultdict(int)
    daily: Dict[str, int] = defaultdict(int)
    now = datetime.now(timezone.utc)
    seven_days_ago = now - timedelta(days=7)
    for c in convs:
        by_channel[c.get("channel", "web")] += 1
        try:
            dt = datetime.fromisoformat(c["created_at"])
            if dt >= seven_days_ago:
                daily[dt.strftime("%Y-%m-%d")] += 1
            hourly[dt.hour] += 1
        except Exception:
            pass

    # ensure 7 days present
    daily_series = []
    for i in range(6, -1, -1):
        d = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        daily_series.append({"date": d, "count": daily.get(d, 0)})
    hourly_series = [{"hour": h, "count": hourly.get(h, 0)} for h in range(24)]

    return {
        "totals": {
            "conversations": total_convs,
            "resolved": resolved,
            "appointments": appts,
            "messages": total_msgs,
            "resolution_rate": round((resolved / total_convs) * 100, 1) if total_convs else 0,
        },
        "by_channel": [{"channel": k, "count": v} for k, v in by_channel.items()],
        "daily": daily_series,
        "hourly": hourly_series,
    }


@api_router.get("/analytics")
async def analytics(user: dict = Depends(require_vendor)):
    return await _analytics_for({"vendor_id": user["vendor_id"]})


# ------------------------------ Superadmin -----------------------------------
@api_router.get("/admin/vendors")
async def admin_vendors(user: dict = Depends(require_admin)):
    vendors = await db.vendors.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    # enrich with counts
    for v in vendors:
        v["conversations"] = await db.conversations.count_documents({"vendor_id": v["id"]})
        v["appointments"] = await db.appointments.count_documents({"vendor_id": v["id"]})
        u = await db.users.find_one({"vendor_id": v["id"], "role": "vendor"}, {"_id": 0, "password_hash": 0})
        v["owner"] = u
    return vendors


@api_router.put("/admin/vendors/{vid}/status")
async def admin_vendor_status(vid: str, payload: VendorStatusUpdate, user: dict = Depends(require_admin)):
    if payload.status not in ("active", "suspended"):
        raise HTTPException(status_code=400, detail="Invalid status")
    await db.vendors.update_one({"id": vid}, {"$set": {"status": payload.status}})
    return await db.vendors.find_one({"id": vid}, {"_id": 0})


@api_router.get("/admin/analytics")
async def admin_analytics(user: dict = Depends(require_admin)):
    total_vendors = await db.vendors.count_documents({})
    active_vendors = await db.vendors.count_documents({"status": "active"})
    base = await _analytics_for({})
    base["totals"]["vendors"] = total_vendors
    base["totals"]["active_vendors"] = active_vendors
    # vendor leaderboard
    leaderboard = []
    async for v in db.vendors.find({}, {"_id": 0}):
        c = await db.conversations.count_documents({"vendor_id": v["id"]})
        leaderboard.append({"vendor": v["name"], "conversations": c})
    leaderboard.sort(key=lambda x: x["conversations"], reverse=True)
    base["leaderboard"] = leaderboard[:10]
    return base


# ------------------------------ Public bot info ------------------------------
@api_router.get("/public/bot/{vendor_id}")
async def public_bot(vendor_id: str):
    vendor = await db.vendors.find_one({"id": vendor_id}, {"_id": 0})
    bot = await db.bots.find_one({"vendor_id": vendor_id}, {"_id": 0})
    if not vendor or not bot or vendor.get("status") == "suspended":
        raise HTTPException(status_code=404, detail="Not found")
    return {
        "vendor_name": vendor["name"],
        "bot_name": bot.get("bot_name", "BotNira"),
        "greeting": bot.get("greeting", "Hi!"),
    }


@api_router.get("/")
async def root():
    return {"service": "BotNira", "status": "ok"}



# ============================== WhatsApp Cloud API ==========================
import httpx


async def _whatsapp_send(phone_number_id: str, to: str, text: str, access_token: str):
    """Send a text message via Meta Graph API. Works only within 24h of the user's last message."""
    url = f"{GRAPH_BASE}/{phone_number_id}/messages"
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    body = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
        "type": "text",
        "text": {"preview_url": False, "body": text[:4000]},
    }
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(url, headers=headers, json=body)
        if r.status_code >= 400:
            logger.warning("whatsapp send failed %s: %s", r.status_code, r.text[:300])
            return None
        return r.json()


@api_router.get("/whatsapp/status")
async def whatsapp_status(user: dict = Depends(require_vendor)):
    wc = await db.whatsapp_connections.find_one({"vendor_id": user["vendor_id"]}, {"_id": 0})
    return {"connection": wc, "ready_to_connect": bool(META_APP_ID and META_SYSTEM_USER_TOKEN)}


@api_router.get("/whatsapp/phone-verification")
async def whatsapp_phone_verification(user: dict = Depends(require_vendor)):
    """Live-check the phone number's Cloud API registration state. Runs a
    Graph API lookup so vendors see real-time `code_verification_status`
    (VERIFIED / EXPIRED / NOT_VERIFIED). Used by the Channels page to
    decide whether to show the 'Activate messaging' button."""
    wc = await db.whatsapp_connections.find_one({"vendor_id": user["vendor_id"]}, {"_id": 0})
    if not wc:
        raise HTTPException(status_code=404, detail="WhatsApp not connected")
    token = wc.get("access_token") or META_SYSTEM_USER_TOKEN
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(
            f"{GRAPH_BASE}/{wc['phone_number_id']}",
            params={"fields": "display_phone_number,verified_name,quality_rating,"
                              "code_verification_status,name_status,messaging_limit_tier,"
                              "status,platform_type"},
            headers={"Authorization": f"Bearer {token}"},
        )
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Meta returned {r.status_code}: {r.text[:200]}")
    data = r.json()
    cvs = (data.get("code_verification_status") or "").upper()
    phone_status = (data.get("status") or "").upper()
    platform = (data.get("platform_type") or "").upper()
    # `code_verification_status` reflects the PIN-verification *history* on
    # Meta and can be EXPIRED even on numbers that are actively sending +
    # receiving (e.g., a number registered by a previous BSP and migrated
    # to Cloud API on-platform). The ACTUAL operational signal is
    # status=CONNECTED — that means Meta is actively delivering inbound
    # messages to our webhook AND accepting outbound sends. `platform_type`
    # is supplementary (when present, "CLOUD_API" is the only value that
    # matters here; older numbers may return it empty).
    is_operational = (phone_status == "CONNECTED") and (platform in {"CLOUD_API", ""})
    is_cloud_ready = is_operational
    needs_release = (cvs == "VERIFIED") and not is_cloud_ready
    # Only suggest re-registration when the number ISN'T operational AND
    # Meta says the verification slot is empty/expired.
    needs_registration = (not is_operational) and (cvs in {"EXPIRED", "NOT_VERIFIED", ""})
    return {
        "phone_number_id": wc["phone_number_id"],
        "display_phone_number": data.get("display_phone_number"),
        "verified_name": data.get("verified_name"),
        "quality_rating": data.get("quality_rating"),
        "code_verification_status": data.get("code_verification_status"),
        "name_status": data.get("name_status"),
        "messaging_limit_tier": data.get("messaging_limit_tier"),
        "status": data.get("status"),
        "platform_type": data.get("platform_type"),
        "needs_registration": needs_registration,
        "needs_release": needs_release,
        "registered": is_cloud_ready,
    }


class WhatsAppRegisterReq(BaseModel):
    pin: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


@api_router.post("/whatsapp/register-phone")
async def whatsapp_register_phone(req: WhatsAppRegisterReq, user: dict = Depends(require_vendor)):
    """Activate the connected WhatsApp phone for Cloud API messaging.
    Calls `POST /{phone_number_id}/register` with the vendor's 6-digit
    two-step verification PIN — without this, Meta accepts outbound
    messages but won't actually deliver them, and inbound messages stay
    on a single tick. Run by the vendor after Embedded Signup."""
    wc = await db.whatsapp_connections.find_one({"vendor_id": user["vendor_id"]}, {"_id": 0})
    if not wc:
        raise HTTPException(status_code=404, detail="Connect WhatsApp before activating messaging.")
    token = wc.get("access_token") or META_SYSTEM_USER_TOKEN
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(
            f"{GRAPH_BASE}/{wc['phone_number_id']}/register",
            params={"messaging_product": "whatsapp", "pin": req.pin},
            headers={"Authorization": f"Bearer {token}"},
        )
    if r.status_code >= 400:
        # Meta returns very actionable messages — surface them straight to the vendor
        try:
            err = r.json().get("error", {})
            msg = err.get("error_user_msg") or err.get("message") or r.text[:200]
        except Exception:
            msg = r.text[:200]
        raise HTTPException(status_code=400, detail=f"Meta rejected the PIN: {msg}")
    logger.info("[wa register] phone %s registered for vendor %s",
                wc["phone_number_id"], user["vendor_id"])
    return {"ok": True, "registered": True}


# ----- WhatsApp Business Profile (vendor-facing, lives at Meta side) -------
# Lets the vendor edit the public profile shown to their customers (About,
# Description, Address, Email, Websites, Vertical, Profile picture). Meta
# does NOT expose business-hours / greeting-message via Cloud API — those
# remain in business.facebook.com.
_WA_PROFILE_FIELDS = "about,address,description,email,vertical,websites,profile_picture_url,messaging_product"
_WA_VERTICALS = {
    "UNDEFINED", "OTHER", "AUTO", "BEAUTY", "APPAREL", "EDU",
    "ENTERTAIN", "EVENT_PLAN", "FINANCE", "GROCERY", "GOVT",
    "HOTEL", "HEALTH", "NONPROFIT", "PROF_SERVICES", "RETAIL",
    "TRAVEL", "RESTAURANT", "NOT_A_BIZ",
}


async def _require_wa_conn(user: dict) -> dict:
    wc = await db.whatsapp_connections.find_one({"vendor_id": user["vendor_id"]}, {"_id": 0})
    if not wc:
        raise HTTPException(status_code=404, detail="Connect WhatsApp first.")
    return wc


@api_router.get("/whatsapp/profile")
async def whatsapp_profile_get(user: dict = Depends(require_vendor)):
    wc = await _require_wa_conn(user)
    token = wc.get("access_token") or META_SYSTEM_USER_TOKEN
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(
            f"{GRAPH_BASE}/{wc['phone_number_id']}/whatsapp_business_profile",
            params={"fields": _WA_PROFILE_FIELDS},
            headers={"Authorization": f"Bearer {token}"},
        )
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Meta returned {r.status_code}: {r.text[:200]}")
    data = (r.json().get("data") or [{}])[0]
    return {
        "about": data.get("about") or "",
        "address": data.get("address") or "",
        "description": data.get("description") or "",
        "email": data.get("email") or "",
        "websites": data.get("websites") or [],
        "vertical": data.get("vertical") or "UNDEFINED",
        "profile_picture_url": data.get("profile_picture_url") or "",
    }


class WhatsAppProfilePatch(BaseModel):
    about: Optional[str] = Field(None, max_length=139)
    address: Optional[str] = Field(None, max_length=256)
    description: Optional[str] = Field(None, max_length=512)
    email: Optional[str] = Field(None, max_length=128)
    websites: Optional[List[str]] = None
    vertical: Optional[str] = None


@api_router.patch("/whatsapp/profile")
async def whatsapp_profile_patch(req: WhatsAppProfilePatch, user: dict = Depends(require_vendor)):
    wc = await _require_wa_conn(user)
    token = wc.get("access_token") or META_SYSTEM_USER_TOKEN
    body: Dict[str, Any] = {"messaging_product": "whatsapp"}
    if req.about is not None:
        body["about"] = req.about.strip()
    if req.address is not None:
        body["address"] = req.address.strip()
    if req.description is not None:
        body["description"] = req.description.strip()
    if req.email is not None:
        body["email"] = req.email.strip()
    if req.websites is not None:
        # Meta accepts max 2 websites
        body["websites"] = [w.strip() for w in req.websites if w and w.strip()][:2]
    if req.vertical is not None:
        v = req.vertical.upper().strip()
        if v not in _WA_VERTICALS:
            raise HTTPException(status_code=400, detail=f"Invalid vertical. Allowed: {sorted(_WA_VERTICALS)}")
        body["vertical"] = v
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(
            f"{GRAPH_BASE}/{wc['phone_number_id']}/whatsapp_business_profile",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=body,
        )
    if r.status_code >= 400:
        try:
            err = r.json().get("error", {})
            msg = err.get("error_user_msg") or err.get("message") or r.text[:200]
        except Exception:
            msg = r.text[:200]
        raise HTTPException(status_code=400, detail=f"Meta rejected the change: {msg}")
    return {"ok": True}


@api_router.post("/whatsapp/profile/photo")
async def whatsapp_profile_photo(
    file: UploadFile = File(...),
    user: dict = Depends(require_vendor),
):
    """Upload a profile picture using Meta's **Resumable Upload API** (NOT the
    WhatsApp media API). The two return different identifiers:
      • /{phone_number_id}/media → returns a media ID (used for sending
        media inside conversations). This is NOT accepted by the profile
        endpoint and triggers `Check the handle provided for the uploaded
        media in the request`.
      • /{app_id}/uploads → returns an upload session, then a true file
        handle (e.g. `4::aW1hZ2U/anBlZw==:...`) — THIS is what
        `profile_picture_handle` requires.
    """
    wc = await _require_wa_conn(user)
    token = wc.get("access_token") or META_SYSTEM_USER_TOKEN
    if not META_APP_ID:
        raise HTTPException(status_code=500, detail="META_APP_ID is not configured on the server. Add it to backend/.env.")
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image is too large (5 MB max).")
    mime = file.content_type or "image/jpeg"
    if mime not in ("image/jpeg", "image/png"):
        raise HTTPException(status_code=400, detail="Use a JPG or PNG image.")

    # ── Step 1: Create a Resumable Upload session ────────────────────────
    # POST /{app-id}/uploads with file_length + file_type → returns
    # {"id": "upload:SESSION_ID"} that we use as the next URL.
    async with httpx.AsyncClient(timeout=30) as c:
        sess = await c.post(
            f"{GRAPH_BASE}/{META_APP_ID}/uploads",
            headers={"Authorization": f"Bearer {token}"},
            params={"file_length": str(len(raw)), "file_type": mime},
        )
    if sess.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Meta upload-session create failed: {sess.text[:300]}")
    session_id = (sess.json() or {}).get("id") or ""
    if not session_id:
        raise HTTPException(status_code=502, detail="Meta did not return an upload session id.")

    # ── Step 2: Upload bytes to the session ──────────────────────────────
    # POST /upload:SESSION_ID with the raw binary body. Note: this leg
    # uses `Authorization: OAuth <token>` (NOT Bearer) per Meta's spec,
    # and `file_offset: 0` to indicate a fresh upload (no resume).
    async with httpx.AsyncClient(timeout=120) as c:
        up = await c.post(
            f"{GRAPH_BASE}/{session_id}",
            headers={
                "Authorization": f"OAuth {token}",
                "file_offset": "0",
                "Content-Type": mime,
            },
            content=raw,
        )
    if up.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Meta upload failed: {up.text[:300]}")
    handle = (up.json() or {}).get("h") or ""
    if not handle:
        raise HTTPException(status_code=502, detail="Meta did not return a file handle (`h`).")

    # ── Step 3: Attach handle to the business profile ────────────────────
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(
            f"{GRAPH_BASE}/{wc['phone_number_id']}/whatsapp_business_profile",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"messaging_product": "whatsapp", "profile_picture_handle": handle},
        )
    if r.status_code >= 400:
        try:
            err = r.json().get("error", {})
            msg = err.get("error_user_msg") or err.get("message") or r.text[:200]
        except Exception:
            msg = r.text[:200]
        raise HTTPException(status_code=400, detail=f"Couldn't apply profile picture: {msg}")
    return {"ok": True, "media_handle": handle}


class WhatsAppConnectReq(BaseModel):
    phone_number_id: str
    waba_id: str
    display_phone_number: Optional[str] = ""
    access_token: Optional[str] = ""  # use master token if not provided


@api_router.post("/whatsapp/connect")
async def whatsapp_connect(req: WhatsAppConnectReq, user: dict = Depends(require_vendor)):
    """Manually bind a WhatsApp phone_number_id + WABA to the current vendor.
    Used by the Embedded Signup success callback (and by superadmin for the test number)."""
    conn = {
        "id": new_id(),
        "vendor_id": user["vendor_id"],
        "phone_number_id": req.phone_number_id,
        "waba_id": req.waba_id,
        "display_phone_number": req.display_phone_number or "",
        "access_token": req.access_token or META_SYSTEM_USER_TOKEN,
        "status": "active",
        "created_at": now_iso(),
    }
    await db.whatsapp_connections.replace_one(
        {"vendor_id": user["vendor_id"]}, conn, upsert=True
    )
    await db.channels.update_one(
        {"vendor_id": user["vendor_id"], "channel": "whatsapp"},
        {"$set": {"status": "connected", "updated_at": now_iso()}},
    )
    # Subscribe WABA to our app's webhook + override per-phone webhook so inbound
    # messages land at BotNira even if the WABA is also shared with another app.
    base_webhook = f"{PUBLIC_BASE_URL}/api/whatsapp/webhook"
    webhook_status = {"subscribed": False, "error": None}
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            # Subscribe WABA to app
            r1 = await c.post(
                f"{GRAPH_BASE}/{req.waba_id}/subscribed_apps",
                headers={"Authorization": f"Bearer {META_SYSTEM_USER_TOKEN}"},
            )
            if r1.status_code >= 400:
                error_msg = f"WABA subscription failed (HTTP {r1.status_code}): {r1.text[:200]}"
                logger.error(error_msg)
                webhook_status["error"] = error_msg
                raise HTTPException(
                    status_code=502,
                    detail=f"WhatsApp webhook subscription failed. Please check your WABA ID and try again. Error: {r1.text[:150]}"
                )
            
            # Override webhook on phone number
            r2 = await c.post(
                f"{GRAPH_BASE}/{req.phone_number_id}",
                headers={"Authorization": f"Bearer {META_SYSTEM_USER_TOKEN}"},
                params={
                    "webhook_configuration": json.dumps({
                        "override_callback_uri": base_webhook,
                        "verify_token": META_VERIFY_TOKEN,
                    })
                },
            )
            if r2.status_code >= 400:
                error_msg = f"Webhook override failed (HTTP {r2.status_code}): {r2.text[:200]}"
                logger.error(error_msg)
                webhook_status["error"] = error_msg
                raise HTTPException(
                    status_code=502,
                    detail=f"WhatsApp webhook configuration failed. Please check your Phone Number ID and try again. Error: {r2.text[:150]}"
                )
            
            webhook_status["subscribed"] = True
            logger.info("WhatsApp webhook subscribed successfully for vendor %s", user["vendor_id"])
    except HTTPException:
        # Re-raise HTTP exceptions (webhook subscription failures)
        raise
    except Exception as e:
        error_msg = f"Webhook subscription error: {str(e)}"
        logger.error("WhatsApp connect subscription/override failed: %s", e)
        webhook_status["error"] = error_msg
        raise HTTPException(
            status_code=502,
            detail=f"Failed to configure WhatsApp webhooks. Please verify your credentials and try again. Error: {str(e)[:150]}"
        )
    
    return {"status": "connected", "connection": conn, "webhook": webhook_status}


@api_router.post("/whatsapp/disconnect")
async def whatsapp_disconnect(user: dict = Depends(require_vendor)):
    await db.whatsapp_connections.update_one(
        {"vendor_id": user["vendor_id"]},
        {"$set": {"status": "inactive", "disconnected_at": now_iso()}},
    )
    await db.channels.update_one(
        {"vendor_id": user["vendor_id"], "channel": "whatsapp"},
        {"$set": {"status": "disconnected", "updated_at": now_iso()}},
    )
    return {"status": "inactive"}


class WhatsAppTestReq(BaseModel):
    to: str
    message: Optional[str] = "Hi! This is a test message from BotNira."


@api_router.post("/whatsapp/test-send")
async def whatsapp_test_send(req: WhatsAppTestReq, user: dict = Depends(require_vendor)):
    wc = await db.whatsapp_connections.find_one(
        {"vendor_id": user["vendor_id"], "status": "active"}, {"_id": 0}
    )
    if not wc:
        raise HTTPException(status_code=400, detail="WhatsApp not connected")
    to = req.to.strip().lstrip("+")
    resp = await _whatsapp_send(wc["phone_number_id"], to, req.message, wc["access_token"])
    if not resp:
        raise HTTPException(status_code=502, detail=(
            "Meta rejected the send. Likely reasons: the recipient hasn't messaged you "
            "within the last 24 hours (session window), OR (on test numbers) the recipient "
            "is not in your allowed-recipients list (add them in WhatsApp → Getting Started)."
        ))
    return {"ok": True, "message_id": (resp.get("messages") or [{}])[0].get("id")}


# --- WhatsApp message templates (24h+ session re-engagement) -----------------
class WhatsAppTemplateCreateReq(BaseModel):
    name: str
    language: str = "en_US"
    category: str = "MARKETING"  # MARKETING | UTILITY | AUTHENTICATION
    body_text: str
    body_example_vars: Optional[List[str]] = None  # sample values for {{1}}, {{2}}...
    header_text: Optional[str] = None
    footer_text: Optional[str] = None


class WhatsAppTemplateSendReq(BaseModel):
    to: str
    template_name: str
    language: str = "en_US"
    body_vars: Optional[List[str]] = None  # ordered values for {{1}}, {{2}}...


def _normalize_template_name(name: str) -> str:
    """Meta requires lowercase, alphanumerics + underscores only, max 512 chars."""
    n = re.sub(r"[^a-z0-9_]", "_", (name or "").lower().strip()).strip("_")
    return n[:512]


@api_router.get("/whatsapp/templates")
async def whatsapp_templates_list(user: dict = Depends(require_vendor)):
    """List all message templates registered on the vendor's WABA (live from Meta)."""
    wc = await db.whatsapp_connections.find_one(
        {"vendor_id": user["vendor_id"], "status": "active"}, {"_id": 0}
    )
    if not wc:
        raise HTTPException(status_code=400, detail="WhatsApp not connected")
    if not wc.get("waba_id"):
        raise HTTPException(status_code=400, detail="WABA ID missing on connection")
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get(
                f"{GRAPH_BASE}/{wc['waba_id']}/message_templates",
                headers={"Authorization": f"Bearer {wc['access_token']}"},
                params={"limit": 100, "fields": "name,language,status,category,components,id"},
            )
            if r.status_code >= 400:
                logger.warning("WA template list failed %s: %s", r.status_code, r.text[:300])
                raise HTTPException(status_code=502, detail=f"Meta API error: {r.text[:200]}")
            data = r.json()
            return {"templates": data.get("data", [])}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("WA template list error")
        raise HTTPException(status_code=502, detail=str(e))


@api_router.post("/whatsapp/templates")
async def whatsapp_templates_create(
    req: WhatsAppTemplateCreateReq, user: dict = Depends(require_vendor)
):
    """Submit a new template for Meta approval. Approval is typically minutes to a few hours."""
    wc = await db.whatsapp_connections.find_one(
        {"vendor_id": user["vendor_id"], "status": "active"}, {"_id": 0}
    )
    if not wc:
        raise HTTPException(status_code=400, detail="WhatsApp not connected")
    if not wc.get("waba_id"):
        raise HTTPException(status_code=400, detail="WABA ID missing on connection")

    cat = (req.category or "MARKETING").upper()
    if cat not in {"MARKETING", "UTILITY", "AUTHENTICATION"}:
        raise HTTPException(status_code=400, detail="category must be MARKETING, UTILITY, or AUTHENTICATION")
    name = _normalize_template_name(req.name)
    if not name:
        raise HTTPException(status_code=400, detail="Template name is required (a-z, 0-9, _)")
    if not (req.body_text and req.body_text.strip()):
        raise HTTPException(status_code=400, detail="Body text is required")

    components: List[dict] = []
    if req.header_text and req.header_text.strip():
        components.append({"type": "HEADER", "format": "TEXT", "text": req.header_text.strip()[:60]})

    body_comp: dict = {"type": "BODY", "text": req.body_text.strip()[:1024]}
    # Detect {{1}}..{{N}} placeholders and attach example values if provided
    placeholders = sorted({int(m.group(1)) for m in re.finditer(r"\{\{\s*(\d+)\s*\}\}", req.body_text)})
    if placeholders:
        examples = req.body_example_vars or []
        # Pad with safe defaults so Meta accepts the example
        padded = list(examples) + [f"Sample {i}" for i in range(len(examples) + 1, len(placeholders) + 1)]
        body_comp["example"] = {"body_text": [padded[: len(placeholders)]]}
    components.append(body_comp)

    if req.footer_text and req.footer_text.strip():
        components.append({"type": "FOOTER", "text": req.footer_text.strip()[:60]})

    payload = {
        "name": name,
        "language": req.language or "en_US",
        "category": cat,
        "components": components,
    }
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(
                f"{GRAPH_BASE}/{wc['waba_id']}/message_templates",
                headers={
                    "Authorization": f"Bearer {wc['access_token']}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            if r.status_code >= 400:
                logger.warning("WA template create failed %s: %s", r.status_code, r.text[:400])
                raise HTTPException(status_code=502, detail=f"Meta API error: {r.text[:300]}")
            return {"ok": True, "template": r.json(), "submitted_name": name}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("WA template create error")
        raise HTTPException(status_code=502, detail=str(e))


@api_router.delete("/whatsapp/templates")
async def whatsapp_templates_delete(
    name: str, hsm_id: Optional[str] = None, user: dict = Depends(require_vendor)
):
    """Delete a template by name (and optional HSM/template id for disambiguation)."""
    wc = await db.whatsapp_connections.find_one(
        {"vendor_id": user["vendor_id"], "status": "active"}, {"_id": 0}
    )
    if not wc:
        raise HTTPException(status_code=400, detail="WhatsApp not connected")
    if not wc.get("waba_id"):
        raise HTTPException(status_code=400, detail="WABA ID missing on connection")
    params = {"name": name}
    if hsm_id:
        params["hsm_id"] = hsm_id
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.delete(
                f"{GRAPH_BASE}/{wc['waba_id']}/message_templates",
                headers={"Authorization": f"Bearer {wc['access_token']}"},
                params=params,
            )
            if r.status_code >= 400:
                raise HTTPException(status_code=502, detail=f"Meta API error: {r.text[:300]}")
            return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("WA template delete error")
        raise HTTPException(status_code=502, detail=str(e))


@api_router.post("/whatsapp/send-template")
async def whatsapp_send_template(
    req: WhatsAppTemplateSendReq, user: dict = Depends(require_vendor)
):
    """Send an approved template to a recipient. Use this to re-engage outside the 24h window."""
    ok, reason = await _vendor_can_use_channel(user["vendor_id"], "whatsapp")
    if not ok:
        raise HTTPException(status_code=402, detail=reason)
    wc = await db.whatsapp_connections.find_one(
        {"vendor_id": user["vendor_id"], "status": "active"}, {"_id": 0}
    )
    if not wc:
        raise HTTPException(status_code=400, detail="WhatsApp not connected")

    to = (req.to or "").strip().lstrip("+")
    if not to:
        raise HTTPException(status_code=400, detail="Recipient phone is required")

    template_payload: dict = {
        "name": req.template_name,
        "language": {"code": req.language or "en_US"},
    }
    if req.body_vars:
        template_payload["components"] = [{
            "type": "body",
            "parameters": [{"type": "text", "text": str(v)} for v in req.body_vars],
        }]

    body = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
        "type": "template",
        "template": template_payload,
    }
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(
                f"{GRAPH_BASE}/{wc['phone_number_id']}/messages",
                headers={
                    "Authorization": f"Bearer {wc['access_token']}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
            if r.status_code >= 400:
                logger.warning("WA template send failed %s: %s", r.status_code, r.text[:400])
                raise HTTPException(status_code=502, detail=f"Meta API error: {r.text[:300]}")
            resp = r.json()
            mid = (resp.get("messages") or [{}])[0].get("id")
            # Decrement message quota
            await _decrement_message_balance(user["vendor_id"])
            return {"ok": True, "message_id": mid}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("WA template send error")
        raise HTTPException(status_code=502, detail=str(e))


# --- Meta webhook: GET verifies, POST receives messages ----------------------
from fastapi import Request as _FastAPIRequest
from fastapi.responses import PlainTextResponse


@api_router.get("/whatsapp/webhook")
async def whatsapp_verify(request: _FastAPIRequest):
    params = request.query_params
    if params.get("hub.mode") == "subscribe" and params.get("hub.verify_token") == META_VERIFY_TOKEN:
        return PlainTextResponse(params.get("hub.challenge", ""))
    return PlainTextResponse("forbidden", status_code=403)


@api_router.post("/whatsapp/webhook")
async def whatsapp_webhook(request: _FastAPIRequest):
    payload = await request.json()
    logger.info("[wa webhook] %s", json.dumps(payload)[:600])
    try:
        entries = payload.get("entry", []) or []
        for entry in entries:
            for change in entry.get("changes", []) or []:
                value = change.get("value", {}) or {}
                md = value.get("metadata", {}) or {}
                phone_number_id = md.get("phone_number_id")
                if not phone_number_id:
                    continue
                wc = await db.whatsapp_connections.find_one(
                    {"phone_number_id": phone_number_id, "status": "active"}, {"_id": 0}
                )
                if not wc:
                    logger.warning("WhatsApp webhook for unbound phone_number_id %s", phone_number_id)
                    continue
                vendor_id = wc["vendor_id"]

                # Inbound messages from customers
                for msg in value.get("messages", []) or []:
                    if msg.get("type") != "text":
                        continue
                    wa_from = msg.get("from", "")
                    text = ((msg.get("text") or {}).get("body") or "").strip()
                    if not text:
                        continue
                    contacts = value.get("contacts", []) or []
                    name = ""
                    if contacts and contacts[0].get("profile"):
                        name = contacts[0]["profile"].get("name", "")

                    # find or create conversation keyed by wa_from
                    conv = await db.conversations.find_one(
                        {"vendor_id": vendor_id, "channel": "whatsapp", "customer_contact": wa_from},
                        {"_id": 0},
                    )
                    conv = conv or await _ensure_conversation(
                        vendor_id, None, "whatsapp", name or wa_from, wa_from
                    )
                    # Capture the number into the vendor's "Inbox Leads"
                    # WhatsApp marketing list (best-effort, never blocks reply).
                    try:
                        from sales_routes import capture_inbox_lead
                        await capture_inbox_lead(vendor_id, wa_from, name)
                    except Exception:
                        pass
                    await _push_message(conv["id"], vendor_id, "user", text)
                    # Gate: vendor must have active plan + messages balance
                    ok, reason = await _vendor_can_use_channel(vendor_id, "whatsapp")
                    if not ok:
                        try:
                            await _whatsapp_send(phone_number_id, wa_from, reason, wc["access_token"])
                        except Exception as e:
                            logger.warning("paywall notice send failed: %s", e)
                        continue
                    # AI reply grounded in vendor's bot
                    reply = await get_ai_reply(vendor_id, conv["id"], text)
                    await _push_message(conv["id"], vendor_id, "bot", reply)
                    await _decrement_message_balance(vendor_id)
                    # Send reply back to the customer on WhatsApp
                    try:
                        await _whatsapp_send(phone_number_id, wa_from, reply, wc["access_token"])
                    except Exception as e:
                        logger.warning("send reply failed: %s", e)
                    # auto-book appointment if confirmed
                    try:
                        await _maybe_book_appointment(vendor_id, conv["id"], reply)
                    except Exception:
                        pass
    except Exception as e:
        logger.exception("whatsapp webhook error: %s", e)
    return {"ok": True}


@api_router.get("/whatsapp/embedded-signup-config")
async def whatsapp_embedded_signup_config(user: dict = Depends(require_vendor)):
    """Returns the JS params the frontend needs to launch Meta's Embedded Signup popup.
    config_id is optional until App Review is complete; without it, we fall back to
    a manual 'paste-your-test-number' flow that superadmin can use right now."""
    return {
        "app_id": META_APP_ID,
        "config_id": os.environ.get("META_EMBEDDED_SIGNUP_CONFIG_ID", ""),
        "graph_version": "v22.0",
    }


class EmbeddedSignupExchangeReq(BaseModel):
    code: str
    # Optional fallback Meta posts via JS postMessage — contains
    # waba_id + phone_number_id directly. Used when Graph API's
    # debug_token comes back without granular_scopes (some rollouts).
    session_info: Optional[Dict[str, Any]] = None


@api_router.post("/whatsapp/embedded-signup/exchange")
async def whatsapp_embedded_signup_exchange(
    req: EmbeddedSignupExchangeReq,
    user: dict = Depends(require_vendor),
):
    """Exchange the short-lived auth code from Meta's Embedded Signup popup for
    a durable business token, discover the WABA + phone_number_id the vendor
    just authorised, and bind them to this vendor in BotNira.
    """
    if not META_APP_ID or not META_APP_SECRET:
        raise HTTPException(status_code=503, detail="Meta app not configured")

    # 1) Exchange code → access token
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(
            f"{GRAPH_BASE}/oauth/access_token",
            params={
                "client_id": META_APP_ID,
                "client_secret": META_APP_SECRET,
                "code": req.code,
            },
        )
        if r.status_code >= 400:
            raise HTTPException(status_code=400, detail=f"Meta token exchange failed: {r.text[:300]}")
        token_data = r.json()
        vendor_token = token_data.get("access_token")
        if not vendor_token:
            raise HTTPException(status_code=400, detail="Meta did not return an access token")

        # 2) Discover the WABAs the vendor granted us access to
        r = await c.get(
            f"{GRAPH_BASE}/debug_token",
            params={"input_token": vendor_token, "access_token": META_SYSTEM_USER_TOKEN or vendor_token},
        )
        granular = r.json().get("data", {}).get("granular_scopes", [])
        waba_ids: list = []
        for g in granular:
            if g.get("scope") == "whatsapp_business_management":
                waba_ids = g.get("target_ids", [])
                break
        # Fallback — Meta sometimes returns granular_scopes without WABA
        # targets even when authorisation succeeded. The frontend's
        # session_info captures waba_id directly from the popup.
        if not waba_ids and req.session_info:
            si = req.session_info
            if si.get("waba_id"):
                waba_ids = [si["waba_id"]]
                logger.info("[wa embedded signup] using session_info fallback waba_id=%s", si["waba_id"])
        if not waba_ids:
            raise HTTPException(
                status_code=400,
                detail=("No WhatsApp Business Account was authorised in this signup. "
                        "Make sure you select your business + the WABA + the phone number on every step of the popup."),
            )
        waba_id = waba_ids[0]

        # 3) Find the phone number inside that WABA
        r = await c.get(
            f"{GRAPH_BASE}/{waba_id}/phone_numbers",
            headers={"Authorization": f"Bearer {vendor_token}"},
        )
        phones = r.json().get("data", [])
        if not phones:
            raise HTTPException(status_code=400, detail="The authorised WABA has no phone numbers yet.")
        phone = phones[0]
        phone_number_id = phone.get("id")
        display_phone_number = phone.get("display_phone_number", "")

        # 4) Subscribe our app to this WABA + override webhook on the phone
        webhook_status = {"subscribed": False, "error": None}
        try:
            r1 = await c.post(
                f"{GRAPH_BASE}/{waba_id}/subscribed_apps",
                headers={"Authorization": f"Bearer {vendor_token}"},
            )
            if r1.status_code >= 400:
                error_msg = f"Embedded signup WABA subscription failed: {r1.text[:200]}"
                logger.error(error_msg)
                webhook_status["error"] = error_msg
                raise HTTPException(
                    status_code=502,
                    detail=f"Failed to subscribe WhatsApp webhooks. Error: {r1.text[:150]}"
                )
            
            r2 = await c.post(
                f"{GRAPH_BASE}/{phone_number_id}",
                headers={"Authorization": f"Bearer {vendor_token}"},
                params={
                    "webhook_configuration": json.dumps({
                        "override_callback_uri": f"{PUBLIC_BASE_URL}/api/whatsapp/webhook",
                        "verify_token": META_VERIFY_TOKEN,
                    })
                },
            )
            if r2.status_code >= 400:
                error_msg = f"Embedded signup webhook override failed: {r2.text[:200]}"
                logger.error(error_msg)
                webhook_status["error"] = error_msg
                raise HTTPException(
                    status_code=502,
                    detail=f"Failed to configure WhatsApp webhook. Error: {r2.text[:150]}"
                )
            
            webhook_status["subscribed"] = True
            logger.info("Embedded signup webhook configured successfully for vendor %s", user["vendor_id"])
        except HTTPException:
            raise
        except Exception as e:
            logger.error("Post-signup subscription failed: %s", e)
            raise HTTPException(
                status_code=502,
                detail=f"Webhook configuration error: {str(e)[:150]}"
            )

    # 5) Save connection for this vendor
    conn = {
        "id": new_id(),
        "vendor_id": user["vendor_id"],
        "phone_number_id": phone_number_id,
        "waba_id": waba_id,
        "display_phone_number": display_phone_number,
        "access_token": vendor_token,
        "status": "active",
        "is_meta_test": False,
        "onboarded_via": "embedded_signup",
        "created_at": now_iso(),
    }
    await db.whatsapp_connections.replace_one(
        {"vendor_id": user["vendor_id"]}, conn, upsert=True
    )
    await db.channels.update_one(
        {"vendor_id": user["vendor_id"], "channel": "whatsapp"},
        {"$set": {"status": "connected", "updated_at": now_iso()}},
    )
    return {"status": "connected", "connection": conn, "webhook": webhook_status}


# ============================== Billing / Stripe ============================
from fastapi import Request as _StripeRequest


def _plan_for_vendor(vendor: dict) -> dict:
    """Computes the effective access profile for a vendor.
    Returns {trial, trial_days_left, paywall, allowed_channels, plan_label, ...}.
    Exempt vendors bypass everything."""
    if not vendor:
        return {"paywall": True, "trial": False, "allowed_channels": set(), "plan_label": "none", "is_exempt": False}
    if vendor.get("is_exempt"):
        return {
            "paywall": False, "trial": False, "trial_days_left": 0,
            "allowed_channels": {"web", "whatsapp", "email", "sms", "voice"},
            "plan_label": "exempt", "is_exempt": True,
            "minutes_balance": 999999.0, "messages_balance": 999999,
        }
    sub_status = vendor.get("subscription_status", "trialing")
    now = datetime.now(timezone.utc)
    trial_ends_iso = vendor.get("trial_ends_at")
    in_trial = False
    trial_days_left = 0
    if sub_status == "trialing" and trial_ends_iso:
        try:
            trial_ends = datetime.fromisoformat(trial_ends_iso.replace("Z", "+00:00"))
            if trial_ends > now:
                in_trial = True
                trial_days_left = max(0, (trial_ends - now).days + (1 if (trial_ends - now).seconds > 0 else 0))
        except Exception:
            pass
    if in_trial:
        return {
            "paywall": False, "trial": True, "trial_days_left": trial_days_left,
            "allowed_channels": set(TRIAL_ALLOWED_CHANNELS),
            "plan_label": "trial", "is_exempt": False,
            "minutes_balance": float(vendor.get("minutes_balance", 0.0)),
            "messages_balance": int(vendor.get("messages_balance", 0)),
        }
    # Active paying subscription — channels restricted per PLANS config
    if sub_status == "active":
        plan_key = vendor.get("plan", "starter")
        plan_cfg = PLANS.get(plan_key) or PLANS["starter"]
        return {
            "paywall": False, "trial": False, "trial_days_left": 0,
            "allowed_channels": set(plan_cfg.get("channels") or ["web", "whatsapp", "email", "sms", "voice"]),
            "plan_label": plan_key, "is_exempt": False,
            "minutes_balance": float(vendor.get("minutes_balance", 0.0)),
            "messages_balance": int(vendor.get("messages_balance", 0)),
        }
    # Trial ended, or past_due / canceled / none → paywall
    return {
        "paywall": True, "trial": False, "trial_days_left": 0,
        "allowed_channels": set(),
        "plan_label": "none", "is_exempt": False,
        "minutes_balance": float(vendor.get("minutes_balance", 0.0)),
        "messages_balance": int(vendor.get("messages_balance", 0)),
    }


async def _vendor_can_use_channel(vendor_id: str, channel: str) -> tuple[bool, str]:
    """Gate check before AI reply / channel send. Returns (ok, reason)."""
    vendor = await db.vendors.find_one({"id": vendor_id}, {"_id": 0})
    access = _plan_for_vendor(vendor)
    if access["is_exempt"]:
        return True, ""
    if access["paywall"]:
        return False, "Your free trial has ended. Please subscribe to a plan to continue."
    if channel not in access["allowed_channels"]:
        if access["trial"]:
            return False, f"The {channel} channel is locked during trial. Upgrade to unlock."
        return False, f"The {channel} channel is not included in your current plan. Upgrade to unlock."
    # balance check
    if channel == "voice":
        if access["minutes_balance"] <= 0:
            return False, "Voice minutes exhausted. Please recharge to continue."
    else:
        if access["messages_balance"] <= 0:
            return False, "AI messages exhausted. Please recharge or upgrade your plan."
    return True, ""


async def _decrement_message_balance(vendor_id: str):
    """Consumes 1 AI message from the vendor's balance. Exempt vendors skip."""
    vendor = await db.vendors.find_one({"id": vendor_id}, {"_id": 0, "is_exempt": 1, "messages_balance": 1})
    if not vendor or vendor.get("is_exempt"):
        return
    await db.vendors.update_one(
        {"id": vendor_id},
        {"$inc": {"messages_balance": -1, "messages_used_total": 1}},
    )


async def _ensure_stripe_prices():
    """Create Stripe Products + Prices for plans and topups if missing.
    Idempotent: looks up by metadata.botnira_key."""
    if not STRIPE_SECRET_KEY:
        logger.warning("Stripe not configured — skipping price provisioning")
        return
    try:
        # Fetch all products with botnira metadata
        existing = {}
        starting_after = None
        while True:
            kwargs = {"limit": 100, "active": True}
            if starting_after:
                kwargs["starting_after"] = starting_after
            resp = _stripe.Product.list(**kwargs)
            for p in resp.data:
                try:
                    md = p.to_dict().get("metadata") or {}
                except Exception:
                    md = {}
                k = md.get("botnira_key")
                if k:
                    existing[k] = p
            if not resp.has_more:
                break
            starting_after = resp.data[-1].id

        # Plans → recurring monthly prices
        for key, cfg in PLANS.items():
            bk = f"plan_{key}"
            product = existing.get(bk)
            if not product:
                product = _stripe.Product.create(
                    name=f"BotNira {cfg['name']} Plan",
                    metadata={"botnira_key": bk, "type": "plan", "plan_id": key},
                )
                logger.info("Created Stripe product %s -> %s", bk, product.id)
            # Find a recurring price on this product
            prices = _stripe.Price.list(product=product.id, active=True, limit=10)
            match = None
            for pr in prices.data:
                if pr.type == "recurring" and pr.unit_amount == int(cfg["price_usd"] * 100) and pr.currency == "usd":
                    match = pr
                    break
            if not match:
                match = _stripe.Price.create(
                    product=product.id,
                    unit_amount=int(cfg["price_usd"] * 100),
                    currency="usd",
                    recurring={"interval": "month"},
                    metadata={"botnira_key": bk, "plan_id": key},
                )
                logger.info("Created recurring price %s -> %s", bk, match.id)
            STRIPE_PRICE_IDS["plans"][key] = match.id

        # Topups → one-time prices
        for key, cfg in TOPUPS.items():
            bk = f"topup_{key}"
            product = existing.get(bk)
            if not product:
                product = _stripe.Product.create(
                    name=f"BotNira {cfg['name']} Top-up ({cfg['voice_min']} min + {cfg['messages']} msgs)",
                    metadata={"botnira_key": bk, "type": "topup", "pack_id": key},
                )
                logger.info("Created Stripe product %s -> %s", bk, product.id)
            prices = _stripe.Price.list(product=product.id, active=True, limit=10)
            match = None
            for pr in prices.data:
                if pr.type == "one_time" and pr.unit_amount == int(cfg["price_usd"] * 100) and pr.currency == "usd":
                    match = pr
                    break
            if not match:
                match = _stripe.Price.create(
                    product=product.id,
                    unit_amount=int(cfg["price_usd"] * 100),
                    currency="usd",
                    metadata={"botnira_key": bk, "pack_id": key},
                )
                logger.info("Created one-time price %s -> %s", bk, match.id)
            STRIPE_PRICE_IDS["topups"][key] = match.id
        logger.info("Stripe price provisioning complete: %s", STRIPE_PRICE_IDS)
    except Exception as e:
        logger.exception("Stripe price provisioning failed: %s", e)


async def _ensure_hst_tax_rate():
    """Find or create the 13% HST Stripe Tax Rate. Stored in HST_TAX_RATE_ID
    and attached to every checkout session so Stripe shows the tax line on
    checkout, the receipt email, and the invoice PDF."""
    global HST_TAX_RATE_ID
    if not STRIPE_SECRET_KEY:
        return
    try:
        rates = _stripe.TaxRate.list(active=True, limit=100)
        # Stripe's StripeObject doesn't support .get() — must use bracket
        # access wrapped in try/except.
        botnira_rates = []
        for tr in rates.data:
            try:
                key = tr.metadata["botnira_key"]
            except Exception:
                key = None
            if key == "hst_13":
                botnira_rates.append(tr)
        if botnira_rates:
            # Keep the oldest one, archive any duplicates from past runs.
            botnira_rates.sort(key=lambda x: x.created)
            HST_TAX_RATE_ID = botnira_rates[0].id
            for dup in botnira_rates[1:]:
                try:
                    _stripe.TaxRate.modify(dup.id, active=False)
                    logger.info("Archived duplicate HST rate %s", dup.id)
                except Exception:
                    pass
            logger.info("Using HST tax rate %s", HST_TAX_RATE_ID)
            return
        tr = _stripe.TaxRate.create(
            display_name="HST",
            description="Harmonized Sales Tax (Canada)",
            jurisdiction="CA",
            percentage=HST_RATE_PERCENT,
            inclusive=False,
            metadata={"botnira_key": "hst_13"},
        )
        HST_TAX_RATE_ID = tr.id
        logger.info("Created HST tax rate %s (%.0f%%)", tr.id, HST_RATE_PERCENT)
    except Exception as e:
        logger.exception("Failed to provision HST tax rate: %s", e)


@app.on_event("startup")
async def startup_stripe():
    # Backfill billing fields on existing vendors (idempotent migration).
    # CRITICAL: trial_ends_at must be derived from the vendor's actual
    # created_at, NOT from "now". Otherwise every backend restart silently
    # extends old vendors' trials. Migration only applies to vendors that
    # have no subscription_status yet (i.e. never been touched).
    try:
        async for v in db.vendors.find({}, {"_id": 0, "id": 1, "plan": 1, "created_at": 1, "is_exempt": 1, "subscription_status": 1, "trial_ends_at": 1}):
            updates = {}
            if "subscription_status" not in v or v.get("subscription_status") is None:
                # Pre-existing vendors → trial = created_at + TRIAL_DAYS.
                created_iso = v.get("created_at") or now_iso()
                try:
                    created_dt = datetime.fromisoformat(created_iso.replace("Z", "+00:00"))
                except Exception:
                    created_dt = datetime.now(timezone.utc)
                updates["subscription_status"] = "trialing"
                updates["trial_ends_at"] = (created_dt + timedelta(days=TRIAL_DAYS)).isoformat()
                updates["minutes_balance"] = 0.0
                updates["messages_balance"] = TRIAL_MESSAGE_CAP
                updates["plan_minutes_monthly"] = 0
                updates["plan_messages_monthly"] = 0
                updates["plan"] = "trial"
            if updates:
                await db.vendors.update_one({"id": v["id"]}, {"$set": updates})

        # One-shot correction for vendors whose trial_ends_at was previously
        # set to "now + TRIAL_DAYS" by an older migration. We detect these by
        # the gap between created_at and trial_ends_at being far larger than
        # TRIAL_DAYS, and rewrite to created_at + TRIAL_DAYS.
        async for v in db.vendors.find(
            {"subscription_status": "trialing", "trial_ends_at": {"$exists": True}, "is_exempt": {"$ne": True}},
            {"_id": 0, "id": 1, "created_at": 1, "trial_ends_at": 1},
        ):
            try:
                created_dt = datetime.fromisoformat(v["created_at"].replace("Z", "+00:00"))
                trial_end_dt = datetime.fromisoformat(v["trial_ends_at"].replace("Z", "+00:00"))
                gap_days = (trial_end_dt - created_dt).total_seconds() / 86400
                # If gap is larger than TRIAL_DAYS + 0.5 day tolerance, repair it.
                if gap_days > (TRIAL_DAYS + 0.5):
                    correct = (created_dt + timedelta(days=TRIAL_DAYS)).isoformat()
                    await db.vendors.update_one(
                        {"id": v["id"]},
                        {"$set": {"trial_ends_at": correct}},
                    )
                    logger.info(
                        "Repaired drifted trial_ends_at for vendor %s: was %s → now %s",
                        v["id"], v["trial_ends_at"], correct,
                    )
            except Exception:
                continue

        # Ensure kamal (test vendor) is exempt and has messages_balance high
        kamal_user = await db.users.find_one({"email": "kamal@thedigisparrow.com"}, {"_id": 0})
        if kamal_user and kamal_user.get("vendor_id"):
            await db.vendors.update_one(
                {"id": kamal_user["vendor_id"]},
                {"$set": {
                    "is_exempt": True,
                    "plan": "exempt",
                    "subscription_status": "exempt",
                    "minutes_balance": 999999.0,
                    "messages_balance": 999999,
                }},
            )
    except Exception as e:
        logger.warning("Vendor billing migration failed: %s", e)
    # Provision Stripe products/prices
    await _ensure_stripe_prices()
    # Provision HST 13% tax rate
    await _ensure_hst_tax_rate()


@api_router.get("/billing/plans")
async def billing_plans():
    """Public — list plans + topups for pricing page."""
    return {
        "plans": [
            {"id": k, **v, "stripe_price_id": STRIPE_PRICE_IDS["plans"].get(k)}
            for k, v in PLANS.items()
        ],
        "topups": [
            {"id": k, **v, "stripe_price_id": STRIPE_PRICE_IDS["topups"].get(k)}
            for k, v in TOPUPS.items()
        ],
        "trial_days": TRIAL_DAYS,
        "tax_rate_percent": HST_RATE_PERCENT,
        "tax_label": "HST",
        "tax_jurisdiction": "Canada",
    }


@api_router.get("/billing/me")
async def billing_me(user: dict = Depends(require_vendor)):
    vendor = await db.vendors.find_one({"id": user["vendor_id"]}, {"_id": 0})
    access = _plan_for_vendor(vendor)
    return {
        "vendor_id": vendor["id"],
        "plan": vendor.get("plan", "trial"),
        "subscription_status": vendor.get("subscription_status", "trialing"),
        "trial_ends_at": vendor.get("trial_ends_at"),
        "current_period_end": vendor.get("current_period_end"),
        "minutes_balance": float(vendor.get("minutes_balance", 0.0)),
        "messages_balance": int(vendor.get("messages_balance", 0)),
        "plan_minutes_monthly": int(vendor.get("plan_minutes_monthly", 0)),
        "plan_messages_monthly": int(vendor.get("plan_messages_monthly", 0)),
        "is_exempt": bool(vendor.get("is_exempt")),
        "access": {
            "paywall": access["paywall"],
            "trial": access["trial"],
            "trial_days_left": access["trial_days_left"],
            "allowed_channels": sorted(list(access["allowed_channels"])),
            "plan_label": access["plan_label"],
        },
        "stripe_customer_id": vendor.get("stripe_customer_id"),
    }


async def _get_or_create_stripe_customer(vendor: dict, email: str) -> str:
    cid = vendor.get("stripe_customer_id")
    if cid:
        return cid
    c = _stripe.Customer.create(
        email=email,
        name=vendor.get("name"),
        metadata={"vendor_id": vendor["id"]},
    )
    await db.vendors.update_one({"id": vendor["id"]}, {"$set": {"stripe_customer_id": c.id}})
    return c.id


class CheckoutReq(BaseModel):
    plan: Optional[str] = None
    pack: Optional[str] = None
    origin_url: str


@api_router.post("/billing/checkout/subscription")
async def checkout_subscription(req: CheckoutReq, user: dict = Depends(require_vendor)):
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Billing not configured")
    if req.plan not in PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")
    price_id = STRIPE_PRICE_IDS["plans"].get(req.plan)
    if not price_id:
        raise HTTPException(status_code=503, detail="Plan price not provisioned yet")
    vendor = await db.vendors.find_one({"id": user["vendor_id"]}, {"_id": 0})
    if vendor.get("is_exempt"):
        raise HTTPException(status_code=400, detail="Exempt account — billing disabled")
    cust_id = await _get_or_create_stripe_customer(vendor, user["email"])
    origin = req.origin_url.rstrip("/")
    line_item = {"price": price_id, "quantity": 1}
    if HST_TAX_RATE_ID:
        line_item["tax_rates"] = [HST_TAX_RATE_ID]
    sub_data = {"metadata": {"vendor_id": vendor["id"], "plan": req.plan}}
    if HST_TAX_RATE_ID:
        sub_data["default_tax_rates"] = [HST_TAX_RATE_ID]
    session = _stripe.checkout.Session.create(
        mode="subscription",
        customer=cust_id,
        line_items=[line_item],
        success_url=f"{origin}/app/billing?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{origin}/app/billing?cancelled=1",
        metadata={
            "vendor_id": vendor["id"],
            "type": "subscription",
            "plan": req.plan,
        },
        subscription_data=sub_data,
    )
    await db.payment_transactions.insert_one({
        "id": new_id(),
        "vendor_id": vendor["id"],
        "session_id": session.id,
        "type": "subscription",
        "plan": req.plan,
        "amount": PLANS[req.plan]["price_usd"],
        "currency": "usd",
        "status": "initiated",
        "created_at": now_iso(),
    })
    return {"url": session.url, "session_id": session.id}


@api_router.post("/billing/checkout/topup")
async def checkout_topup(req: CheckoutReq, user: dict = Depends(require_vendor)):
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Billing not configured")
    if req.pack not in TOPUPS:
        raise HTTPException(status_code=400, detail="Invalid top-up pack")
    price_id = STRIPE_PRICE_IDS["topups"].get(req.pack)
    if not price_id:
        raise HTTPException(status_code=503, detail="Top-up price not provisioned yet")
    vendor = await db.vendors.find_one({"id": user["vendor_id"]}, {"_id": 0})
    if vendor.get("is_exempt"):
        raise HTTPException(status_code=400, detail="Exempt account — billing disabled")
    cust_id = await _get_or_create_stripe_customer(vendor, user["email"])
    origin = req.origin_url.rstrip("/")
    line_item = {"price": price_id, "quantity": 1}
    if HST_TAX_RATE_ID:
        line_item["tax_rates"] = [HST_TAX_RATE_ID]
    session = _stripe.checkout.Session.create(
        mode="payment",
        customer=cust_id,
        line_items=[line_item],
        success_url=f"{origin}/app/billing?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{origin}/app/billing?cancelled=1",
        metadata={
            "vendor_id": vendor["id"],
            "type": "topup",
            "pack": req.pack,
        },
    )
    await db.payment_transactions.insert_one({
        "id": new_id(),
        "vendor_id": vendor["id"],
        "session_id": session.id,
        "type": "topup",
        "pack": req.pack,
        "amount": TOPUPS[req.pack]["price_usd"],
        "currency": "usd",
        "status": "initiated",
        "created_at": now_iso(),
    })
    return {"url": session.url, "session_id": session.id}


async def _apply_successful_payment(session_id: str, vendor_id: str, txn_type: str, plan_or_pack: str):
    """Idempotently apply successful payment: grant balance or activate sub.
    Guards against double-apply via payment_transactions.status='completed'.
    Auto-creates a payment_transactions row if missing (e.g. webhook fires for a
    session that was created on a different deployment, or our DB lost the row)."""
    txn = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not txn:
        # Reconstruct a transaction record from Stripe metadata so the user has
        # a payment history row, even when the original create call didn't reach
        # this database.
        amt = 0.0
        if txn_type == "subscription" and plan_or_pack in PLANS:
            amt = PLANS[plan_or_pack]["price_usd"]
        elif txn_type == "topup" and plan_or_pack in TOPUPS:
            amt = TOPUPS[plan_or_pack]["price_usd"]
        await db.payment_transactions.insert_one({
            "id": new_id(),
            "vendor_id": vendor_id,
            "session_id": session_id,
            "type": txn_type,
            "plan" if txn_type == "subscription" else "pack": plan_or_pack,
            "amount": amt,
            "currency": "usd",
            "status": "initiated",
            "created_at": now_iso(),
            "reconstructed": True,
        })
        txn = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if txn.get("status") == "completed":
        return  # already applied
    if txn_type == "topup":
        pack = TOPUPS.get(plan_or_pack)
        if pack:
            await db.vendors.update_one(
                {"id": vendor_id},
                {"$inc": {"minutes_balance": pack["voice_min"], "messages_balance": pack["messages"]}},
            )
    elif txn_type == "subscription":
        plan = PLANS.get(plan_or_pack)
        if plan:
            await db.vendors.update_one(
                {"id": vendor_id},
                {"$set": {
                    "plan": plan_or_pack,
                    "subscription_status": "active",
                    "plan_minutes_monthly": plan["voice_min"],
                    "plan_messages_monthly": plan["messages"],
                    # On activation: set balance to plan allotment (overrides trial leftover)
                    "minutes_balance": float(plan["voice_min"]),
                    "messages_balance": int(plan["messages"]),
                    "activated_at": now_iso(),
                }},
            )
    await db.payment_transactions.update_one(
        {"session_id": session_id},
        {"$set": {"status": "completed", "completed_at": now_iso()}},
    )
    # Fire-and-forget: send the customer their welcome / receipt email.
    try:
        await _send_purchase_confirmation_email(vendor_id, session_id, txn_type, plan_or_pack)
    except Exception as e:
        logger.warning("Purchase confirmation email failed: %s", e)


@api_router.get("/billing/checkout/status/{session_id}")
async def checkout_status(session_id: str, user: dict = Depends(require_vendor)):
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Billing not configured")
    session = _stripe.checkout.Session.retrieve(session_id)
    md = session.metadata or {}
    if md.get("vendor_id") != user["vendor_id"]:
        raise HTTPException(status_code=403, detail="Session not for this vendor")
    if session.payment_status == "paid":
        txn_type = md.get("type")
        key = md.get("plan") or md.get("pack")
        if txn_type and key:
            sub_id = session.subscription
            if sub_id and txn_type == "subscription":
                # store sub id + period end
                try:
                    sub = _stripe.Subscription.retrieve(sub_id)
                    await db.vendors.update_one(
                        {"id": user["vendor_id"]},
                        {"$set": {
                            "stripe_subscription_id": sub_id,
                            "current_period_end": datetime.fromtimestamp(
                                sub.current_period_end, tz=timezone.utc
                            ).isoformat() if getattr(sub, "current_period_end", None) else None,
                        }},
                    )
                except Exception as e:
                    logger.warning("subscription retrieve failed: %s", e)
            await _apply_successful_payment(session_id, user["vendor_id"], txn_type, key)
    return {
        "status": session.status,
        "payment_status": session.payment_status,
        "amount_total": session.amount_total,
        "currency": session.currency,
        "metadata": dict(md),
    }


@api_router.get("/billing/payments")
async def billing_payments(user: dict = Depends(require_vendor)):
    """Full payment history for the logged-in vendor. Used to render the
    'Payment history' table on the Billing page."""
    rows = await db.payment_transactions.find(
        {"vendor_id": user["vendor_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)

    # For each completed/refunded txn, look up the Stripe-hosted invoice or
    # receipt URL on demand. We cache it back into the document so subsequent
    # loads are fast.
    enriched = []
    for r in rows:
        invoice_url = r.get("invoice_url") or ""
        receipt_url = r.get("receipt_url") or ""
        if (
            STRIPE_SECRET_KEY
            and r.get("status") in ("completed", "refunded", "partially_refunded")
            and r.get("session_id", "").startswith("cs_")
            and not (invoice_url or receipt_url)
        ):
            try:
                sess = _stripe.checkout.Session.retrieve(r["session_id"])
                inv_id = getattr(sess, "invoice", None)
                if inv_id:
                    inv = _stripe.Invoice.retrieve(inv_id)
                    invoice_url = getattr(inv, "hosted_invoice_url", "") or ""
                pi_id = getattr(sess, "payment_intent", None)
                if pi_id:
                    pi = _stripe.PaymentIntent.retrieve(pi_id)
                    charges = getattr(pi, "charges", None)
                    if charges and charges.data:
                        receipt_url = getattr(charges.data[0], "receipt_url", "") or ""
                if invoice_url or receipt_url:
                    await db.payment_transactions.update_one(
                        {"id": r["id"]},
                        {"$set": {"invoice_url": invoice_url, "receipt_url": receipt_url}},
                    )
            except Exception as e:
                logger.debug("Stripe link lookup failed for %s: %s", r.get("session_id"), e)

        subtotal = float(r.get("amount", 0))
        tax = round(subtotal * (HST_RATE_PERCENT / 100.0), 2)
        total = round(subtotal + tax, 2)
        enriched.append({
            "id": r.get("id"),
            "session_id": r.get("session_id"),
            "type": r.get("type"),
            "plan_or_pack": r.get("plan") or r.get("pack"),
            "amount": subtotal,
            "tax": tax,
            "total": total,
            "currency": r.get("currency", "usd"),
            "status": r.get("status", "initiated"),
            "created_at": r.get("created_at"),
            "completed_at": r.get("completed_at"),
            "refunded_at": r.get("refunded_at"),
            "refunded_amount": r.get("refunded_amount"),
            "invoice_url": invoice_url,
            "receipt_url": receipt_url,
        })
    return {"payments": enriched, "tax_rate_percent": HST_RATE_PERCENT}


@api_router.post("/billing/sync")
async def billing_sync(user: dict = Depends(require_vendor)):
    """Reconcile the vendor's Stripe state to the local DB.

    Use case: a payment succeeded on Stripe but the webhook + frontend
    redirect both failed (e.g. the success_url pointed at a domain whose
    SSL was still propagating). Calling this endpoint fetches the active
    subscription + recent paid checkout sessions for this vendor's Stripe
    customer and applies any that haven't been applied yet.

    Idempotent — safe to call any number of times.
    """
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Billing not configured")
    vendor = await db.vendors.find_one({"id": user["vendor_id"]}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    if vendor.get("is_exempt"):
        return {"applied": 0, "note": "Exempt account — nothing to sync"}

    cust_id = vendor.get("stripe_customer_id")
    # If we don't have a customer_id locally, search Stripe by the user's email
    # — covers the case where the vendor record was rebuilt after payment.
    if not cust_id:
        try:
            customers = _stripe.Customer.list(email=user["email"], limit=5)
            for c in customers.data:
                cmd = (c.metadata or {})
                if cmd.get("vendor_id") == vendor["id"]:
                    cust_id = c.id
                    await db.vendors.update_one(
                        {"id": vendor["id"]},
                        {"$set": {"stripe_customer_id": cust_id}},
                    )
                    break
            # fallback: if there's exactly one customer with this email and no
            # other vendor uses it, claim it
            if not cust_id and len(customers.data) == 1:
                candidate = customers.data[0].id
                taken = await db.vendors.find_one(
                    {"stripe_customer_id": candidate, "id": {"$ne": vendor["id"]}},
                    {"_id": 0, "id": 1},
                )
                if not taken:
                    cust_id = candidate
                    await db.vendors.update_one(
                        {"id": vendor["id"]},
                        {"$set": {"stripe_customer_id": cust_id}},
                    )
        except Exception as e:
            logger.warning("billing_sync customer lookup failed: %s", e)
    if not cust_id:
        raise HTTPException(
            status_code=400,
            detail="No Stripe customer on file. Start a checkout first."
        )

    applied = 0
    summary = []

    # 1) Active subscription for this customer.
    # We record ANY non-terminal sub status, but only grant the plan benefits
    # (top up balance, set plan slug) when Stripe says it's actually "active".
    # Trialing / past_due / incomplete must NOT unlock channels.
    try:
        subs = _stripe.Subscription.list(customer=cust_id, status="all", limit=10)
        # Prefer truly active subs first; fall back to any other status so we
        # at least record the relationship in the DB.
        live_sub = next((s for s in subs.data if s.status == "active"), None)
        any_sub = live_sub or next(
            (s for s in subs.data if s.status in ("trialing", "past_due", "unpaid", "incomplete")),
            None,
        )
        if any_sub:
            # Map price -> plan slug
            plan_slug = None
            try:
                pid = any_sub.items.data[0].price.id
                for slug, price_id in STRIPE_PRICE_IDS.get("plans", {}).items():
                    if price_id == pid:
                        plan_slug = slug
                        break
            except Exception:
                pass
            updates = {
                "stripe_subscription_id": any_sub.id,
                "subscription_status": any_sub.status,
            }
            cpe = getattr(any_sub, "current_period_end", None)
            if cpe:
                updates["current_period_end"] = datetime.fromtimestamp(
                    cpe, tz=timezone.utc
                ).isoformat()
            # Plan + balance grant ONLY if subscription is actually active.
            if any_sub.status == "active" and plan_slug and plan_slug in PLANS:
                p = PLANS[plan_slug]
                updates.update({
                    "plan": plan_slug,
                    "plan_minutes_monthly": p["voice_min"],
                    "plan_messages_monthly": p["messages"],
                })
                # Only top up the balance if vendor has not already received this
                # plan's allotment (don't keep adding on every sync click).
                already = await db.payment_transactions.find_one({
                    "vendor_id": vendor["id"],
                    "type": "subscription",
                    "plan": plan_slug,
                    "status": "completed",
                }, {"_id": 0})
                if not already:
                    updates["minutes_balance"] = float(p["voice_min"])
                    updates["messages_balance"] = int(p["messages"])
                    updates["activated_at"] = now_iso()
            await db.vendors.update_one({"id": vendor["id"]}, {"$set": updates})
            summary.append(f"Subscription {any_sub.id[:18]}… ({any_sub.status}, plan={plan_slug or 'unknown'})")
    except Exception as e:
        logger.warning("billing_sync subs fetch failed: %s", e)

    # 2) Recent paid checkout sessions belonging to this vendor
    try:
        sessions = _stripe.checkout.Session.list(customer=cust_id, limit=20)
        for s in sessions.data:
            if s.payment_status != "paid":
                continue
            md = dict(s.metadata or {})
            # Only fulfill sessions explicitly tagged for THIS vendor
            if md.get("vendor_id") != vendor["id"]:
                continue
            txn_type = md.get("type")
            key = md.get("plan") or md.get("pack")
            if not txn_type or not key:
                continue
            existing = await db.payment_transactions.find_one(
                {"session_id": s.id}, {"_id": 0}
            )
            if existing and existing.get("status") == "completed":
                continue
            await _apply_successful_payment(s.id, vendor["id"], txn_type, key)
            applied += 1
            summary.append(f"Applied {txn_type}={key} from session {s.id[:18]}…")
    except Exception as e:
        logger.warning("billing_sync sessions fetch failed: %s", e)

    return {"applied": applied, "summary": summary, "customer_id": cust_id}


@api_router.get("/billing/usage")
async def billing_usage(user: dict = Depends(require_vendor)):
    """Per-period usage breakdown for the Billing page.

    Voice minutes (calls only) and AI messages (web/whatsapp/email/sms — every
    bot-or-agent reply) are counted separately. Returns plan allotment, top-up
    boost, used so far this period, remaining, and a 14-day daily timeline.
    """
    vendor = await db.vendors.find_one({"id": user["vendor_id"]}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    is_exempt = bool(vendor.get("is_exempt"))
    plan_slug = vendor.get("plan", "trial")
    plan_minutes = 0
    plan_messages = 0
    if plan_slug in PLANS and vendor.get("subscription_status") == "active":
        plan_minutes = int(PLANS[plan_slug]["voice_min"])
        plan_messages = int(PLANS[plan_slug]["messages"])
    elif plan_slug == "trial":
        plan_messages = TRIAL_MESSAGE_CAP

    # Period bounds. For active subs use the Stripe current_period_end - 30d,
    # for trials use vendor.created_at, and for canceled/exempt fall back to
    # the current calendar month.
    now = datetime.now(timezone.utc)
    period_end_iso = vendor.get("current_period_end")
    period_end = None
    period_start = None
    try:
        if period_end_iso:
            period_end = datetime.fromisoformat(period_end_iso.replace("Z", "+00:00"))
            period_start = period_end - timedelta(days=30)
    except Exception:
        period_end = None
    if not period_start:
        if vendor.get("subscription_status") == "trialing" and vendor.get("trial_ends_at"):
            try:
                te = datetime.fromisoformat(vendor["trial_ends_at"].replace("Z", "+00:00"))
                period_start = te - timedelta(days=TRIAL_DAYS)
                period_end = te
            except Exception:
                pass
    if not period_start:
        # fallback: this calendar month
        period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        period_end = (period_start + timedelta(days=32)).replace(day=1) - timedelta(seconds=1)
    period_start_iso = period_start.isoformat()
    period_end_iso2 = period_end.isoformat() if period_end else None

    # Sum minutes from call_records this period
    minutes_used = 0.0
    cursor = db.call_records.aggregate([
        {"$match": {
            "vendor_id": user["vendor_id"],
            "started_at": {"$gte": period_start_iso},
            "status": {"$ne": "in-progress"},
        }},
        {"$group": {"_id": None, "total": {"$sum": "$minutes"}, "calls": {"$sum": 1}}},
    ])
    rows = await cursor.to_list(1)
    if rows:
        minutes_used = round(float(rows[0].get("total") or 0.0), 2)
    calls_count = int(rows[0].get("calls") or 0) if rows else 0

    # Count AI replies (=billable messages) sent by us this period across all chat channels
    msg_per_channel = {}
    async for r in db.messages.aggregate([
        {"$match": {
            "vendor_id": user["vendor_id"],
            "role": {"$in": ["bot", "agent"]},
            "created_at": {"$gte": period_start_iso},
        }},
        {"$lookup": {
            "from": "conversations",
            "localField": "conversation_id",
            "foreignField": "id",
            "as": "conv",
        }},
        {"$unwind": "$conv"},
        {"$match": {"conv.channel": {"$in": ["web", "whatsapp", "email", "sms"]}}},
        {"$group": {"_id": "$conv.channel", "n": {"$sum": 1}}},
    ]):
        msg_per_channel[r["_id"]] = int(r["n"])
    messages_used = sum(msg_per_channel.values())

    # Top-ups added in this period (sum of completed topup transactions)
    topup_minutes = 0.0
    topup_messages = 0
    async for r in db.payment_transactions.aggregate([
        {"$match": {
            "vendor_id": user["vendor_id"],
            "type": "topup",
            "status": "completed",
            "created_at": {"$gte": period_start_iso},
        }},
        {"$group": {"_id": "$pack", "n": {"$sum": 1}}},
    ]):
        pack = TOPUPS.get(r["_id"]) if r["_id"] in TOPUPS else None
        if pack:
            topup_minutes += float(pack["voice_min"]) * r["n"]
            topup_messages += int(pack["messages"]) * r["n"]

    # Daily timeline (14 days back) for sparkline charts
    timeline_start = (now - timedelta(days=14)).isoformat()
    daily = {}
    async for r in db.call_records.aggregate([
        {"$match": {"vendor_id": user["vendor_id"], "started_at": {"$gte": timeline_start}}},
        {"$group": {"_id": {"$substr": ["$started_at", 0, 10]}, "mins": {"$sum": "$minutes"}}},
    ]):
        daily.setdefault(r["_id"], {"day": r["_id"], "minutes": 0, "messages": 0})
        daily[r["_id"]]["minutes"] = round(float(r["mins"] or 0.0), 2)
    async for r in db.messages.aggregate([
        {"$match": {
            "vendor_id": user["vendor_id"],
            "role": {"$in": ["bot", "agent"]},
            "created_at": {"$gte": timeline_start},
        }},
        {"$group": {"_id": {"$substr": ["$created_at", 0, 10]}, "n": {"$sum": 1}}},
    ]):
        daily.setdefault(r["_id"], {"day": r["_id"], "minutes": 0, "messages": 0})
        daily[r["_id"]]["messages"] = int(r["n"])
    timeline = sorted(daily.values(), key=lambda x: x["day"])

    return {
        "is_exempt": is_exempt,
        "plan": plan_slug,
        "subscription_status": vendor.get("subscription_status"),
        "period_start": period_start_iso,
        "period_end": period_end_iso2,
        "balance": {
            "minutes_remaining": float(vendor.get("minutes_balance", 0.0)),
            "messages_remaining": int(vendor.get("messages_balance", 0)),
        },
        "minutes": {
            "plan_included": plan_minutes,
            "topup_added": float(topup_minutes),
            "used_this_period": minutes_used,
            "calls": calls_count,
        },
        "messages": {
            "plan_included": plan_messages,
            "topup_added": int(topup_messages),
            "used_this_period": int(messages_used),
            "by_channel": msg_per_channel,  # {web: N, whatsapp: N, email: N, sms: N}
        },
        "timeline_14d": timeline,
        "refresh_note": "Aggregated dashboard refreshes every 24 hours — your live balance always updates instantly.",
    }


@api_router.post("/billing/portal")
async def billing_portal(payload: Dict[str, str], user: dict = Depends(require_vendor)):
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Billing not configured")
    vendor = await db.vendors.find_one({"id": user["vendor_id"]}, {"_id": 0})
    cid = vendor.get("stripe_customer_id")
    if not cid:
        raise HTTPException(status_code=400, detail="No Stripe customer on file yet")
    origin = (payload.get("origin_url") or "").rstrip("/") or "https://botnira.com"
    session = _stripe.billing_portal.Session.create(
        customer=cid,
        return_url=f"{origin}/app/billing",
    )
    return {"url": session.url}


@api_router.post("/webhook/stripe")
async def stripe_webhook(request: _StripeRequest):
    if not STRIPE_SECRET_KEY:
        return {"ok": False}
    raw = await request.body()
    sig = request.headers.get("stripe-signature", "")
    event = None
    if STRIPE_WEBHOOK_SECRET:
        try:
            event = _stripe.Webhook.construct_event(raw, sig, STRIPE_WEBHOOK_SECRET)
        except Exception as e:
            logger.warning("Stripe webhook signature invalid: %s", e)
            raise HTTPException(status_code=400, detail="Bad signature")
    else:
        # Dev mode — accept without verification
        try:
            event = json.loads(raw.decode("utf-8"))
        except Exception:
            return {"ok": False}
    etype = event["type"] if isinstance(event, dict) else event.type
    data_obj = (event["data"]["object"] if isinstance(event, dict) else event.data.object)

    if etype == "checkout.session.completed":
        md = data_obj.get("metadata") if isinstance(data_obj, dict) else (data_obj.metadata or {})
        vendor_id = md.get("vendor_id")
        txn_type = md.get("type")
        key = md.get("plan") or md.get("pack")
        session_id = data_obj.get("id") if isinstance(data_obj, dict) else data_obj.id
        # CRITICAL: only fulfill when payment is actually paid. For payment
        # methods like ACH/SEPA/BACS/Klarna, the session can complete before
        # the funds clear — payment_status stays "unpaid" until then.
        pay_status = data_obj.get("payment_status") if isinstance(data_obj, dict) else getattr(data_obj, "payment_status", None)
        if vendor_id and txn_type and key and session_id and pay_status == "paid":
            if txn_type == "subscription":
                sub_id = data_obj.get("subscription") if isinstance(data_obj, dict) else data_obj.subscription
                if sub_id:
                    try:
                        sub = _stripe.Subscription.retrieve(sub_id)
                        await db.vendors.update_one(
                            {"id": vendor_id},
                            {"$set": {
                                "stripe_subscription_id": sub_id,
                                "current_period_end": datetime.fromtimestamp(
                                    sub.current_period_end, tz=timezone.utc
                                ).isoformat() if getattr(sub, "current_period_end", None) else None,
                            }},
                        )
                    except Exception as e:
                        logger.warning("sub retrieve failed in webhook: %s", e)
            await _apply_successful_payment(session_id, vendor_id, txn_type, key)

    elif etype == "invoice.paid":
        # Subscription renewal — reset balance to plan allotment
        sub_id = data_obj.get("subscription") if isinstance(data_obj, dict) else data_obj.subscription
        if sub_id:
            vendor = await db.vendors.find_one({"stripe_subscription_id": sub_id}, {"_id": 0})
            if vendor:
                plan = PLANS.get(vendor.get("plan"))
                if plan:
                    await db.vendors.update_one(
                        {"id": vendor["id"]},
                        {"$set": {
                            "subscription_status": "active",
                            "minutes_balance": float(plan["voice_min"]),
                            "messages_balance": int(plan["messages"]),
                            "last_invoice_at": now_iso(),
                        }},
                    )
                # Referral commission accrual — 15% of the subtotal paid on this
                # invoice goes to the vendor that referred this customer.
                try:
                    inv_id = data_obj.get("id") if isinstance(data_obj, dict) else data_obj.id
                    # `amount_paid` is in cents on the invoice object. Prefer
                    # subtotal_excluding_tax when present so HST isn't paid out
                    # as commission.
                    sub_excl = (
                        data_obj.get("subtotal_excluding_tax") if isinstance(data_obj, dict)
                        else getattr(data_obj, "subtotal_excluding_tax", None)
                    )
                    if sub_excl is None:
                        sub_excl = (
                            data_obj.get("subtotal") if isinstance(data_obj, dict)
                            else getattr(data_obj, "subtotal", None)
                        )
                    amount_cents = sub_excl if sub_excl is not None else (
                        data_obj.get("amount_paid") if isinstance(data_obj, dict)
                        else getattr(data_obj, "amount_paid", 0)
                    )
                    amount_usd = (float(amount_cents) / 100.0) if amount_cents else 0.0
                    if amount_usd > 0:
                        await _record_referral_commission(vendor["id"], inv_id or "", amount_usd, now_iso())
                except Exception as e:
                    logger.warning("referral commission record failed: %s", e)

    elif etype == "invoice.payment_failed":
        sub_id = data_obj.get("subscription") if isinstance(data_obj, dict) else data_obj.subscription
        if sub_id:
            await db.vendors.update_one(
                {"stripe_subscription_id": sub_id},
                {"$set": {"subscription_status": "past_due"}},
            )

    elif etype == "customer.subscription.updated":
        sub_id = data_obj.get("id") if isinstance(data_obj, dict) else data_obj.id
        status = data_obj.get("status") if isinstance(data_obj, dict) else data_obj.status
        cpe = data_obj.get("current_period_end") if isinstance(data_obj, dict) else data_obj.current_period_end
        set_doc = {"subscription_status": status}
        if cpe:
            set_doc["current_period_end"] = datetime.fromtimestamp(cpe, tz=timezone.utc).isoformat()
        await db.vendors.update_one({"stripe_subscription_id": sub_id}, {"$set": set_doc})

    elif etype == "customer.subscription.deleted":
        sub_id = data_obj.get("id") if isinstance(data_obj, dict) else data_obj.id
        vendor = await db.vendors.find_one({"stripe_subscription_id": sub_id}, {"_id": 0})
        if vendor:
            vendor_id = vendor["id"]
            await db.vendors.update_one(
                {"id": vendor_id},
                {"$set": {"subscription_status": "canceled", "canceled_at": now_iso()}},
            )
            # Stop future referral commissions for this referred vendor.
            try:
                await _mark_referral_cancelled(vendor_id)
            except Exception as e:
                logger.warning("mark_referral_cancelled failed: %s", e)
            # CRITICAL: Release Twilio phone number to stop billing
            try:
                released = await _release_vendor_phone_number(vendor_id)
                if released:
                    logger.info("Auto-released phone number for canceled subscription: vendor=%s", vendor_id)
            except Exception as e:
                logger.error("Failed to auto-release phone number for vendor %s: %s", vendor_id, e)

    elif etype == "checkout.session.async_payment_succeeded":
        # Fires for delayed-settlement methods (ACH/SEPA/etc.) once funds clear.
        md = data_obj.get("metadata") if isinstance(data_obj, dict) else (data_obj.metadata or {})
        vendor_id = md.get("vendor_id")
        txn_type = md.get("type")
        key = md.get("plan") or md.get("pack")
        session_id = data_obj.get("id") if isinstance(data_obj, dict) else data_obj.id
        if vendor_id and txn_type and key and session_id:
            await _apply_successful_payment(session_id, vendor_id, txn_type, key)

    elif etype == "checkout.session.async_payment_failed":
        session_id = data_obj.get("id") if isinstance(data_obj, dict) else data_obj.id
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"status": "failed", "failed_at": now_iso()}},
        )

    elif etype == "charge.refunded":
        # Mark the underlying payment as refunded so vendor + admin can see it.
        # If full refund of a subscription invoice — also lock channels.
        try:
            charge_amount = data_obj.get("amount") if isinstance(data_obj, dict) else data_obj.amount
            charge_refunded = data_obj.get("amount_refunded") if isinstance(data_obj, dict) else data_obj.amount_refunded
            cust_id = data_obj.get("customer") if isinstance(data_obj, dict) else data_obj.customer
            invoice_id = data_obj.get("invoice") if isinstance(data_obj, dict) else getattr(data_obj, "invoice", None)
            full_refund = bool(charge_amount) and (charge_refunded == charge_amount)

            # Locate vendor by Stripe customer
            vendor = await db.vendors.find_one({"stripe_customer_id": cust_id}, {"_id": 0}) if cust_id else None
            if not vendor:
                logger.info("charge.refunded: no vendor for customer %s", cust_id)
                return {"ok": True}

            # Find which checkout session/payment_transaction this charge belongs to.
            # Strategy: charge.invoice → invoice.subscription → vendor.stripe_subscription_id
            # OR fall back to most recent completed txn.
            target_txn = None
            if invoice_id:
                try:
                    inv = _stripe.Invoice.retrieve(invoice_id)
                    inv_sub = getattr(inv, "subscription", None)
                    if inv_sub:
                        # Find session(s) created for this subscription
                        target_txn = await db.payment_transactions.find_one(
                            {"vendor_id": vendor["id"], "type": "subscription", "status": "completed"},
                            {"_id": 0},
                            sort=[("created_at", -1)],
                        )
                except Exception as e:
                    logger.warning("invoice retrieve in refund handler failed: %s", e)
            if not target_txn:
                # fall back to vendor's most recent completed payment
                target_txn = await db.payment_transactions.find_one(
                    {"vendor_id": vendor["id"], "status": "completed"},
                    {"_id": 0},
                    sort=[("created_at", -1)],
                )

            if target_txn:
                new_status = "refunded" if full_refund else "partially_refunded"
                await db.payment_transactions.update_one(
                    {"id": target_txn["id"]},
                    {"$set": {
                        "status": new_status,
                        "refunded_at": now_iso(),
                        "refunded_amount": (charge_refunded or 0) / 100.0,
                    }},
                )

            # If a full refund of a subscription charge → cancel access immediately.
            if full_refund and target_txn and target_txn.get("type") == "subscription":
                await db.vendors.update_one(
                    {"id": vendor["id"]},
                    {"$set": {
                        "subscription_status": "canceled",
                        "minutes_balance": 0,
                        "messages_balance": 0,
                        "canceled_at": now_iso(),
                        "cancel_reason": "refunded",
                    }},
                )
            # If a full refund of a topup → decrement granted balance.
            elif full_refund and target_txn and target_txn.get("type") == "topup":
                pack_id = target_txn.get("pack")
                pack = TOPUPS.get(pack_id) if pack_id else None
                if pack:
                    await db.vendors.update_one(
                        {"id": vendor["id"]},
                        {"$inc": {
                            "minutes_balance": -float(pack["voice_min"]),
                            "messages_balance": -int(pack["messages"]),
                        }},
                    )
                    # Clamp to zero so we don't go negative
                    v_now = await db.vendors.find_one({"id": vendor["id"]}, {"_id": 0})
                    fix = {}
                    if v_now and v_now.get("minutes_balance", 0) < 0:
                        fix["minutes_balance"] = 0
                    if v_now and v_now.get("messages_balance", 0) < 0:
                        fix["messages_balance"] = 0
                    if fix:
                        await db.vendors.update_one({"id": vendor["id"]}, {"$set": fix})
        except Exception as e:
            logger.warning("charge.refunded handler error: %s", e)

    elif etype == "charge.dispute.created":
        # Customer initiated a chargeback — treat similarly to a refund.
        try:
            cust_id = data_obj.get("customer") if isinstance(data_obj, dict) else data_obj.customer
            vendor = await db.vendors.find_one({"stripe_customer_id": cust_id}, {"_id": 0}) if cust_id else None
            if vendor:
                await db.vendors.update_one(
                    {"id": vendor["id"]},
                    {"$set": {"subscription_status": "canceled", "cancel_reason": "disputed"}},
                )
        except Exception as e:
            logger.warning("charge.dispute.created handler error: %s", e)

    return {"ok": True}


# ----- Admin billing dashboard -----------------------------------------------
@api_router.get("/admin/billing")
async def admin_billing_list(user: dict = Depends(require_admin)):
    vendors = await db.vendors.find({}, {"_id": 0}).to_list(1000)
    users_by_vid = {}
    async for u in db.users.find({"role": "vendor"}, {"_id": 0, "email": 1, "vendor_id": 1, "full_name": 1}):
        users_by_vid[u["vendor_id"]] = u
    rows = []
    mrr = 0.0
    active_count = 0
    trial_count = 0
    total_collected_subtotal = 0.0
    for v in vendors:
        plan = v.get("plan", "trial")
        sub_status = v.get("subscription_status", "trialing")
        plan_price = 0.0
        if plan in PLANS and sub_status == "active":
            plan_price = PLANS[plan]["price_usd"]
            mrr += plan_price
            active_count += 1
        if sub_status == "trialing":
            trial_count += 1
        u = users_by_vid.get(v["id"]) or {}
        # aggregate completed spend (subtotal, pre-tax)
        agg = await db.payment_transactions.aggregate([
            {"$match": {"vendor_id": v["id"], "status": "completed"}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
        ]).to_list(1)
        total_spent = (agg[0]["total"] if agg else 0.0) if agg else 0.0
        total_collected_subtotal += float(total_spent)
        # plan-side tax math
        plan_tax = round(plan_price * (HST_RATE_PERCENT / 100.0), 2)
        plan_total = round(plan_price + plan_tax, 2)
        spent_tax = round(float(total_spent) * (HST_RATE_PERCENT / 100.0), 2)
        spent_total = round(float(total_spent) + spent_tax, 2)
        rows.append({
            "vendor_id": v["id"],
            "name": v.get("name"),
            "email": u.get("email"),
            "owner": u.get("full_name"),
            "plan": plan,
            "subscription_status": sub_status,
            "plan_price_usd": plan_price,
            "plan_tax_usd": plan_tax,
            "plan_total_usd": plan_total,
            "trial_ends_at": v.get("trial_ends_at"),
            "current_period_end": v.get("current_period_end"),
            "minutes_balance": float(v.get("minutes_balance", 0.0)),
            "messages_balance": int(v.get("messages_balance", 0)),
            "is_exempt": bool(v.get("is_exempt")),
            "stripe_customer_id": v.get("stripe_customer_id"),
            "stripe_subscription_id": v.get("stripe_subscription_id"),
            "total_spent_usd": round(float(total_spent), 2),
            "total_spent_tax_usd": spent_tax,
            "total_spent_with_tax_usd": spent_total,
            "created_at": v.get("created_at"),
        })
    mrr_tax = round(mrr * (HST_RATE_PERCENT / 100.0), 2)
    mrr_with_tax = round(mrr + mrr_tax, 2)
    return {
        "summary": {
            "mrr_usd": round(mrr, 2),
            "mrr_tax_usd": mrr_tax,
            "mrr_with_tax_usd": mrr_with_tax,
            "arr_usd": round(mrr * 12, 2),
            "arr_with_tax_usd": round(mrr_with_tax * 12, 2),
            "tax_rate_percent": HST_RATE_PERCENT,
            "tax_label": "HST",
            "total_collected_subtotal_usd": round(total_collected_subtotal, 2),
            "total_collected_tax_usd": round(total_collected_subtotal * (HST_RATE_PERCENT / 100.0), 2),
            "total_collected_with_tax_usd": round(total_collected_subtotal * (1 + HST_RATE_PERCENT / 100.0), 2),
            "active_subscriptions": active_count,
            "trialing": trial_count,
            "total_vendors": len(vendors),
        },
        "vendors": rows,
    }


@api_router.get("/admin/billing/{vendor_id}")
async def admin_billing_detail(vendor_id: str, user: dict = Depends(require_admin)):
    vendor = await db.vendors.find_one({"id": vendor_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    txns = await db.payment_transactions.find(
        {"vendor_id": vendor_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return {"vendor": vendor, "transactions": txns}


# ============================== OTP / Email / MFA ===========================
import smtplib
import secrets
from email.message import EmailMessage

SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM_NAME = os.environ.get("SMTP_FROM_NAME", "BotNira")
OTP_EXPIRY_MINUTES = 10
OTP_MAX_ATTEMPTS = 5


def _generate_otp() -> str:
    """6-digit numeric OTP."""
    return f"{secrets.randbelow(1000000):06d}"


def _generate_and_store_otp(email: str, purpose: str) -> str:
    """Invalidates prior OTPs for same (email, purpose), stores a new one, returns the code."""
    email = email.lower()
    code = _generate_otp()
    # Remove any outstanding OTPs for same purpose → only newest is valid
    import asyncio as _a
    loop = _a.get_event_loop()
    async def _save():
        await db.otp_codes.delete_many({"email": email, "purpose": purpose})
        await db.otp_codes.insert_one({
            "id": new_id(),
            "email": email,
            "purpose": purpose,   # signup | login | password_reset
            "code_hash": hash_password(code),
            "attempts": 0,
            "created_at": now_iso(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES)).isoformat(),
        })
    if loop.is_running():
        # called from inside async — schedule and await elsewhere
        # (we provide both sync and async helpers below)
        raise RuntimeError("Use _generate_and_store_otp_async inside coroutines")
    loop.run_until_complete(_save())
    return code


async def _generate_and_store_otp_async(email: str, purpose: str) -> str:
    email = email.lower()
    code = _generate_otp()
    await db.otp_codes.delete_many({"email": email, "purpose": purpose})
    await db.otp_codes.insert_one({
        "id": new_id(),
        "email": email,
        "purpose": purpose,
        "code_hash": hash_password(code),
        "attempts": 0,
        "created_at": now_iso(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES)).isoformat(),
    })
    return code


async def _verify_otp_async(email: str, purpose: str, code: str) -> bool:
    email = email.lower()
    rec = await db.otp_codes.find_one({"email": email, "purpose": purpose}, {"_id": 0})
    if not rec:
        return False
    # expired?
    try:
        exp = datetime.fromisoformat(rec["expires_at"].replace("Z", "+00:00"))
        if datetime.now(timezone.utc) > exp:
            await db.otp_codes.delete_one({"email": email, "purpose": purpose})
            return False
    except Exception:
        return False
    if rec.get("attempts", 0) >= OTP_MAX_ATTEMPTS:
        await db.otp_codes.delete_one({"email": email, "purpose": purpose})
        return False
    if not verify_password(code, rec["code_hash"]):
        await db.otp_codes.update_one(
            {"email": email, "purpose": purpose},
            {"$inc": {"attempts": 1}},
        )
        return False
    # success → consume
    await db.otp_codes.delete_one({"email": email, "purpose": purpose})
    return True


SOURCE_LABELS = {
    "web": "Web chat",
    "whatsapp": "WhatsApp",
    "voice": "Phone call",
    "email": "Email",
    "sms": "SMS",
    "manual": "Manual entry",
}


async def _send_appointment_email(vendor_id: str, appt: dict):
    """Email the vendor (owner) that a new appointment was booked."""
    if not SMTP_USER or not SMTP_PASSWORD:
        logger.warning("SMTP not configured — skipping appointment email for vendor=%s", vendor_id)
        return
    vendor = await db.vendors.find_one({"id": vendor_id}, {"_id": 0})
    if not vendor:
        return
    owner = await db.users.find_one(
        {"vendor_id": vendor_id, "role": "vendor"}, {"_id": 0, "email": 1, "full_name": 1}
    )
    if not owner or not owner.get("email"):
        logger.warning("no owner email for vendor=%s — skipping appointment email", vendor_id)
        return
    to_email = owner["email"]
    biz_name = vendor.get("name") or "your business"
    source_label = SOURCE_LABELS.get(appt.get("source", "manual"), (appt.get("source") or "unknown").title())
    scheduled = appt.get("scheduled_at") or "Not specified (please confirm with customer)"
    customer = appt.get("customer_name") or "Guest"
    contact = appt.get("customer_contact") or "(not provided)"
    notes = appt.get("notes") or "—"

    subject = f"New appointment — {customer} · {biz_name}"
    body_text = (
        f"New appointment booked for {biz_name} via BotNira\n\n"
        f"Customer: {customer}\n"
        f"Contact: {contact}\n"
        f"Scheduled: {scheduled}\n"
        f"Source: {source_label}\n"
        f"Notes: {notes}\n\n"
        f"Manage this booking: https://botnira.com/app/appointments\n\n"
        f"— BotNira"
    )
    body_html = f"""<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:2px solid #000;box-shadow:6px 6px 0 #000;">
    <div style="background:#002FA7;color:#fff;padding:18px 24px;border-bottom:2px solid #000;">
      <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;font-weight:bold;opacity:.8;">BotNira · New booking</div>
      <div style="font-size:22px;font-weight:900;margin-top:4px;">A new appointment for {biz_name}</div>
    </div>
    <div style="padding:24px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:10px 0;border-bottom:1px dashed #ccc;width:140px;color:#666;">Customer</td><td style="padding:10px 0;border-bottom:1px dashed #ccc;font-weight:bold;">{customer}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px dashed #ccc;color:#666;">Contact</td><td style="padding:10px 0;border-bottom:1px dashed #ccc;font-family:monospace;">{contact}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px dashed #ccc;color:#666;">Scheduled</td><td style="padding:10px 0;border-bottom:1px dashed #ccc;font-weight:bold;">{scheduled}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px dashed #ccc;color:#666;">Source</td><td style="padding:10px 0;border-bottom:1px dashed #ccc;"><span style="display:inline-block;padding:2px 8px;background:#002FA7;color:#fff;font-size:11px;font-weight:bold;letter-spacing:.1em;text-transform:uppercase;">{source_label}</span></td></tr>
        <tr><td style="padding:10px 0;color:#666;">Notes</td><td style="padding:10px 0;">{notes}</td></tr>
      </table>
      <div style="margin-top:20px;">
        <a href="https://botnira.com/app/appointments" style="display:inline-block;background:#002FA7;color:#fff;text-decoration:none;padding:12px 20px;border:2px solid #000;font-weight:bold;box-shadow:4px 4px 0 #000;">
          Open in BotNira →
        </a>
      </div>
    </div>
    <div style="background:#000;color:#999;padding:12px 24px;font-size:11px;font-family:monospace;">
      © 2026 BotNira · Appointment captured automatically by your AI receptionist
    </div>
  </div>
</body>
</html>"""

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{SMTP_FROM_NAME} <{SMTP_USER}>"
    msg["To"] = to_email
    msg.set_content(body_text)
    msg.add_alternative(body_html, subtype="html")

    def _send_sync():
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as s:
            s.starttls()
            s.login(SMTP_USER, SMTP_PASSWORD)
            s.send_message(msg)
    try:
        await asyncio.to_thread(_send_sync)
        logger.info("Appointment email sent to %s (vendor=%s)", to_email, vendor_id)
    except Exception as e:
        logger.warning("Appointment email send failed for %s: %s", to_email, e)


_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _extract_customer_email(appt: dict) -> Optional[str]:
    """Sniffs a customer email out of an appointment record.

    The `customer_contact` field is a free-text dump from the AI extractor —
    sometimes it's just an email, sometimes a phone, sometimes both like
    "+14375551234, jane@acme.com". We pull the FIRST valid-looking email."""
    contact = (appt.get("customer_contact") or "").strip()
    if not contact:
        return None
    # Quick path: the whole field is just an email
    if _EMAIL_RE.match(contact):
        return contact.lower()
    # Otherwise look inside comma/space-separated fragments
    for tok in re.split(r"[,;\s]+", contact):
        tok = tok.strip(" .;,()<>[]")
        if _EMAIL_RE.match(tok):
            return tok.lower()
    return None


def _ics_for_appointment(appt: dict, biz_name: str) -> Optional[str]:
    """Build a tiny RFC-5545 .ics calendar file so the email's attached event
    appears as a one-click 'Add to calendar' button in Gmail / Outlook /
    Apple Mail. Defaults to a 30-minute duration when only a start time is
    known. Returns None if the scheduled_at can't be parsed."""
    sched_raw = (appt.get("scheduled_at") or "").strip()
    if not sched_raw:
        return None
    # Accept a few common formats: ISO 8601, "YYYY-MM-DDTHH:MM", "YYYY-MM-DD HH:MM"
    candidates = [sched_raw, sched_raw.replace(" ", "T")]
    dt_start = None
    for c in candidates:
        try:
            dt_start = datetime.fromisoformat(c.replace("Z", "+00:00"))
            break
        except Exception:
            continue
    if not dt_start:
        return None
    if dt_start.tzinfo is None:
        # Treat naive timestamps as the vendor's local time but stamp as UTC
        # for the ICS — calendar clients render in the recipient's local TZ.
        dt_start = dt_start.replace(tzinfo=timezone.utc)
    dt_start_utc = dt_start.astimezone(timezone.utc)
    dt_end_utc = dt_start_utc + timedelta(minutes=30)

    def _fmt(d):
        return d.strftime("%Y%m%dT%H%M%SZ")

    uid = f"{appt.get('id', new_id())}@botnira.com"
    summary = f"Appointment with {biz_name}"
    notes = (appt.get("notes") or "").replace("\n", "\\n")
    ics = (
        "BEGIN:VCALENDAR\r\n"
        "VERSION:2.0\r\n"
        "PRODID:-//BotNira//AI Receptionist//EN\r\n"
        "CALSCALE:GREGORIAN\r\n"
        "METHOD:PUBLISH\r\n"
        "BEGIN:VEVENT\r\n"
        f"UID:{uid}\r\n"
        f"DTSTAMP:{_fmt(datetime.now(timezone.utc))}\r\n"
        f"DTSTART:{_fmt(dt_start_utc)}\r\n"
        f"DTEND:{_fmt(dt_end_utc)}\r\n"
        f"SUMMARY:{summary}\r\n"
        f"DESCRIPTION:{notes}\r\n"
        "STATUS:CONFIRMED\r\n"
        "END:VEVENT\r\n"
        "END:VCALENDAR\r\n"
    )
    return ics


async def _send_customer_appointment_confirmation(vendor_id: str, appt: dict):
    """Send the *customer* a friendly "you're booked" email.

    Skipped silently when:
      - The customer didn't share an email (e.g. WhatsApp / SMS / voice with no email captured)
      - SMTP isn't configured at all (no fallback)
      - Sending fails for any reason (vendor-side flow must never break on this)

    Tries to send from the vendor's CONNECTED EMAIL inbox first (so the
    customer sees `from: hello@vendorbiz.com` — boosts trust & deliverability),
    and only falls back to the BotNira default SMTP relay if no vendor inbox
    is available. Includes a `.ics` calendar attachment for one-click "Add
    to calendar" in Gmail/Outlook/Apple Mail.
    """
    customer_email = _extract_customer_email(appt)
    if not customer_email:
        return  # No email → nothing to send

    vendor = await db.vendors.find_one({"id": vendor_id}, {"_id": 0})
    if not vendor:
        return
    biz_name = vendor.get("name") or "Our team"
    customer_name = (appt.get("customer_name") or "there").strip() or "there"
    scheduled = (appt.get("scheduled_at") or "").strip() or "(time to be confirmed)"
    notes = (appt.get("notes") or "").strip()

    subject = f"You're booked with {biz_name} · {scheduled}"
    body_text = (
        f"Hi {customer_name},\n\n"
        f"Thanks for booking with {biz_name}. Here are your appointment details:\n\n"
        f"• When: {scheduled}\n"
        f"• Where / Notes: {notes or 'See attached calendar invite'}\n\n"
        f"Need to reschedule or have a question? Just reply to this email and "
        f"someone from our team will get back to you.\n\n"
        f"See you soon!\n— {biz_name}\n"
    )
    body_html = f"""<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:2px solid #000;box-shadow:6px 6px 0 #000;">
    <div style="background:#FBBC04;color:#000;padding:18px 24px;border-bottom:2px solid #000;">
      <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;font-weight:bold;opacity:.8;">Appointment confirmed</div>
      <div style="font-size:22px;font-weight:900;margin-top:4px;">You're booked with {biz_name}</div>
    </div>
    <div style="padding:24px;font-size:15px;line-height:1.6;color:#111;">
      <p style="margin:0 0 14px 0;">Hi {customer_name},</p>
      <p style="margin:0 0 18px 0;">Thanks for booking — here's everything you need to know:</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:10px 0;border-bottom:1px dashed #ccc;width:120px;color:#666;">When</td>
            <td style="padding:10px 0;border-bottom:1px dashed #ccc;font-weight:bold;">{scheduled}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px dashed #ccc;color:#666;">Booked with</td>
            <td style="padding:10px 0;border-bottom:1px dashed #ccc;font-weight:bold;">{biz_name}</td></tr>
        {('<tr><td style="padding:10px 0;color:#666;">Notes</td><td style="padding:10px 0;">' + notes + '</td></tr>') if notes else ''}
      </table>
      <p style="margin:24px 0 0 0;font-size:13px;color:#555;">
        Need to reschedule? Just reply to this email and we'll get back to you.
      </p>
    </div>
    <div style="background:#000;color:#999;padding:12px 24px;font-size:11px;font-family:monospace;">
      Powered by BotNira · Your AI receptionist
    </div>
  </div>
</body>
</html>"""

    # Build the email envelope
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["To"] = customer_email
    msg.set_content(body_text)
    msg.add_alternative(body_html, subtype="html")

    # Attach the calendar invite (best-effort)
    ics = _ics_for_appointment(appt, biz_name)
    if ics:
        msg.add_attachment(
            ics.encode("utf-8"),
            maintype="text", subtype="calendar",
            filename="appointment.ics",
        )

    # Prefer the vendor's connected email inbox so the customer sees the
    # vendor's real domain in their From header.
    vendor_conn = await db.email_connections.find_one(
        {"vendor_id": vendor_id, "enabled": True}, {"_id": 0}
    )
    if vendor_conn:
        try:
            from email_routes import _dec_password as _dec  # late import (avoid circular)
            pwd = _dec(vendor_conn["password_encrypted"])
            if pwd:
                msg["From"] = f"{biz_name} <{vendor_conn['email_address']}>"

                def _send_via_vendor():
                    with smtplib.SMTP(vendor_conn["smtp_host"], vendor_conn.get("smtp_port", 587), timeout=20) as s:
                        s.starttls()
                        s.login(vendor_conn["email_address"], pwd)
                        s.send_message(msg)
                await asyncio.to_thread(_send_via_vendor)
                logger.info("[customer-appt-email] sent via vendor SMTP to %s (vendor=%s)", customer_email, vendor_id)
                return
        except Exception as e:
            logger.warning("[customer-appt-email] vendor SMTP failed (%s) — falling back to BotNira relay", e)

    # Fallback: BotNira default SMTP relay
    if not SMTP_USER or not SMTP_PASSWORD:
        logger.info("[customer-appt-email] no vendor inbox + BotNira SMTP not configured — skipping for %s", customer_email)
        return
    # Reset From for the fallback path
    del msg["From"]
    msg["From"] = f"{biz_name} via BotNira <{SMTP_USER}>"
    msg["Reply-To"] = SMTP_USER

    def _send_via_botnira():
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as s:
            s.starttls()
            s.login(SMTP_USER, SMTP_PASSWORD)
            s.send_message(msg)
    try:
        await asyncio.to_thread(_send_via_botnira)
        logger.info("[customer-appt-email] sent via BotNira relay to %s (vendor=%s)", customer_email, vendor_id)
    except Exception as e:
        logger.warning("[customer-appt-email] send failed for %s: %s", customer_email, e)



async def _send_vendor_appointment_change_notification(vendor: dict, appt: dict, changes: list):
    """Notify vendor when customer updates/cancels their appointment."""
    if not SMTP_USER or not SMTP_PASSWORD:
        logger.warning("SMTP not configured — skipping vendor notification")
        return
    
    owner = await db.users.find_one(
        {"vendor_id": vendor["id"], "role": "vendor"}, {"_id": 0, "email": 1, "full_name": 1}
    )
    if not owner or not owner.get("email"):
        return
    
    to_email = owner["email"]
    biz_name = vendor.get("name") or "your business"
    customer = appt.get("customer_name") or "Guest"
    contact = appt.get("customer_contact") or "(not provided)"
    scheduled = appt.get("scheduled_at") or "TBD"
    
    changes_text = "\n".join(f"• {change}" for change in changes)
    
    subject = f"Appointment update — {customer} · {biz_name}"
    body_text = (
        f"A customer has updated their appointment\n\n"
        f"Customer: {customer}\n"
        f"Contact: {contact}\n"
        f"Scheduled: {scheduled}\n\n"
        f"Changes:\n{changes_text}\n\n"
        f"View details: https://botnira.com/app/appointments\n\n"
        f"— BotNira"
    )
    
    body_html = f"""<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:2px solid #000;box-shadow:6px 6px 0 #000;">
    <div style="background:#ff6b00;color:#fff;padding:18px 24px;border-bottom:2px solid #000;">
      <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;font-weight:bold;opacity:.8;">BotNira · Appointment Update</div>
      <div style="font-size:22px;font-weight:900;margin-top:4px;">Customer changed their appointment</div>
    </div>
    <div style="padding:24px;">
      <div style="background:#fff3cd;border:2px solid #ff6b00;padding:12px;margin-bottom:16px;font-size:14px;">
        <strong>⚠️ Action Required:</strong> A customer has updated their booking.
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:10px 0;border-bottom:1px dashed #ccc;width:140px;color:#666;">Customer</td><td style="padding:10px 0;border-bottom:1px dashed #ccc;font-weight:bold;">{customer}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px dashed #ccc;color:#666;">Contact</td><td style="padding:10px 0;border-bottom:1px dashed #ccc;font-family:monospace;">{contact}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px dashed #ccc;color:#666;">Scheduled</td><td style="padding:10px 0;border-bottom:1px dashed #ccc;font-weight:bold;">{scheduled}</td></tr>
      </table>
      <div style="margin-top:20px;background:#f8f9fa;border-left:4px solid #ff6b00;padding:12px;">
        <div style="font-weight:bold;margin-bottom:8px;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:.1em;">Changes Made:</div>
        {' '.join(f'<div style="margin:4px 0;">• {change}</div>' for change in changes)}
      </div>
      <div style="margin-top:20px;">
        <a href="https://botnira.com/app/appointments" style="display:inline-block;background:#002FA7;color:#fff;text-decoration:none;padding:12px 20px;border:2px solid #000;font-weight:bold;box-shadow:4px 4px 0 #000;">
          View Appointment →
        </a>
      </div>
    </div>
    <div style="background:#000;color:#999;padding:12px 24px;font-size:11px;font-family:monospace;">
      © 2026 BotNira · Customer self-service appointment management
    </div>
  </div>
</body>
</html>"""
    
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{SMTP_FROM_NAME} <{SMTP_USER}>"
    msg["To"] = to_email
    msg.set_content(body_text)
    msg.add_alternative(body_html, subtype="html")
    
    def _send_sync():
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as s:
            s.starttls()
            s.login(SMTP_USER, SMTP_PASSWORD)
            s.send_message(msg)
    
    try:
        await asyncio.to_thread(_send_sync)
        logger.info("Appointment change notification sent to %s (vendor=%s)", to_email, vendor["id"])
    except Exception as e:
        logger.warning("Vendor notification email failed: %s", e)


async def _send_purchase_confirmation_email(vendor_id: str, session_id: str, txn_type: str, plan_or_pack: str):
    """Sends a 'thanks for your purchase' email with plan details and a link
    to the Stripe-hosted invoice/receipt PDF."""
    if not SMTP_USER or not SMTP_PASSWORD:
        logger.warning("SMTP not configured — skipping purchase email for vendor=%s", vendor_id)
        return
    vendor = await db.vendors.find_one({"id": vendor_id}, {"_id": 0})
    if not vendor:
        return
    owner = await db.users.find_one(
        {"vendor_id": vendor_id, "role": "vendor"}, {"_id": 0, "email": 1, "full_name": 1}
    )
    if not owner or not owner.get("email"):
        return

    to_email = owner["email"]
    biz_name = vendor.get("name") or "your business"
    owner_name = owner.get("full_name") or to_email.split("@")[0]

    # Resolve plan/pack details
    is_sub = txn_type == "subscription"
    cfg = PLANS.get(plan_or_pack) if is_sub else TOPUPS.get(plan_or_pack)
    if not cfg:
        return
    pretty_kind = "subscription" if is_sub else "top-up"
    pretty_name = cfg["name"]
    subtotal = float(cfg["price_usd"])
    tax = round(subtotal * (HST_RATE_PERCENT / 100.0), 2)
    total = round(subtotal + tax, 2)

    # Try to grab the Stripe-hosted invoice / receipt link
    invoice_url = ""
    receipt_url = ""
    try:
        if STRIPE_SECRET_KEY:
            sess = _stripe.checkout.Session.retrieve(session_id)
            inv_id = getattr(sess, "invoice", None)
            if inv_id:
                inv = _stripe.Invoice.retrieve(inv_id)
                invoice_url = getattr(inv, "hosted_invoice_url", "") or ""
            pi_id = getattr(sess, "payment_intent", None)
            if pi_id:
                pi = _stripe.PaymentIntent.retrieve(pi_id)
                charges = getattr(pi, "charges", None)
                if charges and charges.data:
                    receipt_url = getattr(charges.data[0], "receipt_url", "") or ""
    except Exception as e:
        logger.warning("Could not fetch Stripe invoice/receipt: %s", e)

    if is_sub:
        subject = f"Welcome to BotNira {pretty_name} — your subscription is live"
        intro = (
            f"You're now on the <strong>BotNira {pretty_name} plan</strong>. "
            f"All 5 channels — web, WhatsApp, voice, email and SMS — are unlocked for {biz_name}."
        )
    else:
        subject = f"Top-up confirmed — {pretty_name} pack added to {biz_name}"
        intro = (
            f"Your <strong>{pretty_name}</strong> top-up has been added to {biz_name}'s balance."
        )

    # Plain text body
    body_text_lines = [
        f"Hi {owner_name},",
        "",
        f"Thanks for your purchase. {pretty_kind.capitalize()}: {pretty_name}.",
        "",
        "What you get:",
        f"  • {cfg['voice_min']} voice minutes",
        f"  • {cfg['messages']:,} AI messages",
    ]
    if is_sub:
        body_text_lines.append("  • All 5 channels unlocked — web, WhatsApp, voice, email, SMS")
    body_text_lines += [
        "",
        "Receipt:",
        f"  Subtotal:  ${subtotal:,.2f} USD",
        f"  HST 13%:   ${tax:,.2f} USD",
        f"  Total:     ${total:,.2f} USD",
        "",
    ]
    if invoice_url:
        body_text_lines += [f"View / download invoice: {invoice_url}", ""]
    elif receipt_url:
        body_text_lines += [f"Download receipt: {receipt_url}", ""]
    body_text_lines += [
        "Manage your plan: https://botnira.com/app/billing",
        "",
        "— BotNira",
    ]
    body_text = "\n".join(body_text_lines)

    rows_html = (
        f"<tr><td style='padding:6px 0;color:#666;'>Subtotal</td>"
        f"<td style='padding:6px 0;text-align:right;font-family:monospace;'>${subtotal:,.2f} USD</td></tr>"
        f"<tr><td style='padding:6px 0;color:#666;'>HST 13%</td>"
        f"<td style='padding:6px 0;text-align:right;font-family:monospace;'>${tax:,.2f} USD</td></tr>"
        f"<tr><td style='padding:10px 0;border-top:2px solid #000;font-weight:bold;'>Total charged</td>"
        f"<td style='padding:10px 0;border-top:2px solid #000;text-align:right;font-family:monospace;font-weight:bold;font-size:18px;'>${total:,.2f} USD</td></tr>"
    )
    cta_html = ""
    if invoice_url:
        cta_html = f'<a href="{invoice_url}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:10px 18px;border:2px solid #000;font-weight:bold;font-size:13px;margin-right:8px;">View invoice</a>'
    elif receipt_url:
        cta_html = f'<a href="{receipt_url}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:10px 18px;border:2px solid #000;font-weight:bold;font-size:13px;margin-right:8px;">View receipt</a>'

    body_html = f"""<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:2px solid #000;box-shadow:6px 6px 0 #000;">
    <div style="background:#002FA7;color:#fff;padding:20px 24px;border-bottom:2px solid #000;">
      <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;font-weight:bold;opacity:.85;">BotNira · Purchase confirmed</div>
      <div style="font-size:24px;font-weight:900;margin-top:6px;line-height:1.2;">🎉 You're in! {pretty_name} is live.</div>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 14px;font-size:14px;line-height:1.5;">Hi <strong>{owner_name}</strong>, {intro}</p>
      <div style="border:2px solid #000;padding:14px 16px;background:#FFFBE6;margin:14px 0;font-size:13px;">
        <div style="font-weight:bold;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#666;margin-bottom:6px;">{'Plan' if is_sub else 'Pack'}</div>
        <div style="font-size:18px;font-weight:900;">{pretty_name}</div>
        <ul style="margin:10px 0 0;padding-left:18px;line-height:1.6;">
          <li><strong>{cfg['voice_min']}</strong> voice minutes</li>
          <li><strong>{cfg['messages']:,}</strong> AI messages</li>
          {'<li>All 5 channels unlocked</li>' if is_sub else '<li>Stacks on top of your current balance</li>'}
        </ul>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px;">
        {rows_html}
      </table>
      <div style="margin-top:22px;">
        {cta_html}
        <a href="https://botnira.com/app/billing" style="display:inline-block;background:#002FA7;color:#fff;text-decoration:none;padding:10px 18px;border:2px solid #000;font-weight:bold;font-size:13px;box-shadow:4px 4px 0 #000;">Open BotNira</a>
      </div>
    </div>
    <div style="background:#000;color:#999;padding:12px 24px;font-size:11px;font-family:monospace;line-height:1.5;">
      Questions? Just reply to this email.<br/>© 2026 BotNira · Powered by your AI receptionist
    </div>
  </div>
</body>
</html>"""

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{SMTP_FROM_NAME} <{SMTP_USER}>"
    msg["To"] = to_email
    msg.set_content(body_text)
    msg.add_alternative(body_html, subtype="html")

    def _send_sync():
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as s:
            s.starttls()
            s.login(SMTP_USER, SMTP_PASSWORD)
            s.send_message(msg)
    try:
        await asyncio.to_thread(_send_sync)
        logger.info("Purchase email sent to %s (vendor=%s, %s=%s)", to_email, vendor_id, txn_type, plan_or_pack)
    except Exception as e:
        logger.warning("Purchase email send failed for %s: %s", to_email, e)


def _send_otp_email(to_email: str, code: str, purpose: str):
    """Sends the OTP via Gmail SMTP. Non-fatal on failure — caller logs."""
    if not SMTP_USER or not SMTP_PASSWORD:
        logger.warning("SMTP not configured — OTP for %s is %s (DEV ONLY)", to_email, code)
        return
    subject_map = {
        "signup": "Verify your BotNira account",
        "login": "Your BotNira login code",
        "password_reset": "Reset your BotNira password",
    }
    heading_map = {
        "signup": "Welcome to BotNira",
        "login": "Sign-in verification",
        "password_reset": "Password reset request",
    }
    subject = subject_map.get(purpose, "Your BotNira code")
    heading = heading_map.get(purpose, "Verification")
    body_text = (
        f"{heading}\n\n"
        f"Your 6-digit code is: {code}\n\n"
        f"This code expires in {OTP_EXPIRY_MINUTES} minutes. "
        f"If you did not request this, you can safely ignore this email.\n\n"
        f"— The BotNira team"
    )
    body_html = f"""<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:2px solid #000;box-shadow:6px 6px 0 #000;">
    <div style="background:#002FA7;color:#fff;padding:18px 24px;border-bottom:2px solid #000;">
      <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;font-weight:bold;opacity:.8;">BotNira</div>
      <div style="font-size:22px;font-weight:900;margin-top:4px;">{heading}</div>
    </div>
    <div style="padding:28px 24px;">
      <p style="margin:0 0 16px;color:#333;line-height:1.5;">Your 6-digit verification code is:</p>
      <div style="font-family:monospace;font-size:38px;font-weight:900;letter-spacing:10px;color:#002FA7;background:#f0f3ff;border:2px solid #000;padding:18px;text-align:center;">
        {code}
      </div>
      <p style="margin:20px 0 0;color:#666;font-size:13px;line-height:1.5;">
        This code expires in <strong>{OTP_EXPIRY_MINUTES} minutes</strong>. If you didn't request this,
        you can safely ignore this email — your account is still secure.
      </p>
    </div>
    <div style="background:#000;color:#999;padding:12px 24px;font-size:11px;font-family:monospace;">
      © 2026 BotNira · AI receptionist for every business
    </div>
  </div>
</body>
</html>"""
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{SMTP_FROM_NAME} <{SMTP_USER}>"
    msg["To"] = to_email
    msg.set_content(body_text)
    msg.add_alternative(body_html, subtype="html")
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as s:
            s.starttls()
            s.login(SMTP_USER, SMTP_PASSWORD)
            s.send_message(msg)
        logger.info("OTP email sent to %s (purpose=%s)", to_email, purpose)
    except Exception as e:
        logger.warning("OTP email send failed for %s: %s", to_email, e)


# ----- Request/response models -----
class OTPVerifyReq(BaseModel):
    email: EmailStr
    code: str


class ResendOTPReq(BaseModel):
    email: EmailStr
    purpose: str  # signup | password_reset


class PasswordResetRequestReq(BaseModel):
    email: EmailStr


class PasswordResetConfirmReq(BaseModel):
    email: EmailStr
    code: str
    new_password: str = Field(min_length=6)


class MFALoginVerifyReq(BaseModel):
    email: EmailStr
    code: str
    mfa_session: str


class MFAToggleReq(BaseModel):
    enabled: bool
    password: str  # re-auth to toggle MFA


# ----- Endpoints -----
@api_router.post("/auth/verify-email")
async def auth_verify_email(req: OTPVerifyReq):
    ok = await _verify_otp_async(req.email, "signup", req.code)
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid or expired code")
    await db.users.update_one(
        {"email": req.email.lower()},
        {"$set": {"email_verified": True, "email_verified_at": now_iso()}},
    )
    return {"ok": True}


@api_router.post("/auth/resend-otp")
async def auth_resend_otp(req: ResendOTPReq):
    if req.purpose not in ("signup", "password_reset"):
        raise HTTPException(status_code=400, detail="Invalid purpose")
    user = await db.users.find_one({"email": req.email.lower()})
    if not user:
        # Don't leak existence — just 200 for password_reset, fail for signup
        if req.purpose == "password_reset":
            return {"ok": True}
        raise HTTPException(status_code=404, detail="Account not found")
    code = await _generate_and_store_otp_async(req.email, req.purpose)
    _send_otp_email(req.email, code, req.purpose)
    return {"ok": True}


@api_router.post("/auth/password/reset/request")
async def password_reset_request(req: PasswordResetRequestReq):
    # Don't reveal whether the email exists
    user = await db.users.find_one({"email": req.email.lower()})
    if user:
        code = await _generate_and_store_otp_async(req.email, "password_reset")
        _send_otp_email(req.email, code, "password_reset")
    return {"ok": True}


@api_router.post("/auth/password/reset/confirm")
async def password_reset_confirm(req: PasswordResetConfirmReq):
    ok = await _verify_otp_async(req.email, "password_reset", req.code)
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid or expired code")
    user = await db.users.find_one({"email": req.email.lower()})
    if not user:
        raise HTTPException(status_code=404, detail="Account not found")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": hash_password(req.new_password), "password_reset_at": now_iso()}},
    )
    return {"ok": True}


@api_router.post("/auth/login/mfa-verify")
async def login_mfa_verify(req: MFALoginVerifyReq):
    sess = await db.mfa_sessions.find_one({"id": req.mfa_session}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=400, detail="Invalid MFA session")
    try:
        exp = datetime.fromisoformat(sess["expires_at"].replace("Z", "+00:00"))
        if datetime.now(timezone.utc) > exp:
            await db.mfa_sessions.delete_one({"id": req.mfa_session})
            raise HTTPException(status_code=400, detail="MFA session expired")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid MFA session")
    ok = await _verify_otp_async(req.email, "login", req.code)
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid or expired code")
    user = await db.users.find_one({"id": sess["user_id"]})
    if not user or user["email"].lower() != req.email.lower():
        raise HTTPException(status_code=400, detail="MFA session mismatch")
    await db.mfa_sessions.delete_one({"id": req.mfa_session})
    token = create_token(user["id"], user["role"])
    return {"token": token, "role": user["role"], "vendor_id": user.get("vendor_id")}


@api_router.put("/auth/mfa")
async def auth_toggle_mfa(req: MFAToggleReq, user: dict = Depends(require_vendor)):
    full = await db.users.find_one({"id": user["id"]})
    if not full or not verify_password(req.password, full["password_hash"]):
        raise HTTPException(status_code=401, detail="Password incorrect")
    await db.vendors.update_one(
        {"id": user["vendor_id"]},
        {"$set": {"mfa_enabled": bool(req.enabled), "mfa_updated_at": now_iso()}},
    )
    return {"mfa_enabled": bool(req.enabled)}


@api_router.get("/auth/mfa-status")
async def auth_mfa_status(user: dict = Depends(require_vendor)):
    vendor = await db.vendors.find_one({"id": user["vendor_id"]}, {"_id": 0, "mfa_enabled": 1})
    return {"mfa_enabled": bool(vendor and vendor.get("mfa_enabled"))}


# ============================== Twilio Voice ================================
from twilio.rest import Client as TwilioClient
from twilio.base.exceptions import TwilioRestException
from twilio.twiml.voice_response import VoiceResponse, Connect, Stream
from twilio.twiml.messaging_response import MessagingResponse
from fastapi import WebSocket, WebSocketDisconnect

TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
OPENAI_REALTIME_API_KEY = os.environ.get("OPENAI_REALTIME_API_KEY", "")
# OpenAI rotates Realtime model snapshots periodically. We default to the GA
# stable tag (`gpt-realtime`) but allow override via env so we never need a
# code redeploy when OpenAI publishes a new snapshot.
OPENAI_REALTIME_MODEL = os.environ.get("OPENAI_REALTIME_MODEL", "gpt-realtime")

_twilio_master: Optional[TwilioClient] = None


def get_twilio() -> TwilioClient:
    global _twilio_master
    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN:
        raise HTTPException(status_code=503, detail="Twilio not configured")
    if _twilio_master is None:
        _twilio_master = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    return _twilio_master


def _twilio_subaccount_client(sub_sid: str, sub_token: str) -> TwilioClient:
    return TwilioClient(sub_sid, sub_token)


async def _get_or_create_subaccount(vendor_id: str, vendor_name: str) -> dict:
    """Idempotent: return vendor's Twilio subaccount (creates if missing)."""
    existing = await db.voice_subaccounts.find_one({"vendor_id": vendor_id}, {"_id": 0})
    if existing:
        return existing
    tw = get_twilio()
    friendly = f"BotNira · {vendor_name} · {vendor_id[:8]}"[:64]
    sub = tw.api.v2010.accounts.create(friendly_name=friendly)
    rec = {
        "id": new_id(),
        "vendor_id": vendor_id,
        "account_sid": sub.sid,
        "auth_token": sub.auth_token,
        "friendly_name": friendly,
        "status": sub.status,
        "created_at": now_iso(),
    }
    await db.voice_subaccounts.insert_one(rec)
    rec.pop("_id", None)
    return rec


# ----- Request/response models -----
class SearchNumbersReq(BaseModel):
    country_code: str = Field(min_length=2, max_length=2)  # ISO-3166 alpha-2 (US, CA, GB, ...)
    area_code: Optional[str] = None
    number_type: Optional[str] = "Local"   # Local | Mobile | TollFree
    contains: Optional[str] = None


class BuyNumberReq(BaseModel):
    country_code: str = Field(min_length=2, max_length=2)
    phone_number: str  # E.164 format (e.g., +14155551212)


# ----- Endpoints -----
@api_router.get("/voice/countries")
async def voice_countries(user: dict = Depends(require_vendor)):
    """List the countries Twilio offers phone numbers in."""
    tw = get_twilio()
    # pricing.v1 is the cheapest way to enumerate countries
    countries = tw.pricing.v1.voice.countries.list(limit=300)
    return [{"iso": c.iso_country, "name": c.country} for c in countries]


@api_router.post("/voice/search-numbers")
async def voice_search_numbers(req: SearchNumbersReq, user: dict = Depends(require_vendor)):
    """Search available Twilio numbers for purchase."""
    tw = get_twilio()
    country = req.country_code.upper()
    ntype = (req.number_type or "Local").capitalize()
    try:
        ctx = tw.available_phone_numbers(country)
        list_fn = getattr(ctx, f"{ntype.lower()}").list
        kwargs = {"limit": 15, "voice_enabled": True}
        if req.area_code and country in ("US", "CA"):
            kwargs["area_code"] = int(req.area_code)
        if req.contains:
            kwargs["contains"] = req.contains
        nums = list_fn(**kwargs)
    except TwilioRestException as e:
        raise HTTPException(status_code=400, detail=f"Twilio: {e.msg}")
    # Fetch per-minute pricing for this country (what we pay)
    try:
        pricing = tw.pricing.v1.voice.countries(country).fetch()
        inbound_rate = 0.0
        if pricing.inbound_call_prices:
            inbound_rate = float(pricing.inbound_call_prices[0].get("current_price", 0))
    except Exception:
        inbound_rate = 0.0
    return {
        "country": country,
        "inbound_cost_per_min_usd": inbound_rate,
        "numbers": [
            {
                "phone_number": n.phone_number,
                "friendly_name": n.friendly_name,
                "locality": getattr(n, "locality", None),
                "region": getattr(n, "region", None),
                "capabilities": n.capabilities,
            }
            for n in nums
        ],
    }


@api_router.post("/voice/buy-number")
async def voice_buy_number(req: BuyNumberReq, request: _StripeRequest, user: dict = Depends(require_vendor)):
    """Activate voice for the vendor: create subaccount if needed, purchase the number,
    wire voice webhook. Hard-blocked if vendor is on trial / paywalled / exempt-disabled."""
    vendor = await db.vendors.find_one({"id": user["vendor_id"]}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    access = _plan_for_vendor(vendor)
    # Voice requires either active plan or exempt
    if not access["is_exempt"] and "voice" not in access["allowed_channels"]:
        raise HTTPException(status_code=402, detail="Voice requires an active paid plan. Upgrade to activate voice.")

    # Prevent double-purchase — one number per vendor for now
    existing_conn = await db.voice_connections.find_one({"vendor_id": user["vendor_id"]}, {"_id": 0})
    if existing_conn:
        raise HTTPException(status_code=400, detail="Voice is already activated for this vendor. Deactivate the current number first.")

    # Create (or reuse) the vendor's Twilio subaccount
    sub = await _get_or_create_subaccount(user["vendor_id"], vendor.get("name", "Vendor"))
    sub_tw = _twilio_subaccount_client(sub["account_sid"], sub["auth_token"])

    # Derive webhook base URL from the vendor's incoming request — not from
    # PUBLIC_BASE_URL — so a stale env var can never poison newly bought numbers.
    base = _public_base_url_from_request(request) or (PUBLIC_BASE_URL.rstrip("/") if PUBLIC_BASE_URL else "")
    voice_webhook = f"{base}/api/voice/webhook"
    status_callback = f"{base}/api/voice/status-callback"
    sms_webhook = f"{base}/api/sms/webhook"

    try:
        purchased = sub_tw.incoming_phone_numbers.create(
            phone_number=req.phone_number,
            voice_url=voice_webhook,
            voice_method="POST",
            status_callback=status_callback,
            status_callback_method="POST",
            # Wire the SAME number for inbound SMS too — single number, both channels.
            sms_url=sms_webhook,
            sms_method="POST",
            friendly_name=f"BotNira · {vendor.get('name','Vendor')}",
        )
    except TwilioRestException as e:
        raise HTTPException(status_code=400, detail=f"Twilio purchase failed: {e.msg}")

    conn = {
        "id": new_id(),
        "vendor_id": user["vendor_id"],
        "subaccount_sid": sub["account_sid"],
        "phone_number_sid": purchased.sid,
        "phone_number": purchased.phone_number,
        "country": req.country_code.upper(),
        "friendly_name": purchased.friendly_name,
        "voice_webhook": voice_webhook,
        "sms_webhook": sms_webhook,
        "status": "active",
        "created_at": now_iso(),
    }
    await db.voice_connections.insert_one(conn)
    await db.channels.update_one(
        {"vendor_id": user["vendor_id"], "channel": "voice"},
        {"$set": {"status": "connected", "config": {"phone_number": purchased.phone_number}, "updated_at": now_iso()}},
        upsert=True,
    )
    # SMS auto-activates on the same number.
    await db.channels.update_one(
        {"vendor_id": user["vendor_id"], "channel": "sms"},
        {"$set": {"status": "connected", "config": {"phone_number": purchased.phone_number}, "updated_at": now_iso()}},
        upsert=True,
    )
    return {k: v for k, v in conn.items() if k != "_id"}


@api_router.get("/voice/status")
async def voice_status(user: dict = Depends(require_vendor)):
    conn = await db.voice_connections.find_one({"vendor_id": user["vendor_id"]}, {"_id": 0})
    if not conn:
        return {"active": False}
    # current month usage
    start_of_month = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    agg = await db.call_records.aggregate([
        {"$match": {"vendor_id": user["vendor_id"], "started_at": {"$gte": start_of_month}}},
        {"$group": {"_id": None, "minutes": {"$sum": "$minutes"}, "calls": {"$sum": 1}}},
    ]).to_list(1)
    stats = agg[0] if agg else {"minutes": 0, "calls": 0}
    return {
        "active": True,
        "phone_number": conn["phone_number"],
        "country": conn["country"],
        "subaccount_sid": conn["subaccount_sid"],
        "stats_this_month": {
            "minutes": round(float(stats.get("minutes", 0)), 1),
            "calls": int(stats.get("calls", 0)),
        },
    }


async def _release_vendor_phone_number(vendor_id: str) -> bool:
    """Release a vendor's Twilio phone number to stop billing.
    Called when vendor manually disconnects OR when subscription is cancelled.
    Returns True if number was released, False if no number found."""
    conn = await db.voice_connections.find_one({"vendor_id": vendor_id}, {"_id": 0})
    if not conn:
        return False
    
    sub = await db.voice_subaccounts.find_one({"vendor_id": vendor_id}, {"_id": 0})
    if sub:
        try:
            sub_tw = _twilio_subaccount_client(sub["account_sid"], sub["auth_token"])
            sub_tw.incoming_phone_numbers(conn["phone_number_sid"]).delete()
            logger.info("Released Twilio number %s for vendor %s", conn["phone_number"], vendor_id)
        except Exception as e:
            logger.warning("Release number failed for vendor %s: %s", vendor_id, e)
            return False
    
    await db.voice_connections.delete_one({"vendor_id": vendor_id})
    await db.channels.update_one(
        {"vendor_id": vendor_id, "channel": "voice"},
        {"$set": {"status": "disconnected", "updated_at": now_iso()}},
    )
    await db.channels.update_one(
        {"vendor_id": vendor_id, "channel": "sms"},
        {"$set": {"status": "disconnected", "updated_at": now_iso()}},
    )
    return True


@api_router.post("/voice/deactivate")
async def voice_deactivate(user: dict = Depends(require_vendor)):
    released = await _release_vendor_phone_number(user["vendor_id"])
    if not released:
        raise HTTPException(status_code=404, detail="No voice number to deactivate")
    return {"ok": True}


# ----- Public TwiML webhook (Twilio → us) -----
@api_router.post("/voice/webhook")
async def voice_webhook(request: _StripeRequest):
    """Twilio POSTs here on inbound calls. We return TwiML that opens a Media Stream."""
    form = await request.form()
    call_sid = form.get("CallSid")
    called = form.get("Called")          # our Twilio number (E.164)
    caller = form.get("From") or "unknown"
    # Look up vendor by number
    conn = await db.voice_connections.find_one({"phone_number": called}, {"_id": 0})
    vr = VoiceResponse()
    if not conn:
        vr.say("Sorry, this number is not currently active. Goodbye.", voice="alice")
        vr.hangup()
        return Response(content=str(vr), media_type="application/xml")
    vendor_id = conn["vendor_id"]

    # Balance + plan gate
    ok, reason = await _vendor_can_use_channel(vendor_id, "voice")
    if not ok:
        vr.say(
            "We're sorry, this business is temporarily unable to take calls. Please try again later.",
            voice="alice",
        )
        vr.hangup()
        return Response(content=str(vr), media_type="application/xml")

    # Create/track call record
    call_id = new_id()
    await db.call_records.insert_one({
        "id": call_id,
        "vendor_id": vendor_id,
        "call_sid": call_sid,
        "from_number": caller,
        "to_number": called,
        "started_at": now_iso(),
        "minutes": 0.0,
        "status": "in-progress",
    })
    # Open the media stream to our WS bridge
    base_ws = PUBLIC_BASE_URL.replace("https://", "wss://").replace("http://", "ws://").rstrip("/")
    ws_url = f"{base_ws}/api/voice/stream/{call_id}"
    connect = Connect()
    stream = Stream(url=ws_url)
    stream.parameter(name="vendor_id", value=vendor_id)
    stream.parameter(name="call_id", value=call_id)
    connect.append(stream)
    vr.append(connect)
    return Response(content=str(vr), media_type="application/xml")


@api_router.post("/voice/status-callback")
async def voice_status_callback(request: _StripeRequest):
    """Twilio reports call-completed status and duration here."""
    form = await request.form()
    call_sid = form.get("CallSid")
    duration = form.get("CallDuration")  # seconds
    status = form.get("CallStatus")  # noqa: F811 — local var, not the fastapi import
    if call_sid:
        updates = {"status": status or "completed", "ended_at": now_iso()}
        if duration:
            mins = round(float(duration) / 60.0, 2)
            updates["minutes"] = mins
            # Deduct minutes from vendor balance (unless exempt)
            rec = await db.call_records.find_one({"call_sid": call_sid}, {"_id": 0})
            if rec:
                v = await db.vendors.find_one({"id": rec["vendor_id"]}, {"_id": 0, "is_exempt": 1})
                if v and not v.get("is_exempt"):
                    await db.vendors.update_one(
                        {"id": rec["vendor_id"]},
                        {"$inc": {"minutes_balance": -mins, "minutes_used_total": mins}},
                    )
        await db.call_records.update_one({"call_sid": call_sid}, {"$set": updates})
    return {"ok": True}


# ============================================================
# SMS module — same Twilio number as voice, mirrors WhatsApp behaviour.
# - Inbound SMS (Twilio webhook) → AI reply grounded in vendor's bot
# - Sent reply via TwiML → recorded in unified inbox under channel="sms"
# - Live agent override + appointment auto-book supported (same pipeline)
# - 1 SMS = 1 message debited from messages_balance
# - North America (US/CA) only at launch — Twilio rates outside NA are 5–50× higher
# ============================================================
SMS_ALLOWED_PREFIXES = ("+1",)  # US + Canada at launch


def _twilio_subaccount_client_for_conn(conn: dict) -> Optional[TwilioClient]:
    """Build a Twilio sub-account client for sending SMS for a vendor's number."""
    sub_sid = conn.get("subaccount_sid")
    if not sub_sid:
        return None
    sub = None
    try:
        # Look up the subaccount auth token (stored when we created it)
        # We re-fetch via parent account API key if we don't have it cached.
        if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
            parent = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
            sub = parent.api.accounts(sub_sid).fetch()
        if not sub:
            return None
        return TwilioClient(sub_sid, sub.auth_token)
    except Exception as e:
        logger.warning("twilio sub client build failed: %s", e)
        return None


async def _twilio_send_sms(conn: dict, to_number: str, body: str) -> bool:
    """Send an outbound SMS using the vendor's own Twilio sub-account number.
    Returns True if Twilio accepted the request."""
    if not to_number.startswith(SMS_ALLOWED_PREFIXES):
        logger.info("SMS to %s blocked — outside supported region (US/CA only)", to_number)
        return False
    cli = _twilio_subaccount_client_for_conn(conn)
    if not cli:
        return False
    try:
        # Truncate to 1600 chars (Twilio hard limit per message ≈ 10 segments)
        body = (body or "")[:1600]
        cli.messages.create(
            from_=conn["phone_number"],
            to=to_number,
            body=body,
        )
        return True
    except TwilioRestException as e:
        logger.warning("Twilio SMS send failed: %s", e.msg)
        return False
    except Exception as e:
        logger.warning("Twilio SMS send error: %s", e)
        return False


@api_router.post("/sms/webhook")
async def sms_webhook(request: _StripeRequest):
    """Twilio POSTs here for every inbound SMS to a BotNira-provisioned number.
    We respond with empty TwiML and send the AI reply via the REST API
    (so we control timing + can record it in the inbox properly)."""
    form = await request.form()
    from_number = form.get("From", "")
    to_number = form.get("To", "")
    body = (form.get("Body") or "").strip()
    msg_sid = form.get("MessageSid", "")
    profile_name = (form.get("ProfileName") or "").strip()  # often empty for SMS, populated for WA

    logger.info("[sms webhook] from=%s to=%s body=%r sid=%s", from_number, to_number, body[:80], msg_sid)

    empty_resp = Response(content=str(MessagingResponse()), media_type="application/xml")

    if not from_number or not to_number or not body:
        return empty_resp

    # Look up vendor by the Twilio number that received the SMS
    conn = await db.voice_connections.find_one({"phone_number": to_number}, {"_id": 0})
    if not conn:
        logger.warning("SMS to unbound number %s — ignoring", to_number)
        return empty_resp
    vendor_id = conn["vendor_id"]

    # Region gate — block non-NA inbound numbers (we'd be charged carrier fees we can't recoup)
    if not from_number.startswith(SMS_ALLOWED_PREFIXES):
        logger.info("SMS from %s rejected — non-NA sender", from_number)
        return empty_resp

    # Find or create the conversation keyed by sender's number
    conv = await db.conversations.find_one(
        {"vendor_id": vendor_id, "channel": "sms", "customer_contact": from_number},
        {"_id": 0},
    )
    conv = conv or await _ensure_conversation(
        vendor_id, None, "sms", profile_name or from_number, from_number
    )
    # Idempotency: skip if we've already recorded this Twilio MessageSid
    if msg_sid:
        existing = await db.messages.find_one(
            {"conversation_id": conv["id"], "external_id": msg_sid}, {"_id": 0, "id": 1}
        )
        if existing:
            return empty_resp

    await _push_message(conv["id"], vendor_id, "user", body, external_id=msg_sid)

    # Plan + balance gate. If the vendor can't use SMS right now, send a one-time
    # paywall notice via SMS so the caller knows.
    ok, reason = await _vendor_can_use_channel(vendor_id, "sms")
    if not ok:
        await _twilio_send_sms(conn, from_number, reason or "Service paused. Please try again later.")
        return empty_resp

    # AI reply grounded in vendor's bot
    try:
        reply = await get_ai_reply(vendor_id, conv["id"], body)
    except Exception as e:
        logger.exception("get_ai_reply failed for SMS: %s", e)
        reply = "Sorry, I'm having trouble responding right now. Please try again in a minute."

    await _push_message(conv["id"], vendor_id, "bot", reply)
    await _decrement_message_balance(vendor_id)

    sent = await _twilio_send_sms(conn, from_number, reply)
    if not sent:
        logger.warning("AI SMS reply could not be sent (vendor=%s, to=%s)", vendor_id, from_number)

    # Auto-book appointment if the bot's reply confirmed one
    try:
        await _maybe_book_appointment(vendor_id, conv["id"], reply)
    except Exception:
        pass

    return empty_resp


@api_router.post("/sms/send")
async def sms_send(payload: Dict[str, str], user: dict = Depends(require_vendor)):
    """Live-agent override: vendor types a reply in the inbox, we send it as SMS."""
    conv_id = payload.get("conversation_id")
    text = (payload.get("text") or "").strip()
    if not conv_id or not text:
        raise HTTPException(status_code=400, detail="conversation_id and text required")
    conv = await db.conversations.find_one(
        {"id": conv_id, "vendor_id": user["vendor_id"], "channel": "sms"}, {"_id": 0}
    )
    if not conv:
        raise HTTPException(status_code=404, detail="SMS conversation not found")
    conn = await db.voice_connections.find_one(
        {"vendor_id": user["vendor_id"]}, {"_id": 0}
    )
    if not conn:
        raise HTTPException(status_code=400, detail="No active phone number — provision voice first")
    ok, reason = await _vendor_can_use_channel(user["vendor_id"], "sms")
    if not ok:
        raise HTTPException(status_code=402, detail=reason or "SMS not available on your plan")
    sent = await _twilio_send_sms(conn, conv["customer_contact"], text)
    if not sent:
        raise HTTPException(status_code=502, detail="Twilio rejected the SMS — check the number is valid US/CA")
    await _push_message(conv_id, user["vendor_id"], "agent", text)
    await _decrement_message_balance(user["vendor_id"])
    return {"ok": True}




# ----- WebSocket bridge: Twilio Media Streams ⇄ OpenAI Realtime -----
@app.websocket("/api/voice/stream/{call_id}")
async def voice_stream(ws: WebSocket, call_id: str):
    """Bridges Twilio <Stream> WS (μ-law 8kHz base64) to OpenAI Realtime (g711_ulaw)."""
    await ws.accept()
    call = await db.call_records.find_one({"id": call_id}, {"_id": 0})
    if not call:
        logger.warning("voice_stream: no call record for %s", call_id)
        await ws.close(code=1008)
        return
    vendor_id = call["vendor_id"]
    logger.info("voice_stream: start call_id=%s vendor_id=%s", call_id, vendor_id)
    vendor = await db.vendors.find_one({"id": vendor_id}, {"_id": 0})
    bot = await db.bots.find_one({"vendor_id": vendor_id}, {"_id": 0})

    if not OPENAI_REALTIME_API_KEY:
        logger.warning("OPENAI_REALTIME_API_KEY missing — voice bridge cannot connect to OpenAI")
        # Consume Twilio messages silently until they hang up
        try:
            while True:
                msg = await ws.receive_text()
                data = json.loads(msg)
                if data.get("event") == "stop":
                    break
        except WebSocketDisconnect:
            pass
        finally:
            await ws.close()
        return

    # Build a system prompt grounded in vendor's bot
    biz = (bot or {}).get("business_description") or (vendor or {}).get("business_description") or ""
    greeting = (bot or {}).get("greeting") or f"Hi, welcome to {vendor.get('name','our business')}. How can I help?"
    tone = (bot or {}).get("tone") or "friendly and professional"
    faqs = (bot or {}).get("faqs") or []
    faq_txt = "\n".join([f"- {f.get('q','')} → {f.get('a','')}" for f in faqs[:30]]) if faqs else ""
    system_instructions = (
        f"You are BotNira, a voice AI receptionist for {vendor.get('name','this business')}. "
        f"Speak in a {tone} tone. Keep replies short (1-3 sentences).\n\n"
        f"BUSINESS INFO (strict source of truth — do NOT invent anything beyond this):\n{biz}\n\n"
        f"FAQs:\n{faq_txt}\n\n"
        f"If you don't know an answer, say 'Let me have someone from our team follow up with you — what's the best callback number?'. "
        f"If the caller wants to book an appointment, collect name, phone and preferred date/time, then confirm it back."
    )

    import websockets as _ws
    # `gpt-realtime` is the GA replacement for the retired `gpt-4o-realtime-preview-*`
    # snapshots. Beta endpoint + `OpenAI-Beta: realtime=v1` header are no
    # longer required (the beta was sunset and beta header is now ignored / can
    # cause rejection on GA).
    oai_url = f"wss://api.openai.com/v1/realtime?model={OPENAI_REALTIME_MODEL}"
    oai_headers = [("Authorization", f"Bearer {OPENAI_REALTIME_API_KEY}")]
    stream_sid = None
    # Create ONE persistent conversation for this whole call (not per-message)
    conv = await _ensure_conversation(
        vendor_id, None, "voice",
        call.get("from_number") or "Caller",
        call.get("from_number") or "",
    )
    conv_id = conv["id"]
    # Link call_record to conversation
    await db.call_records.update_one(
        {"id": call_id}, {"$set": {"conversation_id": conv_id}}
    )
    logger.info("voice_stream: connecting to OpenAI Realtime for call %s (conv %s)", call_id, conv_id)
    try:
        async with _ws.connect(
            oai_url, additional_headers=oai_headers, max_size=None,
            ping_interval=20, ping_timeout=20,
        ) as oai:
            logger.info("voice_stream: OpenAI connected for call %s", call_id)
            # Configure OpenAI session. CRITICAL settings:
            # - VAD threshold 0.6 (less sensitive → stops false triggers from background noise)
            # - silence_duration_ms 600 (wait 0.6s of silence before ending user's turn)
            # - prefix_padding_ms 300 (keep 0.3s of audio before detected speech)
            # - temperature 0.7 (natural but on-topic)
            session_cfg = {
                "type": "session.update",
                "session": {
                    "modalities": ["audio", "text"],
                    "voice": "alloy",
                    "input_audio_format": "g711_ulaw",
                    "output_audio_format": "g711_ulaw",
                    "instructions": system_instructions,
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.6,
                        "prefix_padding_ms": 300,
                        "silence_duration_ms": 600,
                        "create_response": True,
                    },
                    "input_audio_transcription": {"model": "whisper-1"},
                    "temperature": 0.7,
                },
            }
            await oai.send(json.dumps(session_cfg))
            # Proactive greeting
            await oai.send(json.dumps({
                "type": "response.create",
                "response": {"modalities": ["audio", "text"], "instructions": f"Greet the caller warmly in one short sentence: {greeting}"},
            }))

            # Barge-in bookkeeping
            state = {
                "latest_response_id": None,
                "latest_assistant_item_id": None,
                "response_start_timestamp": None,
                "latest_media_timestamp": 0,   # ms from Twilio (from media events)
                "bot_speaking": False,
            }

            async def send_mark_to_twilio():
                """After each audio chunk we send to Twilio, emit a mark event.
                When Twilio replays it back, we know audio was flushed to the caller."""
                if stream_sid:
                    await ws.send_text(json.dumps({
                        "event": "mark",
                        "streamSid": stream_sid,
                        "mark": {"name": "botnira-audio"},
                    }))

            async def handle_user_interruption():
                """User started talking while bot was talking → cancel bot's current response
                and tell Twilio to throw away any queued bot audio so call feels snappy."""
                if not state["bot_speaking"]:
                    return
                logger.info("voice_stream: user barge-in — cancelling bot response")
                # 1) Tell Twilio to clear its outbound audio queue
                if stream_sid:
                    try:
                        await ws.send_text(json.dumps({"event": "clear", "streamSid": stream_sid}))
                    except Exception:
                        pass
                # 2) Tell OpenAI to truncate the in-progress assistant message
                if state["latest_assistant_item_id"] and state["response_start_timestamp"] is not None:
                    elapsed = state["latest_media_timestamp"] - state["response_start_timestamp"]
                    if elapsed > 0:
                        try:
                            await oai.send(json.dumps({
                                "type": "conversation.item.truncate",
                                "item_id": state["latest_assistant_item_id"],
                                "content_index": 0,
                                "audio_end_ms": int(elapsed),
                            }))
                        except Exception as e:
                            logger.warning("truncate failed: %s", e)
                # 3) Cancel the response so no more audio deltas come in
                try:
                    await oai.send(json.dumps({"type": "response.cancel"}))
                except Exception:
                    pass
                state["bot_speaking"] = False
                state["latest_assistant_item_id"] = None
                state["response_start_timestamp"] = None

            async def twilio_to_oai():
                nonlocal stream_sid
                try:
                    while True:
                        raw = await ws.receive_text()
                        ev = json.loads(raw)
                        etype = ev.get("event")
                        if etype == "start":
                            stream_sid = ev["start"]["streamSid"]
                            logger.info("voice_stream: twilio 'start' streamSid=%s", stream_sid)
                        elif etype == "media":
                            ts = int(ev["media"].get("timestamp", 0))
                            if ts:
                                state["latest_media_timestamp"] = ts
                            payload = ev["media"]["payload"]
                            try:
                                await oai.send(json.dumps({"type": "input_audio_buffer.append", "audio": payload}))
                            except Exception as e:
                                logger.warning("oai send failed (connection dropped?): %s", e)
                                break
                        elif etype == "mark":
                            # Twilio just flushed one of our audio chunks to the caller — useful bookkeeping
                            pass
                        elif etype == "stop":
                            logger.info("voice_stream: twilio 'stop' for %s", call_id)
                            break
                except WebSocketDisconnect:
                    logger.info("voice_stream: twilio disconnected for %s", call_id)
                except Exception as e:
                    logger.exception("twilio_to_oai error: %s", e)

            async def oai_to_twilio():
                try:
                    async for msg in oai:
                        ev = json.loads(msg)
                        etype = ev.get("type")
                        if etype == "error":
                            logger.warning("openai realtime error: %s", ev.get("error"))
                        elif etype == "input_audio_buffer.speech_started":
                            # User just started speaking → if bot was talking, barge in
                            await handle_user_interruption()
                        elif etype == "response.created":
                            state["latest_response_id"] = ev["response"]["id"]
                            state["bot_speaking"] = True
                            state["response_start_timestamp"] = state["latest_media_timestamp"]
                        elif etype == "response.output_item.added":
                            item = ev.get("item") or {}
                            if item.get("type") == "message":
                                state["latest_assistant_item_id"] = item.get("id")
                        elif etype == "response.audio.delta" and stream_sid:
                            await ws.send_text(json.dumps({
                                "event": "media",
                                "streamSid": stream_sid,
                                "media": {"payload": ev["delta"]},
                            }))
                            await send_mark_to_twilio()
                        elif etype == "response.done":
                            state["bot_speaking"] = False
                            state["latest_assistant_item_id"] = None
                            state["response_start_timestamp"] = None
                        elif etype == "response.audio_transcript.done":
                            text = ev.get("transcript", "")
                            if text:
                                await _push_message(conv_id, vendor_id, "bot", text)
                                logger.info("voice_stream: bot said: %s", text[:80])
                                try:
                                    await _maybe_book_appointment(vendor_id, conv_id, text)
                                except Exception as e:
                                    logger.warning("voice appt book failed: %s", e)
                        elif etype == "conversation.item.input_audio_transcription.completed":
                            text = ev.get("transcript", "")
                            if text:
                                await _push_message(conv_id, vendor_id, "user", text)
                                logger.info("voice_stream: user said: %s", text[:80])
                except Exception as e:
                    logger.warning("oai_to_twilio ended: %s", e)

            # return_exceptions so one pump dying doesn't silently cancel the other
            await asyncio.gather(twilio_to_oai(), oai_to_twilio(), return_exceptions=True)
    except Exception as e:
        logger.exception("Voice bridge error: %s", e)
    finally:
        try:
            await ws.close()
        except Exception:
            pass


def _public_base_url_from_request(request: _StripeRequest) -> str:
    """Derive the public base URL the caller used to reach us.

    Why: Emergent deployment env vars sometimes don't propagate to the
    running pod, and Cloudflare rewrites X-Forwarded-Host to the internal
    hostname. The most reliable signal is the browser-sent Origin/Referer
    header, which contains the URL the user actually has in their address bar.

    Order of preference:
      1. Origin header (browser-set, never rewritten by Cloudflare)
      2. Referer header (same source, fallback)
      3. X-Forwarded-Host (set by ingress / edge)
      4. Host header
      5. PUBLIC_BASE_URL env var (last resort)
    """
    # 1. Origin header — most authoritative. Looks like "https://botnira.com"
    origin = (request.headers.get("origin") or "").strip()
    if origin and origin.startswith(("http://", "https://")):
        return origin.rstrip("/")
    # 2. Referer — same info, just appended with the path
    referer = (request.headers.get("referer") or "").strip()
    if referer and referer.startswith(("http://", "https://")):
        try:
            from urllib.parse import urlparse
            p = urlparse(referer)
            if p.scheme and p.netloc:
                return f"{p.scheme}://{p.netloc}".rstrip("/")
        except Exception:
            pass
    # 3-4. Forwarded host headers (less reliable on Cloudflare)
    fwd_proto = (request.headers.get("x-forwarded-proto") or "https").split(",")[0].strip()
    fwd_host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",")[0].strip()
    if fwd_host:
        return f"{fwd_proto}://{fwd_host}".rstrip("/")
    # 5. Last-resort
    return (PUBLIC_BASE_URL or "").rstrip("/")


@api_router.post("/admin/voice/migrate-webhooks")
async def admin_voice_migrate_webhooks(request: _StripeRequest, user: dict = Depends(require_admin)):
    """Re-wire every purchased Twilio number to the current public URL.
    Derives target URL from the inbound request's Host header — so calling
    this from `https://botnira.com/admin` always writes botnira.com to Twilio,
    even if PUBLIC_BASE_URL env var is misconfigured.
    Safe to run anytime. Idempotent — numbers already pointing at the right
    URL are skipped."""
    base = _public_base_url_from_request(request)
    if not base:
        raise HTTPException(status_code=500, detail="Could not determine public base URL")
    target_voice = f"{base}/api/voice/webhook"
    target_status = f"{base}/api/voice/status-callback"
    target_sms = f"{base}/api/sms/webhook"
    updated, skipped, failed = [], [], []
    async for conn in db.voice_connections.find({}, {"_id": 0}):
        sub = await db.voice_subaccounts.find_one(
            {"vendor_id": conn["vendor_id"]}, {"_id": 0}
        )
        if not sub:
            failed.append({"number": conn.get("phone_number"), "reason": "no subaccount"})
            continue
        try:
            sub_tw = _twilio_subaccount_client(sub["account_sid"], sub["auth_token"])
            num = sub_tw.incoming_phone_numbers(conn["phone_number_sid"]).fetch()
            if num.voice_url == target_voice and num.status_callback == target_status and num.sms_url == target_sms:
                skipped.append(conn.get("phone_number"))
                continue
            sub_tw.incoming_phone_numbers(conn["phone_number_sid"]).update(
                voice_url=target_voice,
                voice_method="POST",
                status_callback=target_status,
                status_callback_method="POST",
                sms_url=target_sms,
                sms_method="POST",
            )
            await db.voice_connections.update_one(
                {"id": conn["id"]},
                {"$set": {
                    "voice_webhook": target_voice,
                    "sms_webhook": target_sms,
                    "migrated_at": now_iso(),
                }},
            )
            # Auto-activate SMS channel for any vendor whose voice number we just rewired
            await db.channels.update_one(
                {"vendor_id": conn["vendor_id"], "channel": "sms"},
                {"$set": {
                    "status": "connected",
                    "config": {"phone_number": conn.get("phone_number")},
                    "updated_at": now_iso(),
                }},
                upsert=True,
            )
            updated.append(conn.get("phone_number"))
        except Exception as e:
            failed.append({"number": conn.get("phone_number"), "reason": str(e)[:120]})
    return {
        "public_base_url": base,
        "target_voice_webhook": target_voice,
        "target_sms_webhook": target_sms,
        "updated": updated, "skipped": skipped, "failed": failed,
        "summary": f"{len(updated)} re-wired (voice + SMS), {len(skipped)} already correct, {len(failed)} failed",
    }


@api_router.get("/admin/system/urls")
async def admin_system_urls(user: dict = Depends(require_admin)):
    """Snapshot of every public URL this deployment is using.
    Handy when migrating domains — run before and after `PUBLIC_BASE_URL` change."""
    voice_conns = await db.voice_connections.find({}, {"_id": 0}).to_list(500)
    wa_conns = await db.whatsapp_connections.find({}, {"_id": 0}).to_list(500)
    return {
        "public_base_url": PUBLIC_BASE_URL,
        "widget_embed_host": PUBLIC_BASE_URL,
        "whatsapp_webhook_expected": f"{PUBLIC_BASE_URL.rstrip('/')}/api/whatsapp/webhook",
        "voice_webhook_expected": f"{PUBLIC_BASE_URL.rstrip('/')}/api/voice/webhook",
        "stripe_webhook_expected": f"{PUBLIC_BASE_URL.rstrip('/')}/api/webhook/stripe",
        "voice_numbers_on_file": [
            {"vendor_id": c["vendor_id"], "number": c.get("phone_number"), "recorded_webhook": c.get("voice_webhook")}
            for c in voice_conns
        ],
        "whatsapp_numbers_on_file": [
            {"vendor_id": w["vendor_id"], "phone_number_id": w.get("phone_number_id"), "display_phone_number": w.get("display_phone_number")}
            for w in wa_conns
        ],
        "stripe_live_mode": STRIPE_SECRET_KEY.startswith("sk_live_") if STRIPE_SECRET_KEY else False,
        "stripe_webhook_verification_enabled": bool(STRIPE_WEBHOOK_SECRET),
    }


# ------------------------------ App setup ------------------------------------
# Mount the extracted Email channel module — kept here at the bottom so all
# server-level helpers (require_vendor, _push_message, _ensure_conversation,
# _vendor_can_use_channel, _decrement_message_balance, _maybe_book_appointment,
# get_ai_reply, db, logger, JWT_SECRET, SMTP_FROM_NAME, now_iso, new_id) are
# already bound on the `server` module before `email_routes` imports it.
from email_routes import router as _email_router, _start_email_poller as _email_start  # noqa: E402
api_router.include_router(_email_router, prefix="/email")
app.add_event_handler("startup", _email_start)

# Sales Assistance — outbound email marketing (Growth/Pro plan-gated)
from sales_routes import router as _sales_router, _start_sales_sender as _sales_start  # noqa: E402
api_router.include_router(_sales_router, prefix="/sales")
app.add_event_handler("startup", _sales_start)

# Referral program — 15% recurring commission, paid monthly
from referral_routes import (  # noqa: E402
    router as _referral_router,
    admin_router as _referral_admin_router,
    ensure_referral_code as _ensure_referral_code,
    attach_referral_on_signup as _attach_referral_on_signup,
    record_commission_for_invoice as _record_referral_commission,
    mark_referral_cancelled as _mark_referral_cancelled,
)
api_router.include_router(_referral_router, prefix="/referrals")
api_router.include_router(_referral_admin_router, prefix="/admin/referrals")

# Blog module — public reader + admin CMS with object-storage image uploads
from blog_routes import (  # noqa: E402
    router as _blog_router,
    admin_router as _blog_admin_router,
    init_storage as _blog_init_storage,
)
api_router.include_router(_blog_router, prefix="/blogs")
api_router.include_router(_blog_admin_router, prefix="/admin/blogs")

@app.on_event("startup")
async def _init_blog_storage():
    try:
        _blog_init_storage()
    except Exception as e:
        logger.warning("blog storage init non-fatal: %s", e)

app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    # Widget is embedded on 3rd-party sites (any origin). It does NOT send
    # cookies; our auth uses an Authorization header which is same-origin
    # only (dashboard). With credentials=False we can legally use "*".
    allow_credentials=False,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
()
