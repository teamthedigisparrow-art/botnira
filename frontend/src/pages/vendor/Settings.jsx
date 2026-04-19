import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";

export default function Settings() {
  const [v, setV] = useState(null);
  useEffect(() => { api.get("/vendor/me").then(r => setV(r.data)); }, []);
  const save = async () => {
    try {
      const { data } = await api.put("/vendor/me", { name: v.name, business_description: v.business_description });
      setV(data);
      toast.success("Saved");
    } catch { toast.error("Save failed"); }
  };
  if (!v) return <div className="p-10 font-mono">Loading…</div>;
  return (
    <div className="p-8 max-w-3xl" data-testid="settings-page">
      <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">Settings</div>
      <h1 className="font-display text-4xl font-black tracking-tighter">Workspace</h1>
      <div className="mt-6 border-2 border-black bg-white p-6 space-y-4">
        <div>
          <div className="text-xs font-bold tracking-[0.2em] uppercase mb-1">Business name</div>
          <input data-testid="settings-name" className="w-full border-2 border-black px-3 py-2" value={v.name || ""} onChange={e=>setV({...v, name: e.target.value})}/>
        </div>
        <div>
          <div className="text-xs font-bold tracking-[0.2em] uppercase mb-1">Business description</div>
          <textarea data-testid="settings-desc" rows={6} className="w-full border-2 border-black px-3 py-2 font-mono text-sm" value={v.business_description || ""} onChange={e=>setV({...v, business_description: e.target.value})}/>
        </div>
        <div className="text-xs font-mono text-neutral-600">Vendor ID: {v.id}</div>
        <button data-testid="settings-save" onClick={save} className="bg-[#002FA7] text-white font-bold px-5 py-2 border-2 border-black shadow-brutal hover-lift">Save</button>
      </div>
    </div>
  );
}
