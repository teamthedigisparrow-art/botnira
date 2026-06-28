import { useEffect, useState } from "react";
import { Outlet, NavLink, Link, useNavigate } from "react-router-dom";
import { Inbox, Bot, Cable, CalendarDays, BarChart3, Settings as SettingsIcon, LogOut, LayoutDashboard, CreditCard, PanelLeftClose, PanelLeftOpen, Megaphone, Gift, Menu, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import PaywallGuard from "../components/PaywallGuard";
import BrandMark from "../components/BrandMark";

const links = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, end: true, tid: "nav-overview" },
  { to: "/app/inbox", label: "Inbox", icon: Inbox, tid: "nav-inbox" },
  { to: "/app/bot", label: "Bot Studio", icon: Bot, tid: "nav-bot" },
  { to: "/app/channels", label: "Channels", icon: Cable, tid: "nav-channels" },
  { to: "/app/appointments", label: "Appointments", icon: CalendarDays, tid: "nav-appointments" },
  { to: "/app/sales", label: "Sales Assistant", icon: Megaphone, tid: "nav-sales" },
  { to: "/app/analytics", label: "Analytics", icon: BarChart3, tid: "nav-analytics" },
  { to: "/app/billing", label: "Billing", icon: CreditCard, tid: "nav-billing" },
  { to: "/app/settings", label: "Settings", icon: SettingsIcon, tid: "nav-settings" },
  { to: "/app/referrals", label: "Referrals", icon: Gift, tid: "nav-referrals" },
];

const STORAGE_KEY = "botnira.vendor.sidebar.collapsed";

