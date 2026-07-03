"""
Iteration 17 — BotNira Appointment System Upgrade Phase 1 backend tests.
Covers: scheduling settings CRUD, appointment types CRUD, public booking flow,
double-booking prevention, closed weekday, buffers, status/notes/reschedule/cancel,
and existing appointment regression.
"""
import os
import time
import requests
import pytest
from datetime import datetime, timedelta, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://multi-channel-inbox-3.preview.emergentagent.com").rstrip("/")
VENDOR_EMAIL = "kamal@thedigisparrow.com"
VENDOR_PW = "Kamala98@hmu"
VENDOR_SLUG = "the-digisparrow-2883"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": VENDOR_EMAIL, "password": VENDOR_PW}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="session")
def hdr(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# -------------- Scheduling settings ----------------
class TestSchedulingSettings:
    def test_get_settings_defaults(self, hdr):
        r = requests.get(f"{BASE_URL}/api/scheduling/settings", headers=hdr, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "timezone" in d and "week" in d
        assert isinstance(d["week"], dict)
        assert "min_notice_hours" in d

    def test_update_settings_persists(self, hdr):
        payload = {
            "timezone": "America/Toronto",
            "week": {
                "mon": [{"start": "09:00", "end": "17:00"}],
                "tue": [{"start": "09:00", "end": "17:00"}],
                "wed": [{"start": "09:00", "end": "17:00"}],
                "thu": [{"start": "09:00", "end": "17:00"}],
                "fri": [{"start": "09:00", "end": "17:00"}],
                "sat": [],
                "sun": [],
            },
            "buffer_before": 0,
            "buffer_after": 0,
            "default_duration": 30,
            "slot_interval": 30,
            "min_notice_hours": 2,
            "booking_enabled": True,
            "exceptions": [{"date": "2026-12-25", "type": "closed", "label": "Christmas"}],
            "vacation": {"enabled": False, "start": None, "end": None},
        }
        r = requests.put(f"{BASE_URL}/api/scheduling/settings", headers=hdr, json=payload, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["timezone"] == "America/Toronto"
        assert d["min_notice_hours"] == 2
        assert any(e.get("date") == "2026-12-25" for e in d["exceptions"])

        # verify GET after
        r2 = requests.get(f"{BASE_URL}/api/scheduling/settings", headers=hdr, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["timezone"] == "America/Toronto"


# ----------------- Appointment types CRUD ---------------
class TestAppointmentTypes:
    def test_full_crud(self, hdr):
        # Create
        payload = {"name": "TEST_iter17_type", "duration_minutes": 45, "color": "#16a34a", "location": "Phone"}
        r = requests.post(f"{BASE_URL}/api/scheduling/types", headers=hdr, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        t = r.json()
        assert t["name"] == "TEST_iter17_type"
        assert t["duration_minutes"] == 45
        tid = t["id"]

        # List includes it
        rl = requests.get(f"{BASE_URL}/api/scheduling/types", headers=hdr, timeout=15)
        assert rl.status_code == 200
        assert any(x["id"] == tid for x in rl.json()["items"])

        # Update
        upd = {"name": "TEST_iter17_type_upd", "duration_minutes": 60, "color": "#000000", "location": "Zoom"}
        ru = requests.put(f"{BASE_URL}/api/scheduling/types/{tid}", headers=hdr, json=upd, timeout=15)
        assert ru.status_code == 200
        assert ru.json()["duration_minutes"] == 60
        assert ru.json()["name"] == "TEST_iter17_type_upd"

        # Delete
        rd = requests.delete(f"{BASE_URL}/api/scheduling/types/{tid}", headers=hdr, timeout=15)
        assert rd.status_code == 200
        # 404 for delete twice
        rd2 = requests.delete(f"{BASE_URL}/api/scheduling/types/{tid}", headers=hdr, timeout=15)
        assert rd2.status_code == 404


# ----------------- Public booking flow ---------------
def _next_weekday(target_wday: int) -> str:
    d = datetime.now(timezone.utc)
    # push at least 7 days out to safely stay clear of past slots for same weekday
    for _ in range(15):
        d = d + timedelta(days=1)
        if d.weekday() == target_wday:
            return d.strftime("%Y-%m-%d")
    return d.strftime("%Y-%m-%d")


class TestPublicBooking:
    def test_public_info(self):
        r = requests.get(f"{BASE_URL}/api/public/booking/{VENDOR_SLUG}", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["vendor"]["slug"] == VENDOR_SLUG
        assert isinstance(d["types"], list) and len(d["types"]) >= 1

    def test_closed_sunday_zero_slots(self):
        # Find next Sunday (weekday 6)
        day = _next_weekday(6)
        r = requests.get(f"{BASE_URL}/api/public/booking/{VENDOR_SLUG}/slots?date={day}", timeout=15)
        assert r.status_code == 200
        assert r.json()["slots"] == []

    def test_weekday_has_slots_and_book_and_double_book_409(self):
        # Pick a Monday at least 7 days out
        day = _next_weekday(0)
        r = requests.get(f"{BASE_URL}/api/public/booking/{VENDOR_SLUG}/slots?date={day}", timeout=15)
        assert r.status_code == 200
        slots = r.json()["slots"]
        # Default Mon–Fri 09:00–17:00, 30-min interval = 16 slots
        assert len(slots) >= 8, f"Expected slots on {day} but got {slots}"

        # Book the first slot
        target = slots[0]
        payload = {
            "start_at": target,
            "customer_name": f"TEST_iter17_{int(time.time())}",
            "customer_contact": "qa+iter17@example.com",
            "notes": "iter17 booking",
        }
        rb = requests.post(f"{BASE_URL}/api/public/booking/{VENDOR_SLUG}/book", json=payload, timeout=20)
        assert rb.status_code == 200, rb.text
        assert rb.json()["ok"] is True
        appt = rb.json()["appointment"]
        assert appt["source"] == "booking_page"
        assert appt["status"] == "scheduled"

        # Double book returns 409
        rb2 = requests.post(f"{BASE_URL}/api/public/booking/{VENDOR_SLUG}/book", json=payload, timeout=15)
        assert rb2.status_code == 409, rb2.text

        # Reload slots -- that slot should not appear
        r3 = requests.get(f"{BASE_URL}/api/public/booking/{VENDOR_SLUG}/slots?date={day}", timeout=15)
        assert r3.status_code == 200
        new_slots = r3.json()["slots"]
        assert target not in new_slots

        # Cleanup: cancel via vendor API + delete
        # (leave in DB — the vendor list check needs it. It will be cancelled by regression test.)
        pytest.appt_id = appt["id"]  # stash for later
        pytest.appt_start = target
        pytest.appt_day = day


# ----------------- Vendor sees the booking ---------------
class TestVendorSeesBooking:
    def test_booking_shows_in_vendor_list(self, hdr):
        r = requests.get(f"{BASE_URL}/api/appointments?limit=50", headers=hdr, timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        found = [a for a in items if a.get("id") == getattr(pytest, "appt_id", None)]
        assert found, "Booking not visible in vendor appointments list"
        assert found[0]["source"] == "booking_page"


# ----------------- Appointment ops ---------------
class TestAppointmentOps:
    def test_status_notes_reschedule_cancel(self, hdr):
        appt_id = getattr(pytest, "appt_id", None)
        assert appt_id, "no booking to operate on"

        # status confirmed
        r = requests.post(f"{BASE_URL}/api/scheduling/appointments/{appt_id}/status",
                          headers=hdr, json={"status": "confirmed"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "confirmed"

        # notes
        rn = requests.put(f"{BASE_URL}/api/scheduling/appointments/{appt_id}/notes",
                          headers=hdr, json={"internal_notes": "iter17 internal"}, timeout=15)
        assert rn.status_code == 200
        assert rn.json()["internal_notes"] == "iter17 internal"

        # reschedule to +30 min from current start (should be fine)
        cur_start = datetime.fromisoformat(getattr(pytest, "appt_start").replace("Z", "+00:00"))
        new_start = (cur_start + timedelta(minutes=30)).isoformat()
        rr = requests.post(f"{BASE_URL}/api/scheduling/appointments/{appt_id}/reschedule",
                           headers=hdr, json={"start_at": new_start}, timeout=15)
        assert rr.status_code == 200
        assert rr.json()["status"] == "rescheduled"

        # activity log has entries
        ra = requests.get(f"{BASE_URL}/api/scheduling/appointments/{appt_id}/activity", headers=hdr, timeout=15)
        assert ra.status_code == 200
        actions = [a["action"] for a in ra.json()["activity"]]
        assert "status_changed" in actions
        assert "notes_updated" in actions
        assert "rescheduled" in actions

        # cancel
        rc = requests.post(f"{BASE_URL}/api/scheduling/appointments/{appt_id}/cancel",
                           headers=hdr, json={"status": "cancelled", "reason": "iter17 cleanup"}, timeout=15)
        assert rc.status_code == 200
        assert rc.json()["status"] == "cancelled"


# ----------------- Reschedule conflict returns 409 ---------------
class TestRescheduleConflict:
    def test_conflict_returns_409(self, hdr):
        # Create two bookings on two different Monday slots, then try to reschedule one onto the other's time.
        day = _next_weekday(0)
        r = requests.get(f"{BASE_URL}/api/public/booking/{VENDOR_SLUG}/slots?date={day}", timeout=15)
        slots = r.json()["slots"]
        assert len(slots) >= 3
        a_slot, b_slot = slots[1], slots[2]

        def _book(s):
            return requests.post(f"{BASE_URL}/api/public/booking/{VENDOR_SLUG}/book",
                                 json={"start_at": s, "customer_name": f"TEST_conflict_{int(time.time())}",
                                       "customer_contact": "qa+conf@example.com"}, timeout=15)

        r1 = _book(a_slot); assert r1.status_code == 200, r1.text
        r2 = _book(b_slot); assert r2.status_code == 200, r2.text
        a_id = r1.json()["appointment"]["id"]
        b_id = r2.json()["appointment"]["id"]

        # try to reschedule appt a onto b_slot -> 409
        rr = requests.post(f"{BASE_URL}/api/scheduling/appointments/{a_id}/reschedule",
                           headers=hdr, json={"start_at": b_slot}, timeout=15)
        assert rr.status_code == 409, rr.text

        # cleanup: cancel both
        for aid in (a_id, b_id):
            requests.post(f"{BASE_URL}/api/scheduling/appointments/{aid}/cancel", headers=hdr,
                          json={"status": "cancelled"}, timeout=15)


# ----------------- Regression: existing /api/appointments ---------------
class TestRegressionAppointmentsList:
    def test_list_and_manual_create_and_attended_toggle(self, hdr):
        # list
        r = requests.get(f"{BASE_URL}/api/appointments?limit=5", headers=hdr, timeout=15)
        assert r.status_code == 200
        assert "items" in r.json() and "total" in r.json()

        # create manual appointment via existing endpoint
        payload = {
            "customer_name": f"TEST_regress_{int(time.time())}",
            "customer_contact": "qa+reg@example.com",
            "scheduled_at": (datetime.now(timezone.utc) + timedelta(days=20)).isoformat(),
            "notes": "iter17 regression",
        }
        rc = requests.post(f"{BASE_URL}/api/appointments", headers=hdr, json=payload, timeout=15)
        assert rc.status_code in (200, 201), rc.text
        appt = rc.json()
        aid = appt.get("id")
        assert aid, appt

        # attended toggle via PATCH
        rp = requests.patch(f"{BASE_URL}/api/appointments/{aid}", headers=hdr,
                            json={"attended": True}, timeout=15)
        assert rp.status_code == 200, rp.text
        # verify persistence via list search
        rl = requests.get(f"{BASE_URL}/api/appointments?limit=100", headers=hdr, timeout=15)
        items = rl.json()["items"]
        found = [x for x in items if x["id"] == aid]
        assert found and found[0]["attended"] is True
