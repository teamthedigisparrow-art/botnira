import { useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowRight, Check, Sparkles, Clock, Globe, MessageCircle, Phone, Mail,
  MessageSquare, ChevronLeft, Building, Shield,
} from "lucide-react";
import { findSeoPageBySlug, SEO_PAGES } from "../data/seoPages";
import BrandMark from "../components/BrandMark";

/**
 * Generic SEO landing page for search-intent keywords (e.g. /ai-sales-agent,
 * /24-7-ai-receptionist, /whatsapp-ai-assistant).
 *
 * SEO:
 *   - title + meta tags written into <head> on mount
 *   - schema.org JSON-LD: FAQPage + Article + BreadcrumbList + Organization
 *   - canonical link, OpenGraph, Twitter cards
 *   - Internal links to other SEO pages + use-case pages for crawl density
 */
export default function SeoLandingPage({ slug: propSlug }) {
  const params = useParams();
  const slug = propSlug || params.slug;
  const nav = useNavigate();
  const data = findSeoPageBySlug(slug);

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

    const canonical = `https://botnira.com${data.path}`;
    document.title = data.seo.title;
    setMeta('meta[name="description"]', "content", data.seo.description);
    setMeta('meta[name="keywords"]', "content", data.seo.keywords);
    setMeta('meta[property="og:title"]', "content", data.seo.title);
    setMeta('meta[property="og:description"]', "content", data.seo.description);
    setMeta('meta[property="og:type"]', "content", "article");
    setMeta('meta[property="og:url"]', "content", canonical);
    setMeta('meta[property="og:image"]', "content", "https://botnira.com/brand/botnira-mark-512.png");
    setMeta('meta[name="twitter:card"]', "content", "summary_large_image");
    setMeta('meta[name="twitter:title"]', "content", data.seo.title);
    setMeta('meta[name="twitter:description"]', "content", data.seo.description);
    setLink("canonical", canonical);

    // JSON-LD: Article + FAQ + Breadcrumb + Organization
    const jsonld = [
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: data.seo.title,
        description: data.seo.description,
        image: "https://botnira.com/brand/botnira-mark-512.png",
        author: { "@type": "Organization", name: "BotNira" },
        publisher: {
          "@type": "Organization",
          name: "BotNira",
          logo: { "@type": "ImageObject", url: "https://botnira.com/brand/botnira-mark-512.png" },
        },
        mainEntityOfPage: canonical,
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: data.faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://botnira.com/" },
          { "@type": "ListItem", position: 2, name: data.intent, item: canonical },
        ],
      },
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "BotNira",
        url: "https://botnira.com",
        logo: "https://botnira.com/brand/botnira-mark-512.png",
        contactPoint: [{
          "@type": "ContactPoint",
          telephone: "+1-548-577-3855",
          contactType: "Sales",
          email: "kamal@botnira.com",
          areaServed: ["CA", "US", "GB", "IN", "AU"],
          availableLanguage: ["en", "es", "fr", "hi", "pa", "ar", "zh", "pt"],
        }],
        sameAs: ["https://wa.me/15485773855"],
      },
    ];
    let s = document.getElementById("ld-json");
    if (!s) {
      s = document.createElement("script");
      s.type = "application/ld+json";
      s.id = "ld-json";
      document.head.appendChild(s);
    }
    s.textContent = JSON.stringify(jsonld);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [data]);

  if (!data) return null;
  const Icon = data.icon;

  return (
    <div className="min-h-screen bg-white text-black" data-testid={`seo-page-${data.slug}`}>
      {/* Top nav */}
      <header className="border-b-2 border-black sticky top-0 bg-white z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3" data-testid="brand-logo-link">
            <BrandMark size={32} />
            <span className="font-display font-black text-2xl tracking-tighter">BotNira</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm font-bold">
            <Link to="/#pricing" className="hidden sm:inline hover:text-[#002FA7]">Pricing</Link>
            <Link to="/#contact" className="hidden sm:inline hover:text-[#002FA7]">Contact</Link>
            <Link to="/login" className="hidden md:inline hover:text-[#002FA7]">Log in</Link>
            <Link
              to="/signup"
              className="bg-[#002FA7] text-white px-4 py-2 border-2 border-black shadow-brutal hover-lift flex items-center gap-1"
              data-testid="seo-cta-signup"
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
          <span className="text-black font-bold">{data.intent}</span>
        </div>
      </div>

      {/* Hero */}
      <section className="border-b-2 border-black">
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-24 grid lg:grid-cols-12 gap-10">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 border-2 border-black bg-yellow-300 px-3 py-1 text-xs font-bold tracking-widest uppercase">
              <Icon size={14} /> {data.hero.eyebrow}
            </div>
            <h1 className="mt-5 font-display text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter leading-[0.95]" data-testid="seo-h1">
              {data.hero.h1}
            </h1>
            <p className="mt-6 text-lg text-neutral-800 max-w-2xl leading-relaxed">{data.hero.sub}</p>
            <div className="mt-8 flex items-center gap-4 flex-wrap">
              <Link to="/signup" data-testid="seo-cta-primary" className="bg-[#002FA7] text-white px-6 py-3 border-2 border-black shadow-brutal hover-lift font-bold flex items-center gap-2">
                Start your 5-day free trial <ArrowRight size={16} />
              </Link>
              <Link to="/#contact" className="border-2 border-black px-6 py-3 hover-lift font-bold flex items-center gap-2">
                Talk to us →
              </Link>
            </div>
            <div className="mt-6 flex items-center gap-3 text-xs font-mono text-neutral-600">
              <Sparkles size={12} /> No credit card · 5 channels · Cancel anytime
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
            { I: Globe, l: "Web Widget" },
            { I: MessageCircle, l: "WhatsApp" },
            { I: Phone, l: "Voice (Twilio number)" },
            { I: MessageSquare, l: "SMS · US/CA" },
            { I: Mail, l: "Email" },
          ].map(({ I, l }) => (
            <div key={l} className="flex items-center gap-3">
              <I size={20} className="text-yellow-300" />
              <span className="font-display font-bold">{l}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Problem */}
      <section className="border-b-2 border-black bg-white">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <h2 className="font-display text-3xl md:text-4xl font-black tracking-tighter">{data.problem.title}</h2>
          <div className="mt-8 grid md:grid-cols-2 gap-5">
            {data.problem.points.map((p, i) => (
              <div key={i} className="border-2 border-black p-5 bg-amber-50 flex gap-3">
                <div className="font-display font-black text-2xl text-[#002FA7] shrink-0">{i + 1}</div>
                <p className="text-sm leading-relaxed text-neutral-900">{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-b-2 border-black bg-neutral-50">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <h2 className="font-display text-3xl md:text-4xl font-black tracking-tighter">How it works</h2>
          <p className="mt-3 max-w-2xl text-neutral-700">From signup to first booked customer in under 5 minutes.</p>
          <ol className="mt-10 grid md:grid-cols-4 gap-5">
            {data.how.map((step) => (
              <li key={step.step} className="border-2 border-black p-5 bg-white shadow-brutal" data-testid={`how-${data.slug}-${step.step}`}>
                <div className="font-display font-black text-5xl text-[#002FA7] leading-none">{String(step.step).padStart(2, "0")}</div>
                <div className="mt-3 font-display font-bold">{step.title}</div>
                <p className="mt-2 text-xs text-neutral-700 leading-relaxed">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Pricing teaser */}
      <section id="pricing" className="border-b-2 border-black bg-white">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <h2 className="font-display text-3xl md:text-4xl font-black tracking-tighter">Simple pricing. Pay for what you use.</h2>
          <p className="mt-3 max-w-2xl text-neutral-700">All plans include voice, WhatsApp, web chat, SMS and email — pick the volume that matches your business.</p>
          <div className="mt-8 grid md:grid-cols-3 gap-5">
            {[
              { name: "Starter", price: 49, min: 100, msg: 2000, tag: "Solos & side hustles" },
              { name: "Growth", price: 149, min: 500, msg: 8000, tag: "Most businesses", featured: true, sales: true },
              { name: "Pro", price: 399, min: 1500, msg: 25000, tag: "Clinics & agencies", sales: true },
            ].map((p) => (
              <div key={p.name} className={`relative border-2 border-black p-6 bg-white shadow-brutal ${p.featured ? "ring-4 ring-[#002FA7]" : ""}`}>
                {p.sales && (
                  <div className="sales-assistant-badge">
                    <Sparkles size={11} className="inline -mt-0.5 mr-1" /> Sales Assistant Included
                  </div>
                )}
                <div className="font-display font-black text-2xl">{p.name}</div>
                <div className="text-xs text-neutral-600">{p.tag}</div>
                <div className="mt-4 font-display font-black text-5xl tracking-tighter">${p.price}<span className="text-xs font-mono ml-1 text-neutral-500">/mo</span></div>
                <ul className="mt-4 space-y-1.5 text-xs">
                  <li className="flex gap-1.5"><Check size={12} className="text-green-700 mt-0.5" /> {p.min} voice minutes</li>
                  <li className="flex gap-1.5"><Check size={12} className="text-green-700 mt-0.5" /> {p.msg.toLocaleString()} AI messages</li>
                  <li className="flex gap-1.5"><Check size={12} className="text-green-700 mt-0.5" /> All 5 channels included</li>
                  <li className="flex gap-1.5"><Check size={12} className="text-green-700 mt-0.5" /> Live agent override</li>
                </ul>
              </div>
            ))}
          </div>
          <Link to="/#pricing" className="mt-6 inline-block border-2 border-black px-5 py-2 font-bold hover-lift">See full pricing →</Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b-2 border-black bg-neutral-50">
        <div className="max-w-4xl mx-auto px-6 py-20">
          <h2 className="font-display text-3xl md:text-4xl font-black tracking-tighter">Frequently asked</h2>
          <div className="mt-8 divide-y-2 divide-black border-2 border-black bg-white">
            {data.faqs.map((f, i) => (
              <details key={i} className="group p-5" data-testid={`faq-${data.slug}-${i}`}>
                <summary className="cursor-pointer font-display font-bold text-lg flex justify-between items-start gap-3">
                  <span>{f.q}</span>
                  <span className="text-[#002FA7] group-open:rotate-45 transition-transform shrink-0">+</span>
                </summary>
                <p className="mt-3 text-sm text-neutral-800 leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* About + Company */}
      <section className="border-b-2 border-black bg-white">
        <div className="max-w-7xl mx-auto px-6 py-20 grid md:grid-cols-2 gap-10">
          <div>
            <div className="text-xs font-bold tracking-[0.25em] uppercase text-[#002FA7]">About BotNira</div>
            <h2 className="mt-2 font-display text-3xl md:text-4xl font-black tracking-tighter">An AI receptionist for every business that hates missed calls.</h2>
            <p className="mt-4 text-neutral-800 leading-relaxed">
              BotNira is a multi-tenant AI receptionist platform built for service businesses, clinics, salons,
              consultants, immigration practices, agencies and small-to-mid B2B companies.
              We answer every call, message, email and DM the moment it lands — book appointments, qualify leads,
              capture payments — in 90+ languages, 24 hours a day.
            </p>
            <p className="mt-3 text-neutral-800 leading-relaxed">
              Built on the most reliable telecom and AI infrastructure available today (Twilio · Meta WhatsApp Cloud API · OpenAI · Stripe),
              with strict tenant isolation, end-to-end encryption in transit, and a hard-stop billing model so you never get a surprise bill.
            </p>
            <div className="mt-5 flex gap-3 flex-wrap">
              <Link to="/#contact" className="border-2 border-black px-5 py-2 font-bold bg-[#002FA7] text-white shadow-brutal hover-lift">Talk to our team</Link>
              <Link to="/signup" className="border-2 border-black px-5 py-2 font-bold hover-lift">Start free trial</Link>
            </div>
          </div>
          <div className="border-2 border-black p-6 bg-neutral-50 shadow-brutal">
            <div className="text-xs font-bold tracking-[0.25em] uppercase text-neutral-700">
              <Building size={11} className="inline -mt-0.5 mr-1" /> Company details
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-widest text-neutral-500">Product</dt>
                <dd>BotNira — AI Receptionist & Sales Assistant Platform</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-widest text-neutral-500">Headquarters</dt>
                <dd>Toronto, Ontario, Canada</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-widest text-neutral-500">Serving</dt>
                <dd>Canada · United States · United Kingdom · India · Australia · 90+ countries (multi-language)</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-widest text-neutral-500">Sales WhatsApp</dt>
                <dd><a className="underline" href="https://wa.me/15485773855">+1 (548) 577 3855</a></dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-widest text-neutral-500">Sales Email</dt>
                <dd><a className="underline" href="mailto:kamal@botnira.com">kamal@botnira.com</a></dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-widest text-neutral-500">Website</dt>
                <dd><a className="underline" href="https://botnira.com">https://botnira.com</a></dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-widest text-neutral-500">Compliance</dt>
                <dd className="flex items-center gap-1.5"><Shield size={12} /> CASL · CAN-SPAM · Tenant-isolated data · TLS 1.2+</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* Other SEO pages — internal crawl graph */}
      <section className="border-b-2 border-black bg-white">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <h2 className="font-display text-2xl md:text-3xl font-black tracking-tighter">Explore more</h2>
          <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {SEO_PAGES.filter((p) => p.slug !== data.slug).map((p) => (
              <Link key={p.slug} to={p.path}
                    className="border-2 border-black p-4 hover-lift bg-white flex items-start gap-3"
                    data-testid={`seo-related-${p.slug}`}>
                <div className="w-9 h-9 border-2 border-black bg-yellow-300 flex items-center justify-center shrink-0">
                  <p.icon size={16} />
                </div>
                <div>
                  <div className="font-display font-black text-sm">{p.intent}</div>
                  <div className="text-[11px] text-neutral-600 mt-0.5 line-clamp-2">{p.seo.description}</div>
                </div>
              </Link>
            ))}
          </div>
          <Link to="/" className="mt-6 inline-flex items-center gap-1 text-sm font-bold hover:text-[#002FA7]">
            <ChevronLeft size={14} /> Back to homepage
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black text-white">
        <div className="max-w-7xl mx-auto px-6 py-10 text-sm text-neutral-300 flex justify-between flex-wrap gap-4">
          <div>© {new Date().getFullYear()} BotNira. All rights reserved.</div>
          <div className="flex gap-4">
            <Link to="/privacy" className="hover:text-white">Privacy</Link>
            <Link to="/terms" className="hover:text-white">Terms</Link>
            <Link to="/#contact" className="hover:text-white">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
