import { useEffect, useState } from "react";
import { Mail, RefreshCw, Trash2, ChevronDown, ChevronUp, ExternalLink, Loader2, Info } from "lucide-react";
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
  const [showAdv, setShowAdv] = useState(false);
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState(993);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);

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
    setBusy(true);
    try {
      const body = {
        email_address: emailAddr,
        password,
        ai_auto_reply: aiReply,
      };
      if (showAdv) {
        if (imapHost) body.imap_host = imapHost;
        if (imapPort) body.imap_port = Number(imapPort);
        if (smtpHost) body.smtp_host = smtpHost;
        if (smtpPort) body.smtp_port = Number(smtpPort);
      }
      const { data } = await api.post("/email/connect", body);
      const skipped = data?.skipped_old || 0;
      toast.success(
        skipped > 0
          ? `Email connected — ${skipped} existing email${skipped === 1 ? "" : "s"} skipped. Now watching for new mail.`
          : "Email connected — watching for new mail.",
        { duration: 6000 }
      );
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
            <div className="flex items-center gap-2">
              <button
                data-testid="email-poll-now"
                onClick={pollNow}
                disabled={busy}
                className="text-sm font-bold border-2 border-black px-4 py-2 hover-lift flex items-center gap-2 bg-white disabled:opacity-60"
              >
                <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Check now
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
              Use any IMAP-enabled mailbox — Gmail, Outlook, Yahoo, Zoho or your own domain. BotNira will read, draft, and (optionally) auto-reply on your behalf.
              You'll need an <strong>app password</strong> rather than your normal login.
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs font-mono">
              <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="underline flex items-center gap-1" data-testid="email-help-gmail">
                Gmail app password <ExternalLink size={10} />
              </a>
              <a href="https://account.live.com/proofs/Manage" target="_blank" rel="noreferrer" className="underline flex items-center gap-1">
                Outlook app password <ExternalLink size={10} />
              </a>
              <a href="https://help.zoho.com/portal/en/kb/articles/generate-an-app-specific-password" target="_blank" rel="noreferrer" className="underline flex items-center gap-1">
                Zoho app password <ExternalLink size={10} />
              </a>
            </div>
          </div>

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
                placeholder="hello@yourbusiness.com"
                className="w-full border-2 border-black px-3 py-2 font-mono"
                autoComplete="username"
              />
            </label>
            <label className="block">
              <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600 mb-1">App password</div>
              <input
                data-testid="email-input-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="•••• •••• •••• ••••"
                className="w-full border-2 border-black px-3 py-2 font-mono"
                autoComplete="new-password"
              />
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

          <button
            type="button"
            onClick={() => setShowAdv((v) => !v)}
            className="text-xs font-bold tracking-[0.2em] uppercase flex items-center gap-1 text-neutral-700 hover:text-black"
            data-testid="email-toggle-advanced"
          >
            {showAdv ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Advanced (custom IMAP/SMTP)
          </button>

          {showAdv && (
            <div className="border-2 border-dashed border-black/40 p-4 grid md:grid-cols-2 gap-3 bg-neutral-50" data-testid="email-advanced-block">
              <input value={imapHost} onChange={(e) => setImapHost(e.target.value)} placeholder="IMAP host (e.g. imap.example.com)" className="border-2 border-black px-3 py-2 font-mono text-sm" />
              <input value={imapPort} onChange={(e) => setImapPort(e.target.value)} placeholder="IMAP port" className="border-2 border-black px-3 py-2 font-mono text-sm" />
              <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="SMTP host (e.g. smtp.example.com)" className="border-2 border-black px-3 py-2 font-mono text-sm" />
              <input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="SMTP port" className="border-2 border-black px-3 py-2 font-mono text-sm" />
              <p className="md:col-span-2 text-xs font-mono text-neutral-500">Leave blank to auto-detect for Gmail / Outlook / Yahoo / Zoho / iCloud.</p>
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
