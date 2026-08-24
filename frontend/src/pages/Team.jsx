import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, GraduationCap, Rocket, Globe2, Users, Sparkles, Building2 } from "lucide-react";
import SiteNav from "../components/marketing/SiteNav";
import SiteFooter from "../components/marketing/SiteFooter";
import { setPageSeo } from "../lib/seo";

const CEO_IMG =
  "https://customer-assets.emergentagent.com/job_0cab01e6-4d2b-4117-ae3f-80ebc10fc6b4/artifacts/0jvkuxmu_CEO%20image.png";
const TEAM_IMG =
  "https://customer-assets.emergentagent.com/job_0cab01e6-4d2b-4117-ae3f-80ebc10fc6b4/artifacts/6mivm8oi_botnira%20team.png";

const STORY = [
  {
    icon: GraduationCap,
    title: "It started with a question, not a business plan",
    body:
      "Kamaljeet Singh Sidhu earned his B.Tech at Conestoga College in Brantford, Ontario. Away from home, he kept noticing the same thing everywhere he looked — small businesses losing customers not because they were bad at their work, but because nobody picked up the phone. A missed call was a missed livelihood. That quiet frustration became the thread running through everything he built next.",
  },
  {
    icon: Globe2,
    title: "ImmiPRO — earning trust in a trust-starved industry",
    body:
      "His first venture, ImmiPRO, took on one of the hardest markets to win: immigration. Families stake their entire futures on the advice they receive, so credibility is everything. By being relentlessly transparent and putting client outcomes first, ImmiPRO grew into a name people recommend to their own families across India, Canada, and the UK — proof that Kamaljeet could build something people genuinely rely on.",
  },
  {
    icon: Building2,
    title: "The DigiSparrow — turning trust into technology",
    body:
      "Next came The DigiSparrow, a technology company now 135 team members strong, shipping AI and cloud applications for businesses around the world. Here Kamaljeet went from founder to builder of teams — assembling engineers, designers, and problem-solvers who could take a rough idea on Monday and put a working product in a customer's hands by Friday.",
  },
  {
    icon: Sparkles,
    title: "BotNira — the idea that had been waiting all along",
    body:
      "Everything converged into one product. The empathy for small businesses from his student days, the trust-first playbook from ImmiPRO, and the engineering muscle of The DigiSparrow gave birth to BotNira: an AI receptionist that answers every call, chat, and message — 24/7 — so no customer is ever met with silence again. It's the missing front desk for every business that can't afford to miss a moment.",
  },
  {
    icon: Rocket,
    title: "Where we're headed",
    body:
      "For clients, BotNira means never losing another lead to a missed call. For investors, it's a founder who has already built trusted brands across continents, backed by a proven 135-person engineering org — now aimed at one of the largest, most underserved markets in the world. We're not chasing a trend. We're building the front desk that never sleeps.",
  },
];

const VALUES = [
  { icon: Users, title: "Customer-obsessed", body: "Every feature starts with a real business losing a real customer. We fix that first." },
  { icon: Sparkles, title: "Ship fast, ship right", body: "A 135-strong team that moves like a startup and delivers like an enterprise." },
  { icon: Globe2, title: "Built across borders", body: "India, Canada and the UK — global from day one, local where it counts." },
];

