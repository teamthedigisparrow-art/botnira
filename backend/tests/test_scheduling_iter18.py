"""Iter 18 backend tests — BotNira Phase 4 (email reminders persistence) and
Phase 5 (AI receptionist availability guard: no overbooking / no out-of-hours
bookings). Also regression on scheduling settings + appointment types + public
booking page + AI slot bookable helper.

Uses pymongo (sync) for DB verification/cleanup to avoid motor event-loop
lifecycle problems across multiple asyncio.run() invocations.
"""
import os
import sys
import asyncio
import pytest
import requests
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://sales-automation-89.preview.emergentagent.com").rstrip("/")
VENDOR_EMAIL = "kamal@thedigisparrow.com"
VENDOR_PASSWORD = "Kamala98@hmu"

sys.path.insert(0, "/app/backend")

# ------------------------------ fixtures --------------------------------------
@pytest.fixture(scope="session")
def login():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": VENDOR_EMAIL, "password": VENDOR_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture()
def hdr(login):
    return {"Authorization": f"Bearer {login['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def vendor_id(login):
    return login["vendor_id"]


@pytest.fixture(scope="session")
def sync_db():
    """pymongo sync client — separate from motor to avoid loop issues."""
    # Read .env directly since we're outside the FastAPI process
    mongo_url = "mongodb://localhost:27017"
    db_name = "test_database"
    try:
        # Best-effort: parse backend/.env
        with open("/app/backend/.env") as f:
            for line in f:
                if line.startswith("MONGO_URL="):
                    mongo_url = line.split("=", 1)[1].strip().strip('"').strip("'")
                if line.startswith("DB_NAME="):
                    db_name = line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    client = MongoClient(mongo_url)
    return client[db_name]


# ------------------------------ Phase 4: reminders persistence ---------------
class TestRemindersPersistence:
    def test_get_settings_returns_reminders(self, hdr):
        r = requests.get(f"{BASE_URL}/api/scheduling/settings", headers=hdr, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "reminders" in data
        rem = data["reminders"]
        assert "email_enabled" in rem
        assert "offsets_hours" in rem
        assert isinstance(rem["offsets_hours"], list)

    def test_put_reminders_persists(self, hdr):
        payload = {"reminders": {"email_enabled": True, "offsets_hours": [24, 2]}}
        r = requests.put(f"{BASE_URL}/api/scheduling/settings",
                         json=payload, headers=hdr, timeout=15)
        assert r.status_code == 200
        got = r.json()["reminders"]
        assert got["email_enabled"] is True
        assert sorted(got["offsets_hours"]) == [2, 24]

        r2 = requests.get(f"{BASE_URL}/api/scheduling/settings", headers=hdr, timeout=15)
        assert r2.status_code == 200
        rem2 = r2.json()["reminders"]
        assert rem2["email_enabled"] is True
        assert sorted(rem2["offsets_hours"]) == [2, 24]

    def test_put_reminders_toggle_off_persists(self, hdr):
        payload = {"reminders": {"email_enabled": False, "offsets_hours": [48, 12, 1]}}
        r = requests.put(f"{BASE_URL}/api/scheduling/settings",
                         json=payload, headers=hdr, timeout=15)
        assert r.status_code == 200
        rem = r.json()["reminders"]
        assert rem["email_enabled"] is False
        assert sorted(rem["offsets_hours"]) == [1, 12, 48]

        r2 = requests.get(f"{BASE_URL}/api/scheduling/settings", headers=hdr, timeout=15)
        rem2 = r2.json()["reminders"]
        assert rem2["email_enabled"] is False
        assert sorted(rem2["offsets_hours"]) == [1, 12, 48]

    def test_put_reminders_restore_defaults(self, hdr):
        payload = {"reminders": {"email_enabled": True, "offsets_hours": [24]}}
        r = requests.put(f"{BASE_URL}/api/scheduling/settings",
                         json=payload, headers=hdr, timeout=15)
        assert r.status_code == 200
        rem = r.json()["reminders"]
        assert rem["email_enabled"] is True
        assert rem["offsets_hours"] == [24]


# ------------------------------ Phase 5: AI slot guard (direct) --------------
# Use one asyncio.run per test — cleanup uses pymongo to avoid motor loop reuse.
class TestSlotGuardDirect:
    def test_direct_guard_out_of_hours_and_free(self, vendor_id):
        import server as srv  # noqa: F401  — import first to break circular
        import scheduling_routes as sr  # imports and binds motor to THIS loop
        async def _run():
            free = await sr.is_ai_slot_bookable(vendor_id, "2026-07-06T11:00")
            weekend = await sr.is_ai_slot_bookable(vendor_id, "2026-07-05T11:00")
            night = await sr.is_ai_slot_bookable(vendor_id, "2026-07-06T03:00")
            return free, weekend, night
        free, weekend, night = asyncio.run(_run())
        assert weekend["ok"] is False and weekend["reason"] == "outside_hours"
        assert night["ok"] is False and night["reason"] == "outside_hours"
        # free must not be flagged outside_hours
        assert free["reason"] != "outside_hours"

    def test_direct_guard_conflict(self, vendor_id, sync_db):
        # 1. seed a blocking appt via pymongo
        # Reset motor client to a fresh event-loop-agnostic instance so this
        # async test can safely use asyncio.run() after previous tests already
        # created & closed loops.
        import server as srv
        from motor.motor_asyncio import AsyncIOMotorClient
        srv.client = AsyncIOMotorClient(srv.MONGO_URL)
        srv.db = srv.client[srv.DB_NAME]

        tz = ZoneInfo("America/Toronto")
        start_local = datetime(2026, 8, 3, 15, 0, tzinfo=tz)
        start_utc = start_local.astimezone(timezone.utc)
        end_utc = start_utc + timedelta(minutes=30)
        appt_doc = {
            "id": "TEST_iter18_guard_appt",
            "vendor_id": vendor_id,
            "customer_name": "TEST_iter18_guard",
            "customer_contact": "",
            "scheduled_at": start_utc.isoformat(),
            "start_at": start_utc.isoformat(),
            "end_at": end_utc.isoformat(),
            "duration_minutes": 30,
            "status": "scheduled",
            "source": "test",
            "attended": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        sync_db.appointments.delete_many({"id": "TEST_iter18_guard_appt"})
        sync_db.appointments.insert_one(dict(appt_doc))
        try:
            import server as srv2  # noqa
            import scheduling_routes as sr
            async def _run():
                return await sr.is_ai_slot_bookable(vendor_id, "2026-08-03T15:00")
            verdict = asyncio.run(_run())
            assert verdict["ok"] is False, f"guard should block: {verdict}"
            assert verdict["reason"] == "conflict"
        finally:
            sync_db.appointments.delete_many({"id": "TEST_iter18_guard_appt"})


# ------------------------------ Phase 5: chat path can't double-book --------
class TestChatBookingGuardE2E:
    """Directly invoke server._maybe_book_appointment against a canned
    transcript, then verify DB via pymongo. Each test uses ONE asyncio.run for
    the entire book flow so motor's event loop is stable within the run.
    """

    def _cleanup(self, sync_db, vendor_id):
        sync_db.appointments.delete_many({
            "vendor_id": vendor_id,
            "customer_name": {"$regex": "^TEST_iter18_"},
        })
        sync_db.conversations.delete_many({
            "vendor_id": vendor_id, "customer_name": {"$regex": "^TEST_iter18_"}
        })
        sync_db.messages.delete_many({"content": {"$regex": "TEST_iter18_"}})

    def _seed_chat(self, sync_db, vendor_id, conv_id, naive_local_str, contact):
        from uuid import uuid4
        now = datetime.now(timezone.utc).isoformat()
        sync_db.conversations.insert_one({
            "id": conv_id,
            "vendor_id": vendor_id,
            "channel": "web",
            "customer_name": "TEST_iter18_user",
            "customer_contact": contact,
            "status": "open",
            "last_message_preview": "",
            "created_at": now,
            "updated_at": now,
        })
        user_msg = f"Hi, please book me on {naive_local_str}. My name is TEST_iter18_user, email {contact}."
        bot_reply = (
            f"Your appointment is confirmed for {naive_local_str} for TEST_iter18_user "
            f"({contact}). See you then!"
        )
        for role, content in [("user", user_msg), ("bot", bot_reply)]:
            sync_db.messages.insert_one({
                "id": str(uuid4()),
                "conversation_id": conv_id,
                "vendor_id": vendor_id,
                "role": role,
                "content": content,
                "created_at": now,
            })
        return bot_reply

    def test_out_of_hours_never_persists(self, vendor_id, sync_db):
        self._cleanup(sync_db, vendor_id)
        try:
            from uuid import uuid4
            conv_id = f"TEST_iter18_conv_{uuid4().hex[:8]}"
            naive = "2026-07-12T11:00"  # Sunday
            bot_reply = self._seed_chat(sync_db, vendor_id, conv_id, naive, "TEST_iter18_a@example.com")

            import server as srv
            async def _run():
                try:
                    return await srv._maybe_book_appointment(vendor_id, conv_id, bot_reply)
                except Exception as e:
                    return {"err": str(e)}
            asyncio.run(_run())

            # Verify NO appointment persisted for Sunday for our test user
            appts = list(sync_db.appointments.find({
                "vendor_id": vendor_id,
                "customer_name": {"$regex": "TEST_iter18_"},
            }))
            for a in appts:
                sched = (a.get("scheduled_at") or a.get("start_at") or "")
                assert "2026-07-12" not in sched, f"Sunday appt persisted: {a}"
        finally:
            self._cleanup(sync_db, vendor_id)

    def test_double_book_never_persists(self, vendor_id, sync_db):
        self._cleanup(sync_db, vendor_id)
        try:
            from uuid import uuid4
            # Seed a blocking appt at Mon Jul 6 2026 14:00 Toronto (=18:00 UTC)
            tz = ZoneInfo("America/Toronto")
            start_local = datetime(2026, 7, 6, 14, 0, tzinfo=tz)
            start_utc = start_local.astimezone(timezone.utc)
            end_utc = start_utc + timedelta(minutes=30)
            sync_db.appointments.insert_one({
                "id": "TEST_iter18_blocker",
                "vendor_id": vendor_id,
                "customer_name": "TEST_iter18_blocker_user",
                "customer_contact": "",
                "scheduled_at": start_utc.isoformat(),
                "start_at": start_utc.isoformat(),
                "end_at": end_utc.isoformat(),
                "duration_minutes": 30,
                "status": "scheduled",
                "source": "test",
                "attended": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

            # Attempt AI booking at the SAME time via the extractor path
            conv_id = f"TEST_iter18_conv_{uuid4().hex[:8]}"
            bot_reply = self._seed_chat(
                sync_db, vendor_id, conv_id,
                "2026-07-06T14:00", "TEST_iter18_double@example.com"
            )
            import server as srv
            async def _run():
                try:
                    return await srv._maybe_book_appointment(vendor_id, conv_id, bot_reply)
                except Exception as e:
                    return {"err": str(e)}
            asyncio.run(_run())

            # Ensure no additional appt was created at that overlapping time
            # (ignore cancelled/no_show — only blocking statuses count)
            appts = list(sync_db.appointments.find({
                "vendor_id": vendor_id,
                "status": {"$in": ["scheduled", "confirmed", "pending"]},
                "$or": [
                    {"start_at": {"$regex": "^2026-07-06T18:00"}},
                    {"scheduled_at": {"$regex": "^2026-07-06T(14|18):00"}},
                ],
            }))
            # Only the blocker (id=TEST_iter18_blocker) should be there.
            others = [a for a in appts if a.get("id") != "TEST_iter18_blocker"]
            assert not others, f"Double-booking appt persisted: {others}"
        finally:
            sync_db.appointments.delete_many({"id": "TEST_iter18_blocker"})
            self._cleanup(sync_db, vendor_id)


# ------------------------------ Regression: existing scheduling ---------------
class TestRegressionScheduling:
    def test_public_booking_info(self):
        r = requests.get(f"{BASE_URL}/api/public/booking/the-digisparrow-2883", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["vendor"]["slug"] == "the-digisparrow-2883"
        assert isinstance(d["types"], list) and len(d["types"]) >= 1

    def test_public_slots_weekday(self):
        r = requests.get(f"{BASE_URL}/api/public/booking/the-digisparrow-2883/slots",
                         params={"date": "2026-08-10"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "slots" in d and isinstance(d["slots"], list)
        assert len(d["slots"]) > 0

    def test_public_book_creates_no_error(self, sync_db):
        payload = {
            "start_at": "2026-08-17T13:00:00-04:00",
            "customer_name": "TEST_iter18_pub_book",
            "customer_contact": "TEST_iter18_pub@example.com",
            "notes": "iter18 regression",
        }
        # Cleanup previous
        sync_db.appointments.delete_many({"customer_name": "TEST_iter18_pub_book"})
        r = requests.post(f"{BASE_URL}/api/public/booking/the-digisparrow-2883/book",
                          json=payload, timeout=25)
        assert r.status_code == 200, r.text
        # Give async gcal push a moment then check DB
        appts = list(sync_db.appointments.find({"customer_name": "TEST_iter18_pub_book"}))
        try:
            assert len(appts) >= 1, "Public booking did not create appointment in DB"
            assert appts[0]["status"] == "scheduled"
            assert appts[0]["source"] == "booking_page"
        finally:
            sync_db.appointments.delete_many({"customer_name": "TEST_iter18_pub_book"})

    def test_types_crud(self, hdr):
        payload = {"name": "TEST_iter18_type", "description": "x",
                   "duration_minutes": 45, "color": "#123456",
                   "location": "", "instructions": "", "is_active": True}
        r = requests.post(f"{BASE_URL}/api/scheduling/types", json=payload, headers=hdr, timeout=15)
        assert r.status_code == 200, r.text
        tid = r.json()["id"]
        assert r.json()["name"] == "TEST_iter18_type"
        assert r.json()["duration_minutes"] == 45

        r2 = requests.get(f"{BASE_URL}/api/scheduling/types", headers=hdr, timeout=15)
        assert r2.status_code == 200
        assert any(t["id"] == tid for t in r2.json()["items"])

        payload["duration_minutes"] = 60
        r3 = requests.put(f"{BASE_URL}/api/scheduling/types/{tid}", json=payload, headers=hdr, timeout=15)
        assert r3.status_code == 200
        assert r3.json()["duration_minutes"] == 60

        r4 = requests.delete(f"{BASE_URL}/api/scheduling/types/{tid}", headers=hdr, timeout=15)
        assert r4.status_code == 200
        assert r4.json().get("ok") is True

    def test_appointments_list(self, hdr):
        r = requests.get(f"{BASE_URL}/api/appointments", headers=hdr, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body, (list, dict))

    def test_gcal_status_still_works(self, hdr):
        r = requests.get(f"{BASE_URL}/api/scheduling/google/status", headers=hdr, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "configured" in d and "connected" in d
