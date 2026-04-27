import { useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowRight, Check, Sparkles, Clock, Globe, MessageCircle, Phone, Mail, MessageSquare, ChevronLeft } from "lucide-react";
import { findUseCaseBySlug, USE_CASE_PAGES } from "../data/useCases";
import BrandMark from "../components/BrandMark";

/**
 * Generic detail page for any /use-case/<slug>.
 *
 * SEO:
 *   - title + meta tags written into <head> on mount
 *   - schema.org JSON-LD for FAQ + Article + BreadcrumbList
 *   - canonical link to https://botnira.com/use-case/<slug>
 *   - OpenGraph + Twitter card meta tags
 *   - Internal links to other use cases for crawl-graph density
 *
 * GA + Search Console tags ship globally via /public/index.html (no per-page work).
 */
export default function UseCasePage() {
  const { slug } = useParams();
  const nav = useNavigate();
  const data = findUseCaseBySlug(slug);

  // 404 → landing
  useEffect(() => {
    if (!data) nav("/", { replace: true });
  }, [data, nav]);

  // Per-page SEO
  useEffect(() => {
    if (!data) return;
    const setMeta = (selector, attr, value) => {
      let el = document.head.querySelector(selector);
      if (!el) {
        el = document.createElement("meta");
        const [, prop, key] = selector.match(/\[(name|property)="([^"]+)"\]/) || [];
        if (prop && key) el.setAttribute(prop, key);
        document.head.appendChild(el);
      }
      el.setAttribute(attr, value);
    };
    const setLink = (rel, href) => {
      let el = document.head.querySelector(`link[rel="${rel}"]`);
      if (!el) {
        el = document.createElement("link");
        el.setAttribute("rel", rel);
        document.head.appendChild(el);
      }
      el.setAttribute("href", href);
    };

    document.title = data.seo.title;
    setMeta('meta[name="description"]', "content", data.seo.description);
    setMeta('meta[name="keywords"]', "content", data.seo.keywords);
    setMeta('meta[property="og:title"]', "content", data.seo.title);
    setMeta('meta[property="og:description"]', "content", data.seo.description);
    setMeta('meta[property="og:type"]', "content", "article");
    setMeta('meta[property="og:url"]', "content", `https://botnira.com/use-case/${data.slug}`);
    setMeta('meta[property="og:image"]', "content", "https://botnira.com/brand/botnira-mark-512.png");
    setMeta('meta[name="twitter:card"]', "content", "summary_large_image");
    setMeta('meta[name="twitter:title"]', "content", data.seo.title);
    setMeta('meta[name="twitter:description"]', "content", data.seo.description);
    setLink("canonical", `https://botnira.com/use-case/${data.slug}`);

    // JSON-LD: FAQ + BreadcrumbList + Article
    const ld = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "FAQPage",
          mainEntity: data.faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://botnira.com/" },
            { "@type": "ListItem", position: 2, name: "Use Cases", item: "https://botnira.com/#usecases" },
            { "@type": "ListItem", position: 3, name: data.industry, item: `https://botnira.com/use-case/${data.slug}` },
          ],
        },
        {
          "@type": "Article",
          headline: data.hero.h1,
          description: data.seo.description,
          image: "https://botnira.com/brand/botnira-mark-512.png",
          author: { "@type": "Organization", name: "BotNira" },
          publisher: {
            "@type": "Organization",
            name: "BotNira",
            logo: { "@type": "ImageObject", url: "https://botnira.com/brand/botnira-mark-512.png" },
          },
          datePublished: "2026-04-01",
          dateModified: new Date().toISOString().split("T")[0],
        },
      ],
    };
    let ldEl = document.head.querySelector("script[data-usecase-jsonld]");
    if (!ldEl) {
      ldEl = document.createElement("script");
      ldEl.setAttribute("type", "application/ld+json");
      ldEl.setAttribute("data-usecase-jsonld", "true");
      document.head.appendChild(ldEl);
    }
    ldEl.textContent = JSON.stringify(ld);

    return () => {
      // Drop schema when unmounting so other pages don't inherit it
      ldEl?.remove();
    };
  }, [data]);

  if (!data) return null;
  const Icon = data.icon;
  const others = USE_CASE_PAGES.filter((u) => u.slug !== data.slug).slice(0, 4);

  return (
    <div className="min-h-screen bg-white text-black" data-testid={`usecase-page-${data.slug}`}>
      {/* Top nav */}
      <header className="border-b-2 border-black sticky top-0 bg-white z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3" data-testid="brand-logo-link">
            <BrandMark size={32} />
            <span className="font-display font-black text-2xl tracking-tighter">BotNira</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm font-bold">
            <Link to="/#pricing" className="hidden sm:inline hover:text-[#002FA7]">Pricing</Link>
            <Link to="/#usecases" className="hidden sm:inline hover:text-[#002FA7]">Use cases</Link>
            <Link to="/login" className="hidden md:inline hover:text-[#002FA7]">Log in</Link>
            <Link
              to="/signup"
              className="bg-[#002FA7] text-white px-4 py-2 border-2 border-black shadow-brutal hover-lift flex items-center gap-1"
              data-testid="hero-cta-signup"
            >
              Start free <ArrowRight size={14} />
            </Link>
          </nav>
        </div>
      </header>

      {/* Breadcrumb */}
      <div className="border-b border-black/10 bg-neutral-50">
        <div className="max-w-7xl mx-auto px-6 py-3 text-xs font-mono text-neutral-600 flex items-center gap-2">
          <Link to="/" className="hover:text-[#002FA7]">Home</Link>
          <span>›</span>
          <Link to="/#usecases" className="hover:text-[#002FA7]">Use Cases</Link>
          <span>›</span>
          <span className="text-black font-bold">{data.industry}</span>
        </div>
      </div>

      {/* Hero */}
      <section className="border-b-2 border-black">
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-24 grid lg:grid-cols-12 gap-10">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 border-2 border-black bg-yellow-300 px-3 py-1 text-xs font-bold tracking-widest uppercase">
              <Icon size={14} /> {data.hero.eyebrow}
            </div>
            <h1 className="mt-5 font-display text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter leading-[0.95]" data-testid="usecase-h1">
              {data.hero.h1}
            </h1>
            <p className="mt-6 text-lg text-neutral-800 max-w-2xl leading-relaxed">{data.hero.sub}</p>
            <div className="mt-8 flex items-center gap-4 flex-wrap">
              <Link to="/signup" data-testid="usecase-cta-primary" className="bg-[#002FA7] text-white px-6 py-3 border-2 border-black shadow-brutal hover-lift font-bold flex items-center gap-2">
                Start your 5-day free trial <ArrowRight size={16} />
              </Link>
              <Link to="/#try" className="border-2 border-black px-6 py-3 hover-lift font-bold flex items-center gap-2">
                Try it live →
              </Link>
            </div>
            <div className="mt-6 flex items-center gap-3 text-xs font-mono text-neutral-600">
              <Sparkles size={12} /> No credit card · 5 channels included · Cancel anytime
            </div>
          </div>
          <div className="lg:col-span-5">
            <div className="border-2 border-black p-8 bg-yellow-50 shadow-brutal sticky top-24">
              <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-700">By the numbers</div>
              <div className="mt-3 font-display font-black text-7xl tracking-tighter text-[#002FA7]">{data.hero.stat.kpi}</div>
              <p className="mt-2 text-sm text-neutral-800">{data.hero.stat.label}</p>
              <div className="mt-6 border-t-2 border-black pt-4 flex items-center gap-2 text-xs font-mono">
                <Clock size={12} /> Live in under 5 minutes
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Channels strip */}
      <section className="border-b-2 border-black bg-black text-white">
        <div className="max-w-7xl mx-auto px-6 py-10 flex items-center justify-around flex-wrap gap-6">
          {[
            { Icon: Globe, label: "Web Widget" },
            { Icon: MessageCircle, label: "WhatsApp" },
            { Icon: Phone, label: "Voice (Twilio number)" },
            { Icon: MessageSquare, label: "SMS · US/CA" },
            { Icon: Mail, label: "Email" },
          ].map(({ Icon: I, label }) => (
            <div key={label} className="flex items-center gap-3">
              <I size={20} className="text-yellow-300" />
              <span className="font-display font-bold">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Why it matters */}
      <section className="border-b-2 border-black bg-white">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <h2 className="font-display text-3xl md:text-4xl font-black tracking-tighter">Why a {data.industry.toLowerCase()} needs an AI receptionist.</h2>
          <p className="mt-3 max-w-2xl text-neutral-700">The four pain points BotNira solves first.</p>
          <div className="mt-10 grid md:grid-cols-2 gap-6">
            {data.why.map((w) => (
              <div key={w.title} className="border-2 border-black p-6 hover-lift" data-testid={`why-${data.slug}-${w.title.slice(0,12).replace(/\s/g,'-')}`}>
                <div className="font-display font-black text-xl">{w.title}</div>
                <p className="mt-3 text-sm text-neutral-800 leading-relaxed">{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-b-2 border-black bg-yellow-50">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">How it works</div>
          <h2 className="font-display text-3xl md:text-4xl font-black tracking-tighter mt-2">From "ring ring" to confirmed booking.</h2>
          <div className="mt-10 grid md:grid-cols-4 gap-5">
            {data.workflow.map((s) => (
              <div key={s.step} className="border-2 border-black bg-white p-6">
                <div className="font-display font-black text-5xl tracking-tighter text-[#002FA7]">{s.step}</div>
                <div className="mt-3 font-bold leading-tight">{s.title}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b-2 border-black bg-white">
        <div className="max-w-3xl mx-auto px-6 py-20">
          <h2 className="font-display text-3xl md:text-4xl font-black tracking-tighter">Common questions about AI for {data.industry.toLowerCase()}s.</h2>
          <div className="mt-10 space-y-4">
            {data.faqs.map((f, i) => (
              <details key={f.q} className="group border-2 border-black bg-white" data-testid={`usecase-faq-${data.slug}-${i}`}>
                <summary className="cursor-pointer flex justify-between items-center px-6 py-4 list-none">
                  <span className="font-display font-bold text-lg">{f.q}</span>
                  <span className="text-xl group-open:rotate-45 transition-transform">＋</span>
                </summary>
                <div className="px-6 pb-5 text-neutral-800 text-sm leading-relaxed">{f.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Other use cases */}
      <section className="border-b-2 border-black bg-white">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <h2 className="font-display text-3xl md:text-4xl font-black tracking-tighter">More businesses BotNira powers.</h2>
          <div className="mt-8 grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {others.map((o) => {
              const OIcon = o.icon;
              return (
                <Link to={`/use-case/${o.slug}`} key={o.slug} data-testid={`other-usecase-${o.slug}`}
                      className="border-2 border-black p-5 hover-lift bg-white block">
                  <OIcon size={20} className="text-[#002FA7]" />
                  <div className="mt-3 font-display font-black text-lg leading-tight">AI for {o.industry}</div>
                  <div className="mt-2 text-xs font-mono text-neutral-500">/use-case/{o.slug} →</div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-[#002FA7] text-white border-b-2 border-black">
        <div className="max-w-4xl mx-auto px-6 py-20 text-center">
          <h2 className="font-display text-4xl md:text-5xl font-black tracking-tighter">Stop missing customers tonight.</h2>
          <p className="mt-4 text-lg opacity-90 max-w-2xl mx-auto">5 days free. All channels. Cancel anytime. Live in under 5 minutes.</p>
          <Link to="/signup" data-testid="usecase-cta-final" className="mt-8 inline-flex items-center gap-2 bg-yellow-300 text-black font-bold px-8 py-4 border-2 border-black shadow-brutal hover-lift">
            Start your free trial <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* Footer with brand + GSC + GA already in <head>) */}
      <footer className="bg-black text-white">
        <div className="max-w-7xl mx-auto px-6 py-10 grid md:grid-cols-3 gap-6">
          <div>
            <div className="flex items-center gap-3">
              <BrandMark size={32} />
              <span className="font-display font-black text-2xl tracking-tighter">BotNira</span>
            </div>
            <p className="mt-3 text-sm opacity-70">AI receptionist for every business. Web, WhatsApp, SMS, voice, email — answered 24/7.</p>
          </div>
          <div>
            <div className="font-display font-bold text-xs uppercase tracking-widest opacity-60">Use cases</div>
            <ul className="mt-3 space-y-1 text-sm opacity-90">
              {USE_CASE_PAGES.slice(0,5).map(u => (
                <li key={u.slug}><Link to={`/use-case/${u.slug}`} className="hover:underline">{u.industry}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-display font-bold text-xs uppercase tracking-widest opacity-60">Company</div>
            <ul className="mt-3 space-y-1 text-sm opacity-90">
              <li><Link to="/" className="hover:underline">Home</Link></li>
              <li><Link to="/#pricing" className="hover:underline">Pricing</Link></li>
              <li><Link to="/privacy" className="hover:underline">Privacy</Link></li>
              <li><Link to="/terms" className="hover:underline">Terms</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 px-6 py-4 text-xs font-mono opacity-60 max-w-7xl mx-auto">
          © 2026 BotNira · All rights reserved.
        </div>
      </footer>

      <Link to="/" className="fixed bottom-6 left-6 bg-white border-2 border-black px-3 py-2 shadow-brutal text-xs font-bold flex items-center gap-1 hover-lift z-30">
        <ChevronLeft size={12}/> Home
      </Link>
    </div>
  );
}
