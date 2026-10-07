"""Verify WhatsApp delivery-receipt (statuses) webhook updates campaign rows:
sent → delivered/read, and failed → surfaces Meta's error (the '0 delivered,
no reason shown' bug)."""
import asyncio, os, sys, httpx
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import server as _s  # noqa

API = os.environ.get("PUBLIC_API_URL") or "http://localhost:8001"
VID = "test_wadlv_vendor"; PID = "test_pid_wadlv"; CID = "test_wadlv_camp"
WAMID_OK = "wamid.OK123"; WAMID_FAIL = "wamid.FAIL456"


async def seed():
    await cleanup()
    await _s.db.whatsapp_connections.insert_one({"id": _s.new_id(), "vendor_id": VID,
        "phone_number_id": PID, "waba_id": "WABA", "access_token": "FAKE", "status": "active"})
    await _s.db.sales_wa_campaigns.insert_one({"id": CID, "vendor_id": VID, "name": "t",
        "status": "completed", "total": 2, "sent_count": 2, "failed_count": 0})
    for rid, wamid in [("r1", WAMID_OK), ("r2", WAMID_FAIL)]:
        await _s.db.sales_wa_campaign_recipients.insert_one({"id": rid, "campaign_id": CID,
            "vendor_id": VID, "phone": "1555", "status": "sent", "message_id": wamid,
            "created_at": _s.now_iso()})


async def cleanup():
    await _s.db.whatsapp_connections.delete_many({"vendor_id": VID})
    await _s.db.sales_wa_campaigns.delete_many({"vendor_id": VID})
    await _s.db.sales_wa_campaign_recipients.delete_many({"vendor_id": VID})


def wh(statuses):
    return {"object": "whatsapp_business_account", "entry": [{"id": "WABA", "changes": [
        {"field": "messages", "value": {"messaging_product": "whatsapp",
            "metadata": {"phone_number_id": PID}, "statuses": statuses}}]}]}


async def main():
    await seed()
    res = []
    async with httpx.AsyncClient(timeout=20) as c:
        r1 = await c.post(f"{API}/api/whatsapp/webhook", json=wh([
            {"id": WAMID_OK, "status": "delivered", "recipient_id": "1555", "timestamp": "1"}]))
        res.append(("delivered_http", r1.status_code == 200, r1.status_code))
        r2 = await c.post(f"{API}/api/whatsapp/webhook", json=wh([
            {"id": WAMID_FAIL, "status": "failed", "recipient_id": "1555", "timestamp": "2",
             "errors": [{"code": 131049, "title": "Healthy ecosystem engagement limit",
                         "error_data": {"details": "Marketing message not delivered."}}]}]))
        res.append(("failed_http", r2.status_code == 200, r2.status_code))

    ok_rec = await _s.db.sales_wa_campaign_recipients.find_one({"id": "r1"}, {"_id": 0})
    res.append(("delivered_recorded", ok_rec.get("delivery_status") == "delivered", ok_rec.get("delivery_status")))
    fail_rec = await _s.db.sales_wa_campaign_recipients.find_one({"id": "r2"}, {"_id": 0})
    ok_fail = fail_rec.get("status") == "failed" and "131049" in (fail_rec.get("error") or "") and "not delivered" in (fail_rec.get("error") or "").lower()
    res.append(("failed_reason_surfaced", ok_fail, fail_rec.get("error")))
    camp = await _s.db.sales_wa_campaigns.find_one({"id": CID}, {"_id": 0})
    ok_counts = camp.get("delivered_count") == 1 and camp.get("failed_count") == 1
    res.append(("campaign_counts", ok_counts, f"delivered={camp.get('delivered_count')} failed={camp.get('failed_count')}"))

    await cleanup()
    print("\n===== WA DELIVERY-STATUS TEST =====")
    p = sum(1 for _, ok, _ in res if ok)
    for n, ok, d in res:
        print(f"[{'PASS' if ok else 'FAIL'}] {n}: {d}")
    print(f"\n{p}/{len(res)} passed")
    sys.exit(0 if p == len(res) else 1)


if __name__ == "__main__":
    asyncio.run(main())
