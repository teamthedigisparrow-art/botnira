import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { ArrowRight, Calendar, Eye, Tag, BookOpen } from "lucide-react";
import SiteNav from "../components/marketing/SiteNav";
import SiteFooter from "../components/marketing/SiteFooter";
import { setCanonical } from "../lib/seo";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric", month: "short", day: "numeric",
    });
  } catch { return ""; }
};

export default function Blog() {
  useEffect(() => { setCanonical("/blog"); }, []);
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTag, setActiveTag] = useState(null);

  useEffect(() => {
    document.title = "BotNira Blog — AI Receptionist Insights, Guides & Updates";
    axios.get(`${API}/blogs${activeTag ? `?tag=${encodeURIComponent(activeTag)}` : ""}`)
      .then(({ data }) => setBlogs(data.blogs || []))
      .catch(() => setBlogs([]))
      .finally(() => setLoading(false));
  }, [activeTag]);

  const allTags = Array.from(new Set(blogs.flatMap((b) => b.tags || []))).slice(0, 12);
  const [hero, ...rest] = blogs;

  return (
    <div data-testid="blog-list-page">
      <SiteNav />

      {/* Hero strip */}
      <section className="border-b-2 border-black bg-gradient-to-br from-yellow-100 via-white to-amber-50">
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-20">
          <div className="inline-flex items-center gap-2 border-2 border-black px-3 py-1 bg-white">
            <BookOpen size={14} />
            <span className="text-xs font-bold tracking-[0.18em] uppercase">BotNira Blog</span>
          </div>
          <h1 className="font-display text-5xl md:text-6xl font-black tracking-tighter mt-4 leading-none">
            Insights, playbooks &amp; product updates<br/>
            <span className="bg-black text-[#FFD600] px-3 inline-block">for AI-first front desks.</span>
          </h1>
          <p className="mt-5 text-neutral-700 max-w-2xl text-lg">
            How AI receptionists are reshaping customer support, conversion stories from BotNira vendors,
            integration deep-dives, and step-by-step playbooks you can apply this week.
          </p>
          {allTags.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-2" data-testid="blog-tags-filter">
              <button
                onClick={() => setActiveTag(null)}
                data-testid="blog-tag-all"
                className={`text-xs font-bold uppercase tracking-widest border-2 border-black px-3 py-1.5 ${activeTag === null ? "bg-[#002FA7] text-white" : "bg-white"}`}
              >
                All posts
              </button>
              {allTags.map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTag(t)}
                  data-testid={`blog-tag-${t.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  className={`text-xs font-bold uppercase tracking-widest border-2 border-black px-3 py-1.5 ${activeTag === t ? "bg-[#002FA7] text-white" : "bg-white"}`}
                >
                  #{t}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* List */}
      <section className="border-b-2 border-black bg-white">
        <div className="max-w-7xl mx-auto px-6 py-14">
          {loading ? (
            <div className="font-mono text-neutral-500" data-testid="blog-loading">Loading posts…</div>
          ) : blogs.length === 0 ? (
            <div className="border-2 border-dashed border-neutral-400 p-12 text-center text-neutral-600" data-testid="blog-empty">
              No posts yet. Check back soon.
            </div>
          ) : (
            <>
              {hero && <HeroCard blog={hero} />}
              {rest.length > 0 && (
                <div className="mt-10 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {rest.map((b) => <PostCard key={b.id} blog={b} />)}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function HeroCard({ blog }) {
  return (
    <Link
      to={`/blog/${blog.slug}`}
      className="group block border-2 border-black bg-white shadow-brutal-lg hover-lift overflow-hidden"
      data-testid="blog-hero-card"
    >
      <div className="grid md:grid-cols-2 gap-0">
        <div className="bg-yellow-200 border-r-2 border-black aspect-video md:aspect-auto md:min-h-[320px] overflow-hidden">
          {blog.featured_image_url ? (
            <img
              src={blog.featured_image_url.startsWith("/api/")
                ? `${process.env.REACT_APP_BACKEND_URL}${blog.featured_image_url}`
                : blog.featured_image_url}
              alt={blog.title}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-black/50 font-display font-black text-3xl">
              BotNira ⚡
            </div>
          )}
        </div>
        <div className="p-8 md:p-10 flex flex-col">
          <div className="flex items-center gap-3 text-[10px] font-mono font-bold uppercase tracking-widest text-neutral-600">
            <span className="bg-[#FFD600] border border-black px-2 py-0.5">Featured</span>
            <span className="flex items-center gap-1"><Calendar size={11}/> {fmtDate(blog.published_at || blog.created_at)}</span>
            {blog.view_count > 0 && (
              <span className="flex items-center gap-1"><Eye size={11}/> {blog.view_count}</span>
            )}
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-black tracking-tighter mt-3 leading-tight group-hover:underline">
            {blog.title}
          </h2>
          {blog.subtitle && (
            <p className="mt-3 text-neutral-700 text-lg">{blog.subtitle}</p>
          )}
          {blog.excerpt && (
            <p className="mt-3 text-sm text-neutral-600">{blog.excerpt}</p>
          )}
          <div className="mt-auto pt-6 flex items-center gap-3 flex-wrap">
            {(blog.tags || []).slice(0, 3).map((t) => (
              <span key={t} className="text-[10px] font-bold uppercase tracking-widest bg-neutral-100 border border-black px-2 py-0.5">
                #{t}
              </span>
            ))}
            <span className="ml-auto font-bold inline-flex items-center gap-1 group-hover:text-[#002FA7]">
              Read article <ArrowRight size={16}/>
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function PostCard({ blog }) {
  return (
    <Link
      to={`/blog/${blog.slug}`}
      className="group block border-2 border-black bg-white shadow-brutal hover-lift overflow-hidden flex flex-col"
      data-testid={`blog-card-${blog.slug}`}
    >
      <div className="aspect-video bg-yellow-100 border-b-2 border-black overflow-hidden">
        {blog.featured_image_url ? (
          <img
            src={blog.featured_image_url.startsWith("/api/")
              ? `${process.env.REACT_APP_BACKEND_URL}${blog.featured_image_url}`
              : blog.featured_image_url}
            alt={blog.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-black/40 font-display font-black text-2xl">
            BotNira ⚡
          </div>
        )}
      </div>
      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-neutral-600">
          <Calendar size={10}/>
          <span>{fmtDate(blog.published_at || blog.created_at)}</span>
          {blog.view_count > 0 && (
            <span className="flex items-center gap-1"><Eye size={10}/>{blog.view_count}</span>
          )}
        </div>
        <h3 className="font-display font-black text-xl mt-2 leading-tight group-hover:underline">{blog.title}</h3>
        {blog.excerpt && <p className="text-sm text-neutral-600 mt-2 line-clamp-3">{blog.excerpt}</p>}
        <div className="mt-auto pt-4 flex items-center gap-1.5 flex-wrap">
          {(blog.tags || []).slice(0, 3).map((t) => (
            <span key={t} className="text-[9px] font-bold uppercase tracking-widest bg-neutral-100 border border-black px-1.5 py-0.5">
              <Tag size={9} className="inline -mt-0.5 mr-0.5"/>{t}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
