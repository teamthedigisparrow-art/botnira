import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { Send, CheckCircle2, Phone, MessageCircle, Mail, MessageSquare, Globe, Search, Sparkles, Loader2, X, Dot, ChevronLeft } from "lucide-react";
import DOMPurify from "dompurify";
import RichText from "../../components/botnira/RichText";
import CallWidget from "../../components/botnira/CallWidget";

// Derive a callable E.164 number from a conversation. Only voice / sms /
// whatsapp threads carry a phone number in customer_contact.
function toCallable(conv) {
  if (!conv || !["voice", "sms", "whatsapp"].includes(conv.channel)) return "";
  const raw = (conv.customer_contact || "").trim();
  if (!raw) return "";
  let digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  const e164 = raw.trim().startsWith("+") ? "+" + digits : "+" + digits;
  return /^\+[1-9]\d{7,15}$/.test(e164) ? e164 : "";
}

const ICONS = { web: Globe, whatsapp: MessageCircle, email: Mail, sms: MessageSquare, voice: Phone };
const CHANNELS = ["web", "whatsapp", "email", "sms", "voice"];
const PAGE_SIZE = 30;

// Smart relative timestamp: "2:43pm" today, "Yesterday 11am", "Mar 14 1:23pm"
// for older. Keeps the thread row compact while still being unambiguous.
function formatRelative(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  const sameYesterday = d.toDateString() === y.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase().replace(" ", "");
  if (sameDay) return time;
  if (sameYesterday) return `Yesterday ${time}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  const datePart = d.toLocaleDateString([], sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
  return `${datePart} ${time}`;
}

function fullDateTitle(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

const ChannelBadge = ({ ch }) => {
  const Icon = ICONS[ch] || Globe;
  return <span className="badge" data-testid={`badge-${ch}`}><Icon size={10} /> {ch}</span>;
};

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
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [active, setActive] = useState(null);
  const [detail, setDetail] = useState(null);
  const [callTarget, setCallTarget] = useState(null);
  const [waStatus, setWaStatus] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);

  const [statusFilter, setStatusFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [reply, setReply] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false); // mobile: show detail pane
  const scrollRef = useRef(null);

  // Debounce the search input so we don't hit the server on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 280);
    return () => clearTimeout(id);
  }, [search]);

  // WhatsApp calling: learn outbound eligibility + listen for inbound calls.
  useEffect(() => {
    let ws; let alive = true;
    (async () => {
      try { const { data } = await api.get("/whatsapp/calling/status"); if (alive) setWaStatus(data); } catch (_) {}
      try {
        const token = localStorage.getItem("botnira_token");
        const base = (process.env.REACT_APP_BACKEND_URL || "").replace(/^http/, "ws");
        ws = new WebSocket(`${base}/api/ws/wa-call?token=${encodeURIComponent(token || "")}`);
        ws.onmessage = (evt) => {
          try { const m = JSON.parse(evt.data); if (m.type === "wa_call_incoming") setIncomingCall(m); } catch (_) {}
        };
      } catch (_) {}
    })();
    return () => { alive = false; try { ws?.close(); } catch (_) {} };
  }, []);

  const buildQuery = (offset) => {
    const p = new URLSearchParams();
    if (statusFilter !== "all") p.set("status", statusFilter);
    if (channelFilter !== "all") p.set("channel", channelFilter);
    if (debouncedSearch) p.set("q", debouncedSearch);
    p.set("limit", String(PAGE_SIZE));
    p.set("offset", String(offset));
    return p.toString();
  };

  // Initial / filter-change load: reset the list
  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/conversations?${buildQuery(0)}`);
      const items = data.items || [];
      setConvs(items);
      setTotal(data.total || 0);
      setHasMore(!!data.has_more);
      setUnreadTotal(data.unread_total || 0);
      if (items.length && !active) setActive(items[0].id);
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const { data } = await api.get(`/conversations?${buildQuery(convs.length)}`);
      const newItems = data.items || [];
      setConvs(prev => [...prev, ...newItems]);
      setTotal(data.total || 0);
      setHasMore(!!data.has_more);
    } catch (e) {
      console.error(e);
    } finally { setLoadingMore(false); }
  };

  const loadDetail = async (id) => {
    if (!id) return;
    const { data } = await api.get(`/conversations/${id}`);
    setDetail(data);
    setTimeout(() => scrollRef.current?.scrollTo({ top: 99999 }), 50);
    // Flip unread → read ONLY if the thread was actually unread — saves a DB write per open.
    if (data?.conversation?.unread) {
      try {
        await api.post(`/conversations/${id}/read`);
        setConvs(prev => prev.map(c => c.id === id ? { ...c, unread: false } : c));
        setUnreadTotal(u => Math.max(0, u - 1));
      } catch (_) { /* best-effort */ }
    }
  };

  // Reload whenever a filter or the debounced search changes
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, channelFilter, debouncedSearch]);

  useEffect(() => { loadDetail(active); /* eslint-disable-line */ }, [active]);

  // Counts per channel (from a lightweight parallel call so the filter pills
  // always show the real totals, not just the currently-filtered window).
  const [channelCounts, setChannelCounts] = useState({ all: 0, web: 0, whatsapp: 0, email: 0, sms: 0, voice: 0 });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: all } = await api.get(`/conversations?limit=1&offset=0${statusFilter !== "all" ? `&status=${statusFilter}` : ""}`);
        const counts = { all: all.total || 0 };
        // Fire channel counts in parallel — one tiny count-only query each.
        const results = await Promise.all(CHANNELS.map(c =>
          api.get(`/conversations?limit=1&offset=0&channel=${c}${statusFilter !== "all" ? `&status=${statusFilter}` : ""}`)
            .then(r => r.data.total || 0)
            .catch(() => 0)
        ));
        CHANNELS.forEach((c, i) => { counts[c] = results[i]; });
        if (!cancelled) setChannelCounts(counts);
      } catch (e) { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [statusFilter, debouncedSearch]);

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
    <div className="h-[calc(100dvh-3.5rem)] md:h-screen flex flex-col lg:grid lg:grid-cols-[300px_340px_1fr] overflow-hidden" data-testid="inbox-page">
      {/* filters */}
      <div className="border-r-2 border-black bg-white h-full min-h-0 overflow-y-auto hidden lg:block">
        <div className="h-16 border-b-2 border-black px-5 flex items-center justify-between">
          <h2 className="font-display font-black text-xl tracking-tight">Inbox</h2>
          {unreadTotal > 0 && (
            <span data-testid="inbox-unread-total" className="text-[10px] font-bold tracking-wider bg-[#002FA7] text-white px-2 py-0.5">
              {unreadTotal} NEW
            </span>
          )}
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
      <div className={`${mobileDetail ? "hidden" : "flex"} lg:flex border-r-2 border-black bg-white h-full min-h-0 overflow-y-auto flex-col`}>
        <div className="h-16 border-b-2 border-black px-5 flex items-center justify-between flex-shrink-0">
          <span className="text-xs font-bold tracking-widest uppercase">
            Threads <span data-testid="thread-count">({convs.length}/{total})</span>
          </span>
          {channelFilter !== "all" && (
            <span className="text-[10px] font-mono px-2 py-0.5 bg-yellow-200 border border-black">
              {channelFilter.toUpperCase()} only
            </span>
          )}
        </div>
        {/* Mobile-only filters (the dedicated filter pane is hidden < lg) */}
        <div className="lg:hidden border-b-2 border-black px-3 py-2 space-y-2 bg-neutral-50 flex-shrink-0" data-testid="inbox-mobile-filters">
          <div className="flex gap-1">
            {["all", "open", "resolved"].map(f => (
              <button key={f} data-testid={`m-filter-${f}`} onClick={() => setStatusFilter(f)} className={`flex-1 text-xs font-bold px-2 py-1.5 border-2 ${statusFilter === f ? "bg-black text-white border-black" : "border-black/20 hover:border-black"}`}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>
          <select
            data-testid="m-channel-filter"
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="w-full border-2 border-black px-3 py-2 text-sm font-bold bg-white"
          >
            <option value="all">All channels ({channelCounts.all})</option>
            {CHANNELS.map(c => <option key={c} value={c}>{c.toUpperCase()} ({channelCounts[c] || 0})</option>)}
          </select>
        </div>
        {/* search */}
        <div className="border-b-2 border-black px-3 py-2 flex items-center gap-2 bg-neutral-50 flex-shrink-0">
          <Search size={14} className="text-neutral-500" />
          <input
            data-testid="thread-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all threads by name / phone / email"
            className="flex-1 bg-transparent text-sm focus:outline-none font-mono"
          />
          {search && (
            <button onClick={() => setSearch("")} data-testid="thread-search-clear" className="text-neutral-500 hover:text-black">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading && (
            <div className="p-6 text-sm font-mono text-neutral-500 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          )}
          {!loading && convs.length === 0 && (
            <div className="p-6 text-sm text-neutral-500" data-testid="threads-empty">
              {debouncedSearch ? `No threads match "${debouncedSearch}".` : "No conversations yet."}
            </div>
          )}
          {convs.map(c => {
            const ts = c.updated_at || c.created_at;
            const unread = !!c.unread;
            return (
              <button
                key={c.id}
                data-testid={`thread-${c.id}`}
                data-unread={unread ? "1" : "0"}
                onClick={() => { setActive(c.id); setMobileDetail(true); }}
                className={`w-full text-left px-5 py-4 border-b border-black/10 relative ${active === c.id ? "bg-neutral-100" : "hover:bg-neutral-50"} ${unread ? "bg-blue-50/40" : ""}`}
              >
                {unread && (
                  <span
                    data-testid={`thread-unread-dot-${c.id}`}
                    className="absolute top-4 left-1 w-2 h-2 rounded-full bg-[#002FA7]"
                    aria-label="Unread"
                  />
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className={`truncate ${unread ? "font-black" : "font-bold"}`}>{c.customer_name || "Guest"}</span>
                  <ChannelBadge ch={c.channel} />
                </div>
                <div className={`text-xs font-mono truncate mt-1 ${unread ? "text-neutral-800 font-bold" : "text-neutral-600"}`}>
                  {c.last_message_preview || "…"}
                </div>
                <div className="flex items-center justify-between mt-1 gap-2">
                  <span className="text-[10px] text-neutral-500">{c.status.toUpperCase()}{unread && <span className="ml-1 text-[#002FA7]">• NEW</span>}</span>
                  {ts && (
                    <span
                      data-testid={`thread-time-${c.id}`}
                      className="text-[10px] font-mono text-neutral-500 whitespace-nowrap"
                      title={fullDateTitle(ts)}
                    >
                      {formatRelative(ts)}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
          {/* Load more — hidden while searching (search lifts the limit server-side). */}
          {!loading && hasMore && !debouncedSearch && (
            <button
              data-testid="load-more-btn"
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full text-center text-sm font-bold py-4 border-t-2 border-black bg-yellow-50 hover:bg-yellow-100 disabled:opacity-60"
            >
              {loadingMore ? (
                <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</span>
              ) : (
                `Load ${Math.min(PAGE_SIZE, total - convs.length)} more threads (${total - convs.length} remaining)`
              )}
            </button>
          )}
          {!loading && !hasMore && convs.length > 0 && convs.length >= PAGE_SIZE && !debouncedSearch && (
            <div className="w-full text-center text-[11px] font-mono text-neutral-400 py-3 border-t border-black/10" data-testid="threads-end">
              · end of list ·
            </div>
          )}
        </div>
      </div>

      {/* detail */}
      <div className={`${mobileDetail ? "flex" : "hidden"} lg:flex flex-col h-full min-h-0`}>
        <div className="h-16 border-b-2 border-black px-4 sm:px-6 flex items-center justify-between bg-white gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setMobileDetail(false)}
              className="lg:hidden p-1.5 border-2 border-black shrink-0"
              data-testid="inbox-mobile-back"
              aria-label="Back to list"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="min-w-0">
              <div className="font-display font-black text-base sm:text-lg flex items-center gap-2 truncate">
                <span className="truncate">{detail?.conversation?.customer_name || "—"}</span>
                {detail?.conversation?.channel === "voice" && (
                  <span className="badge bg-[#002FA7] text-white border-black shrink-0"><Phone size={10}/> VOICE CALL</span>
                )}
                {isEmailConv && (
                  <span className="badge bg-[#FBBC04] text-black border-black shrink-0"><Mail size={10}/> EMAIL</span>
                )}
              </div>
              <div className="text-xs font-mono text-neutral-600 truncate">{detail?.conversation?.customer_contact || ""}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {toCallable(detail?.conversation) && (
              <button
                data-testid="inbox-callback-btn"
                onClick={() => setCallTarget({
                  number: toCallable(detail.conversation),
                  name: detail.conversation.customer_name,
                  conversationId: active,
                  provider: detail.conversation.channel === "whatsapp" && waStatus?.outbound_supported ? "whatsapp" : "twilio",
                })}
                className="text-sm font-bold border-2 border-black px-3 py-2 hover-lift bg-green-500 text-white flex items-center gap-2"
                title="Call this customer back from your browser"
              >
                <Phone size={14} /> Call back
              </button>
            )}
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
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 bg-neutral-50" data-testid="thread-messages">
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

      {callTarget && <CallWidget target={callTarget} onClose={() => setCallTarget(null)} />}
      {incomingCall && (
        <CallWidget
          target={{ name: incomingCall.name, number: incomingCall.from, provider: "whatsapp", conversationId: incomingCall.conversation_id }}
          incoming={incomingCall}
          onClose={() => setIncomingCall(null)}
        />
      )}
    </div>
  );
}
