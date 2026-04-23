import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ExternalLink, Search, Crown } from "lucide-react";

export default function AdminBilling() {
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const load = async () => {
    const r = await api.get("/admin/billing");
    setData(r.data);
  };
  useEffect(() => { load(); }, []);

  if (!data) return <div className="p-10 font-mono text-sm">Loading…</div>;
  const rows = data.vendors.filter(v => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (v.name || "").toLowerCase().includes(s) ||
      (v.email || "").toLowerCase().includes(s) ||
      (v.plan || "").toLowerCase().includes(s) ||
      (v.subscription_status || "").toLowerCase().includes(s);
  });
  const statusColor = (s) => ({
    active: "bg-green-400 text-black",
    trialing: "bg-yellow-300 text-black",
    past_due: "bg-red-500 text-white",
    canceled: "bg-neutral-300 text-black",
    exempt: "bg-amber-300 text-black",
  }[s] || "bg-neutral-200 text-black");

  return (
    <div className="p-8 space-y-6" data-testid="admin-billing-page">
      <div>
        <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">Admin · Billing</div>
        <h1 className="font-display text-4xl font-black tracking-tighter">Every dollar, every vendor.</h1>
      </div>

      <div className="grid md:grid-cols-5 gap-4">
        <div className="border-2 border-black bg-white p-4" data-testid="summary-mrr">
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600">MRR</div>
          <div className="font-display font-black text-3xl mt-2">${data.summary.mrr_usd}</div>
        </div>
        <div className="border-2 border-black bg-white p-4" data-testid="summary-arr">
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600">ARR</div>
          <div className="font-display font-black text-3xl mt-2">${data.summary.arr_usd.toLocaleString()}</div>
        </div>
        <div className="border-2 border-black bg-white p-4">
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600">Active subs</div>
          <div className="font-display font-black text-3xl mt-2">{data.summary.active_subscriptions}</div>
        </div>
        <div className="border-2 border-black bg-white p-4">
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600">Trialing</div>
          <div className="font-display font-black text-3xl mt-2">{data.summary.trialing}</div>
        </div>
        <div className="border-2 border-black bg-white p-4">
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600">Total vendors</div>
          <div className="font-display font-black text-3xl mt-2">{data.summary.total_vendors}</div>
        </div>
      </div>

      <div className="flex items-center border-2 border-black bg-white">
        <Search size={16} className="ml-3"/>
        <input
          data-testid="admin-billing-search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search name, email, plan, status…"
          className="flex-1 px-3 py-3 font-mono text-sm outline-none"
        />
      </div>

      <div className="overflow-x-auto border-2 border-black bg-white">
        <table className="w-full text-sm">
          <thead className="bg-black text-white text-left">
            <tr>
              <th className="px-3 py-2">Vendor</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">MRR</th>
              <th className="px-3 py-2">Balance</th>
              <th className="px-3 py-2">Total spent</th>
              <th className="px-3 py-2">Renewal</th>
              <th className="px-3 py-2">Stripe</th>
            </tr>
          </thead>
          <tbody className="font-mono text-xs">
            {rows.map(v => (
              <tr key={v.vendor_id} className="border-t border-black/20 align-top" data-testid={`admin-row-${v.vendor_id}`}>
                <td className="px-3 py-2">
                  <div className="font-display font-bold text-sm flex items-center gap-1">
                    {v.is_exempt && <Crown size={12} className="text-amber-500"/>}
                    {v.name}
                  </div>
                  <div className="text-[10px] opacity-70">{v.email}</div>
                </td>
                <td className="px-3 py-2">{v.owner || "—"}</td>
                <td className="px-3 py-2 uppercase">{v.plan}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block px-2 py-0.5 border border-black text-[10px] font-bold uppercase tracking-widest ${statusColor(v.subscription_status)}`}>
                    {v.subscription_status}
                  </span>
                </td>
                <td className="px-3 py-2">${v.plan_price_usd}</td>
                <td className="px-3 py-2">
                  {v.is_exempt ? <span className="text-amber-700">∞</span> : (
                    <>
                      <div>{Math.round(v.minutes_balance)} min</div>
                      <div>{v.messages_balance.toLocaleString()} msg</div>
                    </>
                  )}
                </td>
                <td className="px-3 py-2">${v.total_spent_usd}</td>
                <td className="px-3 py-2">
                  {v.subscription_status === "active" && v.current_period_end
                    ? new Date(v.current_period_end).toLocaleDateString()
                    : v.trial_ends_at
                    ? <span>trial<br/>{new Date(v.trial_ends_at).toLocaleDateString()}</span>
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  {v.stripe_customer_id ? (
                    <a
                      href={`https://dashboard.stripe.com/test/customers/${v.stripe_customer_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline inline-flex items-center gap-1"
                    >
                      {v.stripe_customer_id.slice(0, 12)}… <ExternalLink size={10}/>
                    </a>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
