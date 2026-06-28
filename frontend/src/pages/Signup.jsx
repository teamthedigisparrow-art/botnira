import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Gift } from "lucide-react";
import GoogleAuthButton from "../components/GoogleAuthButton";

export default function Signup() {
  const [form, setForm] = useState({ email: "", password: "", full_name: "", business_name: "" });
  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [step, setStep] = useState(1); // 1 = form, 2 = verify
  const [refCode, setRefCode] = useState("");
  const [refBiz, setRefBiz] = useState("");
  const { signup } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // Capture referral code from ?ref= or localStorage (set by /r/:code) and
  // validate it so we can greet the referrer's business by name. We only
  // expose refCode (and show the banner) AFTER the backend confirms it's a
  // valid code — that way the banner never shows a raw token to the user.
  useEffect(() => {
    const fromUrl = (params.get("ref") || "").trim().toLowerCase();
    let code = fromUrl;
    if (!code) {
      try { code = (localStorage.getItem("botnira_ref_code") || "").trim().toLowerCase(); }
      catch { code = ""; }
    }
    if (!code) return;
    api.get(`/referrals/public/resolve/${encodeURIComponent(code)}`)
      .then(({ data }) => {
        if (data?.valid) {
          setRefCode(code);
          setRefBiz(data.referrer_business_name || "");
          try { localStorage.setItem("botnira_ref_code", code); } catch { /* ignore */ }
        } else {
          try { localStorage.removeItem("botnira_ref_code"); } catch { /* ignore */ }
        }
      })
      .catch(() => { /* network glitch — ignore, no banner */ });
  }, [params]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signup({ ...form, referral_code: refCode || undefined });
      toast.success("Workspace created! Check your email for the verification code.");
      try { localStorage.removeItem("botnira_ref_code"); } catch { /* ignore */ }
      setStep(2);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Signup failed");
    } finally { setLoading(false); }
  };

  const verify = async (e) => {
    e.preventDefault();
    setVerifying(true);
    try {
      await api.post("/auth/verify-email", { email: form.email, code: otp });
      toast.success("Email verified! Taking you to your workspace…");
      nav("/app");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Invalid or expired code");
    } finally { setVerifying(false); }
  };

  const skip = () => {
    toast.info("You can verify your email later from Settings.");
    nav("/app");
  };

  const resend = async () => {
    try {
      await api.post("/auth/resend-otp", { email: form.email, purpose: "signup" });
      toast.success("New code sent");
    } catch { toast.error("Could not resend"); }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="flex items-center justify-center p-4 sm:p-8 order-2 md:order-1">
        {step === 1 ? (
          <form onSubmit={submit} className="w-full max-w-md border-2 border-black bg-white p-6 sm:p-8 shadow-brutal-lg" data-testid="signup-form">
            <h1 className="font-display text-3xl font-black tracking-tighter">Create your workspace</h1>
            <p className="text-sm text-neutral-600 mt-1">5-day free trial. No credit card. Each business is isolated.</p>
            {refCode && refBiz && (
              <div className="mt-4 border-2 border-black bg-yellow-200 px-3 py-2 text-sm flex items-center gap-2" data-testid="signup-ref-banner">
                <Gift size={14} />
                <div>
                  Referred by <strong>{refBiz}</strong>
                </div>
              </div>
            )}
            <div className="mt-6 space-y-4">
              {[
                { k: "business_name", label: "Business name", type: "text", tid: "signup-business-input" },
                { k: "full_name", label: "Your full name", type: "text", tid: "signup-name-input" },
                { k: "email", label: "Work email", type: "email", tid: "signup-email-input" },
                { k: "password", label: "Password (6+)", type: "password", tid: "signup-password-input" },
              ].map(f => (
                <div key={f.k}>
                  <label className="text-xs font-bold tracking-widest uppercase">{f.label}</label>
                  <input data-testid={f.tid} className="w-full mt-1 border-2 border-black px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-[#002FA7]" type={f.type} value={form[f.k]} onChange={upd(f.k)} required />
                </div>
              ))}
            </div>
            <button data-testid="signup-submit-btn" disabled={loading} className="mt-6 w-full bg-[#002FA7] text-white font-bold py-3 border-2 border-black shadow-brutal hover-lift disabled:opacity-60">{loading ? "Creating…" : "Create workspace"}</button>
            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-black/20" />
              <span className="text-[10px] font-bold tracking-widest uppercase text-neutral-500">or</span>
              <div className="h-px flex-1 bg-black/20" />
            </div>
            <GoogleAuthButton label="Sign up with Google" testid="signup-google-btn" />
            <div className="mt-4 text-sm">Already a vendor? <Link to="/login" className="font-bold underline" data-testid="signup-to-login">Log in</Link></div>
          </form>
        ) : (
          <form onSubmit={verify} className="w-full max-w-md border-2 border-black bg-white p-6 sm:p-8 shadow-brutal-lg" data-testid="signup-verify-form">
            <h1 className="font-display text-3xl font-black tracking-tighter">Verify your email</h1>
            <p className="text-sm text-neutral-600 mt-1">
              We sent a 6-digit code to <strong className="font-mono">{form.email}</strong>. It expires in 10 minutes.
            </p>
            <div className="mt-6">
              <label className="text-xs font-bold tracking-widest uppercase">Verification code</label>
              <input
                data-testid="signup-otp-input"
                maxLength={6}
                inputMode="numeric"
                className="w-full mt-1 border-2 border-black px-3 py-3 font-mono text-3xl tracking-[0.4em] text-center focus:outline-none focus:ring-2 focus:ring-[#002FA7]"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
              />
            </div>
            <button data-testid="signup-verify-btn" disabled={verifying || otp.length !== 6} className="mt-6 w-full bg-[#002FA7] text-white font-bold py-3 border-2 border-black shadow-brutal hover-lift disabled:opacity-60">
              {verifying ? "Verifying…" : "Verify email"}
            </button>
            <div className="mt-4 flex justify-between text-sm">
              <button type="button" onClick={skip} className="font-bold underline" data-testid="signup-verify-skip">
                Skip for now
              </button>
              <button type="button" onClick={resend} className="font-bold underline" data-testid="signup-verify-resend">
                Resend code
              </button>
            </div>
          </form>
        )}
      </div>
      <div className="hidden md:flex flex-col justify-between p-10 bg-black text-white order-1 md:order-2 border-l-2 border-black">
        <Link to="/" className="font-display font-black text-2xl" data-testid="signup-brand">BotNira</Link>
        <div>
          <div className="font-display text-5xl font-black leading-none tracking-tighter">Give your<br/>front desk<br/>a<span className="text-[#6f8cff]"> brain.</span></div>
          <div className="mt-6 text-sm opacity-80 font-mono">VENDOR WORKSPACE — ISOLATED BY DESIGN</div>
        </div>
        <div className="font-mono text-xs opacity-70">© BotNira 2026</div>
      </div>
    </div>
  );
}
