import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { MessageSquare, CheckCircle2, CalendarDays, MessagesSquare } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { Link } from "react-router-dom";

const Stat = ({ icon: Icon, label, value, tid }) => (
  <div className="border-2 border-black bg-white p-5 shadow-brutal" data-testid={tid}>
    <div className="flex items-center justify-between">
      <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600">{label}</div>
      <Icon size={18} />
    </div>
    <div className="font-display font-black text-4xl tracking-tighter mt-2">{value}</div>
  </div>
);

export default function Overview() {
  const [data, setData] = useState(null);
  const { vendor } = useAuth();
  useEffect(() => { api.get("/analytics").then(r => setData(r.data)).catch(()=>{}); }, []);
  const t = data?.totals || { conversations: 0, resolved: 0, appointments: 0, messages: 0, resolution_rate: 0 };
  return (
    <div className="p-8" data-testid="overview-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">Workspace</div>
          <h1 className="font-display text-4xl font-black tracking-tighter">{vendor?.name || "Dashboard"}</h1>
          <p className="text-sm text-neutral-600 mt-1">Here's what your AI receptionist did.</p>
        </div>
        <Link to="/app/bot" data-testid="overview-train-btn" className="bg-[#002FA7] text-white font-bold px-4 py-2 border-2 border-black shadow-brutal hover-lift">Train your bot</Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
        <Stat icon={MessagesSquare} label="Conversations" value={t.conversations} tid="stat-conversations" />
        <Stat icon={CheckCircle2} label="Resolution rate" value={`${t.resolution_rate}%`} tid="stat-resolution" />
        <Stat icon={CalendarDays} label="Appointments" value={t.appointments} tid="stat-appointments" />
        <Stat icon={MessageSquare} label="Messages" value={t.messages} tid="stat-messages" />
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <div className="border-2 border-black bg-white p-6">
          <div className="text-xs font-bold tracking-[0.2em] uppercase">By channel</div>
          <div className="mt-4 space-y-2">
            {(data?.by_channel || []).map(c => (
              <div key={c.channel} className="flex items-center justify-between border-b border-black/10 py-2" data-testid={`overview-ch-${c.channel}`}>
                <span className="badge">{c.channel}</span>
                <span className="font-mono font-bold">{c.count}</span>
              </div>
            ))}
            {(!data?.by_channel || data.by_channel.length === 0) && <div className="text-sm text-neutral-500">No conversations yet. Try a live chat from the Bot Studio.</div>}
          </div>
        </div>
        <div className="border-2 border-black bg-[#002FA7] text-white p-6">
          <div className="text-xs font-bold tracking-[0.2em] uppercase opacity-80">Next steps</div>
          <ul className="mt-4 space-y-3 text-sm font-medium">
            <li>→ <Link to="/app/bot" data-testid="overview-link-bot" className="underline">Paste your business description and FAQs</Link></li>
            <li>→ <Link to="/app/channels" data-testid="overview-link-channels" className="underline">Connect WhatsApp, email and SMS channels</Link></li>
            <li>→ <Link to="/app/inbox" data-testid="overview-link-inbox" className="underline">Watch conversations land in the unified inbox</Link></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
