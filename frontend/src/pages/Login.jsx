import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { toast } from "sonner";
import GoogleAuthButton from "../components/GoogleAuthButton";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [mfaSession, setMfaSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const { login, reload } = useAuth();
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Call raw login first so we can detect MFA-required responses
      const { data } = await api.post("/auth/login", { email, password });
      if (data.mfa_required) {
        setMfaSession(data.mfa_session);
        toast.info("We sent a 6-digit code to your email");
      } else {
        // Reuse context's login to ensure state is kept in sync
        localStorage.setItem("botnira_token", data.token);
        await reload();
        toast.success("Welcome back");
        nav(data.role === "superadmin" ? "/admin" : "/app");
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login failed");
    } finally { setLoading(false); }
  };

  const verifyMfa = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login/mfa-verify", {
        email, code: otp, mfa_session: mfaSession,
      });
      localStorage.setItem("botnira_token", data.token);
      await reload();
      toast.success("Signed in");
      nav(data.role === "superadmin" ? "/admin" : "/app");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Invalid code");
    } finally { setLoading(false); }
  };

  const resend = async () => {
    setResending(true);
    try {
      // Re-trigger login which reissues a fresh OTP
      const { data } = await api.post("/auth/login", { email, password });
      if (data.mfa_session) setMfaSession(data.mfa_session);
      toast.success("New code sent");
    } catch {
      toast.error("Could not resend — please start over");
      setMfaSession(null);
    } finally { setResending(false); }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:flex flex-col justify-between p-10 bg-[#002FA7] text-white border-r-2 border-black">
        <Link to="/" className="font-display font-black text-2xl" data-testid="login-brand">BotNira</Link>
        <div>
          <div className="font-display text-5xl font-black leading-none tracking-tighter">Your AI<br/>front desk<br/>is one login<br/>away.</div>
          <div className="mt-6 font-mono text-xs opacity-80">MULTI-LANGUAGE • 24/7 • ISOLATED</div>
        </div>
        <div className="font-mono text-xs opacity-80">© BotNira 2026</div>
      </div>
      <div className="flex items-center justify-center p-4 sm:p-8">
        {!mfaSession ? (
          <form onSubmit={submit} className="w-full max-w-md border-2 border-black bg-white p-6 sm:p-8 shadow-brutal-lg" data-testid="login-form">
            <h1 className="font-display text-3xl font-black tracking-tighter">Log in</h1>
            <p className="text-sm text-neutral-600 mt-1">Welcome back. Pick up where you left off.</p>
            <div className="mt-6 space-y-4">
              <div>
                <label className="text-xs font-bold tracking-widest uppercase">Email</label>
                <input data-testid="login-email-input" className="w-full mt-1 border-2 border-black px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-[#002FA7]" type="email" value={email} onChange={e=>setEmail(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs font-bold tracking-widest uppercase">Password</label>
                <input data-testid="login-password-input" className="w-full mt-1 border-2 border-black px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-[#002FA7]" type="password" value={password} onChange={e=>setPassword(e.target.value)} required />
              </div>
              <div className="text-right">
                <Link to="/forgot-password" className="text-xs font-bold underline" data-testid="login-forgot">Forgot password?</Link>
              </div>
            </div>
            <button data-testid="login-submit-btn" disabled={loading} className="mt-6 w-full bg-[#002FA7] text-white font-bold py-3 border-2 border-black shadow-brutal hover-lift disabled:opacity-60">{loading ? "Signing in…" : "Sign in"}</button>
            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-black/20" />
              <span className="text-[10px] font-bold tracking-widest uppercase text-neutral-500">or</span>
              <div className="h-px flex-1 bg-black/20" />
            </div>
            <GoogleAuthButton label="Sign in with Google" testid="login-google-btn" />
            <div className="mt-4 text-sm">No account? <Link to="/signup" className="font-bold underline" data-testid="login-to-signup">Create one</Link></div>
          </form>
        ) : (
          <form onSubmit={verifyMfa} className="w-full max-w-md border-2 border-black bg-white p-6 sm:p-8 shadow-brutal-lg" data-testid="login-mfa-form">
            <h1 className="font-display text-3xl font-black tracking-tighter">Two-factor code</h1>
            <p className="text-sm text-neutral-600 mt-1">We sent a 6-digit code to <strong className="font-mono">{email}</strong>. It expires in 10 minutes.</p>
            <div className="mt-6">
              <label className="text-xs font-bold tracking-widest uppercase">Verification code</label>
              <input
                data-testid="login-mfa-input"
                maxLength={6}
                inputMode="numeric"
                className="w-full mt-1 border-2 border-black px-3 py-3 font-mono text-2xl sm:text-3xl tracking-[0.3em] sm:tracking-[0.4em] text-center focus:outline-none focus:ring-2 focus:ring-[#002FA7]"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
              />
            </div>
            <button data-testid="login-mfa-submit" disabled={loading || otp.length !== 6} className="mt-6 w-full bg-[#002FA7] text-white font-bold py-3 border-2 border-black shadow-brutal hover-lift disabled:opacity-60">{loading ? "Verifying…" : "Verify & sign in"}</button>
            <div className="mt-4 flex justify-between text-sm">
              <button type="button" onClick={() => setMfaSession(null)} className="font-bold underline" data-testid="login-mfa-back">← Back</button>
              <button type="button" disabled={resending} onClick={resend} className="font-bold underline disabled:opacity-50" data-testid="login-mfa-resend">
                {resending ? "Sending…" : "Resend code"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
