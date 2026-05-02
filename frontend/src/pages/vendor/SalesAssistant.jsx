import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { toast } from "sonner";
import {
  Megaphone, Mail, Users, BarChart3, Upload, Sparkles, Lock,
  Play, Pause, X, Trash2, ShieldCheck, Clock, Check, AlertTriangle,
  Eye, Send,
} from "lucide-react";

const TABS = [
  { id: "prospects", label: "Prospects", icon: Users },
  { id: "campaigns", label: "Campaigns", icon: Mail },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
];

const STATUS_BADGE = {
  draft: "bg-neutral-200 text-neutral-800",
  scheduled: "bg-amber-200 text-amber-900",
  sending: "bg-blue-200 text-blue-900",
  paused: "bg-yellow-200 text-yellow-900",
  completed: "bg-green-200 text-green-900",
  canceled: "bg-red-200 text-red-900",
};

// ---------------------------------------------------------- locked overlay ---
function LockedScreen({ reason }) {
  return (
    <div data-testid="sales-locked" className="max-w-3xl mx-auto p-10">
      <div className="border-2 border-black shadow-brutal bg-white p-10 text-center relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-10"
             style={{ background: "repeating-linear-gradient(45deg,#000 0 6px,transparent 6px 16px)" }} />
        <div className="relative">
          <div className="inline-flex items-center justify-center w-16 h-16 border-2 border-black bg-yellow-300 mb-5">
            <Lock size={28} />
          </div>
          <h2 className="font-display font-black text-3xl tracking-tight">Sales Assistant is locked</h2>
          <p className="mt-3 text-neutral-700">
            {reason || "Upgrade to Growth or Pro to unlock outbound email campaigns."}
          </p>
          <div className="mt-6 grid sm:grid-cols-2 gap-3 max-w-lg mx-auto text-left">
            {[
              "Upload prospect lists (CSV) — duplicates auto-merged",
              "Personalised emails with {{name}}/{{company}} merge tags",
              "Anti-spam pacing: 5–45 min random delay per send",
              "Open tracking + CASL/CAN-SPAM unsubscribe footer",
            ].map((f, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <Check size={14} className="mt-0.5 text-green-700" />
                <span>{f}</span>
              </div>
            ))}
          </div>
          <Link to="/app/billing"
                data-testid="sales-upgrade-btn"
                className="mt-7 inline-block bg-[#002FA7] text-white border-2 border-black shadow-brutal px-6 py-3 font-bold hover-lift">
            Upgrade plan →
          </Link>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------- prospects panel ---
function ProspectsPanel() {
  const [data, setData] = useState({ items: [], total: 0, counts: { active: 0, unsubscribed: 0, bounced: 0 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = { limit: 200 };
      if (search) params.q = search;
      if (statusFilter) params.status = statusFilter;
      const { data: d } = await api.get("/sales/prospects", { params });
      setData(d);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load prospects");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter]);

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please upload a .csv file");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    setUploading(true);
    try {
      const { data: r } = await api.post("/sales/prospects/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(
        `Added ${r.inserted} prospects · ${r.duplicates_skipped} duplicates skipped${r.invalid_skipped ? ` · ${r.invalid_skipped} invalid` : ""}`,
      );
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (pid) => {
    if (!window.confirm("Remove this prospect?")) return;
    try {
      await api.delete(`/sales/prospects/${pid}`);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    }
  };

  const clearAll = async () => {
    if (!window.confirm(`Permanently delete ALL ${data.total} prospects? This cannot be undone.`)) return;
    try {
      const { data: r } = await api.post("/sales/prospects/clear");
      toast.success(`Deleted ${r.deleted} prospects`);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Clear failed");
    }
  };

  return (
    <div className="space-y-5" data-testid="sales-prospects-panel">
      {/* Helper banner */}
      <div className="border-2 border-black bg-amber-50 p-4 flex gap-3 items-start" data-testid="sales-csv-helper">
        <ShieldCheck size={18} className="mt-0.5 text-amber-700 shrink-0" />
        <div className="text-sm">
          <strong className="font-bold">Upload a CSV with columns:</strong>{" "}
          <code className="bg-white border border-black px-1 font-mono text-xs">email, name, company</code>.{" "}
          When you upload again, BotNira merges with your current list and
          automatically removes duplicates — your old prospects stay safe.
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 items-center">
          <input
            data-testid="sales-prospects-search"
            placeholder="Search email, name, company"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            className="border-2 border-black px-3 py-2 text-sm w-72"
          />
          <select
            data-testid="sales-prospects-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border-2 border-black px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            <option value="active">Active ({data.counts.active})</option>
            <option value="unsubscribed">Unsubscribed ({data.counts.unsubscribed})</option>
            <option value="bounced">Bounced ({data.counts.bounced})</option>
          </select>
          <button
            onClick={load}
            data-testid="sales-prospects-refresh"
            className="text-sm font-bold border-2 border-black px-3 py-2 hover-lift bg-white"
          >
            Apply
          </button>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onUpload}
            className="hidden"
            data-testid="sales-prospects-upload-input"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            data-testid="sales-prospects-upload-btn"
            className="text-sm font-bold border-2 border-black px-4 py-2 bg-[#002FA7] text-white shadow-brutal hover-lift disabled:opacity-60"
          >
            <Upload size={14} className="inline -mt-0.5 mr-1" />
            {uploading ? "Uploading…" : "Upload CSV"}
          </button>
          {data.total > 0 && (
            <button
              onClick={clearAll}
              data-testid="sales-prospects-clear-btn"
              className="text-sm font-bold border-2 border-red-700 text-red-700 px-3 py-2 hover-lift"
              title="Delete all prospects"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="border-2 border-black bg-white shadow-brutal overflow-hidden">
        <div className="grid grid-cols-[1fr_180px_180px_120px_60px] text-[11px] font-bold uppercase tracking-widest bg-black text-white px-4 py-2">
          <div>Email</div><div>Name</div><div>Company</div><div>Status</div><div></div>
        </div>
        {loading ? (
          <div className="p-10 text-center text-sm text-neutral-500">Loading…</div>
        ) : data.items.length === 0 ? (
          <div className="p-10 text-center text-sm text-neutral-500">
            No prospects yet. Upload a CSV to get started.
          </div>
        ) : (
          data.items.map((p) => (
            <div key={p.id}
                 data-testid={`prospect-row-${p.email}`}
                 className="grid grid-cols-[1fr_180px_180px_120px_60px] px-4 py-2.5 text-sm border-t border-black/10 items-center">
              <div className="font-mono text-xs truncate">{p.email}</div>
              <div className="truncate">{p.name || "—"}</div>
              <div className="truncate text-neutral-600">{p.company || "—"}</div>
              <div>
                <span className={`inline-block text-[10px] px-2 py-0.5 border border-black font-bold uppercase ${
                  p.status === "active" ? "bg-green-100" :
                  p.status === "unsubscribed" ? "bg-yellow-100" : "bg-red-100"
                }`}>{p.status}</span>
              </div>
              <button
                onClick={() => remove(p.id)}
                title="Remove"
                data-testid={`prospect-remove-${p.email}`}
                className="text-neutral-500 hover:text-red-700 justify-self-end"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
      {data.total > data.items.length && (
        <div className="text-xs text-neutral-500 text-center">
          Showing first {data.items.length} of {data.total}. Use search to narrow down.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------- composer modal ---
function ComposerModal({ open, onClose, onCreated, defaultProspectCount }) {
  const [form, setForm] = useState({
    name: "", subject: "", body_type: "html", body: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) setForm({ name: "", subject: "", body_type: "html", body: "" });
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) {
      toast.error("Name, subject and body are required");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post("/sales/campaigns", {
        name: form.name, subject: form.subject,
        body_type: form.body_type, body: form.body,
        start_now: true,
      });
      toast.success(`Campaign launched → ${data.campaign.total} prospects queued`);
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to launch campaign");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center p-6 z-50 overflow-auto" data-testid="sales-composer-modal">
      <div className="bg-white border-2 border-black shadow-brutal w-full max-w-3xl my-10">
        <div className="flex items-center justify-between border-b-2 border-black px-5 py-3">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-[#002FA7]" />
            <h3 className="font-display font-black text-xl">New marketing campaign</h3>
          </div>
          <button onClick={onClose} className="border-2 border-black p-1.5 hover-lift" data-testid="composer-close">
            <X size={14} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Helper banner */}
          <div className="border-2 border-black bg-blue-50 p-3 flex gap-2 items-start text-sm">
            <Clock size={16} className="mt-0.5 text-blue-800 shrink-0" />
            <div>
              <strong>BotNira sends one email at a time</strong>, with a random
              <strong> 5–45 minute</strong> gap between each — keeping your
              domain warm, your inbox safe, and your prospects un-bothered.
              An <strong>unsubscribe link</strong> is auto-added for CASL/CAN-SPAM
              compliance.
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-widest">Campaign name (internal)</label>
            <input
              data-testid="composer-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. April outreach — dental clinics"
              className="w-full border-2 border-black px-3 py-2 mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-widest">Subject line</label>
            <input
              data-testid="composer-subject"
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              placeholder="Hi {{first_name}}, can we save your front desk 10 hrs/week?"
              className="w-full border-2 border-black px-3 py-2 mt-1"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold uppercase tracking-widest">Body</label>
              <div className="flex gap-2 text-xs">
                <button
                  onClick={() => setForm((f) => ({ ...f, body_type: "text" }))}
                  data-testid="composer-tab-text"
                  className={`px-2 py-1 border-2 border-black ${form.body_type === "text" ? "bg-black text-white" : "bg-white"}`}
                >Plain text</button>
                <button
                  onClick={() => setForm((f) => ({ ...f, body_type: "html" }))}
                  data-testid="composer-tab-html"
                  className={`px-2 py-1 border-2 border-black ${form.body_type === "html" ? "bg-black text-white" : "bg-white"}`}
                >HTML</button>
              </div>
            </div>
            <textarea
              data-testid="composer-body"
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder={form.body_type === "html"
                ? '<p>Hi {{first_name}},</p>\n<p>I noticed {{company}}…</p>'
                : "Hi {{first_name}},\n\nI noticed {{company}}…"}
              rows={12}
              className="w-full border-2 border-black px-3 py-2 mt-1 font-mono text-sm"
            />
            <div className="text-[11px] text-neutral-500 mt-1">
              Merge tags: <code>{"{{first_name}}"}</code>, <code>{"{{name}}"}</code>, <code>{"{{company}}"}</code>, <code>{"{{email}}"}</code>
            </div>
          </div>
        </div>

        <div className="border-t-2 border-black px-5 py-3 flex items-center justify-between bg-neutral-50">
          <div className="text-sm text-neutral-700">
            <strong>{defaultProspectCount}</strong> active prospects will receive this email.
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="border-2 border-black px-4 py-2 text-sm font-bold bg-white hover-lift">Cancel</button>
            <button
              onClick={submit}
              disabled={submitting}
              data-testid="composer-launch"
              className="border-2 border-black px-5 py-2 text-sm font-bold bg-[#002FA7] text-white shadow-brutal hover-lift disabled:opacity-60"
            >
              <Send size={14} className="inline -mt-0.5 mr-1" />
              {submitting ? "Launching…" : "Launch campaign"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------- campaigns panel ---
function CampaignsPanel({ activeProspectCount }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/sales/campaigns");
      setItems(data.items);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load campaigns");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Refresh every 15s when there are sending/scheduled campaigns
  useEffect(() => {
    const hasLive = items.some((c) => ["sending", "scheduled"].includes(c.status));
    if (!hasLive) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [items]);

  const action = async (cid, kind) => {
    try {
      await api.post(`/sales/campaigns/${cid}/${kind}`);
      toast.success(`Campaign ${kind}d`);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Action failed");
    }
  };

  const fmtDate = (s) => s ? new Date(s).toLocaleString() : "—";

  return (
    <div className="space-y-4" data-testid="sales-campaigns-panel">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-700">
          {activeProspectCount} active prospects in your list.
        </p>
        <button
          onClick={() => setShowComposer(true)}
          disabled={activeProspectCount === 0}
          data-testid="sales-new-campaign-btn"
          className="text-sm font-bold border-2 border-black px-4 py-2 bg-[#002FA7] text-white shadow-brutal hover-lift disabled:opacity-50"
          title={activeProspectCount === 0 ? "Upload prospects first" : ""}
        >
          <Sparkles size={14} className="inline -mt-0.5 mr-1" />
          New campaign
        </button>
      </div>

      {loading ? (
        <div className="p-10 text-center text-sm text-neutral-500">Loading…</div>
      ) : items.length === 0 ? (
        <div className="border-2 border-black bg-white shadow-brutal p-10 text-center">
          <Megaphone size={28} className="mx-auto mb-3 text-[#002FA7]" />
          <h3 className="font-display font-black text-xl">No campaigns yet</h3>
          <p className="text-sm text-neutral-600 mt-1">Compose your first outbound email to start reaching prospects.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((c) => {
            const pct = c.total ? Math.round((c.sent_count / c.total) * 100) : 0;
            const openPct = c.sent_count ? Math.round((c.opened_count / c.sent_count) * 100) : 0;
            return (
              <div key={c.id}
                   data-testid={`campaign-row-${c.id}`}
                   className="border-2 border-black bg-white shadow-brutal p-5">
                <div className="flex flex-wrap items-start gap-3 justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-block text-[10px] px-2 py-0.5 border border-black font-bold uppercase ${STATUS_BADGE[c.status] || "bg-neutral-200"}`}>
                        {c.status}
                      </span>
                      <h4 className="font-display font-black text-lg truncate">{c.name}</h4>
                    </div>
                    <p className="text-sm text-neutral-700 mt-1 truncate">
                      <span className="text-neutral-500">Subject:</span> {c.subject}
                    </p>
                    <p className="text-xs font-mono text-neutral-500 mt-0.5">
                      Created {fmtDate(c.created_at)}
                      {c.last_send_at && ` · Last sent ${fmtDate(c.last_send_at)}`}
                      {c.next_send_at && c.status === "sending" && ` · Next ${fmtDate(c.next_send_at)}`}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {c.status === "sending" && (
                      <button onClick={() => action(c.id, "pause")}
                              data-testid={`campaign-pause-${c.id}`}
                              className="text-xs font-bold border-2 border-black px-3 py-1.5 bg-yellow-200 hover-lift">
                        <Pause size={12} className="inline -mt-0.5 mr-1" />Pause
                      </button>
                    )}
                    {c.status === "paused" && (
                      <button onClick={() => action(c.id, "resume")}
                              data-testid={`campaign-resume-${c.id}`}
                              className="text-xs font-bold border-2 border-black px-3 py-1.5 bg-green-200 hover-lift">
                        <Play size={12} className="inline -mt-0.5 mr-1" />Resume
                      </button>
                    )}
                    {!["completed", "canceled"].includes(c.status) && (
                      <button onClick={() => action(c.id, "cancel")}
                              data-testid={`campaign-cancel-${c.id}`}
                              className="text-xs font-bold border-2 border-red-700 text-red-700 px-3 py-1.5 hover-lift">
                        <X size={12} className="inline -mt-0.5 mr-1" />Cancel
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-4">
                  <div className="flex justify-between text-[11px] font-mono text-neutral-600">
                    <span>Sent {c.sent_count}/{c.total}</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="mt-1 h-2 border-2 border-black bg-neutral-100 overflow-hidden">
                    <div className="h-full bg-[#002FA7]" style={{ width: `${pct}%` }} />
                  </div>
                </div>

                {/* Stats row */}
                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  <Stat label="Sent" value={c.sent_count} icon={Send} />
                  <Stat label="Opened" value={c.opened_count} extra={`${openPct}%`} icon={Eye} />
                  <Stat label="Failed" value={c.failed_count} icon={AlertTriangle} />
                  <Stat label="Total" value={c.total} icon={Users} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ComposerModal
        open={showComposer}
        onClose={() => setShowComposer(false)}
        onCreated={load}
        defaultProspectCount={activeProspectCount}
      />
    </div>
  );
}

function Stat({ label, value, extra, icon: Icon }) {
  return (
    <div className="border-2 border-black p-2">
      <div className="flex items-center justify-center gap-1 text-[10px] uppercase font-bold tracking-widest text-neutral-600">
        <Icon size={10} />{label}
      </div>
      <div className="font-display font-black text-xl mt-0.5">{value}</div>
      {extra && <div className="text-[10px] text-neutral-500">{extra}</div>}
    </div>
  );
}

// ---------------------------------------------------------- analytics ---
function AnalyticsPanel() {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/sales/analytics", { params: { days } })
      .then(({ data }) => setData(data))
      .catch((e) => toast.error(e?.response?.data?.detail || "Failed to load analytics"))
      .finally(() => setLoading(false));
  }, [days]);

  const chart = useMemo(() => {
    if (!data?.series?.length) return null;
    const max = Math.max(1, ...data.series.map((s) => s.sent));
    return data.series.map((s) => ({ ...s, sentPct: (s.sent / max) * 100, openedPct: (s.opened / max) * 100 }));
  }, [data]);

  if (loading || !data) return <div className="p-10 text-center text-sm text-neutral-500">Loading…</div>;
  const t = data.totals;

  return (
    <div className="space-y-5" data-testid="sales-analytics-panel">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-black text-2xl">Outbound performance</h3>
        <select
          value={days} onChange={(e) => setDays(Number(e.target.value))}
          data-testid="sales-analytics-days"
          className="border-2 border-black px-3 py-1.5 text-sm"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>Last year</option>
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <BigStat label="Sent" value={t.sent} testid="stat-sent" />
        <BigStat label="Opened" value={t.opened} testid="stat-opened" />
        <BigStat label="Open rate" value={`${t.open_rate_pct}%`} testid="stat-open-rate" highlight />
        <BigStat label="Failed" value={t.failed} testid="stat-failed" />
        <BigStat label="Unsubscribed" value={t.unsubscribed} testid="stat-unsub" />
      </div>

      <div className="border-2 border-black bg-white shadow-brutal p-5">
        <h4 className="font-display font-black text-lg">Daily activity</h4>
        {!chart ? (
          <div className="text-sm text-neutral-500 mt-3">No sends in the selected window yet.</div>
        ) : (
          <div className="mt-4 grid items-end gap-1" style={{ gridTemplateColumns: `repeat(${chart.length}, minmax(20px, 1fr))`, minHeight: 180 }}>
            {chart.map((s) => (
              <div key={s.date} className="flex flex-col items-center gap-1 group">
                <div className="text-[9px] font-mono text-neutral-500 opacity-0 group-hover:opacity-100">
                  {s.opened}/{s.sent}
                </div>
                <div className="relative w-full bg-neutral-100 border-2 border-black" style={{ height: 140 }}>
                  <div className="absolute bottom-0 inset-x-0 bg-[#002FA7]/30" style={{ height: `${s.sentPct}%` }} />
                  <div className="absolute bottom-0 inset-x-0 bg-[#002FA7]" style={{ height: `${s.openedPct}%` }} />
                </div>
                <div className="text-[9px] font-mono text-neutral-500 -rotate-45 origin-top-left whitespace-nowrap">
                  {s.date.slice(5)}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="text-[11px] font-mono text-neutral-600 mt-3 flex gap-4">
          <span><span className="inline-block w-3 h-3 align-middle bg-[#002FA7]/30 border border-black"></span> Sent</span>
          <span><span className="inline-block w-3 h-3 align-middle bg-[#002FA7] border border-black"></span> Opened</span>
        </div>
      </div>
    </div>
  );
}

function BigStat({ label, value, testid, highlight }) {
  return (
    <div data-testid={testid}
         className={`border-2 border-black p-4 shadow-brutal ${highlight ? "bg-[#002FA7] text-white" : "bg-white"}`}>
      <div className="text-[10px] uppercase font-bold tracking-widest opacity-70">{label}</div>
      <div className="font-display font-black text-3xl mt-1">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------- main page ---
export default function SalesAssistant() {
  const [tab, setTab] = useState("prospects");
  const [access, setAccess] = useState(null);
  const [loadingAccess, setLoadingAccess] = useState(true);
  const [activeProspectCount, setActiveProspectCount] = useState(0);

  useEffect(() => {
    api.get("/sales/access")
      .then(({ data }) => setAccess(data))
      .catch((e) => setAccess({ enabled: false, reason: e?.response?.data?.detail || "Access check failed" }))
      .finally(() => setLoadingAccess(false));
  }, []);

  // Once enabled, fetch active prospect count for the campaign builder
  useEffect(() => {
    if (!access?.enabled) return;
    api.get("/sales/prospects", { params: { status: "active", limit: 1 } })
      .then(({ data }) => setActiveProspectCount(data.counts?.active || 0))
      .catch(() => {});
  }, [access?.enabled, tab]);

  if (loadingAccess) return <div className="p-10 font-mono text-sm">Loading…</div>;
  if (!access?.enabled) return <LockedScreen reason={access?.reason} />;

  return (
    <div className="p-6 space-y-5" data-testid="sales-assistant-page">
      <header>
        <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7] flex items-center gap-2">
          <Megaphone size={12} /> Sales Assistant
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-black tracking-tighter mt-1">
          Outbound email marketing
        </h1>
        <p className="text-sm text-neutral-600 mt-1">
          Reach prospects with personalised emails — paced safely so you stay
          out of spam folders. Available on the {access.plan_label === "exempt" ? "Exempt" : access.plan_label === "pro" ? "Pro" : "Growth"} plan.
        </p>
      </header>

      {/* Tabs */}
      <div className="border-b-2 border-black flex gap-0">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              data-testid={`sales-tab-${t.id}`}
              className={`px-4 py-2.5 text-sm font-bold border-2 border-b-0 -mb-0.5 ${
                isActive ? "bg-[#002FA7] text-white border-black" : "bg-transparent border-transparent text-neutral-700 hover:text-black"
              }`}
            >
              <Icon size={13} className="inline -mt-0.5 mr-1.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "prospects" && <ProspectsPanel />}
      {tab === "campaigns" && <CampaignsPanel activeProspectCount={activeProspectCount} />}
      {tab === "analytics" && <AnalyticsPanel />}
    </div>
  );
}
