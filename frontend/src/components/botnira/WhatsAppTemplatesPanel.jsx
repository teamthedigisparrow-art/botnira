import { useEffect, useState, useMemo } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { FileText, Plus, Send, Trash2, RefreshCw, Info, X } from "lucide-react";

const CATEGORIES = [
  { id: "MARKETING", label: "Marketing", note: "Promotions, offers, announcements." },
  { id: "UTILITY", label: "Utility", note: "Order updates, reminders, account alerts." },
  { id: "AUTHENTICATION", label: "Auth", note: "OTPs / verification codes." },
];

const LANGS = ["en_US", "en_GB", "es_ES", "fr_FR", "pt_BR", "hi_IN", "ar_AR"];

const STATUS_STYLES = {
  APPROVED: "bg-green-100 text-green-800 border-green-700",
  PENDING: "bg-amber-100 text-amber-800 border-amber-700",
  REJECTED: "bg-red-100 text-red-800 border-red-700",
  IN_APPEAL: "bg-amber-100 text-amber-800 border-amber-700",
  PAUSED: "bg-neutral-100 text-neutral-700 border-neutral-700",
  DISABLED: "bg-neutral-100 text-neutral-700 border-neutral-700",
};

const findBodyText = (tpl) => {
  const body = (tpl.components || []).find((c) => c.type === "BODY");
  return body?.text || "";
};

const findHeaderText = (tpl) => {
  const h = (tpl.components || []).find((c) => c.type === "HEADER");
  return h?.text || "";
};

const findFooterText = (tpl) => {
  const f = (tpl.components || []).find((c) => c.type === "FOOTER");
  return f?.text || "";
};

const placeholderCount = (txt) => {
  const matches = (txt || "").match(/\{\{\s*(\d+)\s*\}\}/g) || [];
  const nums = matches.map((m) => parseInt(m.replace(/[^\d]/g, ""), 10)).filter((n) => !Number.isNaN(n));
  return nums.length === 0 ? 0 : Math.max(...nums);
};

