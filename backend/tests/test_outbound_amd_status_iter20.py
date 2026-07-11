"""Iter 20 — BotNira outbound voicemail (AMD) hang-up + status callback regression.

Bugs under test:
  1) Voicemail hang-up: /api/sales/outbound/amd/{cid} form-encoded with
     AnsweredBy=machine_start (or machine_end_beep) must set the matching
     campaign_calls doc outcome='voicemail' and return {ok:true}. With
     AnsweredBy=human it must NOT change outcome. These are PUBLIC Twilio
     webhooks — no auth header. Bodies are application/x-www-form-urlencoded.

  2) Status callback respects voicemail: after AMD flagged voicemail, POSTing
     /status/{cid} with CallStatus=completed CallDuration=8 (no AnsweredBy)
     must keep outcome='voicemail' (NOT flip to 'answered'), and MUST NOT
     enqueue an AI summary.

  3) Status callback normal answered: fresh call, CallStatus=completed
     CallDuration=60 AnsweredBy=human → outcome='answered', minutes=1.0,
     and (since kamal is exempt) NO minutes deduction.

  4) TwiML endpoint: existing call_records → <Connect>+<Stream> pointing at
     /api/voice/stream/{cid}. Unknown cid → <Say>+<Hangup/>, no <Stream>.

  5) Regression: existing campaign endpoints still work — POST /campaigns
     (draft), GET /dashboard, GET /campaigns all 200 for vendor. IMPORTANT:
     never call /launch (would place REAL phone calls).

Vendor: kamal@thedigisparrow.com / Kamala98@hmu (exempt, Growth/Pro, has a
provisioned voice number).
"""
import os
import time
import uuid
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

# Load backend env for MONGO_URL + DB_NAME (do NOT hardcode).
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to reading from frontend/.env directly (protected var)
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                break

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")

VENDOR_EMAIL = "kamal@thedigisparrow.com"
VENDOR_PASSWORD = "Kamala98@hmu"

# =============================================================== fixtures ===

@pytest.fixture(scope="module")
def db():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    cli.close()


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": VENDOR_EMAIL, "password": VENDOR_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    assert "token" in data or "access_token" in data, data
    return data.get("token") or data.get("access_token")


