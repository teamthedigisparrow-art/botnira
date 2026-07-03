import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Clock, MapPin } from "lucide-react";

const DURATIONS = [15, 20, 30, 45, 60, 90, 120];
const COLORS = ["#002FA7", "#16a34a", "#db2777", "#ea580c", "#7c3aed", "#0891b2", "#000000"];

const empty = { name: "", description: "", duration_minutes: 30, color: "#002FA7", location: "", instructions: "", buffer_before: null, buffer_after: null, is_active: true };

export default function AppointmentTypesTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // object or null
  const dialogRef = useRef();

  const load = () => api.get("/scheduling/types").then((r) => { setItems(r.data.items || []); setLoading(false); });
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing.name.trim()) return toast.error("Name is required");
    try {
      const body = { ...editing, duration_minutes: Number(editing.duration_minutes) || 30 };
      if (editing.id) await api.put(`/scheduling/types/${editing.id}`, body);
      else await api.post("/scheduling/types", body);
      toast.success("Saved");
      setEditing(null);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
  };

  const remove = async (t) => {
    if (!window.confirm(`Delete "${t.name}"?`)) return;
    try { await api.delete(`/scheduling/types/${t.id}`); toast.success("Deleted"); load(); }
    catch { toast.error("Delete failed"); }
  };

  return (
    <div className="space-y-4" data-testid="types-tab">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-neutral-600">Define the kinds of meetings customers can book. Each type can have its own duration, colour and buffers.</p>
        <button onClick={() => setEditing({ ...empty })} data-testid="type-new-btn" className="bg-[#002FA7] text-white font-bold px-4 py-2 border-2 border-black shadow-brutal hover-lift flex items-center gap-2"><Plus size={16} /> New type</button>
      </div>

      {loading ? (
        <div className="p-10 font-mono text-sm">Loading…</div>
      ) : items.length === 0 ? (
        <div className="border-2 border-dashed border-neutral-400 p-10 text-center text-neutral-600">No appointment types yet. Create one so customers can book.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((t) => (
            <div key={t.id} className="border-2 border-black bg-white p-4" data-testid={`type-card-${t.id}`} style={{ borderLeftWidth: 8, borderLeftColor: t.color }}>
              <div className="flex items-start justify-between gap-2">
                <div className="font-display font-black text-lg">{t.name}</div>
                <div className="flex gap-1">
                  <button onClick={() => setEditing(t)} className="p-1 text-neutral-600 hover:text-[#002FA7]" data-testid={`type-edit-${t.id}`}><Pencil size={14} /></button>
                  <button onClick={() => remove(t)} className="p-1 text-neutral-600 hover:text-red-700" data-testid={`type-delete-${t.id}`}><Trash2 size={14} /></button>
                </div>
              </div>
              {t.description && <div className="text-sm text-neutral-600 mt-1">{t.description}</div>}
              <div className="mt-2 flex flex-wrap gap-3 text-xs font-mono text-neutral-700">
                <span className="flex items-center gap-1"><Clock size={12} /> {t.duration_minutes} min</span>
                {t.location && <span className="flex items-center gap-1"><MapPin size={12} /> {t.location}</span>}
                {!t.is_active && <span className="bg-neutral-200 border border-black px-1 uppercase">inactive</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50" data-testid="type-modal" onClick={(e) => { if (e.target === dialogRef.current) setEditing(null); }} ref={dialogRef}>
          <div className="bg-white border-2 border-black shadow-brutal-lg w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="font-display font-black text-2xl">{editing.id ? "Edit type" : "New appointment type"}</div>
            <div className="mt-4 space-y-3">
              <input data-testid="type-name" placeholder="Name (e.g. Discovery Call)" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="w-full border-2 border-black px-3 py-2" />
              <textarea data-testid="type-desc" placeholder="Description" rows={2} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="w-full border-2 border-black px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="text-xs font-bold uppercase">Duration</span>
                  <select data-testid="type-duration" value={editing.duration_minutes} onChange={(e) => setEditing({ ...editing, duration_minutes: Number(e.target.value) })} className="w-full mt-1 border-2 border-black px-3 py-2 text-sm">
                    {DURATIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
                  </select>
                </label>
                <label className="block"><span className="text-xs font-bold uppercase">Color</span>
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {COLORS.map((c) => <button key={c} type="button" onClick={() => setEditing({ ...editing, color: c })} className={`w-6 h-6 border-2 ${editing.color === c ? "border-black ring-2 ring-offset-1 ring-black" : "border-black/30"}`} style={{ background: c }} />)}
                  </div>
                </label>
              </div>
              <input data-testid="type-location" placeholder="Location (e.g. Phone, Google Meet, Office)" value={editing.location} onChange={(e) => setEditing({ ...editing, location: e.target.value })} className="w-full border-2 border-black px-3 py-2 text-sm" />
              <textarea data-testid="type-instructions" placeholder="Instructions shown to the customer" rows={2} value={editing.instructions} onChange={(e) => setEditing({ ...editing, instructions: e.target.value })} className="w-full border-2 border-black px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="text-xs font-bold uppercase">Buffer before (min)</span>
                  <input type="number" min="0" step="5" value={editing.buffer_before ?? ""} placeholder="default" onChange={(e) => setEditing({ ...editing, buffer_before: e.target.value === "" ? null : Number(e.target.value) })} className="w-full mt-1 border-2 border-black px-3 py-2 text-sm" />
                </label>
                <label className="block"><span className="text-xs font-bold uppercase">Buffer after (min)</span>
                  <input type="number" min="0" step="5" value={editing.buffer_after ?? ""} placeholder="default" onChange={(e) => setEditing({ ...editing, buffer_after: e.target.value === "" ? null : Number(e.target.value) })} className="w-full mt-1 border-2 border-black px-3 py-2 text-sm" />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" data-testid="type-active" checked={!!editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} /> Active (bookable)</label>
            </div>
            <div className="mt-5 flex gap-2 justify-end">
              <button onClick={() => setEditing(null)} className="border-2 border-black px-4 py-2 font-bold">Cancel</button>
              <button onClick={save} data-testid="type-save" className="bg-[#002FA7] text-white font-bold px-4 py-2 border-2 border-black shadow-brutal">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
