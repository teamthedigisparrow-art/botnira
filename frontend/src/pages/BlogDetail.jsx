import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, Calendar, Eye, User, Share2, ArrowRight } from "lucide-react";
import SiteNav from "../components/marketing/SiteNav";
import SiteFooter from "../components/marketing/SiteFooter";
import { renderMarkdown } from "../lib/markdown";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmtDate = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric", month: "long", day: "numeric",
    });
  } catch { return ""; }
};

const resolveImg = (url) =>
  url && url.startsWith("/api/")
    ? `${process.env.REACT_APP_BACKEND_URL}${url}`
    : url;

export default function BlogDetail() {
  const { slug } = useParams();
  const [blog, setBlog] = useState(null);
  const [related, setRelated] = useState([]);
  const [state, setState] = useState("loading"); // loading | ok | notfound

  useEffect(() => {
    setState("loading");
    setBlog(null);
    axios.get(`${API}/blogs/by-slug/${encodeURIComponent(slug)}`)
      .then(({ data }) => {
        const b = data.blog;
        setBlog(b);
        setState("ok");
        // SEO: set title + meta description
        document.title = `${b.seo_title || b.title} | BotNira Blog`;
        const meta = document.querySelector('meta[name="description"]')
          || (() => {
            const m = document.createElement("meta");
            m.name = "description";
            document.head.appendChild(m);
            return m;
          })();
        meta.setAttribute("content", b.seo_description || b.excerpt || "");
        // Per-page canonical + og:url (baked into prerendered HTML by react-snap)
        const canonicalUrl = `https://botnira.com/blog/${b.slug || slug}`;
        const setHead = (selector, create) => {
          let el = document.querySelector(selector);
          if (!el) { el = create(); document.head.appendChild(el); }
          return el;
        };
        setHead('link[rel="canonical"]', () => { const l = document.createElement("link"); l.rel = "canonical"; return l; }).setAttribute("href", canonicalUrl);
        setHead('meta[property="og:url"]', () => { const m = document.createElement("meta"); m.setAttribute("property", "og:url"); return m; }).setAttribute("content", canonicalUrl);
        setHead('meta[property="og:title"]', () => { const m = document.createElement("meta"); m.setAttribute("property", "og:title"); return m; }).setAttribute("content", `${b.seo_title || b.title} | BotNira Blog`);
        setHead('meta[property="og:description"]', () => { const m = document.createElement("meta"); m.setAttribute("property", "og:description"); return m; }).setAttribute("content", b.seo_description || b.excerpt || "");
        setHead('meta[property="og:type"]', () => { const m = document.createElement("meta"); m.setAttribute("property", "og:type"); return m; }).setAttribute("content", "article");
      })
      .catch(() => setState("notfound"));

    // Load related posts (excluding current)
    axios.get(`${API}/blogs`).then(({ data }) => setRelated(data.blogs || [])).catch(() => {});
  }, [slug]);

  const html = useMemo(() => renderMarkdown(blog?.body_markdown || ""), [blog]);
  const others = related.filter((b) => b.slug !== slug).slice(0, 3);

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      try { await navigator.share({ title: blog?.title, url }); } catch { /* user cancelled */ }
    } else if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        alert("Link copied!");
      } catch { /* ignore */ }
    }
  };

  return (
    <div data-testid="blog-detail-page">
      <SiteNav />

      {state === "loading" && (
        <div className="max-w-4xl mx-auto px-6 py-20 font-mono text-neutral-500" data-testid="blog-detail-loading">
          Loading article…
        </div>
      )}

      {state === "notfound" && (
        <div className="max-w-4xl mx-auto px-6 py-20" data-testid="blog-detail-notfound">
          <div className="border-2 border-dashed border-neutral-400 p-12 text-center">
            <div className="font-display text-3xl font-black tracking-tighter">Article not found</div>
            <p className="text-neutral-600 mt-3">It may have been moved or unpublished.</p>
            <Link
              to="/blog"
              data-testid="blog-back-to-list"
              className="mt-6 inline-flex items-center gap-2 bg-black text-white font-bold px-5 py-2 border-2 border-black"
            >
              <ArrowLeft size={14}/> Back to blog
            </Link>
          </div>
        </div>
      )}

      {state === "ok" && blog && (
        <>
          <article className="border-b-2 border-black bg-white">
            <div className="max-w-3xl mx-auto px-6 pt-12 pb-6">
              <Link
                to="/blog"
                data-testid="blog-detail-back"
                className="inline-flex items-center gap-2 text-sm font-bold hover:underline"
              >
                <ArrowLeft size={14}/> All articles
              </Link>
              <div className="mt-6 flex flex-wrap items-center gap-3 text-xs font-mono uppercase tracking-widest text-neutral-600">
                <span className="flex items-center gap-1"><Calendar size={11}/> {fmtDate(blog.published_at || blog.created_at)}</span>
                <span className="flex items-center gap-1"><User size={11}/> {blog.author_name || "BotNira Team"}</span>
                <span className="flex items-center gap-1"><Eye size={11}/> {blog.view_count || 0} views</span>
              </div>
              <h1 className="font-display text-4xl md:text-6xl font-black tracking-tighter mt-3 leading-[1.05]" data-testid="blog-detail-title">
                {blog.title}
              </h1>
              {blog.subtitle && (
                <p className="mt-4 text-lg md:text-xl text-neutral-700">{blog.subtitle}</p>
              )}
              <div className="mt-5 flex items-center gap-2 flex-wrap">
                {(blog.tags || []).map((t) => (
                  <Link
                    key={t}
                    to={`/blog?tag=${encodeURIComponent(t)}`}
                    className="text-[10px] font-bold uppercase tracking-widest bg-neutral-100 border border-black px-2 py-0.5 hover:bg-yellow-200"
                  >
                    #{t}
                  </Link>
                ))}
                <button
                  onClick={share}
                  data-testid="blog-share-btn"
                  className="ml-auto inline-flex items-center gap-1 text-xs font-bold border-2 border-black px-3 py-1 hover-lift bg-white"
                >
                  <Share2 size={12}/> Share
                </button>
              </div>
            </div>

            {blog.featured_image_url && (
              <div className="max-w-5xl mx-auto px-6">
                <img
                  src={resolveImg(blog.featured_image_url)}
                  alt={blog.title}
                  data-testid="blog-detail-featured-image"
                  className="w-full border-2 border-black shadow-brutal-lg max-h-[520px] object-cover"
                />
              </div>
            )}

            <div className="max-w-3xl mx-auto px-6 py-12">
              <div
                className="prose prose-neutral max-w-none blog-body"
                data-testid="blog-detail-body"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          </article>

          {others.length > 0 && (
            <section className="border-b-2 border-black bg-neutral-50">
              <div className="max-w-5xl mx-auto px-6 py-14">
                <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">Keep reading</div>
                <h2 className="font-display text-3xl md:text-4xl font-black tracking-tighter mt-2">More from BotNira.</h2>
                <div className="mt-8 grid md:grid-cols-3 gap-5">
                  {others.map((o) => (
                    <Link
                      key={o.id}
                      to={`/blog/${o.slug}`}
                      data-testid={`blog-related-${o.slug}`}
                      className="block border-2 border-black bg-white p-5 hover-lift"
                    >
                      <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-600">
                        {fmtDate(o.published_at || o.created_at)}
                      </div>
                      <div className="font-display font-black text-lg mt-1 leading-tight">{o.title}</div>
                      {o.excerpt && <p className="text-sm text-neutral-600 mt-2 line-clamp-3">{o.excerpt}</p>}
                      <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold">
                        Read <ArrowRight size={14}/>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}
        </>
      )}

      <SiteFooter />
    </div>
  );
}