@pytest.fixture(scope="module")
def vendor_id(token, db):
    # Prefer /auth/me to derive vendor_id, else look up by email
    r = requests.get(
        f"{BASE_URL}/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    if r.status_code == 200:
        me = r.json()
        vid = me.get("vendor_id") or (me.get("vendor") or {}).get("id")
        if vid:
            return vid
    v = db.vendors.find_one({"email": VENDOR_EMAIL}, {"id": 1})
    assert v and v.get("id"), "cannot resolve kamal vendor_id"
    return v["id"]


@pytest.fixture()
def synthetic_call(db, vendor_id):
    """Insert synthetic call_records + campaign_calls docs; cleanup after test."""
    cid = f"TEST_{uuid.uuid4().hex[:16]}"
    camp_id = f"TEST_camp_{uuid.uuid4().hex[:10]}"
    pp = f"TEST_pp_{uuid.uuid4().hex[:10]}"
    db.call_records.insert_one({
        "id": cid, "vendor_id": vendor_id, "direction": "outbound",
        "campaign_id": camp_id, "campaign_prospect_id": pp,
        "to_number": "+14165550123", "from_number": "+14165550100",
        "call_sid": "CAtest_" + cid[-8:], "status": "in-progress",
        "started_at": "2026-01-01T00:00:00Z", "minutes": 0.0,
    })
    db.campaign_calls.insert_one({
        "id": cid, "vendor_id": vendor_id, "campaign_id": camp_id,
        "campaign_prospect_id": pp, "prospect_id": None, "phone": "+14165550123",
        "attempt_no": 1, "status": "in-progress", "outcome": None,
        "minutes": 0.0, "duration_sec": 0, "started_at": "2026-01-01T00:00:00Z",
    })
    yield {"call_id": cid, "campaign_id": camp_id, "cp_id": pp}
    # cleanup
    db.call_records.delete_many({"id": cid})
    db.campaign_calls.delete_many({"id": cid})
    db.call_ai_summaries.delete_many({"call_id": cid})


# =========================================================== AMD webhook ===

class TestAMDVoicemail:
    """PUBLIC form-encoded AMD webhook — must flag voicemail on machine_start."""

    def _post_amd(self, call_id, answered_by):
        return requests.post(
            f"{BASE_URL}/api/sales/outbound/amd/{call_id}",
            data={"AnsweredBy": answered_by, "CallSid": "CAtest_amd"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15,
        )

    def test_amd_machine_start_sets_voicemail(self, synthetic_call, db):
        r = self._post_amd(synthetic_call["call_id"], "machine_start")
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}
        cc = db.campaign_calls.find_one({"id": synthetic_call["call_id"]})
        assert cc["outcome"] == "voicemail", f"expected voicemail, got {cc.get('outcome')}"

    def test_amd_machine_end_beep_sets_voicemail(self, synthetic_call, db):
        r = self._post_amd(synthetic_call["call_id"], "machine_end_beep")
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}
        cc = db.campaign_calls.find_one({"id": synthetic_call["call_id"]})
        assert cc["outcome"] == "voicemail"

    def test_amd_fax_sets_voicemail(self, synthetic_call, db):
        r = self._post_amd(synthetic_call["call_id"], "fax")
        assert r.status_code == 200, r.text
        cc = db.campaign_calls.find_one({"id": synthetic_call["call_id"]})
        assert cc["outcome"] == "voicemail"

    def test_amd_human_does_not_flag_voicemail(self, synthetic_call, db):
        r = self._post_amd(synthetic_call["call_id"], "human")
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}
        cc = db.campaign_calls.find_one({"id": synthetic_call["call_id"]})
        assert cc.get("outcome") in (None, "answered"), f"human must not set voicemail, got {cc.get('outcome')}"
        # explicitly should not be voicemail
        assert cc.get("outcome") != "voicemail"

    def test_amd_unknown_call_still_returns_ok(self, db):
        r = requests.post(
            f"{BASE_URL}/api/sales/outbound/amd/DOES_NOT_EXIST_{uuid.uuid4().hex[:6]}",
            data={"AnsweredBy": "machine_start"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json() == {"ok": True}


# ======================================================== status webhook ===

class TestStatusCallback:
    """Status callback must respect a prior voicemail flag and correctly finalize
    normal answered calls."""

    def _post_status(self, call_id, form):
        return requests.post(
            f"{BASE_URL}/api/sales/outbound/status/{call_id}",
            data=form,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=20,
        )

    def test_status_completed_preserves_voicemail_no_ai_summary(self, synthetic_call, db):
        cid = synthetic_call["call_id"]
        # 1) First, AMD flags voicemail
        r_amd = requests.post(
            f"{BASE_URL}/api/sales/outbound/amd/{cid}",
            data={"AnsweredBy": "machine_start"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15,
        )
        assert r_amd.status_code == 200
        assert db.campaign_calls.find_one({"id": cid})["outcome"] == "voicemail"

        # 2) Then Twilio posts completed with NO AnsweredBy, duration 8s
        r = self._post_status(cid, {"CallStatus": "completed", "CallDuration": "8"})
        assert r.status_code == 200, r.text

        # 3) Assert: outcome stays voicemail, status=completed, minutes≈0.13
        cc = db.campaign_calls.find_one({"id": cid})
        assert cc["outcome"] == "voicemail", (
            f"CRITICAL: voicemail was overwritten to {cc.get('outcome')} — "
            "bug fix regression: /status must preserve prior voicemail flag")
        assert cc["status"] == "completed"
        assert abs(float(cc.get("minutes", 0)) - 0.13) < 0.01, cc.get("minutes")

        # 4) No AI summary should be created (AI runs only on outcome=='answered')
        # Give the fire-and-forget task ample time to (not) run.
        time.sleep(2)
        summary = db.call_ai_summaries.find_one({"call_id": cid})
        assert summary is None, f"AI summary must NOT run for voicemail, found: {summary}"

    def test_status_completed_normal_answered(self, synthetic_call, db, vendor_id):
        cid = synthetic_call["call_id"]
        # snapshot vendor minutes (exempt → no change expected)
        v_before = db.vendors.find_one({"id": vendor_id}, {"minutes_balance": 1, "is_exempt": 1})
        was_exempt = bool(v_before.get("is_exempt"))
        mins_before = float(v_before.get("minutes_balance", 0.0))

        r = self._post_status(cid, {
            "CallStatus": "completed", "CallDuration": "60", "AnsweredBy": "human",
        })
        assert r.status_code == 200, r.text
        cc = db.campaign_calls.find_one({"id": cid})
        assert cc["outcome"] == "answered", cc.get("outcome")
        assert cc["status"] == "completed"
        assert abs(float(cc.get("minutes", 0)) - 1.0) < 0.01, cc.get("minutes")
        assert int(cc.get("duration_sec", 0)) == 60

        # kamal is exempt → minutes_balance must NOT be decremented
        v_after = db.vendors.find_one({"id": vendor_id}, {"minutes_balance": 1})
        mins_after = float(v_after.get("minutes_balance", 0.0))
        if was_exempt:
            assert mins_after == mins_before, (
                f"exempt vendor minutes changed: {mins_before} -> {mins_after}")

    def test_status_progress_states_just_update_status(self, synthetic_call, db):
        cid = synthetic_call["call_id"]
        for st in ("initiated", "ringing", "in-progress"):
            r = self._post_status(cid, {"CallStatus": st})
            assert r.status_code == 200
        cc = db.campaign_calls.find_one({"id": cid})
        assert cc["status"] == "in-progress"
        assert cc.get("outcome") in (None,)  # unchanged

    def test_status_no_answer_maps_to_no_answer(self, synthetic_call, db):
        cid = synthetic_call["call_id"]
        r = self._post_status(cid, {"CallStatus": "no-answer"})
        assert r.status_code == 200
        cc = db.campaign_calls.find_one({"id": cid})
        assert cc["outcome"] == "no_answer"
        assert cc["status"] == "completed"

    def test_status_busy_maps_to_busy(self, synthetic_call, db):
        cid = synthetic_call["call_id"]
        r = self._post_status(cid, {"CallStatus": "busy"})
        assert r.status_code == 200
        cc = db.campaign_calls.find_one({"id": cid})
        assert cc["outcome"] == "busy"


# ============================================================ TwiML ===

class TestTwiML:
    """POST /twiml/{cid} — public, returns XML."""

    def test_twiml_known_call_returns_stream(self, synthetic_call):
        cid = synthetic_call["call_id"]
        r = requests.post(
            f"{BASE_URL}/api/sales/outbound/twiml/{cid}",
            data={},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert "xml" in r.headers.get("content-type", "").lower()
        body = r.text
        assert "<Connect>" in body, body
        assert "<Stream" in body, body
        assert f"/api/voice/stream/{cid}" in body, body
        assert "<Hangup" not in body

    def test_twiml_unknown_call_returns_hangup(self):
        bogus = f"NO_SUCH_{uuid.uuid4().hex[:8]}"
        r = requests.post(
            f"{BASE_URL}/api/sales/outbound/twiml/{bogus}",
            data={},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.text
        assert "<Say" in body, body
        assert "<Hangup" in body, body
        assert "<Stream" not in body, body


# ====================================================== Regression ===

class TestCampaignRegression:
    """Existing campaign endpoints (no launch) still work for vendor."""

    def test_dashboard_200(self, token):
        r = requests.get(
            f"{BASE_URL}/api/sales/outbound/dashboard",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "campaigns" in data and "calls" in data
        assert isinstance(data.get("voice_minutes_remaining"), (int, float))

    def test_list_campaigns_200(self, token):
        r = requests.get(
            f"{BASE_URL}/api/sales/outbound/campaigns",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert "items" in r.json()

    def test_create_and_delete_draft_campaign(self, token, db):
        # Create draft (no launch — do NOT place real calls)
        payload = {
            "name": f"TEST_iter20_{uuid.uuid4().hex[:6]}",
            "description": "iter20 regression — DO NOT LAUNCH",
            "list_ids": [], "industry": "Dental Clinic",
            "goal": "book_appointment", "goal_custom": "",
            "script": "Hello, this is a test.", "language": "English",
            "voice": {"gender": "female", "tone": "Friendly"},
            "business_hours": {"days": [0, 1, 2, 3, 4], "open": "09:00", "close": "17:00", "timezone": "America/Toronto"},
            "daily_limit": 50,
            "retry": {"on_no_answer": True, "on_busy": True, "on_voicemail": False,
                      "max_attempts": 2, "retry_after": "2h", "retry_after_minutes": None},
        }
        r = requests.post(
            f"{BASE_URL}/api/sales/outbound/campaigns",
            headers={"Authorization": f"Bearer {token}"},
            json=payload, timeout=15,
        )
        assert r.status_code == 200, r.text
        created = r.json()
        assert created.get("status") == "draft"
        assert created.get("id"), created
        cid = created["id"]
        try:
            # verify via GET
            r2 = requests.get(
                f"{BASE_URL}/api/sales/outbound/campaigns/{cid}",
                headers={"Authorization": f"Bearer {token}"},
                timeout=15,
            )
            assert r2.status_code == 200
            assert r2.json().get("status") == "draft"
        finally:
            # cleanup (delete endpoint)
            rd = requests.delete(
                f"{BASE_URL}/api/sales/outbound/campaigns/{cid}",
                headers={"Authorization": f"Bearer {token}"},
                timeout=15,
            )
            assert rd.status_code == 200, rd.text
            # verify gone in db
            assert db.campaign_out.find_one({"id": cid}) is None
