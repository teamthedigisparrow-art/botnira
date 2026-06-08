"""Iter 14 — Backend regression for WhatsApp/Email list types in Sales Assistant prospects.

Covers:
- Auto-creation of 'Inbox Leads' WhatsApp list on GET /api/sales/lists
- Creating a WhatsApp-type list (POST /api/sales/lists with list_type='whatsapp')
- WhatsApp CSV upload via /api/sales/lists/{id}/upload with dedup + warn rules
- Email list still rejects blank-email rows (unchanged contract)
- Email campaign list picker only sees email lists (filtered server-side via /api/sales/lists is
  client filtered, so we just assert list_type field is present on items so frontend can filter)
- template.csv?list_type=whatsapp returns WA header
"""
import io
import os
import time
import uuid

import pytest
import requests

def _load_base_url():
    val = os.environ.get("REACT_APP_BACKEND_URL", "")
    if not val:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        val = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    return val.rstrip("/")


BASE_URL = _load_base_url()
assert BASE_URL, "REACT_APP_BACKEND_URL missing"

VENDOR_EMAIL = "kamal@thedigisparrow.com"
VENDOR_PASSWORD = "Kamala98@hmu"

API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": VENDOR_EMAIL, "password": VENDOR_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"No token in response: {data}"
    return tok


