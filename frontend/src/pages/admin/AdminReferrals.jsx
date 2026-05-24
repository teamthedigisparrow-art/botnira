import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import {
  Users, DollarSign, Wallet, Search, X, Landmark, ChevronRight,
  CheckCircle2, AlertTriangle, Copy, Check, Calendar,
} from "lucide-react";

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
    active: "bg-green-200 text-black",
    cancelled: "bg-red-200 text-black",
    paid: "bg-green-200 text-black",
    accrued: "bg-yellow-200 text-black",
    trialing: "bg-yellow-200 text-black",
    canceled: "bg-red-200 text-black",
    past_due: "bg-red-200 text-black",
    neutral: "bg-neutral-200 text-black",
  }[tone] || "bg-neutral-200 text-black";
  return (
    <span className={`text-[10px] font-bold uppercase tracking-widest border border-black px-2 py-0.5 ${palette}`}>
      {children}
    </span>
  );
}

const TABS = [
  { key: "referrers", label: "Referrers", icon: Users },
  { key: "pending",   label: "Pending Payouts", icon: Wallet },
];

export default function AdminReferrals() {
  const [tab, setTab] = useState("referrers");
  const [overview, setOverview] = useState(null);
  const [pending, setPending] = useState({ pending: [], total_pending_usd: 0 });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [drillVendorId, setDrillVendorId] = useState(null);

  const reload = async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        api.get("/admin/referrals/overview"),
        api.get("/admin/referrals/payouts/pending"),
      ]);
      setOverview(r1.data);
      setPending(r2.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not load referral data");
    } finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []);

  const filteredReferrers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = overview?.referrers || [];
    if (!q) return list;
    return list.filter((r) =>
      (r.business_name || "").toLowerCase().includes(q) ||
      (r.contact_email || "").toLowerCase().includes(q) ||
      (r.referral_code || "").toLowerCase().includes(q)
    );
  }, [overview, query]);

  if (loading || !overview) {
    return <div className="p-10 font-mono" data-testid="admin-referrals-loading">Loading referrals…</div>;
  }

  const s = overview.summary;

  return (
    <div className="p-8 space-y-6" data-testid="admin-referrals-page">
      <div>
        <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#6f8cff]">Superadmin</div>
        <h1 className="font-display text-4xl font-black tracking-tighter">Referrals</h1>
        <p className="text-neutral-700 mt-1 max-w-3xl">
          Vendors earning <strong>{s.commission_rate_percent}%</strong> commission on every paid invoice from customers
          they referred. Pay them in USD wires at the end of every month.
        </p>
      </div>

      {/* Global summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          testid="admin-stat-referrers"
          label="Earning Referrers"
          value={s.total_referrers}
          sub={`${s.total_referred_customers} customers referred · ${s.total_active_referred_customers} active`}
        />
        <Stat
          testid="admin-stat-pending"
          label="Owed to Vendors"
          value={fmtUSD(s.global_pending_usd)}
          sub="Pending wire transfers"
          accent="bg-amber-100"
        />
        <Stat
          testid="admin-stat-paid"
          label="Paid to date"
          value={fmtUSD(s.global_paid_usd)}
          sub="Commissions already wired"
          accent="bg-green-100"
        />
        <Stat
          testid="admin-stat-lifetime"
          label="Lifetime commissions"
          value={fmtUSD(s.global_lifetime_usd)}
          sub="Across all referrers"
        />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b-2 border-black pb-2" data-testid="admin-referrals-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            data-testid={`admin-referrals-tab-${t.key}`}
            className={`text-sm font-bold border-2 border-black px-3 py-1.5 flex items-center gap-2 ${
              tab === t.key ? "bg-black text-white" : "bg-white hover:bg-neutral-100"
            }`}
          >
            <t.icon size={14} />
            {t.label}
            {t.key === "pending" && (pending.pending?.length || 0) > 0 && (
              <span className="ml-1 inline-flex items-center justify-center bg-amber-300 text-black text-[10px] font-mono font-bold border border-black px-1.5 rounded">
                {pending.pending.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "referrers" && (
        <ReferrersTab
          referrers={filteredReferrers}
          totalCount={(overview.referrers || []).length}
          query={query}
          setQuery={setQuery}
          onOpenVendor={setDrillVendorId}
        />
      )}
      {tab === "pending" && (
        <PendingPayoutsTab
          rows={pending.pending}
          total={pending.total_pending_usd}
          onOpenVendor={setDrillVendorId}
          onRefresh={reload}
        />
      )}

      {drillVendorId && (
        <VendorDrillModal
          vendorId={drillVendorId}
          onClose={() => setDrillVendorId(null)}
          onPayoutRecorded={reload}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tabs                                                                       */
/* -------------------------------------------------------------------------- */

function ReferrersTab({ referrers, totalCount, query, setQuery, onOpenVendor }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 max-w-md border-2 border-black bg-white px-3 py-2">
        <Search size={14} />
        <input
          data-testid="admin-referrers-search"
          className="flex-1 outline-none font-medium text-sm"
          placeholder="Search by business, email or code…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button onClick={() => setQuery("")} aria-label="Clear search">
            <X size={14} />
          </button>
        )}
      </div>

      {referrers.length === 0 ? (
        <div className="border-2 border-dashed border-neutral-400 p-10 text-center text-neutral-600" data-testid="admin-referrers-empty">
          {totalCount === 0
            ? "No vendor has referred a customer yet."
            : "No referrers match your search."}
        </div>
      ) : (
        <div className="border-2 border-black bg-white overflow-x-auto" data-testid="admin-referrers-table">
          <table className="w-full text-sm">
            <thead className="bg-neutral-100 border-b-2 border-black">
              <tr>
                {["Business", "Code", "Customers", "Pending", "Paid", "Lifetime", "Bank", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-bold tracking-[0.22em] uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {referrers.map((r) => (
                <tr
                  key={r.vendor_id}
                  className="border-b border-neutral-200 hover:bg-neutral-50 cursor-pointer"
                  onClick={() => onOpenVendor(r.vendor_id)}
                  data-testid={`admin-referrer-row-${r.vendor_id}`}
                >
                  <td className="px-4 py-3">
                    <div className="font-display font-bold">{r.business_name || "—"}</div>
                    <div className="text-xs text-neutral-600">{r.contact_email}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{r.referral_code}</td>
                  <td className="px-4 py-3 font-mono">
                    {r.total_customers} <span className="text-xs text-neutral-500">({r.active_customers} active)</span>
                  </td>
                  <td className="px-4 py-3 font-mono font-bold">
                    {r.pending_usd > 0 ? (
                      <span className="bg-amber-200 px-2 py-0.5 border border-black">{fmtUSD(r.pending_usd)}</span>
                    ) : (
                      <span className="text-neutral-400">{fmtUSD(0)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono">{fmtUSD(r.paid_usd)}</td>
                  <td className="px-4 py-3 font-mono">{fmtUSD(r.lifetime_usd)}</td>
                  <td className="px-4 py-3">
                    {r.bank_on_file
                      ? <Pill tone="active">on file</Pill>
                      : <Pill tone="cancelled">missing</Pill>}
                  </td>
                  <td className="px-4 py-3"><ChevronRight size={16} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PendingPayoutsTab({ rows, total, onOpenVendor, onRefresh }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="border-2 border-dashed border-neutral-400 p-10 text-center text-neutral-600" data-testid="admin-pending-empty">
        Nothing pending. All vendors are paid up.
      </div>
    );
  }
  return (
    <div className="space-y-4" data-testid="admin-pending-section">
      <div className="border-2 border-black bg-amber-100 px-4 py-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <AlertTriangle size={18} />
          <div>
            <div className="font-display font-black text-lg">Action needed: {rows.length} pending payout{rows.length === 1 ? "" : "s"}</div>
            <div className="text-sm">Total owed: <strong>{fmtUSD(total)}</strong></div>
          </div>
        </div>
      </div>

      <div className="border-2 border-black bg-white overflow-x-auto" data-testid="admin-pending-table">
        <table className="w-full text-sm">
          <thead className="bg-neutral-100 border-b-2 border-black">
            <tr>
              {["Business", "Month", "Invoices", "Amount", "Bank", "Oldest", ""].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-[10px] font-bold tracking-[0.22em] uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr
                key={`${p.vendor_id}-${p.month}`}
                className="border-b border-neutral-200 hover:bg-neutral-50 cursor-pointer"
                onClick={() => onOpenVendor(p.vendor_id)}
                data-testid={`admin-pending-row-${p.vendor_id}-${p.month}`}
              >
                <td className="px-4 py-3">
                  <div className="font-display font-bold">{p.business_name || "—"}</div>
                  <div className="text-xs text-neutral-600">{p.contact_email}</div>
                </td>
                <td className="px-4 py-3 font-bold">{monthLabel(p.month)}</td>
                <td className="px-4 py-3 font-mono">{p.commission_count}</td>
                <td className="px-4 py-3 font-mono font-bold">{fmtUSD(p.amount_usd)}</td>
                <td className="px-4 py-3">
                  {p.bank_on_file
                    ? <Pill tone="active">on file</Pill>
                    : <Pill tone="cancelled">missing</Pill>}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{fmtDate(p.oldest_paid_at)}</td>
                <td className="px-4 py-3"><ChevronRight size={16} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-neutral-600">
        Tip: Click any row to open the vendor's referral account, view bank details, and mark the month paid after wiring.
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Vendor drill-down modal                                                    */
/* -------------------------------------------------------------------------- */

function VendorDrillModal({ vendorId, onClose, onPayoutRecorded }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [payoutMonth, setPayoutMonth] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/admin/referrals/vendor/${vendorId}`);
      setData(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load vendor");
      onClose();
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [vendorId]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 p-4 md:p-10 overflow-y-auto" data-testid="admin-drill-modal">
      <div className="max-w-5xl mx-auto bg-white border-2 border-black shadow-brutal-lg">
        <div className="bg-black text-white px-5 py-3 border-b-2 border-black flex items-center justify-between">
          <div className="font-display font-black text-lg">
            {loading ? "Loading…" : data?.vendor?.name || "Vendor"}
          </div>
          <button onClick={onClose} className="hover:opacity-70" data-testid="admin-drill-close" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {loading || !data ? (
          <div className="p-10 font-mono">Loading vendor…</div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Identity + Bank */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="border-2 border-black bg-white p-4">
                <div className="text-[10px] font-bold tracking-[0.22em] uppercase text-neutral-600">Referrer</div>
                <div className="font-display font-bold text-lg mt-1">{data.vendor.name}</div>
                <div className="text-xs font-mono mt-1">{data.owner?.email}</div>
                <div className="text-xs text-neutral-600 mt-2">
                  Code: <span className="font-mono font-bold">{data.referral_code}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4">
                  <Mini label="Lifetime" value={fmtUSD(data.summary.lifetime_earnings_usd)} />
                  <Mini label="Pending" value={fmtUSD(data.summary.pending_earnings_usd)} tone="amber" />
                  <Mini label="Paid" value={fmtUSD(data.summary.paid_earnings_usd)} tone="green" />
                </div>
              </div>
              <BankPanel bank={data.bank_account} />
            </div>

            {/* Monthly breakdown */}
            <Section title="Monthly breakdown" icon={Calendar}>
              {data.monthly.length === 0 ? (
                <Empty>No commission activity yet.</Empty>
              ) : (
                <div className="border-2 border-black bg-white overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-100 border-b-2 border-black">
                      <tr>
                        {["Month", "Invoices", "Gross", "Commission", "Paid", "Pending", ""].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-[10px] font-bold tracking-[0.22em] uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.monthly.map((m) => (
                        <tr key={m.month} className="border-b border-neutral-200" data-testid={`admin-monthly-${m.month}`}>
                          <td className="px-4 py-3 font-bold">{monthLabel(m.month)}</td>
                          <td className="px-4 py-3 font-mono">{m.invoices}</td>
                          <td className="px-4 py-3 font-mono">{fmtUSD(m.gross_payments_usd)}</td>
                          <td className="px-4 py-3 font-mono font-bold">{fmtUSD(m.commission_usd)}</td>
                          <td className="px-4 py-3 font-mono">{fmtUSD(m.paid_usd)}</td>
                          <td className="px-4 py-3 font-mono">
                            {m.accrued_usd > 0
                              ? <span className="bg-amber-200 px-2 py-0.5 border border-black">{fmtUSD(m.accrued_usd)}</span>
                              : fmtUSD(0)}
                          </td>
                          <td className="px-4 py-3">
                            {m.accrued_usd > 0 && (
                              <button
                                onClick={() => setPayoutMonth(m)}
                                className="bg-[#002FA7] text-white font-bold px-3 py-1 border-2 border-black text-xs hover-lift"
                                data-testid={`admin-mark-paid-btn-${m.month}`}
                              >
                                Mark paid
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* Referred customers */}
            <Section title={`Referred customers (${data.customers.length})`} icon={Users}>
              {data.customers.length === 0 ? (
                <Empty>None yet.</Empty>
              ) : (
                <div className="border-2 border-black bg-white overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-100 border-b-2 border-black">
                      <tr>
                        {["Business", "Signed up", "Plan", "Subscription", "Referral", "Earned"].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-[10px] font-bold tracking-[0.22em] uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.customers.map((c) => (
                        <tr key={c.referral_id} className="border-b border-neutral-200">
                          <td className="px-4 py-3">
                            <div className="font-display font-bold">{c.business_name || "—"}</div>
                            <div className="text-xs text-neutral-600">{c.contact_email}</div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">{fmtDate(c.signup_at)}</td>
                          <td className="px-4 py-3"><Pill tone="neutral">{c.plan || "—"}</Pill></td>
                          <td className="px-4 py-3"><Pill tone={c.subscription_status}>{c.subscription_status || "—"}</Pill></td>
                          <td className="px-4 py-3"><Pill tone={c.status === "active" ? "active" : "cancelled"}>{c.status}</Pill></td>
                          <td className="px-4 py-3 font-mono font-bold">{fmtUSD(c.earned_usd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* All commissions */}
            <Section title={`All commissions (${data.commissions.length})`} icon={DollarSign}>
              {data.commissions.length === 0 ? (
                <Empty>No commissions yet.</Empty>
              ) : (
                <div className="border-2 border-black bg-white overflow-x-auto max-h-[360px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-100 border-b-2 border-black sticky top-0">
                      <tr>
                        {["Date", "Customer", "Payment", "Commission", "Month", "Status", "Invoice"].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-[10px] font-bold tracking-[0.22em] uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.commissions.map((c) => (
                        <tr key={c.id} className="border-b border-neutral-200">
                          <td className="px-4 py-3 font-mono text-xs">{fmtDate(c.paid_at)}</td>
                          <td className="px-4 py-3">{c.business_name || "—"}</td>
                          <td className="px-4 py-3 font-mono">{fmtUSD(c.payment_amount_usd)}</td>
                          <td className="px-4 py-3 font-mono font-bold">{fmtUSD(c.commission_amount_usd)}</td>
                          <td className="px-4 py-3 font-mono text-xs">{c.commission_month}</td>
                          <td className="px-4 py-3"><Pill tone={c.status === "paid" ? "paid" : "accrued"}>{c.status}</Pill></td>
                          <td className="px-4 py-3 font-mono text-[10px] truncate max-w-[140px]">{c.stripe_invoice_id || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* Payouts history */}
            <Section title={`Payout history (${data.payouts.length})`} icon={Wallet}>
              {data.payouts.length === 0 ? (
                <Empty>No payouts sent yet.</Empty>
              ) : (
                <div className="border-2 border-black bg-white overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-100 border-b-2 border-black">
                      <tr>
                        {["Paid on", "Month", "Amount", "Invoices", "Method", "Reference"].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-[10px] font-bold tracking-[0.22em] uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.payouts.map((p) => (
                        <tr key={p.id} className="border-b border-neutral-200">
                          <td className="px-4 py-3 font-mono text-xs">{fmtDate(p.paid_at)}</td>
                          <td className="px-4 py-3 font-bold">{monthLabel(p.month)}</td>
                          <td className="px-4 py-3 font-mono font-bold">{fmtUSD(p.amount)}</td>
                          <td className="px-4 py-3 font-mono">{p.commission_count}</td>
                          <td className="px-4 py-3">{p.payout_method}</td>
                          <td className="px-4 py-3 font-mono text-xs">{p.reference || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </div>
        )}
      </div>

      {payoutMonth && (
        <MarkPaidDialog
          vendor={data.vendor}
          bank={data.bank_account}
          month={payoutMonth}
          onClose={() => setPayoutMonth(null)}
          onSuccess={async () => {
            setPayoutMonth(null);
            await load();
            onPayoutRecorded && onPayoutRecorded();
          }}
        />
      )}
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div>
      <div className="text-[10px] font-bold tracking-[0.22em] uppercase text-neutral-600 mb-2 flex items-center gap-2">
        {Icon && <Icon size={12} />} {title}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }) {
  return <div className="border-2 border-dashed border-neutral-400 p-6 text-center text-sm text-neutral-600">{children}</div>;
}

function Mini({ label, value, tone = "neutral" }) {
  const bg = tone === "amber" ? "bg-amber-100" : tone === "green" ? "bg-green-100" : "bg-neutral-50";
  return (
    <div className={`border-2 border-black p-2 ${bg}`}>
      <div className="text-[9px] font-bold tracking-[0.2em] uppercase text-neutral-600">{label}</div>
      <div className="font-mono font-bold text-sm mt-0.5">{value}</div>
    </div>
  );
}

function BankPanel({ bank }) {
  const [copied, setCopied] = useState(null);
  const copy = async (k, v) => {
    if (!v) return;
    try {
      await navigator.clipboard.writeText(String(v));
      setCopied(k);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* ignore */ }
  };

  if (!bank) {
    return (
      <div className="border-2 border-black bg-red-50 p-4" data-testid="admin-drill-bank-missing">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} />
          <div className="font-display font-bold">No bank account on file</div>
        </div>
        <div className="text-xs text-neutral-700 mt-2">
          Vendor must add their USD-receiving bank details on /app/referrals before you can wire them.
        </div>
      </div>
    );
  }
  const rows = [
    ["Account holder", bank.account_holder],
    ["Bank", bank.bank_name],
    ["Account #", bank.account_number],
    ["SWIFT / Routing", bank.swift_or_routing],
    ["IBAN", bank.iban],
    ["Country", bank.country],
    ["Address", bank.address],
  ];
  return (
    <div className="border-2 border-black bg-white p-4" data-testid="admin-drill-bank">
      <div className="flex items-center gap-2 mb-3">
        <Landmark size={16} />
        <div className="font-display font-bold">Bank account (USD)</div>
      </div>
      <div className="space-y-2">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[110px_1fr_24px] items-start gap-2 text-sm">
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-600 pt-0.5">{k}</div>
            <div className="font-mono break-all">{v || <span className="text-neutral-400">—</span>}</div>
            {v && (
              <button onClick={() => copy(k, v)} className="text-neutral-500 hover:text-black" title={`Copy ${k}`} aria-label={`Copy ${k}`}>
                {copied === k ? <Check size={14} /> : <Copy size={14} />}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MarkPaidDialog({ vendor, bank, month, onClose, onSuccess }) {
  const [amount, setAmount] = useState(String(month.accrued_usd));
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState("Wire (USD)");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/admin/referrals/payouts", {
        vendor_id: vendor.id,
        month: month.month,
        amount_usd: Number(amount),
        payout_method: method,
        reference,
        note,
      });
      toast.success(`Marked ${monthLabel(month.month)} as paid`);
      onSuccess();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to record payout");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" data-testid="admin-mark-paid-modal">
      <form onSubmit={submit} className="bg-white border-2 border-black shadow-brutal-lg w-full max-w-lg">
        <div className="bg-[#002FA7] text-white px-5 py-3 border-b-2 border-black flex items-center justify-between">
          <div className="font-display font-black text-lg flex items-center gap-2">
            <CheckCircle2 size={18} /> Mark payout paid
          </div>
          <button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="text-sm text-neutral-700">
            <strong>{vendor.name}</strong> · <strong>{monthLabel(month.month)}</strong> · {month.invoices} invoice{month.invoices === 1 ? "" : "s"}
          </div>
          {!bank && (
            <div className="border-2 border-black bg-red-50 p-3 text-xs flex items-center gap-2">
              <AlertTriangle size={14}/>
              Bank account is missing — confirm with the vendor before sending the wire.
            </div>
          )}
          <div>
            <label className="text-xs font-bold tracking-widest uppercase">Amount (USD) *</label>
            <input
              data-testid="admin-payout-amount"
              required
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full mt-1 border-2 border-black px-3 py-2 font-mono text-lg"
            />
            <div className="text-xs text-neutral-600 mt-1">
              Suggested: {fmtUSD(month.accrued_usd)} (total accrued this month)
            </div>
          </div>
          <div>
            <label className="text-xs font-bold tracking-widest uppercase">Payout method</label>
            <input
              data-testid="admin-payout-method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full mt-1 border-2 border-black px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs font-bold tracking-widest uppercase">Reference / Wire ID</label>
            <input
              data-testid="admin-payout-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. WIRE-2026-05-001"
              className="w-full mt-1 border-2 border-black px-3 py-2 font-mono"
            />
          </div>
          <div>
            <label className="text-xs font-bold tracking-widest uppercase">Note</label>
            <textarea
              data-testid="admin-payout-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full mt-1 border-2 border-black px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="border-2 border-black px-4 py-2 font-bold hover-lift">
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              data-testid="admin-payout-confirm"
              className="bg-[#002FA7] text-white font-bold px-5 py-2 border-2 border-black shadow-brutal hover-lift disabled:opacity-60"
            >
              {busy ? "Saving…" : "Confirm payout"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
