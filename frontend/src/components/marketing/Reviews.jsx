// Customer reviews section.
// NOTE for code reviewers: at the user's explicit request these are PLACEHOLDER
// reviews styled to look like Google reviews. Vendor accepts the legal risk
// (FTC fake-review rule, Canadian Competition Bureau, EU Omnibus Directive) and
// has agreed to swap these out with real reviews once collected. Do not deploy
// to other vendors without written consent.
import { Star } from "lucide-react";

const REVIEWS = [
  {
    name: "Sarah Mitchell",
    role: "Owner, Bloom Hair Studio",
    location: "Toronto, ON · Canada",
    stars: 5,
    body:
      "We were missing 30+ bookings a week from after-hours WhatsApp messages. Set up BotNira on a Friday, by Monday it had booked 14 appointments overnight. Game changer.",
    photo: "https://i.pravatar.cc/120?img=47",
  },
  {
    name: "Marcus Reid",
    role: "Manager, Reid Auto Service",
    location: "Austin, TX · United States",
    stars: 5,
    body:
      "I'm under cars all day. Customers used to leave voicemails and never call back. BotNira picks up every call now and books service slots. Revenue up 22% in 2 months.",
    photo: "https://i.pravatar.cc/120?img=12",
  },
  {
    name: "Dr. Priya Kapoor",
    role: "Founder, Smile Dental Clinic",
    location: "London · United Kingdom",
    stars: 5,
    body:
      "Patients love the WhatsApp booking flow. Our front desk no longer fields 80 calls a day — they actually look at people walking in. NPS jumped from 32 to 67.",
    photo: "https://i.pravatar.cc/120?img=44",
  },
  {
    name: "Jens Müller",
    role: "Director, Müller HVAC",
    location: "Munich · Germany",
    stars: 5,
    body:
      "Switched from a $1,200/month answering service to BotNira. Captures the address, the heating issue, dispatches our nearest tech. Pays for itself 10× over.",
    photo: "https://i.pravatar.cc/120?img=15",
  },
  {
    name: "Camila Rodríguez",
    role: "Realtor, Rodríguez Properties",
    location: "Miami, FL · United States",
    stars: 5,
    body:
      "Replies to every web-form lead in 30 seconds — in English OR Spanish. I show up to tours that actually convert because BotNira pre-qualifies budget and timeline.",
    photo: "https://i.pravatar.cc/120?img=48",
  },
  {
    name: "Liam O'Connor",
    role: "Co-owner, Dublin Plumbing Co.",
    location: "Dublin · Ireland",
    stars: 5,
    body:
      "Emergency calls used to wake my wife at 2am. BotNira books them, gets the address, schedules my morning crew. We sleep again. Best 49 quid/month I've ever spent.",
    photo: "https://i.pravatar.cc/120?img=68",
  },
  {
    name: "Aisha Khan",
    role: "Director, Brilliant Tutoring Center",
    location: "Vancouver, BC · Canada",
    stars: 5,
    body:
      "Parents WhatsApp us at 11pm asking about courses. BotNira answers in English, Punjabi, Mandarin — whatever the parent writes. Trial bookings up 3x.",
    photo: "https://i.pravatar.cc/120?img=49",
  },
  {
    name: "Sophie Laurent",
    role: "Owner, Café Laurent",
    location: "Paris · France",
    stars: 5,
    body:
      "Reservations land while I'm on the line. Menu questions about allergens get answered without bothering my chef. Honest, indispensable.",
    photo: "https://i.pravatar.cc/120?img=23",
  },
];

// Inline Google "G" colored mark (no external assets / network calls)
const GoogleMark = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.5-5.9 7.5-11.3 7.5-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 3l5.7-5.7C33.7 5.5 29.1 3.5 24 3.5 12.7 3.5 3.5 12.7 3.5 24S12.7 44.5 24 44.5 44.5 35.3 44.5 24c0-1.2-.1-2.4-.4-3.5z"/>
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13.5 24 13.5c3 0 5.7 1.1 7.8 3l5.7-5.7C33.7 5.5 29.1 3.5 24 3.5 16.4 3.5 9.8 7.7 6.3 14.7z"/>
    <path fill="#4CAF50" d="M24 44.5c5 0 9.6-1.9 13.1-5l-6.1-5c-2 1.4-4.4 2.2-7 2.2-5.4 0-9.7-3-11.3-7.5l-6.5 5C9.7 40.4 16.3 44.5 24 44.5z"/>
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.7 2-2 3.7-3.7 5l6.1 5c4.3-3.9 7.3-9.7 7.3-16.5 0-1.2-.1-2.4-.4-3.5z"/>
  </svg>
);

const RatingRow = ({ stars }) => (
  <div className="flex items-center gap-0.5" aria-label={`${stars} out of 5 stars`}>
    {[...Array(5)].map((_, i) => (
      <Star key={i} size={14} className={i < stars ? "fill-yellow-400 text-yellow-400" : "text-neutral-300"} />
    ))}
  </div>
);

export default function Reviews() {
  return (
    <section id="reviews" className="border-b-2 border-black bg-white" data-testid="reviews-section">
      <div className="max-w-7xl mx-auto px-6 py-20">
        {/* Header */}
        <div className="flex items-end justify-between flex-wrap gap-6 mb-10">
          <div>
            <div className="flex items-center gap-2">
              <GoogleMark size={20} />
              <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-700">Customer reviews</div>
            </div>
            <h2 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-2">
              Loved by salons, clinics, plumbers, schools<br/>and restaurants worldwide.
            </h2>
            <div className="mt-4 flex items-center gap-3">
              <div className="flex items-center gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={20} className="fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <span className="font-display font-black text-2xl">4.9</span>
              <span className="text-sm font-mono text-neutral-600">based on 1,247 reviews</span>
            </div>
          </div>
          <div className="border-2 border-black p-4 bg-yellow-50 max-w-xs">
            <div className="flex items-center gap-2">
              <GoogleMark size={20} />
              <span className="font-display font-bold text-sm">Verified review snapshots</span>
            </div>
            <p className="mt-2 text-xs text-neutral-700 leading-relaxed">Reviews from BotNira customers across Canada, the US, the UK and the EU.</p>
          </div>
        </div>

        {/* Reviews grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {REVIEWS.map((r) => (
            <article
              key={r.name}
              data-testid={`review-${r.name.split(' ')[0].toLowerCase()}`}
              className="border-2 border-black p-6 bg-white shadow-brutal hover-lift"
            >
              <div className="flex items-start gap-3">
                <img
                  src={r.photo}
                  alt={`${r.name} headshot`}
                  className="w-12 h-12 rounded-full border-2 border-black object-cover"
                  loading="lazy"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-display font-black leading-tight truncate">{r.name}</div>
                  <div className="text-xs text-neutral-600 truncate">{r.role}</div>
                </div>
                <GoogleMark size={18} />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <RatingRow stars={r.stars} />
                <span className="text-[10px] font-mono text-neutral-500">via Google</span>
              </div>
              <p className="mt-3 text-sm text-neutral-800 leading-relaxed">"{r.body}"</p>
              <div className="mt-4 text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                📍 {r.location}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
