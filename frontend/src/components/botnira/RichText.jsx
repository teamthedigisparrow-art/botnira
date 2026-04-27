/**
 * RichText — renders plain-text bot/agent replies with:
 *  - paragraph spacing (blank line = new paragraph)
 *  - line breaks inside a paragraph
 *  - clickable URLs (http / https / www.*)
 *  - basic **bold** emphasis
 *  - simple "- " bullet lists
 *
 * Security: we DO NOT use dangerouslySetInnerHTML anywhere — every node is
 * created via React JSX, so all text content is auto-escaped by React.
 * No DOMPurify needed because raw HTML is never injected.
 *
 * Note: list keys use stable text-content suffixes rather than just array
 * indices so streaming/incremental updates don't cause re-renders to drop
 * focus or animations.
 */
import { Fragment } from "react";

const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>()]+[^\s.,;:!?<>()])/gi;

// Cheap djb2-style content hash so React keys are stable across re-renders
// even when the same string appears multiple times in a paragraph.
function hashContent(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function renderInline(text, keyBase) {
  // 1) split into tokens alternating between **bold** and plain runs
  const parts = [];
  const boldRe = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m;
  while ((m = boldRe.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    parts.push({ type: "bold", value: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });

  return parts.map((p, i) => {
    if (p.type === "bold") {
      return <strong key={`${keyBase}-b-${i}`} className="font-bold">{linkify(p.value, `${keyBase}-b-${i}`)}</strong>;
    }
    return <Fragment key={`${keyBase}-t-${i}`}>{linkify(p.value, `${keyBase}-t-${i}`)}</Fragment>;
  });
}

function linkify(text, keyBase) {
  const out = [];
  let last = 0;
  let m;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const url = m[1];
    const href = url.startsWith("http") ? url : `https://${url}`;
    out.push(
      <a
        key={`${keyBase}-u-${m.index}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline font-bold break-all hover:opacity-80"
      >
        {url}
      </a>
    );
    last = m.index + url.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function RichText({ text, className = "" }) {
  if (!text) return null;
  // Split into paragraphs (blank line separator)
  const paragraphs = String(text).replace(/\r\n/g, "\n").split(/\n\s*\n/);

  return (
    <div className={`space-y-2 leading-relaxed text-[0.92rem] ${className}`}>
      {paragraphs.map((para, pi) => {
        const lines = para.split("\n");
        const paraKey = `p-${pi}-${hashContent(para)}`;

        // Detect bullet-list paragraph
        const isList = lines.length > 1 && lines.every((l) => /^\s*[-•]\s+/.test(l));
        if (isList) {
          return (
            <ul key={paraKey} className="list-disc pl-5 space-y-1">
              {lines.map((l, li) => {
                const content = l.replace(/^\s*[-•]\s+/, "");
                return <li key={`${paraKey}-li-${li}-${hashContent(content)}`}>{renderInline(content, `${paraKey}-li-${li}`)}</li>;
              })}
            </ul>
          );
        }

        return (
          <p key={paraKey} className="whitespace-normal">
            {lines.map((l, li) => (
              <Fragment key={`${paraKey}-ln-${li}-${hashContent(l)}`}>
                {renderInline(l, `${paraKey}-ln-${li}`)}
                {li < lines.length - 1 && <br />}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
