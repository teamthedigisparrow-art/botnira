"""Tests for the Email channel — IMAP/SMTP connect, status, settings, disconnect, send.

Covers all /api/email/* endpoints + auth gating + DB password encryption check.
"""
import os
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://receptionist-hub-5.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

VENDOR_EMAIL = "kamal@thedigisparrow.com"
VENDOR_PASSWORD = "Kamala98@hmu"
DEMO_EMAIL = "demo@botnira.com"
DEMO_PASSWORD = "demo123"
ADMIN_EMAIL = "admin@botnira.com"
ADMIN_PASSWORD = "admin123"


def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Login failed for {email}: {r.status_code} {r.text}")
    data = r.json()
    if data.get("mfa_required"):
        pytest.skip(f"MFA required for {email}")
    return data["token"]


@pytest.fixture(scope="module")
def vendor_token():
    return _login(VENDOR_EMAIL, VENDOR_PASSWORD)


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def demo_token():
    return _login(DEMO_EMAIL, DEMO_PASSWORD)


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------------- Auth gating ----------------
class TestAuthGating:
    def test_connect_requires_auth(self):
        r = requests.post(f"{API}/email/connect", json={"email_address": "a@gmail.com", "password": "x"}, timeout=15)
        assert r.status_code in (401, 403), f"got {r.status_code}: {r.text}"

    def test_status_requires_auth(self):
        r = requests.get(f"{API}/email/status", timeout=15)
        assert r.status_code in (401, 403)

    def test_settings_requires_auth(self):
        r = requests.put(f"{API}/email/settings", json={"ai_auto_reply": True}, timeout=15)
        assert r.status_code in (401, 403)

    def test_disconnect_requires_auth(self):
        r = requests.post(f"{API}/email/disconnect", timeout=15)
        assert r.status_code in (401, 403)

    def test_poll_now_requires_auth(self):
        r = requests.post(f"{API}/email/poll-now", timeout=15)
        assert r.status_code in (401, 403)

    def test_send_requires_auth(self):
        r = requests.post(f"{API}/email/send", json={}, timeout=15)
        assert r.status_code in (401, 403)

    def test_admin_cannot_access_email(self, admin_token):
        r = requests.get(f"{API}/email/status", headers=_h(admin_token), timeout=15)
        # Admin is not a vendor → require_vendor should reject (401/403)
        assert r.status_code in (401, 403), f"admin should not access vendor email: {r.status_code} {r.text}"


# ---------------- Validation ----------------
class TestConnectValidation:
    def test_missing_password(self, vendor_token):
        r = requests.post(f"{API}/email/connect", headers=_h(vendor_token),
                          json={"email_address": "test@gmail.com"}, timeout=15)
        assert r.status_code == 422, f"expected 422 missing password, got {r.status_code}: {r.text}"

    def test_missing_email(self, vendor_token):
        r = requests.post(f"{API}/email/connect", headers=_h(vendor_token),
                          json={"password": "x"}, timeout=15)
        assert r.status_code == 422

    def test_invalid_email_format(self, vendor_token):
        r = requests.post(f"{API}/email/connect", headers=_h(vendor_token),
                          json={"email_address": "not-an-email", "password": "x"}, timeout=15)
        assert r.status_code == 422

    def test_unknown_domain_no_advanced(self, vendor_token):
        """Unknown domain WITHOUT advanced fields → 400 'auto-detect' error."""
        r = requests.post(f"{API}/email/connect", headers=_h(vendor_token),
                          json={"email_address": "user@somerandomdomain123xyz.org",
                                "password": "doesnotmatter"}, timeout=20)
        assert r.status_code == 400
        body = r.json()
        detail = body.get("detail", "")
        assert "auto-detect" in detail.lower() or "imap" in detail.lower(), \
            f"expected auto-detect error, got: {detail}"

    def test_gmail_bad_creds_returns_400_with_imap_failed(self, vendor_token):
        """Gmail auto-detects hosts but bad creds → 400 + 'IMAP login failed' detail."""
        r = requests.post(f"{API}/email/connect", headers=_h(vendor_token),
                          json={"email_address": "test@gmail.com", "password": "wrongpassword"},
                          timeout=30)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        detail = r.json().get("detail", "")
        assert "IMAP login failed" in detail or "IMAP" in detail, \
            f"expected IMAP-related error, got: {detail}"


