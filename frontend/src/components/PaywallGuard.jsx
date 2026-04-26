import { useAuth } from "../contexts/AuthContext";
import { Link, useLocation } from "react-router-dom";
import { Lock, Sparkles } from "lucide-react";

/**
 * Full-page paywall shown after trial expires (or on locked-access accounts).
 * Lets the user navigate only to /app/billing or logout.
 */
export default function PaywallGuard({ children }) {
  const { access, vendor } = useAuth();
  const loc = useLocation();
  const paywall = access?.paywall && !access?.is_exempt;

  // Always allow billing page itself
  if (!paywall || loc.pathname.startsWith("/app/billing")) {
    return children;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6" data-testid="paywall-overlay">
      <div className="max-w-xl w-full border-2 border-black bg-white shadow-brutal-lg">
        <div className="bg-[#002FA7] text-white px-6 py-4 border-b-2 border-black flex items-center gap-3">
          <Lock size={22} />
          <div className="font-display font-black text-2xl">Your trial has ended</div>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-neutral-800">
            Welcome back to <strong>{vendor?.name || "BotNira"}</strong>. Your 5-day free trial has ended.
            To keep your AI receptionist answering customers across <strong>web, WhatsApp, voice, email and SMS</strong>, please subscribe.
          </p>
          <div className="border-2 border-black p-4 bg-red-50 text-sm">
            <div className="font-display font-bold text-red-800">Right now, all customer channels are paused</div>
            <div className="mt-1 text-neutral-700">
              The web widget on your site, your WhatsApp number, voice line, email and SMS are all returning "trial ended" until you pick a plan.
            </div>
          </div>
          <div className="border-2 border-black p-4 bg-amber-50 text-sm">
            <div className="font-display font-bold flex items-center gap-2"><Sparkles size={14}/> What you get</div>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>All 5 channels unlocked</li>
              <li>Voice minutes + AI messages included each month</li>
              <li>Top-up packs never expire</li>
            </ul>
          </div>
          <Link
            to="/app/billing"
            data-testid="paywall-cta"
            className="block text-center bg-[#002FA7] text-white font-bold px-6 py-3 border-2 border-black shadow-brutal hover-lift"
          >
            View plans & recharge →
          </Link>
        </div>
      </div>
    </div>
  );
}
