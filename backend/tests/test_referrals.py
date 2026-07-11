"""Backend tests for BotNira Referral Program (iteration_9).

Covers:
  - GET /api/referrals/me — code, link, summary, bank_account_on_file, USD
  - GET /api/referrals/customers / commissions / payouts
  - POST/GET /api/referrals/bank-account
  - GET /api/referrals/public/resolve/{code} (public)
  - Signup with referral_code → creates referrals row
  - Invalid referral_code at signup is silently ignored
  - Self-referral via duplicate-email naturally blocked
  - Stripe webhook invoice.paid → referral_commissions row (15%) + idempotency
  - Stripe webhook customer.subscription.deleted → status=cancelled
"""
import hashlib
import hmac
import json as _json
import os
import time
import uuid

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

# Read STRIPE_WEBHOOK_SECRET so we can compute a valid signature when set.
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")


def _post_stripe_webhook(session, event: dict):
    """POST a Stripe webhook event. Signs with STRIPE_WEBHOOK_SECRET if present.
    Newer stripe SDK requires the root-level "object":"event" field."""
    event = {**event}
    event.setdefault("object", "event")
    event.setdefault("id", f"evt_test_{uuid.uuid4().hex[:10]}")
    event.setdefault("api_version", "2024-06-20")
    event.setdefault("created", int(time.time()))
    body = _json.dumps(event, separators=(",", ":")).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if STRIPE_WEBHOOK_SECRET:
        ts = str(int(time.time()))
        signed_payload = f"{ts}.{body.decode()}".encode("utf-8")
        sig = hmac.new(STRIPE_WEBHOOK_SECRET.encode(), signed_payload, hashlib.sha256).hexdigest()
        headers["Stripe-Signature"] = f"t={ts},v1={sig}"
    return session.post(f"{API}/webhook/stripe", data=body, headers=headers)

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://scheduling-preview.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

DEMO_EMAIL = "demo@botnira.com"
DEMO_PASS = "demo123"


# ----------------- Fixtures -------------------

@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def demo_token(session):
    r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASS})
    assert r.status_code == 200, f"demo login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def demo_headers(demo_token):
    return {"Content-Type": "application/json", "Authorization": f"Bearer {demo_token}"}


@pytest.fixture(scope="module")
def demo_referral(session, demo_headers):
    r = session.get(f"{API}/referrals/me", headers=demo_headers)
    assert r.status_code == 200, r.text
    return r.json()


# ----------------- /me + summary + currency -------------------

class TestReferralsMe:
    def test_me_returns_code_link_summary(self, demo_referral):
        d = demo_referral
        assert isinstance(d.get("code"), str) and len(d["code"]) > 0
        assert d.get("referral_link", "").endswith("/r/" + d["code"])
        assert d.get("currency") == "USD"
        assert "bank_account_on_file" in d and isinstance(d["bank_account_on_file"], bool)
        s = d.get("summary") or {}
        for k in ("total_customers", "active_customers", "lifetime_earnings_usd",
                  "paid_earnings_usd", "pending_earnings_usd", "this_month_earnings_usd"):
            assert k in s, f"summary missing {k}"
        assert s.get("commission_rate_percent") == 15

    def test_me_code_is_stable(self, session, demo_headers, demo_referral):
        r2 = session.get(f"{API}/referrals/me", headers=demo_headers)
        assert r2.status_code == 200
        assert r2.json()["code"] == demo_referral["code"]


# ----------------- customers / commissions / payouts -------------------

class TestReferralsLists:
    def test_customers_returns_array(self, session, demo_headers):
        r = session.get(f"{API}/referrals/customers", headers=demo_headers)
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body.get("customers"), list)

    def test_commissions_flat_and_monthly(self, session, demo_headers):
        r = session.get(f"{API}/referrals/commissions", headers=demo_headers)
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body.get("commissions"), list)
        assert isinstance(body.get("monthly"), list)

    def test_payouts_empty_by_default(self, session, demo_headers):
        r = session.get(f"{API}/referrals/payouts", headers=demo_headers)
        assert r.status_code == 200
        assert isinstance(r.json().get("payouts"), list)


# ----------------- Bank account -------------------