# ---------------- Status ----------------
class TestStatus:
    def test_status_returns_connected_field(self, vendor_token):
        # First disconnect to get a clean state
        requests.post(f"{API}/email/disconnect", headers=_h(vendor_token), timeout=15)
        r = requests.get(f"{API}/email/status", headers=_h(vendor_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "connected" in data
        assert data["connected"] is False

    def test_status_no_password_in_response(self, vendor_token):
        """If a connection somehow exists, the password_encrypted must NOT leak."""
        r = requests.get(f"{API}/email/status", headers=_h(vendor_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        if data.get("connected"):
            conn = data.get("connection", {})
            assert "password_encrypted" not in conn, "password_encrypted leaked in status response!"
            assert "password" not in conn, "password leaked in status response!"


# ---------------- Settings ----------------
class TestSettings:
    def test_settings_404_when_no_connection(self, vendor_token):
        # Ensure disconnected
        requests.post(f"{API}/email/disconnect", headers=_h(vendor_token), timeout=15)
        r = requests.put(f"{API}/email/settings", headers=_h(vendor_token),
                         json={"ai_auto_reply": True}, timeout=15)
        assert r.status_code == 404, f"expected 404 when no connection, got {r.status_code}: {r.text}"

    def test_settings_400_when_empty_payload(self, vendor_token):
        r = requests.put(f"{API}/email/settings", headers=_h(vendor_token),
                         json={}, timeout=15)
        assert r.status_code == 400


# ---------------- Disconnect ----------------
class TestDisconnect:
    def test_disconnect_idempotent(self, vendor_token):
        r = requests.post(f"{API}/email/disconnect", headers=_h(vendor_token), timeout=15)
        assert r.status_code == 200
        # Second call should also be 200 (no-op safe)
        r2 = requests.post(f"{API}/email/disconnect", headers=_h(vendor_token), timeout=15)
        assert r2.status_code == 200


# ---------------- Poll-now ----------------
class TestPollNow:
    def test_poll_now_400_when_not_connected(self, vendor_token):
        requests.post(f"{API}/email/disconnect", headers=_h(vendor_token), timeout=15)
        r = requests.post(f"{API}/email/poll-now", headers=_h(vendor_token), timeout=15)
        assert r.status_code == 400, f"expected 400 when not connected, got {r.status_code}: {r.text}"


# ---------------- Send ----------------
class TestEmailSend:
    def test_send_400_no_payload(self, vendor_token):
        r = requests.post(f"{API}/email/send", headers=_h(vendor_token), json={}, timeout=15)
        assert r.status_code == 400

    def test_send_400_missing_text(self, vendor_token):
        r = requests.post(f"{API}/email/send", headers=_h(vendor_token),
                          json={"conversation_id": "x"}, timeout=15)
        assert r.status_code == 400

    def test_send_404_for_non_existent_conv(self, vendor_token):
        r = requests.post(f"{API}/email/send", headers=_h(vendor_token),
                          json={"conversation_id": "no-such-conv-id-xyz", "text": "hi"}, timeout=15)
        # Either 404 (conv not found) or 400 (channel not connected) — depends on order;
        # current impl checks conv first → 404
        assert r.status_code in (404, 400), f"got {r.status_code}: {r.text}"


# ---------------- DB password encryption check ----------------
class TestPasswordStorage:
    def test_no_email_connection_has_plaintext_password(self):
        """Inspect the email_connections collection: every doc must have password_encrypted, no plaintext."""
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        try:
            for doc in db.email_connections.find():
                assert "password_encrypted" in doc, f"doc missing password_encrypted: {doc.get('vendor_id')}"
                assert "password" not in doc, f"plaintext password leaked in DB: {doc.get('vendor_id')}"
                # Fernet ciphertext starts with "gAAAAA"
                pwd_enc = doc["password_encrypted"]
                assert isinstance(pwd_enc, str) and pwd_enc.startswith("gAAAAA"), \
                    f"password_encrypted is not Fernet ciphertext: {pwd_enc[:20]}..."
        finally:
            client.close()


# ---------------- Trial vendor — email channel locked ----------------
class TestTrialVendorEmailLocked:
    def test_demo_can_call_status(self, demo_token):
        """Demo vendor (trial) — email NOT in TRIAL_ALLOWED_CHANNELS but the endpoint itself doesn't gate."""
        r = requests.get(f"{API}/email/status", headers=_h(demo_token), timeout=15)
        # Endpoint should still return 200 with connected:false (no plan-gate on status)
        assert r.status_code == 200
