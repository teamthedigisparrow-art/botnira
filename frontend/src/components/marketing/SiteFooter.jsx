import { Link } from "react-router-dom";
import BrandMark from "../BrandMark";
import SocialIcons from "./SocialIcons";
import { USE_CASE_PAGES } from "../../data/useCases";

/** Shared footer for all marketing pages. */
export default function SiteFooter() {
  return (
    <footer className="bg-black text-white" data-testid="landing-footer">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid sm:grid-cols-2 md:grid-cols-4 gap-8">
        <div className="md:col-span-1">
          <div className="flex items-center gap-3">
            <BrandMark size={32} />
            <span className="font-display font-black text-2xl tracking-tighter">BotNira</span>
          </div>
          <p className="mt-3 text-sm opacity-70 leading-relaxed">
            AI receptionist &amp; AI calling software for every business. Voice, WhatsApp, SMS, email and chat — answered 24/7.
          </p>
          <div className="mt-5">
            <div className="text-[10px] font-bold tracking-[0.25em] uppercase opacity-60 mb-2">Follow us</div>
            <SocialIcons variant="dark" size={16} />
          </div>
        </div>
        <div>
          <div className="font-display font-bold text-xs uppercase tracking-widest opacity-60">Use cases</div>
          <ul className="mt-3 space-y-1.5 text-sm opacity-90">
            {USE_CASE_PAGES.slice(0, 5).map((u) => (
              <li key={u.slug}>
                <Link to={`/use-case/${u.slug}`} className="hover:underline" data-testid={`footer-usecase-${u.slug}`}>
                  AI for {u.industry}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="font-display font-bold text-xs uppercase tracking-widest opacity-60">Product</div>
          <ul className="mt-3 space-y-1.5 text-sm opacity-90">
            <li><Link to="/#features" className="hover:underline">Features</Link></li>
            <li><Link to="/#channels" className="hover:underline">Channels</Link></li>
            <li><Link to="/#pricing" className="hover:underline">Pricing</Link></li>
            <li><Link to="/referrals" className="hover:underline" data-testid="footer-referrals">Referrals · earn 15%</Link></li>
            <li><Link to="/blog" className="hover:underline" data-testid="footer-blog">Blog</Link></li>
            <li><Link to="/#faq" className="hover:underline">FAQ</Link></li>
            <li><Link to="/#contact" className="hover:underline">Contact</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-display font-bold text-xs uppercase tracking-widest opacity-60">Company</div>
          <ul className="mt-3 space-y-1.5 text-sm opacity-90">
            <li><Link to="/login" className="hover:underline">Log in</Link></li>
            <li><Link to="/team" className="hover:underline" data-testid="footer-team">Team</Link></li>
            <li><Link to="/signup" className="hover:underline">Start free trial</Link></li>
            <li><Link to="/privacy" className="hover:underline" data-testid="footer-privacy">Privacy</Link></li>
            <li><Link to="/terms" className="hover:underline" data-testid="footer-terms">Terms</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap justify-between items-center gap-3 text-xs font-mono opacity-60">
          <span>© 2026 BotNira · AI Receptionist &amp; AI Calling Software · All rights reserved by THE DIGISPARROW, Hamilton, ON, Canada.</span>
          <span>Built for front desks that sleep.</span>
        </div>
      </div>
    </footer>
  );
}
