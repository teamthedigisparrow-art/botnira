import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { RefreshCw, Link2, CheckCircle2, AlertTriangle, Calendar, Video } from "lucide-react";

function GoogleIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.99 8.99 0 0 0 9 0 9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

export default function CalendarsTab() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [params, setParams] = useSearchParams();

  const load = () => api.get("/scheduling/google/status").then((r) => setStatus(r.data)).catch(() => setStatus({ configured: false }));
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const g = params.get("gcal");
    if (g === "connected") { toast.success("Google Calendar connected!"); load(); }
    else if (g === "error") { toast.error("Google Calendar connection failed. Please try again."); }
    if (g) { params.delete("gcal"); setParams(params, { replace: true }); }
    // eslint-disable-next-line
  }, []);

  const connect = async () => {
    setBusy(true);
    try {
      const { data } = await api.get(`/scheduling/google/connect?origin=${encodeURIComponent(window.location.origin)}`);
      window.location.href = data.authorization_url;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not start connection");
      setBusy(false);
    }
  };
  const disconnect = async () => {
    if (!window.confirm("Disconnect Google Calendar? Synced events will be removed from BotNira.")) return;
    setBusy(true);
    try { await api.post("/scheduling/google/disconnect"); toast.success("Disconnected"); await load(); }
    catch { toast.error("Failed"); } finally { setBusy(false); }
  };
  const syncNow = async () => {
    setBusy(true);
    try { await api.post("/scheduling/google/sync-now"); toast.success("Synced"); await load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Sync failed"); } finally { setBusy(false); }
  };

  if (!status) return <div className="p-10 font-mono text-sm">Loading…</div>;

  return (
    <div className="space-y-4" data-testid="calendars-tab">
      {/* Google Calendar card */}
      <div className="border-2 border-black bg-white p-4 sm:p-6" style={{ borderLeftWidth: 8, borderLeftColor: "#4285F4" }}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <GoogleIcon size={26} />
            <div>
              <div className="font-display font-black text-xl">Google Calendar</div>
              <div className="text-sm text-neutral-600">Two-way sync + automatic Google Meet links.</div>
            </div>
          </div>
          {status.connected ? (
            <span className="inline-flex items-center gap-1 text-xs font-bold border-2 border-black px-2 py-1 bg-green-200" data-testid="gcal-status-connected"><CheckCircle2 size={14} /> Connected</span>
          ) : status.status === "error" ? (
            <span className="inline-flex items-center gap-1 text-xs font-bold border-2 border-black px-2 py-1 bg-red-200"><AlertTriangle size={14} /> Sync error</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-bold border-2 border-black px-2 py-1 bg-neutral-100" data-testid="gcal-status-disconnected">Not connected</span>
          )}
        </div>

        {!status.configured ? (
          <div className="mt-4 border-2 border-dashed border-amber-500 bg-amber-50 p-4 text-sm">
            <div className="font-bold flex items-center gap-2"><AlertTriangle size={16} /> Setup required</div>
            <p className="mt-1 text-neutral-700">Google Calendar isn't configured on the server yet. Your BotNira admin needs to add the Google OAuth Client ID &amp; Secret. Once added, you'll be able to connect your calendar here.</p>
          </div>
        ) : status.connected ? (
          <div className="mt-4 space-y-3">
            <div className="text-sm">Connected account: <span className="font-mono font-bold">{status.email}</span></div>
            {status.last_sync_at && <div className="text-xs font-mono text-neutral-500">Last synced: {new Date(status.last_sync_at).toLocaleString()}</div>}
            {status.error && <div className="text-xs text-red-700">{status.error}</div>}
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={syncNow} data-testid="gcal-sync-btn" className="border-2 border-black px-4 py-2 font-bold text-sm bg-white hover-lift flex items-center gap-2"><RefreshCw size={14} /> Sync now</button>
              <button disabled={busy} onClick={disconnect} data-testid="gcal-disconnect-btn" className="border-2 border-black px-4 py-2 font-bold text-sm bg-red-50 text-red-700 hover-lift">Disconnect</button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <button disabled={busy} onClick={connect} data-testid="gcal-connect-btn" className="bg-[#002FA7] text-white font-bold px-5 py-3 border-2 border-black shadow-brutal hover-lift flex items-center gap-2">
              <Link2 size={16} /> Connect Google Calendar
            </button>
            <ul className="mt-4 text-sm text-neutral-700 space-y-1.5">
              <li className="flex items-center gap-2"><Calendar size={14} className="text-[#4285F4]" /> New BotNira bookings appear on your Google Calendar automatically.</li>
              <li className="flex items-center gap-2"><Calendar size={14} className="text-[#4285F4]" /> Events on your Google Calendar block those times in BotNira (no double-booking).</li>
              <li className="flex items-center gap-2"><Video size={14} className="text-[#34A853]" /> Set an appointment type's location to "Google Meet" to auto-generate a Meet link.</li>
            </ul>
          </div>
        )}
      </div>

      {/* Calendly — coming soon */}
      <div className="border-2 border-black bg-white p-4 sm:p-6 opacity-80" style={{ borderLeftWidth: 8, borderLeftColor: "#006BFF" }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-display font-black text-xl">Calendly</div>
            <div className="text-sm text-neutral-600">Sync your Calendly bookings into BotNira.</div>
          </div>
          <span className="text-xs font-bold border-2 border-black px-2 py-1 bg-yellow-200">Coming soon</span>
        </div>
      </div>
    </div>
  );
}
