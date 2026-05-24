"""BotNira backend API tests.

Covers:
- Auth (signup, login, me, suspended vendor)
- Bot Studio get/update
- Public /chat/message (AI grounding)
- Conversations list/get/reply/resolve
- Simulate inbound channels
- Appointments, Channels
- Analytics
- Superadmin (admin vendors list/status/analytics + RBAC 403)
- Multi-tenant isolation between two vendors
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://chatbot-suite-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@botnira.com"
ADMIN_PASS = "admin123"
DEMO_EMAIL = "demo@botnira.com"
DEMO_PASS = "demo123"


# ----------------------------- fixtures -----------------------------
@pytest.fixture(scope="session")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(http, email, password):
    r = http.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    return r


@pytest.fixture(scope="session")
def admin_token(http):
    r = _login(http, ADMIN_EMAIL, ADMIN_PASS)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["role"] == "superadmin"
    return data["token"]


@pytest.fixture(scope="session")
def demo_token(http):
    r = _login(http, DEMO_EMAIL, DEMO_PASS)
    assert r.status_code == 200, f"demo login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["role"] == "vendor"
    assert data.get("vendor_id")
    return data["token"], data["vendor_id"]


@pytest.fixture(scope="session")
def second_vendor(http):
    """Signup a second vendor for isolation testing."""
    suffix = uuid.uuid4().hex[:8]
    email = f"TEST_v2_{suffix}@botnira.com"
    r = http.post(
        f"{API}/auth/signup",
        json={
            "email": email,
            "password": "testpass123",
            "full_name": "TEST Vendor Two",
            "business_name": f"TEST Pizza {suffix}",
        },
        timeout=30,
    )
    assert r.status_code == 200, f"signup failed: {r.status_code} {r.text}"
    d = r.json()
    return {"email": email, "token": d["token"], "vendor_id": d["vendor_id"]}


def h(token):
    return {"Authorization": f"Bearer {token}"}


# ----------------------------- Health -----------------------------
class TestHealth:
    def test_root(self, http):
        r = http.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"


# ----------------------------- Auth -----------------------------
class TestAuth:
    def test_login_admin(self, http):
        r = _login(http, ADMIN_EMAIL, ADMIN_PASS)
        assert r.status_code == 200
        d = r.json()
        assert d["role"] == "superadmin"
        assert isinstance(d["token"], str) and len(d["token"]) > 10

    def test_login_demo_vendor(self, http):
        r = _login(http, DEMO_EMAIL, DEMO_PASS)
        assert r.status_code == 200
        d = r.json()
        assert d["role"] == "vendor"
        assert d["vendor_id"]

    def test_login_bad_password(self, http):
        r = _login(http, DEMO_EMAIL, "wrong_password")
        assert r.status_code == 401

    def test_me_admin(self, http, admin_token):
        r = http.get(f"{API}/auth/me", headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["role"] == "superadmin"
        assert d["user"]["email"] == ADMIN_EMAIL
        assert d.get("vendor") is None

    def test_me_vendor(self, http, demo_token):
        token, vid = demo_token
        r = http.get(f"{API}/auth/me", headers=h(token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["role"] == "vendor"
        assert d["vendor"]["id"] == vid
        assert d["vendor"]["name"] == "Acme Dental Clinic"

    def test_me_requires_auth(self, http):
        r = http.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_signup_creates_defaults(self, second_vendor, http):
        # the fixture did signup; now confirm bot + channels exist for new vendor
        token = second_vendor["token"]
        r = http.get(f"{API}/bot", headers=h(token), timeout=15)
        assert r.status_code == 200
        bot = r.json()
        assert bot["vendor_id"] == second_vendor["vendor_id"]
        r2 = http.get(f"{API}/channels", headers=h(token), timeout=15)
        assert r2.status_code == 200
        chans = r2.json()
        names = sorted([c["channel"] for c in chans])
        assert names == sorted(["web", "whatsapp", "email", "sms", "voice"])

    def test_signup_duplicate_email(self, http, second_vendor):
        r = http.post(
            f"{API}/auth/signup",
            json={
                "email": second_vendor["email"],
                "password": "testpass123",
                "full_name": "Dup",
                "business_name": "Dup Biz",
            },
            timeout=20,
        )
        assert r.status_code == 400


# ----------------------------- Bot Studio -----------------------------
class TestBot:
    def test_get_bot(self, http, demo_token):
        token, vid = demo_token
        r = http.get(f"{API}/bot", headers=h(token), timeout=15)
        assert r.status_code == 200
        bot = r.json()
        assert bot["vendor_id"] == vid
        assert "business_description" in bot

    def test_update_bot(self, http, demo_token):
        token, _ = demo_token
        new_desc = "Acme Dental Clinic — updated TEST description. Hours Mon-Sat 9-6."
        r = http.put(
            f"{API}/bot",
            json={"business_description": new_desc, "tone": "warm and concise"},
            headers=h(token),
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["business_description"] == new_desc
        # verify persistence
        r2 = http.get(f"{API}/bot", headers=h(token), timeout=15)
        assert r2.json()["business_description"] == new_desc
        assert r2.json()["tone"] == "warm and concise"

    def test_bot_requires_vendor(self, http, admin_token):
        r = http.get(f"{API}/bot", headers=h(admin_token), timeout=15)
        assert r.status_code == 403


# ----------------------------- Public Chat / AI -----------------------------
class TestChat:
    def test_chat_message_grounded(self, http, demo_token):
        _, vid = demo_token
        r = http.post(
            f"{API}/chat/message",
            json={
                "vendor_id": vid,
                "message": "What are your opening hours?",
                "customer_name": "TEST Shopper",
                "channel": "web",
            },
            timeout=90,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("conversation_id")
        assert isinstance(d.get("reply"), str) and len(d["reply"]) > 0
        # grounding: reply should mention Mon-Sat or 9 (hours) since bot desc has them
        low = d["reply"].lower()
        # be tolerant — accept either the hours or a mention of Acme/dental
        assert ("mon" in low or "9" in low or "acme" in low or "dental" in low), f"reply not grounded: {d['reply']}"

    def test_chat_unknown_vendor_404(self, http):
        r = http.post(
            f"{API}/chat/message",
            json={"vendor_id": "nonexistent-vendor", "message": "hi"},
            timeout=30,
        )
        assert r.status_code == 404


# ----------------------------- Conversations -----------------------------
class TestConversations:
    def test_list_then_detail_reply_resolve(self, http, demo_token):
        token, vid = demo_token
        # seed a conversation via public chat
        r = http.post(
            f"{API}/chat/message",
            json={"vendor_id": vid, "message": "Do you accept insurance?", "customer_name": "TEST C"},
            timeout=90,
        )
        assert r.status_code == 200
        cid = r.json()["conversation_id"]

        r2 = http.get(f"{API}/conversations", headers=h(token), timeout=15)
        assert r2.status_code == 200
        items = r2.json()
        assert any(c["id"] == cid for c in items)

        r3 = http.get(f"{API}/conversations/{cid}", headers=h(token), timeout=15)
        assert r3.status_code == 200
        body = r3.json()
        assert body["conversation"]["id"] == cid
        assert len(body["messages"]) >= 2  # user + bot

        # agent reply
        r4 = http.post(
            f"{API}/conversations/{cid}/reply",
            json={"content": "TEST_AGENT reply"},
            headers=h(token),
            timeout=15,
        )
        assert r4.status_code == 200
        assert r4.json()["role"] == "agent"
        assert r4.json()["content"] == "TEST_AGENT reply"

        # resolve
        r5 = http.post(f"{API}/conversations/{cid}/resolve", headers=h(token), timeout=15)
        assert r5.status_code == 200
        r6 = http.get(f"{API}/conversations/{cid}", headers=h(token), timeout=15)
        assert r6.json()["conversation"]["status"] == "resolved"

    def test_conversation_not_found_for_other_vendor(self, http, demo_token, second_vendor):
        token, vid = demo_token
        # create conversation in demo
        r = http.post(
            f"{API}/chat/message",
            json={"vendor_id": vid, "message": "isolation check"},
            timeout=90,
        )
        cid = r.json()["conversation_id"]
        # second vendor must NOT see it
        r2 = http.get(f"{API}/conversations/{cid}", headers=h(second_vendor["token"]), timeout=15)
        assert r2.status_code == 404


# ----------------------------- Simulators -----------------------------
class TestSimulate:
    @pytest.mark.parametrize("channel", ["whatsapp", "email", "sms", "voice"])
    def test_simulate_channels(self, http, demo_token, channel):
        token, _ = demo_token
        r = http.post(
            f"{API}/simulate/{channel}",
            json={"customer_name": f"TEST_{channel}", "message": "hello from " + channel},
            headers=h(token),
            timeout=90,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("conversation_id")
        assert isinstance(d.get("reply"), str)

    def test_simulate_invalid_channel(self, http, demo_token):
        token, _ = demo_token
        r = http.post(
            f"{API}/simulate/fax",
            json={"customer_name": "x", "message": "y"},
            headers=h(token),
            timeout=15,
        )
        assert r.status_code == 400


# ----------------------------- Appointments -----------------------------
class TestAppointments:
    def test_create_and_list(self, http, demo_token):
        token, _ = demo_token
        payload = {
            "customer_name": "TEST Patient",
            "customer_contact": "+15550000",
            "scheduled_at": "2026-02-01T10:00:00+00:00",
            "notes": "TEST appointment",
        }
        r = http.post(f"{API}/appointments", json=payload, headers=h(token), timeout=15)
        assert r.status_code == 200
        created = r.json()
        assert created["customer_name"] == "TEST Patient"
        assert created["status"] == "scheduled"
        assert "id" in created

        r2 = http.get(f"{API}/appointments", headers=h(token), timeout=15)
        assert r2.status_code == 200
        assert any(a["id"] == created["id"] for a in r2.json())


# ----------------------------- Channels -----------------------------
class TestChannels:
    def test_list_and_update(self, http, demo_token):
        token, _ = demo_token
        r = http.get(f"{API}/channels", headers=h(token), timeout=15)
        assert r.status_code == 200
        chans = r.json()
        assert len(chans) >= 1

        r2 = http.put(
            f"{API}/channels/whatsapp",
            json={"status": "connected", "config": {"number": "+15551234567"}},
            headers=h(token),
            timeout=15,
        )
        assert r2.status_code == 200
        assert r2.json()["status"] == "connected"

        r3 = http.get(f"{API}/channels", headers=h(token), timeout=15)
        wa = next(c for c in r3.json() if c["channel"] == "whatsapp")
        assert wa["status"] == "connected"
        assert wa["config"].get("number") == "+15551234567"


# ----------------------------- Analytics -----------------------------
class TestAnalytics:
    def test_vendor_analytics(self, http, demo_token):
        token, _ = demo_token
        r = http.get(f"{API}/analytics", headers=h(token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "totals" in d and "by_channel" in d and "daily" in d and "hourly" in d
        assert isinstance(d["totals"]["conversations"], int)
        assert len(d["daily"]) == 7
        assert len(d["hourly"]) == 24


# ----------------------------- Admin / RBAC -----------------------------
class TestAdmin:
    def test_admin_vendors_list(self, http, admin_token):
        r = http.get(f"{API}/admin/vendors", headers=h(admin_token), timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 1
        v = data[0]
        assert "conversations" in v and "appointments" in v and "owner" in v

    def test_admin_analytics(self, http, admin_token):
        r = http.get(f"{API}/admin/analytics", headers=h(admin_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "leaderboard" in d
        assert "vendors" in d["totals"]
        assert "active_vendors" in d["totals"]

    def test_non_admin_forbidden_vendors(self, http, demo_token):
        token, _ = demo_token
        r = http.get(f"{API}/admin/vendors", headers=h(token), timeout=15)
        assert r.status_code == 403

    def test_non_admin_forbidden_analytics(self, http, demo_token):
        token, _ = demo_token
        r = http.get(f"{API}/admin/analytics", headers=h(token), timeout=15)
        assert r.status_code == 403

    def test_suspend_then_reactivate(self, http, admin_token, second_vendor):
        vid = second_vendor["vendor_id"]
        # suspend
        r = http.put(
            f"{API}/admin/vendors/{vid}/status",
            json={"status": "suspended"},
            headers=h(admin_token),
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "suspended"

        # suspended vendor cannot login
        r2 = _login(http, second_vendor["email"], "testpass123")
        assert r2.status_code == 403, f"expected 403 for suspended login, got {r2.status_code}"

        # public chat to suspended vendor -> 404
        r3 = http.post(
            f"{API}/chat/message",
            json={"vendor_id": vid, "message": "hi"},
            timeout=30,
        )
        assert r3.status_code == 404

        # reactivate
        r4 = http.put(
            f"{API}/admin/vendors/{vid}/status",
            json={"status": "active"},
            headers=h(admin_token),
            timeout=15,
        )
        assert r4.status_code == 200
        assert r4.json()["status"] == "active"


# ----------------------------- Multi-tenant isolation -----------------------------
class TestIsolation:
    def test_second_vendor_no_cross_leak(self, http, demo_token, second_vendor):
        _, demo_vid = demo_token
        v2_token = second_vendor["token"]
        v2_vid = second_vendor["vendor_id"]
        assert demo_vid != v2_vid

        # seed a conversation for demo only
        http.post(
            f"{API}/chat/message",
            json={"vendor_id": demo_vid, "message": "iso test msg"},
            timeout=90,
        )

        # seed conversation for v2 via simulate
        http.post(
            f"{API}/simulate/email",
            json={"customer_name": "TEST v2", "message": "hello v2"},
            headers=h(v2_token),
            timeout=90,
        )

        # v2 must only see its own conversations
        r = http.get(f"{API}/conversations", headers=h(v2_token), timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert all(c["vendor_id"] == v2_vid for c in items)

        # v2 analytics must only reflect its own vendor
        r2 = http.get(f"{API}/analytics", headers=h(v2_token), timeout=20)
        assert r2.status_code == 200
        # v2 has had at most a handful of convs; can't be huge
        assert r2.json()["totals"]["conversations"] <= 10

        # v2 cannot read demo's bot
        r3 = http.get(f"{API}/bot", headers=h(v2_token), timeout=15)
        assert r3.status_code == 200
        assert r3.json()["vendor_id"] == v2_vid
