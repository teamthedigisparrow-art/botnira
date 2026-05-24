import { marked } from "marked";
import DOMPurify from "dompurify";

// Configure marked once. We allow GFM tables, line breaks, headers slugged
// for in-page anchor links.
marked.setOptions({
  gfm: true,
  breaks: false,
  headerIds: true,
});

/**
 * Convert markdown to sanitized HTML safe for direct render in blog views.
 * Strips <script>, on-* attrs, javascript: URLs etc via DOMPurify.
 */
export function renderMarkdown(md = "") {
  if (!md) return "";
  const rawHtml = marked.parse(md);
  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_ATTR: [
      "href", "src", "alt", "title", "target", "rel",
      "loading", "width", "height", "id", "class",
    ],
    USE_PROFILES: { html: true },
  });
}
