import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";

/**
 * Lands at /r/<code>. Validates the code against the backend. If valid we
 * store it for the signup form to attach, and forward to /signup?ref=<code>.
 * Invalid codes are dropped so the signup page never shows a misleading
 * "Referred by <bad code>" banner.
 */
export default function ReferralRedirect() {
  const { code } = useParams();
  const nav = useNavigate();

  useEffect(() => {
    const clean = (code || "").trim().toLowerCase();
    if (!clean) {
      nav("/", { replace: true });
      return;
    }
    api.get(`/referrals/public/resolve/${encodeURIComponent(clean)}`)
      .then(({ data }) => {
        if (data?.valid) {
          try {
            localStorage.setItem("botnira_ref_code", clean);
            localStorage.setItem("botnira_ref_code_set_at", String(Date.now()));
          } catch { /* ignore */ }
          nav(`/signup?ref=${encodeURIComponent(clean)}`, { replace: true });
        } else {
          // Bad code → silently drop and send to plain signup.
          try { localStorage.removeItem("botnira_ref_code"); } catch { /* ignore */ }
          nav("/signup", { replace: true });
        }
      })
      .catch(() => {
        // Network failure — fall back to signup with the code in localStorage
        // (signup page will re-validate before showing a banner).
        try { localStorage.setItem("botnira_ref_code", clean); } catch { /* ignore */ }
        nav(`/signup?ref=${encodeURIComponent(clean)}`, { replace: true });
      });
  }, [code, nav]);

  return (
    <div className="min-h-screen flex items-center justify-center p-10 font-mono text-neutral-700" data-testid="referral-redirect">
      Redirecting to BotNira signup…
    </div>
  );
}
