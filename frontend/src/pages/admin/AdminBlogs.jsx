import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import {
  Plus, Edit2, Eye, EyeOff, Trash2, Save, X, Upload, Image as ImageIcon,
  Copy, Check, ArrowLeft, FileText, Tag, Search, Sparkles, ExternalLink,
} from "lucide-react";
import { renderMarkdown } from "../../lib/markdown";

const fmtDate = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); }
  catch { return iso; }
};

const resolveImg = (url) =>
  url && url.startsWith("/api/")
    ? `${process.env.REACT_APP_BACKEND_URL}${url}`
    : url;

const STATUS_TONES = {
  active: "bg-green-200",
  inactive: "bg-neutral-300",
  draft: "bg-yellow-200",
};

export default function AdminBlogs() {
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState(null); // null | "new" | {blog}

  const reload = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/blogs");
      setBlogs(data.blogs || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not load blogs");
    } finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []);

  const filtered = useMemo(() => {
    let list = blogs;
    if (statusFilter !== "all") list = list.filter((b) => b.status === statusFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((b) =>
        b.title.toLowerCase().includes(q) ||
        (b.slug || "").toLowerCase().includes(q) ||
        (b.tags || []).join(" ").toLowerCase().includes(q)
      );
    }
    return list;
  }, [blogs, query, statusFilter]);

  if (editing) {
    return (
      <BlogEditor
        existing={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); reload(); }}
      />
    );
  }

  return (
    <div className="p-8 space-y-6" data-testid="admin-blogs-page">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#6f8cff]">Superadmin · Content</div>
          <h1 className="font-display text-4xl font-black tracking-tighter">Blogs</h1>
          <p className="text-neutral-700 mt-1 max-w-2xl">
            Write SEO-optimised posts for botnira.com. Drafts stay hidden from the public blog until you flip them active.
          </p>
        </div>
        <button
          onClick={() => setEditing("new")}
          data-testid="admin-blogs-new-btn"
          className="bg-[#002FA7] text-white font-bold px-5 py-2.5 border-2 border-black shadow-brutal hover-lift inline-flex items-center gap-2"
        >
          <Plus size={16}/> New post
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 border-2 border-black bg-white px-3 py-2 flex-1 min-w-[260px] max-w-md">
          <Search size={14}/>
          <input
            data-testid="admin-blogs-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, slug, tag…"
            className="flex-1 outline-none text-sm font-medium"
          />
        </div>
        <div className="flex flex-wrap gap-1.5" data-testid="admin-blogs-status-filter">
          {["all", "active", "draft", "inactive"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              data-testid={`admin-blogs-filter-${s}`}
              className={`text-xs font-bold uppercase tracking-widest border-2 border-black px-3 py-1.5 ${statusFilter === s ? "bg-black text-white" : "bg-white"}`}
            >
              {s} {s !== "all" && <span className="opacity-60">· {blogs.filter((b) => b.status === s).length}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="font-mono text-neutral-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="border-2 border-dashed border-neutral-400 p-12 text-center text-neutral-600" data-testid="admin-blogs-empty">
          {blogs.length === 0
            ? "No blog posts yet. Click 'New post' to write your first."
            : "No posts match your filters."}
        </div>
      ) : (
        <div className="border-2 border-black bg-white overflow-x-auto" data-testid="admin-blogs-table">
          <table className="w-full text-sm">
            <thead className="bg-neutral-100 border-b-2 border-black">
              <tr>
                {["Title", "Status", "Tags", "Views", "Updated", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-bold tracking-[0.22em] uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id} className="border-b border-neutral-200 hover:bg-neutral-50" data-testid={`admin-blog-row-${b.id}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {b.featured_image_url ? (
                        <img src={resolveImg(b.featured_image_url)} alt="" className="w-12 h-12 object-cover border-2 border-black" />
                      ) : (
                        <div className="w-12 h-12 bg-yellow-100 border-2 border-black flex items-center justify-center">
                          <FileText size={16} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-display font-bold truncate max-w-[360px]">{b.title}</div>
                        <div className="text-xs font-mono text-neutral-500 truncate max-w-[360px]">/{b.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold uppercase tracking-widest border border-black px-2 py-0.5 ${STATUS_TONES[b.status] || "bg-neutral-200"}`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(b.tags || []).slice(0, 3).map((t) => (
                        <span key={t} className="text-[9px] font-bold uppercase tracking-widest bg-neutral-100 border border-black px-1.5 py-0.5">{t}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono">{b.view_count || 0}</td>
                  <td className="px-4 py-3 font-mono text-xs">{fmtDate(b.updated_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditing(b)}
                        data-testid={`admin-blog-edit-${b.id}`}
                        title="Edit"
                        className="p-2 border-2 border-black bg-white hover:bg-neutral-100"
                      >
                        <Edit2 size={14}/>
                      </button>
                      <ToggleStatusBtn blog={b} onChanged={reload} />
                      {b.status === "active" && (
                        <a
                          href={`/blog/${b.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          title="View public"
                          className="p-2 border-2 border-black bg-white hover:bg-neutral-100"
                        >
                          <ExternalLink size={14}/>
                        </a>
                      )}
                      <DeleteBtn blog={b} onChanged={reload} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ToggleStatusBtn({ blog, onChanged }) {
  const [busy, setBusy] = useState(false);
  const next = blog.status === "active" ? "deactivate" : "activate";
  const click = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/blogs/${blog.id}/toggle-status`);
      toast.success(`Post ${data.status === "active" ? "activated" : "deactivated"}`);
      onChanged();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally { setBusy(false); }
  };
  return (
    <button
      onClick={click}
      disabled={busy}
      title={next}
      data-testid={`admin-blog-toggle-${blog.id}`}
      className="p-2 border-2 border-black bg-white hover:bg-neutral-100 disabled:opacity-50"
    >
      {blog.status === "active" ? <EyeOff size={14}/> : <Eye size={14}/>}
    </button>
  );
}

function DeleteBtn({ blog, onChanged }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const del = async () => {
    setBusy(true);
    try {
      await api.delete(`/admin/blogs/${blog.id}`);
      toast.success("Post deleted");
      onChanged();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally { setBusy(false); setConfirming(false); }
  };
  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        title="Delete"
        data-testid={`admin-blog-delete-${blog.id}`}
        className="p-2 border-2 border-black bg-white hover:bg-red-100"
      >
        <Trash2 size={14}/>
      </button>
    );
  }
  return (
    <>
      <button
        onClick={del}
        disabled={busy}
        data-testid={`admin-blog-delete-confirm-${blog.id}`}
        className="px-2 py-1 border-2 border-black bg-red-500 text-white text-xs font-bold"
      >
        {busy ? "…" : "Yes, delete"}
      </button>
      <button
        onClick={() => setConfirming(false)}
        className="px-2 py-1 border-2 border-black bg-white text-xs font-bold"
      >
        Cancel
      </button>
    </>
  );
}

/* ========================================================================== */
/* Editor                                                                     */
/* ========================================================================== */
function BlogEditor({ existing, onClose, onSaved }) {
  const isEdit = !!existing;
  const [form, setForm] = useState({
    title: "", slug: "", subtitle: "", excerpt: "", body_markdown: "",
    featured_image_url: "", author_name: "BotNira Team", tags: [],
    status: "draft", seo_title: "", seo_description: "", seo_keywords: "",
  });
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Load full blog on edit (the list endpoint omits body for performance).
  useEffect(() => {
    if (!isEdit) { setHydrated(true); return; }
    api.get(`/admin/blogs/${existing.id}`)
      .then(({ data }) => setForm({ ...form, ...data.blog }))
      .catch(() => toast.error("Failed to load blog"))
      .finally(() => setHydrated(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upd = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target ? e.target.value : e }));

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if ((form.tags || []).includes(t)) { setTagInput(""); return; }
    setForm({ ...form, tags: [...(form.tags || []), t] });
    setTagInput("");
  };
  const removeTag = (t) => setForm({ ...form, tags: (form.tags || []).filter((x) => x !== t) });

  const submit = async (e, statusOverride) => {
    if (e) e.preventDefault();
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    const payload = { ...form, status: statusOverride || form.status };
    try {
      if (isEdit) {
        await api.patch(`/admin/blogs/${existing.id}`, payload);
        toast.success("Blog updated");
      } else {
        await api.post("/admin/blogs", payload);
        toast.success("Blog created");
      }
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  const html = useMemo(() => renderMarkdown(form.body_markdown), [form.body_markdown]);

  if (!hydrated) return <div className="p-10 font-mono">Loading editor…</div>;

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl" data-testid="admin-blog-editor">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <button onClick={onClose} className="inline-flex items-center gap-2 text-sm font-bold hover:underline" data-testid="admin-blog-editor-back">
            <ArrowLeft size={14}/> Back to blogs
          </button>
          <h1 className="font-display text-4xl font-black tracking-tighter mt-2">
            {isEdit ? "Edit post" : "New post"}
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowPreview((v) => !v)}
            data-testid="admin-blog-preview-toggle"
            className="border-2 border-black bg-white font-bold px-4 py-2 hover-lift inline-flex items-center gap-2"
          >
            {showPreview ? <Edit2 size={14}/> : <Eye size={14}/>} {showPreview ? "Edit" : "Preview"}
          </button>
          <button
            onClick={(e) => submit(e, "draft")}
            disabled={saving}
            data-testid="admin-blog-save-draft"
            className="border-2 border-black bg-white font-bold px-4 py-2 hover-lift inline-flex items-center gap-2 disabled:opacity-60"
          >
            <Save size={14}/> Save draft
          </button>
          <button
            onClick={(e) => submit(e, "active")}
            disabled={saving}
            data-testid="admin-blog-publish"
            className="border-2 border-black bg-[#002FA7] text-white font-bold px-5 py-2 shadow-brutal hover-lift inline-flex items-center gap-2 disabled:opacity-60"
          >
            <Sparkles size={14}/> {saving ? "Saving…" : (form.status === "active" ? "Update post" : "Publish")}
          </button>
        </div>
      </div>

      <form onSubmit={(e) => submit(e)} className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        {/* Main editor */}
        <div className="space-y-5">
          <Field label="Title *" testid="admin-blog-title">
            <input
              required
              value={form.title}
              onChange={upd("title")}
              className="w-full border-2 border-black px-3 py-3 font-display font-bold text-xl focus:outline-none focus:ring-2 focus:ring-[#002FA7]"
              placeholder="The catchy headline of your post"
            />
          </Field>

          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Slug (URL)" testid="admin-blog-slug">
              <input
                value={form.slug || ""}
                onChange={upd("slug")}
                placeholder="auto-generated from title"
                className="w-full border-2 border-black px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#002FA7]"
              />
            </Field>
            <Field label="Author" testid="admin-blog-author">
              <input
                value={form.author_name || ""}
                onChange={upd("author_name")}
                className="w-full border-2 border-black px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002FA7]"
              />
            </Field>
          </div>

          <Field label="Subtitle" testid="admin-blog-subtitle">
            <input
              value={form.subtitle || ""}
              onChange={upd("subtitle")}
              maxLength={400}
              placeholder="One-line deck below the headline"
              className="w-full border-2 border-black px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002FA7]"
            />
          </Field>

          <Field label="Excerpt (preview text on blog list)" testid="admin-blog-excerpt">
            <textarea
              value={form.excerpt || ""}
              onChange={upd("excerpt")}
              maxLength={400}
              rows={2}
              placeholder="Short summary shown on the index page"
              className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#002FA7]"
            />
          </Field>

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold tracking-widest uppercase">Body (Markdown)</label>
              <InlineImageUploader onUploaded={(url) =>
                setForm((f) => ({ ...f, body_markdown: (f.body_markdown || "") + `\n\n![image](${url})\n\n` }))
              } />
            </div>
            {showPreview ? (
              <div
                className="border-2 border-black bg-white p-5 min-h-[420px] blog-body"
                data-testid="admin-blog-body-preview"
                dangerouslySetInnerHTML={{ __html: html || "<p style='color:#999'>Nothing to preview yet.</p>" }}
              />
            ) : (
              <textarea
                value={form.body_markdown || ""}
                onChange={upd("body_markdown")}
                data-testid="admin-blog-body"
                rows={22}
                placeholder={"# Your H1\n\nWrite in **Markdown**. Use the Upload button above to insert images.\n\n## Subheading\n\nA paragraph.\n\n- bullet 1\n- bullet 2\n\n> Pull quote\n\n[Call to action](https://botnira.com/signup)"}
                className="w-full border-2 border-black px-3 py-3 font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#002FA7]"
              />
            )}
            <div className="text-[10px] font-mono text-neutral-500 mt-1">
              Markdown supported: # ## ### headings · **bold** · *italic* · [link](url) · ![alt](image) · `code` · ```block``` · &gt; quote · - bullets · 1. numbers · | tables |
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="space-y-5">
          <SidePanel title="Status" testid="admin-blog-status-panel">
            <div className="grid grid-cols-3 gap-1">
              {["draft", "active", "inactive"].map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setForm({ ...form, status: s })}
                  data-testid={`admin-blog-status-${s}`}
                  className={`text-[10px] font-bold uppercase tracking-widest border-2 border-black py-2 ${form.status === s ? (STATUS_TONES[s] || "bg-black text-white") : "bg-white"}`}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="text-[10px] font-mono text-neutral-600 mt-2">
              Only <strong>Active</strong> posts appear on /blog.
            </div>
          </SidePanel>

          <SidePanel title="Featured image" testid="admin-blog-featured-panel">
            <FeaturedImageInput
              value={form.featured_image_url}
              onChange={(url) => setForm({ ...form, featured_image_url: url })}
            />
          </SidePanel>

          <SidePanel title="Tags" testid="admin-blog-tags-panel">
            <div className="flex gap-1.5 flex-wrap">
              {(form.tags || []).map((t) => (
                <span key={t} className="text-[10px] font-bold uppercase tracking-widest bg-yellow-200 border border-black px-2 py-0.5 inline-flex items-center gap-1">
                  <Tag size={10}/>{t}
                  <button type="button" onClick={() => removeTag(t)} aria-label={`Remove ${t}`}>
                    <X size={10}/>
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-1">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                placeholder="Add tag…"
                data-testid="admin-blog-tag-input"
                className="flex-1 border-2 border-black px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#002FA7]"
              />
              <button type="button" onClick={addTag} className="border-2 border-black bg-white px-3 text-sm font-bold">Add</button>
            </div>
          </SidePanel>

          <SidePanel title="SEO" testid="admin-blog-seo-panel">
            <Field label="Meta title">
              <input
                value={form.seo_title || ""}
                onChange={upd("seo_title")}
                maxLength={200}
                className="w-full border-2 border-black px-2 py-1 text-sm"
                data-testid="admin-blog-seo-title"
              />
            </Field>
            <Field label="Meta description">
              <textarea
                value={form.seo_description || ""}
                onChange={upd("seo_description")}
                maxLength={400}
                rows={2}
                className="w-full border-2 border-black px-2 py-1 text-sm"
                data-testid="admin-blog-seo-desc"
              />
            </Field>
            <Field label="Keywords (comma-sep)">
              <input
                value={form.seo_keywords || ""}
                onChange={upd("seo_keywords")}
                maxLength={400}
                className="w-full border-2 border-black px-2 py-1 text-sm"
                data-testid="admin-blog-seo-keywords"
              />
            </Field>
          </SidePanel>

          {isEdit && form.slug && (
            <SidePanel title="Public URL">
              <a
                href={`/blog/${form.slug}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-mono break-all underline hover:bg-yellow-200"
              >
                /blog/{form.slug}
              </a>
            </SidePanel>
          )}
        </aside>
      </form>
    </div>
  );
}

function Field({ label, children, testid }) {
  return (
    <div data-testid={testid}>
      <label className="text-xs font-bold tracking-widest uppercase block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function SidePanel({ title, children, testid }) {
  return (
    <div className="border-2 border-black bg-white p-4" data-testid={testid}>
      <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-neutral-600 mb-3">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function FeaturedImageInput({ value, onChange }) {
  const ref = useRef(null);
  const [uploading, setUploading] = useState(false);
  const handle = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/admin/blogs/upload-image", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onChange(data.url);
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed");
    } finally { setUploading(false); if (ref.current) ref.current.value = ""; }
  };
  return (
    <div>
      {value ? (
        <div className="space-y-2">
          <img src={resolveImg(value)} alt="featured" className="w-full border-2 border-black aspect-video object-cover" />
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => ref.current?.click()}
              className="flex-1 border-2 border-black bg-white text-xs font-bold py-1.5 hover-lift inline-flex items-center justify-center gap-1"
              data-testid="admin-blog-featured-replace"
            >
              <Upload size={12}/> Replace
            </button>
            <button
              type="button"
              onClick={() => onChange("")}
              className="border-2 border-black bg-white text-xs font-bold px-3 py-1.5 hover:bg-red-100"
              data-testid="admin-blog-featured-clear"
            >
              <X size={12}/>
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={uploading}
          data-testid="admin-blog-featured-upload"
          className="w-full border-2 border-dashed border-black bg-neutral-50 text-sm font-bold py-6 hover:bg-yellow-100 inline-flex flex-col items-center justify-center gap-1"
        >
          <ImageIcon size={20}/>
          {uploading ? "Uploading…" : "Upload featured image"}
          <span className="text-[10px] font-mono text-neutral-500">JPG · PNG · WEBP · ≤6MB</span>
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" hidden onChange={handle} />
    </div>
  );
}

function InlineImageUploader({ onUploaded }) {
  const ref = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [lastUrl, setLastUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const handle = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/admin/blogs/upload-image", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setLastUrl(data.url);
      onUploaded(data.url);
      toast.success("Image inserted into body");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed");
    } finally { setUploading(false); if (ref.current) ref.current.value = ""; }
  };
  const copyLast = async () => {
    if (!lastUrl) return;
    try {
      await navigator.clipboard.writeText(`![image](${lastUrl})`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };
  return (
    <div className="flex items-center gap-2">
      {lastUrl && (
        <button
          type="button"
          onClick={copyLast}
          className="text-[10px] font-bold uppercase tracking-widest border-2 border-black bg-white px-2 py-1 inline-flex items-center gap-1"
          title="Copy last image markdown"
        >
          {copied ? <Check size={11}/> : <Copy size={11}/>} Copy MD
        </button>
      )}
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={uploading}
        data-testid="admin-blog-body-upload-image"
        className="text-[10px] font-bold uppercase tracking-widest border-2 border-black bg-yellow-200 px-3 py-1 hover-lift inline-flex items-center gap-1 disabled:opacity-60"
      >
        <Upload size={11}/> {uploading ? "Uploading…" : "Insert image"}
      </button>
      <input ref={ref} type="file" accept="image/*" hidden onChange={handle} />
    </div>
  );
}
