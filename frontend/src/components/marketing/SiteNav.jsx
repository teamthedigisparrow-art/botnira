import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import BrandMark from "../BrandMark";

/**
 * Shared sticky top navigation across all marketing pages (Landing,
 * Referrals, future SEO pages). Hash links are absolute (`/#features`) so
 * they jump back to the home page from /referrals.
 */
export default function SiteNav({ activeReferrals = false }) {
  return (
    <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b-2 border-black" data-testid="main-nav">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2" data-testid="brand-logo">
          <BrandMark size={32} />
          <span className="font-display font-black text-xl tracking-tight">BotNira</span>
        </Link>
        <div className="hidden lg:flex items-center gap-7 text-sm font-medium">
          <Link to="/#features" className="hover:text-[#002FA7]" data-testid="nav-features">Features</Link>
          <Link to="/#channels" className="hover:text-[#002FA7]" data-testid="nav-channels">Channels</Link>
          <Link to="/#how" className="hover:text-[#002FA7]" data-testid="nav-how">How it works</Link>
          <Link to="/#try" className="hover:text-[#002FA7]" data-testid="nav-try">Try live</Link>
          <Link to="/#usecases" className="hover:text-[#002FA7]" data-testid="nav-usecases">Use cases</Link>
          <Link to="/#pricing" className="hover:text-[#002FA7]" data-testid="nav-pricing">Pricing</Link>
          <Link
            to="/referrals"
            data-testid="nav-referrals-page"
            className={`hover:text-[#002FA7] inline-flex items-center gap-1 ${activeReferrals ? "text-[#002FA7] font-bold underline underline-offset-4" : ""}`}
          >
            Referrals
            <span className="text-[9px] font-bold uppercase tracking-widest bg-yellow-300 border border-black px-1 leading-tight">earn 15%</span>
          </Link>
          <Link to="/#faq" className="hover:text-[#002FA7]" data-testid="nav-faq">FAQ</Link>
          <Link to="/#contact" className="hover:text-[#002FA7]" data-testid="nav-contact">Contact</Link>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm font-bold hover:underline" data-testid="nav-login">Log in</Link>
          <Link
            to="/signup"
            data-testid="nav-signup"
            className="inline-flex items-center gap-2 bg-[#002FA7] text-white font-bold text-sm px-4 py-2 border-2 border-black shadow-brutal hover-lift"
          >
            Get started <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </nav>
  );
}
