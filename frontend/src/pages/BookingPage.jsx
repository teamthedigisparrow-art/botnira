import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Calendar, Clock, Check, MapPin, ChevronRight, Loader2 } from "lucide-react";
import BrandMark from "../components/BrandMark";

function browserTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; }
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function slotLabel(iso, tz) {
  try { return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: tz }); }
  catch { return iso; }
}

export default function BookingPage() {
  const { slug } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [typeId, setTypeId] = useState(null);
  const [date, setDate] = useState(todayStr());
  const [tz, setTz] = useState(browserTz());
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ customer_name: "", customer_contact: "", notes: "" });
  const [booking, setBooking] = useState(false);
  const [confirmed, setConfirmed] = useState(null);

  useEffect(() => {
    api.get(`/public/booking/${slug}`)
      .then((r) => { setInfo(r.data); setTypeId(r.data.types?.[0]?.id || null); })
      .catch(() => setError("This booking page is not available."));
  }, [slug]);

  const activeType = info?.types?.find((t) => t.id === typeId) || info?.types?.[0];

  const loadSlots = useCallback(() => {
    if (!typeId || !date) return;
    setLoadingSlots(true);
    setSelected(null);
    api.get(`/public/booking/${slug}/slots?date=${date}&type_id=${typeId}`)
      .then((r) => setSlots(r.data.slots || []))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [slug, typeId, date]);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  const book = async () => {
    if (!form.customer_name.trim()) return toast.error("Please enter your name");
    if (!form.customer_contact.trim()) return toast.error("Please enter your email or phone");
    setBooking(true);
    try {
      const { data } = await api.post(`/public/booking/${slug}/book`, {
        appointment_type_id: typeId,
        start_at: selected,
        customer_name: form.customer_name,
        customer_contact: form.customer_contact,
        customer_timezone: tz,
        notes: form.notes,
      });
      setConfirmed(data.appointment);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Booking failed — please pick another time.");
      loadSlots();
    } finally { setBooking(false); }
  };

  if (error) return <div className="min-h-screen grid place-items-center bg-neutral-50 p-6 text-center"><div><BrandMark size={40} /><div className="mt-4 font-display font-black text-2xl">{error}</div></div></div>;
  if (!info) return <div className="min-h-screen grid place-items-center font-mono text-sm">Loading…</div>;

  if (confirmed) {
    return (
      <div className="min-h-screen bg-[#002FA7] text-white grid place-items-center p-4" data-testid="booking-confirmed">
        <div className="w-full max-w-md border-2 border-black bg-white text-black p-6 sm:p-8 shadow-brutal-lg">
          <div className="w-12 h-12 rounded-full bg-green-400 border-2 border-black grid place-items-center"><Check size={24} /></div>
          <h1 className="font-display font-black text-3xl tracking-tighter mt-4">You're booked!</h1>
          <p className="text-sm text-neutral-600 mt-1">A confirmation is on its way to {confirmed.customer_contact}.</p>
          <div className="mt-4 border-2 border-black p-4 space-y-1 text-sm">
            <div className="flex items-center gap-2"><Calendar size={14} /> {new Date(confirmed.start_at).toLocaleString([], { dateStyle: "full", timeStyle: "short", timeZone: tz })}</div>
            <div className="flex items-center gap-2"><Clock size={14} /> {confirmed.duration_minutes} min · {confirmed.appointment_type_name}</div>
            {confirmed.location && <div className="flex items-center gap-2"><MapPin size={14} /> {confirmed.location}</div>}
            <div className="text-xs font-mono text-neutral-500">Timezone: {tz}</div>
          </div>
          <div className="mt-4 font-display font-black">{info.vendor.name}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50" data-testid="booking-page">
      {/* Header */}
      <div className="bg-[#002FA7] text-white border-b-2 border-black">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 flex items-center gap-3">
          <BrandMark size={32} />
          <div>
            <div className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-80">Book with</div>
            <h1 className="font-display font-black text-2xl sm:text-3xl tracking-tighter">{info.vendor.name}</h1>
          </div>
        </div>
      </div>

      {!info.booking_enabled ? (
        <div className="max-w-3xl mx-auto p-6"><div className="border-2 border-black bg-white p-6 text-center">Online booking is currently paused. Please reach out directly.</div></div>
      ) : (
        <div className="max-w-3xl mx-auto p-4 sm:p-6 grid lg:grid-cols-[1fr_1fr] gap-4">
          {/* Left: type + date + slots */}
          <div className="space-y-4">
            {/* Appointment type */}
            {info.types.length > 1 && (
              <div className="border-2 border-black bg-white p-4">
                <div className="text-xs font-bold tracking-widest uppercase mb-2">Choose a service</div>
                <div className="space-y-2">
                  {info.types.map((t) => (
                    <button key={t.id} onClick={() => setTypeId(t.id)} data-testid={`booking-type-${t.id}`} className={`w-full text-left border-2 border-black px-3 py-2 flex items-center justify-between ${typeId === t.id ? "bg-[#002FA7] text-white" : "bg-white hover:bg-neutral-50"}`}>
                      <span><span className="font-bold">{t.name}</span> <span className="text-xs opacity-70">· {t.duration_minutes} min</span></span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Date + timezone */}
            <div className="border-2 border-black bg-white p-4 space-y-3">
              <label className="block">
                <span className="text-xs font-bold tracking-widest uppercase">Date</span>
                <input type="date" data-testid="booking-date" min={todayStr()} value={date} onChange={(e) => setDate(e.target.value)} className="w-full mt-1 border-2 border-black px-3 py-2" />
              </label>
              <label className="block">
                <span className="text-xs font-bold tracking-widest uppercase">Your timezone</span>
                <input data-testid="booking-tz" value={tz} onChange={(e) => setTz(e.target.value)} className="w-full mt-1 border-2 border-black px-3 py-2 text-sm font-mono" />
              </label>
            </div>

            {/* Slots */}
            <div className="border-2 border-black bg-white p-4">
              <div className="text-xs font-bold tracking-widest uppercase mb-2">Available times {activeType ? `· ${activeType.duration_minutes} min` : ""}</div>
              {loadingSlots ? (
                <div className="py-6 text-center text-sm text-neutral-500 flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</div>
              ) : slots.length === 0 ? (
                <div className="py-6 text-center text-sm text-neutral-500" data-testid="booking-no-slots">No open times on this day. Try another date.</div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2" data-testid="booking-slots">
                  {slots.map((iso) => (
                    <button key={iso} onClick={() => setSelected(iso)} data-testid={`booking-slot-${iso}`} className={`border-2 border-black px-2 py-2 text-sm font-bold ${selected === iso ? "bg-[#002FA7] text-white" : "bg-white hover:bg-neutral-50"}`}>
                      {slotLabel(iso, tz)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: details form */}
          <div className="border-2 border-black bg-white p-4 h-fit lg:sticky lg:top-6">
            <div className="font-display font-black text-xl">Your details</div>
            {selected ? (
              <div className="mt-1 text-sm text-[#002FA7] font-bold">{new Date(selected).toLocaleString([], { dateStyle: "medium", timeStyle: "short", timeZone: tz })}</div>
            ) : (
              <div className="mt-1 text-sm text-neutral-500">Pick a time slot to continue.</div>
            )}
            <div className="mt-4 space-y-3">
              <input data-testid="booking-name" placeholder="Your name" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} className="w-full border-2 border-black px-3 py-2" />
              <input data-testid="booking-contact" placeholder="Email or phone" value={form.customer_contact} onChange={(e) => setForm({ ...form, customer_contact: e.target.value })} className="w-full border-2 border-black px-3 py-2" />
              <textarea data-testid="booking-notes" placeholder="Anything we should know? (optional)" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full border-2 border-black px-3 py-2 text-sm" />
              {activeType?.instructions && <div className="text-xs text-neutral-600 border-l-2 border-black pl-2">{activeType.instructions}</div>}
            </div>
            <button disabled={!selected || booking} onClick={book} data-testid="booking-confirm-btn" className="mt-4 w-full bg-[#002FA7] text-white font-bold py-3 border-2 border-black shadow-brutal hover-lift disabled:opacity-50">
              {booking ? "Booking…" : "Confirm booking"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
