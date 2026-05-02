import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { Phone, Search, Check, PhoneOff, Clock } from "lucide-react";

export default function ConnectVoicePanel({ onChange }) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [countries, setCountries] = useState([]);
  const [country, setCountry] = useState("US");
  const [areaCode, setAreaCode] = useState("");
  const [numberType, setNumberType] = useState("Local");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [buying, setBuying] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const s = await api.get("/voice/status");
      setStatus(s.data);
    } catch { setStatus({ active: false }); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const loadCountries = async () => {
    if (countries.length) return;
    try {
      const { data } = await api.get("/voice/countries");
      setCountries(data);
    } catch { toast.error("Could not load country list"); }
  };

  const search = async (e) => {
    e?.preventDefault();
    setSearching(true);
    setResults(null);
    try {
      const { data } = await api.post("/voice/search-numbers", {
        country_code: country,
        area_code: areaCode || undefined,
        number_type: numberType,
      });
      setResults(data);
      if (!data.numbers?.length) toast.info("No numbers found — try a different area code or country");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Search failed");
    } finally { setSearching(false); }
  };

  const buy = async (num) => {
    if (!window.confirm(`Purchase ${num} for your business? You'll be billed monthly through your BotNira plan.`)) return;
    setBuying(num);
    try {
      await api.post("/voice/buy-number", { country_code: country, phone_number: num });
      toast.success(`${num} is now live! Calls to this number will be answered by BotNira.`);
      await load();
      onChange?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Purchase failed", { duration: 10000 });
    } finally { setBuying(""); }
  };

  const deactivate = async () => {
    if (!window.confirm("Deactivate and release this phone number? This cannot be undone.")) return;
    try {
      await api.post("/voice/deactivate");
      toast.success("Voice deactivated");
      await load();
      onChange?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Deactivation failed");
    }
  };

  if (loading) return <div className="p-6 font-mono text-sm text-neutral-600">Loading voice…</div>;

  // ACTIVE STATE
  if (status?.active) {
    return (
      <div className="border-2 border-black bg-white" data-testid="voice-panel-active">
        <div className="bg-[#002FA7] text-black px-6 py-4 border-b-2 border-black flex items-center justify-between" style={{background:"#ffdd00"}}>
          <div className="flex items-center gap-3">
            <Phone size={20} />
            <div>
              <div className="font-display font-black text-xl flex items-center gap-2 flex-wrap">
                Voice + SMS — Live
                <span className="badge bg-black text-white border-black text-[10px]">VOICE</span>
                <span className="badge bg-black text-white border-black text-[10px]">SMS · US/CA</span>
              </div>
              <div className="text-xs">Powered by BotNira's realtime voice + messaging engine. Same number for calls AND text messages.</div>
            </div>
          </div>
          <span className="badge bg-black text-white border-black" data-testid="voice-badge-live">LIVE</span>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="border-2 border-black p-4 md:col-span-2">
              <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600">Your BotNira phone number</div>
              <div className="font-display font-black text-3xl mt-2 tracking-tighter" data-testid="voice-phone-display">{status.phone_number}</div>
              <div className="text-xs font-mono text-neutral-600 mt-1">Country: {status.country}</div>
              <div className="text-xs font-mono text-neutral-500 mt-1 break-all">Subaccount: {status.subaccount_sid}</div>
              <div className="mt-3 border-2 border-black bg-amber-50 px-3 py-2 text-xs font-mono leading-relaxed" data-testid="voice-sms-info">
                <strong>Heads up:</strong> Customers can <strong>call</strong> AND <strong>text</strong> this number — both inbound calls and SMS reach your BotNira inbox. <strong>SMS is US &amp; Canada only</strong> at launch — international SMS is silently rejected.
              </div>
              <div className="mt-3 border-2 border-black bg-blue-50 px-3 py-2 text-xs leading-relaxed" data-testid="voice-forwarding-helper">
                <strong>Already have a business number?</strong> Set call
                forwarding on it (under any condition — always, on busy, or
                no-answer) to your BotNira phone number above. Every call
                that reaches your existing number will be routed to
                BotNira, and BotNira will answer for you — your callers
                keep dialling the number they already know.
              </div>
            </div>
            <div className="border-2 border-black p-4">
              <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600">This month</div>
              <div className="font-display font-black text-3xl mt-2 flex items-baseline gap-2">
                {status.stats_this_month.minutes}<span className="text-xs font-mono">min</span>
              </div>
              <div className="text-xs font-mono text-neutral-500 mt-1">{status.stats_this_month.calls} calls answered</div>
            </div>
          </div>
          <div className="border-t-2 border-black pt-4 flex items-center justify-between">
            <div className="text-sm text-neutral-600">
              Share your number on your website, Google profile, business cards. Every inbound call is answered by your trained BotNira.
            </div>
            <button
              onClick={deactivate}
              data-testid="voice-deactivate-btn"
              className="text-sm font-bold border-2 border-black px-4 py-2 hover-lift flex items-center gap-2 bg-white"
            >
              <PhoneOff size={14}/> Deactivate
            </button>
          </div>
        </div>
      </div>
    );
  }

  // NOT ACTIVE
  return (
    <div className="border-2 border-black bg-white" data-testid="voice-panel-inactive">
      <div className="bg-black text-white px-6 py-4 border-b-2 border-black flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Phone size={20} />
          <div>
            <div className="font-display font-black text-xl flex items-center gap-2 flex-wrap">
              Voice + SMS — Activate a phone number
              <span className="badge bg-yellow-300 text-black border-yellow-300 text-[10px]">VOICE</span>
              <span className="badge bg-yellow-300 text-black border-yellow-300 text-[10px]">SMS · US/CA</span>
            </div>
            <div className="text-xs opacity-80">One number, two channels. Customers can both call AND text it.</div>
          </div>
        </div>
      </div>
      <div className="p-6 space-y-5">
        {!showPicker ? (
          <div className="text-center py-6">
            <Phone size={40} className="mx-auto text-neutral-400"/>
            <div className="mt-3 font-display font-bold text-lg">No phone number active yet</div>
            <div className="mt-1 text-sm text-neutral-600 max-w-md mx-auto">
              Get a dedicated BotNira phone number in 200+ countries.
              The number handles <strong>voice calls everywhere</strong> and <strong>SMS in US &amp; Canada</strong>. International SMS is not supported at launch.
            </div>
            <button
              onClick={() => { setShowPicker(true); loadCountries(); }}
              data-testid="voice-activate-btn"
              className="mt-5 bg-[#002FA7] text-white font-bold px-6 py-3 border-2 border-black shadow-brutal hover-lift"
            >
              Activate Voice + SMS →
            </button>
          </div>
        ) : (
          <div>
            <form onSubmit={search} className="border-2 border-black p-4 bg-neutral-50">
              <div className="grid md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-bold tracking-widest uppercase">Country</label>
                  <select
                    data-testid="voice-country-select"
                    value={country}
                    onChange={e => setCountry(e.target.value)}
                    className="w-full mt-1 border-2 border-black px-3 py-2 font-mono text-sm"
                  >
                    {countries.length === 0 && <option value="US">United States</option>}
                    {countries.map(c => <option key={c.iso} value={c.iso}>{c.iso} — {c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold tracking-widest uppercase">Area code (US/CA)</label>
                  <input
                    data-testid="voice-areacode-input"
                    value={areaCode}
                    onChange={e => setAreaCode(e.target.value.replace(/\D/g,"").slice(0,3))}
                    placeholder="optional"
                    className="w-full mt-1 border-2 border-black px-3 py-2 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold tracking-widest uppercase">Type</label>
                  <select
                    data-testid="voice-type-select"
                    value={numberType}
                    onChange={e => setNumberType(e.target.value)}
                    className="w-full mt-1 border-2 border-black px-3 py-2 font-mono text-sm"
                  >
                    <option>Local</option>
                    <option>Mobile</option>
                    <option>TollFree</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={searching}
                    data-testid="voice-search-btn"
                    className="w-full bg-[#002FA7] text-white font-bold px-3 py-2 border-2 border-black shadow-brutal hover-lift disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    <Search size={14}/> {searching ? "Searching…" : "Search"}
                  </button>
                </div>
              </div>
            </form>

            {results && (
              <div className="mt-4 border-2 border-black" data-testid="voice-results">
                <div className="bg-neutral-100 px-4 py-2 border-b-2 border-black flex items-center justify-between">
                  <div className="font-display font-bold">
                    {results.numbers.length} number{results.numbers.length !== 1 ? "s" : ""} in {results.country}
                  </div>
                  <div className="font-mono text-xs">
                    Your inbound cost: <strong>${results.inbound_cost_per_min_usd}/min</strong>
                  </div>
                </div>
                {results.numbers.length === 0 ? (
                  <div className="p-6 text-sm font-mono text-neutral-600">No matches — try a different area code or remove it.</div>
                ) : (
                  <div className="divide-y-2 divide-black">
                    {results.numbers.map(n => (
                      <div key={n.phone_number} className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-neutral-50" data-testid={`voice-num-${n.phone_number}`}>
                        <div>
                          <div className="font-display font-bold text-lg">{n.phone_number}</div>
                          <div className="text-xs font-mono text-neutral-600">
                            {[n.locality, n.region].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        <button
                          onClick={() => buy(n.phone_number)}
                          disabled={buying === n.phone_number}
                          data-testid={`voice-buy-${n.phone_number}`}
                          className="bg-[#002FA7] text-white font-bold px-4 py-2 border-2 border-black shadow-brutal hover-lift disabled:opacity-60 flex items-center gap-2"
                        >
                          {buying === n.phone_number ? "Activating…" : <><Check size={14}/> Buy</>}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 border border-dashed border-black/50 p-3 text-xs font-mono text-neutral-700 flex gap-2">
              <Clock size={14} className="mt-0.5 shrink-0"/>
              <span>Some countries require regulatory proof (ID, local address) before a number can be used. If your purchase fails with a regulatory error, contact BotNira support.</span>
            </div>

            <div className="mt-3 text-right">
              <button onClick={() => setShowPicker(false)} className="text-xs font-bold underline">← Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
