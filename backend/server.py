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
RETELL_API_KEY = os.environ.get("RETELL_API_KEY", "")
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "")

# Voice plan limits (minutes per month included in the plan price).
# When vendor crosses this we auto-pause voice so they can't bleed money.
PLAN_LIMITS = {"starter": 100, "growth": 500, "pro": 1500}
EXEMPT_EMAILS = {"kamal@thedigisparrow.com"}  # internal test vendor — no cap, no cost

# Retell client (lazy singleton)
_retell_client = None
def get_retell():
    global _retell_client
    if _retell_client is None:
        if not RETELL_API_KEY:
            raise HTTPException(status_code=503, detail="Voice service not configured")
        from retell import Retell
        _retell_client = Retell(api_key=RETELL_API_KEY)
    return _retell_client

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
    await db.vendors.insert_one(
        {
            "id": vid,
            "name": req.business_name,
            "slug": slugify(req.business_name) + "-" + vid[:4],
            "business_description": "",
            "status": "active",
            "plan": "free",
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
    if user.get("vendor_id"):
        vendor = await db.vendors.find_one({"id": user["vendor_id"]}, {"_id": 0})
    return {"user": user, "vendor": vendor}


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
    # Keep the Retell voice LLM in sync so chat + phone always say the same thing.
    try:
        await sync_retell_llm(user["vendor_id"])
    except Exception as e:
        logger.warning("sync_retell_llm after bot update failed: %s", e)
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
    conv = await _ensure_conversation(
        req.vendor_id,
        req.conversation_id,
        req.channel or "web",
        req.customer_name or "Guest",
        req.customer_contact or "",
    )
    await _push_message(conv["id"], req.vendor_id, "user", req.message)
    reply = await get_ai_reply(req.vendor_id, conv["id"], req.message)
    bot_msg = await _push_message(conv["id"], req.vendor_id, "bot", reply)
    await _maybe_book_appointment(req.vendor_id, conv["id"], reply)
    return {"conversation_id": conv["id"], "reply": reply, "message": bot_msg}


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
    call = None
    if conv.get("channel") == "voice" and conv.get("call_id"):
        call = await db.call_records.find_one(
            {"vendor_id": user["vendor_id"], "call_id": conv["call_id"]}, {"_id": 0}
        )
    return {"conversation": conv, "messages": messages, "call": call}


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
    msg = await _push_message(cid, user["vendor_id"], "agent", payload.get("content", ""))
    return msg


# ------------------------------ Inbound simulators ---------------------------
@api_router.post("/simulate/{channel}")
async def simulate_inbound(
    channel: str,
    req: SimulateInboundReq,
    user: dict = Depends(require_vendor),
):
    if channel not in {"whatsapp", "email", "sms", "voice"}:
        raise HTTPException(status_code=400, detail="Invalid channel")
    conv = await _ensure_conversation(
        user["vendor_id"], None, channel, req.customer_name, req.customer_contact
    )
    await _push_message(conv["id"], user["vendor_id"], "user", req.message)
    reply = await get_ai_reply(user["vendor_id"], conv["id"], req.message)
    await _push_message(conv["id"], user["vendor_id"], "bot", reply)
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


# ============================== Voice (Retell AI) ============================
class VoiceActivateReq(BaseModel):
    area_code: Optional[int] = None
    voice_id: Optional[str] = "11labs-Adrian"
    plan: Optional[str] = "starter"


class TestCallReq(BaseModel):
    to_number: str


def _build_voice_prompt(bot: dict, vendor: dict) -> str:
    faqs = "\n".join(
        f"Q: {f.get('q','')}\nA: {f.get('a','')}" for f in bot.get("faqs", []) if f.get("q")
    )
    fallback = bot.get("fallback_message", "I am not sure about that. A team member will follow up.")
    return (
        f"# Identity\n"
        f"You are {bot.get('bot_name','BotNira')}, the AI phone receptionist for \"{vendor.get('name','this business')}\".\n"
        f"Tone: {bot.get('tone','friendly and professional')}.\n\n"
        f"# Business information (your ONLY source of truth)\n{bot.get('business_description','')}\n\n"
        f"# Frequently asked questions\n{faqs if faqs else '(none)'}\n\n"
        f"# Strict rules\n"
        f"- Answer ONLY using the business information and FAQs above.\n"
        f"- If the answer is not covered, say: \"{fallback}\"\n"
        f"- Do not invent hours, prices, locations, services, or policies.\n"
        f"- Never answer unrelated general-knowledge questions; steer back to the business.\n"
        f"- Keep each response to 1-2 short sentences. Speak naturally — this is a phone call.\n"
        f"- For appointments collect: full name, phone or email, preferred date/time, reason. Confirm the details back clearly."
    )


async def _is_exempt_vendor(vendor_id: str) -> bool:
    v = await db.vendors.find_one({"id": vendor_id}, {"_id": 0, "is_exempt": 1})
    return bool(v and v.get("is_exempt"))


async def _enforce_voice_quota(vendor_id: str):
    """If the vendor has used up their included minutes, detach the agent from
    the phone number so inbound calls stop being answered. Exempt vendors skip."""
    if await _is_exempt_vendor(vendor_id):
        return
    vc = await db.voice_connections.find_one({"vendor_id": vendor_id}, {"_id": 0})
    if not vc or vc.get("status") != "active":
        return
    plan = vc.get("plan", "starter")
    limit = PLAN_LIMITS.get(plan, 0)
    used = float(vc.get("minutes_used", 0.0))
    if limit and used >= limit:
        try:
            get_retell().phone_number.update(
                phone_number=vc["phone_number"],
                inbound_agent_id=None,
            )
        except Exception as e:
            logger.warning("failed to pause phone agent: %s", e)
        await db.voice_connections.update_one(
            {"vendor_id": vendor_id},
            {"$set": {"status": "paused_quota", "paused_at": now_iso()}},
        )
        logger.info("Voice paused for vendor %s (over %s min)", vendor_id, limit)


async def sync_retell_llm(vendor_id: str):
    vc = await db.voice_connections.find_one({"vendor_id": vendor_id}, {"_id": 0})
    if not vc or not vc.get("retell_llm_id") or vc.get("status") != "active":
        return
    bot = await db.bots.find_one({"vendor_id": vendor_id}, {"_id": 0})
    vendor = await db.vendors.find_one({"id": vendor_id}, {"_id": 0})
    if not bot or not vendor:
        return
    try:
        get_retell().llm.update(
            llm_id=vc["retell_llm_id"],
            general_prompt=_build_voice_prompt(bot, vendor),
            begin_message=bot.get("greeting", "Hello, how can I help?"),
        )
        await db.voice_connections.update_one(
            {"vendor_id": vendor_id}, {"$set": {"last_synced_at": now_iso()}}
        )
    except Exception as e:
        logger.warning("Retell LLM sync failed for %s: %s", vendor_id, str(e)[:120])


@api_router.post("/voice/activate")
async def voice_activate(req: VoiceActivateReq, user: dict = Depends(require_vendor)):
    if not RETELL_API_KEY or not PUBLIC_BASE_URL:
        raise HTTPException(status_code=503, detail="Voice service not configured")

    existing = await db.voice_connections.find_one({"vendor_id": user["vendor_id"]}, {"_id": 0})
    if existing and existing.get("status") == "active":
        return {"status": "already_active", "connection": existing}

    bot = await db.bots.find_one({"vendor_id": user["vendor_id"]}, {"_id": 0})
    vendor = await db.vendors.find_one({"id": user["vendor_id"]}, {"_id": 0})
    if not bot or not vendor:
        raise HTTPException(status_code=400, detail="Bot or vendor missing")

    rc = get_retell()
    webhook_url = f"{PUBLIC_BASE_URL}/api/webhooks/retell"
    llm = None
    agent = None
    try:
        llm = rc.llm.create(
            general_prompt=_build_voice_prompt(bot, vendor),
            begin_message=bot.get("greeting", "Hello, how can I help?"),
        )
        agent = rc.agent.create(
            response_engine={"type": "retell-llm", "llm_id": llm.llm_id},
            voice_id=req.voice_id or "11labs-Adrian",
            agent_name=f"{vendor['name']} Voice"[:64],
            language="en-US",
            webhook_url=webhook_url,
        )
        phone = rc.phone_number.create(
            inbound_agent_id=agent.agent_id,
            area_code=req.area_code,
        )
    except Exception as e:
        logger.exception("Retell activation failed")
        # rollback partial resources so we don't leak them
        try:
            if agent:
                rc.agent.delete(agent.agent_id)
        except Exception:
            pass
        msg = str(e)
        if "card on file" in msg.lower() or "402" in msg:
            raise HTTPException(
                status_code=402,
                detail=(
                    "Retell requires a payment method before provisioning phone numbers. "
                    "Please add a card at https://dashboard.retellai.com/billing, then try again. "
                    "(Your $10 free credit covers LLM/voice usage but not number rental.)"
                ),
            )
        raise HTTPException(status_code=502, detail=f"Retell activation failed: {msg[:220]}")

    conn = {
        "id": new_id(),
        "vendor_id": user["vendor_id"],
        "retell_llm_id": llm.llm_id,
        "retell_agent_id": agent.agent_id,
        "phone_number": phone.phone_number,
        "phone_number_pretty": getattr(phone, "phone_number_pretty", phone.phone_number),
        "area_code": req.area_code,
        "voice_id": req.voice_id or "11labs-Adrian",
        "plan": req.plan or "starter",
        "status": "active",
        "webhook_url": webhook_url,
        "minutes_used": 0.0,
        "cost_accumulated": 0.0,
        "created_at": now_iso(),
    }
    await db.voice_connections.replace_one(
        {"vendor_id": user["vendor_id"]}, conn, upsert=True
    )
    await db.channels.update_one(
        {"vendor_id": user["vendor_id"], "channel": "voice"},
        {"$set": {"status": "connected", "updated_at": now_iso()}},
    )
    return {"status": "active", "connection": conn}


@api_router.post("/voice/deactivate")
async def voice_deactivate(user: dict = Depends(require_vendor)):
    vc = await db.voice_connections.find_one({"vendor_id": user["vendor_id"]}, {"_id": 0})
    if not vc:
        return {"status": "inactive"}
    rc = get_retell()
    try:
        if vc.get("phone_number"):
            try: rc.phone_number.delete(vc["phone_number"])
            except Exception as e: logger.warning("phone delete failed: %s", e)
        if vc.get("retell_agent_id"):
            try: rc.agent.delete(vc["retell_agent_id"])
            except Exception as e: logger.warning("agent delete failed: %s", e)
    finally:
        await db.voice_connections.update_one(
            {"vendor_id": user["vendor_id"]},
            {"$set": {"status": "inactive", "deactivated_at": now_iso()}},
        )
        await db.channels.update_one(
            {"vendor_id": user["vendor_id"], "channel": "voice"},
            {"$set": {"status": "disconnected", "updated_at": now_iso()}},
        )
    return {"status": "inactive"}


@api_router.get("/voice/status")
async def voice_status(user: dict = Depends(require_vendor)):
    vc = await db.voice_connections.find_one({"vendor_id": user["vendor_id"]}, {"_id": 0})
    month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    calls = await db.call_records.find(
        {"vendor_id": user["vendor_id"], "created_at": {"$gte": month_start}},
        {"_id": 0},
    ).to_list(5000)
    total_seconds = sum(c.get("duration_seconds", 0) for c in calls)
    total_cost = sum(c.get("pricing", {}).get("total_cost", 0) for c in calls)
    exempt = await _is_exempt_vendor(user["vendor_id"])
    plan = (vc or {}).get("plan", "starter")
    limit = None if exempt else PLAN_LIMITS.get(plan, 0)
    used = float((vc or {}).get("minutes_used", 0.0))
    return {
        "connection": vc,
        "stats_this_month": {
            "calls": len(calls),
            "minutes": round(total_seconds / 60, 1),
            "cost": round(0 if exempt else total_cost, 2),
        },
        "quota": {
            "exempt": exempt,
            "plan": "unlimited" if exempt else plan,
            "limit_minutes": limit,   # null if unlimited
            "used_minutes": round(used, 1),
            "remaining_minutes": None if exempt else max(0, round((limit or 0) - used, 1)),
            "paused": (vc or {}).get("status") == "paused_quota",
        },
    }


@api_router.post("/voice/resume")
async def voice_resume(user: dict = Depends(require_vendor)):
    """Re-enable a paused voice agent (after plan upgrade or month rollover).
    Admin/upgrade flows can trigger this; we also auto-reset minutes_used."""
    vc = await db.voice_connections.find_one({"vendor_id": user["vendor_id"]}, {"_id": 0})
    if not vc:
        raise HTTPException(status_code=404, detail="Voice not configured")
    try:
        get_retell().phone_number.update(
            phone_number=vc["phone_number"],
            inbound_agent_id=vc["retell_agent_id"],
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Resume failed: {str(e)[:200]}")
    await db.voice_connections.update_one(
        {"vendor_id": user["vendor_id"]},
        {"$set": {"status": "active", "minutes_used": 0.0, "cost_accumulated": 0.0,
                  "resumed_at": now_iso()}},
    )
    return {"status": "active"}


@api_router.post("/voice/test-call")
async def voice_test_call(req: TestCallReq, user: dict = Depends(require_vendor)):
    vc = await db.voice_connections.find_one({"vendor_id": user["vendor_id"]}, {"_id": 0})
    if not vc or vc.get("status") != "active":
        raise HTTPException(status_code=400, detail="Voice not activated")
    to = req.to_number.strip()
    if not to.startswith("+"):
        raise HTTPException(status_code=400, detail="Use E.164 format, e.g. +15551234567")
    try:
        call = get_retell().call.create_phone_call(
            from_number=vc["phone_number"],
            to_number=to,
            override_agent_id=vc["retell_agent_id"],
            metadata={"vendor_id": user["vendor_id"], "test": "true"},
        )
        return {"call_id": call.call_id, "status": getattr(call, "call_status", "initiated")}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Call failed: {str(e)[:220]}")


from fastapi import Request as _FastRequest

@api_router.post("/webhooks/retell")
async def retell_webhook(request: _FastRequest):
    raw = await request.body()
    try:
        sig = request.headers.get("x-retell-signature", "")
        if sig and RETELL_API_KEY:
            try:
                get_retell().verify(raw, RETELL_API_KEY, sig)
            except Exception:
                logger.warning("Retell signature invalid (continuing)")
        payload = json.loads(raw.decode("utf-8"))
    except Exception as e:
        logger.exception("webhook parse failed: %s", e)
        return {"ok": True}

    event = payload.get("event")
    call = payload.get("call", {}) or {}
    agent_id = call.get("agent_id")
    if not agent_id:
        return {"ok": True}
    vc = await db.voice_connections.find_one({"retell_agent_id": agent_id}, {"_id": 0})
    if not vc:
        logger.warning("Retell webhook for unknown agent %s", agent_id)
        return {"ok": True}
    vendor_id = vc["vendor_id"]

    if event in ("call_ended", "call_analyzed"):
        call_id = call.get("call_id")
        start = call.get("start_timestamp") or 0
        end = call.get("end_timestamp") or 0
        duration_s = max(0, int((end - start) / 1000)) if end and start else 0
        transcript = call.get("transcript") or ""
        transcript_obj = call.get("transcript_object") or []
        recording = call.get("recording_url")
        analysis = call.get("call_analysis") or {}
        from_num = call.get("from_number", "")
        to_num = call.get("to_number", "")
        cost = round(duration_s / 60 * 0.13, 4)
        exempt = await _is_exempt_vendor(vendor_id)
        meter_cost = 0.0 if exempt else cost

        conv = await db.conversations.find_one(
            {"vendor_id": vendor_id, "call_id": call_id}, {"_id": 0}
        )
        if not conv:
            conv = {
                "id": new_id(),
                "vendor_id": vendor_id,
                "channel": "voice",
                "customer_name": from_num or "Caller",
                "customer_contact": from_num,
                "status": "resolved" if event == "call_ended" else "open",
                "call_id": call_id,
                "last_message_preview": (transcript[:120] if transcript else "Voice call"),
                "created_at": now_iso(),
                "updated_at": now_iso(),
            }
            await db.conversations.insert_one(conv)

        if event == "call_ended" and transcript_obj:
            await db.messages.delete_many({"conversation_id": conv["id"]})
            for turn in transcript_obj:
                role_in = (turn.get("role") or "").lower()
                role = "bot" if role_in in ("agent", "assistant") else "user"
                await db.messages.insert_one({
                    "id": new_id(),
                    "conversation_id": conv["id"],
                    "vendor_id": vendor_id,
                    "role": role,
                    "content": turn.get("content", ""),
                    "created_at": now_iso(),
                })

        await db.call_records.update_one(
            {"vendor_id": vendor_id, "call_id": call_id},
            {"$set": {
                "id": new_id(),
                "vendor_id": vendor_id,
                "call_id": call_id,
                "retell_agent_id": agent_id,
                "conversation_id": conv["id"],
                "direction": call.get("direction", "inbound"),
                "from_number": from_num,
                "to_number": to_num,
                "duration_seconds": duration_s,
                "disconnection_reason": call.get("disconnection_reason"),
                "recording_url": recording,
                "transcript": transcript,
                "analysis": analysis,
                "pricing": {"total_cost": cost},
                "created_at": now_iso(),
            }}, upsert=True,
        )
        await db.voice_connections.update_one(
            {"vendor_id": vendor_id},
            {"$inc": {"minutes_used": duration_s / 60, "cost_accumulated": meter_cost}},
        )
        # Pause the agent if the vendor has now exhausted their plan minutes
        await _enforce_voice_quota(vendor_id)
        if event == "call_ended" and transcript:
            try:
                bot_text = "\n".join(
                    t.get("content", "") for t in transcript_obj
                    if (t.get("role") or "").lower() in ("agent", "assistant")
                )[-1500:]
                await _maybe_book_appointment(vendor_id, conv["id"], bot_text)
            except Exception as e:
                logger.warning("voice auto-book failed: %s", e)

    return {"ok": True}


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
