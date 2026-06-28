import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { toast } from "sonner";
import BrandMark from "../components/BrandMark";

// Handles the redirect back from Emergent Google OAuth. The session_id arrives
// in the URL fragment (#session_id=...). We exchange it on our backend for our
// own app JWT, store it, then route the user into the app.
export default function AuthCallback() {
  const nav = useNavigate();
  const { reload } = useAuth();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const hash = window.location.hash || "";
    const m = hash.match(/session_id=([^&]+)/);
    const sessionId = m ? decodeURIComponent(m[1]) : null;
    if (!sessionId) {
      nav("/login", { replace: true });
      return;
    }

    let refCode;
    try { refCode = localStorage.getItem("botnira_ref_code") || undefined; } catch { refCode = undefined; }

    (async () => {
      try {
        const { data } = await api.post("/auth/google/session", { session_id: sessionId, referral_code: refCode });
        localStorage.setItem("botnira_token", data.token);
        try { localStorage.removeItem("botnira_ref_code"); } catch { /* ignore */ }
        await reload();
        toast.success(data.is_new ? "Welcome to BotNira!" : "Welcome back");
        // Strip the session_id fragment so a refresh can't replay it.
        window.history.replaceState(null, "", window.location.pathname);
        nav(data.role === "superadmin" ? "/admin" : "/app", { replace: true });
      } catch (e) {
        toast.error(e?.response?.data?.detail || "Google sign-in failed. Please try again.");
        nav("/login", { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen grid place-items-center bg-[#002FA7] text-white" data-testid="auth-callback">
      <div className="flex flex-col items-center gap-4">
        <BrandMark size={40} />
        <div className="font-display font-black text-2xl tracking-tighter">Signing you in…</div>
        <div className="font-mono text-xs opacity-80">Verifying your Google account</div>
      </div>
    </div>
  );
}