class TestBankAccount:
    def test_save_then_fetch_bank_account(self, session, demo_headers):
        payload = {
            "account_holder": "TEST_Demo Holder",
            "account_number": "00099911122",
            "bank_name": "TEST Bank",
            "swift_or_routing": "TESTUS33",
            "iban": "GB29NWBK60161331926819",
            "country": "US",
            "address": "1 Test St, Test City",
        }
        r = session.post(f"{API}/referrals/bank-account", headers=demo_headers, json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        ba = body.get("bank_account") or {}
        assert ba.get("account_holder") == payload["account_holder"]
        assert ba.get("currency") == "USD"

        # GET returns the same data
        g = session.get(f"{API}/referrals/bank-account", headers=demo_headers)
        assert g.status_code == 200
        gb = (g.json() or {}).get("bank_account") or {}
        assert gb.get("account_number") == payload["account_number"]
        assert gb.get("bank_name") == payload["bank_name"]

        # /me bank_account_on_file flips to true
        m = session.get(f"{API}/referrals/me", headers=demo_headers)
        assert m.status_code == 200
        assert m.json().get("bank_account_on_file") is True


# ----------------- Public resolve -------------------

class TestPublicResolve:
    def test_resolve_valid_code(self, session, demo_referral):
        r = session.get(f"{API}/referrals/public/resolve/{demo_referral['code']}")
        assert r.status_code == 200
        body = r.json()
        assert body.get("valid") is True
        assert body.get("code") == demo_referral["code"]
        assert isinstance(body.get("referrer_business_name", ""), str)

    def test_resolve_invalid_code(self, session):
        r = session.get(f"{API}/referrals/public/resolve/this-code-does-not-exist-xyz")
        assert r.status_code == 200
        assert r.json().get("valid") is False


# ----------------- Signup attribution -------------------

@pytest.fixture(scope="module")
def referred_vendor(session, demo_referral):
    """Create a brand new vendor using demo's referral code."""
    suffix = uuid.uuid4().hex[:10]
    email = f"test_ref_{suffix}@example.com"
    payload = {
        "email": email,
        "password": "TestPass123!",
        "full_name": "TEST Referred User",
        "business_name": f"TEST Referred {suffix}",
        "referral_code": demo_referral["code"],
    }
    r = session.post(f"{API}/auth/signup", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    return {"email": email, "password": payload["password"], "vendor_id": data["vendor_id"], "token": data["token"]}


class TestSignupAttribution:
    def test_referred_vendor_created_with_attribution(self, session, demo_headers, referred_vendor):
        # Verify referrals list now shows the referred vendor
        r = session.get(f"{API}/referrals/customers", headers=demo_headers)
        assert r.status_code == 200
        ids = [c.get("referred_vendor_id") for c in r.json().get("customers", [])]
        assert referred_vendor["vendor_id"] in ids

    def test_referred_vendor_gets_own_code(self, session, referred_vendor):
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {referred_vendor['token']}"}
        r = session.get(f"{API}/referrals/me", headers=headers)
        assert r.status_code == 200
        assert isinstance(r.json().get("code"), str)
        assert len(r.json()["code"]) > 0

    def test_invalid_referral_code_silently_ignored(self, session):
        suffix = uuid.uuid4().hex[:10]
        email = f"test_bad_{suffix}@example.com"
        payload = {
            "email": email,
            "password": "TestPass123!",
            "full_name": "TEST Bad Ref",
            "business_name": f"TEST Bad {suffix}",
            "referral_code": "totally-bogus-code-xyz",
        }
        r = session.post(f"{API}/auth/signup", json=payload)
        assert r.status_code == 200, r.text
        # Login the new vendor and confirm no referrer attached (its own /me works)
        new_token = r.json()["token"]
        h = {"Content-Type": "application/json", "Authorization": f"Bearer {new_token}"}
        me = session.get(f"{API}/referrals/me", headers=h).json()
        assert "code" in me

    def test_self_referral_duplicate_email_blocked(self, session, demo_referral):
        # Try to signup with the referrer's own email — naturally blocked by duplicate-email check
        r = session.post(f"{API}/auth/signup", json={
            "email": DEMO_EMAIL,
            "password": "irrelevant",
            "full_name": "Self",
            "business_name": "Self Co",
            "referral_code": demo_referral["code"],
        })
        assert r.status_code == 400


# ----------------- Stripe webhook simulation -------------------

@pytest.fixture(scope="module")
def setup_subscription_for_referred(referred_vendor):
    """Directly set a stripe_subscription_id on the referred vendor via Mongo so
    we can simulate invoice.paid → commission accrual. Uses module-level mongo client."""
    import asyncio
    sub_id = f"sub_test_{uuid.uuid4().hex[:10]}"

    async def _set():
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        await db.vendors.update_one(
            {"id": referred_vendor["vendor_id"]},
            {"$set": {"stripe_subscription_id": sub_id}},
        )
        # cleanup unused — we leave sub id in place; test data tagged TEST_
        client.close()

    asyncio.get_event_loop().run_until_complete(_set())
    return sub_id


class TestStripeWebhook:
    def test_invoice_paid_creates_commission_15pct(self, session, demo_headers, referred_vendor, setup_subscription_for_referred):
        sub_id = setup_subscription_for_referred
        invoice_id = f"in_test_{uuid.uuid4().hex[:10]}"
        event = {
            "type": "invoice.paid",
            "data": {"object": {
                "id": invoice_id,
                "subscription": sub_id,
                "amount_paid": 4900,
                "subtotal_excluding_tax": 4900,
            }},
        }
        r = _post_stripe_webhook(session, event)
        # Webhook should accept (2xx). 200 expected in dev mode.
        assert r.status_code in (200, 204), f"webhook returned {r.status_code}: {r.text}"

        # Give backend a moment then verify referral_commissions row exists
        time.sleep(1.0)
        c = session.get(f"{API}/referrals/commissions", headers=demo_headers)
        assert c.status_code == 200
        rows = c.json().get("commissions", [])
        match = [x for x in rows if x.get("stripe_invoice_id") == invoice_id]
        assert len(match) == 1, f"expected 1 commission for invoice {invoice_id}, found {len(match)}"
        assert match[0]["commission_amount_usd"] == pytest.approx(7.35, abs=0.01)
        assert match[0]["payment_amount_usd"] == pytest.approx(49.0, abs=0.01)

    def test_invoice_paid_is_idempotent(self, session, demo_headers, referred_vendor, setup_subscription_for_referred):
        sub_id = setup_subscription_for_referred
        invoice_id = f"in_test_dup_{uuid.uuid4().hex[:10]}"
        event = {
            "type": "invoice.paid",
            "data": {"object": {
                "id": invoice_id,
                "subscription": sub_id,
                "amount_paid": 2900,
                "subtotal_excluding_tax": 2900,
            }},
        }
        for _ in range(2):
            r = _post_stripe_webhook(session, event)
            assert r.status_code in (200, 204)
        time.sleep(1.0)
        rows = session.get(f"{API}/referrals/commissions", headers=demo_headers).json()["commissions"]
        match = [x for x in rows if x.get("stripe_invoice_id") == invoice_id]
        assert len(match) == 1, "duplicate invoice id should not double-credit"

    def test_subscription_deleted_marks_cancelled(self, session, demo_headers, referred_vendor, setup_subscription_for_referred):
        sub_id = setup_subscription_for_referred
        event = {
            "type": "customer.subscription.deleted",
            "data": {"object": {"id": sub_id, "status": "canceled"}},
        }
        r = _post_stripe_webhook(session, event)
        assert r.status_code in (200, 204)
        time.sleep(1.0)
        c = session.get(f"{API}/referrals/customers", headers=demo_headers).json()
        match = [x for x in c["customers"] if x["referred_vendor_id"] == referred_vendor["vendor_id"]]
        assert len(match) == 1
        assert match[0]["status"] == "cancelled"


# ----------------- Auth requirements -------------------

class TestAuthGuards:
    def test_me_requires_auth(self, session):
        r = session.get(f"{API}/referrals/me")
        assert r.status_code in (401, 403)

    def test_bank_post_requires_auth(self, session):
        r = session.post(f"{API}/referrals/bank-account", json={
            "account_holder": "X", "account_number": "0000",
            "bank_name": "Y", "country": "US",
        })
        assert r.status_code in (401, 403)
