"""Test WhatsApp Business Calling: inbound-call webhook logging into the thread,
call_records, and calling-status / outbound-eligibility routing.

The webhook + status endpoints make no *outbound* Graph calls in these paths
(display number is pre-seeded), so they're fully verifiable in preview.
"""
import asyncio, os, sys, json
import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import server as _s  # noqa: E402

API = os.environ.get("PUBLIC_API_URL") or "http://localhost:8001"
VID = "test_wa_vendor"
PID = "test_pid_wa"
WA = "447700900555"          # UK number (outbound supported)
CALL_ID = "wacid.TEST123"


async def _login_token():
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(f"{API}/api/auth/login",
                         json={"email": "test_wa_user@botnira.com", "password": "Test1234!"})
        return r.json().get("token")


async def seed(display):
    await cleanup()
    await _s.db.vendors.insert_one({"id": VID, "name": "WA Call Test", "slug": "wa-call-test",
                                    "status": "active", "plan": "growth", "is_exempt": True,
                                    "created_at": _s.now_iso()})
    await _s.db.users.insert_one({"id": "test_wa_uid", "vendor_id": VID,
                                  "email": "test_wa_user@botnira.com", "role": "vendor",
                                  "password_hash": _s.hash_password("Test1234!"),
                                  "email_verified": True, "created_at": _s.now_iso()})
    await _s.db.whatsapp_connections.insert_one({
        "id": _s.new_id(), "vendor_id": VID, "phone_number_id": PID, "waba_id": "WABA1",
        "access_token": "FAKE", "status": "active", "display_phone_number": display})


async def cleanup():
    for col in ("vendors", "users", "whatsapp_connections", "conversations", "messages",
                "call_records", "wa_calls"):
        await _s.db[col].delete_many({"vendor_id": VID})
    await _s.db.users.delete_many({"email": "test_wa_user@botnira.com"})


def _wh(calls, contacts=True):
    val = {"messaging_product": "whatsapp",
           "metadata": {"phone_number_id": PID, "display_phone_number": "441234"},
           "calls": calls}
    if contacts:
        val["contacts"] = [{"profile": {"name": "Ada Lovelace"}, "wa_id": WA}]
    return {"object": "whatsapp_business_account",
            "entry": [{"id": "WABA1", "changes": [{"field": "calls", "value": val}]}]}


async def main():
    results = []
    await seed("+44 20 1234 5678")  # UK → outbound supported
    async with httpx.AsyncClient(timeout=20) as c:
        # 1) Inbound connect webhook → thread "Incoming WhatsApp call"
        r = await c.post(f"{API}/api/whatsapp/webhook", json=_wh([{
            "id": CALL_ID, "from": WA, "to": "441234", "event": "connect",
            "direction": "USER_INITIATED", "timestamp": "1",
            "session": {"sdp_type": "offer", "sdp": "v=0"}}]))
        results.append(("inbound_connect_http", r.status_code == 200, r.text[:80]))

        # 2) Terminate with duration → thread "Incoming WhatsApp call — 1m 35s"
        r2 = await c.post(f"{API}/api/whatsapp/webhook", json=_wh([{
            "id": CALL_ID, "event": "terminate", "direction": "USER_INITIATED",
            "status": "COMPLETED", "duration": 95}], contacts=False))
        results.append(("terminate_http", r2.status_code == 200, r2.text[:80]))

    conv = await _s.db.conversations.find_one({"vendor_id": VID, "channel": "whatsapp"}, {"_id": 0})
    ok_conv = bool(conv) and conv.get("customer_contact") == WA
    results.append(("conversation_created", ok_conv, str(conv and conv.get("id"))))

    msgs = await _s.db.messages.find({"vendor_id": VID}, {"_id": 0}).sort("created_at", 1).to_list(20)
    contents = [m.get("content") for m in msgs]
    ok_in = any("Incoming WhatsApp call" == m.get("content") for m in msgs)
    ok_end = any("1m 35s" in (m.get("content") or "") for m in msgs)
    results.append(("thread_incoming_logged", ok_in, str(contents)))
    results.append(("thread_duration_logged", ok_end, str(contents)))

    rec = await _s.db.call_records.find_one({"vendor_id": VID, "call_sid": CALL_ID}, {"_id": 0})
    ok_rec = bool(rec) and rec.get("direction") == "whatsapp_inbound" and abs(rec.get("minutes", 0) - 1.58) < 0.01
    results.append(("call_record_inbound", ok_rec, str(rec)[:140] if rec else "MISSING"))

    # 3) Calling status endpoint: UK number → outbound_supported True
    tok = await _login_token()
    async with httpx.AsyncClient(timeout=20) as c:
        rs = await c.get(f"{API}/api/whatsapp/calling/status", headers={"Authorization": f"Bearer {tok}"})
        d = rs.json()
    ok_uk = rs.status_code == 200 and d.get("outbound_supported") is True and d.get("connected") is True
    results.append(("status_uk_outbound_supported", ok_uk, json.dumps(d)))

    # 4) US number → outbound NOT supported (Twilio fallback)
    await _s.db.whatsapp_connections.update_one({"vendor_id": VID},
        {"$set": {"display_phone_number": "+1 650 555 3601"}})
    async with httpx.AsyncClient(timeout=20) as c:
        rs2 = await c.get(f"{API}/api/whatsapp/calling/status", headers={"Authorization": f"Bearer {tok}"})
        d2 = rs2.json()
    ok_us = rs2.status_code == 200 and d2.get("outbound_supported") is False
    results.append(("status_us_outbound_blocked", ok_us, json.dumps(d2)))

    await cleanup()

    print("\n===== WHATSAPP CALLING TEST RESULTS =====")
    passed = sum(1 for _, ok, _ in results if ok)
    for name, ok, det in results:
        print(f"[{'PASS' if ok else 'FAIL'}] {name}: {det}")
    print(f"\n{passed}/{len(results)} passed")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    asyncio.run(main())
