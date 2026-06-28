import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import {
  Link as LinkIcon, Copy, Check, Users, DollarSign, Wallet, CreditCard,
  ChevronRight, Landmark, TrendingUp, Calendar,
} from "lucide-react";

const TABS = [
  { key: "overview",   label: "Overview",       icon: TrendingUp },
  { key: "customers",  label: "My Referrals",   icon: Users },
  { key: "commissions",label: "Commissions",    icon: DollarSign },
  { key: "payouts",    label: "Payouts",        icon: Wallet },
  { key: "bank",       label: "Bank Account",   icon: Landmark },
];

const fmtUSD = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n || 0));

const fmtDate = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
  catch { return iso; }
};

const monthLabel = (ym) => {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym || "—";
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString(undefined, { month: "long", year: "numeric" });
};

function Stat({ label, value, sub, testid, accent = "bg-white" }) {
  return (
    <div className={`border-2 border-black p-5 ${accent}`} data-testid={testid}>
      <div className="text-[10px] font-bold tracking-[0.22em] uppercase text-neutral-600">{label}</div>
      <div className="font-display font-black text-3xl mt-2">{value}</div>
      {sub && <div className="text-xs text-neutral-600 mt-1">{sub}</div>}
    </div>
  );
}

function Pill({ children, tone = "neutral" }) {
  const palette = {
    active: "bg-green-200 border-black text-black",
    cancelled: "bg-red-200 border-black text-black",
    paid: "bg-green-200 border-black text-black",
    accrued: "bg-yellow-200 border-black text-black",
    trialing: "bg-yellow-200 border-black text-black",
    canceled: "bg-red-200 border-black text-black",
    past_due: "bg-red-200 border-black text-black",
    neutral: "bg-neutral-200 border-black text-black",
  }[tone] || "bg-neutral-200 border-black text-black";
  return (
    <span className={`text-[10px] font-bold uppercase tracking-widest border px-2 py-0.5 ${palette}`}>
      {children}
    </span>
  );
}

