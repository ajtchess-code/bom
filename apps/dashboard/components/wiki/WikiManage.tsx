"use client";
// Wiki management for officers: mistake reports, a guide editor with live
// preview and history, New Player Guide progress, and the game-data updater.
import { useEffect, useState } from "react";
import Prose from "./Prose";
import { forget } from "./wikiData";

async function api(path: string, init?: RequestInit) {
  const r = await fetch(`/api/internal/wiki/portal/${path}`, {
    cache: "no-store",
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.message || b.error || "That didn't work.");
  return b;
}
const when = (d: any) =>
  d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
const KIND: Record<string, string> = {
  CORRECTION: "Something is wrong",
  MISSING_INFO: "Something is missing",
  CLARITY: "Hard to understand",
  SOURCE: "Has a source",
};

function Reports({ openGuide }: { openGuide: (s: string) => void }) {
  const [rows, setRows] = useState<any[] | null>(null),
    [error, setError] = useState(""),
    [show, setShow] = useState("OPEN");
  const refresh = () =>
    api("admin/suggestions")
      .then(setRows)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void refresh();
  }, []);
  const set = async (id: string, status: string) => {
    await api(`admin/suggestions/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }).catch((e) =>
      setError(e.message),
    );
    void refresh();
  };
  if (error) return <p className="gwError">{error}</p>;
  if (!rows) return <p role="status">Loading reports…</p>;
  const list = rows.filter((r) => show === "all" || r.status === show);
  return (
    <section>
      <div className="whChips" role="tablist" aria-label="Report status">
        {[
          ["OPEN", "Open"],
          ["ACCEPTED", "Fixed"],
          ["DECLINED", "Declined"],
          ["all", "All"],
        ].map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={show === k}
            className={show === k ? "active" : ""}
            onClick={() => setShow(k)}
          >
            {l} {k !== "all" && <small>({rows.filter((r) => r.status === k).length})</small>}
          </button>
        ))}
      </div>
      {!list.length && <p className="gwMuted">Nothing here.</p>}
      <ul className="wmReports">
        {list.map((r) => (
          <li key={r.id}>
            <header>
              <b>{KIND[r.kind] ?? r.kind}</b>
              <small>
                {r.article_slug} · {when(r.created_at)}
              </small>
            </header>
            <p>{r.body}</p>
            <div className="wmActions">
              {!/:/.test(r.article_slug) && (
                <button type="button" onClick={() => openGuide(r.article_slug)}>
                  Open page
                </button>
              )}
              {r.status === "OPEN" ? (
                <>
                  <button type="button" onClick={() => set(r.id, "ACCEPTED")}>
                    ✓ Fixed
                  </button>
                  <button type="button" onClick={() => set(r.id, "DECLINED")}>
                    Decline
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => set(r.id, "OPEN")}>
                  Reopen
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const blank = {
  id: "",
  title: "",
  slug: "",
  category: "guides",
  summary: "",
  content: "",
  status: "PUBLISHED",
};
const HELP = `## A heading
Plain text paragraphs.
- bullet points
1. numbered steps
**bold words**
> Tip: a tip box (also Warning: or BOM:)
![Picture name](/wosb/builds/consumable-phosphorus.png)
| Column | Column |
| --- | --- |
| value | value |
[a link to a guide](guide:new-player-port-battles) or a [tool](tool:crew)`;

function Editor({ categories }: { categories: { id: string; label: string }[] }) {
  const [list, setList] = useState<any[] | null>(null),
    [draft, setDraft] = useState<any>(null),
    [history, setHistory] = useState<any[]>([]),
    [msg, setMsg] = useState("");
  const refresh = () =>
    api("admin/articles")
      .then(setList)
      .catch((e) => setMsg(e.message));
  useEffect(() => {
    void refresh();
  }, []);
  const edit = async (a: any) => {
    setDraft({
      id: a.id,
      title: a.title,
      slug: a.slug,
      category: a.category,
      summary: a.summary ?? "",
      content: a.content ?? "",
      status: a.status,
    });
    setMsg("");
    setHistory(await api(`admin/articles/${a.id}/revisions`).catch(() => []));
  };
  const save = async () => {
    setMsg("Saving…");
    try {
      const body = JSON.stringify({ ...draft, slug: draft.slug || undefined });
      if (draft.id) await api(`admin/articles/${draft.id}`, { method: "PUT", body });
      else {
        const r = await api("admin/articles", { method: "POST", body });
        setDraft({ ...draft, id: r.id, slug: r.slug });
      }
      forget("wiki/portal");
      setMsg("Saved.");
      void refresh();
    } catch (e: any) {
      setMsg(e.message);
    }
  };
  if (draft)
    return (
      <section className="wmEditor">
        <div className="wmEditorBar">
          <button type="button" onClick={() => setDraft(null)}>
            ← All guides
          </button>
          <span role="status">{msg}</span>
          <button type="button" className="whCta" disabled={!draft.title.trim()} onClick={save}>
            {draft.id ? "Save changes" : "Publish guide"}
          </button>
        </div>
        <div className="wmFields">
          <label>
            Title
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </label>
          <label>
            Section
            <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
              <option value="PUBLISHED">Published</option>
              <option value="DRAFT">Draft (only officers see it here)</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </label>
          <label className="wide">
            One-line summary
            <input value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
          </label>
        </div>
        <div className="wmSplit">
          <label>
            Text
            <textarea
              value={draft.content}
              onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              rows={24}
            />
            <details>
              <summary>Formatting help</summary>
              <pre>{HELP}</pre>
            </details>
          </label>
          <div className="wmPreview" aria-label="Preview">
            <small>Preview</small>
            <h1>{draft.title || "Untitled guide"}</h1>
            {draft.summary && <p className="whLead">{draft.summary}</p>}
            <Prose text={draft.content || "Start typing on the left."} />
          </div>
        </div>
        {history.length > 0 && (
          <details className="wmHistory">
            <summary>Earlier versions ({history.length})</summary>
            <ul>
              {history.map((h: any) => (
                <li key={h.id}>
                  {when(h.created_at)}{" "}
                  <button
                    type="button"
                    className="whLink"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        title: h.title ?? draft.title,
                        summary: h.summary ?? draft.summary,
                        content: h.content ?? draft.content,
                      })
                    }
                  >
                    Load this version
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    );
  return (
    <section>
      <p>
        Write BOM guides here. They appear in Guides straight away and use the same format as the built-in
        guides.{" "}
        <button type="button" className="whCta" onClick={() => setDraft({ ...blank })}>
          + New guide
        </button>
      </p>
      {msg && <p className="gwError">{msg}</p>}
      {!list ? (
        <p role="status">Loading…</p>
      ) : list.length ? (
        <div className="gwOverflow">
          <table>
            <thead>
              <tr>
                <th>Guide</th>
                <th>Section</th>
                <th>Status</th>
                <th>Last edited</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td>
                    <button type="button" className="whLink" onClick={() => edit(a)}>
                      {a.title}
                    </button>
                  </td>
                  <td>{categories.find((c) => c.id === a.category)?.label ?? a.category}</td>
                  <td>{a.status}</td>
                  <td>{when(a.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="gwMuted">No BOM-written guides yet.</p>
      )}
    </section>
  );
}

function Progress({ chapters }: { chapters: { slug: string; title: string }[] }) {
  const [rows, setRows] = useState<any[] | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("admin/progress")
      .then((b) => setRows(b.members))
      .catch((e) => setError(e.message));
  }, []);
  if (error) return <p className="gwError">{error}</p>;
  if (!rows) return <p role="status">Loading…</p>;
  if (!rows.length) return <p className="gwMuted">Nobody has marked a chapter as read yet.</p>;
  const pb = chapters.find((c) => /port-battles/.test(c.slug))?.slug;
  return (
    <section>
      <p>Who has worked through the New Player Guide. ✓ means they ticked “I've read this chapter”.</p>
      <div className="gwOverflow">
        <table className="wmProgress">
          <thead>
            <tr>
              <th>Member</th>
              {chapters.map((c, i) => (
                <th key={c.slug} title={c.title}>
                  {i + 1}
                </th>
              ))}
              <th>Read</th>
              <th>Last read</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .sort((a, b) => b.done.length - a.done.length)
              .map((m) => (
                <tr key={m.userId} className={pb && m.done.includes(pb) ? "pbReady" : ""}>
                  <td>{m.name}</td>
                  {chapters.map((c) => (
                    <td key={c.slug}>{m.done.includes(c.slug) ? "✓" : ""}</td>
                  ))}
                  <td>
                    {chapters.filter((c) => m.done.includes(c.slug)).length}/{chapters.length}
                  </td>
                  <td>{when(m.last)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <p className="gwMuted">Highlighted rows have read the port battles chapter.</p>
    </section>
  );
}

export default function WikiManage({
  go,
  openGuide,
}: {
  go: (tab: string) => void;
  openGuide: (s: string) => void;
}) {
  const [tab, setTab] = useState("reports");
  const [meta, setMeta] = useState<{ categories: any[]; chapters: any[] }>({ categories: [], chapters: [] });
  useEffect(() => {
    api("")
      .then((b) =>
        setMeta({
          categories: (b.categories ?? []).filter((c: any) => c.id !== "community"),
          chapters: (b.articles ?? [])
            .filter((a: any) => a.category === "start" && a.type !== "glossary")
            .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0)),
        }),
      )
      .catch(() => {});
  }, []);
  return (
    <section className="wpPlanner wmManage">
      <p className="gwEyebrow">MANAGE THE WIKI</p>
      <h2>Officer tools</h2>
      <div className="scTabs" role="tablist" aria-label="Manage">
        {[
          ["reports", "Mistake reports"],
          ["editor", "Write guides"],
          ["progress", "New player progress"],
          ["data", "Game data"],
        ].map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={tab === k ? "active" : ""}
            onClick={() => setTab(k)}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "reports" && <Reports openGuide={openGuide} />}
      {tab === "editor" && <Editor categories={meta.categories} />}
      {tab === "progress" && <Progress chapters={meta.chapters} />}
      {tab === "data" && (
        <section>
          <p>
            Install a new game-data release when the game updates. After it's installed, members can see what
            changed.
          </p>
          <button type="button" className="whCta" onClick={() => go("install")}>
            Update game data
          </button>{" "}
          <button type="button" onClick={() => go("changes")}>
            See what changed
          </button>
        </section>
      )}
    </section>
  );
}
