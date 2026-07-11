// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER TESTIMONIALS
//
// ⚠️ REPLACE-WITH-REAL-DATA:
// These are early launch placeholders styled as real SaaS customer testimonials.
// As real, consent-backed customers come onboard, edit the TESTIMONIALS array
// below — swap each `logo` (drop the real business logo URL), `name`,
// `business`, `location`, `industry`, `quote`, and the `before` / `after`
// metric rows. Everything the section renders is driven by this one array.
// ─────────────────────────────────────────────────────────────────────────────
import { Star, Quote, TrendingUp, ArrowRight } from "lucide-react";

// Business logo placeholders (generated). Replace with real customer logos later.
const LOGO_MAPLE = "https://static.prod-images.emergentagent.com/jobs/0cab01e6-4d2b-4117-ae3f-80ebc10fc6b4/images/ac00a2479a6ddabb814836d2d7f6c88b4bde206c22383ddc6ad56a5dd2318eb3.png";
const LOGO_BRIGHTSMILE = "https://static.prod-images.emergentagent.com/jobs/0cab01e6-4d2b-4117-ae3f-80ebc10fc6b4/images/fef4a635dad671bba2f53699661726e663c0fe0590b556ab80129ae8e730a14b.png";
const LOGO_ELITE = "https://static.prod-images.emergentagent.com/jobs/0cab01e6-4d2b-4117-ae3f-80ebc10fc6b4/images/daf24d6d3bdae9689feac28fab62de6968d9855ebdf6a02440a7ecd6ec7359c0.png";
const LOGO_WELLNESS = "https://static.prod-images.emergentagent.com/jobs/0cab01e6-4d2b-4117-ae3f-80ebc10fc6b4/images/c181187ef94cfbb1fb57bb8fd9039ad7dc67aae1bc1e7b0054986dfac24a7582.png";

const TESTIMONIALS = [
  {
    logo: LOGO_MAPLE,
    name: "Michael Thompson",
    business: "Maple Auto Care Inc.",
    location: "Toronto, Ontario, Canada",
    industry: "Auto Repair",
    quote:
      "BotNira changed the way we handle customer calls. We no longer miss repair inquiries when our team is busy. Customers can book appointments instantly, even after hours.",
    before: [
      { label: "Missed calls", value: "35–40/week" },
      { label: "Lost appointment requests", value: "15+/month" },
    ],
    after: [
      { label: "Calls answered", value: "100%" },
      { label: "Appointments booked", value: "42/month" },
    ],
  },
  {
    logo: LOGO_BRIGHTSMILE,
    name: "Dr. Sarah Williams",
    business: "BrightSmile Dental Clinic",
    location: "Vancouver, British Columbia, Canada",
    industry: "Dental Clinic",
    quote:
      "Our receptionist used to spend hours answering repetitive questions. BotNira now handles appointment bookings, cancellations, and patient inquiries while our staff focuses on patients.",
    before: [
      { label: "Daily calls", value: "55" },
      { label: "Reception time", value: "4+ hrs/day" },
    ],
    after: [
      { label: "Automated bookings", value: "85/month" },
      { label: "Response time", value: "<10 seconds" },
    ],
  },
  {
    logo: LOGO_ELITE,
    name: "Emma Carter",
    business: "Elite Driving Academy",
    location: "Hamilton, Ontario, Canada",
    industry: "Driving School",
    quote:
      "BotNira helps us convert more student inquiries into bookings. Parents and students get instant answers without waiting for office hours.",
    before: [
      { label: "Missed enquiries", value: "25/week" },
      { label: "Manual follow-ups", value: "Daily" },
    ],
    after: [
      { label: "Leads captured", value: "100%" },
      { label: "Trial lessons booked", value: "60+/month" },
    ],
  },
  {
    logo: LOGO_WELLNESS,
    name: "Dr. Emily Anderson",
    business: "Wellness First Clinic",
    location: "Calgary, Alberta, Canada",
    industry: "Healthcare Clinic",
    quote:
      "BotNira feels like having an additional receptionist available 24/7. It handles calls professionally and keeps our patients engaged.",
    before: [
      { label: "After-hours calls missed", value: "30+/month" },
      { label: "Appointment delays", value: "1–2 days" },
    ],
    after: [
      { label: "Customer response", value: "24/7" },
      { label: "Admin work reduced", value: "60%" },
    ],
  },
];

