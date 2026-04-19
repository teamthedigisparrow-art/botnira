import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { Globe, MessageCircle, Mail, MessageSquare, Phone, PlayCircle, Copy, ExternalLink, Check } from "lucide-react";
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
  const [copied, setCopied] = useState(false);

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

  const widgetOrigin = process.env.REACT_APP_BACKEND_URL || window.location.origin;
  const embed = `<script src="${widgetOrigin}/widget.js" data-botnira-vendor="${vendor?.id || ""}" defer></script>`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(embed);
      setCopied(true);
      toast.success("Snippet copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed — select and copy manually");
    }
  };

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

      {/* Web widget installer */}
      <div className="border-2 border-black bg-white p-6" data-testid="web-install">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="font-display font-black text-2xl">Install the web widget</div>
            <p className="text-sm text-neutral-600 mt-1 max-w-2xl">
              Paste this snippet just before <code className="font-mono text-xs bg-neutral-100 px-1 border border-black/20">&lt;/body&gt;</code> on your website (HTML, WordPress, PHP, Shopify, anything).
              It loads only YOUR trained BotNira — all conversations are scoped to your vendor ID.
            </p>
          </div>
          <a
            href={`${widgetOrigin}/widget.js`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="widget-js-link"
            className="text-sm font-bold border-2 border-black px-3 py-2 bg-white hover-lift inline-flex items-center gap-2"
          >
            View widget.js <ExternalLink size={14}/>
          </a>
        </div>

        <div className="mt-4 relative">
          <pre
            className="border-2 border-black bg-neutral-950 text-white p-4 font-mono text-xs overflow-x-auto whitespace-pre-wrap break-all"
            data-testid="embed-snippet"
          >{embed}</pre>
          <button
            onClick={copy}
            data-testid="copy-embed-btn"
            className="absolute top-2 right-2 bg-white text-black font-bold text-xs px-3 py-1 border-2 border-white shadow-brutal flex items-center gap-1"
          >
            {copied ? <><Check size={12}/> Copied</> : <><Copy size={12}/> Copy</>}
          </button>
        </div>

        <div className="mt-5 grid md:grid-cols-3 gap-3 text-xs font-mono">
          <div className="border-2 border-black p-3">
            <div className="font-bold text-[10px] tracking-[0.2em] uppercase text-[#002FA7] mb-1">Your vendor ID</div>
            <div className="break-all">{vendor?.id || "—"}</div>
          </div>
          <div className="border-2 border-black p-3">
            <div className="font-bold text-[10px] tracking-[0.2em] uppercase text-[#002FA7] mb-1">Loads from</div>
            <div className="break-all">{widgetOrigin}/widget.js</div>
          </div>
          <div className="border-2 border-black p-3">
            <div className="font-bold text-[10px] tracking-[0.2em] uppercase text-[#002FA7] mb-1">API endpoint</div>
            <div className="break-all">{widgetOrigin}/api/chat/message</div>
          </div>
        </div>

        <div className="mt-5 border-t-2 border-black pt-4 text-sm space-y-2" data-testid="install-steps">
          <div className="font-display font-bold">Install steps:</div>
          <ol className="list-decimal pl-6 space-y-1 text-sm">
            <li>Copy the snippet above.</li>
            <li>
              Paste it just before the closing <code className="font-mono">&lt;/body&gt;</code> tag of your site's template
              (WordPress: <em>Appearance → Theme File Editor → footer.php</em>; Shopify: <em>Online Store → Themes → Edit code → theme.liquid</em>).
            </li>
            <li>Save / deploy. Refresh your site — a blue chat bubble appears bottom-right. That's BotNira, trained on YOUR info.</li>
            <li>Every conversation shows up live in your <a className="underline font-bold" href="/app/inbox">Inbox</a>, and confirmed appointments appear in <a className="underline font-bold" href="/app/appointments">Appointments</a>.</li>
          </ol>
        </div>
      </div>

      {/* Simulator */}
      <div className="border-2 border-black bg-neutral-50 p-6">
        <div className="font-display font-black text-2xl flex items-center gap-2"><PlayCircle size={20}/> Simulate an inbound message</div>
        <p className="text-sm text-neutral-600 mt-1">Test BotNira like a real customer would message via WhatsApp, email, SMS, or a phone call transcript.</p>
        <div className="grid md:grid-cols-4 gap-3 mt-4">
          <select data-testid="sim-channel" value={simCh} onChange={e => setSimCh(e.target.value)} className="border-2 border-black px-3 py-2 font-bold">
            {["whatsapp","email","sms","voice"].map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
          </select>
          <input data-testid="sim-name" value={simName} onChange={e=>setSimName(e.target.value)} placeholder="Customer name" className="border-2 border-black px-3 py-2" />
          <input data-testid="sim-msg" value={simMsg} onChange={e=>setSimMsg(e.target.value)} placeholder="Message" className="border-2 border-black px-3 py-2 md:col-span-2" />
        </div>
        <button data-testid="sim-run" onClick={simulate} className="mt-4 bg-[#002FA7] text-white font-bold px-5 py-2 border-2 border-black shadow-brutal hover-lift">Send test message</button>
        {simResp && <div className="mt-4 border-2 border-black bg-white p-3 text-sm" data-testid="sim-response"><span className="text-[10px] font-mono block opacity-60">BOTNIRA REPLY</span>{simResp}</div>}
      </div>
    </div>
  );
}
