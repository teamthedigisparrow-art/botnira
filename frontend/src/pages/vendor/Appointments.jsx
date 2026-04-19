import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { Plus, CalendarDays } from "lucide-react";

export default function Appointments() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ customer_name: "", customer_contact: "", scheduled_at: "", notes: "" });
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

  return (
    <div className="p-8" data-testid="appointments-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">Calendar</div>
          <h1 className="font-display text-4xl font-black tracking-tighter">Appointments</h1>
        </div>
        <button data-testid="new-appt-btn" onClick={() => setOpen(true)} className="bg-[#002FA7] text-white font-bold px-4 py-2 border-2 border-black shadow-brutal hover-lift flex items-center gap-2"><Plus size={16}/> New</button>
      </div>

      <div className="border-2 border-black bg-white mt-6">
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr] border-b-2 border-black text-xs font-bold uppercase tracking-widest">
          <div className="p-3">Customer</div><div className="p-3">Contact</div><div className="p-3">When</div><div className="p-3">Notes</div>
        </div>
        {items.length === 0 && <div className="p-6 text-sm text-neutral-500 flex items-center gap-2"><CalendarDays size={16}/> No appointments yet.</div>}
        {items.map(a => (
          <div key={a.id} className="grid grid-cols-[1fr_1fr_1fr_1fr] border-b border-black/10 text-sm" data-testid={`appt-${a.id}`}>
            <div className="p-3 font-bold">{a.customer_name}</div>
            <div className="p-3 font-mono">{a.customer_contact || "—"}</div>
            <div className="p-3">{a.scheduled_at}</div>
            <div className="p-3 text-neutral-700">{a.notes || "—"}</div>
          </div>
        ))}
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
