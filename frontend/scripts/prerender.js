/* eslint-disable */
/**
 * Static prerendering for BotNira's PUBLIC marketing pages only.
 *
 * Uses react-snap's programmatic API with `crawl: false` so that ONLY the
 * routes we explicitly list get snapshotted to static HTML. Authenticated /
 * auth routes (/app, /admin, /login, /signup, /forgot-password, /auth/callback,
 * /book, /r/*) are intentionally left OUT — they keep shipping the bare
 * client-side JS shell exactly as before.
 *
 * Runs as a `postbuild` step. Failures are non-fatal so a missing headless
 * Chromium can never break the deploy build.
 */
const fs = require("fs");
const path = require("path");
const { run } = require("react-snap");

// ---- Load REACT_APP_BACKEND_URL from .env (standalone node has no CRA env) --
function backendUrl() {
  if (process.env.REACT_APP_BACKEND_URL) return process.env.REACT_APP_BACKEND_URL;
  try {
    const envPath = path.join(__dirname, "..", ".env");
    const txt = fs.readFileSync(envPath, "utf8");
    const line = txt.split("\n").find((l) => l.startsWith("REACT_APP_BACKEND_URL="));
    return line ? line.split("=").slice(1).join("=").trim() : "";
  } catch {
    return "";
  }
}

// ---- Chromium executable (headless) ----------------------------------------
function chromePath() {
  for (const p of [process.env.PUPPETEER_EXECUTABLE_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium"]) {
    if (p && fs.existsSync(p)) return p;
  }
  return undefined; // fall back to puppeteer's bundled chromium
}

// ---- Public route allowlist -------------------------------------------------
const STATIC_ROUTES = ["/", "/team", "/privacy", "/terms", "/blog", "/referrals"];

const USE_CASES = [
  "salon", "dental", "auto-repair", "real-estate",
  "restaurant", "education", "home-services", "healthcare-clinic",
].map((s) => `/use-case/${s}`);

const SEO_PAGES = [
  "ai-sales-agent", "ai-appointment-booking-software",
  "ai-chatbot-for-immigration-consultants", "replace-sales-team-with-ai",
  "whatsapp-ai-assistant", "24-7-ai-receptionist",
].map((s) => `/${s}`);

// Dynamic: prerender every published blog post so /blog/:slug ships real HTML.
async function blogRoutes() {
  const base = backendUrl();
  if (!base) return [];
  try {
    const res = await fetch(`${base}/api/blogs?limit=100`, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.blogs || []).map((b) => b.slug).filter(Boolean).map((s) => `/blog/${s}`);
  } catch (e) {
    console.log("prerender: blog slug fetch skipped —", e.message);
    return [];
  }
}

(async () => {
  const blogs = await blogRoutes();
  const include = [...STATIC_ROUTES, ...USE_CASES, ...SEO_PAGES, ...blogs];
  console.log(`prerender: snapshotting ${include.length} public routes (crawl disabled)`);
  console.log(include.join("  "));
  try {
    await run({
      include,
      crawl: false, // <-- guarantees excluded routes are never prerendered
      source: "build",
      puppeteerArgs: ["--no-sandbox", "--disable-setuid-sandbox"],
      puppeteerExecutablePath: chromePath(),
      skipThirdPartyRequests: false,
      inlineCss: false,
    });
    console.log("prerender: done");
  } catch (e) {
    console.error("prerender failed (non-fatal):", e && e.message);
    process.exit(0);
  }
})();
