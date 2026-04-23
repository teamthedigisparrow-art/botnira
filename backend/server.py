"""BotNira - Multi-tenant AI Receptionist platform backend."""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
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
PLANS = {
    "starter": {"name": "Starter", "price_usd": 49.0,  "voice_min": 100,  "messages": 2000},
    "growth":  {"name": "Growth",  "price_usd": 149.0, "voice_min": 500,  "messages": 8000},
    "pro":     {"name": "Pro",     "price_usd": 399.0, "voice_min": 1500, "messages": 25000},
}
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
    status: str = "active"  # active | suspended
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
    admin_email = "admin@botnira.com"
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one(
            {
                "id": new_id(),
                "email": admin_email,
                "password_hash": hash_password("admin123"),
                "full_name": "Super Admin",
                "role": "superadmin",
                "vendor_id": None,
                "created_at": now_iso(),
            }
        )
        logger.info("Seeded superadmin admin@botnira.com / admin123")

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
                "password_hash": hash_password("demo123"),
                "full_name": "Dr. Demo",
                "role": "vendor",
                "vendor_id": vid,
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
            "password_hash": hash_password("kamal123"),
            "full_name": "Kamal (Test Vendor)",
            "role": "vendor",
            "vendor_id": tv,
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
async def signup(req: SignupReq):
    if await db.users.find_one({"email": req.email}):
        raise HTTPException(status_code=400, detail="Email already registered")
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
            "email": req.email,
            "password_hash": hash_password(req.password),
            "full_name": req.full_name,
            "role": "vendor",
            "vendor_id": vid,
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
    token = create_token(uid, "vendor")
    return {"token": token, "role": "vendor", "vendor_id": vid}


