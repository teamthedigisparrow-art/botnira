import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { Send, CheckCircle2, Phone, MessageCircle, Mail, MessageSquare, Globe, Search, Sparkles, Loader2, X } from "lucide-react";
import DOMPurify from "dompurify";
import RichText from "../../components/botnira/RichText";

const ICONS = { web: Globe, whatsapp: MessageCircle, email: Mail, sms: MessageSquare, voice: Phone };
const CHANNELS = ["web", "whatsapp", "email", "sms", "voice"];

const ChannelBadge = ({ ch }) => {
  const Icon = ICONS[ch] || Globe;
  return <span className="badge" data-testid={`badge-${ch}`}><Icon size={10} /> {ch}</span>;
};

// Strict allowlist for inbound HTML email rendering. Strips all script/style,
// event handlers, and dangerous URL schemes — DOMPurify is the source of truth.
function sanitizeEmailHtml(html) {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "link", "meta", "form", "input", "button"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur"],
    ADD_ATTR: ["target"],
  });
}

export default function Inbox() {
  const [convs, setConvs] = useState([]);
  const [active, setActive] = useState(null);
  const [detail, setDetail] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const [drafting, setDrafting] = useState(false);
  const scrollRef = useRef(null);

  const load = async () => {
    const q = statusFilter === "all" ? "" : `?status=${statusFilter}`;
    const { data } = await api.get(`/conversations${q}`);
    setConvs(data);
    if (data.length && !active) setActive(data[0].id);
  };

  const loadDetail = async (id) => {
    if (!id) return;
    const { data } = await api.get(`/conversations/${id}`);
    setDetail(data);
    setTimeout(() => scrollRef.current?.scrollTo({ top: 99999 }), 50);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter]);
  useEffect(() => { loadDetail(active); }, [active]);

  // Derived list — applies channel + free-text search filters client-side
  const visibleConvs = useMemo(() => {
    let v = convs;
    if (channelFilter !== "all") v = v.filter(c => c.channel === channelFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      v = v.filter(c =>
        (c.customer_name || "").toLowerCase().includes(q) ||
        (c.customer_contact || "").toLowerCase().includes(q) ||
        (c.last_message_preview || "").toLowerCase().includes(q)
      );
    }
    return v;
  }, [convs, channelFilter, search]);

  // Counts per channel — drives the filter pills
  const channelCounts = useMemo(() => {
    const out = { all: convs.length };
    for (const c of CHANNELS) out[c] = convs.filter(v => v.channel === c).length;
    return out;
  }, [convs]);

  const sendReply = async () => {
    if (!reply.trim() || !active) return;
    try {
      await api.post(`/conversations/${active}/reply`, { content: reply });
      setReply("");
      await loadDetail(active);
      await load();
      toast.success("Sent");
    } catch (e) {
      const msg = e?.response?.data?.detail || "Message saved, but delivery failed";
      toast.error(msg, { duration: 10000 });
      await loadDetail(active);
      await load();
    }
  };

  const generateDraft = async () => {
    if (!active) return;
    setDrafting(true);
    try {
      const { data } = await api.post("/email/draft-reply", { conversation_id: active });
      setReply(data.draft || "");
      toast.success("AI draft ready — review, edit, then hit Send.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't generate AI reply.", { duration: 8000 });
    } finally { setDrafting(false); }
  };

  const resolve = async () => {
    await api.post(`/conversations/${active}/resolve`);
    toast.success("Marked as resolved");
    await load();
    await loadDetail(active);
  };

  const isEmailConv = detail?.conversation?.channel === "email";

  return (
    <div className="h-screen grid grid-cols-[320px_360px_1fr] overflow-hidden" data-testid="inbox-page">
      {/* filters */}
      <div className="border-r-2 border-black bg-white h-full min-h-0 overflow-y-auto">
        <div className="h-16 border-b-2 border-black px-5 flex items-center">
          <h2 className="font-display font-black text-xl tracking-tight">Inbox</h2>
        </div>
        <div className="p-4 space-y-1">
          {["all", "open", "resolved"].map(f => (
            <button key={f} data-testid={`filter-${f}`} onClick={() => setStatusFilter(f)} className={`w-full text-left text-sm font-bold px-3 py-2 border-2 ${statusFilter === f ? "bg-black text-white border-black" : "border-transparent hover:border-black"}`}>
              {f.toUpperCase()}
            </button>
          ))}
          <div className="pt-4 text-[10px] font-bold tracking-[0.2em] uppercase text-neutral-500">Channels</div>
          <button
            data-testid="ch-filter-all"
            onClick={() => setChannelFilter("all")}
            className={`w-full flex items-center justify-between px-3 py-2 text-sm border-2 ${channelFilter === "all" ? "bg-[#002FA7] text-white border-black" : "border-transparent hover:border-black"}`}
          >
            <span className="font-bold">SHOW ALL</span>
            <span className="font-mono text-xs">{channelCounts.all}</span>
          </button>
          {CHANNELS.map(c => {
            const Icon = ICONS[c];
            const isActive = channelFilter === c;
            return (
              <button
                key={c}
                data-testid={`ch-filter-${c}`}
                onClick={() => setChannelFilter(c)}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm border-2 ${isActive ? "bg-black text-white border-black" : "border-transparent hover:border-black"}`}
              >
                <span className="flex items-center gap-2">
                  <Icon size={12} />
                  <span className="capitalize font-bold">{c}</span>
                </span>
                <span className="font-mono text-xs">{channelCounts[c] || 0}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* list */}
      <div className="border-r-2 border-black bg-white h-full min-h-0 overflow-y-auto flex flex-col">
        <div className="h-16 border-b-2 border-black px-5 flex items-center justify-between flex-shrink-0">
          <span className="text-xs font-bold tracking-widest uppercase">Threads ({visibleConvs.length})</span>
          {channelFilter !== "all" && (
            <span className="text-[10px] font-mono px-2 py-0.5 bg-yellow-200 border border-black">
              {channelFilter.toUpperCase()} only
            </span>
          )}
        </div>
        {/* search */}
        <div className="border-b-2 border-black px-3 py-2 flex items-center gap-2 bg-neutral-50 flex-shrink-0">
          <Search size={14} className="text-neutral-500" />
          <input
            data-testid="thread-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone or email"
            className="flex-1 bg-transparent text-sm focus:outline-none font-mono"
          />
          {search && (
            <button onClick={() => setSearch("")} data-testid="thread-search-clear" className="text-neutral-500 hover:text-black">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {visibleConvs.length === 0 && <div className="p-6 text-sm text-neutral-500">No conversations match.</div>}
          {visibleConvs.map(c => (
            <button key={c.id} data-testid={`thread-${c.id}`} onClick={() => setActive(c.id)} className={`w-full text-left px-5 py-4 border-b border-black/10 ${active === c.id ? "bg-neutral-100" : "hover:bg-neutral-50"}`}>
              <div className="flex items-center justify-between">
                <span className="font-bold truncate">{c.customer_name || "Guest"}</span>
                <ChannelBadge ch={c.channel} />
              </div>
              <div className="text-xs text-neutral-600 font-mono truncate mt-1">{c.last_message_preview || "…"}</div>
              <div className="text-[10px] text-neutral-500 mt-1">{c.status.toUpperCase()}</div>
            </button>
          ))}
        </div>
      </div>

      {/* detail */}
      <div className="flex flex-col h-full min-h-0">
        <div className="h-16 border-b-2 border-black px-6 flex items-center justify-between bg-white">
          <div>
            <div className="font-display font-black text-lg flex items-center gap-2">
              {detail?.conversation?.customer_name || "—"}
              {detail?.conversation?.channel === "voice" && (
                <span className="badge bg-[#002FA7] text-white border-black"><Phone size={10}/> VOICE CALL</span>
              )}
              {isEmailConv && (
                <span className="badge bg-[#FBBC04] text-black border-black"><Mail size={10}/> EMAIL</span>
              )}
            </div>
            <div className="text-xs font-mono text-neutral-600">{detail?.conversation?.customer_contact || ""}</div>
          </div>
          <div className="flex items-center gap-2">
            {detail?.call?.recording_url && (
              <a
                href={detail.call.recording_url}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="play-recording"
                className="text-sm font-bold border-2 border-black px-3 py-2 hover-lift bg-white flex items-center gap-2"
              >
                🎧 Play recording
              </a>
            )}
            {detail?.conversation && detail.conversation.status !== "resolved" && (
              <button data-testid="resolve-btn" onClick={resolve} className="text-sm font-bold border-2 border-black px-3 py-2 hover-lift bg-white flex items-center gap-2"><CheckCircle2 size={14}/> Mark resolved</button>
            )}
          </div>
        </div>
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4 bg-neutral-50" data-testid="thread-messages">
          {detail?.messages?.map(m => {
            const label = m.role === "bot" ? "BOTNIRA" : m.role === "agent" ? "AGENT" : "CUSTOMER";
            const hasHtml = m.role === "user" && m.body_html;
            return (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                <div className={`${hasHtml ? "max-w-3xl" : "max-w-lg"} border-2 border-black px-4 py-3 text-sm ${m.role === "bot" ? "bg-[#002FA7] text-white" : m.role === "agent" ? "bg-black text-white" : "bg-white"}`}>
                  <div className="text-[10px] font-mono opacity-70 mb-1 flex items-center justify-between gap-2">
                    <span>{label}</span>
                    {m.subject && <span className="truncate font-bold opacity-80">{m.subject}</span>}
                  </div>
                  {hasHtml ? (
                    <div
                      data-testid="email-html-body"
                      className="email-html-body prose prose-sm max-w-none"
                      // SAFETY: sanitizeEmailHtml passes through DOMPurify with a strict allowlist
                      // (no script/style/iframe, no event handlers). User-controlled markup only.
                      dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(m.body_html) }}
                    />
                  ) : (
                    <RichText text={m.content} />
                  )}
                </div>
              </div>
            );
          })}
          {!detail && <div className="text-sm text-neutral-500">Select a thread to view messages.</div>}
        </div>
        <div className="border-t-2 border-black p-4 bg-white space-y-2">
          {isEmailConv && (
            <div className="flex items-center justify-between">
              <button
                data-testid="generate-ai-reply-btn"
                onClick={generateDraft}
                disabled={drafting}
                className="text-xs font-bold border-2 border-black px-3 py-1.5 hover-lift bg-yellow-100 disabled:opacity-60 flex items-center gap-2"
              >
                {drafting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {drafting ? "Drafting…" : "Generate AI reply"}
              </button>
              <span className="text-[10px] font-mono text-neutral-500">
                Reply will be sent from your connected inbox
              </span>
            </div>
          )}
          <div className="flex gap-2 items-end">
            <textarea
              data-testid="reply-input"
              value={reply}
              onChange={e=>setReply(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey && !isEmailConv) { e.preventDefault(); sendReply(); }
              }}
              rows={isEmailConv ? 4 : 1}
              placeholder={isEmailConv ? "Write your reply, or click Generate AI reply…" : "Jump in as a human agent… (Shift+Enter for new line)"}
              className="flex-1 border-2 border-black px-3 py-2 text-sm resize-none max-h-48 focus:outline-none focus:ring-2 focus:ring-[#002FA7]"
            />
            <button data-testid="send-reply-btn" onClick={sendReply} className="bg-[#002FA7] text-white font-bold px-4 py-2 border-2 border-black shadow-brutal hover-lift flex items-center gap-2 self-stretch"><Send size={14} /> Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}
