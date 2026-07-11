import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowRight, MessageSquare, Phone, Mail, MessageCircle, Bot, BarChart3, ShieldCheck, Zap, Building2, Sparkles, Check, Calendar, Headphones, ShoppingBag, GraduationCap, Scissors, Stethoscope, Wrench, Briefcase, Users, PackageCheck, Languages, PhoneCall, PlayCircle, Lock, MapPin, Database, PhoneForwarded } from "lucide-react";
import BrandMark from "../components/BrandMark";
import Reviews from "../components/marketing/Reviews";
import TrustedBy from "../components/marketing/TrustedBy";
import SocialIcons from "../components/marketing/SocialIcons";
import { USE_CASE_PAGES } from "../data/useCases";

import SiteNav from "../components/marketing/SiteNav";
const Nav = () => <SiteNav />;

const CEO_IMG = "https://customer-assets.emergentagent.com/job_0cab01e6-4d2b-4117-ae3f-80ebc10fc6b4/artifacts/0jvkuxmu_CEO%20image.png";
const CALL_AUDIO = "https://customer-assets.emergentagent.com/job_0cab01e6-4d2b-4117-ae3f-80ebc10fc6b4/artifacts/n1tbemay_botnira%20call%20recording%20update.m4a";

const Hero = () => {
  const PHONE = "+12897784594";
  const PHONE_DISPLAY = "+1 (289) 778-4594";
  return (
  <section className="relative border-b-2 border-black bg-grid">
    <div className="max-w-7xl mx-auto px-6 py-16 md:py-24 grid md:grid-cols-12 gap-10 items-center">
      <div className="md:col-span-7">
        <div className="inline-flex items-center gap-2 border-2 border-black px-3 py-1 mb-6 bg-white" data-testid="hero-badge">
          <Sparkles size={14} /> <span className="text-xs font-bold tracking-[0.15em] uppercase">AI Receptionist · AI Calling Software</span>
        </div>
        <h1 className="font-display text-5xl md:text-7xl font-black leading-[0.95] tracking-tighter">
          The AI receptionist<br/>that never<br/>
          <span className="bg-[#002FA7] text-white px-3 inline-block">clocks out.</span>
        </h1>
        <p className="mt-6 text-lg md:text-xl max-w-2xl text-neutral-700 font-medium">
          Don't take our word for it — <strong>hear it.</strong> BotNira answers your phone calls, WhatsApp, SMS, email and chat <strong>24/7</strong>, books appointments automatically, and speaks your customer's language.
        </p>

        {/* Click-to-call — the single biggest trust builder */}
        <a href={`tel:${PHONE}`} data-testid="hero-call-now" className="mt-7 inline-flex items-center gap-3 border-2 border-black bg-yellow-300 px-5 py-3 shadow-brutal hover-lift">
          <PhoneCall size={22} />
          <span className="text-left">
            <span className="block text-[10px] font-bold tracking-[0.2em] uppercase text-black/60">Call our AI right now</span>
            <span className="block font-display font-black text-xl md:text-2xl tracking-tight">{PHONE_DISPLAY}</span>
          </span>
        </a>

        <div className="mt-6 flex flex-wrap gap-4">
          <Link to="/signup" data-testid="hero-cta-start" className="inline-flex items-center gap-2 bg-[#002FA7] text-white font-bold px-6 py-3 border-2 border-black shadow-brutal-lg hover-lift">
            Start free <ArrowRight size={18} />
          </Link>
          <a href="#hear-call" data-testid="hero-cta-listen" className="inline-flex items-center gap-2 bg-white font-bold px-6 py-3 border-2 border-black shadow-brutal hover-lift">
            <PlayCircle size={18} /> Hear a real call
          </a>
        </div>

        {/* Risk reversal — loud & stacked */}
        <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-bold" data-testid="hero-risk-reversal">
          {["5-day free trial", "No credit card", "Cancel anytime", "Live in 3 minutes"].map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5"><Check size={15} className="text-green-700"/> {t}</span>
          ))}
        </div>
      </div>

      {/* Hear-it-for-yourself card */}
      <div className="md:col-span-5">
        <div id="hear-call" className="border-2 border-black bg-white shadow-brutal-lg scroll-mt-24" data-testid="hero-audio-card">
          <div className="flex items-center justify-between border-b-2 border-black px-4 py-2 bg-[#002FA7] text-white">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs font-mono font-bold">REAL BOTNIRA CALL</span>
            </div>
            <span className="text-xs font-mono">🎧 listen</span>
          </div>
          <div className="p-5">
            <div className="font-display font-black text-2xl tracking-tight">Hear it before we tell you about it.</div>
            <p className="mt-2 text-sm text-neutral-700">A real recording of BotNira handling a live call — natural voice, no robotic script-reading, books the appointment on its own.</p>
            <audio controls preload="none" className="mt-4 w-full" data-testid="hero-audio-player">
              <source src={CALL_AUDIO} type="audio/mp4" />
              Your browser does not support the audio element.
            </audio>
            <div className="mt-4 flex items-center gap-3 border-2 border-black bg-neutral-50 px-3 py-2">
              <PhoneForwarded size={18} className="shrink-0 text-[#002FA7]"/>
              <span className="text-xs font-medium text-neutral-700">Prefer to talk? Tap the yellow number above to call BotNira yourself — it answers in under a second.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
  );
};

const CHANNELS = [
  { icon: Phone, label: "Voice Calls", sub: "Prepaid minutes" },
  { icon: MessageCircle, label: "WhatsApp", sub: "Inbox + replies" },
  { icon: Mail, label: "Email", sub: "Auto-reply" },
  { icon: MessageSquare, label: "SMS & Chat", sub: "Web widget" },
];