export default function WhatsAppTemplatesPanel({ phoneRegistered = true }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [sendTpl, setSendTpl] = useState(null); // template being sent
  const [busy, setBusy] = useState(false);

  // Create form state
  const [form, setForm] = useState({
    name: "",
    language: "en_US",
    category: "MARKETING",
    header_text: "",
    body_text: "",
    footer_text: "",
    body_example_vars: [],
    buttons: [],
  });
  const placeholdersInBody = useMemo(() => placeholderCount(form.body_text), [form.body_text]);

  // Send form state
  const [sendForm, setSendForm] = useState({ to: "", body_vars: [] });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/whatsapp/templates");
      setTemplates(data.templates || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setForm({
      name: "",
      language: "en_US",
      category: "MARKETING",
      header_text: "",
      body_text: "",
      footer_text: "",
      body_example_vars: [],
      buttons: [],
    });
    setShowCreate(false);
  };

  const submitCreate = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    if (!form.body_text.trim()) return toast.error("Body is required");
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        language: form.language,
        category: form.category,
        body_text: form.body_text.trim(),
        header_text: form.header_text.trim() || null,
        footer_text: form.footer_text.trim() || null,
        body_example_vars: placeholdersInBody > 0 ? form.body_example_vars.slice(0, placeholdersInBody) : null,
        buttons: (form.buttons || []).filter((b) => (b.text || "").trim()).slice(0, 2).map((b) => ({
          type: b.type,
          text: b.text.trim(),
          url: b.type === "URL" ? (b.url || "").trim() : undefined,
          phone_number: b.type === "PHONE_NUMBER" ? (b.phone_number || "").trim() : undefined,
        })),
      };
      const { data } = await api.post("/whatsapp/templates", payload);
      toast.success(`Submitted "${data.submitted_name}" — awaiting Meta approval`);
      resetForm();
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const deleteTpl = async (tpl) => {
    if (!window.confirm(`Delete template "${tpl.name}"? This removes it from your WABA on Meta.`)) return;
    try {
      await api.delete(`/whatsapp/templates?name=${encodeURIComponent(tpl.name)}${tpl.id ? `&hsm_id=${encodeURIComponent(tpl.id)}` : ""}`);
      toast.success("Template deleted");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    }
  };

  const submitSend = async () => {
    if (!sendForm.to.trim()) return toast.error("Recipient phone is required");
    setBusy(true);
    try {
      const need = placeholderCount(findBodyText(sendTpl));
      const vars = sendForm.body_vars.slice(0, need);
      if (vars.length < need) {
        setBusy(false);
        return toast.error(`Fill all ${need} variables`);
      }
      const payload = {
        to: sendForm.to.trim(),
        template_name: sendTpl.name,
        language: sendTpl.language || "en_US",
        body_vars: need > 0 ? vars : null,
      };
      await api.post("/whatsapp/send-template", payload);
      toast.success("Template sent");
      setSendTpl(null);
      setSendForm({ to: "", body_vars: [] });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Send failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="wa-templates-panel"
      className="border-2 border-black bg-white p-5 space-y-4"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="font-display font-bold text-lg flex items-center gap-2">
            <FileText size={18} /> Message Templates
          </div>
          <p className="text-sm text-neutral-700 mt-1 max-w-xl">
            Pre-approved messages you can send <strong>outside</strong> Meta's 24-hour
            customer-service window. Required for re-engagement, promos, OTPs and reminders.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="wa-tpl-refresh-btn"
            onClick={load}
            disabled={loading}
            className="border-2 border-black bg-white px-3 py-1.5 text-sm font-bold hover-lift disabled:opacity-60 flex items-center gap-1"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button
            data-testid="wa-tpl-create-btn"
            onClick={() => setShowCreate((v) => !v)}
            className="border-2 border-black bg-[#002FA7] text-white px-3 py-1.5 text-sm font-bold hover-lift flex items-center gap-1"
          >
            <Plus size={14} /> New template
          </button>
        </div>
      </div>

      {/* Approval expectation */}
      <div className="border border-amber-700 bg-amber-50 text-xs px-3 py-2 flex gap-2" data-testid="wa-tpl-info">
        <Info size={14} className="mt-0.5 flex-shrink-0" />
        <div>
          New templates are reviewed by Meta — typically a few minutes for plain text, up to ~24 hours
          if flagged. Use <code className="font-mono">{"{{1}}"}</code>, <code className="font-mono">{"{{2}}"}</code> etc. for personalisation.
        </div>
      </div>

      {!phoneRegistered && (
        <div className="border-2 border-amber-700 bg-amber-50 text-xs px-3 py-2 flex gap-2" data-testid="wa-tpl-phone-warning">
          <Info size={14} className="mt-0.5 flex-shrink-0 text-amber-800" />
          <div className="text-amber-900">
            <strong>Heads up:</strong> your WhatsApp number isn't fully activated yet, so the <em>Send</em>
            action is disabled. You <strong>can</strong> still create, edit and delete templates here —
            Meta processes approvals at the WABA level. Activate messaging in the panel above to start sending.
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div data-testid="wa-tpl-create-form" className="border-2 border-dashed border-black p-4 space-y-3 bg-neutral-50">
          <div className="flex items-center justify-between">
            <div className="font-display font-bold">Create template</div>
            <button onClick={resetForm} className="text-neutral-500 hover:text-black" data-testid="wa-tpl-create-close">
              <X size={16} />
            </button>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-600">Name (a-z, 0-9, _)</label>
              <input
                data-testid="wa-tpl-name"
                className="w-full border-2 border-black px-2 py-1.5 text-sm font-mono"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="welcome_back_offer"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-600">Language</label>
              <select
                data-testid="wa-tpl-lang"
                className="w-full border-2 border-black px-2 py-1.5 text-sm font-mono"
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
              >
                {LANGS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-600">Category</label>
              <select
                data-testid="wa-tpl-cat"
                className="w-full border-2 border-black px-2 py-1.5 text-sm font-mono"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <p className="text-[10px] text-neutral-500 mt-1">
                {CATEGORIES.find((c) => c.id === form.category)?.note}
              </p>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-600">Header (optional, ≤60 chars)</label>
            <input
              data-testid="wa-tpl-header"
              maxLength={60}
              className="w-full border-2 border-black px-2 py-1.5 text-sm"
              value={form.header_text}
              onChange={(e) => setForm({ ...form, header_text: e.target.value })}
              placeholder="Special offer just for you"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-600">
              Body <span className="text-red-700">*</span> (≤1024 chars)
            </label>
            <textarea
              data-testid="wa-tpl-body"
              maxLength={1024}
              className="w-full border-2 border-black px-2 py-1.5 text-sm font-mono min-h-[100px]"
              value={form.body_text}
              onChange={(e) => setForm({ ...form, body_text: e.target.value })}
              placeholder={"Hi {{1}}, we miss you at {{2}}! Use code SAVE20 for 20% off this week."}
            />
            <div className="text-[10px] text-neutral-500 mt-1">
              {form.body_text.length}/1024 · {placeholdersInBody} variable{placeholdersInBody === 1 ? "" : "s"} detected
            </div>
          </div>
          {placeholdersInBody > 0 && (
            <div data-testid="wa-tpl-examples">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-600">
                Example values (required by Meta)
              </label>
              <div className="grid md:grid-cols-2 gap-2 mt-1">
                {Array.from({ length: placeholdersInBody }).map((_, i) => (
                  <input
                    key={i}
                    data-testid={`wa-tpl-example-${i + 1}`}
                    className="border-2 border-black px-2 py-1.5 text-sm"
                    placeholder={`Sample for {{${i + 1}}}`}
                    value={form.body_example_vars[i] || ""}
                    onChange={(e) => {
                      const next = [...form.body_example_vars];
                      next[i] = e.target.value;
                      setForm({ ...form, body_example_vars: next });
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-600">Footer (optional, ≤60 chars)</label>
            <input
              data-testid="wa-tpl-footer"
              maxLength={60}
              className="w-full border-2 border-black px-2 py-1.5 text-sm"
              value={form.footer_text}
              onChange={(e) => setForm({ ...form, footer_text: e.target.value })}
              placeholder="Reply STOP to unsubscribe"
            />
          </div>

          {/* Buttons (up to 2): quick-reply or call-to-action */}
          <div data-testid="wa-tpl-buttons">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-600">Buttons (optional, up to 2)</label>
              {(form.buttons?.length || 0) < 2 && (
                <div className="flex gap-1">
                  <button type="button" data-testid="wa-tpl-add-qr"
                    onClick={() => setForm({ ...form, buttons: [...(form.buttons || []), { type: "QUICK_REPLY", text: "" }] })}
                    className="text-[11px] font-bold border-2 border-black px-2 py-1 hover:bg-neutral-100">+ Quick reply</button>
                  <button type="button" data-testid="wa-tpl-add-url"
                    onClick={() => setForm({ ...form, buttons: [...(form.buttons || []), { type: "URL", text: "", url: "" }] })}
                    className="text-[11px] font-bold border-2 border-black px-2 py-1 hover:bg-neutral-100">+ Visit website</button>
                  <button type="button" data-testid="wa-tpl-add-phone"
                    onClick={() => setForm({ ...form, buttons: [...(form.buttons || []), { type: "PHONE_NUMBER", text: "", phone_number: "" }] })}
                    className="text-[11px] font-bold border-2 border-black px-2 py-1 hover:bg-neutral-100">+ Call</button>
                </div>
              )}
            </div>
            <div className="space-y-2 mt-1">
              {(form.buttons || []).map((b, i) => {
                const upd = (patch) => { const n = [...form.buttons]; n[i] = { ...n[i], ...patch }; setForm({ ...form, buttons: n }); };
                return (
                  <div key={i} className="border-2 border-black p-2 bg-white" data-testid={`wa-tpl-button-${i}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono border border-black px-1.5 py-0.5">
                        {b.type === "URL" ? "URL" : b.type === "PHONE_NUMBER" ? "CALL" : "QUICK REPLY"}
                      </span>
                      <input data-testid={`wa-tpl-button-text-${i}`} maxLength={25} value={b.text}
                        onChange={(e) => upd({ text: e.target.value })} placeholder="Button label (≤25 chars)"
                        className="flex-1 border-2 border-black px-2 py-1 text-sm" />
                      <button type="button" onClick={() => setForm({ ...form, buttons: form.buttons.filter((_, j) => j !== i) })}
                        className="text-neutral-500 hover:text-red-600" data-testid={`wa-tpl-button-remove-${i}`}><X size={14} /></button>
                    </div>
                    {b.type === "URL" && (
                      <input data-testid={`wa-tpl-button-url-${i}`} value={b.url || ""} onChange={(e) => upd({ url: e.target.value })}
                        placeholder="https://example.com" className="w-full mt-2 border-2 border-black px-2 py-1 text-sm font-mono" />
                    )}
                    {b.type === "PHONE_NUMBER" && (
                      <input data-testid={`wa-tpl-button-phone-${i}`} value={b.phone_number || ""} onChange={(e) => upd({ phone_number: e.target.value })}
                        placeholder="+14165550123" className="w-full mt-2 border-2 border-black px-2 py-1 text-sm font-mono" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              data-testid="wa-tpl-submit"
              onClick={submitCreate}
              disabled={busy}
              className="bg-[#002FA7] text-white font-bold px-4 py-2 border-2 border-black shadow-brutal hover-lift disabled:opacity-60"
            >
              {busy ? "Submitting…" : "Submit for approval"}
            </button>
            <button
              onClick={resetForm}
              className="bg-white font-bold px-4 py-2 border-2 border-black hover-lift"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Templates list */}
      <div data-testid="wa-tpl-list" className="space-y-2">
        {loading && templates.length === 0 && (
          <div className="text-sm text-neutral-500">Loading templates…</div>
        )}
        {!loading && templates.length === 0 && (
          <div className="border border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-700" data-testid="wa-tpl-empty">
            No templates yet. Submit your first one to unlock outside-24h messaging.
          </div>
        )}
        {templates.map((tpl) => {
          const body = findBodyText(tpl);
          const header = findHeaderText(tpl);
          const footer = findFooterText(tpl);
          const phCount = placeholderCount(body);
          const status = tpl.status || "PENDING";
          const style = STATUS_STYLES[status] || STATUS_STYLES.PENDING;
          return (
            <div key={tpl.id || tpl.name} className="border-2 border-black p-3 bg-white" data-testid={`wa-tpl-row-${tpl.name}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-bold">{tpl.name}</span>
                    <span className={`text-[10px] font-bold uppercase border px-1.5 py-0.5 ${style}`}>
                      {status}
                    </span>
                    <span className="text-[10px] font-mono border border-black px-1.5 py-0.5">
                      {tpl.category || "—"}
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500">{tpl.language}</span>
                    {phCount > 0 && (
                      <span className="text-[10px] font-mono text-[#002FA7] border border-[#002FA7] px-1.5 py-0.5">
                        {phCount} var{phCount === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  {header && <div className="mt-2 text-xs font-bold text-neutral-700">{header}</div>}
                  <div className="mt-1 text-sm whitespace-pre-wrap break-words">{body}</div>
                  {footer && <div className="mt-1 text-xs text-neutral-500">{footer}</div>}
                  {(() => {
                    const btns = ((tpl.components || []).find((c) => c.type === "BUTTONS")?.buttons) || [];
                    return btns.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {btns.map((b, i) => (
                          <span key={i} className="text-[10px] font-bold text-[#002FA7] border border-[#002FA7] rounded-full px-2 py-0.5">
                            {b.type === "URL" ? "🔗 " : b.type === "PHONE_NUMBER" ? "📞 " : "💬 "}{b.text}
                          </span>
                        ))}
                      </div>
                    ) : null;
                  })()}
                </div>
                <div className="flex items-center gap-1">
                  {status === "APPROVED" && (
                    <button
                      data-testid={`wa-tpl-send-${tpl.name}`}
                      onClick={() => {
                        setSendTpl(tpl);
                        setSendForm({ to: "", body_vars: new Array(phCount).fill("") });
                      }}
                      disabled={!phoneRegistered}
                      title={phoneRegistered ? "Send this template" : "Activate your WhatsApp number to send"}
                      className="border-2 border-black bg-[#002FA7] text-white px-2 py-1 text-xs font-bold flex items-center gap-1 hover-lift disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Send size={12} /> Send
                    </button>
                  )}
                  <button
                    data-testid={`wa-tpl-delete-${tpl.name}`}
                    onClick={() => deleteTpl(tpl)}
                    className="border-2 border-black bg-white px-2 py-1 text-xs font-bold flex items-center gap-1 hover-lift"
                    title="Delete template"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Send modal */}
      {sendTpl && (
        <div
          data-testid="wa-tpl-send-modal"
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSendTpl(null)}
        >
          <div
            className="bg-white border-2 border-black shadow-brutal max-w-lg w-full p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="font-display font-bold text-lg">Send "{sendTpl.name}"</div>
              <button onClick={() => setSendTpl(null)} data-testid="wa-tpl-send-close">
                <X size={16} />
              </button>
            </div>
            <div className="text-xs text-neutral-600 bg-neutral-50 border border-neutral-300 p-2 whitespace-pre-wrap">
              {findBodyText(sendTpl)}
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-600">Recipient phone (with country code)</label>
              <input
                data-testid="wa-tpl-send-to"
                className="w-full border-2 border-black px-2 py-1.5 text-sm font-mono"
                placeholder="+14165550123"
                value={sendForm.to}
                onChange={(e) => setSendForm({ ...sendForm, to: e.target.value })}
              />
            </div>
            {sendForm.body_vars.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-neutral-600">Variables</div>
                {sendForm.body_vars.map((v, i) => (
                  <input
                    key={i}
                    data-testid={`wa-tpl-send-var-${i + 1}`}
                    className="w-full border-2 border-black px-2 py-1.5 text-sm"
                    placeholder={`Value for {{${i + 1}}}`}
                    value={v}
                    onChange={(e) => {
                      const next = [...sendForm.body_vars];
                      next[i] = e.target.value;
                      setSendForm({ ...sendForm, body_vars: next });
                    }}
                  />
                ))}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                data-testid="wa-tpl-send-submit"
                onClick={submitSend}
                disabled={busy}
                className="bg-[#002FA7] text-white font-bold px-4 py-2 border-2 border-black shadow-brutal hover-lift disabled:opacity-60 flex items-center gap-1"
              >
                <Send size={14} /> {busy ? "Sending…" : "Send template"}
              </button>
              <button
                onClick={() => setSendTpl(null)}
                className="bg-white font-bold px-4 py-2 border-2 border-black hover-lift"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
