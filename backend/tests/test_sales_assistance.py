"""Sales Assistance (outbound email marketing) — end-to-end backend tests.

Covers all /api/sales/* endpoints. Plan gating, prospects CRUD + CSV upload,
campaign lifecycle, analytics, and public tracking + unsubscribe routes.
Test data prefixed with TEST_ for easy cleanup.
"""
import io
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

EXEMPT_EMAIL = "kamal@thedigisparrow.com"
EXEMPT_PASS = "Kamala98@hmu"
TRIAL_EMAIL = "demo@botnira.com"
TRIAL_PASS = "demo123"


# ---------------------------------------------------------------- fixtures ---
def _login(email: str, password: str):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        return None
    data = r.json()
    if data.get("mfa_required"):
        return None
    return data.get("token") or data.get("access_token")


@pytest.fixture(scope="session")
def exempt_token():
    tok = _login(EXEMPT_EMAIL, EXEMPT_PASS)
    if not tok:
        pytest.skip("Cannot login as exempt vendor")
    return tok


@pytest.fixture(scope="session")
def trial_token():
    tok = _login(TRIAL_EMAIL, TRIAL_PASS)
    if not tok:
        pytest.skip("Cannot login as trial vendor")
    return tok


@pytest.fixture(scope="session")
def exempt_client(exempt_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {exempt_token}",
                      "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def trial_client(trial_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {trial_token}",
                      "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session", autouse=True)
def cleanup_at_end(exempt_client):
    """Wipe TEST_ prospects and any pending TEST_ campaigns at end."""
    yield
    try:
        # Cancel any TEST_ campaigns first
        r = exempt_client.get(f"{API}/sales/campaigns", timeout=20)
        if r.status_code == 200:
            for c in r.json().get("items", []):
                if c.get("name", "").startswith("TEST_") and c.get("status") not in ("completed", "canceled"):
                    exempt_client.post(f"{API}/sales/campaigns/{c['id']}/cancel", timeout=20)
        # Clear test prospects (matching @example.com)
        r = exempt_client.get(f"{API}/sales/prospects", params={"q": "TEST_", "limit": 500}, timeout=20)
        if r.status_code == 200:
            for p in r.json().get("items", []):
                exempt_client.delete(f"{API}/sales/prospects/{p['id']}", timeout=10)
        # Belt+suspenders: also delete any leftover @example.com
        r = exempt_client.get(f"{API}/sales/prospects", params={"q": "example.com", "limit": 500}, timeout=20)
        if r.status_code == 200:
            for p in r.json().get("items", []):
                if p.get("email", "").endswith("@example.com"):
                    exempt_client.delete(f"{API}/sales/prospects/{p['id']}", timeout=10)
    except Exception as e:
        print(f"cleanup warn: {e}")


