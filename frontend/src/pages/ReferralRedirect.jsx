import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";

/**
 * Lands at /r/<code>. Stores the code in localStorage so the signup form can
 * attribute the new vendor to the referrer, then forwards to /signup.
 * Validation is best-effort — we still pass the code to /signup even if the
 * resolve call fails (the backend re-validates).
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
    try {
      localStorage.setItem("botnira_ref_code", clean);
      // 30-day persistence window
      localStorage.setItem("botnira_ref_code_set_at", String(Date.now()));
    } catch { /* ignore */ }
    // Fire validation lookup but don't block on it
    api.get(`/referrals/public/resolve/${encodeURIComponent(clean)}`)
      .catch(() => { /* ignore — backend will re-validate at signup */ });
    nav(`/signup?ref=${encodeURIComponent(clean)}`, { replace: true });
  }, [code, nav]);

  return (
    <div className="min-h-screen flex items-center justify-center p-10 font-mono text-neutral-700" data-testid="referral-redirect">
      Redirecting to BotNira signup…
    </div>
  );
}
