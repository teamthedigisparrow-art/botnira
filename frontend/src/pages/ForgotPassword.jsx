import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "sonner";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [step, setStep] = useState(1); // 1 = request, 2 = confirm
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const request = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/password/reset/request", { email });
      toast.success("If an account exists, we sent a reset code to your email.");
      setStep(2);
    } catch {
      // Still proceed to step 2 — we don't reveal whether the email exists
      setStep(2);
    } finally { setLoading(false); }
  };

  const confirm = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/password/reset/confirm", {
        email, code: otp, new_password: newPassword,
      });
      toast.success("Password reset! You can now sign in.");
      nav("/login");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Invalid or expired code");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:flex flex-col justify-between p-10 bg-[#002FA7] text-white border-r-2 border-black">
        <Link to="/" className="font-display font-black text-2xl">BotNira</Link>
        <div>
          <div className="font-display text-5xl font-black leading-none tracking-tighter">Reset<br/>your<br/>password.</div>
          <div className="mt-6 font-mono text-xs opacity-80">SECURE · EMAIL-VERIFIED</div>
        </div>
        <div className="font-mono text-xs opacity-80">© BotNira 2026</div>
      </div>
      <div className="flex items-center justify-center p-8">
        {step === 1 ? (
          <form onSubmit={request} className="w-full max-w-md border-2 border-black bg-white p-8 shadow-brutal-lg" data-testid="forgot-request-form">
            <h1 className="font-display text-3xl font-black tracking-tighter">Forgot password?</h1>
            <p className="text-sm text-neutral-600 mt-1">Enter your email and we'll send you a 6-digit reset code.</p>
            <div className="mt-6">
              <label className="text-xs font-bold tracking-widest uppercase">Email</label>
              <input data-testid="forgot-email-input" className="w-full mt-1 border-2 border-black px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-[#002FA7]" type="email" value={email} onChange={e=>setEmail(e.target.value)} required />
            </div>
            <button data-testid="forgot-request-btn" disabled={loading} className="mt-6 w-full bg-[#002FA7] text-white font-bold py-3 border-2 border-black shadow-brutal hover-lift disabled:opacity-60">{loading ? "Sending…" : "Send reset code"}</button>
            <div className="mt-4 text-sm">Remember now? <Link to="/login" className="font-bold underline">Log in</Link></div>
          </form>
        ) : (
          <form onSubmit={confirm} className="w-full max-w-md border-2 border-black bg-white p-8 shadow-brutal-lg" data-testid="forgot-confirm-form">
            <h1 className="font-display text-3xl font-black tracking-tighter">Enter code &amp; new password</h1>
            <p className="text-sm text-neutral-600 mt-1">Check <strong className="font-mono">{email}</strong> for the 6-digit code. Code expires in 10 minutes.</p>
            <div className="mt-6 space-y-4">
              <div>
                <label className="text-xs font-bold tracking-widest uppercase">Verification code</label>
                <input
                  data-testid="forgot-otp-input"
                  maxLength={6}
                  inputMode="numeric"
                  className="w-full mt-1 border-2 border-black px-3 py-3 font-mono text-3xl tracking-[0.4em] text-center focus:outline-none focus:ring-2 focus:ring-[#002FA7]"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold tracking-widest uppercase">New password (6+)</label>
                <input data-testid="forgot-new-password" className="w-full mt-1 border-2 border-black px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-[#002FA7]" type="password" minLength={6} value={newPassword} onChange={e=>setNewPassword(e.target.value)} required />
              </div>
            </div>
            <button data-testid="forgot-confirm-btn" disabled={loading || otp.length !== 6} className="mt-6 w-full bg-[#002FA7] text-white font-bold py-3 border-2 border-black shadow-brutal hover-lift disabled:opacity-60">{loading ? "Resetting…" : "Reset password"}</button>
            <div className="mt-4 text-sm">
              <button type="button" onClick={() => setStep(1)} className="font-bold underline" data-testid="forgot-back">← Back</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
