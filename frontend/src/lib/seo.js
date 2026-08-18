// Sets a self-referential canonical + og:url for the current page. Runs client
// side and is captured into the static HTML by react-snap at build time so each
// prerendered page ships with its OWN canonical (not the homepage's).
const SITE = "https://botnira.com";

export function setCanonical(path = "") {
  const url = `${SITE}${path}`;
  const upsert = (selector, create, attr, value) => {
    let el = document.head.querySelector(selector);
    if (!el) { el = create(); document.head.appendChild(el); }
    el.setAttribute(attr, value);
  };
  upsert('link[rel="canonical"]', () => { const l = document.createElement("link"); l.rel = "canonical"; return l; }, "href", url);
  upsert('meta[property="og:url"]', () => { const m = document.createElement("meta"); m.setAttribute("property", "og:url"); return m; }, "content", url);
}