@api_router.post("/auth/login")
async def login(req: LoginReq):
    user = await db.users.find_one({"email": req.email})
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user["role"] == "vendor":
        vendor = await db.vendors.find_one({"id": user["vendor_id"]})
        if vendor and vendor.get("status") == "suspended":
            raise HTTPException(status_code=403, detail="Account suspended")
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
6. Keep replies short and scannable (1-3 short paragraphs). Use a blank line between paragraphs.
7. When listing 3+ items (services, hours, steps), use "- " bullet points on separate lines.
8. Never use markdown tables. Use **bold** only for key details (price, date, phone).
9. When you share a URL, phone number, or email, output it as plain text — the UI will auto-link it.
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
    history = await db.messages.find(
        {"conversation_id": conversation_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(50)
    history_txt = "\n".join(
        [f"{m['role'].upper()}: {m['content']}" for m in history[-8:]]
    )
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
    existing = await db.appointments.find_one({"conversation_id": conversation_id})
    if existing:
        return None
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
        appt = {
            "id": new_id(),
            "vendor_id": vendor_id,
            "customer_name": data.get("customer_name", "Guest") or "Guest",
            "customer_contact": data.get("customer_contact", "") or "",
            "scheduled_at": data.get("scheduled_at", "") or "",
            "notes": data.get("notes", "Booked via BotNira chat"),
            "status": "scheduled",
            "conversation_id": conversation_id,
            "created_at": now_iso(),
        }
        await db.appointments.insert_one(appt)
        logger.info("Auto-booked appointment for vendor=%s conv=%s", vendor_id, conversation_id)
        return {k: v for k, v in appt.items() if k != "_id"}
    except Exception as e:
        logger.warning("booking extraction failed: %s", str(e)[:120])
        return None


async def _push_message(conversation_id: str, vendor_id: str, role: str, content: str):
    msg = {
        "id": new_id(),
        "conversation_id": conversation_id,
        "vendor_id": vendor_id,
        "role": role,
        "content": content,
        "created_at": now_iso(),
    }
    await db.messages.insert_one(msg)
    await db.conversations.update_one(
        {"id": conversation_id},
        {"$set": {"updated_at": now_iso(), "last_message_preview": content[:120]}},
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
    status: Optional[str] = None,
    user: dict = Depends(require_vendor),
):
    q: Dict[str, Any] = {"vendor_id": user["vendor_id"]}
    if channel:
        q["channel"] = channel
    if status:
        q["status"] = status
    items = await db.conversations.find(q, {"_id": 0}).sort("updated_at", -1).to_list(500)
    return items


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
    # For web/sms/email channels the message is saved; widget will poll and
    # deliver it to the visitor in ~3 seconds (see /api/chat/poll).

    if not delivery["ok"]:
        # Surface the delivery error so the UI can show a toast.
        raise HTTPException(status_code=502, detail=delivery["error"])
    return {"message": msg, "delivery": delivery}


# ------------------------------ Inbound simulators ---------------------------
@api_router.post("/simulate/{channel}")
async def simulate_inbound(
    channel: str,
    req: SimulateInboundReq,
    user: dict = Depends(require_vendor),
):
    if channel not in {"whatsapp", "email", "sms"}:
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
    return {"conversation_id": conv["id"], "reply": reply}


# ------------------------------ Appointments ---------------------------------
@api_router.get("/appointments")
async def list_appointments(user: dict = Depends(require_vendor)):
    items = await db.appointments.find(
        {"vendor_id": user["vendor_id"]}, {"_id": 0}
    ).sort("scheduled_at", 1).to_list(1000)
    return items


@api_router.post("/appointments")
async def create_appointment(req: AppointmentReq, user: dict = Depends(require_vendor)):
    appt = {
        "id": new_id(),
        "vendor_id": user["vendor_id"],
        "customer_name": req.customer_name,
        "customer_contact": req.customer_contact,
        "scheduled_at": req.scheduled_at,
        "notes": req.notes,
        "status": "scheduled",
        "conversation_id": req.conversation_id,
        "created_at": now_iso(),
    }
    await db.appointments.insert_one(appt)
    return {k: v for k, v in appt.items() if k != "_id"}


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
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            await c.post(
                f"{GRAPH_BASE}/{req.waba_id}/subscribed_apps",
                headers={"Authorization": f"Bearer {META_SYSTEM_USER_TOKEN}"},
            )
            await c.post(
                f"{GRAPH_BASE}/{req.phone_number_id}",
                headers={"Authorization": f"Bearer {META_SYSTEM_USER_TOKEN}"},
                params={
                    "webhook_configuration": json.dumps({
                        "override_callback_uri": base_webhook,
                        "verify_token": META_VERIFY_TOKEN,
                    })
                },
            )
    except Exception as e:
        logger.warning("WhatsApp connect subscription/override best-effort failed: %s", e)
    return {"status": "connected", "connection": conn}


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
        if not waba_ids:
            raise HTTPException(status_code=400, detail="No WhatsApp Business Account was authorised in this signup.")
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
        try:
            await c.post(
                f"{GRAPH_BASE}/{waba_id}/subscribed_apps",
                headers={"Authorization": f"Bearer {vendor_token}"},
            )
            await c.post(
                f"{GRAPH_BASE}/{phone_number_id}",
                headers={"Authorization": f"Bearer {vendor_token}"},
                params={
                    "webhook_configuration": json.dumps({
                        "override_callback_uri": f"{PUBLIC_BASE_URL}/api/whatsapp/webhook",
                        "verify_token": META_VERIFY_TOKEN,
                    })
                },
            )
        except Exception as e:
            logger.warning("Post-signup subscription best-effort failed: %s", e)

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
    return {"status": "connected", "connection": conn}


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
    # Active paying subscription
    if sub_status == "active":
        return {
            "paywall": False, "trial": False, "trial_days_left": 0,
            "allowed_channels": {"web", "whatsapp", "email", "sms", "voice"},
            "plan_label": vendor.get("plan", "starter"), "is_exempt": False,
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
        return False, f"The {channel} channel requires an active plan."
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


@app.on_event("startup")
async def startup_stripe():
    # Backfill billing fields on existing vendors (idempotent migration)
    try:
        async for v in db.vendors.find({}, {"_id": 0, "id": 1, "plan": 1, "created_at": 1, "is_exempt": 1}):
            updates = {}
            if "subscription_status" not in v:
                # Pre-existing vendors → treat as fresh trial from today
                updates["subscription_status"] = "trialing"
                updates["trial_ends_at"] = (
                    datetime.now(timezone.utc) + timedelta(days=TRIAL_DAYS)
                ).isoformat()
                updates["minutes_balance"] = 0.0
                updates["messages_balance"] = TRIAL_MESSAGE_CAP
                updates["plan_minutes_monthly"] = 0
                updates["plan_messages_monthly"] = 0
                updates["plan"] = "trial"
            if updates:
                await db.vendors.update_one({"id": v["id"]}, {"$set": updates})
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
    session = _stripe.checkout.Session.create(
        mode="subscription",
        customer=cust_id,
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=f"{origin}/app/billing?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{origin}/app/billing?cancelled=1",
        metadata={
            "vendor_id": vendor["id"],
            "type": "subscription",
            "plan": req.plan,
        },
        subscription_data={
            "metadata": {"vendor_id": vendor["id"], "plan": req.plan},
        },
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
    session = _stripe.checkout.Session.create(
        mode="payment",
        customer=cust_id,
        line_items=[{"price": price_id, "quantity": 1}],
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
    Guards against double-apply via payment_transactions.status='completed'."""
    txn = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not txn:
        return
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
        if vendor_id and txn_type and key and session_id:
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
        await db.vendors.update_one(
            {"stripe_subscription_id": sub_id},
            {"$set": {"subscription_status": "canceled"}},
        )

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
        # aggregate topup spend
        agg = await db.payment_transactions.aggregate([
            {"$match": {"vendor_id": v["id"], "status": "completed"}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
        ]).to_list(1)
        total_spent = (agg[0]["total"] if agg else 0.0) if agg else 0.0
        rows.append({
            "vendor_id": v["id"],
            "name": v.get("name"),
            "email": u.get("email"),
            "owner": u.get("full_name"),
            "plan": plan,
            "subscription_status": sub_status,
            "plan_price_usd": plan_price,
            "trial_ends_at": v.get("trial_ends_at"),
            "current_period_end": v.get("current_period_end"),
            "minutes_balance": float(v.get("minutes_balance", 0.0)),
            "messages_balance": int(v.get("messages_balance", 0)),
            "is_exempt": bool(v.get("is_exempt")),
            "stripe_customer_id": v.get("stripe_customer_id"),
            "stripe_subscription_id": v.get("stripe_subscription_id"),
            "total_spent_usd": round(float(total_spent), 2),
            "created_at": v.get("created_at"),
        })
    return {
        "summary": {
            "mrr_usd": round(mrr, 2),
            "arr_usd": round(mrr * 12, 2),
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


# ------------------------------ App setup ------------------------------------
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
