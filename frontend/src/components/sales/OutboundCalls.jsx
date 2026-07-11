import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { toast } from "sonner";
import {
  Phone, PhoneCall, LayoutDashboard, Megaphone, History, BarChart3, Plus, Play, Pause,
  X, Trash2, ChevronRight, ChevronLeft, Check, AlertTriangle, Clock, Wallet, Loader2,
  Download, Search, Sparkles, Volume2, ArrowLeft,
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, CartesianGrid } from "recharts";

const API = "/sales/outbound";

const STATUS_STYLES = {
  draft: "bg-neutral-200 text-neutral-800",
  running: "bg-green-200 text-green-900",
  paused: "bg-yellow-200 text-yellow-900",
  completed: "bg-blue-200 text-blue-900",
  finished: "bg-blue-200 text-blue-900",
  cancelled: "bg-red-200 text-red-900",
  archived: "bg-neutral-300 text-neutral-700",
};

const OUTCOME_STYLES = {
  answered: "bg-green-100 text-green-800",
  appointment_booked: "bg-emerald-200 text-emerald-900",
  interested: "bg-emerald-100 text-emerald-800",
  callback_requested: "bg-amber-100 text-amber-800",
  no_answer: "bg-neutral-100 text-neutral-700",
  busy: "bg-orange-100 text-orange-800",
  voicemail: "bg-purple-100 text-purple-800",
  not_interested: "bg-red-100 text-red-800",
  failed: "bg-red-200 text-red-900",
};

const SUBTABS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "campaigns", label: "Campaigns", icon: Megaphone },
  { id: "history", label: "Call History", icon: History },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
];

const fmtDur = (s) => {
  s = Math.round(s || 0);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
};

