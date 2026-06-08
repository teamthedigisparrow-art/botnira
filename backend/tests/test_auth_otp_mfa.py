"""
BotNira Phase 2 — Auth/OTP/MFA + Password reset + Regression (billing/trial).

Strategy: OTPs are emailed via Gmail SMTP. We directly inject known OTP codes
(bcrypt-hashed) into Mongo `db.otp_codes` to verify flows, as instructed.
"""
import os
import uuid
import time
import pytest
import requests
import bcrypt
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("admin@botnira.com", "admin123")
DEMO = ("demo@botnira.com", "demo123")
KAMAL = ("kamal@thedigisparrow.com", "Kamala98@hmu")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

FIXED_CODE = "123456"


@pytest.fixture(scope="session")
def mongo():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture(scope="session")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(http, email, password):
    return http.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)


def h(token):
    return {"Authorization": f"Bearer {token}"}


def inject_otp(mongo, email: str, purpose: str, code: str = FIXED_CODE, minutes: int = 10, attempts: int = 0):
    """Overwrite/insert an OTP record directly into Mongo."""
    email = email.lower()
    mongo.otp_codes.delete_many({"email": email, "purpose": purpose})
    code_hash = bcrypt.hashpw(code.encode(), bcrypt.gensalt()).decode()
    mongo.otp_codes.insert_one({
        "id": str(uuid.uuid4()),
        "email": email,
        "purpose": purpose,
        "code_hash": code_hash,
        "attempts": attempts,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat(),
    })


