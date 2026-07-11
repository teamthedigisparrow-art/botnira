// Illustrative outcome scenarios — deliberately NOT attributed to real named
// customers. As early-access businesses come onboard, these are replaced with
// verified, consent-backed testimonials (real name, business, photo, numbers).
import { Sparkles } from "lucide-react";

const SCENARIOS = [
  { role: "Salon owner", location: "Toronto, ON", body: "After-hours WhatsApp messages used to go unanswered until morning. BotNira books them overnight, so the first slots are full before the doors even open." },
  { role: "Auto service manager", location: "Ontario, Canada", body: "Customers who used to leave voicemails and never call back now get answered instantly — BotNira captures the issue and books the service slot on the spot." },
  { role: "Dental clinic", location: "Ontario, Canada", body: "The front desk no longer fields dozens of routine calls a day. Patients book and reschedule over WhatsApp while staff focus on the people in the room." },
  { role: "HVAC / home services", location: "Canada", body: "Emergency calls get triaged 24/7 — BotNira captures the address, the fault and the urgency, then schedules the nearest technician." },
  { role: "Real-estate team", location: "Canada", body: "Every web-form lead gets a reply in seconds, in the customer's language, with budget and timeline pre-qualified before a human ever steps in." },
  { role: "Tutoring center", location: "Ontario, Canada", body: "Parents message late at night about courses and fees. BotNira answers in whatever language the parent writes in and books trial classes automatically." },
];

export default function Reviews() {
  return (
    <section id="reviews" className="border-b-2 border-black bg-white" data-testid="reviews-section">
      <div className="max-w-7xl mx-auto px-6 py-20">
        <div className="max-w-3xl mb-10">
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">Built to deliver</div>
          <h2 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-2">
            What BotNira does for businesses like yours.
          </h2>
          <p className="mt-4 text-neutral-700">
            These are <strong>illustrative examples</strong> of the outcomes BotNira is designed to deliver.
            We're onboarding our first businesses across Ontario now — verified customer stories will appear here as they come in.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {SCENARIOS.map((s, i) => (
            <article key={i} data-testid={`scenario-${i}`} className="border-2 border-black p-6 bg-white shadow-brutal hover-lift">
              <div className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase bg-neutral-100 border border-black px-2 py-0.5">
                <Sparkles size={11}/> Example scenario
              </div>
              <p className="mt-4 text-sm text-neutral-800 leading-relaxed">"{s.body}"</p>
              <div className="mt-5 pt-4 border-t border-black/10">
                <div className="font-display font-black leading-tight">{s.role}</div>
                <div className="text-xs font-mono uppercase tracking-widest text-neutral-500 mt-0.5">📍 {s.location}</div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