// ─────────────────────────────────────────────── KPI card ───
const Kpi = ({ label, value, tone = "" }) => (
  <div className="border-2 border-black bg-white shadow-brutal p-4" data-testid={`kpi-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
    <div className={`font-display font-black text-2xl md:text-3xl leading-none ${tone}`}>{value}</div>
    <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label}</div>
  </div>
);

// ─────────────────────────────────────────────── Dashboard ───
function DashboardPanel({ data, campaigns, onGoBilling }) {
  if (!data) return <div className="p-6 font-mono text-sm">Loading…</div>;
  const c = data.calls, cm = data.campaigns;
  const noMin = campaigns.some((x) => x.status === "paused" && x.paused_reason === "no_minutes");
  const maxDay = Math.max(1, ...(data.per_day || []).map((d) => d.calls));
  return (
    <div className="space-y-5" data-testid="oc-dashboard">
      {noMin && (
        <div className="border-2 border-black bg-red-100 shadow-brutal p-4 flex flex-col sm:flex-row sm:items-center gap-3" data-testid="oc-nomin-banner">
          <AlertTriangle size={22} className="text-red-700 shrink-0" />
          <div className="flex-1">
            <div className="font-display font-black">Campaign paused — no voice minutes remaining</div>
            <div className="text-sm text-neutral-700">Recharge your prepaid voice minutes to resume calling. You are never charged automatically.</div>
          </div>
          <button onClick={onGoBilling} data-testid="oc-recharge-btn" className="bg-[#002FA7] text-white border-2 border-black shadow-brutal px-4 py-2 font-bold hover-lift whitespace-nowrap">
            <Wallet size={15} className="inline -mt-0.5 mr-1.5" /> Recharge Voice Minutes
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Kpi label="Active Campaigns" value={cm.active} tone="text-green-700" />
        <Kpi label="Draft Campaigns" value={cm.draft} />
        <Kpi label="Completed" value={cm.completed} tone="text-[#002FA7]" />
        <Kpi label="Paused" value={cm.paused} tone="text-yellow-700" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <Kpi label="Scheduled" value={c.scheduled} />
        <Kpi label="In Progress" value={c.in_progress} />
        <Kpi label="Completed Calls" value={c.completed} />
        <Kpi label="Answered" value={c.answered} tone="text-green-700" />
        <Kpi label="No Answer" value={c.no_answer} />
        <Kpi label="Busy" value={c.busy} />
        <Kpi label="Voicemail" value={c.voicemail} />
        <Kpi label="Interested" value={c.interested} tone="text-emerald-700" />
        <Kpi label="Not Interested" value={c.not_interested} />
        <Kpi label="Callbacks" value={c.callback_requested} />
        <Kpi label="Appointments" value={c.appointments_booked} tone="text-emerald-700" />
        <Kpi label="Avg Duration" value={fmtDur(data.avg_call_duration_sec)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="border-2 border-black bg-white shadow-brutal p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Voice minutes used</div>
          <div className="font-display font-black text-3xl mt-1">{data.voice_minutes_used}</div>
        </div>
        <div className="border-2 border-black bg-white shadow-brutal p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Remaining minutes</div>
          <div className="font-display font-black text-3xl mt-1 text-[#002FA7]">{data.voice_minutes_remaining}</div>
        </div>
        <div className="border-2 border-black bg-white shadow-brutal p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Answer rate</div>
          <div className="font-display font-black text-3xl mt-1">
            {c.completed ? Math.round((c.answered / c.completed) * 100) : 0}%
          </div>
        </div>
      </div>

      {/* Calls per day */}
      <div className="border-2 border-black bg-white shadow-brutal p-5">
        <div className="text-xs font-bold uppercase tracking-widest text-neutral-600 mb-4">Calls per day (last 14)</div>
        {(!data.per_day || data.per_day.length === 0) ? (
          <div className="text-sm text-neutral-500 font-mono">No calls yet — launch a campaign to see activity.</div>
        ) : (
          <div className="flex items-end gap-2 h-40">
            {data.per_day.map((d) => (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-1" title={`${d.day}: ${d.calls} calls`}>
                <div className="w-full bg-neutral-100 border-2 border-black relative" style={{ height: "100%" }}>
                  <div className="absolute bottom-0 inset-x-0 bg-[#002FA7]" style={{ height: `${(d.calls / maxDay) * 100}%` }} />
                  <div className="absolute bottom-0 inset-x-0 bg-green-500" style={{ height: `${(d.answered / maxDay) * 100}%`, opacity: 0.9 }} />
                </div>
                <div className="text-[9px] font-mono text-neutral-500 -rotate-45 origin-top-left whitespace-nowrap">{d.day.slice(5)}</div>
              </div>
            ))}
          </div>
        )}
        <div className="text-[11px] font-mono text-neutral-600 mt-4 flex gap-4">
          <span><span className="inline-block w-3 h-3 align-middle bg-[#002FA7] border border-black" /> Calls</span>
          <span><span className="inline-block w-3 h-3 align-middle bg-green-500 border border-black" /> Answered</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────── Wizard ───
const BLANK = {
  name: "", description: "", list_ids: [], industry: "", goal: "book_appointment",
  goal_custom: "", script: "", language: "English",
  voice: { gender: "female", tone: "Friendly" },
  business_hours: { days: [0, 1, 2, 3, 4], open: "09:00", close: "17:00", timezone: "America/Toronto" },
  daily_limit: 50,
  retry: { on_no_answer: true, on_busy: true, on_voicemail: false, max_attempts: 2, retry_after: "2h", retry_after_minutes: 60 },
};
const DAYS = [["Mon", 0], ["Tue", 1], ["Wed", 2], ["Thu", 3], ["Fri", 4], ["Sat", 5], ["Sun", 6]];
const LANGS = ["English", "French", "Spanish", "Hindi", "Punjabi", "German", "Italian", "Arabic", "Portuguese"];
const TZS = ["America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg", "America/Halifax", "America/New_York", "America/Chicago", "America/Los_Angeles"];

function Wizard({ options, lists, onClose, onSaved }) {
  const [step, setStep] = useState(1);
  const [f, setF] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  const TOTAL = 11;

  const selectedLists = lists.filter((l) => f.list_ids.includes(l.id));
  const listReach = (l) => l.counts?.active_with_phone ?? l.counts?.active ?? l.total ?? 0;
  const totalProspects = selectedLists.reduce((s, l) => s + listReach(l), 0);

  const canNext = () => {
    if (step === 1) return f.name.trim().length > 0;
    if (step === 2) return f.list_ids.length > 0;
    if (step === 5) return f.script.trim().length > 0;
    return true;
  };

  const submit = async (launch) => {
    setSaving(true);
    try {
      const { data } = await api.post(`${API}/campaigns`, f);
      if (launch) {
        try {
          const res = await api.post(`${API}/campaigns/${data.id}/launch`);
          const e = res.data.enqueue || {};
          toast.success(`Campaign launched — ${e.queued ?? 0} prospects queued${e.blocked_international ? `, ${e.blocked_international} international blocked` : ""}`);
        } catch (le) {
          toast.error(le?.response?.data?.detail || "Saved as draft, but launch failed");
        }
      } else {
        toast.success("Campaign saved as draft");
      }
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not create campaign");
    } finally {
      setSaving(false);
    }
  };

  const goals = options?.goals || [];
  const industries = options?.industries || [];
  const tones = options?.tones || ["Friendly", "Professional", "Casual", "Premium"];
  const limits = options?.daily_limits || [25, 50, 100, 250, 500, 1000];

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto" data-testid="oc-wizard">
      <div className="bg-white border-2 border-black shadow-brutal-lg w-full max-w-2xl my-4">
        <div className="flex items-center justify-between border-b-2 border-black px-5 py-3 bg-[#002FA7] text-white">
          <div className="font-display font-black">New Outbound Campaign</div>
          <button onClick={onClose} data-testid="oc-wizard-close"><X size={20} /></button>
        </div>
        {/* progress */}
        <div className="px-5 pt-4">
          <div className="flex items-center justify-between text-xs font-mono text-neutral-500">
            <span>Step {step} of {TOTAL}</span>
            <span>{Math.round((step / TOTAL) * 100)}%</span>
          </div>
          <div className="h-2 border-2 border-black mt-1"><div className="h-full bg-[#002FA7]" style={{ width: `${(step / TOTAL) * 100}%` }} /></div>
        </div>

        <div className="p-5 min-h-[280px]">
          {step === 1 && (
            <div className="space-y-3">
              <h3 className="font-display font-black text-xl">Campaign name</h3>
              <input autoFocus value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Ontario Dentists July" data-testid="wz-name" className="border-2 border-black px-3 py-2 w-full" />
              <textarea value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="Description (optional)" rows={3} data-testid="wz-desc" className="border-2 border-black px-3 py-2 w-full" />
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3">
              <h3 className="font-display font-black text-xl">Select prospect lists</h3>
              <p className="text-sm text-neutral-600">Only US/Canada (+1) numbers are called. International numbers are skipped automatically.</p>
              <div className="border-2 border-black divide-y-2 divide-black max-h-56 overflow-y-auto">
                {lists.length === 0 && <div className="p-4 text-sm text-neutral-500">No prospect lists yet — add prospects first.</div>}
                {lists.map((l) => {
                  const on = f.list_ids.includes(l.id);
                  return (
                    <label key={l.id} data-testid={`wz-list-${l.id}`} className={`flex items-center gap-3 p-3 cursor-pointer ${on ? "bg-blue-50" : "bg-white"}`}>
                      <input type="checkbox" checked={on} onChange={() => set({ list_ids: on ? f.list_ids.filter((x) => x !== l.id) : [...f.list_ids, l.id] })} />
                      <span className="flex-1 font-bold">{l.name}</span>
                      <span className="text-xs font-mono text-neutral-500">{listReach(l)} contacts</span>
                    </label>
                  );
                })}
              </div>
              <div className="text-sm font-mono text-neutral-700">{f.list_ids.length} list(s) · ~{totalProspects} prospects</div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-3">
              <h3 className="font-display font-black text-xl">Business industry</h3>
              <input list="oc-industries" value={f.industry} onChange={(e) => set({ industry: e.target.value })} placeholder="Search or type a custom industry" data-testid="wz-industry" className="border-2 border-black px-3 py-2 w-full" />
              <datalist id="oc-industries">{industries.map((i) => <option key={i} value={i} />)}</datalist>
            </div>
          )}
          {step === 4 && (
            <div className="space-y-3">
              <h3 className="font-display font-black text-xl">Campaign goal</h3>
              <div className="grid grid-cols-2 gap-2">
                {goals.map((g) => (
                  <button key={g.id} onClick={() => set({ goal: g.id })} data-testid={`wz-goal-${g.id}`} className={`border-2 border-black px-3 py-2 text-sm font-bold text-left ${f.goal === g.id ? "bg-[#002FA7] text-white" : "bg-white"}`}>{g.label}</button>
                ))}
                <button onClick={() => set({ goal: "custom" })} className={`border-2 border-black px-3 py-2 text-sm font-bold text-left ${f.goal === "custom" ? "bg-[#002FA7] text-white" : "bg-white"}`}>Custom Goal</button>
              </div>
              {f.goal === "custom" && <input value={f.goal_custom} onChange={(e) => set({ goal_custom: e.target.value })} placeholder="Describe your goal" className="border-2 border-black px-3 py-2 w-full" />}
            </div>
          )}
          {step === 5 && (
            <div className="space-y-3">
              <h3 className="font-display font-black text-xl">Sales script</h3>
              <p className="text-sm text-neutral-600">Write simple instructions — the AI follows the intent naturally.</p>
              <textarea value={f.script} onChange={(e) => set({ script: e.target.value })} rows={7} data-testid="wz-script"
                placeholder={"Introduce yourself.\nTell them we help businesses answer every missed call.\nAsk if they currently miss customer calls.\nIf interested, schedule a demo.\nKeep conversations natural."}
                className="border-2 border-black px-3 py-2 w-full font-mono text-sm" />
            </div>
          )}
          {step === 6 && (
            <div className="space-y-3">
              <h3 className="font-display font-black text-xl">Opening language</h3>
              <select value={f.language} onChange={(e) => set({ language: e.target.value })} data-testid="wz-language" className="border-2 border-black px-3 py-2 w-full">
                {LANGS.map((l) => <option key={l}>{l}</option>)}
              </select>
              <p className="text-xs text-neutral-500">The AI still switches languages dynamically if the customer responds in another language.</p>
            </div>
          )}
          {step === 7 && (
            <div className="space-y-4">
              <h3 className="font-display font-black text-xl">Voice</h3>
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-1">Gender</div>
                <div className="flex gap-2">
                  {["female", "male"].map((g) => (
                    <button key={g} onClick={() => set({ voice: { ...f.voice, gender: g } })} data-testid={`wz-voice-${g}`} className={`border-2 border-black px-4 py-2 font-bold capitalize ${f.voice.gender === g ? "bg-[#002FA7] text-white" : "bg-white"}`}>{g}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-1">Tone</div>
                <div className="flex flex-wrap gap-2">
                  {tones.map((t) => (
                    <button key={t} onClick={() => set({ voice: { ...f.voice, tone: t } })} className={`border-2 border-black px-4 py-2 font-bold ${f.voice.tone === t ? "bg-[#002FA7] text-white" : "bg-white"}`}>{t}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {step === 8 && (
            <div className="space-y-3">
              <h3 className="font-display font-black text-xl">Business hours</h3>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map(([lbl, d]) => {
                  const on = f.business_hours.days.includes(d);
                  return <button key={d} onClick={() => set({ business_hours: { ...f.business_hours, days: on ? f.business_hours.days.filter((x) => x !== d) : [...f.business_hours.days, d] } })} className={`border-2 border-black px-3 py-1.5 text-sm font-bold ${on ? "bg-[#002FA7] text-white" : "bg-white"}`}>{lbl}</button>;
                })}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">Opening<input type="time" value={f.business_hours.open} onChange={(e) => set({ business_hours: { ...f.business_hours, open: e.target.value } })} className="border-2 border-black px-3 py-2 w-full mt-1" /></label>
                <label className="text-sm">Closing<input type="time" value={f.business_hours.close} onChange={(e) => set({ business_hours: { ...f.business_hours, close: e.target.value } })} className="border-2 border-black px-3 py-2 w-full mt-1" /></label>
              </div>
              <label className="text-sm block">Timezone
                <select value={f.business_hours.timezone} onChange={(e) => set({ business_hours: { ...f.business_hours, timezone: e.target.value } })} className="border-2 border-black px-3 py-2 w-full mt-1">
                  {TZS.map((t) => <option key={t}>{t}</option>)}
                </select>
              </label>
              <p className="text-xs text-neutral-500">The AI never calls outside these hours.</p>
            </div>
          )}
          {step === 9 && (
            <div className="space-y-3">
              <h3 className="font-display font-black text-xl">Daily call limit</h3>
              <div className="flex flex-wrap gap-2">
                {limits.map((n) => (
                  <button key={n} onClick={() => set({ daily_limit: n })} data-testid={`wz-limit-${n}`} className={`border-2 border-black px-4 py-2 font-bold ${f.daily_limit === n ? "bg-[#002FA7] text-white" : "bg-white"}`}>{n}</button>
                ))}
              </div>
              <label className="text-sm block">Custom
                <input type="number" min={1} value={f.daily_limit} onChange={(e) => set({ daily_limit: parseInt(e.target.value || "0", 10) })} className="border-2 border-black px-3 py-2 w-full mt-1" />
              </label>
            </div>
          )}
          {step === 10 && (
            <div className="space-y-3">
              <h3 className="font-display font-black text-xl">Retry rules</h3>
              <div className="flex flex-col gap-2">
                {[["on_no_answer", "Retry on No Answer"], ["on_busy", "Retry on Busy"], ["on_voicemail", "Retry on Voicemail"]].map(([k, lbl]) => (
                  <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.retry[k]} onChange={() => set({ retry: { ...f.retry, [k]: !f.retry[k] } })} /> {lbl}</label>
                ))}
              </div>
              <label className="text-sm block">Maximum attempts
                <select value={f.retry.max_attempts} onChange={(e) => set({ retry: { ...f.retry, max_attempts: parseInt(e.target.value, 10) } })} className="border-2 border-black px-3 py-2 w-full mt-1">
                  {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label className="text-sm block">Retry after
                <select value={f.retry.retry_after} onChange={(e) => set({ retry: { ...f.retry, retry_after: e.target.value } })} className="border-2 border-black px-3 py-2 w-full mt-1">
                  <option value="30m">30 minutes</option>
                  <option value="2h">2 hours</option>
                  <option value="tomorrow">Tomorrow</option>
                  <option value="custom">Custom (minutes)</option>
                </select>
              </label>
              {f.retry.retry_after === "custom" && <input type="number" min={5} value={f.retry.retry_after_minutes} onChange={(e) => set({ retry: { ...f.retry, retry_after_minutes: parseInt(e.target.value || "0", 10) } })} placeholder="Minutes" className="border-2 border-black px-3 py-2 w-full" />}
            </div>
          )}
          {step === 11 && (
            <div className="space-y-2" data-testid="wz-review">
              <h3 className="font-display font-black text-xl">Review & launch</h3>
              <dl className="text-sm border-2 border-black divide-y divide-black">
                {[
                  ["Name", f.name],
                  ["Lists", `${f.list_ids.length} selected (~${totalProspects} prospects)`],
                  ["Industry", f.industry || "—"],
                  ["Goal", f.goal === "custom" ? f.goal_custom : (goals.find((g) => g.id === f.goal)?.label || f.goal)],
                  ["Language", f.language],
                  ["Voice", `${f.voice.gender} · ${f.voice.tone}`],
                  ["Hours", `${f.business_hours.open}–${f.business_hours.close} ${f.business_hours.timezone}`],
                  ["Daily limit", f.daily_limit],
                  ["Retry", `max ${f.retry.max_attempts}, after ${f.retry.retry_after}`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 px-3 py-1.5"><dt className="text-neutral-500">{k}</dt><dd className="font-bold text-right">{String(v)}</dd></div>
                ))}
              </dl>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t-2 border-black px-5 py-3 gap-3">
          <button onClick={() => (step === 1 ? onClose() : setStep(step - 1))} className="border-2 border-black px-4 py-2 font-bold bg-white hover-lift">
            {step === 1 ? "Cancel" : <><ChevronLeft size={15} className="inline -mt-0.5" /> Back</>}
          </button>
          {step < TOTAL ? (
            <button onClick={() => canNext() ? setStep(step + 1) : toast.error("Please complete this step")} data-testid="wz-next" className="border-2 border-black px-5 py-2 font-bold bg-[#002FA7] text-white shadow-brutal hover-lift">Next <ChevronRight size={15} className="inline -mt-0.5" /></button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => submit(false)} disabled={saving} data-testid="wz-save-draft" className="border-2 border-black px-4 py-2 font-bold bg-white hover-lift disabled:opacity-60">Save draft</button>
              <button onClick={() => submit(true)} disabled={saving} data-testid="wz-launch" className="border-2 border-black px-5 py-2 font-bold bg-green-500 text-black shadow-brutal hover-lift disabled:opacity-60">
                {saving ? <Loader2 size={15} className="inline animate-spin" /> : <><Play size={15} className="inline -mt-0.5 mr-1" /> Launch</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────── Campaigns list ───
function CampaignsPanel({ campaigns, options, lists, reload, onOpenHistory }) {
  const [wizard, setWizard] = useState(false);
  const act = async (id, action) => {
    try {
      if (action === "delete") { await api.delete(`${API}/campaigns/${id}`); }
      else { await api.post(`${API}/campaigns/${id}/${action}`); }
      toast.success(`Campaign ${action}d`);
      reload();
    } catch (e) { toast.error(e?.response?.data?.detail || `Could not ${action}`); }
  };
  return (
    <div className="space-y-4" data-testid="oc-campaigns">
      <div className="flex justify-between items-center">
        <div className="text-sm text-neutral-600">{campaigns.length} campaign(s)</div>
        <button onClick={() => setWizard(true)} data-testid="oc-new-campaign" className="bg-[#002FA7] text-white border-2 border-black shadow-brutal px-4 py-2 font-bold hover-lift"><Plus size={15} className="inline -mt-0.5 mr-1" /> New Campaign</button>
      </div>
      {campaigns.length === 0 ? (
        <div className="border-2 border-black bg-white shadow-brutal p-10 text-center">
          <PhoneCall size={32} className="mx-auto text-neutral-400" />
          <div className="mt-3 font-display font-black text-xl">No campaigns yet</div>
          <p className="text-sm text-neutral-600 mt-1">Create your first outbound AI calling campaign.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const pct = c.total_prospects ? Math.round((c.completed_prospects / c.total_prospects) * 100) : 0;
            return (
              <div key={c.id} data-testid={`oc-campaign-${c.id}`} className="border-2 border-black bg-white shadow-brutal p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-display font-black text-lg">{c.name}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 border border-black ${STATUS_STYLES[c.status] || "bg-neutral-200"}`}>{c.status}</span>
                      {c.paused_reason === "no_minutes" && <span className="text-[10px] font-bold uppercase text-red-700">out of minutes</span>}
                    </div>
                    <div className="text-xs text-neutral-500 mt-1">{c.industry || "—"} · goal: {c.goal} · {c.completed_prospects}/{c.total_prospects} done ({pct}%)</div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {(c.status === "draft" || c.status === "paused") && <button onClick={() => act(c.id, c.status === "draft" ? "launch" : "resume")} data-testid={`oc-launch-${c.id}`} className="border-2 border-black px-3 py-1.5 text-sm font-bold bg-green-400 hover-lift"><Play size={13} className="inline -mt-0.5" /> {c.status === "draft" ? "Launch" : "Resume"}</button>}
                    {c.status === "running" && <button onClick={() => act(c.id, "pause")} data-testid={`oc-pause-${c.id}`} className="border-2 border-black px-3 py-1.5 text-sm font-bold bg-yellow-300 hover-lift"><Pause size={13} className="inline -mt-0.5" /> Pause</button>}
                    <button onClick={() => onOpenHistory(c)} className="border-2 border-black px-3 py-1.5 text-sm font-bold bg-white hover-lift"><History size={13} className="inline -mt-0.5" /> Calls</button>
                    {c.status !== "running" && <button onClick={() => act(c.id, "cancel")} className="border-2 border-black px-2 py-1.5 text-sm font-bold bg-white hover-lift" title="Cancel"><X size={13} /></button>}
                    {c.status !== "running" && <button onClick={() => { if (window.confirm("Delete this campaign?")) act(c.id, "delete"); }} data-testid={`oc-delete-${c.id}`} className="border-2 border-black px-2 py-1.5 text-sm font-bold bg-red-100 hover-lift"><Trash2 size={13} /></button>}
                  </div>
                </div>
                {c.total_prospects > 0 && <div className="h-2 border-2 border-black mt-3"><div className="h-full bg-[#002FA7]" style={{ width: `${pct}%` }} /></div>}
              </div>
            );
          })}
        </div>
      )}
      {wizard && <Wizard options={options} lists={lists} onClose={() => setWizard(false)} onSaved={reload} />}
    </div>
  );
}

