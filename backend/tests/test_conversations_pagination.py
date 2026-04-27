"""Tests for paginated + searchable /api/conversations and mark-read endpoint.

Covers iteration-5 changes:
- GET /api/conversations → paginated {items, total, has_more, unread_total}
- GET /api/conversations?q=...  → server-side search (limit auto-raised to 200)
- GET /api/conversations?offset=...&limit=... → pagination
- GET /api/conversations?channel=email → channel filter
- POST /api/conversations/{cid}/read → mark-as-read (auth gated, 404 for bad cid)
"""
import os
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

VENDOR_EMAIL = "kamal@thedigisparrow.com"
VENDOR_PASSWORD = "Kamala98@hmu"
DEMO_EMAIL = "demo@botnira.com"
DEMO_PASSWORD = "demo123"
ADMIN_EMAIL = "admin@botnira.com"
ADMIN_PASSWORD = "admin123"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"login failed for {email}: {r.status_code} {r.text}")
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


# -------- /conversations pagination --------
class TestConversationsPagination:
    def test_default_returns_object_with_items_total(self, vendor_token):
        r = requests.get(f"{API}/conversations", headers=_h(vendor_token), timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d, dict), f"expected dict, got {type(d)}"
        assert "items" in d and "total" in d and "has_more" in d and "unread_total" in d
        assert isinstance(d["items"], list)
        assert isinstance(d["total"], int)
        assert isinstance(d["has_more"], bool)
        assert isinstance(d["unread_total"], int)
        # default page size 30
        assert len(d["items"]) <= 30, f"default limit should be 30, got {len(d['items'])}"
        # kamal has ~493 threads per spec
        if d["total"] >= 30:
            assert len(d["items"]) == 30
            assert d["has_more"] is True

    def test_offset_pagination(self, vendor_token):
        r1 = requests.get(f"{API}/conversations?limit=30&offset=0",
                          headers=_h(vendor_token), timeout=20)
        r2 = requests.get(f"{API}/conversations?limit=30&offset=30",
                          headers=_h(vendor_token), timeout=20)
        assert r1.status_code == 200 and r2.status_code == 200
        d1, d2 = r1.json(), r2.json()
        if d1["total"] >= 60:
            ids1 = {c["id"] for c in d1["items"]}
            ids2 = {c["id"] for c in d2["items"]}
            # No overlap between page 1 (offset 0) and page 2 (offset 30)
            assert ids1.isdisjoint(ids2), "pagination returned overlapping ids"
            assert len(d2["items"]) == 30

    def test_limit_cap_at_200(self, vendor_token):
        r = requests.get(f"{API}/conversations?limit=500",
                         headers=_h(vendor_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert len(d["items"]) <= 200, f"limit should be capped at 200, got {len(d['items'])}"

    def test_channel_filter(self, vendor_token):
        r = requests.get(f"{API}/conversations?channel=email&limit=5",
                         headers=_h(vendor_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert len(d["items"]) <= 5
        for it in d["items"]:
            assert it.get("channel") == "email", f"non-email thread returned: {it.get('channel')}"

    def test_status_filter(self, vendor_token):
        r = requests.get(f"{API}/conversations?status=open&limit=10",
                         headers=_h(vendor_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        for it in d["items"]:
            assert it.get("status") == "open"


# -------- /conversations?q=... search --------
class TestConversationsSearch:
    def test_search_returns_matches_only(self, vendor_token):
        r = requests.get(f"{API}/conversations?q=gmail", headers=_h(vendor_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        # When q is set, limit is auto-raised to 200 so items should equal total (if <=200).
        assert d["total"] >= 0
        assert len(d["items"]) == min(d["total"], 200)
        # verify each item's fields contain "gmail" (case-insensitive)
        for it in d["items"][:10]:
            hay = " ".join([
                str(it.get("customer_name") or ""),
                str(it.get("customer_contact") or ""),
                str(it.get("last_message_preview") or ""),
                str(it.get("subject") or ""),
            ]).lower()
            assert "gmail" in hay, f"result doesn't contain 'gmail': {it.get('id')} — {hay[:120]}"

    def test_search_regex_escaped(self, vendor_token):
        """Special chars like @ . + should be treated literally (no regex error)."""
        r = requests.get(f"{API}/conversations?q=test@gmail.com",
                         headers=_h(vendor_token), timeout=20)
        assert r.status_code == 200, r.text

    def test_search_empty_returns_all(self, vendor_token):
        r = requests.get(f"{API}/conversations?q=", headers=_h(vendor_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        # empty q → default pagination (30) applies
        assert len(d["items"]) <= 30

    def test_search_no_match(self, vendor_token):
        r = requests.get(f"{API}/conversations?q=zzzzz__nomatch__9876",
                         headers=_h(vendor_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["total"] == 0
        assert d["items"] == []
        assert d["has_more"] is False


# -------- auth gating --------
class TestConversationsAuth:
    def test_list_requires_auth(self):
        r = requests.get(f"{API}/conversations", timeout=15)
        assert r.status_code in (401, 403)

    def test_admin_cannot_access(self, admin_token):
        r = requests.get(f"{API}/conversations", headers=_h(admin_token), timeout=15)
        assert r.status_code in (401, 403)

    def test_demo_vendor_isolated(self, demo_token):
        """demo vendor should get its own list, not kamal's — verify vendor scoping."""
        r = requests.get(f"{API}/conversations", headers=_h(demo_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        # demo is a fresh vendor — might have 0 or a few. Just ensure it's not kamal's 493.
        assert d["total"] < 400


# -------- /conversations/{cid}/read --------
class TestMarkRead:
    def test_mark_read_requires_auth(self):
        r = requests.post(f"{API}/conversations/any-id/read", timeout=15)
        assert r.status_code in (401, 403)

    def test_mark_read_admin_forbidden(self, admin_token):
        r = requests.post(f"{API}/conversations/any-id/read",
                          headers=_h(admin_token), timeout=15)
        assert r.status_code in (401, 403)

    def test_mark_read_404_for_bad_cid(self, vendor_token):
        r = requests.post(f"{API}/conversations/nonexistent-cid-xyz-123/read",
                          headers=_h(vendor_token), timeout=15)
        assert r.status_code == 404

    def test_mark_read_flips_unread_flag(self, vendor_token):
        """Seed a conversation with unread=True, call mark-read, verify unread=False."""
        # Find vendor_id via /auth/me or fetch any convo
        r = requests.get(f"{API}/conversations?limit=1", headers=_h(vendor_token), timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        if not items:
            pytest.skip("no conversations to test with")
        cid = items[0]["id"]
        vendor_id = items[0]["vendor_id"]

        # seed unread=True directly in DB
        client = MongoClient(MONGO_URL)
        try:
            db = client[DB_NAME]
            db.conversations.update_one(
                {"id": cid, "vendor_id": vendor_id},
                {"$set": {"unread": True}},
            )
            before = db.conversations.find_one({"id": cid}, {"_id": 0, "unread": 1})
            assert before["unread"] is True, "seed failed"

            # call mark-read
            rr = requests.post(f"{API}/conversations/{cid}/read",
                               headers=_h(vendor_token), timeout=15)
            assert rr.status_code == 200, rr.text
            body = rr.json()
            assert body.get("ok") is True

            # verify DB flipped
            after = db.conversations.find_one({"id": cid}, {"_id": 0, "unread": 1})
            assert after["unread"] is False
        finally:
            client.close()


# -------- fresh_start on /email/connect --------
class TestEmailConnectFreshStart:
    def test_fresh_start_in_payload_bad_creds_still_400(self, vendor_token):
        """fresh_start=True with BAD creds must NOT wipe data (auth fails first → 400)."""
        # Count email convs before
        client = MongoClient(MONGO_URL)
        try:
            db = client[DB_NAME]
            # Find vendor_id
            r0 = requests.get(f"{API}/conversations?limit=1",
                              headers=_h(vendor_token), timeout=15)
            if r0.status_code == 200 and r0.json()["items"]:
                vendor_id = r0.json()["items"][0]["vendor_id"]
                before = db.conversations.count_documents(
                    {"vendor_id": vendor_id, "channel": "email"}
                )
            else:
                before = 0

            r = requests.post(
                f"{API}/email/connect",
                headers=_h(vendor_token),
                json={
                    "email_address": "test@gmail.com",
                    "password": "definitelywrongpassword",
                    "fresh_start": True,
                },
                timeout=30,
            )
            assert r.status_code == 400, f"expected 400 on bad creds, got {r.status_code}: {r.text}"

            # Verify nothing was wiped
            if before > 0:
                after = db.conversations.count_documents(
                    {"vendor_id": vendor_id, "channel": "email"}
                )
                assert after == before, f"data wiped despite auth failure: {before} → {after}"
        finally:
            client.close()

    def test_fresh_start_field_accepted_in_schema(self, vendor_token):
        """The EmailConnectReq model must accept fresh_start without 422."""
        r = requests.post(
            f"{API}/email/connect",
            headers=_h(vendor_token),
            json={
                "email_address": "user@gmail.com",
                "password": "x",
                "fresh_start": False,
            },
            timeout=30,
        )
        # Should be 400 (bad creds) not 422 (schema error)
        assert r.status_code != 422, f"fresh_start field rejected by schema: {r.text}"
