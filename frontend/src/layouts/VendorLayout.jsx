import { Outlet, NavLink, Link, useNavigate } from "react-router-dom";
import { Inbox, Bot, Cable, CalendarDays, BarChart3, Settings as SettingsIcon, LogOut, LayoutDashboard, CreditCard } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import PaywallGuard from "../components/PaywallGuard";
import BrandMark from "../components/BrandMark";

const links = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, end: true, tid: "nav-overview" },
  { to: "/app/inbox", label: "Inbox", icon: Inbox, tid: "nav-inbox" },
  { to: "/app/bot", label: "Bot Studio", icon: Bot, tid: "nav-bot" },
  { to: "/app/channels", label: "Channels", icon: Cable, tid: "nav-channels" },
  { to: "/app/appointments", label: "Appointments", icon: CalendarDays, tid: "nav-appointments" },
  { to: "/app/analytics", label: "Analytics", icon: BarChart3, tid: "nav-analytics" },
  { to: "/app/billing", label: "Billing", icon: CreditCard, tid: "nav-billing" },
  { to: "/app/settings", label: "Settings", icon: SettingsIcon, tid: "nav-settings" },
];

export default function VendorLayout() {
  const { vendor, user, access, logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className="min-h-screen grid md:grid-cols-[260px_1fr]">
      <aside className="border-r-2 border-black bg-white flex flex-col" data-testid="vendor-sidebar">
        <Link to="/app" className="px-5 h-16 border-b-2 border-black flex items-center gap-2" data-testid="vendor-brand">
          <BrandMark size={28} />
          <span className="font-display font-black text-lg">BotNira</span>
        </Link>
        <div className="px-5 py-4 border-b-2 border-black">
          <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-neutral-500">Workspace</div>
          <div className="font-display font-bold truncate" data-testid="vendor-name-display">{vendor?.name || "—"}</div>
          {access?.trial && !access?.is_exempt && (
            <Link to="/app/billing" data-testid="sidebar-trial-pill" className="mt-2 inline-block text-[10px] font-bold uppercase tracking-widest bg-yellow-300 border border-black px-2 py-0.5">
              Trial · {access.trial_days_left}d left
            </Link>
          )}
          {access?.is_exempt && (
            <span className="mt-2 inline-block text-[10px] font-bold uppercase tracking-widest bg-amber-300 border border-black px-2 py-0.5">⚡ Exempt</span>
          )}
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {links.map(l => (
            <NavLink key={l.to} to={l.to} end={l.end} data-testid={l.tid}
              className={({isActive}) => `flex items-center gap-3 px-3 py-2 text-sm font-bold border-2 ${isActive ? "bg-[#002FA7] text-white border-black" : "border-transparent hover:border-black"}`}>
              <l.icon size={16} /> {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t-2 border-black">
          <div className="text-xs font-mono truncate" data-testid="vendor-user-email">{user?.email}</div>
          <button onClick={() => { logout(); nav("/"); }} data-testid="vendor-logout" className="mt-2 w-full text-sm font-bold border-2 border-black px-3 py-2 flex items-center gap-2 hover-lift">
            <LogOut size={14} /> Log out
          </button>
        </div>
      </aside>
      <main className="bg-neutral-50 min-h-screen" data-testid="vendor-main">
        <PaywallGuard>
          <Outlet />
        </PaywallGuard>
      </main>
    </div>
  );
}
