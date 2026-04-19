import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await login(email, password);
      toast.success("Welcome back");
      nav(r.role === "superadmin" ? "/admin" : "/app");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:flex flex-col justify-between p-10 bg-[#002FA7] text-white border-r-2 border-black">
        <Link to="/" className="font-display font-black text-2xl" data-testid="login-brand">BotNira</Link>
        <div>
          <div className="font-display text-5xl font-black leading-none tracking-tighter">Your AI<br/>front desk<br/>is one login<br/>away.</div>
          <div className="mt-6 font-mono text-xs opacity-80">DEMO VENDOR — demo@botnira.com / demo123<br/>SUPERADMIN — admin@botnira.com / admin123</div>
        </div>
        <div className="font-mono text-xs opacity-80">© BotNira 2026</div>
      </div>
      <div className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-md border-2 border-black bg-white p-8 shadow-brutal-lg" data-testid="login-form">
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
          </div>
          <button data-testid="login-submit-btn" disabled={loading} className="mt-6 w-full bg-[#002FA7] text-white font-bold py-3 border-2 border-black shadow-brutal hover-lift disabled:opacity-60">{loading ? "Signing in…" : "Sign in"}</button>
          <div className="mt-4 text-sm">No account? <Link to="/signup" className="font-bold underline" data-testid="login-to-signup">Create one</Link></div>
        </form>
      </div>
    </div>
  );
}