export default function VendorLayout() {
  const { vendor, user, access, logout } = useAuth();
  const nav = useNavigate();

  // Persist collapsed state across reloads — many vendors prefer the slim
  // sidebar permanently once they discover it.
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0"); } catch { /* ignore */ }
  }, [collapsed]);

  // Mobile slide-out drawer state
  const [mobileOpen, setMobileOpen] = useState(false);

  // Collapse only applies on desktop; the mobile drawer is always full-width.
  const [isDesktop, setIsDesktop] = useState(() => {
    try { return window.matchMedia("(min-width: 768px)").matches; } catch { return true; }
  });
  useEffect(() => {
    const m = window.matchMedia("(min-width: 768px)");
    const h = (e) => setIsDesktop(e.matches);
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, []);

  const effCollapsed = isDesktop ? collapsed : false;
  const sidebarWidth = collapsed ? "64px" : "260px";

  return (
    <div
      className="min-h-screen md:grid"
      style={{ gridTemplateColumns: `${sidebarWidth} 1fr` }}
      data-testid="vendor-shell"
    >
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-[55] h-14 bg-white border-b-2 border-black flex items-center justify-between px-4">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-1 text-black"
          data-testid="vendor-mobile-menu-btn"
          aria-label="Open menu"
        >
          <Menu size={24} />
        </button>
        <Link to="/app" className="flex items-center gap-2" title="BotNira">
          <BrandMark size={24} />
          <span className="font-display font-black text-lg">BotNira</span>
        </Link>
        <button
          onClick={() => { logout(); nav("/"); }}
          className="p-1 text-black"
          data-testid="vendor-mobile-logout"
          aria-label="Log out"
        >
          <LogOut size={20} />
        </button>
      </header>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="md:hidden fixed inset-0 bg-black/50 z-[65]"
          data-testid="vendor-mobile-overlay"
        />
      )}

      <aside
        className={`border-r-2 border-black bg-white flex flex-col fixed inset-y-0 left-0 w-[260px] z-[70] transition-transform duration-200 md:static md:z-[60] md:translate-x-0 md:w-auto ${mobileOpen ? "translate-x-0" : "-translate-x-full"} ${effCollapsed ? "md:items-center" : ""}`}
        data-testid="vendor-sidebar"
        data-collapsed={effCollapsed ? "1" : "0"}
      >
        {/* Brand row + collapse toggle */}
        <div className={`h-16 border-b-2 border-black flex items-center ${effCollapsed ? "justify-center px-0" : "px-5 justify-between"}`}>
          <Link to="/app" onClick={() => setMobileOpen(false)} className="flex items-center gap-2" data-testid="vendor-brand" title="BotNira">
            <BrandMark size={28} />
            {!effCollapsed && <span className="font-display font-black text-lg">BotNira</span>}
          </Link>
          {!effCollapsed && (
            <>
              {/* Desktop collapse */}
              <button
                onClick={() => setCollapsed(true)}
                className="hidden md:block text-neutral-600 hover:text-black p-1"
                data-testid="sidebar-collapse-btn"
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose size={18} />
              </button>
              {/* Mobile close */}
              <button
                onClick={() => setMobileOpen(false)}
                className="md:hidden text-neutral-600 hover:text-black p-1"
                data-testid="vendor-mobile-close"
                aria-label="Close menu"
              >
                <X size={22} />
              </button>
            </>
          )}
        </div>

        {/* Workspace block hidden when collapsed (purely informational) */}
        {!effCollapsed && (
          <div className="px-5 py-4 border-b-2 border-black">
            <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-neutral-500">Workspace</div>
            <div className="font-display font-bold truncate" data-testid="vendor-name-display">{vendor?.name || "—"}</div>
            {access?.trial && !access?.is_exempt && (
              <Link to="/app/billing" onClick={() => setMobileOpen(false)} data-testid="sidebar-trial-pill" className="mt-2 inline-block text-[10px] font-bold uppercase tracking-widest bg-yellow-300 border border-black px-2 py-0.5">
                Trial · {access.trial_days_left}d left
              </Link>
            )}
            {access?.is_exempt && (
              <span className="mt-2 inline-block text-[10px] font-bold uppercase tracking-widest bg-amber-300 border border-black px-2 py-0.5">⚡ Exempt</span>
            )}
          </div>
        )}

        {/* Expand handle when collapsed (desktop only) */}
        {effCollapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="my-3 text-neutral-600 hover:text-black p-1"
            data-testid="sidebar-expand-btn"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen size={18} />
          </button>
        )}

        <nav className={`flex-1 overflow-y-auto ${effCollapsed ? "p-2 space-y-1 w-full" : "p-3 space-y-1"}`}>
          {links.map(l => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              onClick={() => setMobileOpen(false)}
              data-testid={l.tid}
              title={effCollapsed ? l.label : undefined}
              aria-label={effCollapsed ? l.label : undefined}
              className={({isActive}) =>
                `${effCollapsed ? "flex items-center justify-center px-2 py-2.5" : "flex items-center gap-3 px-3 py-2"} text-sm font-bold border-2 ${isActive ? "bg-[#002FA7] text-white border-black" : "border-transparent hover:border-black"}`
              }
            >
              <l.icon size={effCollapsed ? 18 : 16} />
              {!effCollapsed && <span>{l.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className={`border-t-2 border-black ${effCollapsed ? "p-2 w-full" : "p-3"}`}>
          {!effCollapsed && (
            <div className="text-xs font-mono truncate" data-testid="vendor-user-email">{user?.email}</div>
          )}
          <button
            onClick={() => { logout(); nav("/"); }}
            data-testid="vendor-logout"
            title={effCollapsed ? "Log out" : undefined}
            className={`${effCollapsed ? "flex items-center justify-center px-2 py-2.5 w-full" : "mt-2 w-full text-sm font-bold flex items-center gap-2 px-3 py-2"} border-2 border-black hover-lift`}
          >
            <LogOut size={14} />
            {!effCollapsed && <span className="text-sm font-bold">Log out</span>}
          </button>
        </div>
      </aside>
      <main className="bg-neutral-50 min-h-screen min-w-0" data-testid="vendor-main">
        <PaywallGuard>
          <Outlet />
        </PaywallGuard>
      </main>
    </div>
  );
}
