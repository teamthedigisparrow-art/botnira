import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { Send, Plus, Trash2 } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import RichText from "../../components/botnira/RichText";

export default function BotStudio() {
  const { vendor } = useAuth();
  const [bot, setBot] = useState(null);
  const [saving, setSaving] = useState(false);
  const [chat, setChat] = useState([]);
  const [msg, setMsg] = useState("");
  const [convId, setConvId] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => { api.get("/bot").then(r => setBot(r.data)); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/bot", {
        bot_name: bot.bot_name, greeting: bot.greeting, tone: bot.tone,
        business_description: bot.business_description, faqs: bot.faqs,
        fallback_message: bot.fallback_message, is_active: bot.is_active,
      });
      setBot(data);
      toast.success("Bot updated");
    } catch { toast.error("Save failed"); }
    finally { setSaving(false); }
  };

  const addFaq = () => setBot({ ...bot, faqs: [...(bot.faqs || []), { q: "", a: "" }] });
  const updFaq = (i, k, v) => { const faqs = [...bot.faqs]; faqs[i] = { ...faqs[i], [k]: v }; setBot({ ...bot, faqs }); };
  const rmFaq = (i) => setBot({ ...bot, faqs: bot.faqs.filter((_, idx) => idx !== i) });

  const send = async () => {
    if (!msg.trim()) return;
    setSending(true);
    const text = msg;
    setChat(p => [...p, { role: "user", content: text }]);
    setMsg("");
    try {
      const { data } = await api.post("/chat/message", {
        vendor_id: vendor.id, conversation_id: convId, message: text, channel: "web"
      });
      setConvId(data.conversation_id);
      setChat(p => [...p, { role: "bot", content: data.reply }]);
    } catch { toast.error("Chat error"); }
    finally { setSending(false); }
  };

  if (!bot) return <div className="p-10 font-mono">Loading bot…</div>;

  return (
    <div className="p-8 grid lg:grid-cols-[1fr_420px] gap-6" data-testid="bot-studio">
      <div className="space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">Bot Studio</div>
            <h1 className="font-display text-4xl font-black tracking-tighter">Train BotNira</h1>
            <p className="text-sm text-neutral-600 mt-1">Only this information will be used to answer customers.</p>
          </div>
          <button data-testid="save-bot-btn" onClick={save} disabled={saving} className="bg-[#002FA7] text-white font-bold px-5 py-2 border-2 border-black shadow-brutal hover-lift disabled:opacity-60">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>

        <div className="border-2 border-black bg-white p-6 space-y-4">
          <Field label="Bot name" tid="bot-name">
            <input data-testid="bot-name-input" className="w-full border-2 border-black px-3 py-2" value={bot.bot_name || ""} onChange={e => setBot({ ...bot, bot_name: e.target.value })} />
          </Field>
          <Field label="Greeting" tid="bot-greeting">
            <input data-testid="bot-greeting-input" className="w-full border-2 border-black px-3 py-2" value={bot.greeting || ""} onChange={e => setBot({ ...bot, greeting: e.target.value })} />
          </Field>
          <Field label="Tone" tid="bot-tone">
            <input data-testid="bot-tone-input" className="w-full border-2 border-black px-3 py-2" value={bot.tone || ""} onChange={e => setBot({ ...bot, tone: e.target.value })} placeholder="friendly, concise, warm…" />
          </Field>
          <Field label="Business description (the bot's only source of truth)" tid="bot-desc">
            <textarea data-testid="bot-desc-input" rows={8} className="w-full border-2 border-black px-3 py-2 font-mono text-sm" value={bot.business_description || ""} onChange={e => setBot({ ...bot, business_description: e.target.value })} placeholder="Hours, services, pricing, policies, address, phone, booking rules…" />
          </Field>
          <Field label="Fallback message (shown when answer isn't in your info)" tid="bot-fallback">
            <input data-testid="bot-fallback-input" className="w-full border-2 border-black px-3 py-2" value={bot.fallback_message || ""} onChange={e => setBot({ ...bot, fallback_message: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input data-testid="bot-active-toggle" type="checkbox" checked={!!bot.is_active} onChange={e => setBot({ ...bot, is_active: e.target.checked })} /> Bot is live
          </label>
        </div>

        <div className="border-2 border-black bg-white p-6">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold tracking-[0.2em] uppercase">FAQs</div>
            <button data-testid="add-faq-btn" onClick={addFaq} className="text-sm font-bold border-2 border-black px-3 py-1 flex items-center gap-1 hover-lift"><Plus size={14}/> Add</button>
          </div>
          <div className="mt-4 space-y-4">
            {(bot.faqs || []).map((f, i) => (
              <div key={i} className="border-2 border-black p-3 space-y-2" data-testid={`faq-item-${i}`}>
                <input data-testid={`faq-q-${i}`} placeholder="Question" className="w-full border-2 border-black px-2 py-1 font-bold" value={f.q} onChange={e => updFaq(i, "q", e.target.value)} />
                <textarea data-testid={`faq-a-${i}`} placeholder="Answer" rows={2} className="w-full border-2 border-black px-2 py-1 text-sm" value={f.a} onChange={e => updFaq(i, "a", e.target.value)} />
                <button data-testid={`faq-rm-${i}`} onClick={() => rmFaq(i)} className="text-xs font-bold text-red-600 inline-flex items-center gap-1"><Trash2 size={12}/> Remove</button>
              </div>
            ))}
            {(!bot.faqs || bot.faqs.length === 0) && <div className="text-sm text-neutral-500">No FAQs yet.</div>}
          </div>
        </div>
      </div>

      <div className="lg:sticky lg:top-6 h-fit">
        <div className="border-2 border-black bg-white shadow-brutal-lg" data-testid="live-preview">
          <div className="border-b-2 border-black px-4 py-2 flex items-center justify-between">
            <div className="font-mono text-xs font-bold">LIVE PREVIEW</div>
            <div className="w-2 h-2 rounded-full bg-green-500" />
          </div>
          <div className="p-4 h-96 overflow-y-auto space-y-3 bg-neutral-50" data-testid="preview-messages">
            <div className="border-2 border-black bg-white px-3 py-2 text-sm"><span className="text-[10px] font-mono block opacity-60">BOTNIRA</span><RichText text={bot.greeting} /></div>
            {chat.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-xs border-2 border-black px-3 py-2 text-sm ${m.role === "bot" ? "bg-[#002FA7] text-white" : "bg-black text-white"}`}>
                  <span className="text-[10px] font-mono block opacity-60">{m.role === "bot" ? "BOTNIRA" : "YOU"}</span>
                  <RichText text={m.content} />
                </div>
              </div>
            ))}
            {sending && <div className="text-xs font-mono text-neutral-500">BotNira is typing…</div>}
          </div>
          <div className="border-t-2 border-black p-3 flex gap-2 items-end">
            <textarea
              data-testid="preview-input"
              value={msg}
              onChange={e => setMsg(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              rows={1}
              placeholder="Ask BotNira… (Shift+Enter for new line)"
              className="flex-1 border-2 border-black px-3 py-2 text-sm resize-none max-h-32 focus:outline-none focus:ring-2 focus:ring-[#002FA7]"
            />
            <button data-testid="preview-send-btn" onClick={send} disabled={sending} className="bg-[#002FA7] text-white font-bold px-3 py-2 border-2 border-black shadow-brutal hover-lift disabled:opacity-60"><Send size={14}/></button>
          </div>
        </div>
      </div>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div>
    <div className="text-xs font-bold tracking-[0.2em] uppercase mb-1">{label}</div>
    {children}
  </div>
);
