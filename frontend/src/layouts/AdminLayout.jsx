import { Outlet, NavLink, Link, useNavigate } from "react-router-dom";
import { Building2, BarChart3, LogOut, LayoutDashboard } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const links = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true, tid: "admin-nav-overview" },
  { to: "/admin/vendors", label: "Vendors", icon: Building2, tid: "admin-nav-vendors" },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3, tid: "admin-nav-analytics" },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className="min-h-screen grid md:grid-cols-[260px_1fr]">
      <aside className="border-r-2 border-black bg-black text-white flex flex-col" data-testid="admin-sidebar">
        <Link to="/admin" className="px-5 h-16 border-b-2 border-white/30 flex items-center gap-2" data-testid="admin-brand">
          <div className="w-7 h-7 bg-white border-2 border-white grid place-items-center">
            <span className="text-black font-black text-xs">B</span>
          </div>
          <span className="font-display font-black text-lg">BotNira<span className="text-[#6f8cff]">/admin</span></span>
        </Link>
        <div className="px-5 py-4 border-b-2 border-white/30">
          <div className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-70">Super Admin</div>
          <div className="font-display font-bold truncate">{user?.full_name}</div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {links.map(l => (
            <NavLink key={l.to} to={l.to} end={l.end} data-testid={l.tid}
              className={({isActive}) => `flex items-center gap-3 px-3 py-2 text-sm font-bold border-2 ${isActive ? "bg-white text-black border-white" : "border-transparent hover:border-white"}`}>
              <l.icon size={16} /> {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t-2 border-white/30">
          <div className="text-xs font-mono truncate opacity-70">{user?.email}</div>
          <button onClick={() => { logout(); nav("/"); }} data-testid="admin-logout" className="mt-2 w-full text-sm font-bold border-2 border-white px-3 py-2 flex items-center gap-2 hover:bg-white hover:text-black">
            <LogOut size={14} /> Log out
          </button>
        </div>
      </aside>
      <main className="bg-neutral-50 min-h-screen" data-testid="admin-main"><Outlet /></main>
    </div>
  );
}
