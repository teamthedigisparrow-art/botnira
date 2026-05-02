"""BotNira Stripe billing Phase 1 tests.

Covers:
- Public /billing/plans returns 3 plans + 6 topups with stripe_price_id populated
- /billing/me for trial vendor (demo), exempt vendor (kamal)
- Checkout subscription + topup flows (returns Stripe URL, creates payment_transactions)
- Invalid plan and exempt vendor checkout → 400
- Trial enforcement on simulate channels (email/voice/sms → 402, whatsapp → 200)
- Balance decrement on /chat/message for demo vendor; hard-stop at 0
- Exempt bypass: kamal can use all channels, balance never decrements
- Admin billing summary + detail + RBAC
- /auth/me exposes 'access' block
- /auth/signup seeds trial defaults
- Webhook accepts unsigned JSON in dev mode
"""
import os
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://unified-inbox-ai-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("admin@botnira.com", "admin123")
DEMO = ("demo@botnira.com", "demo123")
KAMAL = ("kamal@thedigisparrow.com", "kamal123")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


def h(t): return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="session")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def mongo():
    c = MongoClient(MONGO_URL)
    return c[DB_NAME]


def _login(http, email, pw):
    r = http.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def admin_token(http):
    return _login(http, *ADMIN)["token"]


@pytest.fixture(scope="session")
def demo_auth(http, mongo):
    # Reset demo to a clean trial state with 100 messages so tests are deterministic
    d = _login(http, *DEMO)
    vid = d["vendor_id"]
    mongo.vendors.update_one(
        {"id": vid},
        {"$set": {
            "messages_balance": 100,
            "minutes_balance": 0,
            "is_exempt": False,
            "plan": "trial",
            "subscription_status": "trialing",
        }},
    )
    return {"token": d["token"], "vendor_id": vid}


@pytest.fixture(scope="session")
def kamal_auth(http):
    d = _login(http, *KAMAL)
    return {"token": d["token"], "vendor_id": d["vendor_id"]}


