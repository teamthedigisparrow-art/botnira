import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { Shield, ShieldCheck, Mail } from "lucide-react";

export default function Settings() {
  const [v, setV] = useState(null);
  const [mfa, setMfa] = useState(null);
  const [pwPrompt, setPwPrompt] = useState(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await api.get("/vendor/me");
    setV(r.data);
    try {
      const m = await api.get("/auth/mfa-status");
      setMfa(m.data.mfa_enabled);
    } catch { setMfa(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const { data } = await api.put("/vendor/me", { name: v.name, business_description: v.business_description });
      setV(data);
      toast.success("Saved");
    } catch { toast.error("Save failed"); }
  };

  const confirmMfaToggle = async () => {
    setBusy(true);
    try {
      const { data } = await api.put("/auth/mfa", { enabled: !mfa, password });
      setMfa(data.mfa_enabled);
      toast.success(data.mfa_enabled ? "Two-factor enabled" : "Two-factor disabled");
      setPwPrompt(null);
      setPassword("");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Update failed");
    } finally { setBusy(false); }
  };

  if (!v) return <div className="p-10 font-mono">Loading…</div>;

  return (
    <div className="p-8 max-w-3xl space-y-6" data-testid="settings-page">
      <div>
        <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">Settings</div>
        <h1 className="font-display text-4xl font-black tracking-tighter">Workspace</h1>
      </div>

      <div className="border-2 border-black bg-white p-6 space-y-4">
        <div>
          <div className="text-xs font-bold tracking-[0.2em] uppercase mb-1">Business name</div>
          <input data-testid="settings-name" className="w-full border-2 border-black px-3 py-2" value={v.name || ""} onChange={e=>setV({...v, name: e.target.value})}/>
        </div>
        <div>
          <div className="text-xs font-bold tracking-[0.2em] uppercase mb-1">Business description</div>
          <textarea data-testid="settings-desc" rows={6} className="w-full border-2 border-black px-3 py-2 font-mono text-sm" value={v.business_description || ""} onChange={e=>setV({...v, business_description: e.target.value})}/>
        </div>
        <div className="text-xs font-mono text-neutral-600">Vendor ID: {v.id}</div>
        <button data-testid="settings-save" onClick={save} className="bg-[#002FA7] text-white font-bold px-5 py-2 border-2 border-black shadow-brutal hover-lift">Save</button>
      </div>

      {/* Security */}
      <div className="border-2 border-black bg-white p-6" data-testid="security-panel">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={22}/>
          <div className="font-display font-black text-xl">Security</div>
        </div>

        <div className="border-2 border-black p-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              {mfa ? <ShieldCheck size={18} className="text-green-700"/> : <Shield size={18}/>}
              <div className="font-display font-bold">Two-factor authentication (2FA)</div>
            </div>
            <div className="text-sm text-neutral-600 mt-1 max-w-md">
              When enabled, every login requires a 6-digit code emailed to you in addition to your password.
            </div>
          </div>
          <button
            data-testid="mfa-toggle-btn"
            onClick={() => setPwPrompt(mfa ? "disable" : "enable")}
            className={`text-sm font-bold border-2 border-black px-4 py-2 hover-lift ${mfa ? "bg-green-400" : "bg-white"}`}
          >
            {mfa === null ? "…" : mfa ? "ON — click to disable" : "OFF — click to enable"}
          </button>
        </div>

        {pwPrompt && (
          <div className="mt-4 border-2 border-black p-4 bg-amber-50" data-testid="mfa-password-prompt">
            <div className="font-display font-bold text-sm mb-2">
              Enter your password to {pwPrompt === "enable" ? "enable" : "disable"} 2FA
            </div>
            <input
              data-testid="mfa-password-input"
              type="password"
              autoFocus
              value={password}
              onChange={e=>setPassword(e.target.value)}
              className="w-full border-2 border-black px-3 py-2 font-medium"
              placeholder="Current password"
            />
            <div className="mt-3 flex gap-2">
              <button
                data-testid="mfa-confirm-btn"
                disabled={busy || !password}
                onClick={confirmMfaToggle}
                className="bg-[#002FA7] text-white font-bold px-4 py-2 border-2 border-black shadow-brutal hover-lift disabled:opacity-60"
              >
                {busy ? "Working…" : "Confirm"}
              </button>
              <button
                onClick={() => { setPwPrompt(null); setPassword(""); }}
                className="font-bold border-2 border-black px-4 py-2 hover-lift"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 border-2 border-black p-4 flex items-start gap-3 bg-neutral-50">
          <Mail size={18} className="mt-0.5"/>
          <div className="text-sm text-neutral-700">
            Forgot your password? You can reset it anytime from the <a href="/forgot-password" className="font-bold underline">forgot password</a> page — we'll email you a 6-digit code.
          </div>
        </div>
      </div>
    </div>
  );
}