const Channels = () => (
  <section id="channels" className="border-b-2 border-black">
    <div className="max-w-7xl mx-auto px-6 py-20">
      <div className="flex items-end justify-between flex-wrap gap-6 mb-10">
        <div>
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">Omnichannel AI Receptionist</div>
          <h2 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-2">One AI. Every channel.</h2>
        </div>
        <p className="max-w-lg text-neutral-700">A unified inbox that handles every conversation — <strong>AI phone calling</strong>, WhatsApp, email, SMS, web chat — all powered by the same trained brain.</p>
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
          { icon: Languages, title: "Speaks every language", body: "BotNira auto-detects the customer's language and replies fluently in 95+ languages — English, Spanish, French, Hindi, Arabic, Chinese, and more. Train once, serve globally." },
          { icon: ShieldCheck, title: "Human-in-the-loop", body: "Jump into any conversation and take over when the bot needs a hand." },
          { icon: Zap, title: "Ships in minutes", body: "Paste your business info, pick a tone, and your assistant is live." },
          { icon: Sparkles, title: "Best-in-class AI brain", body: "Tuned with a strict grounding prompt so BotNira only ever answers with on-brand info from your business profile." },
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

const USE_CASES = [
  { icon: Calendar, title: "Books appointments", body: "Collects name, phone and preferred time across chat, WhatsApp and voice calls — appointment lands in your calendar, confirmation goes back to the customer instantly." },
  { icon: Headphones, title: "Handles customer support", body: "Answers FAQs, troubleshoots common issues, escalates to a human only when it actually needs one." },
  { icon: Users, title: "Works as a customer support executive", body: "Takes the ticket, captures the issue, classifies it, and keeps the customer informed — 24/7 without a shift roster." },
  { icon: ShoppingBag, title: "Tells website visitors what you offer", body: "Embedded as a web widget, it pitches your services, shares pricing, links to bookings — turning browsers into leads while you sleep." },
  { icon: Stethoscope, title: "Runs a clinic front desk", body: "Patient intake, appointment scheduling, insurance questions, prescription refill requests — all captured and logged." },
  { icon: Scissors, title: "Powers salons, spas & beauty bars", body: "Books haircuts, facials and waxing slots. Remembers stylist preferences, handles reschedules, sends reminders." },
  { icon: Wrench, title: "Dispatches service & trade businesses", body: "For plumbers, electricians, HVAC: captures job details, address, urgency; auto-assigns to the right technician." },
  { icon: Briefcase, title: "Qualifies leads for sales teams", body: "Asks the right discovery questions, scores leads, pushes hot ones to your team — cold ones get a nurture drip." },
  { icon: GraduationCap, title: "Answers queries for schools & coaching centers", body: "Course details, fees, admission process, class timings — translated to every parent's language automatically." },
  { icon: PackageCheck, title: "Runs order tracking & e-commerce support", body: "Where's-my-order queries, returns, sizing questions — resolved instantly so your support team handles only the tricky stuff." },
];

// Map landing-card titles → use-case detail page slugs (where one exists)
const USECASE_SLUG_BY_TITLE = {
  "Powers salons, spas & beauty bars": "salon",
  "Runs a clinic front desk": "dental",
  "Dispatches service & trade businesses": "home-services",
  "Qualifies leads for sales teams": "real-estate",
  "Answers queries for schools & coaching centers": "education",
  "Runs order tracking & e-commerce support": "restaurant",
};

const UseCases = () => (
  <section id="usecases" className="border-b-2 border-black bg-white">
    <div className="max-w-7xl mx-auto px-6 py-20">
      <div className="flex items-end justify-between flex-wrap gap-6 mb-10">
        <div>
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">Use cases</div>
          <h2 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-2">Where BotNira shows up for you.</h2>
        </div>
        <p className="max-w-md text-neutral-700">
          From dental clinics to plumbing crews to online stores — wherever a customer expects a reply, BotNira is already replying.
        </p>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
        {USE_CASES.map((u, i) => {
          const slug = USECASE_SLUG_BY_TITLE[u.title];
          const Card = (
            <div className={`border-2 border-black bg-white p-6 hover-lift shadow-brutal ${slug ? "cursor-pointer h-full" : ""}`} data-testid={`usecase-${i}`}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-[#002FA7] text-white border-2 border-black grid place-items-center shrink-0">
                  <u.icon size={18}/>
                </div>
                <div>
                  <div className="font-display font-black text-lg leading-tight">{u.title}</div>
                </div>
              </div>
              <div className="mt-3 text-sm text-neutral-700 leading-relaxed">{u.body}</div>
              {slug && (
                <div className="mt-4 text-xs font-bold tracking-widest uppercase text-[#002FA7] inline-flex items-center gap-1">
                  Learn more <ArrowRight size={12}/>
                </div>
              )}
            </div>
          );
          return slug ? (
            <Link to={`/use-case/${slug}`} key={u.title} className="block">{Card}</Link>
          ) : (
            <div key={u.title}>{Card}</div>
          );
        })}
      </div>

      {/* Direct deep-links for SEO crawlers — also usable by humans */}
      <div className="mt-10 border-t-2 border-black pt-6">
        <div className="text-xs font-bold tracking-widest uppercase text-neutral-600 mb-3">Industry-specific guides</div>
        <div className="flex flex-wrap gap-2">
          {USE_CASE_PAGES.map((u) => (
            <Link
              key={u.slug}
              to={`/use-case/${u.slug}`}
              data-testid={`uc-tag-${u.slug}`}
              className="border-2 border-black px-3 py-1 text-sm font-bold hover:bg-yellow-200"
            >
              AI for {u.industry} →
            </Link>
          ))}
        </div>
      </div>
    </div>
  </section>
);

const LANGUAGE_GRID = [
  "English", "Español", "Français", "Deutsch", "Italiano", "Português", "हिन्दी", "العربية", "中文", "日本語",
  "한국어", "Русский", "Türkçe", "Nederlands", "Svenska", "Polski", "فارسی", "ไทย", "Tiếng Việt", "Bahasa",
];

const MultiLanguage = () => (
  <section id="language" className="border-b-2 border-black bg-[#002FA7] text-white relative overflow-hidden">
    <div className="absolute inset-0 opacity-10 pointer-events-none select-none" aria-hidden="true" style={{
      backgroundImage: "radial-gradient(rgba(255,255,255,0.4) 1px, transparent 1px)",
      backgroundSize: "22px 22px",
    }}/>
    <div className="max-w-7xl mx-auto px-6 py-24 relative">
      <div className="grid md:grid-cols-[1.2fr_1fr] gap-12 items-center">
        <div>
          <div className="inline-flex items-center gap-2 bg-white text-[#002FA7] border-2 border-black px-3 py-1 font-bold text-xs tracking-[0.2em] uppercase shadow-brutal" data-testid="language-badge">
            <Languages size={14}/> Multi-language, built in
          </div>
          <h2 className="font-display text-5xl md:text-6xl lg:text-7xl font-black tracking-tighter mt-5 leading-[0.95]">
            One BotNira.<br/>
            <span className="italic" style={{color:"#ffdd00"}}>Every language.</span>
          </h2>
          <p className="mt-6 text-lg opacity-90 max-w-xl leading-relaxed">
            Train your bot once in your own language. BotNira auto-detects what the customer is writing or speaking —
            English, Spanish, Hindi, Arabic, Chinese, French, 90+ others — and replies fluently in the same language.
            No translation plugins, no per-language retraining, no extra fees.
          </p>
          <div className="mt-8 grid grid-cols-2 md:grid-cols-3 gap-3 max-w-xl">
            {[
              { t: "Auto-detect", s: "Per-message language switch" },
              { t: "Voice too", s: "Calls in caller's language" },
              { t: "No retrain", s: "Train in one language, serve all" },
            ].map(b => (
              <div key={b.t} className="border-2 border-black bg-black/20 backdrop-blur px-3 py-2">
                <div className="font-display font-black">{b.t}</div>
                <div className="text-xs font-mono opacity-80">{b.s}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="border-2 border-black bg-white text-black p-6 shadow-brutal-lg" data-testid="language-grid">
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-500 mb-4">A few of the 95+ languages</div>
          <div className="flex flex-wrap gap-2">
            {LANGUAGE_GRID.map(l => (
              <span key={l} className="px-3 py-1 border-2 border-black font-display font-bold text-sm hover:bg-[#002FA7] hover:text-white transition-colors cursor-default">
                {l}
              </span>
            ))}
            <span className="px-3 py-1 border-2 border-black font-mono text-xs bg-neutral-100">+ 75 more</span>
          </div>
          <div className="mt-5 border-2 border-dashed border-black/40 p-3 font-mono text-xs text-neutral-700">
            <strong>Example:</strong> Your bot is trained in English. A customer messages in हिन्दी — BotNira replies in हिन्दी.
            Next message arrives in Español — BotNira switches to Español mid-conversation. Zero config.
          </div>
        </div>
      </div>
    </div>
  </section>
);

const TryLive = () => {
  const PHONE = "+12897784594";
  const PHONE_DISPLAY = "+1 (289) 778-4594";
  const WA = "919041710721";
  const WA_DISPLAY = "+91 90417 10721";
  const prefilled = encodeURIComponent("Hi BotNira — How you work for me?.");
  return (
    <section id="try" className="border-b-2 border-black bg-[#002FA7] text-white relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.08] pointer-events-none" aria-hidden="true" style={{
        backgroundImage: "radial-gradient(rgba(255,255,255,.9) 1.5px, transparent 1.5px)",
        backgroundSize: "32px 32px",
      }}/>
      <div className="max-w-7xl mx-auto px-6 py-20 md:py-24 relative">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-[#ffdd00] text-black border-2 border-black px-3 py-1 font-bold text-xs tracking-[0.2em] uppercase shadow-brutal" data-testid="try-badge">
            <PlayCircle size={14}/> Try it right now — no signup
          </div>
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter mt-5 leading-[0.95]">
            Talk to BotNira<br/>
            <span className="italic" style={{color:"#ffdd00"}}>before you buy it.</span>
          </h2>
          <p className="mt-5 text-lg opacity-90 max-w-2xl leading-relaxed">
            Pick any of the three channels below and have a real conversation with a BotNira trained on
            <strong> The DigiSparrow</strong> — book a fake demo, ask about pricing, speak in Hindi or Spanish.
            This is the same agent your own customers will talk to.
          </p>
        </div>
        <div className="mt-10 grid md:grid-cols-3 gap-5">
          <a href={`tel:${PHONE}`} data-testid="try-call-btn" className="group border-2 border-black bg-white text-black p-6 shadow-brutal hover:shadow-brutal-lg hover:-translate-y-1 transition-all block">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 bg-[#002FA7] text-white border-2 border-black grid place-items-center"><PhoneCall size={22}/></div>
              <span className="text-[10px] font-bold tracking-widest uppercase bg-black text-white px-2 py-1 border border-black">Call us</span>
            </div>
            <div className="mt-5 text-xs font-bold tracking-[0.2em] uppercase text-neutral-500">Phone & SMS</div>
            <div className="mt-2 font-display font-black text-2xl tracking-tight" data-testid="try-phone-display">{PHONE_DISPLAY}</div>
            <div className="mt-3 text-sm text-neutral-700 leading-snug">
              Dial this number. BotNira answers in &lt;1 second, speaks naturally, can be interrupted, and transcribes the entire call into your Inbox.
            </div>
            <div className="mt-5 flex items-center gap-2 font-bold text-sm text-[#002FA7] group-hover:underline">Tap to call <ArrowRight size={14}/></div>
          </a>
          <a href={`https://wa.me/${WA}?text=${prefilled}`} target="_blank" rel="noopener noreferrer" data-testid="try-whatsapp-btn" className="group border-2 border-black bg-white text-black p-6 shadow-brutal hover:shadow-brutal-lg hover:-translate-y-1 transition-all block">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 bg-[#25D366] text-black border-2 border-black grid place-items-center"><MessageCircle size={22}/></div>
              <span className="text-[10px] font-bold tracking-widest uppercase bg-black text-white px-2 py-1 border border-black">WhatsApp</span>
            </div>
            <div className="mt-5 text-xs font-bold tracking-[0.2em] uppercase text-neutral-500">WhatsApp</div>
            <div className="mt-2 font-display font-black text-2xl tracking-tight" data-testid="try-wa-display">{WA_DISPLAY}</div>
            <div className="mt-3 text-sm text-neutral-700 leading-snug">
              Opens WhatsApp with BotNira as the recipient. Ask anything — hours, pricing, book a demo — it replies instantly in your language.
            </div>
            <div className="mt-5 flex items-center gap-2 font-bold text-sm text-[#002FA7] group-hover:underline">Open WhatsApp <ArrowRight size={14}/></div>
          </a>
          <button type="button" onClick={() => {
            const btn = document.querySelector("#botnira-launcher") || document.querySelector("[data-botnira-launcher]");
            if (btn) btn.click();
            else window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
          }} data-testid="try-webchat-btn" className="group border-2 border-black bg-white text-black p-6 shadow-brutal hover:shadow-brutal-lg hover:-translate-y-1 transition-all text-left cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 bg-[#ffdd00] text-black border-2 border-black grid place-items-center"><MessageSquare size={22}/></div>
              <span className="text-[10px] font-bold tracking-widest uppercase bg-black text-white px-2 py-1 border border-black">Web chat</span>
            </div>
            <div className="mt-5 text-xs font-bold tracking-[0.2em] uppercase text-neutral-500">Right on this page</div>
            <div className="mt-2 font-display font-black text-2xl tracking-tight">Open the chat widget</div>
            <div className="mt-3 text-sm text-neutral-700 leading-snug">
              The floating BotNira button at the bottom-right of this page is live. Click it, ask a question, watch it handle appointment booking in real time.
            </div>
            <div className="mt-5 flex items-center gap-2 font-bold text-sm text-[#002FA7] group-hover:underline">Tap to chat <ArrowRight size={14}/></div>
          </button>
        </div>
        <div className="mt-10 inline-flex items-center gap-3 bg-black/25 backdrop-blur border-2 border-white/20 px-4 py-2 text-sm font-mono">
          <Sparkles size={14} style={{color:"#ffdd00"}}/>
          Every channel is the SAME trained agent. Book a demo on the phone, confirm it on WhatsApp, change it in web chat — it's all one brain.
        </div>
      </div>
    </section>
  );
};


const How = () => (
  <section id="how" className="border-b-2 border-black">
    <div className="max-w-7xl mx-auto px-6 py-20">
      <h2 className="font-display text-4xl md:text-5xl font-black tracking-tighter">Three steps to a 24/7 AI receptionist.</h2>
      <div className="grid md:grid-cols-3 gap-6 mt-10">
        {[
          { n: "01", title: "Sign up your business", body: "Create a vendor account. Each vendor is a fully isolated workspace with its own AI." },
          { n: "02", title: "Train your AI receptionist", body: "Paste your business description + FAQs. Pick a tone and a voice. Done in 5 minutes." },
          { n: "03", title: "Plug in calling & channels", body: "Buy an AI calling number, embed the web widget, connect WhatsApp / Email / SMS — all in one inbox." },
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
  { id: "basic", name: "Basic", price: 29, min: 0, msg: 1000, tagline: "Web + chat-only starter", channels: "WhatsApp · Web · Email" },
  { id: "starter", name: "Starter", price: 49, min: 100, msg: 2000, tagline: "Solo & side-hustle receptionists", channels: "Voice · WhatsApp · Web · Email · SMS" },
  { id: "growth", name: "Growth", price: 149, min: 500, msg: 8000, tagline: "Most businesses pick this", featured: true, salesAssistant: true, channels: "Voice · WhatsApp · Web · Email · SMS" },
  { id: "pro", name: "Pro", price: 399, min: 1500, msg: 25000, tagline: "Clinics, agencies, multi-location", salesAssistant: true, channels: "Voice · WhatsApp · Web · Email · SMS" },
];

const Pricing = () => (
  <section id="pricing" className="border-b-2 border-black bg-white">
    <div className="max-w-7xl mx-auto px-6 py-20">
      <div className="flex items-end justify-between flex-wrap gap-6 mb-10">
        <div>
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">Pricing</div>
          <h2 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-2">Simple monthly plans.</h2>
          <p className="mt-2 text-sm text-neutral-600 italic" data-testid="pricing-value-line">If BotNira saves only ONE customer per month, it pays for itself.</p>
        </div>
        <p className="max-w-md text-neutral-700">
          Every plan auto-renews monthly. <strong>5-day free trial</strong> — no card required to start. Cancel anytime.
        </p>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {PLAN_DATA.map(p => (
          <div
            key={p.id}
            data-testid={`landing-plan-${p.id}`}
            className={`relative border-2 border-black p-7 shadow-brutal bg-white ${p.featured ? "ring-4 ring-[#002FA7]" : ""}`}
          >
            {p.salesAssistant && (
              <div data-testid={`sales-assistant-badge-${p.id}`} className="sales-assistant-badge">
                <Sparkles size={11} className="inline -mt-0.5 mr-1" />
                Sales Assistant Included
              </div>
            )}
            {p.featured && <div className="inline-block bg-[#002FA7] text-white text-[10px] font-bold uppercase tracking-widest px-2 py-1 border border-black mb-3">Most popular</div>}
            <div className="font-display font-black text-3xl">{p.name}</div>
            <div className="text-sm text-neutral-600 mt-1">{p.tagline}</div>
            <div className="mt-5 flex items-baseline gap-1">
              <span className="font-display font-black text-6xl tracking-tighter">${p.price}</span>
              <span className="text-xs font-mono text-neutral-500">/mo USD</span>
            </div>
            <div className="text-[11px] font-mono text-neutral-500 mt-1">+ 13% HST · ${(p.price * 1.13).toFixed(2)}/mo total</div>
            <ul className="mt-6 space-y-2 text-sm">
              {p.min > 0 ? (
                <li className="flex items-center gap-2"><Check size={14} className="text-green-700"/> <strong>{p.min}</strong> voice minutes/mo</li>
              ) : (
                <li className="flex items-center gap-2 text-neutral-400"><Lock size={13}/> No voice/SMS (chat-only)</li>
              )}
              <li className="flex items-center gap-2"><Check size={14} className="text-green-700"/> <strong>{p.msg.toLocaleString()}</strong> AI messages/mo</li>
              <li className="flex items-center gap-2"><Check size={14} className="text-green-700"/> {p.channels}</li>
              <li className="flex items-center gap-2"><Check size={14} className="text-green-700"/> Live agent override (inbox)</li>
              <li className="flex items-center gap-2"><Check size={14} className="text-green-700"/> Hard-stop at zero — no bill shocks</li>
              <li className="flex items-center gap-2"><Check size={14} className="text-green-700"/> Top-up packs never expire</li>
              {p.salesAssistant && (
                <li className="flex items-center gap-2 font-bold text-[#002FA7]">
                  <Sparkles size={14}/> AI Sales Assistant — outbound email campaigns
                </li>
              )}
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
      <div className="mt-4 max-w-2xl mx-auto border-2 border-amber-700 bg-amber-50 px-4 py-2 text-xs font-mono text-center" data-testid="landing-tax-notice">
        <strong>Heads up:</strong> All prices in USD. <strong>13% HST</strong> (Canadian Harmonized Sales Tax) is added to every plan and top-up at checkout.
      </div>
    </div>
  </section>
);

const FAQS = [
  {
    q: "What is an AI receptionist and how does it work?",
    a: "An AI receptionist is a virtual front-desk agent powered by BotNira's large-language-model engine that answers customer phone calls, WhatsApp messages, SMS, emails and website chats on your behalf, 24/7. BotNira is trained on your business description and FAQs, so it answers only with your information — no hallucinations. It can book appointments, capture leads, and hand off to a human when needed.",
  },
  {
    q: "Can BotNira answer phone calls instead of a real receptionist?",
    a: "Yes. BotNira connects to a business phone number and answers inbound calls in natural voice, handles customer inquiries, and books appointments. Voice calling uses prepaid minutes included in every plan, with auto-pause when you hit your limit so you never get a surprise bill.",
  },
  {
    q: "How does BotNira integrate with WhatsApp Business?",
    a: "We use the official Meta WhatsApp Cloud API via Embedded Signup. In about 90 seconds you connect your WhatsApp Business number, and BotNira auto-wires the webhook, subscribes to message events, and goes live. Your conversations appear in a unified Inbox alongside web chat and SMS.",
  },
  {
    q: "How much does BotNira cost per month?",
    a: "BotNira offers four monthly plans in USD: Basic $29 (1,000 AI messages, WhatsApp + Web + Email only), Starter $49 (100 voice min + 2,000 AI messages), Growth $149 (500 min + 8,000 messages), and Pro $399 (1,500 min + 25,000 messages). Starter and above include every channel — phone, WhatsApp, email, SMS, and web chat. Top-up packs are available from $125 and never expire. Every new vendor gets a 5-day free trial with no credit card required.",
  },
  {
    q: "Is my customer data safe with BotNira?",
    a: "Yes. BotNira keeps each business in a separate workspace, and customer data never crosses between vendors. Messages are encrypted in transit (TLS 1.3), stored with role-based access, and only the minimum data needed to generate a reply is shared with our AI engine. See our Privacy Policy for full details.",
  },
  {
    q: "Can I try BotNira for free before I pay?",
    a: "Absolutely. Every new signup gets a 5-day free trial on the Web Widget and WhatsApp channel — up to 100 AI messages, no credit card required. Voice, Email and SMS unlock automatically when you subscribe to any paid plan.",
  },
  {
    q: "How does BotNira compare to traditional call center software?",
    a: "Traditional call centers charge per-agent ($200–$500/seat/month) and only cover phone calls. BotNira is a single unified AI that covers phone, WhatsApp, email, SMS, and web chat at a flat monthly rate starting at $49, with no per-seat pricing. It scales instantly — answer 1 call or 1,000 concurrent conversations without hiring more staff.",
  },
  {
    q: "Does BotNira work for multi-location businesses and agencies?",
    a: "Yes. BotNira is built for agencies and multi-location businesses: a single superadmin can onboard and manage dozens of businesses (vendors), each with their own isolated workspace, bot training, phone number, and analytics. Agencies use BotNira to resell AI receptionist services to their own clients under their own brand.",
  },
  {
    q: "What languages does BotNira support?",
    a: "BotNira speaks every major world language out of the box — English, Spanish, French, German, Portuguese, Italian, Hindi, Arabic, Chinese, Japanese and 90+ others. You train it once in your own language and it responds in whatever language your customer writes in.",
  },
  {
    q: "Can a human take over a conversation if the AI can't help?",
    a: "Yes. Every conversation across every channel lands in a unified Inbox. Your team can jump in at any time, type a reply directly, and it goes back to the customer through the same channel (WhatsApp, web chat, etc.). You get full human-in-the-loop control without abandoning the AI's speed.",
  },
];

const FAQ = () => (
  <section id="faq" className="border-b-2 border-black bg-neutral-50">
    <div className="max-w-4xl mx-auto px-6 py-20">
      <div className="mb-10">
        <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">FAQ</div>
        <h2 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-2">Frequently asked questions.</h2>
        <p className="mt-3 text-neutral-700 max-w-2xl">
          Everything you need to know about AI receptionists, pricing, data safety and multi-channel support.
        </p>
      </div>
      <div className="border-2 border-black bg-white divide-y-2 divide-black" data-testid="faq-list">
        {FAQS.map((f, i) => (
          <details key={f.q} className="group" data-testid={`faq-item-${i}`}>
            <summary className="cursor-pointer list-none p-5 flex items-start justify-between gap-4 hover:bg-neutral-50">
              <span className="font-display font-bold text-lg">{f.q}</span>
              <span className="font-mono text-xl transition-transform group-open:rotate-45 shrink-0">+</span>
            </summary>
            <div className="px-5 pb-5 text-neutral-700 leading-relaxed">{f.a}</div>
          </details>
        ))}
      </div>
    </div>
  </section>
);

const Contact = () => {
  const [form, setForm] = useState({
    name: "", business_name: "", email: "", phone: "", message: "", website: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) return;
    setSubmitting(true);
    try {
      const base = process.env.REACT_APP_BACKEND_URL;
      const res = await fetch(`${base}/api/sales/inquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail || "Submission failed");
      }
      setDone(true);
      if (window.fbq) window.fbq("track", "Lead");
      setForm({ name: "", business_name: "", email: "", phone: "", message: "", website: "" });
    } catch (err) {
      alert(err.message || "Could not send your inquiry — please email us instead.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="contact" className="border-b-2 border-black bg-[#fafafa]" data-testid="landing-contact">
      <div className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-xs font-bold tracking-[0.25em] uppercase text-[#002FA7]">Get in touch</div>
        <h2 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-2">Talk to a human at BotNira.</h2>
        <p className="text-neutral-700 mt-3 max-w-2xl">
          Have a question, want a custom demo, or curious if BotNira fits your business? Reach us directly — or drop your details and our team will follow up within one business day.
        </p>

        <div className="mt-10 grid md:grid-cols-[1fr_1.4fr] gap-6">
          {/* Team contact card */}
          <div className="border-2 border-black bg-white shadow-brutal p-7 flex flex-col gap-5" data-testid="contact-team-card">
            <div>
              <div className="text-[10px] font-bold tracking-[0.25em] uppercase text-neutral-600">Team contact</div>
              <h3 className="font-display font-black text-2xl tracking-tight mt-1">Reach us directly</h3>
            </div>

            <a
              href="https://wa.me/15485773855"
              target="_blank" rel="noreferrer"
              data-testid="contact-whatsapp"
              className="flex items-center gap-3 border-2 border-black p-4 hover-lift bg-[#25D366]/10"
            >
              <div className="w-11 h-11 border-2 border-black bg-[#25D366] flex items-center justify-center shrink-0">
                <MessageSquare size={20} />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold tracking-widest uppercase text-neutral-600">WhatsApp</div>
                <div className="font-display font-black text-lg">+1 (548) 577 3855</div>
                <div className="text-xs text-neutral-600">Fastest — usually replies within minutes</div>
              </div>
            </a>

            <a
              href="mailto:kamal@botnira.com"
              data-testid="contact-email"
              className="flex items-center gap-3 border-2 border-black p-4 hover-lift bg-white"
            >
              <div className="w-11 h-11 border-2 border-black bg-[#002FA7] text-white flex items-center justify-center shrink-0">
                <Mail size={20} />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold tracking-widest uppercase text-neutral-600">Email</div>
                <div className="font-display font-black text-lg break-all">kamal@botnira.com</div>
                <div className="text-xs text-neutral-600">For partnerships, demos & detailed questions</div>
              </div>
            </a>

            <div className="mt-auto pt-3 text-xs font-mono text-neutral-500 leading-relaxed">
              Hours: Mon–Sat 9am–7pm (ET) · Outside hours, BotNira itself answers — try the chat widget bottom-right.
            </div>
          </div>

          {/* Inquiry form */}
          <form
            onSubmit={submit}
            data-testid="contact-form"
            className="border-2 border-black bg-white shadow-brutal p-7 space-y-4"
          >
            <div>
              <div className="text-[10px] font-bold tracking-[0.25em] uppercase text-neutral-600">Send us a message</div>
              <h3 className="font-display font-black text-2xl tracking-tight mt-1">Tell us about your business</h3>
              {done && (
                <div className="mt-4 border-2 border-black bg-green-100 p-3 text-sm font-bold" data-testid="contact-success">
                  ✓ Thanks! We got your inquiry — we'll be in touch within one business day.
                </div>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Your name *"
                data-testid="contact-name"
                className="border-2 border-black px-3 py-2 w-full"
              />
              <input
                value={form.business_name}
                onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
                placeholder="Business name"
                data-testid="contact-business"
                className="border-2 border-black px-3 py-2 w-full"
              />
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="Email address *"
                data-testid="contact-email-input"
                className="border-2 border-black px-3 py-2 w-full"
              />
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="Mobile number"
                data-testid="contact-phone"
                className="border-2 border-black px-3 py-2 w-full font-mono"
              />
            </div>
            <textarea
              required
              rows={5}
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              placeholder="Tell us what you'd like BotNira to handle for you — receptionist, bookings, after-hours, lead capture… *"
              data-testid="contact-message"
              className="border-2 border-black px-3 py-2 w-full"
            />
            {/* Honeypot — hidden from humans, bots will fill it */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
              style={{ position: "absolute", left: "-10000px", height: 0, width: 0, opacity: 0 }}
              aria-hidden="true"
            />
            <button
              type="submit"
              disabled={submitting}
              data-testid="contact-submit"
              className="border-2 border-black px-6 py-3 font-bold bg-[#002FA7] text-white shadow-brutal hover-lift disabled:opacity-60"
            >
              {submitting ? "Sending…" : "Send inquiry →"}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
};

const Footer = () => (
  <footer className="bg-black text-white" data-testid="landing-footer">
    <div className="max-w-7xl mx-auto px-6 py-12 grid md:grid-cols-4 gap-8">
      <div className="md:col-span-1">
        <div className="flex items-center gap-3">
          <BrandMark size={32} />
          <span className="font-display font-black text-2xl tracking-tighter">BotNira</span>
        </div>
        <p className="mt-3 text-sm opacity-70 leading-relaxed">
          AI receptionist &amp; AI calling software for every business. Voice, WhatsApp, SMS, email and chat — answered 24/7.
        </p>
        <div className="mt-5">
          <div className="text-[10px] font-bold tracking-[0.25em] uppercase opacity-60 mb-2">Follow us</div>
          <SocialIcons variant="dark" size={16} />
        </div>
      </div>
      <div>
        <div className="font-display font-bold text-xs uppercase tracking-widest opacity-60">Use cases</div>
        <ul className="mt-3 space-y-1.5 text-sm opacity-90">
          {USE_CASE_PAGES.slice(0, 5).map((u) => (
            <li key={u.slug}>
              <Link to={`/use-case/${u.slug}`} className="hover:underline" data-testid={`footer-usecase-${u.slug}`}>
                AI for {u.industry}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="font-display font-bold text-xs uppercase tracking-widest opacity-60">Product</div>
        <ul className="mt-3 space-y-1.5 text-sm opacity-90">
          <li><a href="#features" className="hover:underline">Features</a></li>
          <li><a href="#channels" className="hover:underline">Channels</a></li>
          <li><a href="#pricing" className="hover:underline">Pricing</a></li>
          <li><Link to="/referrals" className="hover:underline" data-testid="footer-referrals">Referrals · earn 15%</Link></li>
          <li><Link to="/blog" className="hover:underline" data-testid="footer-blog">Blog</Link></li>
          <li><a href="#faq" className="hover:underline">FAQ</a></li>
          <li><a href="#contact" className="hover:underline">Contact</a></li>
          <li><a href="#try" className="hover:underline">Try live</a></li>
        </ul>
      </div>
      <div>
        <div className="font-display font-bold text-xs uppercase tracking-widest opacity-60">Company</div>
        <ul className="mt-3 space-y-1.5 text-sm opacity-90">
          <li><Link to="/login" className="hover:underline">Log in</Link></li>
          <li><Link to="/signup" className="hover:underline">Start free trial</Link></li>
          <li><Link to="/privacy" className="hover:underline" data-testid="footer-privacy">Privacy</Link></li>
          <li><Link to="/terms" className="hover:underline" data-testid="footer-terms">Terms</Link></li>
        </ul>
      </div>
    </div>
    <div className="border-t border-white/10">
      <div className="max-w-7xl mx-auto px-6 py-5 flex flex-wrap justify-between items-center gap-3 text-xs font-mono opacity-60">
        <span>© 2026 BotNira · AI Receptionist &amp; AI Calling Software · All rights reserved by THE DIGISPARROW, Hamilton, ON, Canada.</span>
        <span>Built for front desks that sleep.</span>
      </div>
    </div>
  </footer>
);

const Reassurance = () => (
  <section className="border-b-2 border-black bg-yellow-300" data-testid="reassurance-band">
    <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-11 h-11 bg-black text-white border-2 border-black grid place-items-center"><ShieldCheck size={20}/></div>
        <span className="font-display font-black text-lg md:text-xl">It never guesses.</span>
      </div>
      <p className="text-sm md:text-base font-medium text-black/80">
        When BotNira isn't sure, it <strong>transfers the call to you</strong> or <strong>takes a message</strong> — your customers are never left with a wrong answer. You stay in control of every conversation.
      </p>
    </div>
  </section>
);

const INDUSTRY_TILES = [
  { icon: Scissors, label: "Salons & Spas", slug: "salon" },
  { icon: Stethoscope, label: "Clinics & Dental", slug: "dental" },
  { icon: Wrench, label: "Repair & Auto shops", slug: "home-services" },
  { icon: GraduationCap, label: "Tutoring & Schools", slug: "education" },
];

const IndustryTiles = () => (
  <section className="border-b-2 border-black bg-white" data-testid="industry-tiles">
    <div className="max-w-7xl mx-auto px-6 py-14">
      <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">See it for your business</div>
      <h2 className="font-display text-3xl md:text-4xl font-black tracking-tighter mt-2">See how BotNira works for your industry.</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
        {INDUSTRY_TILES.map((t) => (
          <Link key={t.slug} to={`/use-case/${t.slug}`} data-testid={`industry-tile-${t.slug}`} className="group border-2 border-black bg-white p-6 shadow-brutal hover-lift block">
            <div className="w-12 h-12 bg-[#002FA7] text-white border-2 border-black grid place-items-center"><t.icon size={22}/></div>
            <div className="mt-4 font-display font-black text-lg leading-tight">{t.label}</div>
            <div className="mt-3 text-xs font-bold tracking-widest uppercase text-[#002FA7] inline-flex items-center gap-1 group-hover:underline">See example <ArrowRight size={12}/></div>
          </Link>
        ))}
      </div>
    </div>
  </section>
);

const DATA_BADGES = [
  { icon: Lock, title: "Encrypted in transit", body: "Every message and call is secured with TLS encryption from end to end." },
  { icon: MapPin, title: "Canadian data residency", body: "Your customer data is stored and processed in Canada." },
  { icon: Database, title: "Never used to train AI", body: "We do not train AI models on your data. Your conversations stay yours." },
  { icon: ShieldCheck, title: "PIPEDA & GDPR aligned", body: "Built to align with Canadian PIPEDA and EU GDPR privacy standards." },
];

const DataSecurity = () => (
  <section id="data" className="border-b-2 border-black bg-neutral-50" data-testid="data-security">
    <div className="max-w-7xl mx-auto px-6 py-20">
      <div className="max-w-3xl">
        <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">Your data</div>
        <h2 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-2">You're letting AI talk to your customers. Here's where your data goes.</h2>
        <p className="mt-4 text-neutral-700 text-lg">
          Short answer: it stays yours. We keep every business in an isolated workspace, store data in Canada, encrypt it in transit, and never use it to train AI models.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-10">
        {DATA_BADGES.map((b, i) => (
          <div key={i} data-testid={`data-badge-${i}`} className="border-2 border-black bg-white p-6 shadow-brutal">
            <div className="w-11 h-11 bg-black text-white border-2 border-black grid place-items-center"><b.icon size={18}/></div>
            <div className="mt-4 font-display font-black text-lg">{b.title}</div>
            <div className="mt-2 text-sm text-neutral-700">{b.body}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 text-sm font-mono text-neutral-600">Full details in our <Link to="/privacy" className="underline font-bold">Privacy Policy</Link>.</div>
    </div>
  </section>
);

const Founder = () => (
  <section className="border-b-2 border-black bg-white" data-testid="founder-section">
    <div className="max-w-7xl mx-auto px-6 py-20 grid md:grid-cols-[0.9fr_1.1fr] gap-10 items-center">
      <div>
        <img src={CEO_IMG} alt="Kamaljeet Singh Sidhu, Founder & CEO of BotNira" className="w-full border-2 border-black shadow-brutal-lg object-cover" loading="lazy" />
      </div>
      <div>
        <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">The human behind the AI</div>
        <h2 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-2">Built by someone who watched the phone ring out.</h2>
        <p className="mt-5 text-lg text-neutral-700 leading-relaxed">
          "I built BotNira after watching small businesses — including people in my own circle — lose customers every week to calls nobody could answer in time. BotNira is the front desk I wish they'd had: it picks up every time, and hands off to a human the moment it should."
        </p>
        <div className="mt-5 font-display font-black text-xl">Kamaljeet Singh Sidhu</div>
        <div className="text-sm font-bold text-[#002FA7]">Founder &amp; CEO, BotNira</div>
        <div className="mt-1 text-sm text-neutral-600 inline-flex items-center gap-1"><MapPin size={14}/> Hamilton, Ontario, Canada</div>
        <div className="mt-7 flex flex-wrap gap-3">
          <a href="https://wa.me/15485773855" target="_blank" rel="noreferrer" data-testid="founder-book-call" className="inline-flex items-center gap-2 bg-[#002FA7] text-white font-bold px-6 py-3 border-2 border-black shadow-brutal hover-lift">Book a 15-min call <ArrowRight size={16}/></a>
          <Link to="/team" data-testid="founder-read-story" className="inline-flex items-center gap-2 bg-white font-bold px-6 py-3 border-2 border-black shadow-brutal hover-lift">Read our story</Link>
        </div>
      </div>
    </div>
  </section>
);

const RiskReversal = () => (
  <section className="border-b-2 border-black bg-black text-white" data-testid="risk-reversal-band">
    <div className="max-w-7xl mx-auto px-6 py-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-center">
      {["5-day free trial", "No credit card required", "Cancel anytime", "Live in 3 minutes"].map((t) => (
        <div key={t} className="inline-flex items-center gap-2 font-display font-black text-base md:text-xl">
          <Check size={18} className="text-yellow-300"/> {t}
        </div>
      ))}
    </div>
  </section>
);

export default function Landing() {
  // Inject the BotNira web widget ONLY on the landing page. We clean up on
  // unmount so it doesn't leak into the vendor app.
  useEffect(() => {
    const LANDING_VENDOR_ID = "2883fa83-acf4-46f2-b2b9-b83c8bedbfb0"; // Kamal's demo vendor
    const WIDGET_V = "1.3";
    const src = `${window.location.origin}/widget.js?v=${WIDGET_V}`;
    // Don't double-load
    if (document.querySelector(`script[src="${src}"]`)) return;
    const s = document.createElement("script");
    s.src = src;
    s.defer = true;
    s.setAttribute("data-botnira-vendor", LANDING_VENDOR_ID);
    s.setAttribute("data-botnira-marketing", "true");
    document.body.appendChild(s);
    return () => {
      // Remove the launcher button + open panel if any were injected
      document.querySelectorAll("[data-botnira-widget], #botnira-launcher").forEach(n => n.remove());
      s.remove();
    };
  }, []);
  return (
    <div data-testid="landing-page">
      <Nav /><Hero /><Reassurance /><TryLive /><IndustryTiles /><Channels /><TrustedBy /><Features /><UseCases /><MultiLanguage /><How /><DataSecurity /><Reviews /><Founder /><RiskReversal /><Pricing /><FAQ /><Contact /><Footer />
    </div>
  );
}

