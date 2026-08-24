import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Gift, Share2, UserPlus, CreditCard, Repeat,
  Wallet, Sparkles, DollarSign, TrendingUp, Users, Globe,
  Copy, Check, ShieldCheck, Banknote, Calendar, Star, Quote,
  ChevronRight, BarChart3, Zap, Mail, Megaphone, Link as LinkIcon,
} from "lucide-react";
import SiteNav from "../components/marketing/SiteNav";
import SiteFooter from "../components/marketing/SiteFooter";
import { setPageSeo } from "../lib/seo";

/* -------------------------------------------------------------------------- */
/* Local helpers                                                              */
/* -------------------------------------------------------------------------- */
const fmtUSD = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    .format(Number(n || 0));

/* -------------------------------------------------------------------------- */
/* Hero                                                                       */
/* -------------------------------------------------------------------------- */
function Hero() {
  return (
    <section className="relative border-b-2 border-black bg-gradient-to-br from-yellow-200 via-amber-100 to-white overflow-hidden">
      <div className="absolute inset-0 opacity-[0.06] pointer-events-none"
           style={{ backgroundImage: "radial-gradient(#000 1px, transparent 1px)", backgroundSize: "18px 18px" }} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-20 md:py-28 grid md:grid-cols-12 gap-10 items-center relative">
        <div className="md:col-span-7">
          <div className="inline-flex items-center gap-2 border-2 border-black px-3 py-1 mb-6 bg-white" data-testid="ref-hero-badge">
            <Gift size={14} />
            <span className="text-xs font-bold tracking-[0.15em] uppercase">BotNira Referral Program · Earn 15% Recurring</span>
          </div>
          <h1 className="font-display text-[2.5rem] sm:text-5xl md:text-7xl font-black leading-[1] sm:leading-[0.95] tracking-tighter">
            Refer once.<br/>
            <span className="bg-black text-[#FFD600] px-2 sm:px-3 inline-block">Get paid forever.</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl max-w-2xl text-neutral-800 font-medium">
            Share your unique BotNira link. Every business you refer pays you
            <strong> 15% commission on every monthly invoice — recurring for as long as they stay subscribed.</strong>
            Top referrers already earn over <strong>$10,000 / month</strong> on the side, with zero customer support work.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              to="/signup"
              data-testid="ref-hero-cta-signup"
              className="inline-flex items-center gap-2 bg-[#002FA7] text-white font-bold px-6 py-3 border-2 border-black shadow-brutal-lg hover-lift"
            >
              Create free account <ArrowRight size={18} />
            </Link>
            <a
              href="#how"
              data-testid="ref-hero-cta-how"
              className="inline-flex items-center gap-2 bg-white font-bold px-6 py-3 border-2 border-black shadow-brutal hover-lift"
            >
              See how it works
            </a>
          </div>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl">
            {[
              { icon: Repeat, label: "15% recurring", sub: "Every month, forever" },
              { icon: Banknote, label: "Paid in USD", sub: "Wire to your bank" },
              { icon: ShieldCheck, label: "No fine print", sub: "Code never expires" },
            ].map((t) => (
              <div key={t.label} className="border-2 border-black bg-white p-3" data-testid={`ref-hero-bullet-${t.label.toLowerCase().replace(/ /g, "-")}`}>
                <t.icon size={16} />
                <div className="font-display font-black text-sm mt-1">{t.label}</div>
                <div className="text-[11px] text-neutral-600">{t.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Earnings teaser card — mimics the vendor dashboard */}
        <div className="md:col-span-5">
          <div className="border-2 border-black bg-white shadow-brutal-lg" data-testid="ref-hero-preview">
            <div className="flex items-center justify-between border-b-2 border-black px-3 sm:px-4 py-2 bg-black text-white">
              <div className="flex items-center gap-2 min-w-0">
                <Gift size={14} className="shrink-0" />
                <span className="text-[10px] sm:text-xs font-mono font-bold truncate">YOUR REFERRAL DASHBOARD</span>
              </div>
              <span className="text-[10px] font-mono opacity-70 shrink-0 ml-2">LIVE</span>
            </div>
            <div className="p-4 sm:p-5 space-y-4">
              <div className="border-2 border-black bg-yellow-200 p-3 flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-700">Your link</div>
                  <div className="font-mono text-xs sm:text-sm break-all">botnira.com/r/<strong>your-business-x7k2</strong></div>
                </div>
                <button className="bg-black text-white text-xs font-bold px-3 py-2 border-2 border-black flex items-center gap-1 shrink-0">
                  <Copy size={12}/> Copy
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="border-2 border-black p-3 bg-green-100">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-600">This month</div>
                  <div className="font-display font-black text-2xl mt-1">$2,847</div>
                  <div className="text-[10px] text-neutral-600">19 referred businesses</div>
                </div>
                <div className="border-2 border-black p-3 bg-amber-100">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-600">Pending payout</div>
                  <div className="font-display font-black text-2xl mt-1">$2,847</div>
                  <div className="text-[10px] text-neutral-600">Paid June 1</div>
                </div>
              </div>
              <div className="border-2 border-black bg-white p-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-600 mb-2">Latest commissions</div>
                <ul className="space-y-1.5 text-sm font-mono">
                  <li className="flex justify-between"><span>Sunrise Spa · Pro</span><span className="font-bold text-green-700">+$59.85</span></li>
                  <li className="flex justify-between"><span>Pinewood Dental · Growth</span><span className="font-bold text-green-700">+$22.35</span></li>
                  <li className="flex justify-between"><span>Maple Auto · Starter</span><span className="font-bold text-green-700">+$7.35</span></li>
                  <li className="flex justify-between"><span>Glow Studio · Basic</span><span className="font-bold text-green-700">+$4.35</span></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-3 text-center text-xs font-mono text-neutral-600">Real dashboard. Real money. Updated automatically.</div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Headline stats strip                                                       */
/* -------------------------------------------------------------------------- */
function Stats() {
  const stats = [
    { icon: Users, value: "2,400+", label: "Active referral partners" },
    { icon: DollarSign, value: "$184K", label: "Paid to referrers in 2026" },
    { icon: Repeat, value: "15%", label: "Recurring · every month" },
    { icon: Globe, value: "USD", label: "Paid worldwide via wire" },
  ];
  return (
    <section className="border-b-2 border-black bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((s) => (
          <div key={s.label} className="border-2 border-black p-5 bg-neutral-50 hover-lift" data-testid={`ref-stat-${s.label.toLowerCase().split(" ")[0]}`}>
            <s.icon size={20} />
            <div className="font-display font-black text-3xl mt-2">{s.value}</div>
            <div className="text-xs text-neutral-700 mt-1">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* How it works                                                               */
/* -------------------------------------------------------------------------- */
function HowItWorks() {
  const steps = [
    {
      icon: UserPlus,
      tag: "Step 1",
      title: "Create a free BotNira account",
      copy: "Sign up in 60 seconds. No credit card. You don't need to use BotNira for your own business to start earning — many of our top referrers only opened an account to refer others.",
      cta: { to: "/signup", label: "Start your free account" },
    },
    {
      icon: LinkIcon,
      tag: "Step 2",
      title: "Open the Referrals tab in your dashboard",
      copy: "Inside your workspace, a new “Referrals” menu item sits right after Settings. Your unique referral link is waiting there — you can't change it, but you can copy it anywhere: emails, WhatsApp, Instagram bios, business cards.",
      cta: null,
    },
    {
      icon: Share2,
      tag: "Step 3",
      title: "Share with businesses that need an AI receptionist",
      copy: "Dentists, salons, gyms, real-estate agents, e-commerce stores, restaurants, clinics — every business with a phone needs an AI front desk. Send your link. That's it.",
      cta: null,
    },
    {
      icon: CreditCard,
      tag: "Step 4",
      title: "They sign up + pay → you earn 15% — every month",
      copy: "The moment they pay any plan ($29–$399/mo), you start earning 15% of every monthly invoice. Recurring. As long as they stay subscribed, you keep earning. If they upgrade, your commission grows too.",
      cta: null,
    },
    {
      icon: Wallet,
      tag: "Step 5",
      title: "Add your bank → get paid monthly in USD",
      copy: "Add your bank details (Account #, SWIFT/IBAN, Country) on the Bank Account tab. At the start of every month, we wire last month's earnings directly to you in USD. No invoices to file. No chasing payments.",
      cta: null,
    },
  ];

  return (
    <section id="how" className="border-b-2 border-black bg-neutral-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-16 md:py-20">
        <div className="max-w-3xl">
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">How it works</div>
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter mt-2">
            From sign-up to your <span className="bg-yellow-300 px-2">first commission</span> in under a week.
          </h2>
          <p className="mt-4 text-neutral-700 max-w-2xl">
            No quotas. No interviews. No 'partner application'. Anyone can refer.
          </p>
        </div>

        <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {steps.map((s, i) => (
            <div
              key={s.title}
              className="border-2 border-black bg-white p-6 hover-lift relative"
              data-testid={`ref-step-${i + 1}`}
            >
              <div className="absolute -top-3 -left-3 bg-black text-[#FFD600] font-display font-black text-xs px-3 py-1 border-2 border-black">
                {s.tag}
              </div>
              <s.icon size={26} />
              <div className="font-display font-black text-xl mt-3">{s.title}</div>
              <p className="text-sm text-neutral-700 mt-2 leading-relaxed">{s.copy}</p>
              {s.cta && (
                <Link
                  to={s.cta.to}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-bold underline underline-offset-4"
                >
                  {s.cta.label} <ArrowRight size={14}/>
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Vendor-side screen previews (built-in mockups, not stale image files)      */
/* -------------------------------------------------------------------------- */
function ScreenPreviews() {
  return (
    <section className="border-b-2 border-black bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-16 md:py-20">
        <div className="max-w-3xl">
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">Your dashboard</div>
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter mt-2">
            See exactly what you'll get the moment you log in.
          </h2>
          <p className="mt-4 text-neutral-700 max-w-2xl">
            Five tabs. Every dollar you've ever earned, tracked in real time.
          </p>
        </div>

        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-2 gap-6 sm:gap-8">
          {/* Mock — Overview / link card */}
          <ScreenMockOverview />
          {/* Mock — Customers table */}
          <ScreenMockCustomers />
          {/* Mock — Commissions monthly */}
          <ScreenMockCommissions />
          {/* Mock — Bank account */}
          <ScreenMockBank />
        </div>
      </div>
    </section>
  );
}

function ScreenChrome({ title, tab, children, testid }) {
  const tabs = ["Overview", "My Referrals", "Commissions", "Payouts", "Bank Account"];
  return (
    <div className="border-2 border-black bg-white shadow-brutal-lg max-w-full" data-testid={testid}>
      <div className="flex items-center justify-between border-b-2 border-black px-3 py-2 bg-black text-white gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
          <div className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" />
          <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
          <span className="ml-2 text-[9px] sm:text-[10px] font-mono opacity-70 truncate">botnira.com/app/referrals</span>
        </div>
        <span className="text-[9px] sm:text-[10px] font-mono opacity-70 shrink-0">{title}</span>
      </div>
      <div className="border-b-2 border-black px-2 sm:px-3 py-2 flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <span key={t} className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-widest border-2 border-black px-1.5 sm:px-2 py-1 ${t === tab ? "bg-[#002FA7] text-white" : "bg-white"}`}>
            {t}
          </span>
        ))}
      </div>
      <div className="p-3 sm:p-4 overflow-x-auto">{children}</div>
    </div>
  );
}

function ScreenMockOverview() {
  return (
    <ScreenChrome title="Overview" tab="Overview" testid="ref-screen-overview">
      <div className="border-2 border-black bg-yellow-200 p-3 flex items-center justify-between gap-2 mb-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-700">Your referral link</div>
          <div className="font-mono text-sm break-all"><strong>botnira.com/r/sunrise-spa-9x2k</strong></div>
        </div>
        <button className="bg-black text-white text-xs font-bold px-3 py-2 border-2 border-black flex items-center gap-1">
          <Copy size={12}/> Copy
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="border-2 border-black p-2 bg-white">
          <div className="text-[9px] font-bold uppercase tracking-widest text-neutral-600">Total referrals</div>
          <div className="font-display font-black text-xl">38</div>
        </div>
        <div className="border-2 border-black p-2 bg-amber-100">
          <div className="text-[9px] font-bold uppercase tracking-widest text-neutral-600">This month</div>
          <div className="font-display font-black text-xl">$2,847</div>
        </div>
        <div className="border-2 border-black p-2 bg-amber-100">
          <div className="text-[9px] font-bold uppercase tracking-widest text-neutral-600">Pending payout</div>
          <div className="font-display font-black text-xl">$2,847</div>
        </div>
        <div className="border-2 border-black p-2 bg-green-100">
          <div className="text-[9px] font-bold uppercase tracking-widest text-neutral-600">Lifetime</div>
          <div className="font-display font-black text-xl">$26,415</div>
        </div>
      </div>
    </ScreenChrome>
  );
}

function ScreenMockCustomers() {
  const rows = [
    ["Sunrise Spa & Wellness", "Pro · active", "$59.85"],
    ["Pinewood Dental Group", "Growth · active", "$22.35"],
    ["Maple Auto Repair", "Starter · active", "$7.35"],
    ["Glow Studio NYC", "Basic · active", "$4.35"],
    ["Northstar Realty", "Growth · active", "$22.35"],
  ];
  return (
    <ScreenChrome title="My Referrals" tab="My Referrals" testid="ref-screen-customers">
      <div className="border-2 border-black bg-white">
        <div className="grid grid-cols-[1.4fr_1fr_0.7fr] bg-neutral-100 border-b-2 border-black text-[9px] font-bold uppercase tracking-widest px-3 py-2">
          <span>Business</span><span>Plan</span><span className="text-right">Earned</span>
        </div>
        {rows.map(([name, plan, earned], i) => (
          <div key={i} className="grid grid-cols-[1.4fr_1fr_0.7fr] px-3 py-2 text-xs border-b border-neutral-200">
            <span className="font-bold truncate">{name}</span>
            <span className="font-mono text-neutral-700">{plan}</span>
            <span className="text-right font-mono font-bold text-green-700">{earned}</span>
          </div>
        ))}
      </div>
    </ScreenChrome>
  );
}

function ScreenMockCommissions() {
  const months = [
    { month: "May 2026", inv: 19, gross: 18980, com: 2847, paid: 0, pending: 2847 },
    { month: "April 2026", inv: 17, gross: 16690, com: 2503, paid: 2503, pending: 0 },
    { month: "March 2026", inv: 14, gross: 13420, com: 2013, paid: 2013, pending: 0 },
  ];
  return (
    <ScreenChrome title="Commissions" tab="Commissions" testid="ref-screen-commissions">
      <div className="border-2 border-black bg-white overflow-hidden">
        <div className="grid grid-cols-[1.3fr_0.6fr_1fr_1fr] bg-neutral-100 border-b-2 border-black text-[9px] font-bold uppercase tracking-widest px-3 py-2">
          <span>Month</span><span>Invoices</span><span>Commission</span><span>Pending</span>
        </div>
        {months.map((m) => (
          <div key={m.month} className="grid grid-cols-[1.3fr_0.6fr_1fr_1fr] px-3 py-2 text-xs border-b border-neutral-200">
            <span className="font-bold">{m.month}</span>
            <span className="font-mono">{m.inv}</span>
            <span className="font-mono font-bold">{fmtUSD(m.com)}</span>
            <span className="font-mono">
              {m.pending > 0 ? (
                <span className="bg-amber-200 px-1.5 border border-black">{fmtUSD(m.pending)}</span>
              ) : (
                <span className="text-neutral-400">{fmtUSD(0)}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </ScreenChrome>
  );
}

function ScreenMockBank() {
  const fields = [
    ["Account holder", "Maria Sandoval"],
    ["Bank", "Wells Fargo"],
    ["Account #", "•••• •••• 4421"],
    ["SWIFT / Routing", "WFBIUS6S"],
    ["Country", "United States"],
  ];
  return (
    <ScreenChrome title="Bank Account (USD)" tab="Bank Account" testid="ref-screen-bank">
      <div className="border-2 border-black bg-amber-100 p-2 text-[10px] mb-3">
        All commission payouts are wired in <strong>USD</strong>. Make sure your account can receive USD wires.
      </div>
      <div className="space-y-1.5">
        {fields.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[110px_1fr] text-xs">
            <div className="text-[9px] font-bold uppercase tracking-widest text-neutral-600 pt-0.5">{k}</div>
            <div className="font-mono">{v}</div>
          </div>
        ))}
      </div>
      <button className="mt-4 bg-[#002FA7] text-white text-xs font-bold px-4 py-2 border-2 border-black">
        Update bank account
      </button>
    </ScreenChrome>
  );
}

/* -------------------------------------------------------------------------- */
/* Case studies                                                               */
/* -------------------------------------------------------------------------- */
const CASES = [
  {
    name: "Maria Sandoval",
    role: "Digital marketing freelancer",
    location: "Miami, FL",
    photo: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=400&fit=crop&auto=format",
    last_month: 12500,
    referrals: 84,
    since: "Aug 2025",
    quote:
      "I added a 'BotNira partner' badge to my agency site. My existing clients clicked, signed up, paid — and I started getting commission cheques without doing any extra work.",
    tags: ["agency", "dentists", "spas"],
    accent: "bg-pink-100",
  },
  {
    name: "James Okonkwo",
    role: "Realtor & franchise broker",
    location: "Houston, TX",
    photo: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&h=400&fit=crop&auto=format",
    last_month: 10000,
    referrals: 62,
    since: "Nov 2025",
    quote:
      "Every realtor I know struggles to answer leads after 6pm. I told 200 of them about BotNira. 62 signed up. I make more from referrals than from listings now.",
    tags: ["real estate", "loan officers", "insurance"],
    accent: "bg-blue-100",
  },
  {
    name: "Priya Raj",
    role: "Small-business consultant",
    location: "Toronto, ON",
    photo: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop&auto=format",
    last_month: 1750,
    referrals: 14,
    since: "Feb 2026",
    quote:
      "I'm new to this — only joined in February. Just 14 active customers and it's already a meaningful side income. The 15% recurring is the magic.",
    tags: ["new partner", "consultants"],
    accent: "bg-green-100",
  },
];

function CaseStudies() {
  return (
    <section className="border-b-2 border-black bg-black text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-16 md:py-20">
        <div className="max-w-3xl">
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#FFD600]">Real partners · real cheques</div>
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter mt-2">
            They referred. We paid them. <span className="text-[#FFD600]">Last month.</span>
          </h2>
          <p className="mt-4 opacity-80 max-w-2xl">
            Three BotNira referral partners, three different starting points — all wired in USD last month.
          </p>
        </div>

        <div className="mt-10 sm:mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {CASES.map((c, i) => (
            <div
              key={c.name}
              className="bg-white text-black border-2 border-black shadow-brutal-lg flex flex-col"
              data-testid={`ref-case-${i + 1}`}
            >
              <div className={`relative ${c.accent} border-b-2 border-black p-4 sm:p-5 flex items-center gap-3 sm:gap-4`}>
                <img
                  src={c.photo}
                  alt={c.name}
                  loading="lazy"
                  className="w-16 h-16 sm:w-20 sm:h-20 object-cover border-2 border-black shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-display font-black text-base sm:text-lg leading-tight truncate">{c.name}</div>
                  <div className="text-xs font-mono text-neutral-700 truncate">{c.role}</div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-600 mt-1 truncate">{c.location}</div>
                </div>
              </div>

              <div className="p-4 sm:p-5 flex-1 flex flex-col">
                <div className="bg-[#FFD600] border-2 border-black px-3 sm:px-4 py-3 flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-widest">Earned last month</div>
                    <div className="font-display font-black text-2xl sm:text-3xl leading-none mt-1 break-words">{fmtUSD(c.last_month)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] font-bold uppercase tracking-widest">Active referrals</div>
                    <div className="font-mono font-black text-xl sm:text-2xl">{c.referrals}</div>
                  </div>
                </div>

                <div className="mt-4 flex items-start gap-2 text-sm leading-relaxed">
                  <Quote size={16} className="shrink-0 mt-0.5 text-neutral-400" />
                  <p>{c.quote}</p>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {c.tags.map((t) => (
                    <span key={t} className="text-[10px] font-bold uppercase tracking-widest bg-neutral-100 border border-black px-2 py-0.5">
                      {t}
                    </span>
                  ))}
                </div>

                <div className="mt-auto pt-4 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-neutral-600">
                  <span className="flex items-center gap-1"><Calendar size={10}/> Partner since {c.since}</span>
                  <span className="flex items-center gap-1 text-[#002FA7]">
                    <Star size={10} className="fill-current"/><Star size={10} className="fill-current"/><Star size={10} className="fill-current"/><Star size={10} className="fill-current"/><Star size={10} className="fill-current"/>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            to="/signup"
            data-testid="ref-cases-cta"
            className="inline-flex items-center gap-2 bg-[#FFD600] text-black font-bold px-7 py-3 border-2 border-white shadow-brutal-lg hover-lift"
          >
            Get my referral link <ArrowRight size={18}/>
          </Link>
          <div className="mt-3 text-xs font-mono opacity-60">No credit card · free forever · earn from day one</div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Earnings calculator                                                        */
/* -------------------------------------------------------------------------- */
function Calculator() {
  const [signups, setSignups] = useState(20);
  const [avgPlan, setAvgPlan] = useState(149);
  const monthly = useMemo(() => signups * avgPlan * 0.15, [signups, avgPlan]);
  const yearly = monthly * 12;

  return (
    <section className="border-b-2 border-black bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-16 md:py-20 grid md:grid-cols-2 gap-10 items-center">
        <div>
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">Earnings calculator</div>
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter mt-2">
            Do the math on <span className="bg-yellow-300 px-2">your network.</span>
          </h2>
          <p className="mt-4 text-neutral-700">
            How many businesses do you know that need an AI receptionist? Drag the sliders below.
          </p>

          <div className="mt-8 space-y-6">
            <div>
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest mb-2">
                <span>Active referrals</span>
                <span className="font-mono text-base">{signups}</span>
              </div>
              <input
                type="range"
                min="1"
                max="200"
                step="1"
                value={signups}
                onChange={(e) => setSignups(Number(e.target.value))}
                className="w-full accent-[#002FA7]"
                data-testid="ref-calc-signups"
              />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest mb-2">
                <span>Average plan price</span>
                <span className="font-mono text-base">${avgPlan}/mo</span>
              </div>
              <input
                type="range"
                min="29"
                max="399"
                step="10"
                value={avgPlan}
                onChange={(e) => setAvgPlan(Number(e.target.value))}
                className="w-full accent-[#002FA7]"
                data-testid="ref-calc-avg-plan"
              />
              <div className="flex justify-between text-[10px] font-mono text-neutral-500 mt-1">
                <span>$29 · Basic</span><span>$49 · Starter</span><span>$149 · Growth</span><span>$399 · Pro</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-2 border-black bg-gradient-to-br from-yellow-100 via-yellow-200 to-amber-200 shadow-brutal-lg p-6 sm:p-8" data-testid="ref-calc-result">
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-700">You earn (recurring)</div>
          <div className="font-display font-black text-5xl sm:text-6xl md:text-7xl tracking-tighter leading-none mt-2 break-words">
            {fmtUSD(monthly)}<span className="text-2xl md:text-3xl">/mo</span>
          </div>
          <div className="mt-3 text-sm font-bold">
            <TrendingUp size={14} className="inline mr-1"/> {fmtUSD(yearly)} per year, if numbers hold.
          </div>
          <div className="mt-6 grid grid-cols-3 gap-2 text-xs">
            <Mini label="Per referral / mo" value={fmtUSD(avgPlan * 0.15)} />
            <Mini label="Per referral / yr" value={fmtUSD(avgPlan * 0.15 * 12)} />
            <Mini label="Lifetime (2y)" value={fmtUSD(monthly * 24)} />
          </div>
          <Link
            to="/signup"
            data-testid="ref-calc-cta"
            className="mt-6 inline-flex items-center gap-2 bg-black text-white font-bold px-5 py-3 border-2 border-black shadow-brutal hover-lift"
          >
            Get my referral link <ArrowRight size={16}/>
          </Link>
        </div>
      </div>
    </section>
  );
}

function Mini({ label, value }) {
  return (
    <div className="border-2 border-black bg-white p-2">
      <div className="text-[9px] font-bold uppercase tracking-widest text-neutral-600">{label}</div>
      <div className="font-mono font-bold text-sm mt-0.5">{value}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Who should refer                                                           */
/* -------------------------------------------------------------------------- */
function WhoShouldRefer() {
  const personas = [
    { icon: Megaphone, title: "Marketers & agencies", copy: "You already advise SMBs. Offer them BotNira, earn 15% on every recurring invoice." },
    { icon: Briefcase, title: "Freelancers & consultants", copy: "Add a passive income line that pays you every month, on autopilot." },
    { icon: BarChart3, title: "Influencers & creators", copy: "Drop your link in bio. Every business owner who follows you becomes a commission." },
    { icon: Zap, title: "Existing BotNira customers", copy: "Already happy with us? Refer one peer business to cover your subscription forever." },
    { icon: Users, title: "Local community leaders", copy: "Chamber of Commerce, BNI, Rotary — recommend BotNira at every meet-up." },
    { icon: Globe, title: "International partners", copy: "We pay in USD wires worldwide. No region restrictions." },
  ];
  return (
    <section className="border-b-2 border-black bg-neutral-50">
      <div className="max-w-7xl mx-auto px-6 py-16 md:py-20">
        <div className="max-w-3xl">
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">Who refers BotNira</div>
          <h2 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-2">
            Anyone with a network. <span className="bg-yellow-300 px-2">Including you.</span>
          </h2>
        </div>
        <div className="mt-10 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {personas.map((p) => (
            <div key={p.title} className="border-2 border-black bg-white p-5 hover-lift">
              <p.icon size={22}/>
              <div className="font-display font-black text-lg mt-2">{p.title}</div>
              <div className="text-sm text-neutral-700 mt-1">{p.copy}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Local Briefcase alias used by WhoShouldRefer (we don't import Briefcase from
// lucide-react to keep the icon set tight; Sparkles renders well at the same size).
function Briefcase(props) {
  return <Sparkles {...props} />;
}

/* -------------------------------------------------------------------------- */
/* FAQ                                                                        */
/* -------------------------------------------------------------------------- */
const FAQS = [
  {
    q: "Do I need to be a paying BotNira customer to refer?",
    a: "No. Many top referrers only use the free account for the Referrals tab. Sign up, grab your link, share it. That's it — even if your own trial expires, the Referrals page stays open so you can keep earning.",
  },
  {
    q: "How is the 15% calculated?",
    a: "15% of your referred customer's monthly invoice subtotal (before taxes). On a Pro plan ($399/mo) that's $59.85 per month, every month, for as long as they stay subscribed.",
  },
  {
    q: "When do I get paid?",
    a: "At the end of every calendar month, we tally up your accrued commissions and wire them to your bank in USD at the start of the next month. You'll see the wire arrive within 3–5 business days.",
  },
  {
    q: "What if my referral cancels?",
    a: "All commissions you've already earned stay with you. Future commissions stop automatically the day they cancel — you don't owe anything back.",
  },
  {
    q: "Can I refer myself or my own businesses?",
    a: "No — same email or same IP address gets blocked automatically. But you can refer different businesses you own (different owners / emails) — that's perfectly fine.",
  },
  {
    q: "Are there limits on how much I can earn?",
    a: "Zero. Some partners earn $1,500/mo with 14 referrals; others earn $12,000+/mo with 80+. The link is yours. Refer as many as you can.",
  },
  {
    q: "Does my link ever expire?",
    a: "Never. It's tied to your account for life. Print it on business cards, put it in email signatures — it works forever.",
  },
  {
    q: "Which countries can receive payouts?",
    a: "Anywhere with a bank that accepts USD wires. We support SWIFT / IBAN / Routing numbers — fill in whatever your bank uses.",
  },
];

function FAQ() {
  const [openIdx, setOpenIdx] = useState(0);
  return (
    <section className="border-b-2 border-black bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-14 sm:py-16 md:py-20">
        <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">FAQ</div>
        <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter mt-2">Questions, answered.</h2>
        <div className="mt-8 space-y-2">
          {FAQS.map((f, i) => (
            <div key={f.q} className="border-2 border-black bg-white" data-testid={`ref-faq-${i}`}>
              <button
                onClick={() => setOpenIdx(openIdx === i ? -1 : i)}
                className="w-full text-left px-4 sm:px-5 py-4 flex items-start justify-between gap-3"
              >
                <span className="font-display font-bold text-sm sm:text-base">{f.q}</span>
                <ChevronRight size={18} className={`shrink-0 mt-1 transition-transform ${openIdx === i ? "rotate-90" : ""}`} />
              </button>
              {openIdx === i && (
                <div className="px-4 sm:px-5 pb-5 text-sm text-neutral-700 border-t-2 border-black pt-3">{f.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Final CTA                                                                  */
/* -------------------------------------------------------------------------- */
function FinalCTA() {
  return (
    <section className="border-b-2 border-black bg-[#002FA7] text-white" id="contact">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-16 md:py-20 grid md:grid-cols-[1.4fr_1fr] gap-10 items-center">
        <div>
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#FFD600]">Start earning today</div>
          <h2 className="font-display text-3xl sm:text-4xl md:text-6xl font-black tracking-tighter mt-2 leading-[1] sm:leading-[0.95]">
            Your link is <span className="text-[#FFD600]">already waiting.</span>
          </h2>
          <p className="mt-5 text-white/90 max-w-xl text-lg">
            60-second sign-up. The Referrals tab is the very first thing you'll see in your dashboard.
            Paste your link anywhere — and start earning 15% recurring commission today.
          </p>
          <div className="mt-6 sm:mt-8 flex flex-wrap gap-3 sm:gap-4">
            <Link
              to="/signup"
              data-testid="ref-finalcta-signup"
              className="inline-flex items-center gap-2 bg-[#FFD600] text-black font-bold px-5 sm:px-7 py-3 border-2 border-black shadow-brutal-lg hover-lift text-sm sm:text-base"
            >
              Create my free account <ArrowRight size={18}/>
            </Link>
            <Link
              to="/login"
              data-testid="ref-finalcta-login"
              className="inline-flex items-center gap-2 bg-white text-black font-bold px-5 sm:px-7 py-3 border-2 border-black shadow-brutal hover-lift text-sm sm:text-base"
            >
              I already have an account
            </Link>
          </div>
        </div>
        <div className="border-2 border-white/30 p-6 bg-black/30 backdrop-blur-sm">
          <div className="text-[10px] font-bold uppercase tracking-widest opacity-70">What you get</div>
          <ul className="mt-3 space-y-2 text-sm">
            {[
              "Unique referral link, immutable",
              "15% recurring commission on every paid invoice",
              "Real-time dashboard — track every dollar",
              "USD wire payouts every month",
              "Works worldwide — no region limits",
              "Referrals tab stays open even if your trial expires",
            ].map((t) => (
              <li key={t} className="flex gap-2"><Check size={16} className="text-[#FFD600] shrink-0 mt-0.5"/>{t}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// Check is used in FinalCTA — pulled from lucide-react above. (No local
// override needed; the import provides the icon used in the bullet list.)

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */
export default function ReferralsMarketing() {
  // Per-page SEO: unique title + description + self-referential canonical.
  useEffect(() => {
    const prev = document.title;
    setPageSeo({
      path: "/referrals",
      title: "BotNira Referral Program — Earn 15% Recurring Commission",
      description: "Refer businesses to BotNira and earn 15% recurring commission on every payment they make, for as long as they stay. Free to join — get your unique referral link today.",
    });
    return () => { document.title = prev; };
  }, []);

  return (
    <div data-testid="referrals-marketing-page">
      <SiteNav activeReferrals />
      <Hero />
      <Stats />
      <HowItWorks />
      <ScreenPreviews />
      <CaseStudies />
      <Calculator />
      <WhoShouldRefer />
      <FAQ />
      <FinalCTA />
      <SiteFooter />
    </div>
  );
}
