import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { X, Clock, User, Save, CalendarClock, Ban, History } from "lucide-react";

const STATUSES = [
  { k: "pending", label: "Pending" },
  { k: "scheduled", label: "Scheduled" },
  { k: "confirmed", label: "Confirmed" },
  { k: "completed", label: "Completed" },
  { k: "no_show", label: "No show" },
];

function fmt(iso, tz) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short", timeZone: tz || undefined }); }
  catch { return iso; }
}

export default function AppointmentDetailDrawer({ appt, onClose, onChanged }) {
  const [detail, setDetail] = useState(appt);
  const [activity, setActivity] = useState([]);
  const [notes, setNotes] = useState(appt?.internal_notes || "");
  const [rescheduleAt, setRescheduleAt] = useState("");
  const [busy, setBusy] = useState(false);

  const loadActivity = () => api.get(`/scheduling/appointments/${appt.id}/activity`).then((r) => { setActivity(r.data.activity || []); setDetail(r.data.appointment); setNotes(r.data.appointment?.internal_notes || ""); }).catch(() => {});
  useEffect(() => { loadActivity(); /* eslint-disable-next-line */ }, [appt?.id]);

  const done = () => { onChanged && onChanged(); };

  const setStatus = async (status) => {
    setBusy(true);
    try { await api.post(`/scheduling/appointments/${appt.id}/status`, { status }); toast.success("Status updated"); await loadActivity(); done(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };
  const saveNotes = async () => {
    setBusy(true);
    try { await api.put(`/scheduling/appointments/${appt.id}/notes`, { internal_notes: notes }); toast.success("Notes saved"); await loadActivity(); done(); }
    catch { toast.error("Failed"); } finally { setBusy(false); }
  };
  const doReschedule = async () => {
    if (!rescheduleAt) return toast.error("Pick a new date & time");
    setBusy(true);
    try {
      await api.post(`/scheduling/appointments/${appt.id}/reschedule`, { start_at: new Date(rescheduleAt).toISOString() });
      toast.success("Rescheduled"); setRescheduleAt(""); await loadActivity(); done();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };
  const doCancel = async () => {
    if (!window.confirm("Cancel this appointment?")) return;
    setBusy(true);
    try { await api.post(`/scheduling/appointments/${appt.id}/cancel`, { status: "cancelled", reason: "" }); toast.success("Cancelled"); await loadActivity(); done(); }
    catch { toast.error("Failed"); } finally { setBusy(false); }
  };

  const tz = detail?.customer_timezone;
  const when = detail?.start_at || detail?.scheduled_at;

  return (
    <div className="fixed inset-0 z-50 flex" data-testid="appt-detail-drawer">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-md bg-white border-l-2 border-black h-full overflow-y-auto shadow-brutal-lg">
        <div className="h-14 border-b-2 border-black px-4 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="font-display font-black text-lg truncate">{detail?.customer_name || "Appointment"}</div>
          <button onClick={onClose} className="p-1" data-testid="drawer-close"><X size={20} /></button>
        </div>
        <div className="p-4 space-y-5">
          {/* Summary */}
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center gap-2"><User size={14} /> {detail?.customer_name || "—"} <span className="font-mono text-xs text-neutral-500">{detail?.customer_contact}</span></div>
            <div className="flex items-center gap-2"><Clock size={14} /> {fmt(when, tz)} {detail?.duration_minutes ? <span className="text-xs text-neutral-500">· {detail.duration_minutes} min</span> : null}</div>
            {detail?.appointment_type_name && <div className="text-xs"><span className="inline-block px-2 py-0.5 border-2 border-black font-bold" style={{ background: (detail.color || "#eee") + "22" }}>{detail.appointment_type_name}</span></div>}
            <div className="text-xs font-mono text-neutral-500">Source: {detail?.source || "manual"} · Status: <strong>{detail?.status || "scheduled"}</strong></div>
          </div>

          {/* Status */}
          <div>
            <div className="text-xs font-bold tracking-widest uppercase mb-2">Set status</div>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <button key={s.k} disabled={busy} onClick={() => setStatus(s.k)} data-testid={`drawer-status-${s.k}`} className={`text-xs font-bold border-2 border-black px-3 py-1.5 hover-lift ${detail?.status === s.k ? "bg-[#002FA7] text-white" : "bg-white"}`}>{s.label}</button>
              ))}
            </div>
          </div>

          {/* Reschedule */}
          <div>
            <div className="text-xs font-bold tracking-widest uppercase mb-2 flex items-center gap-1"><CalendarClock size={13} /> Reschedule</div>
            <div className="flex gap-2">
              <input type="datetime-local" data-testid="drawer-reschedule-input" value={rescheduleAt} onChange={(e) => setRescheduleAt(e.target.value)} className="flex-1 border-2 border-black px-2 py-1.5 text-sm" />
              <button disabled={busy} onClick={doReschedule} data-testid="drawer-reschedule-btn" className="border-2 border-black px-3 py-1.5 font-bold text-sm hover-lift bg-white">Move</button>
            </div>
          </div>

          {/* Internal notes */}
          <div>
            <div className="text-xs font-bold tracking-widest uppercase mb-2">Internal notes <span className="text-neutral-400 normal-case font-normal">(never shown to customer)</span></div>
            <textarea data-testid="drawer-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border-2 border-black px-3 py-2 text-sm" placeholder="Prep, requirements, follow-up…" />
            <button disabled={busy} onClick={saveNotes} data-testid="drawer-notes-save" className="mt-2 text-xs font-bold border-2 border-black px-3 py-1.5 hover-lift bg-white flex items-center gap-1"><Save size={12} /> Save notes</button>
          </div>

          {/* Cancel */}
          <button disabled={busy} onClick={doCancel} data-testid="drawer-cancel-btn" className="w-full border-2 border-black px-3 py-2 font-bold text-sm hover-lift bg-red-50 text-red-700 flex items-center justify-center gap-2"><Ban size={14} /> Cancel appointment</button>

          {/* Activity */}
          <div>
            <div className="text-xs font-bold tracking-widest uppercase mb-2 flex items-center gap-1"><History size={13} /> Activity log</div>
            <div className="space-y-2" data-testid="drawer-activity">
              {activity.length === 0 && <div className="text-xs text-neutral-500">No activity yet.</div>}
              {activity.map((a) => (
                <div key={a.id} className="border-l-2 border-black pl-2 text-xs">
                  <div className="font-bold">{a.action.replace(/_/g, " ")}</div>
                  {a.detail && <div className="text-neutral-600">{a.detail}</div>}
                  <div className="font-mono text-[10px] text-neutral-400">{a.actor} · {fmt(a.created_at)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
