import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { Plus, CalendarDays, Globe, MessageCircle, Mail, MessageSquare, Phone, UserPlus, Check, X } from "lucide-react";

const SOURCE_META = {
  web: { icon: Globe, label: "Web", color: "bg-blue-100 text-blue-900" },
  whatsapp: { icon: MessageCircle, label: "WhatsApp", color: "bg-green-100 text-green-900" },
  email: { icon: Mail, label: "Email", color: "bg-purple-100 text-purple-900" },
  sms: { icon: MessageSquare, label: "SMS", color: "bg-orange-100 text-orange-900" },
  voice: { icon: Phone, label: "Phone Call", color: "bg-red-100 text-red-900" },
  manual: { icon: UserPlus, label: "Manual", color: "bg-neutral-100 text-neutral-900" },
};

const STATUS_META = {
  scheduled: { label: "Scheduled", color: "bg-blue-100 text-blue-900 border-blue-900" },
  cancelled_by_customer: { label: "Cancelled by Customer", color: "bg-red-100 text-red-900 border-red-900" },
  rescheduled_by_customer: { label: "Rescheduled by Customer", color: "bg-amber-100 text-amber-900 border-amber-900" },
  cancelled: { label: "Cancelled", color: "bg-neutral-200 text-neutral-700 border-neutral-700" },
  attended: { label: "Attended", color: "bg-green-100 text-green-900 border-green-900" },
};

function SourceBadge({ source }) {
  const meta = SOURCE_META[source] || SOURCE_META.manual;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 border border-black text-[10px] font-bold uppercase tracking-widest ${meta.color}`}>
      <Icon size={10} /> {meta.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.scheduled;
  return (
    <span className={`inline-block px-2 py-1 border text-[10px] font-bold uppercase tracking-widest ${meta.color}`}>
      {meta.label}
    </span>
  );
}

export default function Appointments() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ customer_name: "", customer_contact: "", scheduled_at: "", notes: "" });
  const [busy, setBusy] = useState("");

  const load = () => api.get("/appointments").then(r => setItems(r.data));
  useEffect(() => { load(); }, []);

  const create = async () => {
    try {
      await api.post("/appointments", form);
      toast.success("Appointment created");
      setOpen(false);
      setForm({ customer_name: "", customer_contact: "", scheduled_at: "", notes: "" });
      load();
    } catch { toast.error("Could not save"); }
  };

  const toggleAttended = async (appt) => {
    setBusy(appt.id);
    try {
      const next = !appt.attended;
      await api.patch(`/appointments/${appt.id}`, { attended: next });
      setItems(items.map(a => a.id === appt.id ? { ...a, attended: next } : a));
      toast.success(next ? "Marked as attended" : "Marked as not attended");
    } catch {
      toast.error("Could not update");
    } finally { setBusy(""); }
  };

  return (
    <div className="p-8" data-testid="appointments-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">Calendar</div>
          <h1 className="font-display text-4xl font-black tracking-tighter">Appointments</h1>
          <p className="text-sm text-neutral-600 mt-1">Track where each booking came from and whether the customer showed up.</p>
        </div>
        <button data-testid="new-appt-btn" onClick={() => setOpen(true)} className="bg-[#002FA7] text-white font-bold px-4 py-2 border-2 border-black shadow-brutal hover-lift flex items-center gap-2">
          <Plus size={16}/> New
        </button>
      </div>

      <div className="border-2 border-black bg-white mt-6 overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-black text-white text-left">
            <tr className="text-xs uppercase tracking-widest">
              <th className="p-3">Customer</th>
              <th className="p-3">Contact</th>
              <th className="p-3">When</th>
              <th className="p-3">Source</th>
              <th className="p-3">Status</th>
              <th className="p-3">Notes</th>
              <th className="p-3 text-right">Attended</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-neutral-500">
                <CalendarDays size={20} className="inline mr-2"/> No appointments yet.
              </td></tr>
            )}
            {items.map(a => (
              <tr key={a.id} className={`border-t border-black/10 ${a.attended ? "bg-green-50" : ""}`} data-testid={`appt-${a.id}`}>
                <td className="p-3 font-bold">{a.customer_name}</td>
                <td className="p-3 font-mono text-xs">{a.customer_contact || "—"}</td>
                <td className="p-3 font-mono text-xs">{a.scheduled_at || "—"}</td>
                <td className="p-3"><SourceBadge source={a.source || "manual"} /></td>
                <td className="p-3"><StatusBadge status={a.status || "scheduled"} /></td>
                <td className="p-3 text-neutral-700 max-w-xs">
                  <div className="truncate" title={a.notes || ""}>{a.notes || "—"}</div>
                  {a.customer_changes && a.customer_changes.length > 0 && (
                    <div className="mt-1 text-[10px] text-amber-700 font-bold">
                      ⚠️ {a.customer_changes[a.customer_changes.length - 1].changes.join(', ')}
                    </div>
                  )}
                </td>
                <td className="p-3 text-right">
                  <button
                    onClick={() => toggleAttended(a)}
                    disabled={busy === a.id}
                    data-testid={`attended-toggle-${a.id}`}
                    className={`inline-flex items-center gap-1 px-3 py-1 border-2 border-black font-bold text-xs transition ${
                      a.attended ? "bg-green-400 text-black" : "bg-white text-neutral-600 hover:bg-neutral-100"
                    } disabled:opacity-50`}
                    aria-pressed={a.attended}
                  >
                    {a.attended ? <><Check size={12}/> Attended</> : <><X size={12}/> Mark attended</>}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50" data-testid="appt-modal">
          <div className="bg-white border-2 border-black shadow-brutal-lg w-full max-w-md p-6">
            <div className="font-display font-black text-2xl">New appointment</div>
            <div className="mt-4 space-y-3">
              <input data-testid="appt-name" className="w-full border-2 border-black px-3 py-2" placeholder="Customer name" value={form.customer_name} onChange={e=>setForm({...form, customer_name: e.target.value})}/>
              <input data-testid="appt-contact" className="w-full border-2 border-black px-3 py-2" placeholder="Phone or email" value={form.customer_contact} onChange={e=>setForm({...form, customer_contact: e.target.value})}/>
              <input data-testid="appt-when" className="w-full border-2 border-black px-3 py-2" type="datetime-local" value={form.scheduled_at} onChange={e=>setForm({...form, scheduled_at: e.target.value})}/>
              <textarea data-testid="appt-notes" className="w-full border-2 border-black px-3 py-2" rows={3} placeholder="Notes" value={form.notes} onChange={e=>setForm({...form, notes: e.target.value})}/>
            </div>
            <div className="mt-5 flex gap-2 justify-end">
              <button data-testid="appt-cancel" onClick={()=>setOpen(false)} className="border-2 border-black px-4 py-2 font-bold">Cancel</button>
              <button data-testid="appt-save" onClick={create} className="bg-[#002FA7] text-white font-bold px-4 py-2 border-2 border-black shadow-brutal">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
