"""Live-endpoint verification for WhatsApp calling enable/status + auth regression."""
import os, sys, json, requests

BASE = "https://sales-automation-89.preview.emergentagent.com"
EMAIL = "kamal@thedigisparrow.com"
PWD = "Kamala98@hmu"

results = []

# 1) Auth regression
r = requests.post(f"{BASE}/api/auth/login", json={"email": EMAIL, "password": PWD}, timeout=30)
tok = None
try:
    j = r.json()
    tok = j.get("token") or j.get("access_token")
except Exception:
    j = {}
ok_login = r.status_code == 200 and bool(tok)
results.append(("auth_login", ok_login, f"status={r.status_code} tok={'yes' if tok else 'no'} body={str(j)[:200]}"))

if not tok:
    print(json.dumps(results, indent=2)); sys.exit(1)

H = {"Authorization": f"Bearer {tok}"}

# 2) GET status
r = requests.get(f"{BASE}/api/whatsapp/calling/status", headers=H, timeout=30)
try:
    js = r.json()
except Exception:
    js = {}
ok_status = (r.status_code == 200 and
             "connected" in js and "calling_enabled" in js and "outbound_supported" in js)
results.append(("calling_status", ok_status, f"status={r.status_code} body={str(js)[:300]}"))

# 3) POST enable — should return 400 with friendly detail, NOT 500 or raw JSON
r = requests.post(f"{BASE}/api/whatsapp/calling/enable", headers=H, timeout=60)
try:
    js = r.json()
except Exception:
    js = {}
detail = (js.get("detail") if isinstance(js, dict) else "") or ""
is_dict_detail = isinstance(detail, dict)
is_raw_json_str = isinstance(detail, str) and detail.strip().startswith("{") and '"error"' in detail
ok_400 = r.status_code == 400
ok_friendly = (isinstance(detail, str) and not is_raw_json_str and len(detail) > 20 and
               ("calling" in detail.lower() or "meta" in detail.lower() or "whatsapp" in detail.lower() or
                "messaging" in detail.lower() or "tier" in detail.lower() or "2,000" in detail))
results.append(("calling_enable_not_500", r.status_code != 500, f"status={r.status_code}"))
results.append(("calling_enable_400", ok_400, f"status={r.status_code}"))
results.append(("calling_enable_friendly", ok_friendly and not is_dict_detail,
                f"detail={str(detail)[:400]}"))

passed = sum(1 for _, ok, _ in results if ok)
print("\n===== LIVE CALLING ENDPOINT TESTS =====")
for n, ok, d in results:
    print(f"[{'PASS' if ok else 'FAIL'}] {n}: {d}")
print(f"\n{passed}/{len(results)} passed")
sys.exit(0 if passed == len(results) else 1)
