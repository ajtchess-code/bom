"use client";
// Renders the wiki's simple guide format (a small, safe subset of Markdown)
// without ever injecting HTML: headings, lists, tables, images, callouts,
// bold text, links to guides and tools, and glossary hints on game terms.
import { Fragment, type ReactNode } from "react";
import { TERM_PATTERN, lookup } from "./glossary";

type Nav = { onGuide?: (slug: string) => void; onTool?: (id: string) => void };

/** Underlines the first use of each glossary term with a hover/tap hint. */
function withTerms(text: string, seen: Set<string> | null, key: string): ReactNode[] {
  if (!seen) return [text];
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TERM_PATTERN)) {
    const t = lookup(m[0]);
    if (!t || seen.has(t.term)) continue;
    seen.add(t.term);
    out.push(text.slice(last, m.index));
    out.push(
      <span
        key={`${key}t${m.index}`}
        className="whTerm"
        tabIndex={0}
        data-tip={t.meaning}
        aria-label={`${m[0]}: ${t.meaning}`}
      >
        {m[0]}
      </span>,
    );
    last = (m.index ?? 0) + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

/** Inline formatting: **bold**, [label](guide:slug | tool:id | https://…). */
function inline(text: string, nav: Nav, seen: Set<string> | null, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0,
    i = 0;
  for (const m of text.matchAll(re)) {
    out.push(...withTerms(text.slice(last, m.index), seen, `${key}-${i++}`));
    if (m[1] !== undefined)
      out.push(<strong key={`${key}b${m.index}`}>{withTerms(m[1], seen, `${key}-b${i}`)}</strong>);
    else {
      const [label, href] = [m[2], m[3]];
      const k = `${key}a${m.index}`;
      if (href.startsWith("guide:") && nav.onGuide)
        out.push(
          <button key={k} type="button" className="whLink" onClick={() => nav.onGuide!(href.slice(6))}>
            {label}
          </button>,
        );
      else if (href.startsWith("tool:") && nav.onTool)
        out.push(
          <button key={k} type="button" className="whLink tool" onClick={() => nav.onTool!(href.slice(5))}>
            {label}
          </button>,
        );
      else if (/^https:\/\//.test(href))
        out.push(
          <a key={k} href={href} target="_blank" rel="noreferrer noopener">
            {label}
          </a>,
        );
      else out.push(label);
    }
    last = (m.index ?? 0) + m[0].length;
  }
  out.push(...withTerms(text.slice(last), seen, `${key}-e`));
  return out;
}

const IMG = /!\[([^\]]*)\]\((\/[^\s)]+)(?:\s+"([^"]*)")?\)/g;
const safeSrc = (s: string) => /^\/[\w\-./]+\.(png|jpe?g|webp|gif|svg)$/i.test(s);

/** Tidies text scraped from other sites: stray spaces before punctuation. */
export const tidy = (s: string) =>
  s
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")");

export default function Prose({
  text,
  nav = {},
  terms = true,
}: {
  text: string;
  nav?: Nav;
  terms?: boolean;
}) {
  const seen = terms ? new Set<string>() : null;
  const fmt = (s: string, k: string) => inline(s, nav, seen, k);
  const lines = String(text).split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    const k = `k${i}`;
    if (!line) {
      i++;
      continue;
    }
    // Images: a line made only of images becomes a picture row.
    if (/^(!\[[^\]]*\]\([^)]+\)\s*)+$/.test(line)) {
      const imgs = [...line.matchAll(IMG)].filter((m) => safeSrc(m[2]));
      blocks.push(
        <div key={k} className={`whFigures n${Math.min(imgs.length, 4)}`}>
          {imgs.map((m, j) => (
            <figure key={j}>
              <img src={m[2]} alt={m[1]} loading="lazy" />
              <figcaption>{m[3] || m[1]}</figcaption>
            </figure>
          ))}
        </div>,
      );
      i++;
      continue;
    }
    // Tables.
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i]
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={k} className="gwOverflow whTable">
          <table>
            <thead>
              <tr>
                {head.map((c, j) => (
                  <th key={j}>{fmt(c, `${k}h${j}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, j) => (
                    <td key={j}>{fmt(c, `${k}r${ri}c${j}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    // Lists.
    const bullet = /^[-*•]\s+/,
      num = /^\d+[.)]\s+/;
    if (bullet.test(line) || num.test(line)) {
      const ordered = num.test(line),
        items: string[] = [];
      while (i < lines.length && (ordered ? num : bullet).test(lines[i].trim())) {
        items.push(lines[i].trim().replace(ordered ? num : bullet, ""));
        i++;
      }
      const L = ordered ? "ol" : "ul";
      blocks.push(
        <L key={k}>
          {items.map((it, j) => (
            <li key={j}>{fmt(it, `${k}i${j}`)}</li>
          ))}
        </L>,
      );
      continue;
    }
    // Callouts: "> Tip: …", "> Warning: …", "> BOM: …".
    const quote = line.match(/^>\s*(?:(Tip|Warning|BOM|Note):\s*)?(.*)$/i);
    if (quote) {
      const kind = (quote[1] || "Note").toLowerCase();
      blocks.push(
        <aside key={k} className={`whCallout ${kind}`}>
          <b>{quote[1] || "Note"}</b>
          <span>{fmt(quote[2], k)}</span>
        </aside>,
      );
      i++;
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)/);
    if (heading) {
      const H = heading[1].length <= 2 ? "h2" : "h3";
      blocks.push(<H key={k}>{heading[2]}</H>);
    } else blocks.push(<p key={k}>{fmt(line, k)}</p>);
    i++;
  }
  return (
    <div className="whProse">
      {blocks.map((b, j) => (
        <Fragment key={j}>{b}</Fragment>
      ))}
    </div>
  );
}
