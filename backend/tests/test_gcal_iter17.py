"""BotNira iter 17 — Google Calendar (Phase 2) backend API tests.

Verifies the vendor-facing /api/scheduling/google/* endpoints and the public
/api/oauth/calendar/callback endpoint. Uses the exempt vendor
kamal@thedigisparrow.com for auth.
"""
import os
import urllib.parse
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://multi-channel-inbox-3.preview.emergentagent.com").rstrip("/")
VENDOR_EMAIL = "kamal@thedigisparrow.com"
VENDOR_PASSWORD = "Kamala98@hmu"

EXPECTED_CLIENT_ID = "201113663178-ddtt37kt350bqms5q1t7he6fi4vvmb8h.apps.googleusercontent.com"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def vendor_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login", json={
        "email": VENDOR_EMAIL, "password": VENDOR_PASSWORD})
    assert r.status_code == 200, f"vendor login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def auth(api, vendor_token):
    api.headers.update({"Authorization": f"Bearer {vendor_token}"})
    return api


# -------- /api/scheduling/google/status ----------
def test_status_configured_true_connected_false(auth):
    """Google creds ARE configured on the server. Vendor is not yet connected."""
    r = auth.get(f"{BASE_URL}/api/scheduling/google/status")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("configured") is True, f"configured must be True, got {data}"
    # If a prior test connected this vendor we would see connected=True. In that
    # case just skip (this test suite otherwise disconnects at the end).
    if data.get("connected"):
        pytest.skip("vendor already connected — skipping disconnected assertion")
    assert data.get("connected") is False


# -------- /api/scheduling/google/connect ----------
def test_connect_returns_google_auth_url(auth):
    origin = "https://x.com"
    r = auth.get(f"{BASE_URL}/api/scheduling/google/connect",
                 params={"origin": origin})
    assert r.status_code == 200, r.text
    data = r.json()
    url = data.get("authorization_url", "")
    assert url.startswith("https://accounts.google.com/o/oauth2/v2/auth"), url
    assert f"client_id={EXPECTED_CLIENT_ID}" in url or \
           f"client_id={urllib.parse.quote(EXPECTED_CLIENT_ID, safe='')}" in url, url
    expected_redirect = urllib.parse.quote(
        "https://x.com/api/oauth/calendar/callback", safe="")
    assert f"redirect_uri={expected_redirect}" in url, url
    # standard OAuth params
    assert "response_type=code" in url
    assert "access_type=offline" in url
    assert "prompt=consent" in url
    assert "state=" in url  # JWT state


def test_connect_requires_auth(api):
    """Anonymous request must be rejected."""
    s = requests.Session()
    r = s.get(f"{BASE_URL}/api/scheduling/google/connect",
              params={"origin": "https://x.com"})
    assert r.status_code in (401, 403), r.status_code


# -------- /api/oauth/calendar/callback ----------
def test_callback_bogus_state_returns_400(api):
    """Public callback with bogus state must return 400 (not 500)."""
    r = api.get(f"{BASE_URL}/api/oauth/calendar/callback",
                params={"state": "bogus", "code": "x"},
                allow_redirects=False)
    assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text[:200]}"


# -------- /api/scheduling/google/disconnect ----------
def test_disconnect_returns_ok(auth):
    """Disconnect is idempotent — returns {ok:true} even if not connected."""
    r = auth.post(f"{BASE_URL}/api/scheduling/google/disconnect")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("ok") is True, data


def test_status_after_disconnect(auth):
    """After disconnect, status should be configured=true, connected=false."""
    r = auth.get(f"{BASE_URL}/api/scheduling/google/status")
    assert r.status_code == 200
    data = r.json()
    assert data.get("configured") is True
    assert data.get("connected") is False
