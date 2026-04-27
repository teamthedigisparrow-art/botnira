// "Trusted by 6,000+ customers" social-proof strip.
// Per the user's brief, these are GENERIC FICTIONAL brand wordmarks built from
// inline SVG (so we don't infringe any real company's trademark). Designed to
// look like a polished customer logo wall without any legal exposure.
import { Building2 } from "lucide-react";

// Carefully designed SVG wordmarks. All faux brands. Each one renders as a
// single React node (no images, no network requests).
const BRANDS = [
  // 1. "SALON CO" — bold serif with circular dot
  () => (
    <svg viewBox="0 0 180 36" className="h-7 w-auto">
      <text x="0" y="26" fontFamily="Georgia, serif" fontWeight="900" fontSize="22" fill="currentColor">SALON</text>
      <circle cx="100" cy="14" r="5" fill="currentColor" />
      <text x="112" y="26" fontFamily="Georgia, serif" fontWeight="400" fontSize="22" fill="currentColor">CO</text>
    </svg>
  ),
  // 2. "DENTAFY" — modern sans-serif with custom 'A'
  () => (
    <svg viewBox="0 0 180 36" className="h-7 w-auto">
      <text x="0" y="26" fontFamily="Helvetica, Arial, sans-serif" fontWeight="800" fontSize="24" letterSpacing="-1" fill="currentColor">dentafy</text>
      <circle cx="156" cy="22" r="3" fill="currentColor"/>
    </svg>
  ),
  // 3. "AutoPro+" — bold italic + plus mark
  () => (
    <svg viewBox="0 0 180 36" className="h-7 w-auto">
      <text x="0" y="26" fontFamily="Impact, Haettenschweiler, sans-serif" fontWeight="900" fontStyle="italic" fontSize="26" fill="currentColor">AUTOPRO</text>
      <text x="130" y="22" fontFamily="Helvetica" fontWeight="700" fontSize="20" fill="currentColor">+</text>
    </svg>
  ),
  // 4. "Northpoint Realty" — refined wordmark
  () => (
    <svg viewBox="0 0 220 36" className="h-7 w-auto">
      <polygon points="0,8 14,8 7,2" fill="currentColor"/>
      <polygon points="0,28 14,28 7,34" fill="currentColor"/>
      <text x="22" y="26" fontFamily="Times New Roman, serif" fontWeight="700" fontSize="20" letterSpacing="0.5" fill="currentColor">NORTHPOINT</text>
    </svg>
  ),
  // 5. "GUSTO" w/ circle (restaurant style)
  () => (
    <svg viewBox="0 0 160 36" className="h-7 w-auto">
      <circle cx="14" cy="18" r="11" fill="none" stroke="currentColor" strokeWidth="2.5"/>
      <text x="32" y="26" fontFamily="Georgia, serif" fontStyle="italic" fontWeight="700" fontSize="22" fill="currentColor">Gusto</text>
    </svg>
  ),
  // 6. "BrightSchool" — friendly sans
  () => (
    <svg viewBox="0 0 200 36" className="h-7 w-auto">
      <rect x="0" y="6" width="22" height="22" rx="5" fill="currentColor"/>
      <text x="11" y="24" fontFamily="Helvetica" fontWeight="900" fontSize="14" textAnchor="middle" fill="white">B</text>
      <text x="30" y="26" fontFamily="Helvetica" fontWeight="800" fontSize="20" letterSpacing="-0.4" fill="currentColor">BrightSchool</text>
    </svg>
  ),
  // 7. "FixIt Squad" — bold compressed
  () => (
    <svg viewBox="0 0 200 36" className="h-7 w-auto">
      <text x="0" y="26" fontFamily="Impact, sans-serif" fontWeight="900" fontSize="26" letterSpacing="-1" fill="currentColor">FIXIT</text>
      <rect x="65" y="8" width="2" height="20" fill="currentColor"/>
      <text x="74" y="26" fontFamily="Helvetica" fontWeight="500" fontSize="18" fill="currentColor">SQUAD</text>
    </svg>
  ),
  // 8. "MedCare Clinic" — caduceus-ish line
  () => (
    <svg viewBox="0 0 200 36" className="h-7 w-auto">
      <path d="M8 6 V30 M2 12 H14 M2 24 H14" stroke="currentColor" strokeWidth="3" fill="none"/>
      <text x="22" y="26" fontFamily="Georgia, serif" fontWeight="700" fontSize="20" fill="currentColor">MedCare</text>
      <text x="118" y="26" fontFamily="Georgia, serif" fontWeight="400" fontSize="20" fill="currentColor">Clinic</text>
    </svg>
  ),
  // 9. "BARBER•BRO" — bold dot separator
  () => (
    <svg viewBox="0 0 200 36" className="h-7 w-auto">
      <text x="0" y="26" fontFamily="Helvetica" fontWeight="800" fontSize="22" letterSpacing="2" fill="currentColor">BARBER</text>
      <circle cx="93" cy="18" r="3" fill="currentColor"/>
      <text x="102" y="26" fontFamily="Helvetica" fontWeight="800" fontSize="22" letterSpacing="2" fill="currentColor">BRO</text>
    </svg>
  ),
  // 10. "TutorHQ" — friendly with arrow
  () => (
    <svg viewBox="0 0 180 36" className="h-7 w-auto">
      <text x="0" y="26" fontFamily="Helvetica" fontWeight="800" fontSize="22" letterSpacing="-0.5" fill="currentColor">TutorHQ</text>
      <path d="M115 22 L130 18 L130 26 Z" fill="currentColor"/>
    </svg>
  ),
  // 11. "VetWell" — paw mark
  () => (
    <svg viewBox="0 0 170 36" className="h-7 w-auto">
      <circle cx="9" cy="22" r="4" fill="currentColor"/>
      <circle cx="19" cy="14" r="3" fill="currentColor"/>
      <circle cx="28" cy="14" r="3" fill="currentColor"/>
      <circle cx="37" cy="22" r="4" fill="currentColor"/>
      <ellipse cx="22" cy="26" rx="8" ry="6" fill="currentColor"/>
      <text x="50" y="26" fontFamily="Georgia, serif" fontWeight="700" fontSize="22" fill="currentColor">VetWell</text>
    </svg>
  ),
  // 12. "PixelLawn" — ☘
  () => (
    <svg viewBox="0 0 200 36" className="h-7 w-auto">
      <rect x="0" y="6" width="6" height="6" fill="currentColor"/>
      <rect x="8" y="6" width="6" height="6" fill="currentColor"/>
      <rect x="0" y="14" width="6" height="6" fill="currentColor"/>
      <text x="22" y="26" fontFamily="Helvetica" fontWeight="900" fontSize="22" letterSpacing="-0.5" fill="currentColor">PixelLawn</text>
    </svg>
  ),
];

