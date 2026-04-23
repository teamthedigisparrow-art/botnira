import { Link } from "react-router-dom";
import { ArrowRight, MessageSquare, Phone, Mail, MessageCircle, Bot, BarChart3, ShieldCheck, Zap, Building2, Sparkles, Check } from "lucide-react";

const Nav = () => (
  <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b-2 border-black" data-testid="main-nav">
    <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
      <Link to="/" className="flex items-center gap-2" data-testid="brand-logo">
        <div className="w-8 h-8 bg-[#002FA7] border-2 border-black grid place-items-center">
          <span className="text-white font-black text-sm">B</span>
        </div>
        <span className="font-display font-black text-xl tracking-tight">BotNira</span>
      </Link>
      <div className="hidden md:flex items-center gap-8 text-sm font-medium">
        <a href="#features" className="hover:text-[#002FA7]" data-testid="nav-features">Features</a>
        <a href="#channels" className="hover:text-[#002FA7]" data-testid="nav-channels">Channels</a>
        <a href="#how" className="hover:text-[#002FA7]" data-testid="nav-how">How it works</a>
        <a href="#pricing" className="hover:text-[#002FA7]" data-testid="nav-pricing">Pricing</a>
      </div>
      <div className="flex items-center gap-3">
        <Link to="/login" className="text-sm font-bold hover:underline" data-testid="nav-login">Log in</Link>
        <Link to="/signup" data-testid="nav-signup" className="inline-flex items-center gap-2 bg-[#002FA7] text-white font-bold text-sm px-4 py-2 border-2 border-black shadow-brutal hover-lift">
          Get started <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  </nav>
);

