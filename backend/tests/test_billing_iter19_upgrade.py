"""Iter 19 — Bug fix regression: startup_stripe() is now registered as FastAPI startup event.

Verify:
1. GET /api/billing/plans returns 4 plans + 6 topups, each with non-null stripe_price_id.
2. Fresh trial vendor can POST /api/billing/checkout/subscription for each plan and get
   a Stripe checkout URL back (200, no 503 "Plan price not provisioned yet").
3. Same for POST /api/billing/checkout/topup.
4. Auth /me still exposes plan_label + trial state so Billing page renders regression-clean.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://sales-automation-89.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ORIGIN = BASE_URL


def h(t): return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def trial_vendor(http):
    """Create a fresh trial vendor via signup."""
    suffix = uuid.uuid4().hex[:8]
    email = f"billing_qa+{suffix}@example.com"
    r = http.post(f"{API}/auth/signup", json={
        "email": email,
        "password": "Test1234!",
        "full_name": "QA Billing",
        "business_name": f"QA Co {suffix}",
    }, timeout=30)
    assert r.status_code == 200, f"signup failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data, f"no token in signup response: {data}"
    return {"email": email, "token": data["token"], "vendor_id": data.get("vendor_id")}


# ---------------- Plans public ----------------
def test_plans_all_stripe_price_ids_populated(http):
    r = http.get(f"{API}/billing/plans", timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert len(d["plans"]) == 4, f"expected 4 plans, got {len(d['plans'])}"
    assert len(d["topups"]) == 6
    for p in d["plans"]:
        assert p.get("stripe_price_id"), f"Plan {p['id']} missing stripe_price_id"
        assert p["stripe_price_id"].startswith("price_"), f"Plan {p['id']} bad price id: {p['stripe_price_id']}"
    for t in d["topups"]:
        assert t.get("stripe_price_id"), f"Topup {t['id']} missing stripe_price_id"
        assert t["stripe_price_id"].startswith("price_"), f"Topup {t['id']} bad price id"


# ---------------- Subscription checkout for each plan ----------------
@pytest.mark.parametrize("plan_id", ["basic", "starter", "growth", "pro"])
def test_checkout_subscription_returns_stripe_url(http, trial_vendor, plan_id):
    r = http.post(
        f"{API}/billing/checkout/subscription",
        json={"plan": plan_id, "origin_url": ORIGIN},
        headers=h(trial_vendor["token"]),
        timeout=30,
    )
    # Must NOT be the 503 "Plan price not provisioned yet"
    assert r.status_code != 503, f"[{plan_id}] REGRESSION: 503 Plan price not provisioned! body={r.text}"
    assert r.status_code == 200, f"[{plan_id}] status={r.status_code} body={r.text}"
    body = r.json()
    assert "url" in body, f"[{plan_id}] no url in response: {body}"
    assert "checkout.stripe.com" in body["url"], f"[{plan_id}] not a stripe checkout url: {body['url']}"


# ---------------- Topup checkout ----------------
@pytest.mark.parametrize("pack_id", ["spark", "boost", "rocket"])
def test_checkout_topup_returns_stripe_url(http, trial_vendor, pack_id):
    r = http.post(
        f"{API}/billing/checkout/topup",
        json={"pack": pack_id, "origin_url": ORIGIN},
        headers=h(trial_vendor["token"]),
        timeout=30,
    )
    assert r.status_code != 503, f"[{pack_id}] REGRESSION: 503 Plan price not provisioned! body={r.text}"
    assert r.status_code == 200, f"[{pack_id}] status={r.status_code} body={r.text}"
    body = r.json()
    assert "url" in body
    assert "checkout.stripe.com" in body["url"], f"[{pack_id}] not a stripe URL: {body['url']}"


# ---------------- Regression: /billing/me & /auth/me still render trial info ----------------
def test_billing_me_shows_trial(http, trial_vendor):
    r = http.get(f"{API}/billing/me", headers=h(trial_vendor["token"]), timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("plan") == "trial"
    assert d.get("subscription_status") == "trialing"
    a = d.get("access", d)
    assert "trial_days_left" in a
    assert a.get("trial_days_left", 0) >= 0


def test_auth_me_has_access_block(http, trial_vendor):
    r = http.get(f"{API}/auth/me", headers=h(trial_vendor["token"]), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "access" in d
    a = d["access"]
    assert a.get("trial") is True
    assert a.get("is_exempt") is False
    assert "plan_label" in a
