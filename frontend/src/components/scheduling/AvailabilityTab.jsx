import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Save, Plane } from "lucide-react";

const DAYS = [
  { k: "mon", label: "Monday" },
  { k: "tue", label: "Tuesday" },
  { k: "wed", label: "Wednesday" },
  { k: "thu", label: "Thursday" },
  { k: "fri", label: "Friday" },
  { k: "sat", label: "Saturday" },
  { k: "sun", label: "Sunday" },
];

const DURATIONS = [15, 20, 30, 45, 60, 90, 120];

function tzList() {
  try {
    if (typeof Intl.supportedValuesOf === "function") return Intl.supportedValuesOf("timeZone");
  } catch { /* ignore */ }
  return ["UTC", "America/Toronto", "America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Kolkata", "Asia/Dubai", "Australia/Sydney"];
}

export default function AvailabilityTab() {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  const zones = tzList();

  const load = () => api.get("/scheduling/settings").then((r) => setS(r.data));
  useEffect(() => { load(); }, []);

  if (!s) return <div className="p-10 font-mono text-sm">Loading…</div>;

  const setField = (k, v) => setS({ ...s, [k]: v });
  const week = s.week || {};

  const addSession = (day) => {
    const list = [...(week[day] || []), { start: "09:00", end: "17:00" }];
    setS({ ...s, week: { ...week, [day]: list } });
  };
  const rmSession = (day, i) => {
    const list = (week[day] || []).filter((_, idx) => idx !== i);
    setS({ ...s, week: { ...week, [day]: list } });
  };
  const updSession = (day, i, field, v) => {
    const list = [...(week[day] || [])];
    list[i] = { ...list[i], [field]: v };
    setS({ ...s, week: { ...week, [day]: list } });
  };

  const addException = () => {
    const ex = [...(s.exceptions || []), { date: "", type: "closed", label: "" }];
    setS({ ...s, exceptions: ex });
  };
  const updException = (i, field, v) => {
    const ex = [...(s.exceptions || [])];
    ex[i] = { ...ex[i], [field]: v };
    setS({ ...s, exceptions: ex });
  };
  const rmException = (i) => setS({ ...s, exceptions: (s.exceptions || []).filter((_, idx) => idx !== i) });

  const vacation = s.vacation || { enabled: false, start: null, end: null };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        timezone: s.timezone,
        week: Object.fromEntries(DAYS.map((d) => [d.k, (week[d.k] || [])])),
        buffer_before: Number(s.buffer_before) || 0,
        buffer_after: Number(s.buffer_after) || 0,
        default_duration: Number(s.default_duration) || 30,
        slot_interval: Number(s.slot_interval) || 30,
        min_notice_hours: Number(s.min_notice_hours) || 0,
        booking_enabled: !!s.booking_enabled,
        exceptions: (s.exceptions || []).filter((e) => e.date),
        vacation,
      };
      const { data } = await api.put("/scheduling/settings", payload);
      setS(data);
      toast.success("Availability saved");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6" data-testid="availability-tab">
      {/* General */}
      <div className="border-2 border-black bg-white p-4 sm:p-6 space-y-4">
        <div className="font-display font-black text-xl">General</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <label className="block">
            <span className="text-xs font-bold tracking-widest uppercase">Timezone</span>
            <select data-testid="avail-timezone" value={s.timezone || "UTC"} onChange={(e) => setField("timezone", e.target.value)} className="w-full mt-1 border-2 border-black px-3 py-2 text-sm">
              {zones.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-bold tracking-widest uppercase">Default duration</span>
            <select data-testid="avail-duration" value={s.default_duration} onChange={(e) => setField("default_duration", Number(e.target.value))} className="w-full mt-1 border-2 border-black px-3 py-2 text-sm">
              {DURATIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-bold tracking-widest uppercase">Slot interval (min)</span>
            <input type="number" min="5" step="5" data-testid="avail-interval" value={s.slot_interval} onChange={(e) => setField("slot_interval", e.target.value)} className="w-full mt-1 border-2 border-black px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-bold tracking-widest uppercase">Buffer before (min)</span>
            <input type="number" min="0" step="5" data-testid="avail-buffer-before" value={s.buffer_before} onChange={(e) => setField("buffer_before", e.target.value)} className="w-full mt-1 border-2 border-black px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-bold tracking-widest uppercase">Buffer after (min)</span>
            <input type="number" min="0" step="5" data-testid="avail-buffer-after" value={s.buffer_after} onChange={(e) => setField("buffer_after", e.target.value)} className="w-full mt-1 border-2 border-black px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-bold tracking-widest uppercase">Min notice (hours)</span>
            <input type="number" min="0" data-testid="avail-min-notice" value={s.min_notice_hours} onChange={(e) => setField("min_notice_hours", e.target.value)} className="w-full mt-1 border-2 border-black px-3 py-2 text-sm" />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" data-testid="avail-booking-enabled" checked={!!s.booking_enabled} onChange={(e) => setField("booking_enabled", e.target.checked)} />
          Online booking page enabled
        </label>
      </div>

      {/* Weekly schedule */}
      <div className="border-2 border-black bg-white p-4 sm:p-6 space-y-4">
        <div className="font-display font-black text-xl">Weekly schedule</div>
        <p className="text-sm text-neutral-600">Add multiple sessions per day for breaks (e.g. 9:00–12:00 and 13:00–17:00). No sessions = closed.</p>
        <div className="space-y-3">
          {DAYS.map((d) => {
            const list = week[d.k] || [];
            return (
              <div key={d.k} className="border-2 border-black p-3" data-testid={`avail-day-${d.k}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="font-bold w-28">{d.label}</div>
                  <div className="flex-1 min-w-[200px] space-y-2">
                    {list.length === 0 && <span className="text-xs font-mono text-neutral-500">Closed</span>}
                    {list.map((sess, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input type="time" data-testid={`avail-${d.k}-start-${i}`} value={sess.start} onChange={(e) => updSession(d.k, i, "start", e.target.value)} className="border-2 border-black px-2 py-1 text-sm" />
                        <span className="text-xs">–</span>
                        <input type="time" data-testid={`avail-${d.k}-end-${i}`} value={sess.end} onChange={(e) => updSession(d.k, i, "end", e.target.value)} className="border-2 border-black px-2 py-1 text-sm" />
                        <button onClick={() => rmSession(d.k, i)} className="text-red-600 p-1" data-testid={`avail-${d.k}-rm-${i}`}><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => addSession(d.k)} data-testid={`avail-${d.k}-add`} className="text-xs font-bold border-2 border-black px-2 py-1 flex items-center gap-1 hover-lift"><Plus size={12} /> Session</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Vacation + exceptions */}
      <div className="border-2 border-black bg-white p-4 sm:p-6 space-y-4">
        <div className="font-display font-black text-xl flex items-center gap-2"><Plane size={18} /> Time off</div>
        <div className="border-2 border-black p-3">
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" data-testid="avail-vacation-enabled" checked={!!vacation.enabled} onChange={(e) => setField("vacation", { ...vacation, enabled: e.target.checked })} />
            Vacation mode (block all bookings in a date range)
          </label>
          {vacation.enabled && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="text-xs font-bold">From <input type="date" data-testid="avail-vacation-start" value={vacation.start || ""} onChange={(e) => setField("vacation", { ...vacation, start: e.target.value })} className="ml-1 border-2 border-black px-2 py-1 text-sm" /></label>
              <label className="text-xs font-bold">To <input type="date" data-testid="avail-vacation-end" value={vacation.end || ""} onChange={(e) => setField("vacation", { ...vacation, end: e.target.value })} className="ml-1 border-2 border-black px-2 py-1 text-sm" /></label>
            </div>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold tracking-widest uppercase">Holidays & closed days</div>
            <button onClick={addException} data-testid="avail-add-exception" className="text-xs font-bold border-2 border-black px-2 py-1 flex items-center gap-1 hover-lift"><Plus size={12} /> Add date</button>
          </div>
          <div className="space-y-2">
            {(s.exceptions || []).map((ex, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2" data-testid={`avail-exception-${i}`}>
                <input type="date" value={ex.date || ""} onChange={(e) => updException(i, "date", e.target.value)} className="border-2 border-black px-2 py-1 text-sm" />
                <input type="text" placeholder="Label (e.g. Canada Day)" value={ex.label || ""} onChange={(e) => updException(i, "label", e.target.value)} className="border-2 border-black px-2 py-1 text-sm flex-1 min-w-[140px]" />
                <button onClick={() => rmException(i)} className="text-red-600 p-1"><Trash2 size={14} /></button>
              </div>
            ))}
            {(!s.exceptions || s.exceptions.length === 0) && <div className="text-xs text-neutral-500">No closed dates.</div>}
          </div>
        </div>
      </div>

      <button onClick={save} disabled={saving} data-testid="avail-save" className="bg-[#002FA7] text-white font-bold px-6 py-3 border-2 border-black shadow-brutal hover-lift disabled:opacity-60 flex items-center gap-2">
        <Save size={16} /> {saving ? "Saving…" : "Save availability"}
      </button>
    </div>
  );
}
