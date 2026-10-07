import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { toast } from "sonner";
import {
  Megaphone, Mail, Users, BarChart3, Upload, Sparkles, Lock,
  Play, Pause, X, Trash2, ShieldCheck, Clock, Check, AlertTriangle,
  Eye, Send, Plus, Pencil, ListPlus, Folder, MessageCircle, Phone,
} from "lucide-react";
import OutboundCalls from "../../components/sales/OutboundCalls";

const TABS = [
  { id: "prospects", label: "Prospects", icon: Users },
  { id: "emails", label: "Emails", icon: Mail },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { id: "calls", label: "Calls", icon: Phone },
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

// ---------------------------------------------------------- list manager ---
function ListSidebar({ lists, activeId, onSelect, onCreated, onRenamed, onDeleted }) {
  const [editing, setEditing] = useState(null); // list obj being renamed
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", list_type: "email" });

  const saveCreate = async () => {
    if (!form.name.trim()) return toast.error("Name required");
    try {
      const { data } = await api.post("/sales/lists", form);
      toast.success(`${data.list.list_type === "whatsapp" ? "WhatsApp" : "Email"} list "${data.list.name}" created`);
      setCreating(false); setForm({ name: "", description: "", list_type: "email" });
      onCreated(data.list.id);
    } catch (e) { toast.error(e?.response?.data?.detail || "Create failed"); }
  };

  const saveRename = async () => {
    if (!form.name.trim()) return toast.error("Name required");
    try {
      await api.patch(`/sales/lists/${editing.id}`, form);
      toast.success("List renamed");
      setEditing(null); setForm({ name: "", description: "" });
      onRenamed();
    } catch (e) { toast.error(e?.response?.data?.detail || "Rename failed"); }
  };

  const del = async (list) => {
    const warn = `Delete list "${list.name}"?\n\nThis will remove it and permanently delete prospects that exist ONLY in this list.\nProspects also belonging to other lists stay put.`;
    if (!window.confirm(warn)) return;
    try {
      const { data } = await api.delete(`/sales/lists/${list.id}`);
      toast.success(`List deleted · ${data.prospects_deleted} prospects removed, ${data.prospects_kept_in_other_lists} kept`);
      onDeleted(list.id);
    } catch (e) { toast.error(e?.response?.data?.detail || "Delete failed"); }
  };

  return (
    <aside className="w-full lg:w-60 shrink-0 border-2 border-black bg-white shadow-brutal" data-testid="sales-lists-sidebar">
      <div className="px-3 py-2 border-b-2 border-black flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-600">
          <Folder size={11} className="inline -mt-0.5 mr-1" /> Lists
        </div>
        <button
          onClick={() => { setCreating(true); setForm({ name: "", description: "", list_type: "email" }); }}
          className="border border-black px-1.5 py-0.5 text-[11px] font-bold hover-lift bg-white"
          data-testid="sales-new-list-btn"
          title="New list"
        >
          <Plus size={11} className="inline -mt-0.5" /> New
        </button>
      </div>
      <div className="divide-y divide-black/10 max-h-[70vh] overflow-y-auto">
        {lists.map((l) => (
          <div
            key={l.id}
            onClick={() => onSelect(l.id)}
            data-testid={`sales-list-row-${l.id}`}
            className={`group px-3 py-2.5 cursor-pointer ${activeId === l.id ? "bg-[#002FA7] text-white" : "hover:bg-neutral-50"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-bold text-sm truncate flex items-center gap-1.5">
                  <span className="truncate">{l.name}</span>
                  <span
                    data-testid={`sales-list-type-${l.id}`}
                    className={`shrink-0 text-[8px] font-black uppercase tracking-wide px-1 py-px border ${
                      (l.list_type || "email") === "whatsapp"
                        ? (activeId === l.id ? "bg-[#25D366] text-black border-black" : "bg-[#25D366]/20 text-[#0b7a3b] border-[#0b7a3b]")
                        : (activeId === l.id ? "bg-white text-[#002FA7] border-black" : "bg-[#002FA7]/10 text-[#002FA7] border-[#002FA7]")
                    }`}
                    title={(l.list_type || "email") === "whatsapp" ? "WhatsApp list" : "Email list"}
                  >
                    {(l.list_type || "email") === "whatsapp" ? "WA" : "Email"}
                  </span>
                </div>
                <div className={`text-[10px] font-mono ${activeId === l.id ? "text-white/80" : "text-neutral-500"}`}>
                  {l.counts?.active || 0} active · {l.total || 0} total
                </div>
              </div>
              <div className={`flex gap-1 ${activeId === l.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity`}>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditing(l); setForm({ name: l.name, description: l.description || "" }); }}
                  className={`p-1 ${activeId === l.id ? "hover:bg-white/20" : "hover:bg-black/10"}`}
                  title="Rename"
                  data-testid={`sales-list-rename-${l.id}`}
                ><Pencil size={11} /></button>
                <button
                  onClick={(e) => { e.stopPropagation(); del(l); }}
                  className={`p-1 ${activeId === l.id ? "hover:bg-white/20" : "hover:bg-red-100 text-red-700"}`}
                  title="Delete"
                  data-testid={`sales-list-delete-${l.id}`}
                ><Trash2 size={11} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {(creating || editing) && (
        <ListFormModal
          editing={!!editing}
          form={form}
          setForm={setForm}
          onCancel={() => { setCreating(false); setEditing(null); }}
          onSave={editing ? saveRename : saveCreate}
        />
      )}
    </aside>
  );
}

function ListFormModal({ editing, form, setForm, onCancel, onSave }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" data-testid="list-form-modal">
      <div className="bg-white border-2 border-black shadow-brutal w-full max-w-md">
        <div className="px-5 py-3 border-b-2 border-black flex items-center justify-between">
          <h3 className="font-display font-black text-xl">{editing ? "Rename list" : "New prospect list"}</h3>
          <button onClick={onCancel} className="border-2 border-black p-1"><X size={13} /></button>
        </div>
        <div className="p-5 space-y-3">
          {!editing && (
            <div>
              <label className="text-xs font-bold uppercase tracking-widest">List type</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, list_type: "email" }))}
                  data-testid="list-type-email"
                  className={`border-2 border-black p-3 text-left transition-colors ${form.list_type === "whatsapp" ? "bg-white" : "bg-[#002FA7] text-white"}`}
                >
                  <Mail size={16} />
                  <div className="font-bold text-sm mt-1">Email list</div>
                  <div className={`text-[11px] mt-0.5 ${form.list_type === "whatsapp" ? "text-neutral-600" : "text-white/85"}`}>
                    Email required. Powers email campaigns.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, list_type: "whatsapp" }))}
                  data-testid="list-type-whatsapp"
                  className={`border-2 border-black p-3 text-left transition-colors ${form.list_type === "whatsapp" ? "bg-[#25D366] text-black" : "bg-white"}`}
                >
                  <MessageCircle size={16} />
                  <div className="font-bold text-sm mt-1">WhatsApp list</div>
                  <div className="text-[11px] mt-0.5 text-neutral-700">
                    Name + country code + number. No email needed.
                  </div>
                </button>
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-bold uppercase tracking-widest">Name</label>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. April dental outreach"
              className="w-full border-2 border-black px-3 py-2 mt-1"
              data-testid="list-form-name"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest">Description <span className="text-neutral-400">(optional)</span></label>
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Who's on this list?"
              className="w-full border-2 border-black px-3 py-2 mt-1"
              data-testid="list-form-description"
            />
          </div>
        </div>
        <div className="px-5 py-3 border-t-2 border-black flex justify-end gap-2 bg-neutral-50">
          <button onClick={onCancel} className="border-2 border-black px-4 py-2 text-sm font-bold bg-white">Cancel</button>
          <button onClick={onSave} className="border-2 border-black px-4 py-2 text-sm font-bold bg-[#002FA7] text-white shadow-brutal hover-lift" data-testid="list-form-save">
            {editing ? "Save" : "Create list"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------- prospect editor ---
function ProspectEditModal({ prospect, isWa, onClose, onSaved }) {
  const [form, setForm] = useState({
    email: prospect.email || "",
    name: prospect.name || "",
    company: prospect.company || "",
    country_code: prospect.country_code || "",
    phone: prospect.phone || "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const payload = isWa
        ? { name: form.name, country_code: form.country_code, phone: form.phone }
        : form;
      await api.patch(`/sales/prospects/${prospect.id}`, payload);
      toast.success("Contact updated");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Update failed");
    } finally { setSaving(false); }
  };

  const fields = isWa ? ["name", "country_code", "phone"] : ["email", "name", "company", "country_code", "phone"];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" data-testid="prospect-edit-modal">
      <div className="bg-white border-2 border-black shadow-brutal w-full max-w-md">
        <div className="px-5 py-3 border-b-2 border-black flex items-center justify-between">
          <h3 className="font-display font-black text-xl">Edit {isWa ? "WhatsApp contact" : "prospect"}</h3>
          <button onClick={onClose} className="border-2 border-black p-1"><X size={13} /></button>
        </div>
        <div className="p-5 space-y-3">
          {fields.map((k) => (
            <div key={k}>
              <label className="text-xs font-bold uppercase tracking-widest">{k.replace("_", " ")}</label>
              <input
                value={form[k]}
                onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                placeholder={k === "country_code" ? "+1" : k === "phone" ? "4165551234" : ""}
                className="w-full border-2 border-black px-3 py-2 mt-1 font-mono text-sm"
                data-testid={`prospect-edit-${k}`}
              />
            </div>
          ))}
          {prospect.notes && (
            <div>
              <label className="text-xs font-bold uppercase tracking-widest">Inquiry message</label>
              <div className="mt-1 border-2 border-black bg-amber-50 p-3 text-xs whitespace-pre-wrap font-mono">{prospect.notes}</div>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t-2 border-black flex justify-end gap-2 bg-neutral-50">
          <button onClick={onClose} className="border-2 border-black px-4 py-2 text-sm font-bold bg-white">Cancel</button>
          <button onClick={save} disabled={saving} className="border-2 border-black px-4 py-2 text-sm font-bold bg-[#002FA7] text-white shadow-brutal hover-lift disabled:opacity-60" data-testid="prospect-edit-save">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------- prospects panel ---
function ProspectsPanel({ lists, activeListId, setActiveListId, reloadLists }) {
  const [data, setData] = useState({ items: [], total: 0, counts: { active: 0, unsubscribed: 0, bounced: 0 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(null);
  const fileRef = useRef(null);
  const activeList = lists.find((l) => l.id === activeListId);
  const isWa = (activeList?.list_type || "email") === "whatsapp";

  const load = async () => {
    if (!activeListId) return;
    setLoading(true);
    try {
      const params = { list_id: activeListId, limit: 200 };
      if (search) params.q = search;
      if (statusFilter) params.status = statusFilter;
      const { data: d } = await api.get("/sales/prospects", { params });
      setData(d);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load prospects");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [activeListId, statusFilter]);

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please upload a .csv file"); return;
    }
    const fd = new FormData();
    fd.append("file", file);
    setUploading(true);
    try {
      const { data: r } = await api.post(`/sales/prospects/upload?list_id=${activeListId}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(
        `Added ${r.inserted} new · ${r.merged_into_list} merged from other lists · ${r.duplicates_skipped} already in list${r.invalid_skipped ? ` · ${r.invalid_skipped} invalid` : ""}${r.warned ? ` · ${r.warned} not 10 digits (kept)` : ""}`,
      );
      await Promise.all([load(), reloadLists()]);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (prospect) => {
    const inMultiple = (prospect.list_ids || []).length > 1;
    const msg = inMultiple
      ? `This prospect is in ${prospect.list_ids.length} lists. Remove from "${activeList?.name}" only? (they remain in other lists)`
      : `Permanently remove ${prospect.email || prospect.phone || "this contact"}?`;
    if (!window.confirm(msg)) return;
    try {
      await api.delete(`/sales/prospects/${prospect.id}?list_id=${activeListId}`);
      await Promise.all([load(), reloadLists()]);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4" data-testid="sales-prospects-panel">
      <ListSidebar
        lists={lists}
        activeId={activeListId}
        onSelect={setActiveListId}
        onCreated={(id) => { reloadLists(); setActiveListId(id); }}
        onRenamed={reloadLists}
        onDeleted={(removedId) => {
          reloadLists();
          if (removedId === activeListId) {
            const fallback = lists.find((l) => l.id !== removedId);
            setActiveListId(fallback?.id || null);
          }
        }}
      />

      <div className="flex-1 min-w-0 space-y-4">
        {/* Helper banner */}
        <div className="border-2 border-black bg-amber-50 p-4 flex gap-3 items-start" data-testid="sales-prospects-help">
          <ShieldCheck size={18} className="mt-0.5 text-amber-700 shrink-0" />
          <div className="text-sm flex-1">
            {isWa ? (
              <>
                <strong>WhatsApp list · CSV columns:</strong>{" "}
                <code className="bg-white border border-black px-1 font-mono text-xs">name, country_code, phone</code>.{" "}
                <strong>Country code</strong> (like <code className="font-mono">+1</code>, <code className="font-mono">+91</code>) and <strong>phone</strong> are required — <strong>no email needed</strong>.
                Phone numbers should be the local <strong>10-digit</strong> number (other lengths are kept but flagged).
                Same number + same country code is a duplicate and is skipped; the same number under a different country code is treated as a separate lead.
              </>
            ) : (
              <>
                <strong>Email list · CSV columns:</strong>{" "}
                <code className="bg-white border border-black px-1 font-mono text-xs">email, name, company, country_code, phone</code>.{" "}
                Only <strong>email</strong> is required. Use <code className="font-mono">country_code</code> like <code className="font-mono">+1</code>, <code className="font-mono">+91</code> — we'll combine it with the phone so WhatsApp campaigns can reach them too.{" "}
                Duplicates are merged automatically — same email in a different list is the <strong>same person</strong>.
              </>
            )}
            <div className="mt-2">
              <a
                href={`${process.env.REACT_APP_BACKEND_URL}/api/sales/prospects/template.csv?list_type=${isWa ? "whatsapp" : "email"}`}
                onClick={async (e) => {
                  // Send Authorization header via fetch (anchor tag can't); fallback to JS download
                  e.preventDefault();
                  try {
                    const res = await api.get(`/sales/prospects/template.csv?list_type=${isWa ? "whatsapp" : "email"}`, { responseType: "blob" });
                    const url = window.URL.createObjectURL(new Blob([res.data]));
                    const link = document.createElement("a");
                    link.href = url;
                    link.setAttribute("download", isWa ? "botnira-whatsapp-list-template.csv" : "botnira-prospects-template.csv");
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    window.URL.revokeObjectURL(url);
                  } catch (err) {
                    toast.error("Couldn't download template");
                  }
                }}
                data-testid="sales-prospects-template-download"
                className="inline-flex items-center gap-1.5 border-2 border-black bg-white text-black font-bold text-xs px-3 py-1.5 hover-lift no-underline"
              >
                <Upload size={12} className="rotate-180" /> Download {isWa ? "WhatsApp" : "sample"} CSV
              </a>
            </div>
          </div>
        </div>

        {/* List header */}
        {activeList && (
          <div className="border-2 border-black bg-white shadow-brutal p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">
                  <Folder size={10} className="inline -mt-0.5 mr-1" /> List
                </div>
                <h2 className="font-display font-black text-2xl">{activeList.name}</h2>
                {activeList.description && <p className="text-sm text-neutral-600 mt-0.5">{activeList.description}</p>}
                <div className="text-[11px] font-mono text-neutral-600 mt-1">
                  {activeList.counts?.active || 0} active · {activeList.counts?.unsubscribed || 0} unsubscribed · {activeList.counts?.bounced || 0} bounced
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onUpload} className="hidden" data-testid="sales-prospects-upload-input" />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  data-testid="sales-prospects-upload-btn"
                  className="text-sm font-bold border-2 border-black px-4 py-2 bg-[#002FA7] text-white shadow-brutal hover-lift disabled:opacity-60"
                >
                  <Upload size={14} className="inline -mt-0.5 mr-1" />
                  {uploading ? "Uploading…" : "Upload CSV"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex gap-2 items-center flex-wrap">
          <input
            data-testid="sales-prospects-search"
            placeholder="Search name, phone, email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            className="border-2 border-black px-3 py-2 text-sm w-64"
          />
          <select
            data-testid="sales-prospects-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border-2 border-black px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="unsubscribed">Unsubscribed</option>
            <option value="bounced">Bounced</option>
          </select>
          <button onClick={load} className="text-sm font-bold border-2 border-black px-3 py-2 hover-lift bg-white">Apply</button>
        </div>

        {/* Table */}
        <div className="border-2 border-black bg-white shadow-brutal overflow-x-auto">
          <div className={`min-w-[560px] lg:min-w-0 grid ${isWa ? "grid-cols-[1.6fr_1.4fr_110px_90px]" : "grid-cols-[1.4fr_1.2fr_1fr_1.1fr_100px_90px]"} text-[11px] font-bold uppercase tracking-widest bg-black text-white px-4 py-2`}>
            {isWa ? (
              <><div>Name</div><div>WhatsApp number</div><div>Status</div><div className="text-right">Actions</div></>
            ) : (
              <><div>Email</div><div>Name</div><div>Phone</div><div>Company</div><div>Status</div><div className="text-right">Actions</div></>
            )}
          </div>
          {loading ? (
            <div className="p-10 text-center text-sm text-neutral-500">Loading…</div>
          ) : data.items.length === 0 ? (
            <div className="p-10 text-center text-sm text-neutral-500">
              No contacts in this list. {isWa ? "Upload a WhatsApp CSV (name, country code, number) to get started." : "Upload a CSV to get started."}
            </div>
          ) : (
            data.items.map((p) => (
              <div key={p.id}
                   data-testid={`prospect-row-${p.email || p.phone}`}
                   className={`min-w-[560px] lg:min-w-0 grid ${isWa ? "grid-cols-[1.6fr_1.4fr_110px_90px]" : "grid-cols-[1.4fr_1.2fr_1fr_1.1fr_100px_90px]"} px-4 py-2.5 text-sm border-t border-black/10 items-center`}>
                {isWa ? (
                  <>
                    <div className="truncate flex items-center gap-1.5">
                      <span className="truncate">{p.name || "—"}</span>
                      {(p.list_ids?.length || 0) > 1 && (
                        <span className="text-[9px] font-bold bg-neutral-200 border border-black px-1" title="In multiple lists">×{p.list_ids.length}</span>
                      )}
                      {p.source === "inbox" && (
                        <span className="text-[9px] font-bold bg-[#25D366]/40 border border-black px-1" title="Auto-collected from your WhatsApp inbox">INBOX</span>
                      )}
                    </div>
                    <div className="font-mono text-xs truncate">{p.phone ? `+${p.phone}` : "—"}</div>
                  </>
                ) : (
                  <>
                    <div className="font-mono text-xs truncate">
                      {p.email}
                      {(p.list_ids?.length || 0) > 1 && (
                        <span className="ml-1.5 text-[9px] font-bold bg-neutral-200 border border-black px-1" title="In multiple lists">
                          ×{p.list_ids.length}
                        </span>
                      )}
                      {p.source === "landing_inquiry" && (
                        <span className="ml-1.5 text-[9px] font-bold bg-amber-200 border border-black px-1" title="Came from website Contact form">
                          INQUIRY
                        </span>
                      )}
                    </div>
                    <div className="truncate">{p.name || "—"}</div>
                    <div className="font-mono text-xs truncate">{p.phone || "—"}</div>
                    <div className="truncate text-neutral-600">{p.company || "—"}</div>
                  </>
                )}
                <div>
                  <span className={`inline-block text-[10px] px-2 py-0.5 border border-black font-bold uppercase ${
                    p.status === "active" ? "bg-green-100" :
                    p.status === "unsubscribed" ? "bg-yellow-100" : "bg-red-100"
                  }`}>{p.status}</span>
                </div>
                <div className="flex gap-1 justify-end">
                  <button onClick={() => setEditing(p)} title="Edit"
                          data-testid={`prospect-edit-${p.email || p.phone}`}
                          className="text-neutral-600 hover:text-[#002FA7] p-1">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => remove(p)} title="Remove"
                          data-testid={`prospect-remove-${p.email || p.phone}`}
                          className="text-neutral-500 hover:text-red-700 p-1">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {editing && (
          <ProspectEditModal
            prospect={editing}
            isWa={isWa}
            onClose={() => setEditing(null)}
            onSaved={load}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------- composer modal ---
function ComposerModal({ open, onClose, onCreated, lists }) {
  const emailLists = lists.filter((l) => (l.list_type || "email") === "email");
  const [form, setForm] = useState({
    name: "", subject: "", body_type: "html", body: "", list_ids: [],
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      // Preselect all email lists with active prospects by default
      setForm({ name: "", subject: "", body_type: "html", body: "",
                list_ids: emailLists.filter((l) => (l.counts?.active || 0) > 0).map((l) => l.id) });
    }
    // eslint-disable-next-line
  }, [open, lists]);

  if (!open) return null;

  const toggleList = (id) => {
    setForm((f) => ({
      ...f,
      list_ids: f.list_ids.includes(id) ? f.list_ids.filter((x) => x !== id) : [...f.list_ids, id],
    }));
  };

  const targetCount = emailLists
    .filter((l) => form.list_ids.includes(l.id))
    .reduce((s, l) => s + (l.counts?.active || 0), 0);

  const submit = async () => {
    if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) {
      return toast.error("Name, subject and body are required");
    }
    if (form.list_ids.length === 0) return toast.error("Pick at least one list");
    setSubmitting(true);
    try {
      const { data } = await api.post("/sales/campaigns", {
        name: form.name, subject: form.subject,
        body_type: form.body_type, body: form.body,
        list_ids: form.list_ids, start_now: true,
      });
      toast.success(`Campaign launched → ${data.campaign.total} prospects queued`);
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to launch campaign");
    } finally { setSubmitting(false); }
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
          <div className="border-2 border-black bg-blue-50 p-3 flex gap-2 items-start text-sm">
            <Clock size={16} className="mt-0.5 text-blue-800 shrink-0" />
            <div>
              <strong>BotNira sends one email at a time</strong>, with a random
              <strong> 5–45 minute</strong> gap between each — keeping your
              domain warm, your inbox safe, and your prospects un-bothered.
              An <strong>unsubscribe link</strong> is auto-added for CASL/CAN-SPAM compliance.
            </div>
          </div>

          {/* List picker */}
          <div>
            <label className="text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-1">
              <ListPlus size={12} /> Send to these lists
            </label>
            <div className="border-2 border-black bg-neutral-50 p-3 space-y-1.5 max-h-48 overflow-y-auto">
              {emailLists.length === 0 ? (
                <div className="text-xs text-neutral-500">No email lists yet. Create an Email-type list in the Prospects tab.</div>
              ) : emailLists.map((l) => {
                const checked = form.list_ids.includes(l.id);
                const active = l.counts?.active || 0;
                return (
                  <label key={l.id}
                         data-testid={`composer-list-${l.id}`}
                         className={`flex items-center gap-2 p-1.5 cursor-pointer ${active === 0 ? "opacity-50" : ""} hover:bg-white`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={active === 0}
                      onChange={() => toggleList(l.id)}
                      className="w-4 h-4 accent-[#002FA7]"
                    />
                    <span className="font-bold text-sm">{l.name}</span>
                    <span className="text-[11px] font-mono text-neutral-500 ml-auto">
                      {active} active
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="text-[11px] text-neutral-600 mt-1">
              Up to <strong>{targetCount}</strong> recipients selected (prospects in multiple lists get one email each).
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
            <strong>{targetCount}</strong> max recipients across {form.list_ids.length} list{form.list_ids.length === 1 ? "" : "s"}.
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
function CampaignsPanel({ lists }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [expanded, setExpanded] = useState(null); // campaign id whose recipients are shown
  const [recipients, setRecipients] = useState([]);
  const emailLists = lists.filter((l) => (l.list_type || "email") === "email");
  const totalActive = emailLists.reduce((s, l) => s + (l.counts?.active || 0), 0);

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
  useEffect(() => {
    const hasLive = items.some((c) => ["sending", "scheduled"].includes(c.status));
    if (!hasLive) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [items]);

  const loadRecipients = async (cid) => {
    if (expanded === cid) { setExpanded(null); return; }
    try {
      const { data } = await api.get(`/sales/campaigns/${cid}`);
      setRecipients(data.recipients);
      setExpanded(cid);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

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
          {totalActive} active email prospects across {emailLists.length} email list{emailLists.length === 1 ? "" : "s"}.
        </p>
        <button
          onClick={() => setShowComposer(true)}
          disabled={totalActive === 0}
          data-testid="sales-new-campaign-btn"
          className="text-sm font-bold border-2 border-black px-4 py-2 bg-[#002FA7] text-white shadow-brutal hover-lift disabled:opacity-50"
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
            const targetListNames = (c.list_ids || []).map((id) => lists.find((l) => l.id === id)?.name).filter(Boolean);
            return (
              <div key={c.id}
                   data-testid={`campaign-row-${c.id}`}
                   className="border-2 border-black bg-white shadow-brutal p-5">
                <div className="flex flex-wrap items-start gap-3 justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-block text-[10px] px-2 py-0.5 border border-black font-bold uppercase ${STATUS_BADGE[c.status] || "bg-neutral-200"}`}>{c.status}</span>
                      <h4 className="font-display font-black text-lg truncate">{c.name}</h4>
                    </div>
                    <p className="text-sm text-neutral-700 mt-1 truncate">
                      <span className="text-neutral-500">Subject:</span> {c.subject}
                    </p>
                    {targetListNames.length > 0 && (
                      <p className="text-[11px] font-mono text-neutral-600 mt-0.5">
                        <Folder size={10} className="inline -mt-0.5 mr-0.5" /> {targetListNames.join(" · ")}
                      </p>
                    )}
                    <p className="text-xs font-mono text-neutral-500 mt-0.5">
                      Created {fmtDate(c.created_at)}
                      {c.last_send_at && ` · Last sent ${fmtDate(c.last_send_at)}`}
                      {c.next_send_at && c.status === "sending" && ` · Next ${fmtDate(c.next_send_at)}`}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {c.status === "sending" && (
                      <button onClick={() => action(c.id, "pause")} data-testid={`campaign-pause-${c.id}`}
                              className="text-xs font-bold border-2 border-black px-3 py-1.5 bg-yellow-200 hover-lift">
                        <Pause size={12} className="inline -mt-0.5 mr-1" />Pause
                      </button>
                    )}
                    {c.status === "paused" && (
                      <button onClick={() => action(c.id, "resume")} data-testid={`campaign-resume-${c.id}`}
                              className="text-xs font-bold border-2 border-black px-3 py-1.5 bg-green-200 hover-lift">
                        <Play size={12} className="inline -mt-0.5 mr-1" />Resume
                      </button>
                    )}
                    {!["completed", "canceled"].includes(c.status) && (
                      <button onClick={() => action(c.id, "cancel")} data-testid={`campaign-cancel-${c.id}`}
                              className="text-xs font-bold border-2 border-red-700 text-red-700 px-3 py-1.5 hover-lift">
                        <X size={12} className="inline -mt-0.5 mr-1" />Cancel
                      </button>
                    )}
                    <button
                      onClick={() => loadRecipients(c.id)}
                      data-testid={`campaign-toggle-${c.id}`}
                      className="text-xs font-bold border-2 border-black px-3 py-1.5 bg-white hover-lift"
                    >{expanded === c.id ? "Hide details" : "Details"}</button>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex justify-between text-[11px] font-mono text-neutral-600">
                    <span>Sent {c.sent_count}/{c.total}</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="mt-1 h-2 border-2 border-black bg-neutral-100 overflow-hidden">
                    <div className="h-full bg-[#002FA7]" style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  <Stat label="Sent" value={c.sent_count} icon={Send} />
                  <Stat label="Opened" value={c.opened_count} extra={`${openPct}%`} icon={Eye} />
                  <Stat label="Failed" value={c.failed_count} icon={AlertTriangle} />
                  <Stat label="Total" value={c.total} icon={Users} />
                </div>

                {expanded === c.id && (
                  <div className="mt-4 border-2 border-black bg-neutral-50 overflow-x-auto" data-testid={`campaign-recipients-${c.id}`}>
                    <div className="min-w-[480px] grid grid-cols-[1fr_120px_160px_1fr] text-[10px] font-bold uppercase tracking-widest bg-black text-white px-3 py-1.5">
                      <div>Email</div><div>Status</div><div>Sent / Opened</div><div>Error</div>
                    </div>
                    <div className="max-h-72 overflow-y-auto min-w-[480px]">
                      {recipients.map((r) => (
                        <div key={r.id} className="grid grid-cols-[1fr_120px_160px_1fr] px-3 py-1.5 text-xs border-t border-black/10">
                          <div className="font-mono truncate">{r.email}</div>
                          <div>
                            <span className={`inline-block text-[9px] px-1.5 py-0.5 border border-black font-bold uppercase ${
                              r.status === "opened" ? "bg-green-200" :
                              r.status === "sent" ? "bg-blue-100" :
                              r.status === "bounced" || r.status === "failed" ? "bg-red-100" :
                              r.status === "skipped" ? "bg-neutral-200" : "bg-white"
                            }`}>{r.status}</span>
                          </div>
                          <div className="font-mono text-[10px] text-neutral-600">
                            {r.sent_at ? new Date(r.sent_at).toLocaleString() : "—"}
                            {r.opened_at && <span className="text-green-700"> · opened</span>}
                          </div>
                          <div className="font-mono text-[10px] text-red-700 truncate" title={r.error || ""}>
                            {r.error || (r.status === "bounced" ? (r.bounce_reason || "Bounced") : "")}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ComposerModal
        open={showComposer}
        onClose={() => setShowComposer(false)}
        onCreated={load}
        lists={lists}
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
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}
                data-testid="sales-analytics-days"
                className="border-2 border-black px-3 py-1.5 text-sm">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>Last year</option>
        </select>
      </div>

      <div className="border-2 border-black bg-amber-50 p-3 text-xs flex gap-2 items-start">
        <AlertTriangle size={14} className="mt-0.5 text-amber-700 shrink-0" />
        <div>
          <strong>Opens</strong> are tracked via an invisible pixel in the
          email. If your recipient's mail client blocks images (many do by
          default), the open won't register — so <strong>real open rates are
          usually higher than what's shown here</strong>. For accurate tracking
          the pixel endpoint must be reachable at your public domain.
        </div>
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
                <div className="text-[9px] font-mono text-neutral-500 opacity-0 group-hover:opacity-100">{s.opened}/{s.sent}</div>
                <div className="relative w-full bg-neutral-100 border-2 border-black" style={{ height: 140 }}>
                  <div className="absolute bottom-0 inset-x-0 bg-[#002FA7]/30" style={{ height: `${s.sentPct}%` }} />
                  <div className="absolute bottom-0 inset-x-0 bg-[#002FA7]" style={{ height: `${s.openedPct}%` }} />
                </div>
                <div className="text-[9px] font-mono text-neutral-500 -rotate-45 origin-top-left whitespace-nowrap">{s.date.slice(5)}</div>
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

// ============================================================================
// WhatsApp BULK CAMPAIGNS — sends an approved WhatsApp template to prospects
// across selected lists. Same prospect/list pool as email campaigns.
// ============================================================================
const WA_STATUS_BADGE = STATUS_BADGE;

function WaComposer({ lists, onClose, onLaunched }) {
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [form, setForm] = useState({
    name: "",
    template_name: "",
    language: "en_US",
    list_ids: [],
    body_var_specs: [],
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setTemplatesLoading(true);
    api.get("/whatsapp/templates")
      .then(({ data }) => setTemplates(data.templates || []))
      .catch((e) => toast.error(e?.response?.data?.detail || "Failed to load WhatsApp templates"))
      .finally(() => setTemplatesLoading(false));
  }, []);

  const approved = useMemo(() => templates.filter((t) => t.status === "APPROVED"), [templates]);
  const selectedTpl = useMemo(
    () => approved.find((t) => t.name === form.template_name) || null,
    [approved, form.template_name],
  );
  const bodyText = useMemo(() => {
    const b = (selectedTpl?.components || []).find((c) => c.type === "BODY");
    return b?.text || "";
  }, [selectedTpl]);
  const placeholderCount = useMemo(() => {
    const matches = (bodyText || "").match(/\{\{\s*(\d+)\s*\}\}/g) || [];
    const nums = matches.map((m) => parseInt(m.replace(/[^\d]/g, ""), 10)).filter((n) => !Number.isNaN(n));
    return nums.length === 0 ? 0 : Math.max(...nums);
  }, [bodyText]);

  // Whenever template changes → reset body_var_specs to defaults
  useEffect(() => {
    setForm((f) => ({
      ...f,
      language: selectedTpl?.language || f.language,
      body_var_specs: new Array(placeholderCount).fill(null).map(() => ({ kind: "literal", value: "" })),
    }));
    // eslint-disable-next-line
  }, [form.template_name]);

  const toggleList = (lid) => {
    setForm((f) => ({
      ...f,
      list_ids: f.list_ids.includes(lid) ? f.list_ids.filter((x) => x !== lid) : [...f.list_ids, lid],
    }));
  };
  const setVarSpec = (idx, patch) => {
    setForm((f) => {
      const next = [...f.body_var_specs];
      next[idx] = { ...next[idx], ...patch };
      return { ...f, body_var_specs: next };
    });
  };

  const targetCount = useMemo(() => {
    if (form.list_ids.length === 0) return lists.reduce((s, l) => s + (l.counts?.active_with_phone || l.counts?.active || 0), 0);
    return lists.filter((l) => form.list_ids.includes(l.id))
      .reduce((s, l) => s + (l.counts?.active_with_phone || l.counts?.active || 0), 0);
  }, [form.list_ids, lists]);

  const submit = async () => {
    if (!form.name.trim()) return toast.error("Campaign name required");
    if (!form.template_name) return toast.error("Pick an approved template");
    if (placeholderCount > 0) {
      for (let i = 0; i < placeholderCount; i++) {
        if (!form.body_var_specs[i]?.value) {
          return toast.error(`Fill mapping for variable {{${i + 1}}}`);
        }
      }
    }
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        template_name: form.template_name,
        language: form.language || "en_US",
        list_ids: form.list_ids,
        body_var_specs: form.body_var_specs.slice(0, placeholderCount),
        start_now: true,
      };
      const { data } = await api.post("/sales/wa/campaigns", payload);
      toast.success(`Campaign launched — ${data.campaign.total} recipients queued`);
      onLaunched();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Launch failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid="wa-composer-modal"
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white border-2 border-black shadow-brutal w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b-2 border-black px-5 py-3 flex items-center justify-between bg-[#002FA7] text-white">
          <div className="font-display font-bold text-lg flex items-center gap-2">
            <MessageCircle size={18} /> New WhatsApp campaign
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-600">Campaign name (internal)</label>
            <input
              data-testid="wa-composer-name"
              className="w-full border-2 border-black px-3 py-2 text-sm"
              placeholder="Spring re-engagement"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-600">Approved template</label>
            {templatesLoading ? (
              <div className="text-sm text-neutral-500 mt-1">Loading templates…</div>
            ) : approved.length === 0 ? (
              <div className="border-2 border-amber-700 bg-amber-50 p-3 text-sm mt-1" data-testid="wa-composer-no-templates">
                You don't have any APPROVED templates yet. Go to <Link to="/app/channels" className="underline font-bold">Channels → WhatsApp → Message Templates</Link> to submit one. Meta usually approves in minutes.
              </div>
            ) : (
              <select
                data-testid="wa-composer-template"
                className="w-full border-2 border-black px-3 py-2 text-sm font-mono"
                value={form.template_name}
                onChange={(e) => setForm({ ...form, template_name: e.target.value })}
              >
                <option value="">— Select a template —</option>
                {approved.map((t) => (
                  <option key={t.id || t.name} value={t.name}>
                    {t.name} ({t.language}) · {t.category}
                  </option>
                ))}
              </select>
            )}
          </div>

          {bodyText && (
            <div className="border-2 border-neutral-300 bg-neutral-50 p-3 text-sm font-mono whitespace-pre-wrap" data-testid="wa-composer-preview">
              <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-1">Template body preview</div>
              {bodyText}
            </div>
          )}

          {placeholderCount > 0 && (
            <div data-testid="wa-composer-vars" className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-neutral-600">Variable mappings</div>
              <p className="text-[11px] text-neutral-500">
                Choose what each <code className="font-mono">{"{{n}}"}</code> resolves to per recipient. Use a prospect field token or a static value.
              </p>
              {Array.from({ length: placeholderCount }).map((_, i) => {
                const spec = form.body_var_specs[i] || { kind: "literal", value: "" };
                return (
                  <div key={i} className="border-2 border-black p-2 grid grid-cols-1 md:grid-cols-[80px_140px_1fr] gap-2 items-center" data-testid={`wa-composer-var-${i + 1}`}>
                    <div className="font-mono text-sm font-bold">{`{{${i + 1}}}`}</div>
                    <select
                      data-testid={`wa-composer-var-kind-${i + 1}`}
                      className="border-2 border-black px-2 py-1.5 text-sm"
                      value={spec.kind}
                      onChange={(e) => setVarSpec(i, { kind: e.target.value, value: "" })}
                    >
                      <option value="literal">Static text</option>
                      <option value="token">Prospect field</option>
                    </select>
                    {spec.kind === "token" ? (
                      <select
                        data-testid={`wa-composer-var-value-${i + 1}`}
                        className="border-2 border-black px-2 py-1.5 text-sm font-mono"
                        value={spec.value}
                        onChange={(e) => setVarSpec(i, { value: e.target.value })}
                      >
                        <option value="">— Select field —</option>
                        <option value="{{first_name}}">{"{{first_name}}"}</option>
                        <option value="{{name}}">{"{{name}}"}</option>
                        <option value="{{company}}">{"{{company}}"}</option>
                        <option value="{{email}}">{"{{email}}"}</option>
                        <option value="{{phone}}">{"{{phone}}"}</option>
                      </select>
                    ) : (
                      <input
                        data-testid={`wa-composer-var-value-${i + 1}`}
                        className="border-2 border-black px-2 py-1.5 text-sm"
                        placeholder={`Static value for {{${i + 1}}}`}
                        value={spec.value}
                        onChange={(e) => setVarSpec(i, { value: e.target.value })}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-600">Target lists</label>
            <p className="text-[11px] text-neutral-500">
              Pick from <strong>both</strong> your WhatsApp lists and Email lists — email lists carry phone numbers too. Leave empty to broadcast to <strong>all active contacts with a phone number</strong>. Contacts without a phone are skipped automatically.
            </p>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
              {lists.map((l) => {
                const wa = (l.list_type || "email") === "whatsapp";
                const reach = l.counts?.active_with_phone ?? l.counts?.active ?? 0;
                return (
                  <label key={l.id} className="border-2 border-black p-2 flex items-center gap-2 text-sm cursor-pointer hover:bg-neutral-50"
                         data-testid={`wa-composer-list-${l.id}`}>
                    <input
                      type="checkbox"
                      checked={form.list_ids.includes(l.id)}
                      onChange={() => toggleList(l.id)}
                    />
                    {wa ? <MessageCircle size={12} className="text-[#0b7a3b]" /> : <Mail size={12} className="text-[#002FA7]" />}
                    <span className="font-bold truncate">{l.name}</span>
                    <span className={`text-[8px] font-black uppercase px-1 border ${wa ? "bg-[#25D366]/20 text-[#0b7a3b] border-[#0b7a3b]" : "bg-[#002FA7]/10 text-[#002FA7] border-[#002FA7]"}`}>{wa ? "WA" : "Email"}</span>
                    <span className="ml-auto text-[10px] font-mono text-neutral-500 shrink-0">{reach} w/ phone</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="border-t-2 border-black px-5 py-3 flex items-center justify-between bg-neutral-50">
          <div className="text-sm text-neutral-700">
            ~<strong>{targetCount}</strong> max recipients with a phone (from {form.list_ids.length || "all"} list{form.list_ids.length === 1 ? "" : "s"}).
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="border-2 border-black px-4 py-2 text-sm font-bold bg-white hover-lift">Cancel</button>
            <button
              onClick={submit}
              disabled={submitting || approved.length === 0}
              data-testid="wa-composer-launch"
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

function WaCampaignsPanel({ lists, waConnected }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [recipients, setRecipients] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/sales/wa/campaigns");
      setItems(data.campaigns || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load campaigns");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const hasLive = items.some((c) => ["sending", "scheduled"].includes(c.status));
    if (!hasLive) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [items]);

  const loadRecipients = async (cid) => {
    if (expanded === cid) { setExpanded(null); return; }
    try {
      const { data } = await api.get(`/sales/wa/campaigns/${cid}`);
      setRecipients(data.recipients || []);
      setExpanded(cid);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const action = async (cid, kind) => {
    try {
      await api.post(`/sales/wa/campaigns/${cid}/${kind}`);
      toast.success(`Campaign ${kind}d`);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Action failed");
    }
  };

  const fmtDate = (s) => s ? new Date(s).toLocaleString() : "—";

  if (!waConnected) {
    return (
      <div className="border-2 border-amber-700 bg-amber-50 p-6 text-center" data-testid="wa-not-connected">
        <MessageCircle size={28} className="mx-auto mb-2 text-amber-700" />
        <h3 className="font-display font-black text-lg">Connect WhatsApp first</h3>
        <p className="text-sm text-neutral-700 mt-1">
          Bulk WhatsApp campaigns reuse your connected Meta Cloud API number.
          Hook it up in Channels first, then come back here.
        </p>
        <Link to="/app/channels" className="inline-block mt-4 bg-[#002FA7] text-white border-2 border-black px-5 py-2 font-bold shadow-brutal hover-lift">
          Go to Channels →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="sales-wa-campaigns-panel">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-neutral-700">
          Send approved WhatsApp templates to your prospect lists. Messages are paced 30s–3 min apart to stay friendly with Meta's spam heuristics.
        </p>
        <button
          onClick={() => setShowComposer(true)}
          data-testid="sales-wa-new-campaign-btn"
          className="text-sm font-bold border-2 border-black px-4 py-2 bg-[#002FA7] text-white shadow-brutal hover-lift"
        >
          <Sparkles size={14} className="inline -mt-0.5 mr-1" />
          New WhatsApp campaign
        </button>
      </div>

      {loading ? (
        <div className="p-10 text-center text-sm text-neutral-500">Loading…</div>
      ) : items.length === 0 ? (
        <div className="border-2 border-black bg-white shadow-brutal p-10 text-center" data-testid="sales-wa-empty">
          <Megaphone size={28} className="mx-auto mb-3 text-[#002FA7]" />
          <h3 className="font-display font-black text-xl">No WhatsApp campaigns yet</h3>
          <p className="text-sm text-neutral-600 mt-1">Launch your first bulk template send to reach prospects on WhatsApp.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((c) => {
            const isOpen = expanded === c.id;
            const pct = c.total ? Math.round(((c.sent_count + c.failed_count) / c.total) * 100) : 0;
            return (
              <div key={c.id} className="border-2 border-black bg-white shadow-brutal" data-testid={`sales-wa-camp-${c.id}`}>
                <div className="p-4 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 ${WA_STATUS_BADGE[c.status] || "bg-neutral-200"}`}>
                        {c.status}
                      </span>
                      <h4 className="font-display font-black text-lg truncate">{c.name}</h4>
                    </div>
                    <div className="text-xs text-neutral-500 mt-1 truncate">
                      Template: <code className="font-mono font-bold">{c.template_name}</code> · {c.language}
                    </div>
                    <div className="text-[11px] text-neutral-500 mt-1">
                      Created {fmtDate(c.created_at)} · From {c.from_phone || "—"}
                    </div>
                    <div className="mt-2 grid grid-cols-3 md:grid-cols-4 gap-2 max-w-2xl">
                      <Stat icon={Users} label="Total" value={c.total} />
                      <Stat icon={Check} label="Sent" value={c.sent_count} />
                      <Stat icon={AlertTriangle} label="Failed" value={c.failed_count} />
                      <Stat icon={Clock} label="Progress" value={`${pct}%`} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 lg:items-end">
                    <div className="flex gap-1 flex-wrap">
                      {c.status === "sending" && (
                        <button onClick={() => action(c.id, "pause")} data-testid={`sales-wa-pause-${c.id}`} className="border-2 border-black px-2 py-1 text-xs font-bold bg-white hover-lift flex items-center gap-1">
                          <Pause size={12} /> Pause
                        </button>
                      )}
                      {c.status === "paused" && (
                        <button onClick={() => action(c.id, "resume")} data-testid={`sales-wa-resume-${c.id}`} className="border-2 border-black px-2 py-1 text-xs font-bold bg-white hover-lift flex items-center gap-1">
                          <Play size={12} /> Resume
                        </button>
                      )}
                      {["sending", "scheduled", "paused"].includes(c.status) && (
                        <button onClick={() => action(c.id, "cancel")} data-testid={`sales-wa-cancel-${c.id}`} className="border-2 border-black px-2 py-1 text-xs font-bold bg-white hover-lift flex items-center gap-1">
                          <X size={12} /> Cancel
                        </button>
                      )}
                      <button onClick={() => loadRecipients(c.id)} data-testid={`sales-wa-toggle-${c.id}`} className="border-2 border-black px-2 py-1 text-xs font-bold bg-white hover-lift flex items-center gap-1">
                        <Eye size={12} /> {isOpen ? "Hide" : "Details"}
                      </button>
                    </div>
                  </div>
                </div>
                {isOpen && (
                  <div className="border-t-2 border-black p-3 bg-neutral-50" data-testid={`sales-wa-recipients-${c.id}`}>
                    <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-600 mb-2">
                      Recipients ({recipients.length})
                    </div>
                    <div className="max-h-72 overflow-auto border-2 border-black bg-white">
                      <table className="w-full text-xs">
                        <thead className="bg-neutral-100 sticky top-0">
                          <tr>
                            <th className="text-left px-2 py-1 border-b border-black">Phone</th>
                            <th className="text-left px-2 py-1 border-b border-black">Name</th>
                            <th className="text-left px-2 py-1 border-b border-black">Status</th>
                            <th className="text-left px-2 py-1 border-b border-black">Sent at</th>
                            <th className="text-left px-2 py-1 border-b border-black">Error</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recipients.map((r) => (
                            <tr key={r.id} className="border-b border-neutral-200">
                              <td className="px-2 py-1 font-mono">{r.phone}</td>
                              <td className="px-2 py-1">{r.name || "—"}</td>
                              <td className="px-2 py-1">
                                {(() => {
                                  const ds = r.delivery_status || r.status;
                                  const label = (ds || "sent").toUpperCase();
                                  const cls = ds === "read" ? "bg-blue-200 text-blue-900"
                                    : ds === "delivered" ? "bg-green-200 text-green-900"
                                    : ds === "failed" || r.status === "failed" ? "bg-red-200 text-red-900"
                                    : ds === "sent" ? "bg-amber-200 text-amber-900"
                                    : "bg-neutral-200";
                                  return <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 ${cls}`}>{label}</span>;
                                })()}
                              </td>
                              <td className="px-2 py-1 font-mono text-[10px]">{r.sent_at ? new Date(r.sent_at).toLocaleString() : "—"}</td>
                              <td className="px-2 py-1 text-red-700 text-[10px]">{r.error || ""}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showComposer && (
        <WaComposer
          lists={lists}
          onClose={() => setShowComposer(false)}
          onLaunched={() => { setShowComposer(false); load(); }}
        />
      )}
    </div>
  );
}

function WaAnalyticsPanel() {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/sales/wa/analytics", { params: { days } })
      .then(({ data }) => setData(data))
      .catch((e) => toast.error(e?.response?.data?.detail || "Failed to load analytics"))
      .finally(() => setLoading(false));
  }, [days]);

  if (loading || !data) return <div className="p-10 text-center text-sm text-neutral-500">Loading…</div>;
  const t = data.totals;
  const max = Math.max(1, ...data.daily.map((d) => d.sent));

  return (
    <div className="space-y-5" data-testid="sales-wa-analytics-panel">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-black text-2xl">WhatsApp performance</h3>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}
                data-testid="sales-wa-analytics-days"
                className="border-2 border-black px-3 py-1.5 text-sm">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>Last year</option>
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <BigStat label="Sent" value={t.sent || 0} testid="wa-stat-sent" />
        <BigStat label="Failed" value={t.failed || 0} testid="wa-stat-failed" />
        <BigStat label="Pending" value={t.pending || 0} testid="wa-stat-pending" highlight />
      </div>

      <div className="border-2 border-black bg-white shadow-brutal p-5">
        <h4 className="font-display font-black text-lg">Daily activity</h4>
        {data.daily.length === 0 ? (
          <div className="text-sm text-neutral-500 mt-3">No sends in the selected window yet.</div>
        ) : (
          <div className="mt-4 grid items-end gap-1" style={{ gridTemplateColumns: `repeat(${data.daily.length}, minmax(20px, 1fr))`, minHeight: 180 }}>
            {data.daily.map((s) => (
              <div key={s.day} className="flex flex-col items-center gap-1 group">
                <div className="text-[9px] font-mono text-neutral-500 opacity-0 group-hover:opacity-100">{s.sent}/{s.sent + s.failed}</div>
                <div className="relative w-full bg-neutral-100 border-2 border-black" style={{ height: 140 }}>
                  <div className="absolute bottom-0 inset-x-0 bg-red-400" style={{ height: `${((s.failed) / max) * 100}%` }} />
                  <div className="absolute bottom-0 inset-x-0 bg-[#002FA7]" style={{ height: `${((s.sent) / max) * 100}%`, opacity: 0.85 }} />
                </div>
                <div className="text-[9px] font-mono text-neutral-500 -rotate-45 origin-top-left whitespace-nowrap">{s.day.slice(5)}</div>
              </div>
            ))}
          </div>
        )}
        <div className="text-[11px] font-mono text-neutral-600 mt-3 flex gap-4">
          <span><span className="inline-block w-3 h-3 align-middle bg-[#002FA7] border border-black"></span> Sent</span>
          <span><span className="inline-block w-3 h-3 align-middle bg-red-400 border border-black"></span> Failed</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------- main page ---
export default function SalesAssistant() {
  const [tab, setTab] = useState("prospects");
  const [access, setAccess] = useState(null);
  const [loadingAccess, setLoadingAccess] = useState(true);
  const [lists, setLists] = useState([]);
  const [activeListId, setActiveListId] = useState(null);

  useEffect(() => {
    api.get("/sales/access")
      .then(({ data }) => setAccess(data))
      .catch((e) => setAccess({ enabled: false, reason: e?.response?.data?.detail || "Access check failed" }))
      .finally(() => setLoadingAccess(false));
  }, []);

  const reloadLists = async () => {
    try {
      const { data } = await api.get("/sales/lists");
      setLists(data.items);
      if (!activeListId && data.items.length > 0) setActiveListId(data.items[0].id);
    } catch (e) { /* ignore */ }
  };
  useEffect(() => {
    if (access?.enabled) reloadLists();
    // eslint-disable-next-line
  }, [access?.enabled]);

  if (loadingAccess) return <div className="p-10 font-mono text-sm">Loading…</div>;
  if (!access?.enabled) return <LockedScreen reason={access?.reason} />;

  return (
    <div className="p-4 sm:p-6 space-y-5" data-testid="sales-assistant-page">
      <header>
        <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7] flex items-center gap-2">
          <Megaphone size={12} /> Sales Assistant
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-black tracking-tighter mt-1">
          Outbound campaigns — email, WhatsApp, calls
        </h1>
        <p className="text-sm text-neutral-600 mt-1">
          One prospect pool, three channels. Compose, pace and track multi-list
          campaigns across email and WhatsApp from a single place.
        </p>
      </header>

      <div className="border-b-2 border-black flex gap-0 overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              data-testid={`sales-tab-${t.id}`}
              className={`px-4 py-2.5 text-sm font-bold border-2 border-b-0 -mb-0.5 whitespace-nowrap ${
                isActive ? "bg-[#002FA7] text-white border-black" : "bg-transparent border-transparent text-neutral-700 hover:text-black"
              }`}
            >
              <Icon size={13} className="inline -mt-0.5 mr-1.5" />
              {t.label}
              {t.comingSoon && <span className="ml-1.5 text-[9px] font-mono opacity-70">soon</span>}
            </button>
          );
        })}
      </div>

      {tab === "prospects" && (
        <ProspectsPanel
          lists={lists}
          activeListId={activeListId}
          setActiveListId={setActiveListId}
          reloadLists={reloadLists}
        />
      )}
      {tab === "emails" && (
        <div className="space-y-8">
          <CampaignsPanel lists={lists} />
          <div className="border-t-2 border-black pt-6">
            <AnalyticsPanel />
          </div>
        </div>
      )}
      {tab === "whatsapp" && (
        <div className="space-y-8">
          <WaCampaignsPanel lists={lists} waConnected={!!access?.channels?.whatsapp?.connected} />
          {access?.channels?.whatsapp?.connected && (
            <div className="border-t-2 border-black pt-6">
              <WaAnalyticsPanel />
            </div>
          )}
        </div>
      )}
      {tab === "calls" && <OutboundCalls />}
    </div>
  );
}
