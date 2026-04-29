import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { toast } from "sonner";
import {
  Globe, MessageCircle, Mail, MessageSquare, Phone, PlayCircle,
  Copy, Check, Lock,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import ConnectWhatsAppButton from "../../components/botnira/ConnectWhatsAppButton";
import ConnectVoicePanel from "../../components/botnira/ConnectVoicePanel";
import ConnectEmailPanel from "../../components/botnira/ConnectEmailPanel";

const META = {
  web: { icon: Globe, label: "Web Widget", note: "Embed on any website. Always live." },
  whatsapp: { icon: MessageCircle, label: "WhatsApp", note: "Fully BotNira-managed. Meta Cloud API." },
  email: { icon: Mail, label: "Email", note: "Unlocks on any paid plan. Vendor-managed." },
  sms: { icon: MessageSquare, label: "SMS", note: "Unlocks on any paid plan. Vendor-managed." },
  voice: { icon: Phone, label: "Voice", note: "Unlocks on any paid plan. Prepaid minutes." },
};

export default function Channels() {
  const [list, setList] = useState([]);
  const { vendor, access } = useAuth();
  const allowedChannels = new Set(access?.allowed_channels || []);
  const [simCh, setSimCh] = useState("whatsapp");
  const [simName, setSimName] = useState("Alex Customer");
  const [simMsg, setSimMsg] = useState("What are your hours?");
  const [simResp, setSimResp] = useState("");
  const [copied, setCopied] = useState(false);

  // WhatsApp state
  const [wa, setWa] = useState(null);
  const [waLoading, setWaLoading] = useState(false);
  const [waTestTo, setWaTestTo] = useState("");
  const [waTestMsg, setWaTestMsg] = useState("Hi! Testing BotNira's WhatsApp.");
  const [waBusy, setWaBusy] = useState(false);
  const [waSignupConfig, setWaSignupConfig] = useState(null);
  const [waSetupMode, setWaSetupMode] = useState("embedded"); // "embedded" or "manual"
  const [waManualForm, setWaManualForm] = useState({
    phone_number_id: "",
    waba_id: "",
    display_phone_number: "",
    access_token: "",
  });

  const loadChannels = () => api.get("/channels").then(r => setList(r.data));

  const loadWa = async () => {
    setWaLoading(true);
    try {
      const { data } = await api.get("/whatsapp/status");
      setWa(data);
    } catch (e) { /* ignore */ }
    finally { setWaLoading(false); }
    try {
      const { data } = await api.get("/whatsapp/embedded-signup-config");
      setWaSignupConfig(data);
    } catch { /* optional */ }
  };

  const onWaSignupSuccess = async (payload) => {
    if (!payload?.code) return toast.error("Meta didn't return an authorisation code.");
    setWaBusy(true);
    try {
      await api.post("/whatsapp/embedded-signup/exchange", { code: payload.code });
      toast.success("WhatsApp connected!");
      loadWa();
      loadChannels();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not finish WhatsApp connection.", { duration: 10000 });
    } finally { setWaBusy(false); }
  };
  const onWaSignupError = (e) => {
    if (e?.cancelled) return;
    toast.error(e?.message || "WhatsApp signup did not complete.", { duration: 10000 });
  };

  const onWaManualConnect = async () => {
    if (!waManualForm.phone_number_id || !waManualForm.waba_id) {
      return toast.error("Phone Number ID and WABA ID are required.");
    }
    setWaBusy(true);
    try {
      await api.post("/whatsapp/connect", waManualForm);
      toast.success("WhatsApp connected manually!");
      loadWa();
      loadChannels();
      // Reset form
      setWaManualForm({ phone_number_id: "", waba_id: "", display_phone_number: "", access_token: "" });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Manual connection failed.", { duration: 10000 });
    } finally {
      setWaBusy(false);
    }
  };

  useEffect(() => { loadChannels(); loadWa(); }, []);

  const toggle = async (ch, newStatus) => {
    await api.put(`/channels/${ch}`, { status: newStatus });
    toast.success(`${ch} ${newStatus}`);
    loadChannels();
  };

  const simulate = async () => {
    const { data } = await api.post(`/simulate/${simCh}`, { customer_name: simName, message: simMsg });
    setSimResp(data.reply);
    toast.success("Inbound simulated — check inbox");
  };

  // Vendors copy this snippet onto their public website, so it must point at
  // the production domain (botnira.com), NOT the internal preview URL. We keep
  // it in REACT_APP_WIDGET_PUBLIC_URL so it can be flipped independently of
  // the API origin used by the dashboard.
  const widgetOrigin =
    process.env.REACT_APP_WIDGET_PUBLIC_URL ||
    process.env.REACT_APP_BACKEND_URL ||
    window.location.origin;
  const WIDGET_VERSION = "1.3";
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
          const locked = !allowedChannels.has(c.channel);
          return (
            <div key={c.channel} className={`border-2 border-black bg-white p-5 ${locked ? "opacity-70" : ""}`} data-testid={`ch-card-${c.channel}`}>
              <div className="flex items-center justify-between">
                <m.icon size={22} />
                {locked ? (
                  <span className="badge bg-neutral-200 text-black border-black flex items-center gap-1" data-testid={`lock-${c.channel}`}>
                    <Lock size={10}/> LOCKED
                  </span>
                ) : (
                  <span className={`badge ${connected ? "bg-[#002FA7] text-white border-black" : ""}`}>
                    {c.status}
                  </span>
                )}
              </div>
              <div className="font-display font-black text-xl mt-4">{m.label}</div>
              <div className="text-sm text-neutral-600 mt-1">{m.note}</div>
              {locked && (
                <Link to="/app/billing" data-testid={`upgrade-${c.channel}`} className="mt-4 inline-block text-sm font-bold border-2 border-black px-3 py-2 hover-lift bg-amber-100">
                  Upgrade to unlock
                </Link>
              )}
              {!locked && c.channel !== "web" && c.channel !== "voice" && c.channel !== "email" && (
                <button data-testid={`ch-toggle-${c.channel}`} onClick={() => toggle(c.channel, connected ? "disconnected" : "connected")} className="mt-4 w-full text-sm font-bold border-2 border-black px-3 py-2 hover-lift">
                  {connected ? "Disconnect" : "Mark as connected"}
                </button>
              )}
              {!locked && c.channel === "voice" && (
                <div className="mt-4 text-xs font-mono text-neutral-600 border border-dashed border-black/40 p-2">
                  See the Voice activation panel below to buy a phone number.
                </div>
              )}
              {!locked && c.channel === "email" && (
                <div className="mt-4 text-xs font-mono text-neutral-600 border border-dashed border-black/40 p-2">
                  See the Email panel below to connect your inbox.
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* WhatsApp panel */}
      <div className="border-2 border-black bg-white" data-testid="whatsapp-panel">
        <div className="bg-[#25D366] text-black px-6 py-4 border-b-2 border-black flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageCircle size={20} />
            <div>
              <div className="font-display font-black text-xl">WhatsApp — Meta Cloud API</div>
              <div className="text-xs opacity-80">BotNira-managed. Vendors connect their own WhatsApp number through Meta.</div>
            </div>
          </div>
          {wa?.connection?.status === "active" && (
            <span className="badge bg-black text-[#25D366] border-black">CONNECTED</span>
          )}
        </div>

        {waLoading ? (
          <div className="p-6 font-mono text-sm text-neutral-600">Loading…</div>
        ) : wa?.connection?.status === "active" ? (
          <div className="p-6 space-y-5">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="border-2 border-black p-4 md:col-span-2">
                <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600">Connected WhatsApp number</div>
                <div className="font-display font-black text-2xl mt-2">{wa.connection.display_phone_number || "(Test number)"}</div>
                <div className="text-xs font-mono text-neutral-600 mt-1 break-all">
                  phone_id: {wa.connection.phone_number_id} • waba: {wa.connection.waba_id}
                </div>
                {wa.connection.is_meta_test && (
                  <div className="mt-2 inline-block border border-amber-600 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest">
                    Meta test number — 5 recipient limit
                  </div>
                )}
              </div>
              <div className="border-2 border-black p-4">
                <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600">Webhook status</div>
                <div className="font-display font-black text-2xl mt-2">LIVE</div>
                <div className="text-xs font-mono text-neutral-600 mt-1 break-all">/api/whatsapp/webhook</div>
              </div>
            </div>

            <div className="border-2 border-black p-4 bg-neutral-50">
              <div className="font-display font-bold mb-2">Send a test message</div>
              <div className="text-xs text-neutral-600 mb-3 font-mono">
                The recipient must have messaged you first within the last 24h (Meta's session-window rule),
                OR be in your Meta app's allowed-recipients list when using the test number.
              </div>
              <div className="grid md:grid-cols-3 gap-2">
                <input
                  data-testid="wa-test-to"
                  value={waTestTo}
                  onChange={e => setWaTestTo(e.target.value)}
                  placeholder="Recipient (+14165551234)"
                  className="border-2 border-black px-3 py-2 font-mono"
                />
                <input
                  data-testid="wa-test-msg"
                  value={waTestMsg}
                  onChange={e => setWaTestMsg(e.target.value)}
                  className="border-2 border-black px-3 py-2 md:col-span-1"
                />
                <button
                  data-testid="wa-test-send"
                  disabled={waBusy}
                  onClick={async () => {
                    if (!waTestTo) return toast.error("Enter a recipient");
                    setWaBusy(true);
                    try {
                      await api.post("/whatsapp/test-send", { to: waTestTo, message: waTestMsg });
                      toast.success("Sent! Check the recipient's WhatsApp.");
                    } catch (e) {
                      toast.error(e?.response?.data?.detail || "Send failed", { duration: 8000 });
                    } finally { setWaBusy(false); }
                  }}
                  className="bg-[#25D366] text-black font-bold px-4 py-2 border-2 border-black shadow-brutal hover-lift disabled:opacity-60"
                >
                  {waBusy ? "Sending…" : "Send"}
                </button>
              </div>
            </div>

            <div className="border-2 border-black p-4 text-sm">
              <div className="font-display font-bold mb-1">Share your WhatsApp with customers</div>
              <div className="text-neutral-700">
                Publish your connected WhatsApp number on your website, Google profile, or business cards.
                Every inbound message hits BotNira's AI brain (same training as your web chat) and lands in your <a href="/app/inbox" className="underline font-bold">Inbox</a>.
              </div>
            </div>

            <div className="border-t-2 border-black pt-4 flex items-center justify-between">
              <div className="text-sm text-neutral-600">Disconnecting pauses inbound/outbound WhatsApp for this vendor.</div>
              <button
                data-testid="wa-disconnect-btn"
                onClick={async () => {
                  if (!window.confirm("Disconnect WhatsApp?")) return;
                  await api.post("/whatsapp/disconnect");
                  toast.success("Disconnected");
                  loadWa();
                  loadChannels();
                }}
                className="text-sm font-bold border-2 border-black px-4 py-2 hover-lift"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-5" data-testid="wa-signup-pending">
            {/* Setup Mode Toggle */}
            <div className="flex gap-2 border-2 border-black p-1 bg-neutral-100 w-fit">
              <button
                onClick={() => setWaSetupMode("embedded")}
                className={`px-4 py-2 font-bold text-sm transition-all ${
                  waSetupMode === "embedded" 
                    ? "bg-[#25D366] text-black border-2 border-black shadow-brutal" 
                    : "bg-transparent text-neutral-600 hover:text-black"
                }`}
              >
                Embedded Signup
              </button>
              <button
                onClick={() => setWaSetupMode("manual")}
                className={`px-4 py-2 font-bold text-sm transition-all ${
                  waSetupMode === "manual" 
                    ? "bg-[#25D366] text-black border-2 border-black shadow-brutal" 
                    : "bg-transparent text-neutral-600 hover:text-black"
                }`}
              >
                Manual Setup
              </button>
            </div>

            {waSetupMode === "embedded" ? (
              /* Embedded Signup Flow */
              <>
                <div className="border-2 border-black p-5 bg-amber-50">
                  <div className="font-display font-black text-lg">Connect your WhatsApp in ~90 seconds</div>
                  <p className="mt-2 text-sm text-neutral-800 max-w-3xl">
                    Click below to open Meta's Embedded Signup. You'll pick the Facebook Business Manager + WhatsApp
                    Business Account that owns your phone number, and BotNira auto-wires the webhook, subscribes to
                    message events, and goes live.
                  </p>
                  <div className="mt-4">
                    {waSignupConfig ? (
                      <ConnectWhatsAppButton
                        config={waSignupConfig}
                        onSuccess={onWaSignupSuccess}
                        onError={onWaSignupError}
                      />
                    ) : (
                      <div className="text-xs font-mono text-neutral-600">Loading Meta config…</div>
                    )}
                  </div>
                  {waSignupConfig && !waSignupConfig.config_id && (
                    <div className="mt-4 text-xs font-mono text-amber-900 bg-amber-100 border border-amber-700 px-3 py-2">
                      ⚠ Meta App Review is still pending — the button will launch the popup as soon as approval lands.
                      In the meantime, the BotNira superadmin can connect your WhatsApp manually.
                    </div>
                  )}
                </div>
                <div className="border-2 border-black p-5">
                  <div className="font-display font-bold mb-2">What you'll need during signup</div>
                  <ul className="text-sm list-disc pl-6 space-y-1 text-neutral-800">
                    <li>A Facebook account that's an admin on your Meta Business Manager.</li>
                    <li>A WhatsApp Business phone number (or an unused number you can verify via SMS/call).</li>
                    <li>Your business display name (what customers see in WhatsApp).</li>
                  </ul>
                </div>
              </>
            ) : (
              /* Manual Setup Flow */
              <>
                <div className="border-2 border-black p-5 bg-blue-50">
                  <div className="font-display font-black text-lg">Manual WhatsApp Setup</div>
                  <p className="mt-2 text-sm text-neutral-800 max-w-3xl">
                    If you've already created a WhatsApp Business Account and have your credentials from Meta, 
                    enter them below to connect manually.
                  </p>
                </div>

                <div className="border-2 border-black p-5 space-y-4">
                  <div>
                    <label className="block text-sm font-bold mb-2">
                      Phone Number ID <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={waManualForm.phone_number_id}
                      onChange={(e) => setWaManualForm({ ...waManualForm, phone_number_id: e.target.value })}
                      placeholder="123456789012345"
                      className="w-full border-2 border-black px-3 py-2 font-mono text-sm"
                      data-testid="wa-manual-phone-id"
                    />
                    <p className="text-xs text-neutral-600 mt-1 font-mono">
                      Find this in Meta Business Manager → WhatsApp Accounts → Phone Numbers
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-bold mb-2">
                      WABA ID (WhatsApp Business Account ID) <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={waManualForm.waba_id}
                      onChange={(e) => setWaManualForm({ ...waManualForm, waba_id: e.target.value })}
                      placeholder="123456789012345"
                      className="w-full border-2 border-black px-3 py-2 font-mono text-sm"
                      data-testid="wa-manual-waba-id"
                    />
                    <p className="text-xs text-neutral-600 mt-1 font-mono">
                      Find this in Meta Business Manager → WhatsApp Accounts → Settings
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-bold mb-2">
                      Display Phone Number
                    </label>
                    <input
                      type="text"
                      value={waManualForm.display_phone_number}
                      onChange={(e) => setWaManualForm({ ...waManualForm, display_phone_number: e.target.value })}
                      placeholder="+1 416 555 1234"
                      className="w-full border-2 border-black px-3 py-2 font-mono text-sm"
                      data-testid="wa-manual-display-phone"
                    />
                    <p className="text-xs text-neutral-600 mt-1 font-mono">
                      Optional: The formatted phone number customers will see
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-bold mb-2">
                      Access Token
                    </label>
                    <textarea
                      value={waManualForm.access_token}
                      onChange={(e) => setWaManualForm({ ...waManualForm, access_token: e.target.value })}
                      placeholder="EAAxxxxxxxxxxxxx..."
                      rows={3}
                      className="w-full border-2 border-black px-3 py-2 font-mono text-sm"
                      data-testid="wa-manual-access-token"
                    />
                    <p className="text-xs text-neutral-600 mt-1 font-mono">
                      Optional: Your permanent access token from Meta. Leave empty to use BotNira's system token.
                    </p>
                  </div>

                  <button
                    onClick={onWaManualConnect}
                    disabled={waBusy || !waManualForm.phone_number_id || !waManualForm.waba_id}
                    className="w-full bg-[#25D366] text-black font-bold px-6 py-3 border-2 border-black shadow-brutal hover-lift disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid="wa-manual-connect-btn"
                  >
                    {waBusy ? "Connecting..." : "Connect WhatsApp"}
                  </button>
                </div>

                <div className="border-2 border-black p-5 bg-neutral-50">
                  <div className="font-display font-bold mb-2">How to get your credentials</div>
                  <ol className="text-sm list-decimal pl-6 space-y-2 text-neutral-800">
                    <li>Go to <a href="https://business.facebook.com" target="_blank" rel="noopener noreferrer" className="underline font-bold">Meta Business Manager</a></li>
                    <li>Navigate to <strong>WhatsApp Accounts</strong> in the left sidebar</li>
                    <li>Select your WhatsApp Business Account</li>
                    <li>Copy the <strong>WABA ID</strong> from Settings</li>
                    <li>Go to <strong>Phone Numbers</strong> and copy the <strong>Phone Number ID</strong></li>
                    <li>(Optional) Generate a permanent <strong>Access Token</strong> from System Users</li>
                  </ol>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Voice panel (Twilio + OpenAI Realtime) */}
      {allowedChannels.has("voice") && (
        <ConnectVoicePanel onChange={loadChannels} />
      )}

      {/* Email panel (IMAP poll + SMTP send, vendor-managed) */}
      {allowedChannels.has("email") && (
        <ConnectEmailPanel onChange={loadChannels} />
      )}

      {/* Web widget installer */}
      <div className="border-2 border-black bg-white p-6" data-testid="web-install">
        <div>
          <div className="font-display font-black text-2xl">Install the web widget</div>
          <p className="text-sm text-neutral-600 mt-1 max-w-2xl">
            Paste this snippet just before <code className="font-mono text-xs bg-neutral-100 px-1 border border-black/20">&lt;/body&gt;</code> on your website.
            It loads only YOUR trained BotNira — all conversations are scoped to your vendor ID.
          </p>
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
        <p className="text-sm text-neutral-600 mt-1">Test BotNira like a real customer would message via WhatsApp, email, or SMS.</p>
        <div className="grid md:grid-cols-4 gap-3 mt-4">
          <select data-testid="sim-channel" value={simCh} onChange={e => setSimCh(e.target.value)} className="border-2 border-black px-3 py-2 font-bold">
            {["whatsapp","email","sms"].map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
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