@pytest.fixture(scope="session")
def h(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def created_lists():
    """Track created list ids for cleanup."""
    ids: list[str] = []
    yield ids


@pytest.fixture(scope="session", autouse=True)
def cleanup(h, created_lists):
    yield
    for lid in created_lists:
        try:
            requests.delete(f"{API}/sales/lists/{lid}", headers=h, timeout=15)
        except Exception:
            pass


# ---------- Lists endpoint ----------

def test_lists_endpoint_returns_list_type_and_inbox_leads(h):
    r = requests.get(f"{API}/sales/lists", headers=h, timeout=30)
    assert r.status_code == 200, r.text
    items = r.json().get("items", [])
    assert items, "No lists returned"
    for it in items:
        assert "list_type" in it, f"list_type missing on {it}"
        assert it["list_type"] in {"email", "whatsapp"}

    # Inbox Leads list must be present and be WA type
    inbox = [i for i in items if i.get("name") == "Inbox Leads"]
    assert inbox, "Inbox Leads list not auto-created"
    assert inbox[0]["list_type"] == "whatsapp"
    # active_with_phone present in counts
    assert "active_with_phone" in inbox[0].get("counts", {})


# ---------- Create WhatsApp list ----------

def test_create_whatsapp_list(h, created_lists):
    name = f"QA WA {uuid.uuid4().hex[:6]}"
    r = requests.post(f"{API}/sales/lists",
                      headers=h, json={"name": name, "list_type": "whatsapp"}, timeout=20)
    assert r.status_code == 200, r.text
    lst = r.json()["list"]
    assert lst["list_type"] == "whatsapp"
    assert lst["name"] == name
    created_lists.append(lst["id"])

    # Verify it appears in GET with WA type
    r2 = requests.get(f"{API}/sales/lists", headers=h, timeout=20)
    items = r2.json()["items"]
    found = next((i for i in items if i["id"] == lst["id"]), None)
    assert found and found["list_type"] == "whatsapp"


def test_create_invalid_list_type_rejected(h):
    r = requests.post(f"{API}/sales/lists",
                      headers=h, json={"name": "QA Bad", "list_type": "sms"}, timeout=20)
    assert r.status_code == 400


# ---------- Template.csv for WhatsApp ----------

def test_template_csv_whatsapp(h):
    r = requests.get(f"{API}/sales/prospects/template.csv?list_type=whatsapp", headers=h, timeout=20)
    assert r.status_code == 200
    txt = r.text.strip().splitlines()[0].lower()
    assert "country_code" in txt and "phone" in txt and "name" in txt
    # email column should not be in WA template
    assert "email" not in txt


def test_template_csv_email(h):
    r = requests.get(f"{API}/sales/prospects/template.csv?list_type=email", headers=h, timeout=20)
    assert r.status_code == 200
    header = r.text.strip().splitlines()[0].lower()
    assert "email" in header


# ---------- WhatsApp CSV upload: dedup, warned, missing CC ----------

@pytest.fixture(scope="session")
def wa_list(h, created_lists):
    name = f"QA WA Upload {uuid.uuid4().hex[:6]}"
    r = requests.post(f"{API}/sales/lists",
                      headers=h, json={"name": name, "list_type": "whatsapp"}, timeout=20)
    assert r.status_code == 200
    lid = r.json()["list"]["id"]
    created_lists.append(lid)
    return lid


def _upload(h, lid, csv_text):
    files = {"file": ("upload.csv", io.BytesIO(csv_text.encode("utf-8")), "text/csv")}
    return requests.post(f"{API}/sales/prospects/upload?list_id={lid}", headers=h, files=files, timeout=30)


def test_whatsapp_upload_dedup_warn_missing_cc(h, wa_list):
    unique = uuid.uuid4().hex[:6]
    # Build rows: numbers unique to this run to avoid colliding with previous test data
    n_valid = f"90{unique[:8]}"           # 10 digits
    n_dup_local = n_valid                  # same local but different cc → kept as separate lead
    n_bad_len = f"123{unique[:4]}"        # 7 digits → warned
    csv_text = (
        "name,country_code,phone\n"
        f"QA Alice,+91,{n_valid}\n"           # inserted
        f"QA Bob,,9{unique[:9]}\n"            # missing CC → invalid_skipped
        f"QA Charlie,+91,{n_valid}\n"         # duplicate of row1 in same upload → skipped
        f"QA Dave,+1,{n_dup_local}\n"         # same local, different cc → inserted (separate)
        f"QA Eve,+91,{n_bad_len}\n"           # non-10 → warned but inserted
    )
    r = _upload(h, wa_list, csv_text)
    assert r.status_code == 200, r.text
    body = r.json()
    # Server returns counts
    assert body.get("inserted", 0) >= 3, f"inserted too low: {body}"
    assert body.get("invalid_skipped", 0) >= 1, f"missing-cc not skipped: {body}"
    assert body.get("warned", 0) >= 1, f"warned count missing: {body}"

    # Re-upload same data → duplicates against DB should be skipped (dedup)
    r2 = _upload(h, wa_list, csv_text)
    assert r2.status_code == 200
    body2 = r2.json()
    assert body2.get("inserted", 0) == 0, f"second upload inserted {body2.get('inserted')} (expected 0 dedup): {body2}"

    # Verify prospects listed have no email and carry phone
    pr = requests.get(f"{API}/sales/prospects?list_id={wa_list}&limit=200", headers=h, timeout=30)
    assert pr.status_code == 200
    items = pr.json().get("items", [])
    assert items, "no prospects after WA upload"
    for it in items:
        assert (it.get("email") or "") == "", f"WA prospect carries email: {it}"
        assert it.get("phone"), f"WA prospect missing phone: {it}"


# ---------- Email list: blank email still invalid ----------

@pytest.fixture(scope="session")
def email_list(h, created_lists):
    name = f"QA Email {uuid.uuid4().hex[:6]}"
    r = requests.post(f"{API}/sales/lists",
                      headers=h, json={"name": name, "list_type": "email"}, timeout=20)
    assert r.status_code == 200
    lid = r.json()["list"]["id"]
    created_lists.append(lid)
    return lid


def test_email_upload_blank_email_rejected(h, email_list):
    unique = uuid.uuid4().hex[:8]
    csv_text = (
        "email,name,phone,company\n"
        f"qa_{unique}@example.com,QA Valid,9876543210,QAco\n"
        f",QA NoEmail,9999999999,QAco\n"
    )
    files = {"file": ("u.csv", io.BytesIO(csv_text.encode("utf-8")), "text/csv")}
    r = requests.post(f"{API}/sales/prospects/upload?list_id={email_list}", headers=h, files=files, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("inserted", 0) >= 1
    assert body.get("invalid_skipped", 0) >= 1


# ---------- WhatsApp inbound webhook captures lead ----------

def test_inbox_leads_capture_via_inbound(h):
    """capture_inbox_lead is wired into POST /api/whatsapp/webhook. We don't have signing
    keys here, so we just verify that the Inbox Leads list exists and is queryable. The
    end-to-end webhook capture is exercised by the existing test_whatsapp_templates_and_sales_wa.
    """
    r = requests.get(f"{API}/sales/lists", headers=h, timeout=20)
    items = r.json()["items"]
    inbox = next((i for i in items if i.get("name") == "Inbox Leads"), None)
    assert inbox is not None
    assert inbox["list_type"] == "whatsapp"
