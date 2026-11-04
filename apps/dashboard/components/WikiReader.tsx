"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function WikiHeader() {
  return (
    <header className="encyclopediaHeader">
      <Link className="wikiWordmark" href="/dashboard/wiki">
        <span>BAND OF MISFITS</span>
        <b>WoSB Wiki</b>
      </Link>
      <nav aria-label="Wiki sections">
        <Link href="/dashboard/wiki">Main page</Link>
        <Link href="/dashboard/wiki/topic/ships">Ships</Link>
        <Link href="/dashboard/wiki/topic/cannons-and-weapons">Combat</Link>
        <Link href="/dashboard/wiki/topic/crafting">Crafting</Link>
        <Link href="/dashboard/wiki/topic/trade-goods">Economy</Link>
        <Link href="/dashboard/wiki/topic/ports-and-port-battles">World & ports</Link>
        <Link href="/dashboard/wiki#encyclopedia">Guides</Link>
      </nav>
      <Link className="wikiSearchLink" href="/dashboard/wiki#ask-wiki">
        Search Wiki ↗
      </Link>
    </header>
  );
}
export default function WikiReader({
  title,
  summary,
  category,
  children,
  infobox,
  slug,
  admin = false,
  sources = [],
  asOf,
}: {
  title: string;
  summary?: string;
  category?: string;
  children: ReactNode;
  infobox?: ReactNode;
  slug?: string;
  admin?: boolean;
  sources?: string[];
  asOf?: string;
}) {
  const root = useRef<HTMLElement>(null),
    [headings, setHeadings] = useState<{ id: string; label: string; level: number }[]>([]),
    [active, setActive] = useState(""),
    [tab, setTab] = useState("read"),
    [draft, setDraft] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const used = new Map<string, number>();
    const hs = [...node.querySelectorAll<HTMLElement>("h2,h3,h4")].filter(
      (h) => !h.closest(".wikiInfobox,details:not([open])"),
    );
    const entries = hs.map((h) => {
      const base =
          (h.id || h.textContent || "section")
            .normalize("NFKC")
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, "-")
            .replace(/^-|-$/g, "") || "section",
        n = (used.get(base) || 0) + 1;
      used.set(base, n);
      h.id = n === 1 ? base : `${base}-${n}`;
      return { id: h.id, label: h.textContent || "Section", level: Number(h.tagName.slice(1)) };
    });
    setHeadings(entries);
    const observer = new IntersectionObserver(
      (changes) => {
        const top = changes
          .filter((x) => x.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "-10% 0px -65% 0px" },
    );
    hs.forEach((h) => observer.observe(h));
    if (location.hash) {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      target?.scrollIntoView();
    }
    return () => observer.disconnect();
  }, []);
  async function suggest() {
    if (!slug || busy) return;
    setBusy(true);
    setStatus("");
    try {
      const r = await fetch(`/api/internal/wiki/portal/articles/${encodeURIComponent(slug)}/suggestions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "MISSING_INFO", body: draft }),
      });
      if (!r.ok) throw new Error("Could not submit. Your text is kept; please try again.");
      setDraft("");
      setStatus("Sent to the Wiki review queue.");
    } catch (e: any) {
      setStatus(e.message);
    } finally {
      setBusy(false);
    }
  }
  const contents = (
    <nav aria-label="Article contents">
      <a href="#wiki-title">Overview</a>
      {headings.map((h) => (
        <a
          key={h.id}
          className={`wikiTocLevel${h.level} ${active === h.id ? "active" : ""}`}
          aria-current={active === h.id ? "location" : undefined}
          href={`#${h.id}`}
        >
          {h.label}
        </a>
      ))}
      <a href="#wiki-source-notes">Sources & review</a>
    </nav>
  );
  return (
    <div className="encyclopediaReader">
      <div className="wikiBreadcrumb">
        <Link href="/dashboard/wiki">Wiki</Link>
        <span>›</span>
        <span>{category || "Reference"}</span>
      </div>
      <div className="wikiPageTitle">
        <h1 id="wiki-title">{title}</h1>
        {summary && <p>{summary}</p>}
      </div>
      <div className="wikiPageToolbar">
        <div role="tablist" aria-label="Page views">
          {[
            ["read", "Read"],
            ["discussion", "Suggest correction"],
            ["sources", "Sources & history"],
          ].map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                setTab(id);
                if (id === "sources")
                  requestAnimationFrame(() =>
                    document.getElementById("wiki-source-notes")?.scrollIntoView({ behavior: "smooth" }),
                  );
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <details>
          <summary>Page tools</summary>
          <button
            onClick={async () => {
              try {
                if (!navigator.clipboard) throw new Error();
                await navigator.clipboard.writeText(location.href);
                setStatus("Link copied.");
              } catch {
                setStatus("Copy is unavailable. Copy the address from your browser.");
              }
            }}
          >
            Copy permanent link
          </button>
          <button onClick={() => window.print()}>Print article</button>
          {admin && <Link href="/dashboard/admin/wiki">Edit in Knowledge Studio</Link>}
        </details>
      </div>
      {status && <p role="status">{status}</p>}
      {tab === "discussion" && (
        <section className="wikiReviewPanel">
          <h2>Improve this article</h2>
          <p>
            Describe the missing or incorrect information and include a source or game version. Suggestions
            are reviewed before publication.
          </p>
          {slug ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void suggest();
              }}
            >
              <label>
                Correction or missing information
                <textarea
                  required
                  minLength={5}
                  maxLength={5000}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={6}
                />
              </label>
              <button className="goldButton" disabled={busy || draft.trim().length < 5}>
                {busy ? "Submitting…" : "Submit for review"}
              </button>
            </form>
          ) : (
            <p>
              Reply to a Misfit answer with the configured @No role and the correct field and value, or submit
              a correction through <Link href="/dashboard/wiki#ask-wiki">Ask Wiki</Link>. Approved corrections
              update shared Wiki knowledge.
            </p>
          )}
        </section>
      )}
      <div className="wikiArticleColumns" hidden={tab === "discussion"}>
        <aside className="wikiContents">
          <b>Contents</b>
          {contents}
        </aside>
        <main ref={root} className="wikiArticleText">
          <details className="wikiMobileContents">
            <summary>Contents</summary>
            {contents}
          </details>
          {infobox && <aside className="wikiInfobox">{infobox}</aside>}
          <div>{children}</div>
          <section id="wiki-source-notes" className="wikiSourceNotes">
            <h2>Sources & review</h2>
            <p>
              {asOf ? `Source snapshot: ${asOf}. ` : ""}Imported references may describe different game
              versions. Approved corrections take precedence over current reference values; archived snapshots
              retain their original values.
            </p>
            {sources.length > 0 ? (
              <ul>
                {sources.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            ) : (
              <p>
                See the source references attached to this article. A source snapshot date is not a
                last-reviewed date.
              </p>
            )}
            {admin && <Link href="/dashboard/admin/wiki">Review corrections and revision history</Link>}
          </section>
        </main>
      </div>
    </div>
  );
}
