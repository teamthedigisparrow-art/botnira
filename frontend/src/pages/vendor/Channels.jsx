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
  { code: 416, label: "416 — Toronto" },
  { code: 647, label: "647 — Toronto" },
  { code: 437, label: "437 — Toronto (GTA)" },
  { code: 905, label: "905 — Mississauga / Hamilton" },
  { code: 289, label: "289 — Hamilton / Niagara" },
  { code: 365, label: "365 — GTA South" },
  { code: 613, label: "613 — Ottawa" },
  { code: 343, label: "343 — Ottawa" },
  { code: 514, label: "514 — Montréal" },
  { code: 438, label: "438 — Montréal" },
  { code: 450, label: "450 — Greater Montréal" },
  { code: 604, label: "604 — Vancouver" },
  { code: 778, label: "778 — Vancouver" },
  { code: 236, label: "236 — BC" },
  { code: 403, label: "403 — Calgary" },
  { code: 587, label: "587 — Alberta" },
  { code: 780, label: "780 — Edmonton" },
  { code: 204, label: "204 — Winnipeg" },
  { code: 902, label: "902 — Nova Scotia / PEI" },
  { code: 709, label: "709 — Newfoundland" },
];

const PLANS = [
  { id: "starter", label: "Starter", price: "$49/mo", mins: "100 min incl.", minsNum: 100, over: "Voice auto-pauses at 100 min" },
  { id: "growth", label: "Growth", price: "$149/mo", mins: "500 min incl.", minsNum: 500, over: "Voice auto-pauses at 500 min" },
  { id: "pro", label: "Pro", price: "$399/mo", mins: "1500 min incl.", minsNum: 1500, over: "Voice auto-pauses at 1500 min" },
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
  const areaCodeState = useState(416);
  const areaCode = areaCodeState[0];
  const setAreaCode = areaCodeState[1];
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
              <div className="text-xs opacity-80">BotNira-managed. Pick a Canadian area code, we do the rest.</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {voice?.quota?.exempt && (
              <span className="badge bg-amber-300 text-black border-black" data-testid="unlimited-badge">⚡ UNLIMITED TEST</span>
            )}
            {isActive && !voice?.quota?.paused && (
              <span className="badge bg-white text-[#002FA7] border-white">LIVE</span>
            )}
            {voice?.quota?.paused && (
              <span className="badge bg-red-500 text-white border-white">PAUSED — QUOTA</span>
            )}
          </div>
        </div>

        {/* Auto-pause banner when over quota */}
        {voice?.quota?.paused && (
          <div className="bg-red-50 border-b-2 border-black p-4 text-sm" data-testid="quota-pause-banner">
            <div className="font-display font-bold text-red-800">Voice paused — monthly minutes exhausted</div>
            <div className="mt-1 text-neutral-800">
              Inbound calls are not being answered. Upgrade plan or wait for monthly reset.
              We auto-pause so your account never accidentally overspends.
            </div>
            <button
              data-testid="resume-voice-btn"
              onClick={async () => {
                try {
                  await api.post("/voice/resume");
                  toast.success("Voice resumed (minutes counter reset)");
                  loadVoice();
                } catch { toast.error("Resume failed"); }
              }}
              className="mt-3 bg-black text-white font-bold px-4 py-2 border-2 border-black text-xs"
            >
              Resume & reset minutes
            </button>
          </div>
        )}

        {voiceLoading ? (
          <div className="p-6 font-mono text-sm text-neutral-600">Loading…</div>
        ) : !isActive ? (
          <div className="p-6 space-y-4" data-testid="voice-waitlist">
            <div className="border-2 border-black p-5 bg-amber-50">
              <div className="font-display font-black text-lg">Voice is in waitlist 🎙️</div>
              <p className="mt-2 text-sm text-neutral-800 max-w-3xl">
                We're waiting for our voice partner to enable Canadian phone-number inventory on our account.
                Your bot is already trained and ready — the moment numbers come online we'll flip the switch and email you.
              </p>
              <p className="mt-2 text-xs font-mono text-neutral-600">
                ETA: 1–3 business days. In the meantime, WhatsApp, Web chat and Email channels remain fully available.
              </p>
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
                <div className="text-xs font-mono text-neutral-600 mt-1">
                  Plan: {voice.quota.plan?.toUpperCase()}
                  {voice.quota.exempt && " • INTERNAL TEST (no charge)"}
                </div>
              </div>
              <div className="border-2 border-black p-4" data-testid="voice-stats-calls">
                <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600">Calls this month</div>
                <div className="font-display font-black text-3xl mt-2">{voice.stats_this_month.calls}</div>
                <div className="text-xs font-mono text-neutral-600 mt-1">{voice.stats_this_month.minutes} min used</div>
              </div>
              <div className="border-2 border-black p-4" data-testid="voice-stats-cost">
                <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600">Your cost this month</div>
                <div className="font-display font-black text-3xl mt-2">
                  {voice.quota.exempt ? "FREE" : `$${voice.stats_this_month.cost.toFixed(2)}`}
                </div>
                <div className="text-xs font-mono text-neutral-600 mt-1">metered</div>
              </div>
            </div>

            {/* Quota progress */}
            {!voice.quota.exempt && voice.quota.limit_minutes && (
              <div className="border-2 border-black p-4" data-testid="quota-progress">
                <div className="flex items-center justify-between text-sm">
                  <div className="font-bold">Plan minutes</div>
                  <div className="font-mono">
                    {voice.quota.used_minutes} / {voice.quota.limit_minutes} min
                    <span className="ml-2 text-neutral-600">({voice.quota.remaining_minutes} left)</span>
                  </div>
                </div>
                <div className="mt-2 h-3 bg-neutral-200 border-2 border-black">
                  <div
                    className="h-full bg-[#002FA7]"
                    style={{ width: `${Math.min(100, (voice.quota.used_minutes / voice.quota.limit_minutes) * 100)}%` }}
                  />
                </div>
                <div className="text-xs font-mono text-neutral-600 mt-2">
                  Voice will auto-pause at {voice.quota.limit_minutes} minutes. Upgrade your plan for more.
                </div>
              </div>
            )}
            {voice.quota.exempt && (
              <div className="border-2 border-black p-4 bg-amber-50 text-sm" data-testid="exempt-note">
                <div className="font-bold">Internal test vendor</div>
                <div className="mt-1 text-neutral-800">No minute cap, no BotNira charges. Retell pass-through costs still apply to your Retell account.</div>
              </div>
            )}

            <div className="border-2 border-black p-4 bg-neutral-50">
              <div className="font-display font-bold mb-2">Test your bot — have it call you</div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  data-testid="test-call-input"
                  type="tel"
                  placeholder="+14165551234"
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
              <div className="text-xs text-neutral-500 mt-2 font-mono">E.164 format required (e.g. +1 for Canada/US).</div>
            </div>

            <div className="border-t-2 border-black pt-4 flex items-center justify-between">
              <div className="text-sm text-neutral-600">Deactivating releases the number immediately.</div>
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
