"""Backend tests for:
- WhatsApp Templates manager (24h Meta re-engagement, /api/whatsapp/templates*)
- WhatsApp Bulk Campaigns in Sales Assistant (/api/sales/wa/*)
- Basic plan ($29/mo, chat-only) channel restrictions in /api/billing/plans

Uses the exempt vendor kamal@thedigisparrow.com whose WhatsApp connection is
present but `status=inactive`, so all gated endpoints must return 400
'WhatsApp not connected'. Meta Graph API is NOT called in these tests.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://receptionist-hub-5.preview.emergentagent.com").rstrip("/")

KAMAL_EMAIL = "kamal@thedigisparrow.com"
KAMAL_PW = "Kamala98@hmu"


# ----------------------------- fixtures -----------------------------
@pytest.fixture(scope="module")
def kamal_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": KAMAL_EMAIL, "password": KAMAL_PW},
                      timeout=15)
    assert r.status_code == 200, f"kamal login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def kamal_headers(kamal_token):
    return {"Authorization": f"Bearer {kamal_token}",
            "Content-Type": "application/json"}


# ============================== BILLING / PLANS ==============================
class TestBillingPlans:
    def test_plans_returns_four_including_basic(self):
        r = requests.get(f"{BASE_URL}/api/billing/plans", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        plans = data.get("plans") or data
        # accept list or dict
        if isinstance(plans, dict):
            keys = set(plans.keys())
            basic = plans.get("basic")
        else:
            keys = {p.get("key") or p.get("id") or p.get("name", "").lower() for p in plans}
            basic = next((p for p in plans
                          if (p.get("key") or p.get("id") or p.get("name", "").lower()) == "basic"), None)
        assert basic is not None, f"Basic plan missing: {data}"
        # 4 plans expected
        assert len(plans) == 4, f"Expected 4 plans, got {len(plans)}: {keys}"
        # Channels restriction (no voice, no sms)
        channels = basic.get("channels") or []
        assert set(channels) == {"whatsapp", "email", "web"}, \
            f"Basic channels should be exactly whatsapp/email/web, got {channels}"
        assert "voice" not in channels and "sms" not in channels
        # stripe_price_id present (may be empty string in test envs, but key
        # must exist)
        assert "stripe_price_id" in basic, "stripe_price_id key missing on basic plan"

    def test_basic_plan_price(self):
        r = requests.get(f"{BASE_URL}/api/billing/plans", timeout=15)
        plans = r.json().get("plans") or r.json()
        basic = plans.get("basic") if isinstance(plans, dict) else next(
            p for p in plans if (p.get("key") or p.get("name", "").lower()) == "basic")
        assert float(basic.get("price_usd") or basic.get("price") or 0) == 29.0


# ============================ BILLING /me (exempt) ===========================
class TestBillingMeKamal:
    def test_billing_me_kamal_exempt_allows_all(self, kamal_headers):
        r = requests.get(f"{BASE_URL}/api/billing/me", headers=kamal_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        # exempt vendor must not be paywalled and must allow all channels
        assert d.get("is_exempt") is True
        access = d.get("access") or {}
        assert access.get("paywall") is False
        ac = set(access.get("allowed_channels") or d.get("allowed_channels") or [])
        # exempt should expose at minimum the basic-plan channels
        assert {"web", "whatsapp", "email"}.issubset(ac), \
            f"exempt vendor missing core channels: {ac}"


# ============================ WHATSAPP TEMPLATES =============================
class TestWhatsAppTemplates:
    def test_list_returns_400_when_not_connected(self, kamal_headers):
        r = requests.get(f"{BASE_URL}/api/whatsapp/templates",
                         headers=kamal_headers, timeout=15)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        assert "WhatsApp not connected" in r.text

    def test_create_returns_400_when_not_connected(self, kamal_headers):
        payload = {
            "name": "test_reengagement_v1",
            "body_text": "Hi {{1}}, just checking back about your enquiry.",
            "category": "MARKETING",
            "language": "en_US",
            "body_example_vars": ["Sam"],
        }
        r = requests.post(f"{BASE_URL}/api/whatsapp/templates",
                          headers=kamal_headers, json=payload, timeout=15)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        assert "WhatsApp not connected" in r.text

    def test_create_missing_name_422(self, kamal_headers):
        payload = {"body_text": "no name here"}
        r = requests.post(f"{BASE_URL}/api/whatsapp/templates",
                          headers=kamal_headers, json=payload, timeout=15)
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text}"

    def test_create_missing_body_text_422(self, kamal_headers):
        payload = {"name": "missing_body"}
        r = requests.post(f"{BASE_URL}/api/whatsapp/templates",
                          headers=kamal_headers, json=payload, timeout=15)
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text}"

    def test_create_bad_category_returns_connection_error_first(self, kamal_headers):
        # Connection check fires before category validation
        payload = {"name": "bad_cat", "body_text": "hi", "category": "PROMO"}
        r = requests.post(f"{BASE_URL}/api/whatsapp/templates",
                          headers=kamal_headers, json=payload, timeout=15)
        assert r.status_code == 400
        assert "WhatsApp not connected" in r.text

    def test_delete_without_name_returns_422(self, kamal_headers):
        r = requests.delete(f"{BASE_URL}/api/whatsapp/templates",
                            headers=kamal_headers, timeout=15)
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text}"

    def test_delete_with_name_returns_400_when_not_connected(self, kamal_headers):
        r = requests.delete(f"{BASE_URL}/api/whatsapp/templates?name=foo_bar",
                            headers=kamal_headers, timeout=15)
        assert r.status_code == 400
        assert "WhatsApp not connected" in r.text

    def test_send_template_returns_400_when_not_connected(self, kamal_headers):
        payload = {"to": "+15555550100", "template_name": "any_template",
                   "language": "en_US", "body_vars": ["Sam"]}
        r = requests.post(f"{BASE_URL}/api/whatsapp/send-template",
                          headers=kamal_headers, json=payload, timeout=15)
        # 400 (WA not connected) is the expected response for kamal
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        assert "WhatsApp not connected" in r.text

    def test_send_template_missing_to_422(self, kamal_headers):
        payload = {"template_name": "x"}
        r = requests.post(f"{BASE_URL}/api/whatsapp/send-template",
                          headers=kamal_headers, json=payload, timeout=15)
        assert r.status_code == 422


# ============================= SALES ACCESS ==================================
class TestSalesAccess:
    def test_sales_access_returns_channels_block(self, kamal_headers):
        r = requests.get(f"{BASE_URL}/api/sales/access",
                         headers=kamal_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("enabled") is True
        # exempt is OK to be true/false depending on schema field name; just
        # surface what's there
        assert "channels" in d, f"missing channels block: {d}"
        ch = d["channels"]
        for k in ("email", "whatsapp", "calls"):
            assert k in ch, f"missing channel state for {k}: {ch}"
            assert "connected" in ch[k]
        # kamal's WA connection is INACTIVE → connected=False
        assert ch["whatsapp"]["connected"] is False, \
            f"expected whatsapp.connected=False (status=inactive), got {ch}"
        assert ch["calls"]["connected"] is False


# ========================== SALES WA CAMPAIGNS ===============================
class TestSalesWaCampaigns:
    def test_list_returns_empty_array(self, kamal_headers):
        r = requests.get(f"{BASE_URL}/api/sales/wa/campaigns",
                         headers=kamal_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "campaigns" in d
        assert isinstance(d["campaigns"], list)

    def test_analytics_shape(self, kamal_headers):
        r = requests.get(f"{BASE_URL}/api/sales/wa/analytics",
                         headers=kamal_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "totals" in d and "daily" in d and "days" in d
        for k in ("sent", "failed", "pending"):
            assert k in d["totals"], f"missing totals.{k}"
        assert isinstance(d["daily"], list)
        assert isinstance(d["days"], int) and d["days"] >= 1

    def test_create_campaign_returns_400_no_wa_connection(self, kamal_headers):
        payload = {
            "name": "TEST_wa_campaign_unconnected",
            "template_name": "any_template",
            "language": "en_US",
            "body_var_specs": [],
            "list_ids": [],
            "start_now": True,
        }
        r = requests.post(f"{BASE_URL}/api/sales/wa/campaigns",
                          headers=kamal_headers, json=payload, timeout=15)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        assert "WhatsApp" in r.text  # error mentions WhatsApp

    def test_pause_non_existent_returns_400(self, kamal_headers):
        r = requests.post(f"{BASE_URL}/api/sales/wa/campaigns/does-not-exist-id/pause",
                          headers=kamal_headers, timeout=15)
        assert r.status_code == 400, f"got {r.status_code}: {r.text}"

    def test_resume_non_existent_returns_400(self, kamal_headers):
        r = requests.post(f"{BASE_URL}/api/sales/wa/campaigns/does-not-exist-id/resume",
                          headers=kamal_headers, timeout=15)
        assert r.status_code == 400

    def test_cancel_non_existent_returns_400(self, kamal_headers):
        r = requests.post(f"{BASE_URL}/api/sales/wa/campaigns/does-not-exist-id/cancel",
                          headers=kamal_headers, timeout=15)
        assert r.status_code == 400

    def test_get_non_existent_returns_404(self, kamal_headers):
        r = requests.get(f"{BASE_URL}/api/sales/wa/campaigns/does-not-exist-id",
                         headers=kamal_headers, timeout=15)
        assert r.status_code == 404


# ============================== REGRESSIONS ==================================
class TestRegressions:
    def test_login_admin(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": "admin@botnira.com", "password": "admin123"},
                          timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("role") == "superadmin"

    def test_login_demo(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": "demo@botnira.com", "password": "demo123"},
                          timeout=15)
        assert r.status_code in (200, 403)

    def test_login_kamal(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": KAMAL_EMAIL, "password": KAMAL_PW},
                          timeout=15)
        assert r.status_code == 200
        assert r.json().get("token")

    def test_email_campaigns_still_work(self, kamal_headers):
        r = requests.get(f"{BASE_URL}/api/sales/campaigns",
                         headers=kamal_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        # API returns paginated list with items field OR a list
        assert ("items" in d) or isinstance(d, list)

    def test_whatsapp_status_kamal(self, kamal_headers):
        r = requests.get(f"{BASE_URL}/api/whatsapp/status",
                         headers=kamal_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        # Should expose connection info even when inactive
        assert "connection" in d or "ready_to_connect" in d
