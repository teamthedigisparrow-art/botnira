import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { Globe, MessageCircle, Mail, MessageSquare, Phone, PlayCircle } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

const META = {
  web: { icon: Globe, label: "Web Widget", note: "Embed on any website. Always live." },
  whatsapp: { icon: MessageCircle, label: "WhatsApp", note: "Twilio / Meta Business API." },
  email: { icon: Mail, label: "Email", note: "Auto-reply via SendGrid / Resend." },
  sms: { icon: MessageSquare, label: "SMS", note: "Twilio SMS." },
  voice: { icon: Phone, label: "Voice (Retell AI)", note: "AI voice agent for inbound / outbound calls." },
};

export default function Channels() {
  const [list, setList] = useState([]);
  const { vendor } = useAuth();
  const [simCh, setSimCh] = useState("whatsapp");
  const [simName, setSimName] = useState("Alex Customer");
  const [simMsg, setSimMsg] = useState("What are your hours?");
  const [simResp, setSimResp] = useState("");

  const load = () => api.get("/channels").then(r => setList(r.data));
  useEffect(() => { load(); }, []);

  const toggle = async (ch, newStatus) => {
    await api.put(`/channels/${ch}`, { status: newStatus });
    toast.success(`${ch} ${newStatus}`);
    load();
  };

  const simulate = async () => {
    const { data } = await api.post(`/simulate/${simCh}`, { customer_name: simName, message: simMsg });
    setSimResp(data.reply);
    toast.success("Inbound simulated — check inbox");
  };

  const embed = `<script src="${window.location.origin}/widget.js" data-botnira-vendor="${vendor?.id}"></script>`;

  return (
    <div className="p-8 space-y-8" data-testid="channels-page">
      <div>
        <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">Channels</div>
        <h1 className="font-display text-4xl font-black tracking-tighter">Plug in your front desk.</h1>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map(c => {
          const m = META[c.channel] || { icon: Globe, label: c.channel, note: "" };
          const connected = c.status === "connected";
          return (
            <div key={c.channel} className="border-2 border-black bg-white p-5" data-testid={`ch-card-${c.channel}`}>
              <div className="flex items-center justify-between">
                <m.icon size={22} />
                <span className={`badge ${connected ? "bg-[#002FA7] text-white border-black" : ""}`}>{c.status}</span>
              </div>
              <div className="font-display font-black text-xl mt-4">{m.label}</div>
              <div className="text-sm text-neutral-600 mt-1">{m.note}</div>
              <button data-testid={`ch-toggle-${c.channel}`} onClick={() => toggle(c.channel, connected ? "disconnected" : "connected")} className="mt-4 w-full text-sm font-bold border-2 border-black px-3 py-2 hover-lift">
                {connected ? "Disconnect" : "Mark as connected"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="border-2 border-black bg-white p-6">
        <div className="font-display font-black text-2xl">Embed the web widget</div>
        <p className="text-sm text-neutral-600 mt-1">Paste this snippet in your website to enable BotNira chat.</p>
        <pre className="mt-4 border-2 border-black bg-neutral-950 text-white p-4 font-mono text-xs overflow-x-auto" data-testid="embed-snippet">{embed}</pre>
      </div>

      <div className="border-2 border-black bg-neutral-50 p-6">
        <div className="font-display font-black text-2xl flex items-center gap-2"><PlayCircle size={20}/> Simulate an inbound message</div>
        <p className="text-sm text-neutral-600 mt-1">Test your bot like a real customer would message via WhatsApp, email, SMS, or a phone call transcript.</p>
        <div className="grid md:grid-cols-4 gap-3 mt-4">
          <select data-testid="sim-channel" value={simCh} onChange={e => setSimCh(e.target.value)} className="border-2 border-black px-3 py-2 font-bold">
            {["whatsapp","email","sms","voice"].map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
          </select>
          <input data-testid="sim-name" value={simName} onChange={e=>setSimName(e.target.value)} placeholder="Customer name" className="border-2 border-black px-3 py-2" />
          <input data-testid="sim-msg" value={simMsg} onChange={e=>setSimMsg(e.target.value)} placeholder="Message" className="border-2 border-black px-3 py-2 md:col-span-2" />
        </div>
        <button data-testid="sim-run" onClick={simulate} className="mt-4 bg-[#002FA7] text-white font-bold px-5 py-2 border-2 border-black shadow-brutal hover-lift">Send test message</button>
        {simResp && <div className="mt-4 border-2 border-black bg-white p-3 text-sm" data-testid="sim-response"><span className="text-[10px] font-mono block opacity-60">BOT REPLY</span>{simResp}</div>}
      </div>
    </div>
  );
}