export default function Referrals() {
  const [tab, setTab] = useState("overview");
  const [me, setMe] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [commissions, setCommissions] = useState({ commissions: [], monthly: [] });
  const [payouts, setPayouts] = useState([]);
  const [bank, setBank] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      const [r1, r2, r3, r4, r5] = await Promise.all([
        api.get("/referrals/me"),
        api.get("/referrals/customers"),
        api.get("/referrals/commissions"),
        api.get("/referrals/payouts"),
        api.get("/referrals/bank-account"),
      ]);
      setMe(r1.data);
      setCustomers(r2.data.customers || []);
      setCommissions(r3.data || { commissions: [], monthly: [] });
      setPayouts(r4.data.payouts || []);
      setBank(r5.data.bank_account || null);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not load referral data");
    } finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, []);

  const copyLink = async () => {
    if (!me?.referral_link) return;
    try {
      await navigator.clipboard.writeText(me.referral_link);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not copy");
    }
  };

  if (loading || !me) {
    return <div className="p-10 font-mono" data-testid="referrals-loading">Loading referrals…</div>;
  }

  const s = me.summary || {};

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-6xl" data-testid="referrals-page">
      {/* Header */}
      <div>
        <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">Earn alongside BotNira</div>
        <h1 className="font-display text-4xl font-black tracking-tighter">Referrals</h1>
        <p className="text-neutral-700 mt-1 max-w-2xl">
          Share your unique link. Earn <span className="font-bold">{s.commission_rate_percent ?? 15}%</span> recurring commission
          on every successful payment from customers you refer — for as long as their subscription stays active.
        </p>
      </div>

      {/* Referral link card — always visible */}
      <div className="border-2 border-black bg-yellow-200 p-5 shadow-brutal-lg" data-testid="referral-link-card">
        <div className="flex items-start gap-3 flex-wrap">
          <LinkIcon size={20} />
          <div className="flex-1 min-w-[260px]">
            <div className="text-[10px] font-bold tracking-[0.22em] uppercase text-neutral-700">Your referral link</div>
            <div className="font-mono text-sm md:text-base mt-1 break-all" data-testid="referral-link-text">
              {me.referral_link}
            </div>
            <div className="text-xs text-neutral-700 mt-1">
              Code: <span className="font-mono font-bold">{me.code}</span> · Cannot be changed.
            </div>
          </div>
          <button
            onClick={copyLink}
            data-testid="referral-copy-btn"
            className="bg-black text-white font-bold px-4 py-2 border-2 border-black hover-lift flex items-center gap-2"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          testid="stat-customers"
          label="Total Referrals"
          value={s.total_customers ?? 0}
          sub={`${s.active_customers ?? 0} active subscription${(s.active_customers ?? 0) === 1 ? "" : "s"}`}
        />
        <Stat
          testid="stat-this-month"
          label="Earned this month"
          value={fmtUSD(s.this_month_earnings_usd)}
          sub="Accrues throughout the month"
          accent="bg-white"
        />
        <Stat
          testid="stat-pending"
          label="Pending payout"
          value={fmtUSD(s.pending_earnings_usd)}
          sub="Paid out at month-end"
          accent="bg-amber-100"
        />
        <Stat
          testid="stat-lifetime"
          label="Lifetime earnings"
          value={fmtUSD(s.lifetime_earnings_usd)}
          sub={`${fmtUSD(s.paid_earnings_usd)} already paid`}
          accent="bg-green-100"
        />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b-2 border-black pb-2" data-testid="referrals-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            data-testid={`referrals-tab-${t.key}`}
            className={`text-sm font-bold border-2 border-black px-3 py-1.5 flex items-center gap-2 ${
              tab === t.key ? "bg-[#002FA7] text-white" : "bg-white hover:bg-neutral-100"
            }`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <OverviewTab me={me} customers={customers} bank={bank} onGo={setTab} />
      )}
      {tab === "customers" && <CustomersTab customers={customers} />}
      {tab === "commissions" && <CommissionsTab data={commissions} />}
      {tab === "payouts" && <PayoutsTab payouts={payouts} />}
      {tab === "bank" && <BankTab bank={bank} onSaved={reload} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tabs                                                                       */
/* -------------------------------------------------------------------------- */

function OverviewTab({ me, customers, bank, onGo }) {
  const recent = customers.slice(0, 5);
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* How it works */}
      <div className="border-2 border-black bg-white p-6 space-y-3" data-testid="how-it-works-panel">
        <div className="font-display font-black text-xl">How it works</div>
        <ol className="list-decimal pl-5 space-y-2 text-sm">
          <li>Share your unique referral link with prospects.</li>
          <li>They sign up for BotNira through your link.</li>
          <li>Once they pay for any plan, you start earning <strong>{me.summary?.commission_rate_percent ?? 15}%</strong> on every monthly invoice they pay.</li>
          <li>Commissions are tallied at the end of every month and wired to your bank in <strong>USD</strong>.</li>
          <li>If a customer cancels, future commissions stop — but historical earnings stay with you.</li>
        </ol>
        <div className="text-xs text-neutral-600 border-t border-neutral-300 pt-3">
          Note: All payouts are made in <strong>USD</strong>. Make sure your bank account is configured to receive USD wires.
        </div>
      </div>

      {/* Quick-action panel */}
      <div className="border-2 border-black bg-white p-6 space-y-4" data-testid="quick-actions-panel">
        <div className="font-display font-black text-xl">Get paid faster</div>
        <button
          onClick={() => onGo("bank")}
          data-testid="overview-bank-cta"
          className={`w-full text-left border-2 border-black p-4 flex items-center justify-between hover-lift ${
            bank ? "bg-green-100" : "bg-amber-100"
          }`}
        >
          <div>
            <div className="flex items-center gap-2 font-display font-bold">
              <Landmark size={16} />
              {bank ? "Bank account on file" : "Add bank account"}
            </div>
            <div className="text-xs text-neutral-700 mt-1">
              {bank
                ? `${bank.bank_name} · ${bank.country} · ****${(bank.account_number || "").slice(-4)}`
                : "Required before we can wire payouts to you."}
            </div>
          </div>
          <ChevronRight size={16} />
        </button>

        <div>
          <div className="text-[10px] font-bold tracking-[0.22em] uppercase text-neutral-600 mb-2">Recent referrals</div>
          {recent.length === 0 ? (
            <div className="text-sm text-neutral-600 border-2 border-dashed border-neutral-300 p-4">
              No referrals yet. Share your link to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {recent.map((c) => (
                <div key={c.referral_id} className="border-2 border-black p-3 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="font-display font-bold">{c.business_name || "Unnamed business"}</div>
                    <div className="text-xs text-neutral-600">{fmtDate(c.signup_at)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill tone={c.status === "active" ? "active" : "cancelled"}>{c.status}</Pill>
                    <span className="font-mono text-sm font-bold">{fmtUSD(c.earned_usd)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CustomersTab({ customers }) {
  if (customers.length === 0) {
    return (
      <div className="border-2 border-dashed border-neutral-400 p-10 text-center text-neutral-600" data-testid="customers-empty">
        You haven't referred anyone yet. Copy your link above and start sharing.
      </div>
    );
  }
  return (
    <div className="border-2 border-black bg-white overflow-x-auto" data-testid="customers-table">
      <table className="w-full text-sm">
        <thead className="bg-neutral-100 border-b-2 border-black">
          <tr>
            {["Business", "Signed up", "Plan", "Subscription", "Referral", "Earned"].map((h) => (
              <th key={h} className="text-left px-4 py-3 text-[10px] font-bold tracking-[0.22em] uppercase">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.referral_id} className="border-b border-neutral-200" data-testid={`customer-row-${c.referred_vendor_id}`}>
              <td className="px-4 py-3">
                <div className="font-display font-bold">{c.business_name || "—"}</div>
                <div className="text-xs text-neutral-600">{c.contact_email}</div>
              </td>
              <td className="px-4 py-3 font-mono text-xs">{fmtDate(c.signup_at)}</td>
              <td className="px-4 py-3"><Pill tone="neutral">{c.plan}</Pill></td>
              <td className="px-4 py-3"><Pill tone={c.subscription_status}>{c.subscription_status}</Pill></td>
              <td className="px-4 py-3"><Pill tone={c.status === "active" ? "active" : "cancelled"}>{c.status}</Pill></td>
              <td className="px-4 py-3 font-mono font-bold">{fmtUSD(c.earned_usd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CommissionsTab({ data }) {
  const monthly = data.monthly || [];
  const flat = data.commissions || [];
  return (
    <div className="space-y-6" data-testid="commissions-section">
      <div>
        <div className="text-[10px] font-bold tracking-[0.22em] uppercase text-neutral-600 mb-2 flex items-center gap-2">
          <Calendar size={12} /> Monthly summary
        </div>
        {monthly.length === 0 ? (
          <div className="border-2 border-dashed border-neutral-400 p-8 text-center text-neutral-600">
            No commission activity yet.
          </div>
        ) : (
          <div className="border-2 border-black bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100 border-b-2 border-black">
                <tr>
                  {["Month", "Invoices", "Gross payments", "Commission earned", "Paid", "Pending"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-bold tracking-[0.22em] uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthly.map((m) => (
                  <tr key={m.month} className="border-b border-neutral-200" data-testid={`monthly-row-${m.month}`}>
                    <td className="px-4 py-3 font-bold">{monthLabel(m.month)}</td>
                    <td className="px-4 py-3 font-mono">{m.invoices}</td>
                    <td className="px-4 py-3 font-mono">{fmtUSD(m.gross_payments_usd)}</td>
                    <td className="px-4 py-3 font-mono font-bold">{fmtUSD(m.commission_usd)}</td>
                    <td className="px-4 py-3 font-mono">{fmtUSD(m.paid_usd)}</td>
                    <td className="px-4 py-3 font-mono">{fmtUSD(m.accrued_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="text-[10px] font-bold tracking-[0.22em] uppercase text-neutral-600 mb-2">All commissions</div>
        {flat.length === 0 ? (
          <div className="border-2 border-dashed border-neutral-400 p-6 text-center text-neutral-600 text-sm">
            Individual commissions will appear here once your referrals start paying.
          </div>
        ) : (
          <div className="border-2 border-black bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100 border-b-2 border-black">
                <tr>
                  {["Date", "Customer", "Invoice payment", "Commission (15%)", "Month", "Status"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-bold tracking-[0.22em] uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {flat.map((c) => (
                  <tr key={c.id} className="border-b border-neutral-200" data-testid={`commission-row-${c.id}`}>
                    <td className="px-4 py-3 font-mono text-xs">{fmtDate(c.paid_at)}</td>
                    <td className="px-4 py-3">{c.business_name || "—"}</td>
                    <td className="px-4 py-3 font-mono">{fmtUSD(c.payment_amount_usd)}</td>
                    <td className="px-4 py-3 font-mono font-bold">{fmtUSD(c.commission_amount_usd)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{c.commission_month}</td>
                    <td className="px-4 py-3"><Pill tone={c.status === "paid" ? "paid" : "accrued"}>{c.status}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function PayoutsTab({ payouts }) {
  if (!payouts || payouts.length === 0) {
    return (
      <div className="border-2 border-dashed border-neutral-400 p-10 text-center text-neutral-600" data-testid="payouts-empty">
        No payouts yet. Earnings from each month are wired at the start of the next month.
      </div>
    );
  }
  return (
    <div className="border-2 border-black bg-white overflow-x-auto" data-testid="payouts-table">
      <table className="w-full text-sm">
        <thead className="bg-neutral-100 border-b-2 border-black">
          <tr>
            {["Paid on", "Period", "Amount", "Method", "Status", "Reference"].map((h) => (
              <th key={h} className="text-left px-4 py-3 text-[10px] font-bold tracking-[0.22em] uppercase">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {payouts.map((p) => (
            <tr key={p.id} className="border-b border-neutral-200">
              <td className="px-4 py-3 font-mono text-xs">{fmtDate(p.paid_at)}</td>
              <td className="px-4 py-3 font-mono text-xs">{p.period_start || "—"} → {p.period_end || "—"}</td>
              <td className="px-4 py-3 font-mono font-bold">{fmtUSD(p.amount)}</td>
              <td className="px-4 py-3">{p.payout_method || "Wire (USD)"}</td>
              <td className="px-4 py-3"><Pill tone={p.status === "paid" ? "paid" : "neutral"}>{p.status || "—"}</Pill></td>
              <td className="px-4 py-3 font-mono text-xs">{p.reference || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BankTab({ bank, onSaved }) {
  const empty = {
    account_holder: "", account_number: "", bank_name: "",
    swift_or_routing: "", iban: "", country: "", address: "",
  };
  const [form, setForm] = useState(bank ? { ...empty, ...bank } : empty);
  const [saving, setSaving] = useState(false);
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/referrals/bank-account", {
        account_holder: form.account_holder,
        account_number: form.account_number,
        bank_name: form.bank_name,
        swift_or_routing: form.swift_or_routing || "",
        iban: form.iban || "",
        country: form.country,
        address: form.address || "",
      });
      toast.success("Bank account saved");
      onSaved && onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not save");
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="border-2 border-black bg-white p-6 space-y-4 max-w-3xl" data-testid="bank-form">
      <div className="flex items-center gap-2">
        <CreditCard size={18} />
        <div className="font-display font-black text-xl">Bank account for payouts</div>
      </div>
      <div className="border-2 border-black bg-amber-100 p-3 text-xs">
        All commission payouts are made in <strong>USD</strong>. Make sure your account can receive USD wires.
        For international banks, IBAN + SWIFT are recommended; US banks use Account # + Routing.
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {[
          { k: "account_holder", label: "Account holder *", tid: "bank-account-holder", required: true },
          { k: "bank_name",      label: "Bank name *", tid: "bank-bank-name", required: true },
          { k: "account_number", label: "Account number *", tid: "bank-account-number", required: true },
          { k: "swift_or_routing", label: "SWIFT / BIC / Routing", tid: "bank-swift" },
          { k: "iban",           label: "IBAN (if applicable)", tid: "bank-iban" },
          { k: "country",        label: "Bank country *", tid: "bank-country", required: true },
        ].map((f) => (
          <div key={f.k}>
            <label className="text-xs font-bold tracking-widest uppercase">{f.label}</label>
            <input
              data-testid={f.tid}
              required={!!f.required}
              className="w-full mt-1 border-2 border-black px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-[#002FA7]"
              value={form[f.k] || ""}
              onChange={upd(f.k)}
            />
          </div>
        ))}
      </div>
      <div>
        <label className="text-xs font-bold tracking-widest uppercase">Bank / branch address</label>
        <textarea
          data-testid="bank-address"
          rows={3}
          className="w-full mt-1 border-2 border-black px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-[#002FA7]"
          value={form.address || ""}
          onChange={upd("address")}
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        data-testid="bank-save-btn"
        className="bg-[#002FA7] text-white font-bold px-5 py-2 border-2 border-black shadow-brutal hover-lift disabled:opacity-60"
      >
        {saving ? "Saving…" : bank ? "Update bank account" : "Save bank account"}
      </button>
    </form>
  );
}