# ============ SIGNUP + VERIFY EMAIL ==========================================
class TestSignupVerify:
    @pytest.fixture(scope="class")
    def new_signup(self, http, mongo):
        suffix = uuid.uuid4().hex[:8]
        email = f"TEST_otp_{suffix}@botnira.com"
        r = http.post(f"{API}/auth/signup", json={
            "email": email,
            "password": "testpass123",
            "full_name": "TEST OTP",
            "business_name": f"TEST Biz {suffix}",
        }, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("token")
        assert d.get("role") == "vendor"
        assert d.get("vendor_id")
        assert d.get("email_verified") is False, f"email_verified should be False: {d}"
        return {"email": email, **d}

    def test_signup_stored_otp(self, mongo, new_signup):
        rec = mongo.otp_codes.find_one({"email": new_signup["email"].lower(), "purpose": "signup"})
        assert rec is not None, "OTP record for signup not created"
        assert rec.get("attempts", 0) == 0
        assert rec.get("code_hash")

    def test_verify_email_wrong_code_increments_attempts(self, http, mongo, new_signup):
        email = new_signup["email"]
        # inject fresh OTP so state is deterministic
        inject_otp(mongo, email, "signup", FIXED_CODE, attempts=0)
        r = http.post(f"{API}/auth/verify-email", json={"email": email, "code": "000000"}, timeout=15)
        assert r.status_code == 400
        rec = mongo.otp_codes.find_one({"email": email.lower(), "purpose": "signup"})
        assert rec is not None and rec.get("attempts", 0) == 1, f"attempts not incremented: {rec}"

    def test_verify_email_correct_code(self, http, mongo, new_signup):
        email = new_signup["email"]
        inject_otp(mongo, email, "signup", FIXED_CODE)
        r = http.post(f"{API}/auth/verify-email", json={"email": email, "code": FIXED_CODE}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        # user.email_verified flipped
        u = mongo.users.find_one({"email": email.lower()})
        assert u and u.get("email_verified") is True
        # OTP record removed
        rec = mongo.otp_codes.find_one({"email": email.lower(), "purpose": "signup"})
        assert rec is None, "OTP record not deleted on success"

    def test_resend_signup_otp_creates_new(self, http, mongo, new_signup):
        email = new_signup["email"]
        mongo.otp_codes.delete_many({"email": email.lower(), "purpose": "signup"})
        r = http.post(f"{API}/auth/resend-otp", json={"email": email, "purpose": "signup"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        rec = mongo.otp_codes.find_one({"email": email.lower(), "purpose": "signup"})
        assert rec is not None, "new signup OTP not created on resend"

    def test_resend_password_reset_unknown_email_no_leak(self, http, mongo):
        fake = f"TEST_nosuch_{uuid.uuid4().hex[:8]}@botnira.com"
        r = http.post(f"{API}/auth/resend-otp", json={"email": fake, "purpose": "password_reset"}, timeout=30)
        assert r.status_code == 200
        assert r.json().get("ok") is True
        assert mongo.otp_codes.find_one({"email": fake.lower()}) is None


# ============ PASSWORD RESET =================================================
class TestPasswordReset:
    @pytest.fixture(scope="class")
    def reset_user(self, http, mongo):
        suffix = uuid.uuid4().hex[:8]
        email = f"TEST_reset_{suffix}@botnira.com"
        r = http.post(f"{API}/auth/signup", json={
            "email": email,
            "password": "origpass123",
            "full_name": "TEST Reset",
            "business_name": f"TEST ResetBiz {suffix}",
        }, timeout=30)
        assert r.status_code == 200
        # clean signup otp
        mongo.otp_codes.delete_many({"email": email.lower()})
        return email

    def test_request_reset_creates_otp(self, http, mongo, reset_user):
        r = http.post(f"{API}/auth/password/reset/request", json={"email": reset_user}, timeout=30)
        assert r.status_code == 200 and r.json().get("ok") is True
        rec = mongo.otp_codes.find_one({"email": reset_user.lower(), "purpose": "password_reset"})
        assert rec is not None

    def test_request_reset_unknown_email_no_leak(self, http, mongo):
        fake = f"TEST_missing_{uuid.uuid4().hex[:8]}@botnira.com"
        r = http.post(f"{API}/auth/password/reset/request", json={"email": fake}, timeout=30)
        assert r.status_code == 200 and r.json().get("ok") is True
        assert mongo.otp_codes.find_one({"email": fake.lower(), "purpose": "password_reset"}) is None

    def test_reset_confirm_wrong_code(self, http, mongo, reset_user):
        inject_otp(mongo, reset_user, "password_reset", FIXED_CODE)
        r = http.post(f"{API}/auth/password/reset/confirm", json={
            "email": reset_user, "code": "000000", "new_password": "newpass456"
        }, timeout=15)
        assert r.status_code == 400

    def test_reset_confirm_correct_code_and_login(self, http, mongo, reset_user):
        inject_otp(mongo, reset_user, "password_reset", FIXED_CODE)
        r = http.post(f"{API}/auth/password/reset/confirm", json={
            "email": reset_user, "code": FIXED_CODE, "new_password": "newpass456"
        }, timeout=15)
        assert r.status_code == 200, r.text
        # new password works
        ok = _login(http, reset_user, "newpass456")
        assert ok.status_code == 200
        # old password rejected
        bad = _login(http, reset_user, "origpass123")
        assert bad.status_code == 401


# ============ LOGIN (no MFA) + /me ==========================================
class TestLoginBasic:
    def test_kamal_login(self, http):
        r = _login(http, *KAMAL)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["role"] == "vendor" and d.get("token")

    def test_demo_login(self, http):
        r = _login(http, *DEMO)
        assert r.status_code == 200
        assert r.json()["role"] == "vendor"

    def test_invalid_credentials(self, http):
        r = _login(http, KAMAL[0], "wrong-password")
        assert r.status_code == 401

    def test_me_has_email_verified(self, http):
        r = _login(http, *KAMAL)
        token = r.json()["token"]
        me = http.get(f"{API}/auth/me", headers=h(token), timeout=15)
        assert me.status_code == 200
        user = me.json()["user"]
        assert "email_verified" in user, f"email_verified missing in /me: {user}"


# ============ MFA TOGGLE + LOGIN FLOW =======================================
class TestMFA:
    @pytest.fixture(scope="class")
    def kamal_token(self, http):
        r = _login(http, *KAMAL)
        assert r.status_code == 200
        return r.json()["token"]

    def test_mfa_status_default(self, http, kamal_token, mongo):
        # ensure MFA is off first
        r = http.put(f"{API}/auth/mfa", json={"enabled": False, "password": KAMAL[1]},
                     headers=h(kamal_token), timeout=15)
        assert r.status_code == 200
        r2 = http.get(f"{API}/auth/mfa-status", headers=h(kamal_token), timeout=15)
        assert r2.status_code == 200
        assert r2.json() == {"mfa_enabled": False}

    def test_mfa_enable_wrong_password(self, http, kamal_token, mongo):
        r = http.put(f"{API}/auth/mfa", json={"enabled": True, "password": "wrong-pw"},
                     headers=h(kamal_token), timeout=15)
        assert r.status_code == 401
        _ = mongo.vendors.find_one({"id": None} if False else {"email": KAMAL[0].lower()}) or \
            mongo.vendors.find_one({"owner_email": KAMAL[0].lower()})
        # Verify via mfa-status that it's still disabled
        r2 = http.get(f"{API}/auth/mfa-status", headers=h(kamal_token), timeout=15)
        assert r2.json().get("mfa_enabled") is False

    def test_mfa_enable_correct_password(self, http, kamal_token):
        r = http.put(f"{API}/auth/mfa", json={"enabled": True, "password": KAMAL[1]},
                     headers=h(kamal_token), timeout=15)
        assert r.status_code == 200
        assert r.json().get("mfa_enabled") is True
        r2 = http.get(f"{API}/auth/mfa-status", headers=h(kamal_token), timeout=15)
        assert r2.json().get("mfa_enabled") is True

    def test_login_returns_mfa_challenge(self, http, mongo):
        r = _login(http, *KAMAL)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("mfa_required") is True, f"Expected mfa_required True, got {d}"
        assert d.get("mfa_session")
        assert d.get("email") == KAMAL[0]
        assert "token" not in d or not d.get("token")
        # mfa_session exists in mongo
        sess = mongo.mfa_sessions.find_one({"id": d["mfa_session"]})
        assert sess is not None
        # OTP exists with purpose=login
        otp = mongo.otp_codes.find_one({"email": KAMAL[0].lower(), "purpose": "login"})
        assert otp is not None

    def test_mfa_verify_wrong_code(self, http, mongo):
        r = _login(http, *KAMAL)
        d = r.json()
        assert d.get("mfa_required")
        inject_otp(mongo, KAMAL[0], "login", FIXED_CODE)
        r2 = http.post(f"{API}/auth/login/mfa-verify", json={
            "email": KAMAL[0], "code": "000000", "mfa_session": d["mfa_session"]
        }, timeout=15)
        assert r2.status_code == 400

    def test_mfa_verify_fake_session(self, http, mongo):
        inject_otp(mongo, KAMAL[0], "login", FIXED_CODE)
        r = http.post(f"{API}/auth/login/mfa-verify", json={
            "email": KAMAL[0], "code": FIXED_CODE, "mfa_session": "not-a-real-session-uuid"
        }, timeout=15)
        assert r.status_code == 400

    def test_mfa_verify_correct_code(self, http, mongo):
        r = _login(http, *KAMAL)
        d = r.json()
        assert d.get("mfa_required")
        inject_otp(mongo, KAMAL[0], "login", FIXED_CODE)
        r2 = http.post(f"{API}/auth/login/mfa-verify", json={
            "email": KAMAL[0], "code": FIXED_CODE, "mfa_session": d["mfa_session"]
        }, timeout=15)
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert data.get("token") and data.get("role") == "vendor"
        # mfa_session consumed
        assert mongo.mfa_sessions.find_one({"id": d["mfa_session"]}) is None

    def test_mfa_disable_and_login_direct(self, http, mongo):
        # login via MFA flow to get a valid token
        r = _login(http, *KAMAL)
        d = r.json()
        assert d.get("mfa_required")
        inject_otp(mongo, KAMAL[0], "login", FIXED_CODE)
        r2 = http.post(f"{API}/auth/login/mfa-verify", json={
            "email": KAMAL[0], "code": FIXED_CODE, "mfa_session": d["mfa_session"]
        }, timeout=15)
        token = r2.json()["token"]
        # disable MFA
        r3 = http.put(f"{API}/auth/mfa", json={"enabled": False, "password": KAMAL[1]},
                      headers=h(token), timeout=15)
        assert r3.status_code == 200
        assert r3.json().get("mfa_enabled") is False
        # next login should NOT require MFA
        r4 = _login(http, *KAMAL)
        assert r4.status_code == 200
        d4 = r4.json()
        assert d4.get("token"), f"Expected direct token after MFA disable: {d4}"
        assert not d4.get("mfa_required")


# ============ REGRESSION — Billing + Trial ===================================
class TestBillingRegression:
    def test_billing_plans(self, http):
        r = http.get(f"{API}/billing/plans", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) >= 1

    def test_billing_me_demo(self, http):
        token = _login(http, *DEMO).json()["token"]
        r = http.get(f"{API}/billing/me", headers=h(token), timeout=15)
        assert r.status_code == 200

    def test_admin_billing(self, http):
        token = _login(http, *ADMIN).json()["token"]
        r = http.get(f"{API}/admin/billing", headers=h(token), timeout=15)
        assert r.status_code == 200

    def test_billing_checkout_subscription(self, http):
        token = _login(http, *DEMO).json()["token"]
        # Need plan_id — pick first
        plans = http.get(f"{API}/billing/plans", timeout=15).json()
        plan_id = plans[0].get("id") or plans[0].get("plan_id") or plans[0].get("stripe_price_id")
        if not plan_id:
            pytest.skip(f"could not extract plan id from: {plans[0]}")
        r = http.post(f"{API}/billing/checkout/subscription",
                      json={"plan_id": plan_id},
                      headers=h(token), timeout=30)
        assert r.status_code in (200, 201), r.text
        body = r.json()
        assert body.get("url") or body.get("checkout_url"), f"no checkout url: {body}"

    def test_trial_email_blocked(self, http):
        token = _login(http, *DEMO).json()["token"]
        r = http.post(f"{API}/simulate/email",
                      json={"customer_name": "TEST", "message": "hi"},
                      headers=h(token), timeout=60)
        # Demo is on trial — email locked → 402
        assert r.status_code == 402, f"expected 402, got {r.status_code} body={r.text}"

    def test_trial_whatsapp_ok(self, http):
        token = _login(http, *DEMO).json()["token"]
        r = http.post(f"{API}/simulate/whatsapp",
                      json={"customer_name": "TEST", "message": "hi"},
                      headers=h(token), timeout=90)
        assert r.status_code == 200, r.text

    def test_kamal_exempt_email_ok(self, http):
        token = _login(http, *KAMAL).json().get("token")
        if not token:
            pytest.skip("Kamal MFA unexpectedly enabled")
        r = http.post(f"{API}/simulate/email",
                      json={"customer_name": "TEST", "message": "hi"},
                      headers=h(token), timeout=90)
        assert r.status_code == 200, r.text
