import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";

export default function AdminVendors() {
  const [vendors, setVendors] = useState([]);
  const load = () => api.get("/admin/vendors").then(r => setVendors(r.data));
  useEffect(() => { load(); }, []);
  const toggle = async (v) => {
    const newStatus = v.status === "active" ? "suspended" : "active";
    await api.put(`/admin/vendors/${v.id}/status`, { status: newStatus });
    toast.success(`${v.name} ${newStatus}`);
    load();
  };
  return (
    <div className="p-8" data-testid="admin-vendors-page">
      <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#6f8cff]">Vendors</div>
      <h1 className="font-display text-4xl font-black tracking-tighter">All tenants</h1>
      <div className="border-2 border-black bg-white mt-6">
        <div className="grid grid-cols-[1.2fr_1fr_0.7fr_0.7fr_0.8fr] border-b-2 border-black text-xs font-bold uppercase tracking-widest">
          <div className="p-3">Business</div><div className="p-3">Owner</div><div className="p-3">Convs</div><div className="p-3">Appts</div><div className="p-3">Action</div>
        </div>
        {vendors.map(v => (
          <div key={v.id} className="grid grid-cols-[1.2fr_1fr_0.7fr_0.7fr_0.8fr] border-b border-black/10 text-sm items-center" data-testid={`vendor-row-${v.id}`}>
            <div className="p-3">
              <div className="font-bold">{v.name}</div>
              <div className="text-xs font-mono text-neutral-500">{v.slug}</div>
            </div>
            <div className="p-3">
              <div>{v.owner?.full_name || "—"}</div>
              <div className="text-xs font-mono text-neutral-500">{v.owner?.email || ""}</div>
            </div>
            <div className="p-3 font-mono font-bold">{v.conversations}</div>
            <div className="p-3 font-mono font-bold">{v.appointments}</div>
            <div className="p-3 flex items-center gap-2">
              <span className="badge">{v.status}</span>
              <button data-testid={`toggle-${v.id}`} onClick={() => toggle(v)} className="text-xs font-bold border-2 border-black px-2 py-1">
                {v.status === "active" ? "Suspend" : "Activate"}
              </button>
            </div>
          </div>
        ))}
        {vendors.length === 0 && <div className="p-6 text-sm text-neutral-500">No vendors yet.</div>}
      </div>
    </div>
  );
}
