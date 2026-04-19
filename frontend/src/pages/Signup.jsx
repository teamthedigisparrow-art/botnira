import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

export default function Signup() {
  const [form, setForm] = useState({ email: "", password: "", full_name: "", business_name: "" });
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();
  const nav = useNavigate();
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signup(form);
      toast.success("Workspace created");
      nav("/app");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Signup failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="flex items-center justify-center p-8 order-2 md:order-1">
        <form onSubmit={submit} className="w-full max-w-md border-2 border-black bg-white p-8 shadow-brutal-lg" data-testid="signup-form">
          <h1 className="font-display text-3xl font-black tracking-tighter">Create your workspace</h1>
          <p className="text-sm text-neutral-600 mt-1">Each business is isolated. Zero shared data.</p>
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
          <div className="mt-4 text-sm">Already a vendor? <Link to="/login" className="font-bold underline" data-testid="signup-to-login">Log in</Link></div>
        </form>
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
