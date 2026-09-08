"""Verify WhatsApp calling: Graph v23 usage + friendly 138015 error mapping."""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import server as _s          # must import first (registers submodule, avoids circular)
import whatsapp_call_routes as wc  # noqa: E402

results = []

# 1) Calling endpoints must use Graph API v23.0+ (not the messaging v22).
ok_ver = wc.GRAPH_CALL_BASE.rstrip("/").endswith(("v23.0", "v24.0", "v25.0", "v26.0"))
results.append(("graph_v23_plus", ok_ver, wc.GRAPH_CALL_BASE))

# 2) 138015 → actionable message mentioning the 2,000 tier + the code.
msg = wc._friendly_calling_error(json.dumps({"error": {
    "message": "Calling cannot be enabled", "code": 138015,
    "type": "OAuthException",
    "error_data": {"messaging_product": "whatsapp",
                   "details": "Calling APIs cannot be enabled for this phone number."}}}))
ok_138015 = ("2,000" in msg and "138015" in msg and "raw" not in msg.lower()
             and "{" not in msg)
results.append(("friendly_138015", ok_138015, msg[:120]))

# 3) Generic Meta error → surfaces message + details, not raw JSON.
msg2 = wc._friendly_calling_error(json.dumps({"error": {
    "message": "Some other problem", "code": 999,
    "error_data": {"details": "extra detail"}}}))
ok_generic = "Some other problem" in msg2 and "extra detail" in msg2 and "{" not in msg2
results.append(("friendly_generic", ok_generic, msg2[:120]))

print("\n===== WA CALLING ERROR-MAPPING TEST =====")
passed = sum(1 for _, ok, _ in results if ok)
for n, ok, d in results:
    print(f"[{'PASS' if ok else 'FAIL'}] {n}: {d}")
print(f"\n{passed}/{len(results)} passed")
sys.exit(0 if passed == len(results) else 1)
