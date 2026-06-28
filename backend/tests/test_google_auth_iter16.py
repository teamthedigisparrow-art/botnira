"""Iter 16 — Google OAuth backend tests for BotNira

Verifies:
 1. Password-login regression with kamal@thedigisparrow.com.
 2. Passwordless (google-only) user receives EXACT detail
    "This account uses Google sign-in. Please continue with Google."
 3. POST /api/auth/google/session with bogus session_id returns 401 (NOT 500)
    with detail "Google sign-in failed. Please try again."
"""
import os
import uuid
import datetime as dt
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if "REACT_APP_BACKEND_URL" in os.environ else "https://multi-channel-inbox-3.preview.emergentagent.com"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

GOOGLE_ONLY_DETAIL = "This account uses Google sign-in. Please continue with Google."
GOOGLE_FAIL_DETAIL = "Google sign-in failed. Please try again."


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    yield db
    client.close()


def test_password_login_regression(session):
    """Existing email/password login must still succeed."""
    r = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "kamal@thedigisparrow.com", "password": "Kamala98@hmu"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "token" in body and isinstance(body["token"], str) and len(body["token"]) > 20
    assert body.get("role") in ("vendor", "superadmin")


def test_passwordless_user_returns_google_only_message(session, mongo):
    """A user created with no password_hash must reject password login with the
    EXACT detail string the frontend keys off."""
    email = f"gtest_qa_{uuid.uuid4().hex[:8]}@example.com"
    user_doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "full_name": "QA",
        "role": "vendor",
        "vendor_id": "x",
        "auth_provider": "google",
        "email_verified": True,
        "created_at": dt.datetime.utcnow().isoformat(),
    }
    mongo.users.insert_one(user_doc)
    try:
        r = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": email, "password": "literally-anything"},
            timeout=20,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        assert r.json().get("detail") == GOOGLE_ONLY_DETAIL, r.json()
    finally:
        mongo.users.delete_one({"email": email})


def test_google_session_bogus_id_returns_401_not_500(session):
    """The Emergent session-exchange endpoint must downgrade upstream failures
    to a clean 401 with our user-facing message — never a 500."""
    r = session.post(
        f"{BASE_URL}/api/auth/google/session",
        json={"session_id": "bogus"},
        timeout=20,
    )
    assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"
    assert r.json().get("detail") == GOOGLE_FAIL_DETAIL, r.json()
