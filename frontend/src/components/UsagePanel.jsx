// Per-period usage panel for the vendor Billing page.
// Pulls /api/billing/usage and renders Voice + Messages cards with a
// stacked progress bar showing plan-included vs top-up booster vs used.
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Phone, MessageSquare, Globe, MessageCircle, Mail, Info, RefreshCw, Smartphone } from "lucide-react";

const CHANNEL_ICONS = {
  web:      { icon: Globe, label: "Web" },
  whatsapp: { icon: MessageCircle, label: "WhatsApp" },
  email:    { icon: Mail, label: "Email" },
  sms:      { icon: Smartphone, label: "SMS" },
};

function StackedBar({ used, plan, topup, color = "#002FA7" }) {
  const total = Math.max(plan + topup, used, 1);
  const usedPct = Math.min(100, (used / total) * 100);
  const planPct = Math.min(100, (plan / total) * 100);
  return (
    <div className="mt-3" data-testid="usage-bar">
      <div className="h-3 w-full bg-neutral-100 border-2 border-black relative overflow-hidden">
        <div className="absolute inset-y-0 left-0" style={{ width: `${planPct}%`, background: "rgba(0,0,0,0.08)" }} />
        <div className="absolute inset-y-0 left-0" style={{ width: `${usedPct}%`, background: color }} />
      </div>
      <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-neutral-500 flex justify-between">
        <span>{Math.round(used)} used</span>
        <span>{Math.round(plan + topup)} total ({plan} plan{topup ? ` + ${Math.round(topup)} top-up` : ""})</span>
      </div>
    </div>
  );
}

export default function UsagePanel({ exempt }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const { data } = await api.get("/billing/usage");
      setData(data);
    } catch (e) {
      // ignore — billing page will still work
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { load(); }, []);

  if (!data) {
    return (
      <div className="border-2 border-black bg-white p-6" data-testid="usage-panel-loading">
        <div className="font-display font-black text-xl">Usage this period</div>
        <div className="text-sm text-neutral-500 mt-2">Loading…</div>
      </div>
    );
  }

  if (exempt || data.is_exempt) {
    return (
      <div className="border-2 border-amber-700 bg-amber-50 p-6" data-testid="usage-panel-exempt">
        <div className="font-display font-black text-xl flex items-center gap-2">⚡ Usage this period</div>
        <p className="text-sm mt-2">
          You're on an <strong>exempt account</strong> — voice + AI usage is unlimited and not billed.
          We're still tracking it for analytics:
        </p>
        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-600">Voice this period</div>
            <div className="font-display font-black text-3xl">{data.minutes.used_this_period} <span className="text-base font-normal text-neutral-500">min</span></div>
            <div className="text-xs font-mono text-neutral-500">{data.minutes.calls} calls answered</div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-600">Messages this period</div>
            <div className="font-display font-black text-3xl">{data.messages.used_this_period.toLocaleString()}</div>
            <div className="text-xs font-mono text-neutral-500">across {Object.keys(data.messages.by_channel || {}).length} channels</div>
          </div>
        </div>
      </div>
    );
  }

  const m = data.minutes;
  const x = data.messages;
  const periodStart = data.period_start ? new Date(data.period_start).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
  const periodEnd = data.period_end ? new Date(data.period_end).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";

  return (
    <div className="border-2 border-black bg-white shadow-brutal" data-testid="usage-panel">
      <div className="bg-black text-white px-6 py-3 flex items-center justify-between flex-wrap gap-2">
        <div className="font-display font-black text-xl">Usage this period</div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono opacity-80">{periodStart} → {periodEnd}</span>
          <button data-testid="usage-refresh" onClick={load} disabled={busy} className="text-xs font-bold border border-white/40 px-2 py-1 hover:bg-white/10 flex items-center gap-1 disabled:opacity-50">
            <RefreshCw size={10} className={busy ? "animate-spin" : ""}/> Refresh
          </button>
        </div>
      </div>

      <div className="p-6 grid md:grid-cols-2 gap-6">
        {/* Voice card */}
        <div className="border-2 border-black p-4" data-testid="usage-voice">
          <div className="flex items-center gap-2">
            <Phone size={18} className="text-[#002FA7]" />
            <span className="font-display font-bold">Voice minutes</span>
          </div>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="font-display font-black text-4xl tracking-tighter">{Math.round(data.balance.minutes_remaining)}</span>
            <span className="text-sm font-mono text-neutral-500">remaining</span>
          </div>
          <StackedBar used={m.used_this_period} plan={m.plan_included} topup={m.topup_added} color="#002FA7" />
          <div className="mt-3 text-xs font-mono text-neutral-600">
            {m.calls} calls answered · {m.used_this_period.toFixed(1)} min used
          </div>
        </div>

        {/* Messages card */}
        <div className="border-2 border-black p-4" data-testid="usage-messages">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-[#002FA7]" />
            <span className="font-display font-bold">AI messages</span>
          </div>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="font-display font-black text-4xl tracking-tighter">{data.balance.messages_remaining.toLocaleString()}</span>
            <span className="text-sm font-mono text-neutral-500">remaining</span>
          </div>
          <StackedBar used={x.used_this_period} plan={x.plan_included} topup={x.topup_added} color="#FFD60A" />
          <div className="mt-3 grid grid-cols-4 gap-2">
            {["web", "whatsapp", "email", "sms"].map(ch => {
              const meta = CHANNEL_ICONS[ch];
              const Icon = meta.icon;
              const n = x.by_channel?.[ch] || 0;
              return (
                <div key={ch} className="border-2 border-black p-2 text-center" data-testid={`usage-msg-${ch}`}>
                  <Icon size={14} className="mx-auto" />
                  <div className="font-display font-black text-lg leading-none mt-1">{n}</div>
                  <div className="text-[9px] font-mono uppercase text-neutral-500">{meta.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="px-6 pb-4 flex items-start gap-2 text-[11px] font-mono text-neutral-500 leading-relaxed" data-testid="usage-refresh-note">
        <Info size={12} className="mt-0.5 shrink-0" />
        <span>{data.refresh_note} If your balance hits 0 in the middle of the day, channels stop instantly — the dashboard catches up the next day.</span>
      </div>
    </div>
  );
}