// ─────────────────────────────────────────────── Call Detail modal ───
const SENTIMENT_STYLE = { positive: "bg-green-100 text-green-800", neutral: "bg-neutral-100 text-neutral-700", negative: "bg-red-100 text-red-800" };

function CallDetail({ callId, onClose }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [audio, setAudio] = useState(null);
  const [loadingAudio, setLoadingAudio] = useState(false);
  useEffect(() => {
    api.get(`${API}/calls/${callId}`).then(({ data }) => setD(data)).catch(() => toast.error("Could not load call")).finally(() => setLoading(false));
  }, [callId]);
  const loadRecording = async () => {
    setLoadingAudio(true);
    try {
      const res = await api.get(`${API}/calls/${callId}/recording`, { responseType: "blob" });
      setAudio(URL.createObjectURL(res.data));
    } catch { toast.error("Recording not available yet"); }
    finally { setLoadingAudio(false); }
  };
  const s = d?.summary;
  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-start justify-center p-2 sm:p-4 overflow-y-auto" data-testid="oc-call-detail">
      <div className="bg-white border-2 border-black shadow-brutal-lg w-full max-w-3xl my-4">
        <div className="flex items-center justify-between border-b-2 border-black px-5 py-3 bg-[#002FA7] text-white sticky top-0">
          <div className="font-display font-black flex items-center gap-2"><PhoneCall size={18} /> Call detail</div>
          <button onClick={onClose} data-testid="oc-detail-close"><X size={20} /></button>
        </div>
        {loading ? <div className="p-8 font-mono text-sm">Loading…</div> : d && (
          <div className="p-5 space-y-5">
            {/* Customer + meta */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="border-2 border-black p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Customer</div>
                <div className="font-display font-black text-lg">{d.call.name || "Unknown"}</div>
                <div className="text-sm text-neutral-600">{d.call.company || "—"}</div>
                <div className="text-sm font-mono">{d.call.phone}</div>
              </div>
              <div className="border-2 border-black p-4 text-sm space-y-1">
                <div><span className="text-neutral-500">Campaign:</span> <b>{d.campaign?.name}</b></div>
                <div><span className="text-neutral-500">Outcome:</span> <span className={`px-2 py-0.5 text-xs font-bold ${OUTCOME_STYLES[d.call.outcome] || "bg-neutral-100"}`}>{(d.call.outcome || "—").replace(/_/g, " ")}</span></div>
                <div><span className="text-neutral-500">Duration:</span> {fmtDur(d.call.duration_sec)} · <span className="text-neutral-500">Attempt</span> {d.call.attempt_no}</div>
                <div><span className="text-neutral-500">When:</span> {(d.meta.started_at || "").slice(0, 16).replace("T", " ")}</div>
              </div>
            </div>

            {/* Recording */}
            <div className="border-2 border-black p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2 flex items-center gap-1"><Volume2 size={12} /> Recording</div>
              {audio ? (
                <audio controls src={audio} className="w-full" data-testid="oc-detail-audio" />
              ) : d.has_recording ? (
                <button onClick={loadRecording} disabled={loadingAudio} data-testid="oc-load-recording" className="border-2 border-black px-4 py-2 font-bold bg-white hover-lift disabled:opacity-60">
                  {loadingAudio ? <Loader2 size={14} className="inline animate-spin" /> : <Play size={14} className="inline -mt-0.5 mr-1" />} Load recording
                </button>
              ) : <div className="text-sm text-neutral-500">No recording (call not answered or still processing).</div>}
            </div>

            {/* AI summary */}
            <div className="border-2 border-black p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2 flex items-center gap-1"><Sparkles size={12} /> AI summary</div>
              {!s ? <div className="text-sm text-neutral-500">Summary is generated shortly after an answered call.</div> : (
                <div className="space-y-3 text-sm">
                  <p className="text-neutral-800">{s.summary}</p>
                  <div className="flex flex-wrap gap-2">
                    <span className={`px-2 py-0.5 text-xs font-bold ${SENTIMENT_STYLE[s.sentiment] || "bg-neutral-100"}`}>{s.sentiment}</span>
                    <span className="px-2 py-0.5 text-xs font-bold bg-blue-100 text-blue-800">Intent: {s.intent || "—"}</span>
                    <span className="px-2 py-0.5 text-xs font-bold bg-neutral-100">Confidence {s.confidence}%</span>
                  </div>
                  {s.next_action && <div><b>Next action:</b> {s.next_action}</div>}
                  {s.notes && <div><b>Notes:</b> {s.notes}</div>}
                  {(s.key_questions || []).length > 0 && (
                    <div><b>Key questions:</b><ul className="list-disc ml-5">{s.key_questions.map((q, i) => <li key={i}>{q}</li>)}</ul></div>
                  )}
                  {s.entities && Object.values(s.entities).some(Boolean) && (
                    <div className="grid grid-cols-2 gap-1 border-t border-black/10 pt-2">
                      {Object.entries(s.entities).filter(([, v]) => v).map(([k, v]) => (
                        <div key={k}><span className="text-neutral-500">{k.replace(/_/g, " ")}:</span> <b>{v}</b></div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Transcript */}
            <div className="border-2 border-black p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Transcript</div>
              {d.transcript.length === 0 ? <div className="text-sm text-neutral-500">No transcript captured.</div> : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {d.transcript.map((m, i) => (
                    <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                      <div className={`px-3 py-1.5 text-sm border-2 border-black max-w-[80%] ${m.role === "user" ? "bg-white" : "bg-[#002FA7] text-white"}`}>{m.content}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Metadata + retry */}
            <div className="grid sm:grid-cols-2 gap-4 text-xs font-mono text-neutral-600">
              <div className="border-2 border-black p-3">
                <div className="font-bold uppercase tracking-widest mb-1">Metadata</div>
                <div>Model: {d.meta.model}</div>
                <div>Voice: {d.meta.voice?.gender} / {d.meta.voice?.tone}</div>
                <div>Language: {d.meta.language}</div>
                <div>Minutes: {d.meta.minutes}</div>
              </div>
              <div className="border-2 border-black p-3">
                <div className="font-bold uppercase tracking-widest mb-1">Attempts</div>
                <div>Total attempts: {d.prospect?.attempts ?? d.call.attempt_no}</div>
                <div>Status: {d.prospect?.status || "—"}</div>
                {d.prospect?.next_attempt_at && <div>Next retry: {d.prospect.next_attempt_at.slice(0, 16).replace("T", " ")}</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────── Call History ───
const OUTCOME_OPTS = ["answered", "interested", "appointment_booked", "callback_requested", "not_interested", "no_answer", "busy", "voicemail", "failed"];

function HistoryPanel({ campaigns, initial }) {
  const [cid, setCid] = useState(initial?.id || (campaigns[0]?.id || ""));
  const [calls, setCalls] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [flt, setFlt] = useState({ outcome: "", status: "", q: "", date_from: "", date_to: "", sort: "started_at", order: -1 });
  const [offset, setOffset] = useState(0);
  const LIMIT = 25;

  const load = async () => {
    if (!cid) { setCalls([]); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: LIMIT, offset, sort: flt.sort, order: flt.order });
      ["outcome", "status", "q", "date_from", "date_to"].forEach((k) => flt[k] && params.append(k, flt[k]));
      const { data } = await api.get(`${API}/campaigns/${cid}/calls?${params}`);
      setCalls(data.items); setTotal(data.total);
    } catch { setCalls([]); } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [cid, offset, flt]);
  useEffect(() => { setOffset(0); }, [cid, flt.outcome, flt.status, flt.q, flt.date_from, flt.date_to]);

  const exportCalls = async (fmt) => {
    try {
      const params = new URLSearchParams({ fmt });
      ["outcome", "status", "q", "date_from", "date_to"].forEach((k) => flt[k] && params.append(k, flt[k]));
      const res = await api.get(`${API}/campaigns/${cid}/calls/export?${params}`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a"); a.href = url; a.download = `calls.${fmt === "xlsx" ? "xlsx" : "csv"}`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Export failed"); }
  };
  const setF = (p) => setFlt((x) => ({ ...x, ...p }));

  return (
    <div className="space-y-4" data-testid="oc-history">
      <div className="flex flex-wrap gap-2 items-center">
        <select value={cid} onChange={(e) => setCid(e.target.value)} data-testid="oc-history-select" className="border-2 border-black px-3 py-2 font-bold">
          <option value="">Select a campaign…</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {cid && (
          <>
            <button onClick={() => exportCalls("csv")} data-testid="oc-export-csv" className="border-2 border-black px-3 py-2 text-sm font-bold bg-white hover-lift"><Download size={13} className="inline -mt-0.5 mr-1" />CSV</button>
            <button onClick={() => exportCalls("xlsx")} data-testid="oc-export-xlsx" className="border-2 border-black px-3 py-2 text-sm font-bold bg-white hover-lift"><Download size={13} className="inline -mt-0.5 mr-1" />Excel</button>
          </>
        )}
      </div>

      {cid && (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center border-2 border-black px-2 bg-white">
            <Search size={14} />
            <input value={flt.q} onChange={(e) => setF({ q: e.target.value })} placeholder="Search name/phone" data-testid="oc-history-search" className="px-2 py-1.5 text-sm outline-none w-40" />
          </div>
          <select value={flt.outcome} onChange={(e) => setF({ outcome: e.target.value })} data-testid="oc-history-outcome" className="border-2 border-black px-2 py-1.5 text-sm">
            <option value="">All outcomes</option>
            {OUTCOME_OPTS.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
          </select>
          <input type="date" value={flt.date_from} onChange={(e) => setF({ date_from: e.target.value })} className="border-2 border-black px-2 py-1.5 text-sm" />
          <input type="date" value={flt.date_to} onChange={(e) => setF({ date_to: e.target.value })} className="border-2 border-black px-2 py-1.5 text-sm" />
          <select value={`${flt.sort}:${flt.order}`} onChange={(e) => { const [s, o] = e.target.value.split(":"); setF({ sort: s, order: parseInt(o, 10) }); }} className="border-2 border-black px-2 py-1.5 text-sm">
            <option value="started_at:-1">Newest first</option>
            <option value="started_at:1">Oldest first</option>
            <option value="duration_sec:-1">Longest calls</option>
            <option value="attempt_no:-1">Most attempts</option>
          </select>
        </div>
      )}

      {loading ? <div className="font-mono text-sm p-4">Loading…</div> : (
        <div className="border-2 border-black bg-white shadow-brutal overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-100 border-b-2 border-black">
              <tr className="text-left">
                {["Name", "Company", "Phone", "Date", "Duration", "Attempt", "Status", "Outcome", ""].map((h) => <th key={h} className="px-3 py-2 font-bold whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {calls.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-neutral-500">No calls found.</td></tr>}
              {calls.map((c) => (
                <tr key={c.id} data-testid={`oc-call-${c.id}`} className="hover:bg-blue-50 cursor-pointer" onClick={() => setDetailId(c.id)}>
                  <td className="px-3 py-2 whitespace-nowrap">{c.name || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{c.company || "—"}</td>
                  <td className="px-3 py-2 font-mono whitespace-nowrap">{c.phone}</td>
                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{(c.started_at || "").slice(0, 16).replace("T", " ")}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDur(c.duration_sec)}</td>
                  <td className="px-3 py-2 text-center">{c.attempt_no}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{c.status}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{c.outcome ? <span className={`px-2 py-0.5 text-xs font-bold ${OUTCOME_STYLES[c.outcome] || "bg-neutral-100"}`}>{c.outcome.replace(/_/g, " ")}</span> : "—"}</td>
                  <td className="px-3 py-2 text-[#002FA7] font-bold text-xs">View →</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > LIMIT && (
        <div className="flex items-center justify-between text-sm">
          <span className="font-mono text-neutral-600">{offset + 1}–{Math.min(offset + LIMIT, total)} of {total}</span>
          <div className="flex gap-2">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))} className="border-2 border-black px-3 py-1 font-bold disabled:opacity-40"><ChevronLeft size={14} /></button>
            <button disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)} className="border-2 border-black px-3 py-1 font-bold disabled:opacity-40"><ChevronRight size={14} /></button>
          </div>
        </div>
      )}

      {detailId && <CallDetail callId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

// ─────────────────────────────────────────────── Analytics ───
const PIE_COLORS = ["#002FA7", "#22c55e", "#f59e0b", "#a855f7", "#ef4444", "#0ea5e9", "#64748b", "#10b981"];

function AnalyticsPanel({ campaigns }) {
  const [cid, setCid] = useState(campaigns[0]?.id || "");
  const [a, setA] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!cid) { setA(null); return; }
    setLoading(true);
    api.get(`${API}/campaigns/${cid}/analytics`).then(({ data }) => setA(data)).catch(() => setA(null)).finally(() => setLoading(false));
  }, [cid]);

  const pieData = a ? Object.entries(a.outcome_distribution).map(([k, v]) => ({ name: (k || "pending").replace(/_/g, " "), value: v })) : [];
  const rateBars = a ? [
    { name: "Answer", val: a.answer_rate, color: "#22c55e" },
    { name: "Interest", val: a.interest_rate, color: "#10b981" },
    { name: "Conversion", val: a.conversion_rate, color: "#002FA7" },
    { name: "Completion", val: a.completion_percentage, color: "#f59e0b" },
  ] : [];

  return (
    <div className="space-y-5" data-testid="oc-analytics">
      <select value={cid} onChange={(e) => setCid(e.target.value)} data-testid="oc-analytics-select" className="border-2 border-black px-3 py-2 font-bold">
        <option value="">Select a campaign…</option>
        {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      {loading && <div className="font-mono text-sm p-4">Loading…</div>}
      {!loading && !a && <div className="border-2 border-black bg-white shadow-brutal p-8 text-center text-neutral-500">Select a campaign to view analytics.</div>}
      {a && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <Kpi label="Total Prospects" value={a.total_prospects} />
            <Kpi label="Completed Calls" value={a.completed_calls} />
            <Kpi label="Remaining" value={a.remaining_calls} />
            <Kpi label="Answered" value={a.answered} tone="text-green-700" />
            <Kpi label="Appointments" value={a.appointments} tone="text-emerald-700" />
            <Kpi label="Interested" value={a.interested} tone="text-emerald-700" />
            <Kpi label="Transferred" value={a.transferred} />
            <Kpi label="No Answer" value={a.no_answer} />
            <Kpi label="Busy" value={a.busy} />
            <Kpi label="Voicemail" value={a.voicemail} />
            <Kpi label="Avg Duration" value={fmtDur(a.avg_duration_sec)} />
            <Kpi label="Retry Count" value={a.retry_count} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="border-2 border-black bg-white shadow-brutal p-4">
              <div className="text-xs font-bold uppercase tracking-widest text-neutral-600 mb-3">Performance rates</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={rateBars}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis unit="%" tick={{ fontSize: 12 }} domain={[0, 100]} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Bar dataKey="val" radius={[4, 4, 0, 0]}>
                    {rateBars.map((r, i) => <Cell key={i} fill={r.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="border-2 border-black bg-white shadow-brutal p-4">
              <div className="text-xs font-bold uppercase tracking-widest text-neutral-600 mb-3">Outcome distribution</div>
              {pieData.length === 0 ? <div className="text-sm text-neutral-500 py-16 text-center">No calls yet.</div> : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={80} label>
                      {pieData.map((e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="border-2 border-black bg-white shadow-brutal p-4">
            <div className="text-xs font-bold uppercase tracking-widest text-neutral-600 mb-3">Calls per day</div>
            {a.per_day.length === 0 ? <div className="text-sm text-neutral-500 py-10 text-center">No activity yet.</div> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={a.per_day}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="calls" fill="#002FA7" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="answered" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Kpi label="Voice Minutes Used" value={a.voice_minutes_used} />
            <Kpi label="Minutes Remaining" value={a.voice_minutes_remaining} tone="text-[#002FA7]" />
            <Kpi label="Completion %" value={`${a.completion_percentage}%`} />
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────── Root ───
export default function OutboundCalls() {
  const [sub, setSub] = useState("dashboard");
  const [data, setData] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [lists, setLists] = useState([]);
  const [historyCamp, setHistoryCamp] = useState(null);

  const reload = async () => {
    try {
      const [d, cs] = await Promise.all([api.get(`${API}/dashboard`), api.get(`${API}/campaigns`)]);
      setData(d.data);
      setCampaigns(cs.data.items);
    } catch (e) { /* handled by parent access gate */ }
  };
  useEffect(() => {
    reload();
    api.get("/sales/lists").then(({ data }) => setLists(data.items || [])).catch(() => {});
    const t = setInterval(reload, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, []);

  const openHistory = (c) => { setHistoryCamp(c); setSub("history"); };

  return (
    <div className="space-y-5" data-testid="outbound-calls">
      <div className="flex flex-wrap gap-2">
        {SUBTABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setSub(t.id)} data-testid={`oc-subtab-${t.id}`}
              className={`px-3 py-2 text-sm font-bold border-2 border-black flex items-center gap-1.5 ${sub === t.id ? "bg-[#002FA7] text-white shadow-brutal" : "bg-white hover-lift"}`}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {sub === "dashboard" && <DashboardPanel data={data} campaigns={campaigns} onGoBilling={() => (window.location.href = "/app/billing")} />}
      {sub === "campaigns" && <CampaignsPanel campaigns={campaigns} options={data?.options} lists={lists} reload={reload} onOpenHistory={openHistory} />}
      {sub === "history" && <HistoryPanel campaigns={campaigns} initial={historyCamp} />}
      {sub === "analytics" && <AnalyticsPanel campaigns={campaigns} />}
    </div>
  );
}
