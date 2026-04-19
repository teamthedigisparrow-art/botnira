import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import {
  Globe, MessageCircle, Mail, MessageSquare, Phone, PlayCircle,
  Copy, ExternalLink, Check, PhoneCall, PowerOff, Sparkles, Info
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

const META = {
  web: { icon: Globe, label: "Web Widget", note: "Embed on any website. Always live." },
  whatsapp: { icon: MessageCircle, label: "WhatsApp", note: "Coming soon — vendor-managed." },
  email: { icon: Mail, label: "Email", note: "Coming soon — vendor-managed." },
  sms: { icon: MessageSquare, label: "SMS", note: "Coming soon — vendor-managed." },
  voice: { icon: Phone, label: "Voice", note: "AI phone receptionist, fully managed." },
};

const AREA_CODES = [
  { code: 415, label: "415 — San Francisco" },
  { code: 212, label: "212 — New York" },
  { code: 305, label: "305 — Miami" },
  { code: 312, label: "312 — Chicago" },
  { code: 213, label: "213 — Los Angeles" },
  { code: 206, label: "206 — Seattle" },
  { code: 617, label: "617 — Boston" },
  { code: 404, label: "404 — Atlanta" },
  { code: 469, label: "469 — Dallas" },
  { code: 702, label: "702 — Las Vegas" },
];

const PLANS = [
  { id: "starter", label: "Starter", price: "$49/mo", mins: "100 min incl.", over: "$0.30/min overage" },
  { id: "growth", label: "Growth", price: "$149/mo", mins: "500 min incl.", over: "$0.25/min overage" },
  { id: "pro", label: "Pro", price: "$399/mo", mins: "1500 min incl.", over: "$0.20/min overage" },
];

export default function Channels() {
  const [list, setList] = useState([]);
  const { vendor } = useAuth();
  const [simCh, setSimCh] = useState("whatsapp");
  const [simName, setSimName] = useState("Alex Customer");
  const [simMsg, setSimMsg] = useState("What are your hours?");
  const [simResp, setSimResp] = useState("");
  const [copied, setCopied] = useState(false);

  // Voice state
  const [voice, setVoice] = useState(null);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [areaCode, setAreaCode] = useState(415);
  const [plan, setPlan] = useState("starter");
  const [testNumber, setTestNumber] = useState("");
  const [activating, setActivating] = useState(false);

  const loadChannels = () => api.get("/channels").then(r => setList(r.data));
  const loadVoice = async () => {
    setVoiceLoading(true);
    try {
      const { data } = await api.get("/voice/status");
      setVoice(data);
    } catch (e) { /* ignore */ }
    finally { setVoiceLoading(false); }
  };

  useEffect(() => { loadChannels(); loadVoice(); }, []);

  const toggle = async (ch, newStatus) => {
    if (ch === "voice") {
      toast.info("Use the Activate Voice panel below to manage voice.");
      return;
    }
    await api.put(`/channels/${ch}`, { status: newStatus });
    toast.success(`${ch} ${newStatus}`);
    loadChannels();
  };

  const simulate = async () => {
    const { data } = await api.post(`/simulate/${simCh}`, { customer_name: simName, message: simMsg });
    setSimResp(data.reply);
    toast.success("Inbound simulated — check inbox");
  };

  const activateVoice = async () => {
    setActivating(true);
    try {
      const { data } = await api.post("/voice/activate", { area_code: areaCode, plan });
      toast.success(`Voice activated! Your number: ${data.connection.phone_number_pretty || data.connection.phone_number}`);
      await loadVoice();
      await loadChannels();
    } catch (e) {
      const msg = e?.response?.data?.detail || "Activation failed";
      toast.error(msg, { duration: 10000 });
    } finally {
      setActivating(false);
    }
  };

  const deactivateVoice = async () => {
    if (!window.confirm("Deactivate voice? Your phone number will be released and the agent deleted.")) return;
    setActivating(true);
    try {
      await api.post("/voice/deactivate");
      toast.success("Voice deactivated");
      await loadVoice();
      await loadChannels();
    } catch {
      toast.error("Deactivation failed");
    } finally {
      setActivating(false);
    }
  };

  const runTestCall = async () => {
    if (!testNumber.startsWith("+")) {
      toast.error("Enter your number in E.164 format, e.g. +15551234567");
      return;
    }
    try {
      const { data } = await api.post("/voice/test-call", { to_number: testNumber });
      toast.success(`Calling you now — call id ${data.call_id.slice(0, 10)}…`, { duration: 8000 });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Test call failed");
    }
  };

  const widgetOrigin = process.env.REACT_APP_BACKEND_URL || window.location.origin;
  const WIDGET_VERSION = "1.1";
  const embed = `<script src="${widgetOrigin}/widget.js?v=${WIDGET_VERSION}" data-botnira-vendor="${vendor?.id || ""}" defer></script>`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(embed);
      setCopied(true);
      toast.success("Snippet copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed");
    }
  };

  const conn = voice?.connection;
  const isActive = conn?.status === "active";

  return (
    <div className="p-8 space-y-8" data-testid="channels-page">
      <div>
        <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">Channels</div>
        <h1 className="font-display text-4xl font-black tracking-tighter">Plug in your front desk.</h1>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map(c => {
          const m = META[c.channel] || { icon: Globe, label: c.channel, note: "" };
          const connected = c.channel === "voice" ? isActive : c.status === "connected";
          return (
            <div key={c.channel} className="border-2 border-black bg-white p-5" data-testid={`ch-card-${c.channel}`}>
              <div className="flex items-center justify-between">
                <m.icon size={22} />
                <span className={`badge ${connected ? "bg-[#002FA7] text-white border-black" : ""}`}>
                  {c.channel === "voice" ? (isActive ? "connected" : "not connected") : c.status}
                </span>
              </div>
              <div className="font-display font-black text-xl mt-4">{m.label}</div>
              <div className="text-sm text-neutral-600 mt-1">{m.note}</div>
              {c.channel !== "voice" && c.channel !== "web" && (
                <button data-testid={`ch-toggle-${c.channel}`} onClick={() => toggle(c.channel, connected ? "disconnected" : "connected")} className="mt-4 w-full text-sm font-bold border-2 border-black px-3 py-2 hover-lift">
                  {connected ? "Disconnect" : "Mark as connected"}
                </button>
              )}
              {c.channel === "voice" && isActive && (
                <div className="mt-4 text-xs font-mono">{conn.phone_number_pretty || conn.phone_number}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Voice panel */}
      <div className="border-2 border-black bg-white" data-testid="voice-panel">
        <div className="bg-[#002FA7] text-white px-6 py-4 border-b-2 border-black flex items-center justify-between">
          <div className="flex items-center gap-3">
            <PhoneCall size={20} />
            <div>
              <div className="font-display font-black text-xl">Voice — AI phone receptionist</div>
              <div className="text-xs opacity-80">Fully BotNira-managed. Pick an area code, we handle the rest.</div>
            </div>
          </div>
          {isActive && (
            <span className="badge bg-white text-[#002FA7] border-white">LIVE</span>
          )}
        </div>

        {voiceLoading ? (
          <div className="p-6 font-mono text-sm text-neutral-600">Loading…</div>
        ) : !isActive ? (
          <div className="p-6 space-y-6">
            <div className="grid md:grid-cols-3 gap-3">
              {PLANS.map(p => (
                <label key={p.id} className={`border-2 border-black p-4 cursor-pointer ${plan === p.id ? "bg-[#002FA7] text-white shadow-brutal" : "bg-white hover-lift"}`} data-testid={`plan-${p.id}`}>
                  <input type="radio" checked={plan === p.id} onChange={() => setPlan(p.id)} className="sr-only" />
                  <div className="flex items-center justify-between">
                    <div className="font-display font-black text-lg">{p.label}</div>
                    <div className="font-display font-black">{p.price}</div>
                  </div>
                  <div className="text-xs mt-2 opacity-80">{p.mins}</div>
                  <div className="text-xs opacity-70">{p.over}</div>
                </label>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-4 items-end">
              <div>
                <label className="text-xs font-bold tracking-[0.2em] uppercase mb-1 block">Pick an area code</label>
                <select
                  data-testid="area-code-select"
                  value={areaCode}
                  onChange={e => setAreaCode(Number(e.target.value))}
                  className="w-full border-2 border-black px-3 py-2 font-bold"
                >
                  {AREA_CODES.map(a => <option key={a.code} value={a.code}>{a.label}</option>)}
                </select>
              </div>
              <button
                data-testid="activate-voice-btn"
                onClick={activateVoice}
                disabled={activating}
                className="bg-[#002FA7] text-white font-bold px-6 py-3 border-2 border-black shadow-brutal hover-lift disabled:opacity-60 flex items-center justify-center gap-2"
              >
                <Sparkles size={16} />
                {activating ? "Activating…" : `Activate voice — ${PLANS.find(p => p.id === plan)?.price}`}
              </button>
            </div>

            <div className="border-2 border-black bg-amber-50 p-4 text-sm flex gap-3" data-testid="voice-info">
              <Info size={16} className="flex-shrink-0 mt-0.5"/>
              <div>
                <div className="font-bold">How it works</div>
                <ul className="mt-1 list-disc pl-5 space-y-1 text-neutral-800">
                  <li>We instantly spin up a real US phone number in your chosen area code.</li>
                  <li>Your Bot Studio training (business description + FAQs) powers the phone agent — same brain as your web chat.</li>
                  <li>Every call is transcribed and lands in your Inbox. Booked appointments auto-appear on your Appointments page.</li>
                  <li>You're billed monthly; overage minutes are pro-rated.</li>
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            <div className="grid md:grid-cols-4 gap-4">
              <div className="border-2 border-black p-4 md:col-span-2" data-testid="voice-number-card">
                <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600">Your phone number</div>
                <div className="font-display font-black text-3xl mt-2 tracking-tight">
                  {conn.phone_number_pretty || conn.phone_number}
                </div>
                <div className="text-xs font-mono text-neutral-600 mt-1">Plan: {conn.plan?.toUpperCase()}</div>
              </div>
              <div className="border-2 border-black p-4" data-testid="voice-stats-calls">
                <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600">Calls this month</div>
                <div className="font-display font-black text-3xl mt-2">{voice.stats_this_month.calls}</div>
                <div className="text-xs font-mono text-neutral-600 mt-1">{voice.stats_this_month.minutes} min</div>
              </div>
              <div className="border-2 border-black p-4" data-testid="voice-stats-cost">
                <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600">Cost this month</div>
                <div className="font-display font-black text-3xl mt-2">${voice.stats_this_month.cost.toFixed(2)}</div>
                <div className="text-xs font-mono text-neutral-600 mt-1">metered</div>
              </div>
            </div>

            <div className="border-2 border-black p-4 bg-neutral-50">
              <div className="font-display font-bold mb-2">Test your bot — have it call you</div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  data-testid="test-call-input"
                  type="tel"
                  placeholder="+15551234567"
                  value={testNumber}
                  onChange={e => setTestNumber(e.target.value)}
                  className="flex-1 border-2 border-black px-3 py-2 font-mono"
                />
                <button
                  data-testid="test-call-btn"
                  onClick={runTestCall}
                  className="bg-[#002FA7] text-white font-bold px-5 py-2 border-2 border-black shadow-brutal hover-lift flex items-center justify-center gap-2"
                >
                  <PhoneCall size={14}/> Call me now
                </button>
              </div>
              <div className="text-xs text-neutral-500 mt-2 font-mono">E.164 format required (must start with +).</div>
            </div>

            <div className="border-t-2 border-black pt-4 flex items-center justify-between">
              <div className="text-sm text-neutral-600">Need to pause? Releasing the number cannot be undone.</div>
              <button
                data-testid="deactivate-voice-btn"
                onClick={deactivateVoice}
                disabled={activating}
                className="text-sm font-bold border-2 border-black px-4 py-2 hover-lift flex items-center gap-2 disabled:opacity-60"
              >
                <PowerOff size={14}/> Deactivate
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Web widget installer */}
      <div className="border-2 border-black bg-white p-6" data-testid="web-install">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="font-display font-black text-2xl">Install the web widget</div>
            <p className="text-sm text-neutral-600 mt-1 max-w-2xl">
              Paste this snippet just before <code className="font-mono text-xs bg-neutral-100 px-1 border border-black/20">&lt;/body&gt;</code> on your website.
              It loads only YOUR trained BotNira — all conversations are scoped to your vendor ID.
            </p>
          </div>
          <a href={`${widgetOrigin}/widget.js`} target="_blank" rel="noopener noreferrer" data-testid="widget-js-link" className="text-sm font-bold border-2 border-black px-3 py-2 bg-white hover-lift inline-flex items-center gap-2">
            View widget.js <ExternalLink size={14}/>
          </a>
        </div>
        <div className="mt-4 relative">
          <pre className="border-2 border-black bg-neutral-950 text-white p-4 font-mono text-xs overflow-x-auto whitespace-pre-wrap break-all" data-testid="embed-snippet">{embed}</pre>
          <button onClick={copy} data-testid="copy-embed-btn" className="absolute top-2 right-2 bg-white text-black font-bold text-xs px-3 py-1 border-2 border-white shadow-brutal flex items-center gap-1">
            {copied ? <><Check size={12}/> Copied</> : <><Copy size={12}/> Copy</>}
          </button>
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