# ---------------- Plans (public) ----------------
class TestPlans:
    def test_plans_public(self, http):
        r = http.get(f"{API}/billing/plans", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert len(d["plans"]) == 3
        assert len(d["topups"]) == 6
        ids = sorted([p["id"] for p in d["plans"]])
        assert ids == ["growth", "pro", "starter"]
        prices = {p["id"]: p["price_usd"] for p in d["plans"]}
        assert prices["starter"] == 49
        assert prices["growth"] == 149
        assert prices["pro"] == 399
        for p in d["plans"]:
            assert p.get("stripe_price_id"), f"plan {p['id']} missing stripe_price_id"
        topup_ids = sorted([t["id"] for t in d["topups"]])
        assert topup_ids == sorted(["spark", "boost", "rocket", "jet", "fleet", "armada"])
        for t in d["topups"]:
            assert t.get("stripe_price_id"), f"topup {t['id']} missing stripe_price_id"


# ---------------- /billing/me ----------------
class TestBillingMe:
    def test_me_trial_demo(self, http, demo_auth):
        r = http.get(f"{API}/billing/me", headers=h(demo_auth["token"]), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["plan"] in ("trial",)
        assert d["subscription_status"] == "trialing"
        a = d.get("access", d)
        assert a.get("trial_days_left", 0) >= 0
        assert set(a["allowed_channels"]) == {"web", "whatsapp"}
        assert int(d["messages_balance"]) == 100
        assert bool(d["is_exempt"]) is False

    def test_me_exempt_kamal(self, http, kamal_auth):
        r = http.get(f"{API}/billing/me", headers=h(kamal_auth["token"]), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["is_exempt"] is True
        a = d.get("access", d)
        assert set(a["allowed_channels"]) == {"web", "whatsapp", "email", "sms", "voice"}
        assert int(d["messages_balance"]) >= 999999


# ---------------- Checkout ----------------
class TestCheckout:
    def test_checkout_subscription_starter(self, http, demo_auth, mongo):
        origin = "https://unified-inbox-ai-4.preview.emergentagent.com"
        r = http.post(f"{API}/billing/checkout/subscription",
                      json={"plan": "starter", "origin_url": origin},
                      headers=h(demo_auth["token"]), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "url" in d and "checkout.stripe.com" in d["url"]
        sid = d.get("session_id")
        assert sid
        # payment_transactions record should exist
        tx = mongo.payment_transactions.find_one({"session_id": sid})
        assert tx is not None, "payment_transactions record not created"
        assert tx.get("status") == "initiated"

    def test_checkout_topup_spark(self, http, demo_auth):
        r = http.post(f"{API}/billing/checkout/topup",
                      json={"pack": "spark", "origin_url": "https://unified-inbox-ai-4.preview.emergentagent.com"},
                      headers=h(demo_auth["token"]), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "checkout.stripe.com" in d["url"]

    def test_checkout_invalid_plan(self, http, demo_auth):
        r = http.post(f"{API}/billing/checkout/subscription",
                      json={"plan": "ultra_mega", "origin_url": "https://x.com"},
                      headers=h(demo_auth["token"]), timeout=20)
        assert r.status_code == 400

    def test_checkout_exempt_rejected(self, http, kamal_auth):
        r = http.post(f"{API}/billing/checkout/subscription",
                      json={"plan": "starter", "origin_url": "https://x.com"},
                      headers=h(kamal_auth["token"]), timeout=20)
        assert r.status_code == 400


# ---------------- Trial channel enforcement ----------------
class TestTrialEnforcement:
    def test_whatsapp_allowed(self, http, demo_auth):
        r = http.post(f"{API}/simulate/whatsapp",
                      json={"customer_name": "TEST", "message": "hi"},
                      headers=h(demo_auth["token"]), timeout=60)
        assert r.status_code == 200, r.text

    @pytest.mark.parametrize("ch", ["email", "sms", "voice"])
    def test_locked_channels_402(self, http, demo_auth, ch):
        r = http.post(f"{API}/simulate/{ch}",
                      json={"customer_name": "TEST", "message": "hi"},
                      headers=h(demo_auth["token"]), timeout=30)
        assert r.status_code == 402, f"{ch} expected 402 got {r.status_code} {r.text}"


# ---------------- Balance decrement + hard-stop ----------------
class TestBalance:
    def test_chat_decrements(self, http, demo_auth, mongo):
        vid = demo_auth["vendor_id"]
        # reset balance to 3 so we can test decrement + hard-stop quickly
        mongo.vendors.update_one({"id": vid}, {"$set": {"messages_balance": 3}})
        before = mongo.vendors.find_one({"id": vid}, {"_id": 0, "messages_balance": 1})["messages_balance"]
        r = http.post(f"{API}/chat/message",
                      json={"vendor_id": vid, "message": "hello", "channel": "web"}, timeout=90)
        assert r.status_code == 200, r.text
        after = mongo.vendors.find_one({"id": vid}, {"_id": 0, "messages_balance": 1})["messages_balance"]
        assert after == before - 1, f"expected decrement: before={before} after={after}"

    def test_hard_stop_at_zero(self, http, demo_auth, mongo):
        vid = demo_auth["vendor_id"]
        mongo.vendors.update_one({"id": vid}, {"$set": {"messages_balance": 0}})
        r = http.post(f"{API}/chat/message",
                      json={"vendor_id": vid, "message": "should be blocked", "channel": "web"}, timeout=30)
        assert r.status_code == 402, f"expected 402 at zero balance, got {r.status_code} {r.text}"
        # restore
        mongo.vendors.update_one({"id": vid}, {"$set": {"messages_balance": 100}})


# ---------------- Exempt bypass ----------------
class TestExempt:
    def test_kamal_email_allowed(self, http, kamal_auth):
        r = http.post(f"{API}/simulate/email",
                      json={"customer_name": "TEST", "message": "hi"},
                      headers=h(kamal_auth["token"]), timeout=60)
        assert r.status_code == 200, r.text

    def test_kamal_balance_unchanged(self, http, kamal_auth, mongo):
        vid = kamal_auth["vendor_id"]
        before = mongo.vendors.find_one({"id": vid}, {"_id": 0, "messages_balance": 1})["messages_balance"]
        r = http.post(f"{API}/chat/message",
                      json={"vendor_id": vid, "message": "no decrement", "channel": "web"}, timeout=60)
        assert r.status_code == 200, r.text
        after = mongo.vendors.find_one({"id": vid}, {"_id": 0, "messages_balance": 1})["messages_balance"]
        assert after == before, f"kamal balance decremented! before={before} after={after}"
        assert after >= 999999


# ---------------- Admin billing ----------------
class TestAdminBilling:
    def test_admin_billing_summary(self, http, admin_token):
        r = http.get(f"{API}/admin/billing", headers=h(admin_token), timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "summary" in d and "vendors" in d
        s = d["summary"]
        for k in ("mrr_usd", "arr_usd", "active_subscriptions", "trialing", "total_vendors"):
            assert k in s, f"summary missing {k}"
        assert isinstance(d["vendors"], list) and len(d["vendors"]) >= 1
        row = d["vendors"][0]
        for k in ("vendor_id", "name", "email", "plan", "subscription_status",
                  "minutes_balance", "messages_balance", "is_exempt", "total_spent_usd"):
            assert k in row, f"vendor row missing {k}"
        # stripe_customer_id key exists (may be null)
        assert "stripe_customer_id" in row

    def test_admin_billing_detail(self, http, admin_token, demo_auth):
        r = http.get(f"{API}/admin/billing/{demo_auth['vendor_id']}",
                     headers=h(admin_token), timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "vendor" in d and "transactions" in d
        assert isinstance(d["transactions"], list)

    def test_non_admin_forbidden(self, http, demo_auth):
        r = http.get(f"{API}/admin/billing", headers=h(demo_auth["token"]), timeout=15)
        assert r.status_code == 403


# ---------------- /auth/me access block ----------------
class TestAuthMeAccess:
    def test_demo_access_block(self, http, demo_auth):
        r = http.get(f"{API}/auth/me", headers=h(demo_auth["token"]), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "access" in d, "auth/me missing 'access' block"
        a = d["access"]
        for k in ("paywall", "trial", "trial_days_left", "allowed_channels", "plan_label", "is_exempt"):
            assert k in a, f"access missing {k}"
        assert a["trial"] is True
        assert a["is_exempt"] is False

    def test_kamal_access_exempt(self, http, kamal_auth):
        r = http.get(f"{API}/auth/me", headers=h(kamal_auth["token"]), timeout=15)
        assert r.status_code == 200
        a = r.json()["access"]
        assert a["is_exempt"] is True


# ---------------- Signup defaults ----------------
class TestSignupDefaults:
    def test_signup_trial_defaults(self, http, mongo):
        suffix = uuid.uuid4().hex[:8]
        email = f"TEST_bill_{suffix}@botnira.com"
        r = http.post(f"{API}/auth/signup", json={
            "email": email, "password": "testpass123",
            "full_name": "TEST Billing Sign", "business_name": f"TEST Biz {suffix}",
        }, timeout=30)
        assert r.status_code == 200, r.text
        vid = r.json()["vendor_id"]
        v = mongo.vendors.find_one({"id": vid}, {"_id": 0})
        assert v["plan"] == "trial"
        assert v["subscription_status"] == "trialing"
        assert int(v["messages_balance"]) == 100
        assert float(v.get("minutes_balance", 0)) == 0
        assert v.get("trial_ends_at") is not None


# ---------------- Webhook dev mode ----------------
class TestWebhook:
    def test_webhook_unsigned_accepts(self, http):
        # webhook secret is empty in dev mode; endpoint should accept JSON
        r = http.post(f"{API}/webhook/stripe",
                      json={"type": "ping", "data": {"object": {}}},
                      timeout=20)
        assert r.status_code == 200, f"webhook failed: {r.status_code} {r.text}"
        d = r.json()
        assert d.get("ok") is True