# ---------------------------------------------------------------- access ---
class TestAccess:
    def test_access_exempt(self, exempt_client):
        r = exempt_client.get(f"{API}/sales/access", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["enabled"] is True
        assert d["plan_label"] in ("exempt", "growth", "pro")

    def test_access_trial_locked(self, trial_client):
        r = trial_client.get(f"{API}/sales/access", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["enabled"] is False
        assert d["reason"]

    def test_prospects_403_for_trial(self, trial_client):
        r = trial_client.get(f"{API}/sales/prospects", timeout=20)
        assert r.status_code == 403

    def test_campaigns_403_for_trial(self, trial_client):
        r = trial_client.post(f"{API}/sales/campaigns", json={
            "name": "x", "subject": "x", "body_type": "text", "body": "x"
        }, timeout=20)
        assert r.status_code == 403


# ---------------------------------------------------------------- prospects ---
class TestProspects:
    def test_clear_then_list_empty(self, exempt_client):
        # Start with clean slate for exempt vendor's prospect list
        exempt_client.post(f"{API}/sales/prospects/clear", timeout=20)
        r = exempt_client.get(f"{API}/sales/prospects", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "counts" in d
        assert d["total"] == 0

    def test_add_single_prospect(self, exempt_client):
        r = exempt_client.post(f"{API}/sales/prospects", json={
            "email": "TEST_alice@example.com", "name": "Alice", "company": "Acme"
        }, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["duplicate"] is False
        assert d["prospect"]["email"] == "test_alice@example.com"
        assert d["prospect"]["status"] == "active"

    def test_add_duplicate_returns_existing(self, exempt_client):
        r = exempt_client.post(f"{API}/sales/prospects", json={
            "email": "TEST_alice@example.com", "name": "Alice2"
        }, timeout=20)
        assert r.status_code == 200
        assert r.json()["duplicate"] is True

    def test_add_invalid_email(self, exempt_client):
        r = exempt_client.post(f"{API}/sales/prospects", json={
            "email": "not-an-email", "name": "x"
        }, timeout=20)
        assert r.status_code in (400, 422)

    def test_csv_upload_inserts_and_dedupes(self, exempt_client):
        csv1 = "email,name,company\nTEST_bob@example.com,Bob,BobCo\nTEST_carol@example.com,Carol,CarolCo\nTEST_alice@example.com,AliceDup,AcmeDup\nbad-email,Nope,X\n"
        files = {"file": ("a.csv", csv1.encode(), "text/csv")}
        # Use a session WITHOUT json content-type for multipart
        s = requests.Session()
        s.headers.update({"Authorization": exempt_client.headers["Authorization"]})
        r = s.post(f"{API}/sales/prospects/upload", files=files, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["inserted"] == 2  # bob, carol
        assert d["duplicates_skipped"] == 1  # alice
        assert d["invalid_skipped"] == 1
        assert d["total_in_file"] == 4

    def test_csv_re_upload_overlap(self, exempt_client):
        csv2 = "Email,Name,Company\nTEST_bob@example.com,Bob,BobCo\nTEST_dan@example.com,Dan,DanCo\nTEST_BOB@EXAMPLE.com,BobUpper,X\n"
        files = {"file": ("b.csv", csv2.encode(), "text/csv")}
        s = requests.Session()
        s.headers.update({"Authorization": exempt_client.headers["Authorization"]})
        r = s.post(f"{API}/sales/prospects/upload", files=files, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["inserted"] == 1  # dan only
        assert d["duplicates_skipped"] == 1  # TEST_bob already in this list (the uppercase dup is silently collapsed by seen_in_file)

    def test_list_with_filters(self, exempt_client):
        r = exempt_client.get(f"{API}/sales/prospects", params={"q": "alice"}, timeout=20)
        assert r.status_code == 200
        items = r.json()["items"]
        assert any("alice" in p["email"] for p in items)

        r = exempt_client.get(f"{API}/sales/prospects",
                              params={"status": "active", "limit": 10, "offset": 0}, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["limit"] == 10 and d["offset"] == 0
        assert all(p["status"] == "active" for p in d["items"])

    def test_delete_prospect(self, exempt_client):
        # Create disposable
        r = exempt_client.post(f"{API}/sales/prospects",
                               json={"email": "TEST_kill@example.com"}, timeout=20)
        pid = r.json()["prospect"]["id"]
        r = exempt_client.delete(f"{API}/sales/prospects/{pid}", timeout=20)
        assert r.status_code == 200

    def test_delete_404(self, exempt_client):
        r = exempt_client.delete(f"{API}/sales/prospects/does-not-exist", timeout=20)
        assert r.status_code == 404


# ---------------------------------------------------------------- campaigns ---
class TestCampaigns:
    @pytest.fixture(scope="class")
    def campaign_id(self, exempt_client):
        # Ensure at least 1 active prospect exists (re-add safe @example.com)
        exempt_client.post(f"{API}/sales/prospects",
                           json={"email": "TEST_camp@example.com", "name": "Camp"}, timeout=20)
        r = exempt_client.post(f"{API}/sales/campaigns", json={
            "name": "TEST_Campaign1",
            "subject": "Hello {{first_name}}",
            "body_type": "text",
            "body": "Hi {{name}} from {{company}}",
            "start_now": True,
        }, timeout=30)
        assert r.status_code == 200, r.text
        cid = r.json()["campaign"]["id"]
        # CRITICAL: cancel immediately to avoid real send attempts
        exempt_client.post(f"{API}/sales/campaigns/{cid}/cancel", timeout=20)
        yield cid

    def test_create_returns_campaign(self, exempt_client, campaign_id):
        r = exempt_client.get(f"{API}/sales/campaigns/{campaign_id}", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["campaign"]["id"] == campaign_id
        assert d["campaign"]["status"] == "canceled"  # we cancelled in fixture
        assert isinstance(d["recipients"], list)
        assert len(d["recipients"]) >= 1

    def test_list_campaigns(self, exempt_client, campaign_id):
        r = exempt_client.get(f"{API}/sales/campaigns", timeout=20)
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()["items"]]
        assert campaign_id in ids

    def test_pause_already_canceled_400(self, exempt_client, campaign_id):
        r = exempt_client.post(f"{API}/sales/campaigns/{campaign_id}/pause", timeout=20)
        assert r.status_code == 400

    def test_cancel_already_canceled_400(self, exempt_client, campaign_id):
        r = exempt_client.post(f"{API}/sales/campaigns/{campaign_id}/cancel", timeout=20)
        assert r.status_code == 400

    def test_pause_resume_flow(self, exempt_client):
        # Create a fresh campaign and immediately pause+resume+cancel
        exempt_client.post(f"{API}/sales/prospects",
                           json={"email": "TEST_flow@example.com"}, timeout=20)
        r = exempt_client.post(f"{API}/sales/campaigns", json={
            "name": "TEST_FlowCampaign", "subject": "s", "body_type": "text",
            "body": "b", "start_now": True
        }, timeout=30)
        assert r.status_code == 200
        cid = r.json()["campaign"]["id"]
        try:
            # Pause from sending
            r = exempt_client.post(f"{API}/sales/campaigns/{cid}/pause", timeout=20)
            assert r.status_code == 200
            # Verify status
            r = exempt_client.get(f"{API}/sales/campaigns/{cid}", timeout=20)
            assert r.json()["campaign"]["status"] == "paused"
            # Resume
            r = exempt_client.post(f"{API}/sales/campaigns/{cid}/resume", timeout=20)
            assert r.status_code == 200
            r = exempt_client.get(f"{API}/sales/campaigns/{cid}", timeout=20)
            assert r.json()["campaign"]["status"] == "sending"
            # Resume on non-paused -> 400
            r = exempt_client.post(f"{API}/sales/campaigns/{cid}/resume", timeout=20)
            assert r.status_code == 400
        finally:
            # Always cancel to stop sender loop
            exempt_client.post(f"{API}/sales/campaigns/{cid}/cancel", timeout=20)

    def test_create_campaign_404_no_prospects(self, exempt_client):
        # Wipe all then attempt to create
        exempt_client.post(f"{API}/sales/prospects/clear", timeout=20)
        r = exempt_client.post(f"{API}/sales/campaigns", json={
            "name": "TEST_NoProspects", "subject": "s", "body_type": "text",
            "body": "b", "start_now": True
        }, timeout=30)
        assert r.status_code == 400
        assert "prospects" in r.text.lower()


# ---------------------------------------------------------------- analytics ---
class TestAnalytics:
    def test_analytics_shape(self, exempt_client):
        r = exempt_client.get(f"{API}/sales/analytics", params={"days": 30}, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "totals" in d and "series" in d
        for k in ("sent", "opened", "failed", "open_rate_pct", "unsubscribed"):
            assert k in d["totals"]
        assert isinstance(d["series"], list)
        assert d["days"] == 30


# ---------------------------------------------------------------- tracking ---
class TestPublicTracking:
    def test_tracking_pixel_no_auth(self):
        # Public — no auth header. Must return image/gif 200 even with bogus ids.
        r = requests.get(f"{API}/sales/track/open/bogus-cid/bogus-rid.gif", timeout=20)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/gif")
        assert len(r.content) > 0

    def test_unsubscribe_404_for_bad_ids(self):
        r = requests.get(f"{API}/sales/unsubscribe/bad-vid/bad-pid", timeout=20)
        assert r.status_code == 404
        assert "expired" in r.text.lower() or "no longer" in r.text.lower()

    def test_unsubscribe_flips_status(self, exempt_client):
        # Create prospect
        r = exempt_client.post(f"{API}/sales/prospects",
                               json={"email": "TEST_unsub@example.com"}, timeout=20)
        assert r.status_code == 200
        pid = r.json()["prospect"]["id"]
        # Find vendor_id from list
        r = exempt_client.get(f"{API}/sales/prospects", params={"q": "TEST_unsub"}, timeout=20)
        items = r.json()["items"]
        vid = items[0]["vendor_id"]
        # Hit the unsubscribe URL (public)
        r = requests.get(f"{API}/sales/unsubscribe/{vid}/{pid}", timeout=20)
        assert r.status_code == 200
        assert "unsubscribed" in r.text.lower()
        # Verify in list
        r = exempt_client.get(f"{API}/sales/prospects", params={"q": "TEST_unsub"}, timeout=20)
        items = r.json()["items"]
        assert items[0]["status"] == "unsubscribed"