const Hero = () => (
  <section className="relative border-b-2 border-black bg-grid">
    <div className="max-w-7xl mx-auto px-6 py-20 md:py-28 grid md:grid-cols-12 gap-10 items-center">
      <div className="md:col-span-7">
        <div className="inline-flex items-center gap-2 border-2 border-black px-3 py-1 mb-6 bg-white" data-testid="hero-badge">
          <Sparkles size={14} /> <span className="text-xs font-bold tracking-[0.15em] uppercase">Powered by GPT-5.2</span>
        </div>
        <h1 className="font-display text-5xl md:text-7xl font-black leading-[0.95] tracking-tighter">
          The AI front desk<br/>that never<br/>
          <span className="bg-[#002FA7] text-white px-3 inline-block">clocks out.</span>
        </h1>
        <p className="mt-6 text-lg md:text-xl max-w-xl text-neutral-700 font-medium">
          BotNira answers WhatsApp, email and chat for your business — 24/7.
          Trained only on your own information. Multi-tenant, vendor-ready.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link to="/signup" data-testid="hero-cta-start" className="inline-flex items-center gap-2 bg-[#002FA7] text-white font-bold px-6 py-3 border-2 border-black shadow-brutal-lg hover-lift">
            Start free <ArrowRight size={18} />
          </Link>
          <a href="#how" data-testid="hero-cta-demo" className="inline-flex items-center gap-2 bg-white font-bold px-6 py-3 border-2 border-black shadow-brutal hover-lift">
            See how it works
          </a>
        </div>
        <div className="mt-10 flex items-center gap-6 text-xs font-mono text-neutral-600">
          <span>NO CREDIT CARD</span>
          <span>•</span>
          <span>24/7 COVERAGE</span>
          <span>•</span>
          <span>MULTI-TENANT</span>
        </div>
      </div>
      <div className="md:col-span-5">
        <div className="border-2 border-black bg-white shadow-brutal-lg" data-testid="hero-preview">
          <div className="flex items-center justify-between border-b-2 border-black px-4 py-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-xs font-mono font-bold">LIVE — ACME DENTAL</span>
            </div>
            <span className="text-xs font-mono">#web</span>
          </div>
          <div className="p-5 space-y-3 text-sm">
            <div className="flex gap-2">
              <div className="w-8 h-8 border-2 border-black grid place-items-center font-bold">C</div>
              <div className="border-2 border-black px-3 py-2 max-w-xs">Hi, what are your hours on Saturday?</div>
            </div>
            <div className="flex gap-2 justify-end">
              <div className="bg-[#002FA7] text-white border-2 border-black px-3 py-2 max-w-xs">We're open Saturday 9am to 6pm. Would you like to book a slot?</div>
              <div className="w-8 h-8 bg-black text-white grid place-items-center font-bold text-xs">BN</div>
            </div>
            <div className="flex gap-2">
              <div className="w-8 h-8 border-2 border-black grid place-items-center font-bold">C</div>
              <div className="border-2 border-black px-3 py-2 max-w-xs">Yes, 2pm for a cleaning please.</div>
            </div>
            <div className="flex gap-2 justify-end">
              <div className="bg-[#002FA7] text-white border-2 border-black px-3 py-2 max-w-xs">Booked — Saturday at 2:00 PM for a cleaning. Can I grab your name and phone?</div>
              <div className="w-8 h-8 bg-black text-white grid place-items-center font-bold text-xs">BN</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const CHANNELS = [
  { icon: MessageCircle, label: "WhatsApp", sub: "Inbox + replies" },
  { icon: Mail, label: "Email", sub: "Auto-reply" },
  { icon: MessageSquare, label: "SMS & Chat", sub: "Web widget" },
];

const Channels = () => (
  <section id="channels" className="border-b-2 border-black">
    <div className="max-w-7xl mx-auto px-6 py-20">
      <div className="flex items-end justify-between flex-wrap gap-6 mb-10">
        <div>
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">Omnichannel</div>
          <h2 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-2">One bot. Every channel.</h2>
        </div>
        <p className="max-w-lg text-neutral-700">Unified inbox that handles every conversation — phone, WhatsApp, email, SMS, web chat — with the same trained brain.</p>
      </div>
      <div className="grid md:grid-cols-4 gap-0 border-2 border-black">
        {CHANNELS.map((c, i) => (
          <div key={c.label} className={`p-8 ${i < CHANNELS.length - 1 ? "md:border-r-2 border-black" : ""} hover:bg-[#002FA7] hover:text-white transition-colors group`} data-testid={`channel-${c.label.toLowerCase()}`}>
            <c.icon size={32} />
            <div className="mt-6 font-display font-black text-xl">{c.label}</div>
            <div className="text-xs font-mono mt-1 opacity-70 group-hover:opacity-100">{c.sub}</div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const Features = () => (
  <section id="features" className="border-b-2 border-black bg-neutral-50">
    <div className="max-w-7xl mx-auto px-6 py-20">
      <h2 className="font-display text-4xl md:text-5xl font-black tracking-tighter max-w-3xl">Your staff, minus the overhead.</h2>
      <div className="grid md:grid-cols-3 gap-6 mt-12">
        {[
          { icon: Bot, title: "Trained on your info only", body: "Feed it your business description and FAQs. BotNira strictly stays within your info — no hallucinations." },
          { icon: BarChart3, title: "Analytics that matter", body: "Conversations, resolution rate, channel mix, hourly activity. See what customers actually ask." },
          { icon: Building2, title: "Multi-tenant by design", body: "Every vendor is isolated. Onboard clients with one link. Superadmin sees everything." },
          { icon: ShieldCheck, title: "Human-in-the-loop", body: "Jump into any conversation and take over when the bot needs a hand." },
          { icon: Zap, title: "Ships in minutes", body: "Paste your business info, pick a tone, and your assistant is live." },
          { icon: Sparkles, title: "GPT-5.2 brain", body: "Latest OpenAI model, tuned with a strict grounding prompt for on-brand answers." },
        ].map((f) => (
          <div key={f.title} className="bg-white border-2 border-black p-6 hover-lift shadow-brutal" data-testid={`feature-${f.title.toLowerCase().replace(/\s+/g,'-')}`}>
            <f.icon size={28} />
            <div className="mt-4 font-display font-black text-xl">{f.title}</div>
            <div className="mt-2 text-sm text-neutral-700">{f.body}</div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const How = () => (
  <section id="how" className="border-b-2 border-black">
    <div className="max-w-7xl mx-auto px-6 py-20">
      <h2 className="font-display text-4xl md:text-5xl font-black tracking-tighter">Three steps to a 24/7 front desk.</h2>
      <div className="grid md:grid-cols-3 gap-6 mt-10">
        {[
          { n: "01", title: "Sign up your business", body: "Create a vendor account. Each vendor is a fully isolated workspace." },
          { n: "02", title: "Train BotNira", body: "Paste your business description + FAQs. Pick a tone. Done." },
          { n: "03", title: "Plug in channels", body: "Embed the web widget and connect WhatsApp via Meta Cloud API. Email & SMS coming soon." },
        ].map((s) => (
          <div key={s.n} className="border-2 border-black p-6 bg-white shadow-brutal">
            <div className="font-mono text-sm text-[#002FA7] font-bold">{s.n}</div>
            <div className="font-display font-black text-2xl mt-2">{s.title}</div>
            <div className="mt-2 text-sm text-neutral-700">{s.body}</div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const PLAN_DATA = [
  { id: "starter", name: "Starter", price: 49, min: 100, msg: 2000, tagline: "Solo & side-hustle receptionists" },
  { id: "growth", name: "Growth", price: 149, min: 500, msg: 8000, tagline: "Most businesses pick this", featured: true },
  { id: "pro", name: "Pro", price: 399, min: 1500, msg: 25000, tagline: "Clinics, agencies, multi-location" },
];

const Pricing = () => (
  <section id="pricing" className="border-b-2 border-black bg-white">
    <div className="max-w-7xl mx-auto px-6 py-20">
      <div className="flex items-end justify-between flex-wrap gap-6 mb-10">
        <div>
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">Pricing</div>
          <h2 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-2">Simple monthly plans.</h2>
        </div>
        <p className="max-w-md text-neutral-700">
          Every plan auto-renews monthly. <strong>5-day free trial</strong> — no card required to start. Cancel anytime.
        </p>
      </div>
      <div className="grid md:grid-cols-3 gap-6">
        {PLAN_DATA.map(p => (
          <div
            key={p.id}
            data-testid={`landing-plan-${p.id}`}
            className={`border-2 border-black p-7 shadow-brutal bg-white ${p.featured ? "ring-4 ring-[#002FA7]" : ""}`}
          >
            {p.featured && <div className="inline-block bg-[#002FA7] text-white text-[10px] font-bold uppercase tracking-widest px-2 py-1 border border-black mb-3">Most popular</div>}
            <div className="font-display font-black text-3xl">{p.name}</div>
            <div className="text-sm text-neutral-600 mt-1">{p.tagline}</div>
            <div className="mt-5 flex items-baseline gap-1">
              <span className="font-display font-black text-6xl tracking-tighter">${p.price}</span>
              <span className="text-xs font-mono text-neutral-500">/mo USD</span>
            </div>
            <ul className="mt-6 space-y-2 text-sm">
              <li className="flex items-center gap-2"><Check size={14} className="text-green-700"/> <strong>{p.min}</strong> voice minutes/mo</li>
              <li className="flex items-center gap-2"><Check size={14} className="text-green-700"/> <strong>{p.msg.toLocaleString()}</strong> AI messages/mo</li>
              <li className="flex items-center gap-2"><Check size={14} className="text-green-700"/> Voice · WhatsApp · Web · Email · SMS</li>
              <li className="flex items-center gap-2"><Check size={14} className="text-green-700"/> Live agent override (inbox)</li>
              <li className="flex items-center gap-2"><Check size={14} className="text-green-700"/> Hard-stop at zero — no bill shocks</li>
              <li className="flex items-center gap-2"><Check size={14} className="text-green-700"/> Top-up packs never expire</li>
            </ul>
            <Link
              to="/signup"
              data-testid={`landing-plan-cta-${p.id}`}
              className={`mt-7 block text-center font-bold px-6 py-3 border-2 border-black shadow-brutal hover-lift ${p.featured ? "bg-[#002FA7] text-white" : "bg-white"}`}
            >
              Start 5-day free trial
            </Link>
          </div>
        ))}
      </div>
      <p className="mt-10 text-center text-sm font-mono text-neutral-600">
        Need more minutes? Grab a <strong>one-time top-up</strong> (Spark → Armada, $125 to $5,499) from your billing page. Never expires.
      </p>
    </div>
  </section>
);

const Footer = () => (
  <footer className="border-t-2 border-black">
    <div className="max-w-7xl mx-auto px-6 py-8 flex flex-wrap justify-between items-center text-sm font-mono gap-4">
      <span>© 2026 BotNira</span>
      <div className="flex items-center gap-6">
        <Link to="/privacy" className="hover:text-[#002FA7]" data-testid="footer-privacy">Privacy</Link>
        <Link to="/terms" className="hover:text-[#002FA7]" data-testid="footer-terms">Terms</Link>
      </div>
      <span>Built for front desks that sleep.</span>
    </div>
  </footer>
);

export default function Landing() {
  return (
    <div data-testid="landing-page">
      <Nav /><Hero /><Channels /><Features /><How /><Pricing /><Footer />
    </div>
  );
}