const ROW_A = BRANDS.slice(0, 6);
const ROW_B = BRANDS.slice(6, 12);

export default function TrustedBy() {
  return (
    <section className="border-b-2 border-black bg-black text-white" data-testid="trusted-by-section">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 border border-white/20 px-3 py-1 text-[10px] font-bold tracking-[0.25em] uppercase text-white/70">
            <Building2 size={12} /> Trusted across the world
          </div>
          <h2 className="mt-5 font-display text-4xl md:text-5xl font-black tracking-tighter">
            <span className="text-yellow-300">6,000+</span> businesses trust BotNira to handle their front desk.
          </h2>
          <p className="mt-3 text-sm font-mono text-white/60 max-w-2xl mx-auto">
            Salons, dental clinics, plumbers, restaurants, real-estate brokerages, schools, mechanics, vets and home-services teams. Across 47 countries.
          </p>
        </div>

        {/* Row A — flowing left */}
        <div className="mt-12 overflow-hidden border-y-2 border-white/10 py-8" aria-hidden="false">
          <div className="flex gap-14 animate-marquee text-white/85" style={{ width: "max-content" }}>
            {[...ROW_A, ...ROW_A, ...ROW_A].map((Logo, i) => (
              <div key={`a-${i}`} className="flex items-center justify-center min-w-[180px] opacity-70 hover:opacity-100 transition-opacity">
                <Logo />
              </div>
            ))}
          </div>
        </div>

        {/* Row B — flowing right */}
        <div className="overflow-hidden border-b-2 border-white/10 py-8">
          <div className="flex gap-14 animate-marquee-reverse text-white/85" style={{ width: "max-content" }}>
            {[...ROW_B, ...ROW_B, ...ROW_B].map((Logo, i) => (
              <div key={`b-${i}`} className="flex items-center justify-center min-w-[180px] opacity-70 hover:opacity-100 transition-opacity">
                <Logo />
              </div>
            ))}
          </div>
        </div>

        {/* Stats strip */}
        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { kpi: "6,000+", label: "Active businesses" },
            { kpi: "47", label: "Countries served" },
            { kpi: "1.2M", label: "Conversations / month" },
            { kpi: "4.9★", label: "Customer rating" },
          ].map((s) => (
            <div key={s.label} className="border border-white/15 p-5 text-center">
              <div className="font-display font-black text-3xl md:text-4xl tracking-tighter text-yellow-300">{s.kpi}</div>
              <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-white/60">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Inline marquee animation (CSS-only, no library) */}
      <style>{`
        @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes marquee-reverse { from { transform: translateX(-50%); } to { transform: translateX(0); } }
        .animate-marquee { animation: marquee 40s linear infinite; }
        .animate-marquee-reverse { animation: marquee-reverse 50s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .animate-marquee, .animate-marquee-reverse { animation: none; }
        }
      `}</style>
    </section>
  );
}
