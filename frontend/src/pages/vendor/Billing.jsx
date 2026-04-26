import { useEffect, useState, useRef } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { Rocket, Zap, Phone, MessageCircle, Mail, MessageSquare, Globe, Check, Clock, CreditCard, RefreshCw, AlertCircle } from "lucide-react";
import { useSearchParams, useNavigate } from "react-router-dom";
import UsagePanel from "../../components/UsagePanel";

const PLAN_ICONS = { starter: Zap, growth: Rocket, pro: Rocket };
const PACK_THEMES = {
  spark:  { emoji: "✦", color: "bg-yellow-100 border-yellow-700" },
  boost:  { emoji: "⚡", color: "bg-orange-100 border-orange-700" },
  rocket: { emoji: "🚀", color: "bg-red-100 border-red-700" },
  jet:    { emoji: "✈", color: "bg-blue-100 border-blue-700" },
  fleet:  { emoji: "⛵", color: "bg-green-100 border-green-700" },
  armada: { emoji: "⚓", color: "bg-purple-100 border-purple-700" },
};
const PLAN_NAMES = { starter: "Starter", growth: "Growth", pro: "Pro" };

const fmtDate = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
};

export default function Billing() {
  const { reload } = useAuth();
  const [me, setMe] = useState(null);
  const [plans, setPlans] = useState([]);
  const [topups, setTopups] = useState([]);
  const [payments, setPayments] = useState([]);
  const [taxRate, setTaxRate] = useState(13);
  const [busy, setBusy] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [params] = useSearchParams();
  const nav = useNavigate();
  const autoSyncRan = useRef(false);

  const loadAll = async () => {
    try {
      const [a, b, c] = await Promise.all([
        api.get("/billing/me"),
        api.get("/billing/plans"),
        api.get("/billing/payments"),
      ]);
      setMe(a.data);
      setPlans(b.data.plans);
      setTopups(b.data.topups);
      setTaxRate(b.data.tax_rate_percent ?? 13);
      setPayments(c.data.payments || []);
      return a.data;
    } catch (e) {
      toast.error("Failed to load billing");
      return null;
    }
  };

  const syncFromStripe = async ({ silent = false } = {}) => {
    setSyncing(true);
    try {
      const { data } = await api.post("/billing/sync");
      const fresh = await loadAll();
      await reload();
      if (data.applied > 0) {
        toast.success(`Synced ${data.applied} payment${data.applied > 1 ? "s" : ""} from Stripe — your plan is now active.`, { duration: 7000 });
      } else if (!silent) {
        if (fresh?.subscription_status === "active") {
          toast.success("Already in sync. Your subscription is active.");
        } else {
          toast.info("No new payments to sync from Stripe.");
        }
      }
      return data;
    } catch (e) {
      if (!silent) toast.error(e?.response?.data?.detail || "Sync failed");
      return null;
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  // Auto-sync once on mount: if vendor has a Stripe customer but no active sub
  // and isn't on trial-start, attempt to reconcile (covers the case where the
  // webhook + redirect both failed during go-live SSL propagation).
  useEffect(() => {
    if (!me) return;
    if (autoSyncRan.current) return;
    if (me.is_exempt) return;
    if (!me.stripe_customer_id) return;
    if (me.subscription_status === "active") return;
    autoSyncRan.current = true;
    syncFromStripe({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.stripe_customer_id, me?.subscription_status]);

  // Handle Stripe redirect back with session_id
  useEffect(() => {
    const sid = params.get("session_id");
    const cancelled = params.get("cancelled");
    if (cancelled) {
      toast.info("Checkout cancelled. No payment was made.", { duration: 5000 });
      nav("/app/billing", { replace: true });
      return;
    }
    if (!sid) return;
    let tries = 0;
    const poll = async () => {
      tries++;
      try {
        const { data } = await api.get(`/billing/checkout/status/${sid}`);
        if (data.payment_status === "paid") {
          toast.success("Payment successful — your plan is now active!", { duration: 7000 });
          await loadAll();
          await reload();
          nav("/app/billing", { replace: true });
          return;
        }
        if (data.status === "expired") {
          toast.error("Checkout session expired without completing payment.");
          nav("/app/billing", { replace: true });
          return;
        }
        if (tries < 8) {
          setTimeout(poll, 1500);
        } else {
          // Last-ditch fallback: try the sync endpoint
          toast.info("Verifying payment with Stripe…");
          await syncFromStripe({ silent: false });
          nav("/app/billing", { replace: true });
        }
      } catch (e) {
        if (tries < 6) setTimeout(poll, 1500);
        else {
          toast.error("Could not verify payment status — try Sync with Stripe.");
          nav("/app/billing", { replace: true });
        }
      }
    };
    poll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subscribe = async (planId) => {
    setBusy("plan-" + planId);
    try {
      const { data } = await api.post("/billing/checkout/subscription", {
        plan: planId,
        origin_url: window.location.origin,
      });
      window.location.href = data.url;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not start checkout");
      setBusy("");
    }
  };

  const buyTopup = async (packId) => {
    setBusy("pack-" + packId);
    try {
      const { data } = await api.post("/billing/checkout/topup", {
        pack: packId,
        origin_url: window.location.origin,
      });
      window.location.href = data.url;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not start checkout");
      setBusy("");
    }
  };

  const openPortal = async () => {
    try {
      const { data } = await api.post("/billing/portal", { origin_url: window.location.origin });
      window.location.href = data.url;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Customer portal unavailable — subscribe first");
    }
  };

  if (!me) return <div className="p-10 font-mono text-sm">Loading billing…</div>;

  const isExempt = me.is_exempt;
  const onTrial = me.access?.trial;
  const paywall = me.access?.paywall;
  const isActive = me.subscription_status === "active" && !isExempt;
  const planSlug = me.plan || "trial";
  const planLabel = isActive
    ? (PLAN_NAMES[planSlug] || planSlug).toUpperCase()
    : (planSlug || "trial").toUpperCase();
  const trialDays = me.access?.trial_days_left || 0;
  const planMeta = plans.find(p => p.id === planSlug);

  return (
    <div className="p-8 space-y-8" data-testid="billing-page">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">Billing</div>
          <h1 className="font-display text-4xl font-black tracking-tighter">Plans, balance &amp; recharge.</h1>
        </div>
        {!isExempt && me.stripe_customer_id && (
          <button
            data-testid="sync-stripe-btn"
            onClick={() => syncFromStripe({ silent: false })}
            disabled={syncing}
            className="text-sm font-bold border-2 border-black px-4 py-2 hover-lift bg-white shadow-brutal flex items-center gap-2 disabled:opacity-60"
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Sync with Stripe"}
          </button>
        )}
      </div>

      {/* Recovery banner: customer has Stripe ID but no active sub yet */}
      {!isExempt && me.stripe_customer_id && !isActive && !onTrial && (
        <div className="border-2 border-amber-700 bg-amber-50 p-4 flex items-start gap-3" data-testid="recovery-banner">
          <AlertCircle size={20} className="text-amber-800 mt-0.5 shrink-0" />
          <div className="text-sm">
            <div className="font-display font-bold">Just paid on Stripe but don't see it here yet?</div>
            <div className="mt-1 text-neutral-700">
              Click <strong>Sync with Stripe</strong> above. We'll fetch your latest payment and unlock your plan.
            </div>
          </div>
        </div>
      )}

      {/* Current status */}
      <div className="border-2 border-black bg-white shadow-brutal" data-testid="billing-status">
        <div className="bg-black text-white px-6 py-4 flex items-center justify-between flex-wrap gap-2">
          <div className="font-display font-black text-xl">Your account</div>
          <div className="flex items-center gap-2">
            {isExempt && <span className="badge bg-amber-300 text-black border-amber-300">⚡ EXEMPT — FREE FOREVER</span>}
            {onTrial && !isExempt && <span className="badge bg-yellow-300 text-black border-yellow-300" data-testid="trial-badge"><Clock size={12} className="inline mr-1"/>TRIAL · {trialDays}d LEFT</span>}
            {isActive && <span className="badge bg-green-400 text-black border-green-400" data-testid="active-badge">ACTIVE · {planLabel}</span>}
            {paywall && <span className="badge bg-red-500 text-white border-red-500" data-testid="paywall-badge">PAYWALL</span>}
          </div>
        </div>
        <div className="p-6 grid md:grid-cols-4 gap-4">
          <div className="border-2 border-black p-4">
            <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600">Plan</div>
            <div className="font-display font-black text-2xl mt-2" data-testid="plan-label">{planLabel}</div>
            {isActive && planMeta && (
              <div className="text-xs font-mono text-neutral-500 mt-1">${planMeta.price_usd}/mo</div>
            )}
          </div>
          <div className="border-2 border-black p-4" data-testid="voice-balance">
            <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600">Voice minutes</div>
            <div className="font-display font-black text-3xl mt-2">{isExempt ? "∞" : Math.round(me.minutes_balance)}</div>
            <div className="text-xs font-mono text-neutral-500 mt-1">remaining</div>
          </div>
          <div className="border-2 border-black p-4" data-testid="msg-balance">
            <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600">AI messages</div>
            <div className="font-display font-black text-3xl mt-2">{isExempt ? "∞" : me.messages_balance}</div>
            <div className="text-xs font-mono text-neutral-500 mt-1">remaining</div>
          </div>
          <div className="border-2 border-black p-4">
            <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600">
              {isActive ? "Next payment" : onTrial ? "Trial ends" : "Next renewal"}
            </div>
            <div className="font-display font-black text-lg mt-2 break-words" data-testid="next-payment-date">
              {isActive && me.current_period_end
                ? new Date(me.current_period_end).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
                : onTrial && me.trial_ends_at
                ? new Date(me.trial_ends_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
                : me.current_period_end
                ? new Date(me.current_period_end).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
                : "—"}
            </div>
            {isActive && planMeta && (
              <div className="text-xs font-mono text-neutral-500 mt-1">${planMeta.price_usd} will renew</div>
            )}
            {me.subscription_status === "past_due" && (
              <div className="text-xs font-bold text-red-700 mt-1">Payment failed — update card</div>
            )}
            {me.subscription_status === "canceled" && (
              <div className="text-xs font-bold text-neutral-500 mt-1">Subscription canceled</div>
            )}
          </div>
        </div>
        <div className="border-t-2 border-black px-6 py-3 flex justify-end gap-2">
          {me.stripe_customer_id && (
            <button data-testid="open-portal-btn" onClick={openPortal} className="text-sm font-bold border-2 border-black px-3 py-2 hover-lift flex items-center gap-2">
              <CreditCard size={14}/> Manage card / cancel
            </button>
          )}
        </div>
      </div>

      {/* Channel access */}
      <div className="border-2 border-black bg-white p-6" data-testid="channel-access">
        <div className="font-display font-black text-xl mb-4">Channel access</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { ch: "web", icon: Globe, label: "Web" },
            { ch: "whatsapp", icon: MessageCircle, label: "WhatsApp" },
            { ch: "email", icon: Mail, label: "Email" },
            { ch: "sms", icon: MessageSquare, label: "SMS" },
            { ch: "voice", icon: Phone, label: "Voice" },
          ].map(({ ch, icon: Icon, label }) => {
            const allowed = (me.access?.allowed_channels || []).includes(ch);
            return (
              <div key={ch} className={`border-2 border-black p-3 ${allowed ? "bg-green-50" : "bg-neutral-100 opacity-60"}`} data-testid={`acc-${ch}`}>
                <div className="flex items-center gap-2">
                  <Icon size={18}/>
                  <span className="font-display font-bold">{label}</span>
                </div>
                <div className="mt-1 text-[10px] font-mono uppercase tracking-wider">
                  {allowed ? <span className="text-green-700">✓ Unlocked</span> : <span>🔒 Locked</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Usage this period */}
      <UsagePanel exempt={isExempt} />

      {/* Payment history */}
      {!isExempt && payments.length > 0 && (
        <div className="border-2 border-black bg-white shadow-brutal" data-testid="payment-history">
          <div className="bg-black text-white px-6 py-3 font-display font-black text-xl">Payment history</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-100 border-b-2 border-black">
                  <th className="text-left px-4 py-2 font-mono text-xs uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-2 font-mono text-xs uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-2 font-mono text-xs uppercase tracking-wider">Plan/Pack</th>
                  <th className="text-right px-4 py-2 font-mono text-xs uppercase tracking-wider">Subtotal</th>
                  <th className="text-right px-4 py-2 font-mono text-xs uppercase tracking-wider">HST {taxRate}%</th>
                  <th className="text-right px-4 py-2 font-mono text-xs uppercase tracking-wider">Total</th>
                  <th className="text-left px-4 py-2 font-mono text-xs uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-2 font-mono text-xs uppercase tracking-wider">Invoice</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id} className="border-b border-neutral-200" data-testid={`payment-row-${p.id}`}>
                    <td className="px-4 py-2 font-mono text-xs">{fmtDate(p.completed_at || p.created_at)}</td>
                    <td className="px-4 py-2 font-bold capitalize">{p.type}</td>
                    <td className="px-4 py-2 capitalize">{PLAN_NAMES[p.plan_or_pack] || p.plan_or_pack}</td>
                    <td className="px-4 py-2 text-right font-mono">${p.amount?.toFixed?.(2) ?? p.amount}</td>
                    <td className="px-4 py-2 text-right font-mono text-neutral-600">${(p.tax ?? 0).toFixed(2)}</td>
                    <td className="px-4 py-2 text-right font-mono font-bold">${(p.total ?? p.amount).toFixed(2)}</td>
                    <td className="px-4 py-2">
                      {p.status === "completed" ? (
                        <span className="badge bg-green-400 text-black border-green-400">✓ Paid</span>
                      ) : p.status === "initiated" ? (
                        <span className="badge bg-yellow-200 text-black border-yellow-700">Pending</span>
                      ) : p.status === "refunded" ? (
                        <span className="badge bg-neutral-400 text-black border-neutral-700">↩ Refunded</span>
                      ) : p.status === "partially_refunded" ? (
                        <span className="badge bg-orange-200 text-black border-orange-700">↩ Partial refund</span>
                      ) : p.status === "failed" ? (
                        <span className="badge bg-red-400 text-white border-red-700">✗ Failed</span>
                      ) : (
                        <span className="badge bg-neutral-200 text-black border-neutral-700">{p.status}</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {p.invoice_url ? (
                        <a href={p.invoice_url} target="_blank" rel="noopener noreferrer" className="text-[#002FA7] underline font-bold text-xs">
                          Invoice ↗
                        </a>
                      ) : p.receipt_url ? (
                        <a href={p.receipt_url} target="_blank" rel="noopener noreferrer" className="text-[#002FA7] underline font-bold text-xs">
                          Receipt ↗
                        </a>
                      ) : (
                        <span className="text-neutral-400 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Plans */}
      {!isExempt && (
        <div data-testid="plans-section">
          <div className="font-display font-black text-2xl mb-1">Monthly plans</div>
          <p className="text-sm text-neutral-600 mb-3">Pick a base plan — auto-renews monthly, cancel anytime.</p>
          <div className="border-2 border-amber-700 bg-amber-50 px-4 py-2 mb-5 inline-block text-xs font-mono" data-testid="tax-notice-plans">
            <strong>Heads up:</strong> all prices are in USD. <strong>{taxRate}% HST</strong> will be added at checkout (Canadian Harmonized Sales Tax).
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {plans.map(p => {
              const Icon = PLAN_ICONS[p.id] || Rocket;
              const isCurrent = me.plan === p.id && me.subscription_status === "active";
              const taxAmt = (p.price_usd * taxRate / 100).toFixed(2);
              const totalAmt = (p.price_usd * (1 + taxRate / 100)).toFixed(2);
              return (
                <div key={p.id} className={`border-2 border-black p-6 bg-white shadow-brutal ${isCurrent ? "ring-4 ring-[#002FA7]" : ""}`} data-testid={`plan-${p.id}`}>
                  <div className="flex items-center justify-between">
                    <Icon size={28} />
                    {isCurrent && <span className="badge bg-[#002FA7] text-white border-[#002FA7]">CURRENT</span>}
                  </div>
                  <div className="font-display font-black text-3xl mt-4">{p.name}</div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="font-display font-black text-5xl tracking-tighter">${p.price_usd}</span>
                    <span className="text-xs font-mono text-neutral-500">/mo USD</span>
                  </div>
                  <div className="text-[11px] font-mono text-neutral-500 mt-1">+ ${taxAmt} HST = <strong>${totalAmt}/mo</strong> total</div>
                  <ul className="mt-5 space-y-2 text-sm">
                    <li className="flex items-center gap-2"><Check size={14} className="text-green-700"/> <strong>{p.voice_min}</strong> voice minutes</li>
                    <li className="flex items-center gap-2"><Check size={14} className="text-green-700"/> <strong>{p.messages.toLocaleString()}</strong> AI messages</li>
                    <li className="flex items-center gap-2"><Check size={14} className="text-green-700"/> All channels unlocked</li>
                    <li className="flex items-center gap-2"><Check size={14} className="text-green-700"/> Live agent override</li>
                  </ul>
                  <button
                    data-testid={`subscribe-${p.id}`}
                    disabled={isCurrent || busy === `plan-${p.id}`}
                    onClick={() => subscribe(p.id)}
                    className="mt-6 w-full bg-[#002FA7] text-white font-bold py-3 border-2 border-black shadow-brutal hover-lift disabled:opacity-60"
                  >
                    {isCurrent ? "Current plan" : busy === `plan-${p.id}` ? "Loading…" : `Subscribe to ${p.name}`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top-up packs */}
      {!isExempt && (
        <div data-testid="topups-section">
          <div className="font-display font-black text-2xl mb-1">Top-up packs</div>
          <p className="text-sm text-neutral-600 mb-3">One-time recharge. Never expires. Stacks on top of your plan.</p>
          <div className="border-2 border-amber-700 bg-amber-50 px-4 py-2 mb-5 inline-block text-xs font-mono" data-testid="tax-notice-topups">
            <strong>Heads up:</strong> {taxRate}% HST will be added to top-up purchases at checkout.
          </div>
          <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-4">
            {topups.map(t => {
              const theme = PACK_THEMES[t.id] || { emoji: "★", color: "bg-neutral-100 border-neutral-700" };
              const taxAmt = (t.price_usd * taxRate / 100).toFixed(2);
              const totalAmt = (t.price_usd * (1 + taxRate / 100)).toFixed(2);
              return (
                <div key={t.id} className={`border-2 p-5 shadow-brutal ${theme.color}`} data-testid={`topup-${t.id}`}>
                  <div className="text-4xl">{theme.emoji}</div>
                  <div className="font-display font-black text-xl mt-2">{t.name}</div>
                  <div className="mt-2 font-display font-black text-3xl tracking-tighter">${t.price_usd}</div>
                  <div className="text-[10px] font-mono text-neutral-700 mt-1">+ ${taxAmt} HST = <strong>${totalAmt}</strong></div>
                  <ul className="mt-3 space-y-1 text-xs font-mono">
                    <li><strong>{t.voice_min}</strong> voice min</li>
                    <li><strong>{t.messages.toLocaleString()}</strong> AI msgs</li>
                  </ul>
                  <button
                    data-testid={`buy-${t.id}`}
                    disabled={busy === `pack-${t.id}`}
                    onClick={() => buyTopup(t.id)}
                    className="mt-4 w-full bg-black text-white font-bold text-sm py-2 border-2 border-black hover-lift disabled:opacity-60"
                  >
                    {busy === `pack-${t.id}` ? "…" : "Buy"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
