import { useState } from "react";
import { api } from "../../lib/api";
import { Phone, X, Delete, Loader2 } from "lucide-react";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

/**
 * Manual Twilio dialer. Agent types any number (E.164, any country) + optional
 * name; we ensure a voice conversation exists then hand off to the CallWidget.
 * onStart({ number, name, conversationId })
 */
export default function Dialer({ onClose, onStart }) {
  const [number, setNumber] = useState("+");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const press = (k) => setNumber((n) => (n === "+" ? "+" : n) + k);
  const back = () => setNumber((n) => (n.length <= 1 ? "+" : n.slice(0, -1)));

  const valid = /^\+[1-9]\d{7,15}$/.test(number.replace(/[\s-]/g, ""));

  const call = async () => {
    setError("");
    if (!valid) { setError("Enter a valid number in international format, e.g. +14155550123"); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/voice/browser/dial-prepare", {
        number: number.replace(/[\s-]/g, ""), name: name.trim() || undefined,
      });
      onStart({ number: data.number, name: data.name, conversationId: data.conversation_id });
    } catch (e) {
      setError(e?.response?.data?.detail || "Could not start the call.");
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[85] bg-black/50 flex items-center justify-center p-4" data-testid="dialer-overlay" onClick={onClose}>
      <div className="w-full max-w-sm bg-white border-2 border-black shadow-brutal-lg" data-testid="dialer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-black">
          <span className="font-display font-black text-sm uppercase tracking-wide flex items-center gap-2">
            <Phone size={15} className="text-[#002FA7]" /> New call
          </span>
          <button data-testid="dialer-close" onClick={onClose} className="p-1 hover:bg-neutral-100"><X size={16} /></button>
        </div>

        <div className="p-5">
          <input
            data-testid="dialer-number-input"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="+14155550123"
            className="w-full text-center font-mono text-2xl font-black border-2 border-black px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002FA7]"
          />
          <input
            data-testid="dialer-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            className="w-full mt-2 text-sm border-2 border-black px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002FA7]"
          />

          <div className="grid grid-cols-3 gap-2 mt-4">
            {KEYS.map((k) => (
              <button key={k} data-testid={`dialpad-${k}`} onClick={() => press(k)}
                className="py-3 border-2 border-black font-display font-black text-lg hover:bg-neutral-100 active:translate-y-0.5 transition-transform">
                {k}
              </button>
            ))}
          </div>

          {error && <div className="mt-3 text-xs text-red-600 leading-snug" data-testid="dialer-error">{error}</div>}

          <div className="flex items-center gap-2 mt-4">
            <button data-testid="dialer-backspace" onClick={back} className="w-14 py-3 grid place-items-center border-2 border-black hover:bg-neutral-100">
              <Delete size={18} />
            </button>
            <button data-testid="dialer-call-btn" onClick={call} disabled={!valid || loading}
              className="flex-1 py-3 border-2 border-black bg-green-500 text-white font-bold flex items-center justify-center gap-2 hover:-translate-y-0.5 transition-transform disabled:opacity-50 disabled:hover:translate-y-0">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Phone size={16} />} Call
            </button>
          </div>
          <div className="mt-2 text-[11px] text-neutral-500 text-center">Calls dial from your business number. Any country.</div>
        </div>
      </div>
    </div>
  );
}