const Stars = () => (
  <div className="flex items-center gap-0.5" aria-label="5 out of 5 stars">
    {[...Array(5)].map((_, i) => (
      <Star key={i} size={15} className="fill-amber-400 text-amber-400" />
    ))}
  </div>
);

// Reusable premium testimonial card. Fully driven by props from TESTIMONIALS.
const TestimonialCard = ({ t, index }) => (
  <article
    data-testid={`testimonial-${index}`}
    className="group flex flex-col h-full rounded-2xl bg-white ring-1 ring-neutral-200 shadow-[0_2px_12px_rgba(15,23,42,0.06)] p-6 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.14)] hover:ring-[#002FA7]/30"
  >
    {/* Logo + rating */}
    <div className="flex items-center justify-between">
      <div className="w-14 h-14 rounded-full ring-1 ring-neutral-200 bg-white overflow-hidden grid place-items-center shadow-sm">
        {/* REPLACE-WITH-REAL-DATA: real customer business logo */}
        <img src={t.logo} alt={`${t.business} logo`} className="w-full h-full object-cover" loading="lazy" />
      </div>
      <Stars />
    </div>

    {/* Industry badge */}
    <div className="mt-4">
      <span className="inline-flex items-center rounded-full bg-[#002FA7]/10 text-[#002FA7] text-[11px] font-semibold tracking-wide px-3 py-1">
        {t.industry}
      </span>
    </div>

    {/* Quote */}
    <div className="mt-4 relative flex-1">
      <Quote size={22} className="text-[#002FA7]/20 absolute -top-1 -left-1" />
      <p className="relative text-[15px] leading-relaxed text-neutral-700 pl-1">{t.quote}</p>
    </div>

    {/* Customer info */}
    <div className="mt-5 pt-4 border-t border-neutral-100">
      <div className="font-semibold text-neutral-900 leading-tight">{t.name}</div>
      <div className="text-sm text-neutral-600">{t.business}</div>
      <div className="text-xs text-neutral-400 mt-0.5">{t.location}</div>
    </div>

    {/* Before vs After metrics */}
    <div className="mt-5 grid grid-cols-2 gap-3">
      <div className="rounded-xl bg-neutral-50 ring-1 ring-neutral-100 p-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Before</div>
        <ul className="mt-2 space-y-2">
          {t.before.map((m, i) => (
            <li key={i}>
              <div className="text-sm font-bold text-neutral-800 leading-none">{m.value}</div>
              <div className="text-[11px] text-neutral-500 mt-1 leading-tight">{m.label}</div>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl bg-emerald-50 ring-1 ring-emerald-100 p-3">
        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-600">
          <TrendingUp size={11} /> After
        </div>
        <ul className="mt-2 space-y-2">
          {t.after.map((m, i) => (
            <li key={i}>
              <div className="text-sm font-bold text-emerald-700 leading-none">{m.value}</div>
              <div className="text-[11px] text-emerald-600/80 mt-1 leading-tight">{m.label}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  </article>
);

export default function Reviews() {
  return (
    <section id="reviews" className="border-b-2 border-black bg-neutral-50" data-testid="reviews-section">
      <div className="max-w-7xl mx-auto px-6 py-20">
        {/* Header — kept consistent with the rest of the BotNira site */}
        <div className="max-w-3xl mb-12">
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">Customer stories</div>
          <h2 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-2">
            Real businesses. Real results.
          </h2>
          <p className="mt-4 text-neutral-600 text-lg">
            See how service businesses across Canada use BotNira to answer every call, capture every lead, and book appointments around the clock.
          </p>
        </div>

        {/* Desktop: 4 · Tablet: 2 · Mobile: 1 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 items-stretch">
          {TESTIMONIALS.map((t, i) => (
            <TestimonialCard key={t.business} t={t} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
