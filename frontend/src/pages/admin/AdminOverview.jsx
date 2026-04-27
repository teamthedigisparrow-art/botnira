import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { Building2, MessagesSquare, CalendarDays, Users, RefreshCw, Phone } from "lucide-react";
import { Link } from "react-router-dom";

export default function AdminOverview() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/admin/analytics").then(r => setData(r.data)); }, []);
  const t = data?.totals || {};

  const fixWebhooks = async () => {
    if (!window.confirm(
      "This will rewrite EVERY vendor's Twilio voice + SMS webhook URL to point at the domain you're currently using (" + window.location.host + ").\n\n" +
      "Run this whenever you switch domains or notice calls/SMS landing on the wrong environment.\n\n" +
      "Continue?"
    )) return;
    setBusy(true);
    try {
      const { data: r } = await api.post("/admin/voice/migrate-webhooks", {});
      if ((r.failed || []).length) {
        toast.error(`${r.summary} — ${r.failed.length} failed (see console)`);
        console.error("Migration failures:", r.failed);
      } else {
        toast.success(r.summary + " — all numbers now point at " + r.public_base_url);
      }
      console.log("Migration result:", r);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Migration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-8 space-y-6" data-testid="admin-overview">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#6f8cff]">Super Admin</div>
          <h1 className="font-display text-4xl font-black tracking-tighter">Platform overview</h1>
          <p className="text-sm text-neutral-600 mt-1">Every vendor, every conversation, one view.</p>
        </div>
        <button
          data-testid="fix-twilio-webhooks-btn"
          onClick={fixWebhooks}
          disabled={busy}
          className="border-2 border-black bg-yellow-300 px-4 py-3 font-bold text-sm shadow-brutal hover-lift flex items-center gap-2 disabled:opacity-60"
          title="Rewrites every Twilio number's voice + SMS webhook URL to the current domain"
        >
          <Phone size={14} />
          {busy ? <><RefreshCw size={14} className="animate-spin"/> Rewriting…</> : "🔄 Fix Twilio webhooks"}
        </button>
      </div>
      <div className="grid md:grid-cols-4 gap-4">
        <Stat icon={Users} label="Vendors" value={t.vendors || 0} tid="admin-stat-vendors"/>
        <Stat icon={Building2} label="Active" value={t.active_vendors || 0} tid="admin-stat-active"/>
        <Stat icon={MessagesSquare} label="Conversations" value={t.conversations || 0} tid="admin-stat-conv"/>
        <Stat icon={CalendarDays} label="Appointments" value={t.appointments || 0} tid="admin-stat-appts"/>
      </div>
      <div className="border-2 border-black bg-white p-6">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold tracking-[0.2em] uppercase">Top vendors</div>
          <Link data-testid="admin-link-vendors" to="/admin/vendors" className="text-sm font-bold underline">Manage all</Link>
        </div>
        <div className="mt-4 space-y-2">
          {(data?.leaderboard || []).map((l, i) => (
            <div key={i} className="flex items-center justify-between border-b border-black/10 py-2">
              <span className="font-bold">{l.vendor}</span>
              <span className="font-mono font-bold">{l.conversations} convs</span>
            </div>
          ))}
          {(!data?.leaderboard || data.leaderboard.length === 0) && <div className="text-sm text-neutral-500">No data yet.</div>}
        </div>
      </div>
    </div>
  );
}

const Stat = ({ icon: Icon, label, value, tid }) => (
  <div className="border-2 border-black bg-white p-5" data-testid={tid}>
    <div className="flex items-center justify-between">
      <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600">{label}</div>
      <Icon size={18}/>
    </div>
    <div className="font-display font-black text-4xl tracking-tighter mt-2">{value}</div>
  </div>
);
