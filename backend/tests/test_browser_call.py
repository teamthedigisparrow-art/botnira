"""E2E-ish test for the in-browser callback public webhooks (/twiml + /status).

These two endpoints make NO Twilio API calls — they only read the vendor's
voice_connections for caller ID, build <Dial> TwiML, and (on status) meter
minutes + log the outgoing call into the conversation thread. So we can fully
verify them by seeding a temp vendor + conversation, hitting the public API,
and asserting the XML + DB side effects.
"""
import asyncio
import os
import sys
import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import server as _s  # noqa: E402

API = os.environ.get("PUBLIC_API_URL") or "http://localhost:8001"
VID = "test_bc_vendor"
CONV = "test_bc_conv"
NUM = "+15550009999"
TO = "+447700900123"


async def seed():
    await cleanup()
    await _s.db.vendors.insert_one({
        "id": VID, "name": "BrowserCall Test", "slug": "bc-test",
        "status": "active", "plan": "growth", "is_exempt": False,
        "minutes_balance": 100.0, "minutes_used_total": 0.0,
        "created_at": _s.now_iso(),
    })
    await _s.db.voice_connections.insert_one({
        "id": _s.new_id(), "vendor_id": VID, "phone_number": NUM,
        "subaccount_sid": "ACtest", "status": "connected",
    })
    await _s.db.conversations.insert_one({
        "id": CONV, "vendor_id": VID, "channel": "voice",
        "customer_name": "Jane Doe", "customer_contact": TO,
        "status": "open", "created_at": _s.now_iso(), "updated_at": _s.now_iso(),
    })


async def cleanup():
    await _s.db.vendors.delete_many({"id": VID})
    await _s.db.voice_connections.delete_many({"vendor_id": VID})
    await _s.db.conversations.delete_many({"id": CONV})
    await _s.db.messages.delete_many({"conversation_id": CONV})
    await _s.db.call_records.delete_many({"vendor_id": VID})


async def main():
    await seed()
    results = []
    async with httpx.AsyncClient(timeout=20) as c:
        # 1) TwiML: valid → <Dial callerId=NUM><Number>TO</Number></Dial>
        r = await c.post(
            f"{API}/api/voice/browser/twiml?base={API}",
            data={"From": f"client:agent_{VID}", "To": TO, "ConversationId": CONV},
        )
        xml = r.text
        ok1 = (r.status_code == 200 and f'callerId="{NUM}"' in xml
               and f"<Number>{TO}</Number>" in xml and "/api/voice/browser/status" in xml)
        results.append(("twiml_valid", ok1, xml[:200]))

        # 2) TwiML: bad destination → hangup, no Dial
        r2 = await c.post(
            f"{API}/api/voice/browser/twiml?base={API}",
            data={"From": f"client:agent_{VID}", "To": "not-a-number", "ConversationId": CONV},
        )
        ok2 = r2.status_code == 200 and "<Dial" not in r2.text and "<Hangup" in r2.text
        results.append(("twiml_bad_dest", ok2, r2.text[:160]))

        # 3) Status: completed 125s → deduct ~2.08 min + log message + call_record
        r3 = await c.post(
            f"{API}/api/voice/browser/status?vendor_id={VID}&conversation_id={CONV}&to=%2B447700900123",
            data={"DialCallStatus": "completed", "DialCallDuration": "125", "DialCallSid": "CAtest123"},
        )
        ok3 = r3.status_code == 200 and "<Hangup" in r3.text
        results.append(("status_http", ok3, r3.text[:120]))

    v = await _s.db.vendors.find_one({"id": VID}, {"_id": 0})
    minutes_left = v.get("minutes_balance")
    ok4 = abs(minutes_left - (100.0 - 2.08)) < 0.01
    results.append(("minutes_deducted", ok4, f"balance={minutes_left} used={v.get('minutes_used_total')}"))

    msg = await _s.db.messages.find_one({"conversation_id": CONV, "role": "agent"}, {"_id": 0})
    ok5 = bool(msg) and "Outgoing call" in (msg or {}).get("content", "")
    results.append(("thread_logged", ok5, (msg or {}).get("content", "MISSING")))

    rec = await _s.db.call_records.find_one({"vendor_id": VID, "call_sid": "CAtest123"}, {"_id": 0})
    ok6 = bool(rec) and rec.get("direction") == "outbound_human" and rec.get("to_number") == TO
    results.append(("call_record", ok6, str(rec)[:160] if rec else "MISSING"))

    await cleanup()

    print("\n===== BROWSER CALLBACK TEST RESULTS =====")
    passed = 0
    for name, ok, detail in results:
        print(f"[{'PASS' if ok else 'FAIL'}] {name}: {detail}")
        passed += 1 if ok else 0
    print(f"\n{passed}/{len(results)} passed")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    asyncio.run(main())
