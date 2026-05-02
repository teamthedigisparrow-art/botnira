import { useEffect, useState } from "react";
import { Mail, RefreshCw, Trash2, ChevronDown, ChevronUp, ExternalLink, Loader2, Info, Eraser } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";

/**
 * Email channel connect / management panel.
 *
 * Vendor pastes their own email + an app password (Gmail/Outlook/Zoho/IMAP).
 * BotNira polls IMAP every 60 s, drops new mail into the unified inbox under
 * channel="email", and (optional) AI auto-replies via SMTP from the same address.
 *
 * One inbox per vendor (MVP).
 */
export default function ConnectEmailPanel({ onChange }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Form state
  const [emailAddr, setEmailAddr] = useState("");
  const [password, setPassword] = useState("");
  const [aiReply, setAiReply] = useState(false);
  const [freshStart, setFreshStart] = useState(true);
  const [provider, setProvider] = useState("gmail"); // gmail, outlook, custom
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState(993);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(465);

  // Pre-filled settings for common providers
  const PROVIDER_SETTINGS = {
    gmail: { imap: "imap.gmail.com", imapPort: 993, smtp: "smtp.gmail.com", smtpPort: 587 },
    outlook: { imap: "outlook.office365.com", imapPort: 993, smtp: "smtp.office365.com", smtpPort: 587 },
    hostinger: { imap: "imap.hostinger.com", imapPort: 993, smtp: "smtp.hostinger.com", smtpPort: 465 },
    custom: { imap: "", imapPort: 993, smtp: "", smtpPort: 465 },
  };

  // Update server settings when provider changes
  const handleProviderChange = (newProvider) => {
    setProvider(newProvider);
    const settings = PROVIDER_SETTINGS[newProvider] || PROVIDER_SETTINGS.custom;
    setImapHost(settings.imap);
    setImapPort(settings.imapPort);
    setSmtpHost(settings.smtp);
    setSmtpPort(settings.smtpPort);
  };

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/email/status");
      setStatus(data);
    } catch {
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const connect = async () => {
    if (!emailAddr || !password) return toast.error("Email and app password are required.");
    
    // For custom provider, validate server settings
    if (provider === "custom" && (!imapHost || !smtpHost)) {
      return toast.error("IMAP and SMTP hosts are required for custom servers.");
    }
    
    setBusy(true);
    try {
      const body = {
        email_address: emailAddr,
        password,
        ai_auto_reply: aiReply,
        fresh_start: freshStart,
      };
      
      // Always send server settings (either from provider preset or custom)
      if (imapHost) body.imap_host = imapHost;
      if (imapPort) body.imap_port = Number(imapPort);
      if (smtpHost) body.smtp_host = smtpHost;
      if (smtpPort) body.smtp_port = Number(smtpPort);
      
      const { data } = await api.post("/email/connect", body);
      const skipped = data?.skipped_old || 0;
      const cleared = data?.cleared_history || 0;
      const bits = [];
      if (cleared > 0) bits.push(`cleared ${cleared} old thread${cleared === 1 ? "" : "s"}`);
      if (skipped > 0) bits.push(`marked ${skipped} existing email${skipped === 1 ? "" : "s"} as read in your inbox`);
      const tail = bits.length ? ` (${bits.join(", ")})` : "";
      toast.success(`Email connected. BotNira will ONLY process mail that arrives from now on${tail}.`, { duration: 9000 });
      setPassword("");
      load();
      onChange?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not connect email.", { duration: 9000 });
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect email? Inbound emails will stop landing in BotNira.")) return;
    setBusy(true);
    try {
      await api.post("/email/disconnect");
      toast.success("Email disconnected.");
      load();
      onChange?.();
    } finally { setBusy(false); }
  };

  const toggleAuto = async (next) => {
    try {
      await api.put("/email/settings", { ai_auto_reply: next });
      toast.success(`AI auto-reply ${next ? "enabled" : "paused"}.`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to update.");
    }
  };

  const pollNow = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/email/poll-now");
      toast.success(`Fetched ${data.fetched} new email${data.fetched === 1 ? "" : "s"}.`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Poll failed.");
    } finally { setBusy(false); }
  };

  const clearHistory = async () => {
    if (!window.confirm(
      "Wipe every email conversation from BotNira?\n\n" +
      "This deletes email threads and messages already ingested. Your Gmail inbox is NOT touched — only the BotNira copy.\n\n" +
      "Use this if you connected before the 'new mail only' fix and want a clean start."
    )) return;
    setBusy(true);
    try {
      const { data } = await api.post("/email/clear-history");
      const d = data?.deleted || {};
      toast.success(
        `Cleared: ${d.conversations || 0} threads, ${d.messages || 0} messages, ${d.appointments || 0} appointments.`,
        { duration: 7000 }
      );
      load();
      onChange?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Clear failed.");
    } finally { setBusy(false); }
  };

  const c = status?.connection;
  const lastPoll = c?.last_polled_at
    ? new Date(c.last_polled_at).toLocaleString()
    : "never";

  return (
    <div className="border-2 border-black bg-white" data-testid="email-panel">
      <div className="bg-[#FBBC04] text-black px-6 py-4 border-b-2 border-black flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Mail size={20} />
          <div>
            <div className="font-display font-black text-xl">Email — IMAP / SMTP</div>
            <div className="text-xs opacity-80">Connect any email inbox. BotNira reads, drafts and replies for you.</div>
          </div>
        </div>
        {status?.connected && (
          <span className="badge bg-black text-[#FBBC04] border-black" data-testid="email-connected-badge">CONNECTED</span>
        )}
      </div>

      {loading ? (
        <div className="p-6 font-mono text-sm text-neutral-600 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : status?.connected ? (
        <div className="p-6 space-y-5">
          {/* Connected summary */}
          <div className="grid md:grid-cols-3 gap-4">
            <div className="border-2 border-black p-4 md:col-span-2">
              <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600">Connected inbox</div>
              <div className="font-display font-black text-2xl mt-2 break-all" data-testid="email-current-address">{c.email_address}</div>
              <div className="text-xs font-mono text-neutral-600 mt-1 break-all">
                IMAP: {c.imap_host}:{c.imap_port} &nbsp;·&nbsp; SMTP: {c.smtp_host}:{c.smtp_port}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="border border-black/30 px-2 py-0.5 font-mono" data-testid="email-received-count">
                  Received: {c.total_received || 0}
                </span>
                <span className="border border-black/30 px-2 py-0.5 font-mono" data-testid="email-sent-count">
                  Sent: {c.total_sent || 0}
                </span>
                <span className="border border-black/30 px-2 py-0.5 font-mono">
                  Last sync: {lastPoll}
                </span>
              </div>
            </div>
            <div className="border-2 border-black p-4">
              <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600">AI auto-reply</div>
              <div className="font-display font-black text-2xl mt-2">{c.ai_auto_reply ? "ON" : "OFF"}</div>
              <button
                data-testid="email-toggle-autoreply"
                onClick={() => toggleAuto(!c.ai_auto_reply)}
                className="mt-3 w-full text-xs font-bold border-2 border-black px-3 py-2 hover-lift"
              >
                {c.ai_auto_reply ? "Pause AI replies" : "Enable AI replies"}
              </button>
              <div className="mt-2 text-[10px] font-mono text-neutral-500 leading-tight">
                When OFF, BotNira still files emails into your Inbox — you reply manually.
              </div>
            </div>
          </div>

          <div className="border-2 border-black p-4 text-sm bg-neutral-50">
            <div className="font-display font-bold mb-1">How it works</div>
            <div className="text-neutral-700">
              Customers email <span className="font-mono break-all">{c.email_address}</span> → it lands in your <a href="/app/inbox" className="underline font-bold">Inbox</a> within a minute → BotNira can draft and send replies (in your voice, in any language) → all replies are sent from <strong>your own address</strong> so customers see your real domain.
            </div>
          </div>

          <div className="border-t-2 border-black pt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-neutral-600">Disconnecting pauses inbound + outbound email for this vendor.</div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                data-testid="email-poll-now"
                onClick={pollNow}
                disabled={busy}
                className="text-sm font-bold border-2 border-black px-4 py-2 hover-lift flex items-center gap-2 bg-white disabled:opacity-60"
              >
                <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Check now
              </button>
              <button
                data-testid="email-clear-history-btn"
                onClick={clearHistory}
                disabled={busy}
                className="text-sm font-bold border-2 border-black px-4 py-2 hover-lift flex items-center gap-2 bg-yellow-100 disabled:opacity-60"
                title="Wipe all previously ingested email conversations — useful for a clean start"
              >
                <Eraser size={14} /> Clear history
              </button>
              <button
                data-testid="email-disconnect-btn"
                onClick={disconnect}
                disabled={busy}
                className="text-sm font-bold border-2 border-black px-4 py-2 hover-lift flex items-center gap-2 bg-red-50 disabled:opacity-60"
              >
                <Trash2 size={14} /> Disconnect
              </button>
            </div>
          </div>
        </div>
      ) : (
        // ---- Connect form ----
        <div className="p-6 space-y-5" data-testid="email-connect-form">
          <div className="border-2 border-black p-5 bg-amber-50">
            <div className="font-display font-black text-lg">Connect your inbox in ~60 seconds</div>
            <p className="mt-2 text-sm text-neutral-800 max-w-3xl">
              Connect Gmail, Outlook, or any private email server (Hostinger, Namecheap, GoDaddy, cPanel, etc.).
              You'll need an <strong>app password</strong> for Gmail/Outlook, or your regular email password for private servers.
            </p>
          </div>

          {/* Provider Selector */}
          <div>
            <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600 mb-2">Email Provider</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => handleProviderChange("gmail")}
                className={`border-2 border-black px-4 py-3 font-bold text-sm transition-all ${
                  provider === "gmail" 
                    ? "bg-[#FBBC04] text-black shadow-brutal" 
                    : "bg-white text-neutral-600 hover:bg-neutral-50"
                }`}
                data-testid="provider-gmail"
              >
                Gmail
              </button>
              <button
                type="button"
                onClick={() => handleProviderChange("outlook")}
                className={`border-2 border-black px-4 py-3 font-bold text-sm transition-all ${
                  provider === "outlook" 
                    ? "bg-[#0078D4] text-white shadow-brutal" 
                    : "bg-white text-neutral-600 hover:bg-neutral-50"
                }`}
                data-testid="provider-outlook"
              >
                Outlook
              </button>
              <button
                type="button"
                onClick={() => handleProviderChange("hostinger")}
                className={`border-2 border-black px-4 py-3 font-bold text-sm transition-all ${
                  provider === "hostinger" 
                    ? "bg-purple-500 text-white shadow-brutal" 
                    : "bg-white text-neutral-600 hover:bg-neutral-50"
                }`}
                data-testid="provider-hostinger"
              >
                Hostinger
              </button>
              <button
                type="button"
                onClick={() => handleProviderChange("custom")}
                className={`border-2 border-black px-4 py-3 font-bold text-sm transition-all ${
                  provider === "custom" 
                    ? "bg-[#002FA7] text-white shadow-brutal" 
                    : "bg-white text-neutral-600 hover:bg-neutral-50"
                }`}
                data-testid="provider-custom"
              >
                Custom Server
              </button>
            </div>
          </div>

          {/* Provider-specific guides */}
          {provider === "gmail" && (
            <div className="border-2 border-black p-4 bg-yellow-50">
              <div className="font-bold text-sm mb-2">📧 Gmail Setup</div>
              <p className="text-sm text-neutral-800">
                Gmail requires an <strong>App Password</strong>. Click below for step-by-step instructions.
              </p>
              <a 
                href="https://myaccount.google.com/apppasswords" 
                target="_blank" 
                rel="noreferrer" 
                className="inline-flex items-center gap-1 mt-2 text-sm font-bold underline"
              >
                Generate Gmail App Password <ExternalLink size={12} />
              </a>
            </div>
          )}

          {provider === "outlook" && (
            <div className="border-2 border-black p-4 bg-blue-50">
              <div className="font-bold text-sm mb-2">📧 Outlook Setup</div>
              <p className="text-sm text-neutral-800">
                Outlook requires an <strong>App Password</strong>. 
              </p>
              <a 
                href="https://account.live.com/proofs/Manage" 
                target="_blank" 
                rel="noreferrer" 
                className="inline-flex items-center gap-1 mt-2 text-sm font-bold underline"
              >
                Generate Outlook App Password <ExternalLink size={12} />
              </a>
            </div>
          )}

          {provider === "hostinger" && (
            <div className="border-2 border-black p-4 bg-purple-50">
              <div className="font-bold text-sm mb-2">🌐 Hostinger Email Setup</div>
              <p className="text-sm text-neutral-800 mb-2">
                Use your regular email password (not an app password). Server settings are pre-configured:
              </p>
              <ul className="text-xs font-mono space-y-1 text-neutral-700">
                <li>• IMAP: imap.hostinger.com:993 (SSL)</li>
                <li>• SMTP: smtp.hostinger.com:465 (SSL)</li>
              </ul>
            </div>
          )}

          {provider === "custom" && (
            <div className="border-2 border-black p-4 bg-blue-50">
              <div className="font-bold text-sm mb-2">🔧 Custom Server Setup</div>
              <p className="text-sm text-neutral-800 mb-2">
                Enter your email provider's IMAP and SMTP settings below. Common providers:
              </p>
              <ul className="text-xs space-y-2 text-neutral-700">
                <li><strong>Namecheap:</strong> mail.privateemail.com (IMAP: 993, SMTP: 465)</li>
                <li><strong>GoDaddy:</strong> imap.secureserver.net / smtpout.secureserver.net (IMAP: 993, SMTP: 465)</li>
                <li><strong>cPanel:</strong> Check your hosting control panel for mail server settings</li>
              </ul>
            </div>
          )}

          {/* Step-by-step Gmail app password guide — most vendors are on Gmail */}
          <details className="group border-2 border-black bg-white" data-testid="gmail-app-pw-guide">
            <summary className="cursor-pointer px-5 py-4 list-none flex items-center justify-between">
              <span className="flex items-center gap-2 font-display font-bold">
                <Info size={16} className="text-[#002FA7]" />
                How to generate a Gmail app password (3-minute walkthrough)
              </span>
              <span className="text-xl group-open:rotate-45 transition-transform select-none">＋</span>
            </summary>
            <div className="px-5 pb-5 text-sm text-neutral-800 space-y-3 border-t border-black/10 pt-4">
              <p className="text-[13px] leading-relaxed">
                Google requires <strong>2-Step Verification</strong> on your account before it will let you create an app password. Once that's on, you can generate a 16-character password just for BotNira (you can revoke it anytime).
              </p>
              <ol className="list-decimal pl-5 space-y-2 text-[13px] leading-relaxed">
                <li>
                  Open
                  <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer" className="underline font-bold mx-1 inline-flex items-center gap-1">
                    Google Account → Security <ExternalLink size={10} />
                  </a>
                  and turn on <strong>2-Step Verification</strong> if it's not already on. Skip this step if it already is.
                </li>
                <li>
                  Go straight to
                  <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="underline font-bold mx-1 inline-flex items-center gap-1">
                    myaccount.google.com/apppasswords <ExternalLink size={10} />
                  </a>
                  (you'll be asked to re-enter your Google password).
                </li>
                <li>
                  In the <strong>App name</strong> field type something memorable like <span className="font-mono bg-neutral-100 border border-black/20 px-1">BotNira</span> and click <strong>Create</strong>.
                </li>
                <li>
                  Google shows you a <strong>16-character password</strong> in a yellow box (e.g. <span className="font-mono bg-neutral-100 border border-black/20 px-1">abcd efgh ijkl mnop</span>).
                  Copy it now — you won't see it again.
                </li>
                <li>
                  Paste that password into the <strong>App password</strong> field above (spaces are fine; Google ignores them).
                </li>
                <li>
                  Click <strong>Connect inbox</strong>. We'll test IMAP + SMTP and confirm in ~5 seconds.
                </li>
              </ol>
              <div className="border-l-4 border-yellow-400 bg-yellow-50 p-3 text-[12px] font-mono text-neutral-800">
                <strong>Tip:</strong> Don't see "App passwords"? Your Google account is probably a workspace/managed account with the option turned off — ask your IT admin to enable <em>Less secure app access</em> equivalents, or use a personal Gmail. Workspace admins can also issue an app password from the <a className="underline" href="https://admin.google.com" target="_blank" rel="noreferrer">Admin console</a>.
              </div>
              <div className="text-[12px] font-mono text-neutral-600">
                <strong>Privacy:</strong> BotNira encrypts your app password at rest with Fernet (key derived from your tenant's JWT secret). It's only ever used to talk to Gmail's IMAP/SMTP servers — never logged, never shared, never used to train AI.
              </div>
            </div>
          </details>

          <div className="grid md:grid-cols-2 gap-4">
            <label className="block">
              <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600 mb-1">Email address</div>
              <input
                data-testid="email-input-address"
                type="email"
                value={emailAddr}
                onChange={(e) => setEmailAddr(e.target.value)}
                placeholder={provider === "custom" ? "kamal@thedigisparrow.com" : "hello@yourbusiness.com"}
                className="w-full border-2 border-black px-3 py-2 font-mono"
                autoComplete="username"
              />
            </label>
            <label className="block">
              <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600 mb-1">
                {provider === "gmail" || provider === "outlook" ? "App Password" : "Password"}
              </div>
              <input
                data-testid="email-input-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="•••• •••• •••• ••••"
                className="w-full border-2 border-black px-3 py-2 font-mono"
                autoComplete="new-password"
              />
              {(provider === "hostinger" || provider === "custom") && (
                <p className="text-[10px] font-mono text-neutral-500 mt-1">
                  Use your regular email password (not an app password)
                </p>
              )}
            </label>
          </div>

          <label className="flex items-start gap-3 text-sm font-bold cursor-pointer select-none">
            <input
              data-testid="email-toggle-ai"
              type="checkbox"
              checked={aiReply}
              onChange={(e) => setAiReply(e.target.checked)}
              className="w-4 h-4 accent-[#002FA7] mt-0.5"
            />
            <span className="flex-1">
              Let BotNira draft and send AI replies automatically
              <span className="block text-[11px] font-mono font-normal text-neutral-500 mt-0.5">
                Off by default — start with manual review, then flip on once you trust the drafts.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 text-sm font-bold cursor-pointer select-none">
            <input
              data-testid="email-toggle-fresh-start"
              type="checkbox"
              checked={freshStart}
              onChange={(e) => setFreshStart(e.target.checked)}
              className="w-4 h-4 accent-[#002FA7] mt-0.5"
            />
            <span className="flex-1">
              Fresh start — wipe any previously ingested email threads before connecting
              <span className="block text-[11px] font-mono font-normal text-neutral-500 mt-0.5">
                Recommended. Ensures BotNira's inbox starts empty and only shows mail that arrives from this moment on. Your Gmail is NOT touched.
              </span>
            </span>
          </label>

          {/* Server Settings (editable for custom) */}
          {provider === "custom" && (
            <div className="border-2 border-dashed border-black/40 p-4 bg-neutral-50">
              <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600 mb-3">Server Settings</div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">IMAP Host *</label>
                  <input 
                    value={imapHost} 
                    onChange={(e) => setImapHost(e.target.value)} 
                    placeholder="imap.yourdomain.com" 
                    className="w-full border-2 border-black px-3 py-2 font-mono text-sm"
                    data-testid="email-imap-host"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">IMAP Port *</label>
                  <input 
                    value={imapPort} 
                    onChange={(e) => setImapPort(e.target.value)} 
                    placeholder="993" 
                    className="w-full border-2 border-black px-3 py-2 font-mono text-sm"
                    data-testid="email-imap-port"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">SMTP Host *</label>
                  <input 
                    value={smtpHost} 
                    onChange={(e) => setSmtpHost(e.target.value)} 
                    placeholder="smtp.yourdomain.com" 
                    className="w-full border-2 border-black px-3 py-2 font-mono text-sm"
                    data-testid="email-smtp-host"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">SMTP Port *</label>
                  <input 
                    value={smtpPort} 
                    onChange={(e) => setSmtpPort(e.target.value)} 
                    placeholder="465" 
                    className="w-full border-2 border-black px-3 py-2 font-mono text-sm"
                    data-testid="email-smtp-port"
                  />
                </div>
              </div>
              <p className="text-xs font-mono text-neutral-500 mt-3">
                💡 Typical ports: IMAP uses 993 (SSL), SMTP uses 465 (SSL) or 587 (TLS)
              </p>
            </div>
          )}

          {/* Show current settings for other providers */}
          {provider !== "custom" && (
            <div className="border-2 border-black p-4 bg-neutral-50">
              <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600 mb-2">Server Settings (Auto-configured)</div>
              <div className="grid md:grid-cols-2 gap-2 text-xs font-mono text-neutral-700">
                <div>
                  <strong>IMAP:</strong> {imapHost}:{imapPort}
                </div>
                <div>
                  <strong>SMTP:</strong> {smtpHost}:{smtpPort}
                </div>
              </div>
            </div>
          )}

          <button
            data-testid="email-connect-btn"
            onClick={connect}
            disabled={busy}
            className="bg-[#002FA7] text-white font-bold px-6 py-3 border-2 border-black shadow-brutal hover-lift disabled:opacity-60 flex items-center gap-2"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
            {busy ? "Connecting…" : "Connect inbox"}
          </button>
        </div>
      )}
    </div>
  );
}
