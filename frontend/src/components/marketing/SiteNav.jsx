import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Menu, X } from "lucide-react";
import BrandMark from "../BrandMark";

/**
 * Shared sticky top navigation across all marketing pages. On <lg viewports
 * the inline nav collapses into a hamburger that opens a fullscreen drawer
 * so every menu item stays reachable on mobile and tablet.
 */
export default function SiteNav({ activeReferrals = false }) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();

  // Close the drawer whenever the URL changes (incl. hash navigations).
  useEffect(() => { setOpen(false); }, [loc.pathname, loc.hash]);

  // Lock body scroll while the drawer is open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  const navItems = (
    <>
      <NavLink to="/#features" testid="nav-features">Features</NavLink>
      <NavLink to="/#channels" testid="nav-channels">Channels</NavLink>
      <NavLink to="/#how" testid="nav-how">How it works</NavLink>
      <NavLink to="/#try" testid="nav-try">Try live</NavLink>
      <NavLink to="/#usecases" testid="nav-usecases">Use cases</NavLink>
      <NavLink to="/#pricing" testid="nav-pricing">Pricing</NavLink>
      <Link
        to="/referrals"
        data-testid="nav-referrals-page"
        className={`hover:text-[#002FA7] inline-flex items-center gap-1.5 ${activeReferrals ? "text-[#002FA7] font-bold underline underline-offset-4" : ""}`}
      >
        Referrals
        <span className="text-[9px] font-bold uppercase tracking-widest bg-yellow-300 border border-black px-1 leading-tight">earn 15%</span>
      </Link>
      <Link to="/blog" data-testid="nav-blog" className="hover:text-[#002FA7]">Blog</Link>
      <NavLink to="/#faq" testid="nav-faq">FAQ</NavLink>
      <NavLink to="/#contact" testid="nav-contact">Contact</NavLink>
    </>
  );

  return (
    <>
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b-2 border-black" data-testid="main-nav">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 shrink-0" data-testid="brand-logo" onClick={() => setOpen(false)}>
            <BrandMark size={32} />
            <span className="font-display font-black text-xl tracking-tight">BotNira</span>
          </Link>

          {/* Desktop inline nav — only at xl+ (10+ items don't fit at lg) */}
          <div className="hidden xl:flex items-center gap-6 text-sm font-medium">
            {navItems}
          </div>

          {/* Desktop CTAs */}
          <div className="hidden sm:flex items-center gap-3 shrink-0">
            <Link to="/login" className="text-sm font-bold hover:underline" data-testid="nav-login">Log in</Link>
            <Link
              to="/signup"
              data-testid="nav-signup"
              className="inline-flex items-center gap-2 bg-[#002FA7] text-white font-bold text-sm px-4 py-2 border-2 border-black shadow-brutal hover-lift"
            >
              Get started <ArrowRight size={16} />
            </Link>
          </div>

          {/* Mobile/tablet hamburger trigger — below xl */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            data-testid="nav-mobile-toggle"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="xl:hidden p-2 border-2 border-black bg-white shadow-brutal"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </nav>

      {/* Mobile fullscreen drawer */}
      {open && (
        <div
          className="fixed inset-0 top-16 z-40 bg-white border-t-2 border-black overflow-y-auto xl:hidden"
          data-testid="nav-mobile-drawer"
        >
          <div className="px-5 py-6 flex flex-col gap-4 text-base font-medium">
            {navItems}
            <div className="border-t-2 border-black pt-4 mt-2 flex flex-col gap-3">
              <Link
                to="/login"
                className="text-center border-2 border-black bg-white font-bold py-2.5"
                data-testid="nav-login-mobile"
              >
                Log in
              </Link>
              <Link
                to="/signup"
                data-testid="nav-signup-mobile"
                className="text-center inline-flex items-center justify-center gap-2 bg-[#002FA7] text-white font-bold py-2.5 border-2 border-black shadow-brutal"
              >
                Get started <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function NavLink({ to, children, testid }) {
  return (
    <Link to={to} data-testid={testid} className="hover:text-[#002FA7]">
      {children}
    </Link>
  );
}
