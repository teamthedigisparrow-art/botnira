import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { Phone, Loader2, CheckCircle2 } from "lucide-react";

/** Enable / show WhatsApp voice-calling status for the connected WABA number. */
export default function WhatsAppCallingPanel() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);

  const refresh = async () => {
    try { const { data } = await api.get("/whatsapp/calling/status"); setStatus(data); }
    catch (_) { setStatus(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const enable = async () => {
    setEnabling(true);
    try {
      const { data } = await api.post("/whatsapp/calling/enable");
      setStatus((s) => ({ ...(s || {}), ...data, connected: true }));
      toast.success("WhatsApp calling enabled");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not enable WhatsApp calling", { duration: 8000 });
    } finally { setEnabling(false); }
  };

  if (loading || !status?.connected) return null;

  return (
    <div className="border-2 border-black p-4" data-testid="wa-calling-panel">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600 flex items-center gap-2">
            <Phone size={13} /> WhatsApp calling
          </div>
          <div className="font-display font-black text-lg mt-1 flex items-center gap-2">
            {status.calling_enabled ? (
              <><CheckCircle2 size={18} className="text-green-600" /> Enabled</>
            ) : "Not enabled"}
          </div>
          <div className="text-xs text-neutral-600 mt-1 max-w-md">
            {status.outbound_supported
              ? "Customers can call you on WhatsApp, and your team can call them back over WhatsApp from the Inbox."
              : "Customers can call you on WhatsApp. Outbound WhatsApp calls aren't allowed for this number's country, so callbacks from the Inbox use a regular phone call instead."}
          </div>
        </div>
        {!status.calling_enabled && (
          <button data-testid="wa-calling-enable-btn" onClick={enable} disabled={enabling}
            className="text-sm font-bold border-2 border-black px-4 py-2.5 bg-green-500 text-white hover-lift disabled:opacity-60 flex items-center gap-2 shrink-0">
            {enabling && <Loader2 size={14} className="animate-spin" />} Enable calling
          </button>
        )}
      </div>
    </div>
  );
}
