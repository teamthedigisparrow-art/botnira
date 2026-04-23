import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { Send, CheckCircle2, Phone, MessageCircle, Mail, MessageSquare, Globe } from "lucide-react";
import RichText from "../../components/botnira/RichText";

const ICONS = { web: Globe, whatsapp: MessageCircle, email: Mail, sms: MessageSquare, voice: Phone };

const ChannelBadge = ({ ch }) => {
  const Icon = ICONS[ch] || Globe;
  return <span className="badge" data-testid={`badge-${ch}`}><Icon size={10} /> {ch}</span>;
};

export default function Inbox() {
  const [convs, setConvs] = useState([]);
  const [active, setActive] = useState(null);
  const [detail, setDetail] = useState(null);
  const [filter, setFilter] = useState("all");
  const [reply, setReply] = useState("");
  const scrollRef = useRef(null);

  const load = async () => {
    const q = filter === "all" ? "" : `?status=${filter}`;
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

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);
  useEffect(() => { loadDetail(active); }, [active]);

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
      // still refresh — the message is saved in our DB
      await loadDetail(active);
      await load();
    }
  };

  const resolve = async () => {
    await api.post(`/conversations/${active}/resolve`);
    toast.success("Marked as resolved");
    await load();
    await loadDetail(active);
  };

  return (
    <div className="h-screen grid grid-cols-[320px_360px_1fr] overflow-hidden" data-testid="inbox-page">
      {/* filters */}
      <div className="border-r-2 border-black bg-white h-full min-h-0 overflow-y-auto">
        <div className="h-16 border-b-2 border-black px-5 flex items-center">
          <h2 className="font-display font-black text-xl tracking-tight">Inbox</h2>
        </div>
        <div className="p-4 space-y-1">
          {["all", "open", "resolved"].map(f => (
            <button key={f} data-testid={`filter-${f}`} onClick={() => setFilter(f)} className={`w-full text-left text-sm font-bold px-3 py-2 border-2 ${filter === f ? "bg-black text-white border-black" : "border-transparent hover:border-black"}`}>
              {f.toUpperCase()}
            </button>
          ))}
          <div className="pt-4 text-[10px] font-bold tracking-[0.2em] uppercase text-neutral-500">Channels</div>
          {["web","whatsapp","email","sms","voice"].map(c => (
            <div key={c} className="flex items-center justify-between px-3 py-2 text-sm">
              <ChannelBadge ch={c} />
              <span className="font-mono text-xs">{convs.filter(v=>v.channel===c).length}</span>
            </div>
          ))}
        </div>
      </div>
      {/* list */}
      <div className="border-r-2 border-black bg-white h-full min-h-0 overflow-y-auto">
        <div className="h-16 border-b-2 border-black px-5 flex items-center justify-between">
          <span className="text-xs font-bold tracking-widest uppercase">Threads ({convs.length})</span>
        </div>
        {convs.length === 0 && <div className="p-6 text-sm text-neutral-500">No conversations yet.</div>}
        {convs.map(c => (
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
      {/* detail */}
      <div className="flex flex-col h-full min-h-0">
        <div className="h-16 border-b-2 border-black px-6 flex items-center justify-between bg-white">
          <div>
            <div className="font-display font-black text-lg flex items-center gap-2">
              {detail?.conversation?.customer_name || "—"}
              {detail?.conversation?.channel === "voice" && (
                <span className="badge bg-[#002FA7] text-white border-black"><Phone size={10}/> VOICE CALL</span>
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
            return (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-lg border-2 border-black px-4 py-3 text-sm ${m.role === "bot" ? "bg-[#002FA7] text-white" : m.role === "agent" ? "bg-black text-white" : "bg-white"}`}>
                  <div className="text-[10px] font-mono opacity-70 mb-1">{label}</div>
                  <RichText text={m.content} />
                </div>
              </div>
            );
          })}
          {!detail && <div className="text-sm text-neutral-500">Select a thread to view messages.</div>}
        </div>
        <div className="border-t-2 border-black p-4 bg-white flex gap-2 items-end">
          <textarea
            data-testid="reply-input"
            value={reply}
            onChange={e=>setReply(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); }
            }}
            rows={1}
            placeholder="Jump in as a human agent… (Shift+Enter for new line)"
            className="flex-1 border-2 border-black px-3 py-2 text-sm resize-none max-h-32 focus:outline-none focus:ring-2 focus:ring-[#002FA7]"
          />
          <button data-testid="send-reply-btn" onClick={sendReply} className="bg-[#002FA7] text-white font-bold px-4 py-2 border-2 border-black shadow-brutal hover-lift flex items-center gap-2"><Send size={14} /> Send</button>
        </div>
      </div>
    </div>
  );
}