export default function Team() {
  useEffect(() => {
    setPageSeo({
      path: "/team",
      title: "About BotNira — The Team Behind the AI Receptionist",
      description: "Meet the founders and 135-person engineering team behind BotNira — the AI receptionist that answers every call, chat and message 24/7 so businesses never miss a customer.",
    });
  }, []);
  return (
    <div className="min-h-screen bg-[#FDFBF7] text-black" data-testid="team-page">
      <SiteNav />

      {/* Hero */}
      <section className="border-b-2 border-black bg-white" data-testid="team-hero">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-20 grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-yellow-300 border-2 border-black px-3 py-1 text-xs font-bold uppercase tracking-widest shadow-brutal">
              <Users size={14} /> Our Story
            </div>
            <h1 className="mt-5 font-display font-black text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
              The people behind the front desk that never sleeps
            </h1>
            <p className="mt-5 text-base sm:text-lg opacity-80 leading-relaxed max-w-xl">
              BotNira was built by founders and engineers who watched small businesses lose customers to a
              ringing phone — and decided to end it for good.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="/signup"
                data-testid="team-cta-signup"
                className="inline-flex items-center gap-2 bg-[#002FA7] text-white font-bold text-sm px-5 py-3 border-2 border-black shadow-brutal hover-lift"
              >
                Start free trial <ArrowRight size={16} />
              </Link>
              <a
                href="#leadership"
                data-testid="team-cta-leadership"
                className="inline-flex items-center gap-2 bg-white font-bold text-sm px-5 py-3 border-2 border-black shadow-brutal hover-lift"
              >
                Meet the CEO
              </a>
            </div>
          </div>
          <div className="relative">
            <img
              src={TEAM_IMG}
              alt="The BotNira team at their office"
              data-testid="team-hero-image"
              className="w-full border-2 border-black shadow-brutal object-cover"
              loading="eager"
            />
            <div className="absolute -bottom-4 -left-4 bg-[#002FA7] text-white border-2 border-black px-4 py-2 shadow-brutal hidden sm:block">
              <span className="font-display font-black text-2xl leading-none">135+</span>
              <span className="block text-[10px] font-bold uppercase tracking-widest">team members</span>
            </div>
          </div>
        </div>
      </section>

      {/* CEO / Leadership */}
      <section id="leadership" className="scroll-mt-20" data-testid="team-ceo-section">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-20 grid lg:grid-cols-5 gap-10 lg:gap-14 items-start">
          <div className="lg:col-span-2 lg:sticky lg:top-24">
            <img
              src={CEO_IMG}
              alt="Kamaljeet Singh Sidhu, CEO of BotNira"
              data-testid="team-ceo-image"
              className="w-full border-2 border-black shadow-brutal object-cover"
              loading="lazy"
            />
            <div className="mt-4 border-2 border-black bg-white p-4 shadow-brutal">
              <div className="font-display font-black text-xl">Kamaljeet Singh Sidhu</div>
              <div className="text-sm font-bold text-[#002FA7]">Founder &amp; CEO, BotNira</div>
              <p className="mt-2 text-xs font-mono opacity-70 leading-relaxed">
                B.Tech, Conestoga College · Founder of ImmiPRO &amp; The DigiSparrow
              </p>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="inline-flex items-center gap-2 bg-white border-2 border-black px-3 py-1 text-xs font-bold uppercase tracking-widest shadow-brutal">
              Leadership
            </div>
            <h2 className="mt-4 font-display font-black text-3xl sm:text-4xl tracking-tight">
              From a missed call to a mission
            </h2>
            <ol className="mt-8 space-y-8">
              {STORY.map((s, i) => (
                <li key={i} className="flex gap-4" data-testid={`ceo-story-step-${i}`}>
                  <div className="shrink-0">
                    <div className="w-11 h-11 grid place-items-center bg-[#002FA7] text-white border-2 border-black shadow-brutal">
                      <s.icon size={18} />
                    </div>
                    {i < STORY.length - 1 && <div className="w-0.5 bg-black/20 mx-auto mt-2 h-full min-h-[24px]" />}
                  </div>
                  <div className="pb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold bg-yellow-300 border border-black px-1.5">
                        0{i + 1}
                      </span>
                      <h3 className="font-display font-bold text-lg sm:text-xl">{s.title}</h3>
                    </div>
                    <p className="mt-2 text-base opacity-80 leading-relaxed">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Team story + values */}
      <section className="border-t-2 border-black bg-white" data-testid="team-story-section">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-yellow-300 border-2 border-black px-3 py-1 text-xs font-bold uppercase tracking-widest shadow-brutal">
              <Users size={14} /> The Team
            </div>
            <h2 className="mt-4 font-display font-black text-3xl sm:text-4xl tracking-tight">
              One team, obsessed with never missing a customer
            </h2>
            <p className="mt-5 text-base sm:text-lg opacity-80 leading-relaxed">
              Behind BotNira is a tight-knit crew from The DigiSparrow — 135 engineers, designers, product
              thinkers, and support specialists spread across India, Canada, and the UK. We're the kind of team
              that answers its own phone. We test every feature against a simple question: would this have saved
              a real business a real customer? If not, it doesn't ship. That standard is why businesses trust
              BotNira to be the first voice their callers ever hear.
            </p>
          </div>

          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {VALUES.map((v, i) => (
              <div
                key={i}
                data-testid={`team-value-${i}`}
                className="border-2 border-black bg-[#FDFBF7] p-6 shadow-brutal hover-lift"
              >
                <div className="w-11 h-11 grid place-items-center bg-black text-white border-2 border-black">
                  <v.icon size={18} />
                </div>
                <h3 className="mt-4 font-display font-bold text-lg">{v.title}</h3>
                <p className="mt-2 text-sm opacity-75 leading-relaxed">{v.body}</p>
              </div>
            ))}
          </div>

          {/* Stats strip */}
          <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 border-2 border-black shadow-brutal divide-x-2 divide-black bg-white overflow-hidden">
            {[
              { n: "135+", l: "Team members" },
              { n: "3", l: "Countries" },
              { n: "2", l: "Brands built" },
              { n: "24/7", l: "Always answering" },
            ].map((s, i) => (
              <div key={i} className="p-5 sm:p-6 text-center" data-testid={`team-stat-${i}`}>
                <div className="font-display font-black text-2xl sm:text-3xl text-[#002FA7]">{s.n}</div>
                <div className="mt-1 text-[10px] sm:text-xs font-bold uppercase tracking-widest opacity-70">
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#002FA7] text-white border-t-2 border-black" data-testid="team-cta-section">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-16 text-center">
          <h2 className="font-display font-black text-3xl sm:text-4xl tracking-tight">
            Want the same team answering your phones?
          </h2>
          <p className="mt-4 text-base sm:text-lg opacity-85 max-w-2xl mx-auto">
            Put BotNira at your front desk and never miss another customer — on calls, WhatsApp, SMS, or email.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              to="/signup"
              data-testid="team-bottom-cta-signup"
              className="inline-flex items-center gap-2 bg-yellow-300 text-black font-bold text-sm px-6 py-3 border-2 border-black shadow-brutal hover-lift"
            >
              Start free trial <ArrowRight size={16} />
            </Link>
            <Link
              to="/#contact"
              data-testid="team-bottom-cta-contact"
              className="inline-flex items-center gap-2 bg-white text-black font-bold text-sm px-6 py-3 border-2 border-black shadow-brutal hover-lift"
            >
              Talk to us
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
