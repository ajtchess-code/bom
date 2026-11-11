"use client";
// Wiki structure: one navigation bar, a plain-language home page, written guides,
// a grouped calculators hub, a tool switcher, and comparison charts. The detailed
// game data stays one click away in the encyclopedia.
import { Component, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Prose, { tidy } from "./Prose";
import { GLOSSARY } from "./glossary";
import ReportMistake from "./ReportMistake";
import { load, portrait, rateName, useLoad, useShips } from "./wikiData";

export type WikiSection = "home" | "guides" | "tools" | "browse" | "admin";

type Tool = { id: string; title: string; blurb: string; icon: keyof typeof ICONS };
type Group = { id: string; title: string; blurb: string; tools: Tool[] };

/** Every calculator and planner, grouped by what players are trying to do. */
export const TOOL_GROUPS: Group[] = [
  {
    id: "ships",
    title: "Ships & combat",
    blurb: "Pick a ship, fit its guns and know your angles.",
    tools: [
      {
        id: "ship",
        title: "Ship profiles",
        blurb: "One page per ship: stats, role and BOM's view.",
        icon: "ship",
      },
      { id: "ship-compare", title: "Ship vs ship", blurb: "Two or three ships side by side.", icon: "data" },
      { id: "shipyard", title: "Shipyard", blurb: "Every ship by rate, with its full stats.", icon: "ship" },
      {
        id: "combat",
        title: "Combat lab",
        blurb: "Compare guns, ammo and armour, volley by volley.",
        icon: "cannon",
      },
      {
        id: "range",
        title: "Range lab",
        blurb: "See which guns reach which targets, and from where.",
        icon: "range",
      },
      { id: "wind", title: "Wind & sailing", blurb: "Your speed at every angle to the wind.", icon: "wind" },
      {
        id: "volleys",
        title: "Cannon showdown",
        blurb: "Race two guns and see which deals more damage over time.",
        icon: "cannon",
      },
    ],
  },
  {
    id: "pb",
    title: "Port battles",
    blurb: "Get your ship and hold ready for the fight.",
    tools: [
      {
        id: "pb-ready",
        title: "Port battle checklist",
        blurb: "Your loadout and BOM's stockpile targets, ticked off.",
        icon: "flag",
      },
      {
        id: "ports",
        title: "Port battle ports",
        blurb: "Maps, team sizes and BOM's record at each port.",
        icon: "map",
      },
      {
        id: "cheatsheet",
        title: "Cheat sheet",
        blurb: "Everything for the fight on one printable page.",
        icon: "guide",
      },
    ],
  },
  {
    id: "economy",
    title: "Crafting & economy",
    blurb: "Plan what to build, what it costs and how long it takes.",
    tools: [
      {
        id: "crafting",
        title: "Crafting calculator",
        blurb: "Everything you need to make an item, step by step.",
        icon: "hammer",
      },
      {
        id: "craft-time",
        title: "Crafting time",
        blurb: "How long your workshops take, with every bonus.",
        icon: "clock",
      },
      {
        id: "nodes",
        title: "Mines & farms",
        blurb: "What your mines and farms make and store.",
        icon: "pick",
      },
      {
        id: "islands",
        title: "Personal islands",
        blurb: "Plan buildings, decorations and their costs.",
        icon: "island",
      },
      {
        id: "trade",
        title: "Trade route finder",
        blurb: "The most profitable runs for your hold.",
        icon: "chest",
      },
    ],
  },
  {
    id: "crew",
    title: "Crew & rewards",
    blurb: "Who to hire and what chests really give.",
    tools: [
      {
        id: "crew",
        title: "Special crew",
        blurb: "Every specialist, sorted like the in-game menu.",
        icon: "crew",
      },
      {
        id: "chests",
        title: "Chest simulator",
        blurb: "Odds and test rolls for the big chests.",
        icon: "chest",
      },
    ],
  },
  {
    id: "world",
    title: "World & navigation",
    blurb: "Where everything is on the map.",
    tools: [
      { id: "atlas", title: "World atlas", blurb: "Trade routes and ports on the real map.", icon: "map" },
      {
        id: "npcs",
        title: "NPC ships",
        blurb: "The ships you'll meet at sea, and their names.",
        icon: "flag",
      },
    ],
  },
  {
    id: "reference",
    title: "About the data",
    blurb: "Where the numbers come from, and what's new.",
    tools: [
      {
        id: "changes",
        title: "What changed",
        blurb: "Every change in the latest game update.",
        icon: "clock",
      },
      {
        id: "coverage",
        title: "Coverage & sources",
        blurb: "What the wiki knows, and how sure it is.",
        icon: "book",
      },
    ],
  },
];
export const ALL_TOOLS = TOOL_GROUPS.flatMap((g) => g.tools.map((t) => ({ ...t, group: g })));
export const isTool = (id: string) =>
  ALL_TOOLS.some((t) => t.id === id) || id === "install" || id === "manage";

/** Which top-level section a tab belongs to. */
export function sectionOf(tab: string): WikiSection {
  if (tab === "home" || tab === "guides" || tab === "browse") return tab;
  if (tab === "search") return "browse";
  if (tab === "install" || tab === "manage") return "admin";
  return "tools";
}

const ICONS = {
  ship: "M3 17h18l-2 4H5zM12 3v11M12 4l6 8h-6M12 6l-5 6h5",
  cannon: "M3 14l12-6 2 4-12 6zM15 8l4-2M6 18a2 2 0 1 0 0 .1M19 15h2",
  range: "M12 21a9 9 0 1 1 0-18M12 17a5 5 0 1 1 0-10M12 12l8-8M17 4h3v3",
  wind: "M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8",
  hammer: "M14 4l6 6-3 3-6-6zM11 7l-8 8 3 3 8-8",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  pick: "M4 20l9-9M13 11c2-4 5-6 8-6-1 3-3 6-7 8M10 8c-2-2-5-3-7-3 1 2 3 4 6 5",
  island: "M2 19c3-2 6-2 10 0s7 2 10 0M8 16c0-5 2-9 6-10M14 6c-3 0-5 1-6 3M14 6c2 1 3 3 3 5",
  crew: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c0-4 3-6 7-6s7 2 7 6M17 11a3 3 0 1 0 0-6M22 21c0-3-2-5-5-5",
  chest: "M3 10h18v10H3zM3 10c0-4 4-6 9-6s9 2 9 6M10 13h4v3h-4z",
  map: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  book: "M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6M20 4v14h-6",
  guide: "M4 5h16M4 10h16M4 15h10M4 20h7",
  data: "M4 6c0-2 16-2 16 0v12c0 2-16 2-16 0zM4 12c0 2 16 2 16 0M4 6c0 2 16 2 16 0",
  home: "M3 11l9-7 9 7M5 10v10h14V10",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5",
} as const;
export function Icon({ name, size = 20 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg className="whIcon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d={ICONS[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The single wiki header: title, primary sections and search. */
export function WikiNav({
  section,
  go,
  admin,
  onSearch,
  stats,
}: {
  section: WikiSection;
  go: (tab: string) => void;
  admin: boolean;
  onSearch: (q: string) => void;
  stats?: string;
}) {
  const [q, setQ] = useState("");
  const items: [WikiSection, string, keyof typeof ICONS][] = [
    ["home", "Home", "home"],
    ["guides", "Guides", "guide"],
    ["tools", "Calculators & tools", "hammer"],
    ["browse", "Game data", "data"],
  ];
  return (
    <header className="whHeader">
      <div className="whBrand">
        <button type="button" className="whWordmark" onClick={() => go("home")}>
          <span>BAND OF MISFITS</span>
          <b>WoSB Wiki</b>
        </button>
        <form
          className="whSearch"
          role="search"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (q.trim()) onSearch(q.trim());
          }}
        >
          <Icon name="search" size={18} />
          <label className="gwSrOnly" htmlFor="wh-search">
            Search the wiki
          </label>
          <input
            id="wh-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search ships, guns, items, ports…"
            autoComplete="off"
          />
        </form>
      </div>
      <nav className="whNav" aria-label="Wiki sections">
        {items.map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            aria-current={section === id ? "page" : undefined}
            onClick={() => go(id)}
          >
            <Icon name={icon} size={17} />
            {label}
          </button>
        ))}
        {admin && (
          <button
            type="button"
            className="whNavAdmin"
            aria-current={section === "admin" ? "page" : undefined}
            onClick={() => go("manage")}
          >
            Manage wiki
          </button>
        )}
        {stats && <small className="whStats">{stats}</small>}
      </nav>
    </header>
  );
}

function ToolCard({ tool, go }: { tool: Tool; go: (tab: string) => void }) {
  return (
    <button type="button" className="whToolCard" onClick={() => go(tool.id)}>
      <span className="whToolIcon">
        <Icon name={tool.icon} size={22} />
      </span>
      <span>
        <b>{tool.title}</b>
        <small>{tool.blurb}</small>
      </span>
    </button>
  );
}

/** Calculators & tools: every tool, grouped. */
export function ToolsHub({ go }: { go: (tab: string) => void }) {
  return (
    <section className="whHub">
      <header className="whPageHead">
        <p className="gwEyebrow">CALCULATORS & TOOLS</p>
        <h1>Plan it before you sail it</h1>
        <p>Calculators and planners built on the game's own data. Pick what you're trying to do.</p>
      </header>
      {TOOL_GROUPS.map((g) => (
        <section key={g.id} className="whGroup">
          <div className="whGroupHead">
            <h2>{g.title}</h2>
            <p>{g.blurb}</p>
          </div>
          <div className="whToolGrid">
            {g.tools.map((t) => (
              <ToolCard key={t.id} tool={t} go={go} />
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}

/** Breadcrumb and quick switcher shown above every tool. */
export function ToolHeader({ tab, go }: { tab: string; go: (tab: string) => void }) {
  const tool = ALL_TOOLS.find((t) => t.id === tab);
  if (!tool) return null;
  const siblings = tool.group.tools;
  return (
    <div className="whToolBar">
      <nav className="whCrumbs" aria-label="Breadcrumb">
        <button type="button" onClick={() => go("tools")}>
          Calculators & tools
        </button>
        <span aria-hidden="true">›</span>
        <span>{tool.group.title}</span>
      </nav>
      <div className="whSiblings" role="tablist" aria-label={tool.group.title}>
        {siblings.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === tab}
            className={t.id === tab ? "active" : ""}
            onClick={() => go(t.id)}
          >
            <Icon name={t.icon} size={16} /> {t.title}
          </button>
        ))}
      </div>
      <label className="whJump">
        <span className="gwSrOnly">Jump to another tool</span>
        <select value={tab} onChange={(e) => go(e.target.value)}>
          {TOOL_GROUPS.map((g) => (
            <optgroup key={g.id} label={g.title}>
              {g.tools.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
    </div>
  );
}

// ---- Guides ---------------------------------------------------------------

type Article = {
  slug: string;
  title: string;
  category: string;
  type: string;
  summary?: string;
  community?: boolean;
  order?: number;
};
type Category = { id: string; label: string; description: string };

async function portal(path: string) {
  const r = await fetch(`/api/internal/wiki/portal${path}`, { cache: "no-store" });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.message || body.error || "Guides are unavailable right now.");
  return body;
}
const isCommunity = (a: Article) =>
  !!a.community || a.category === "community" || / — Source Guide$/.test(a.title);
const cleanTitle = (t: string) => t.replace(/ — Source Guide$/, "");
const chapters = (articles: Article[]) =>
  articles
    .filter((a) => a.category === "start" && a.type !== "glossary")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

/** Which calculator goes with a guide. */
const GUIDE_TOOL: Record<string, string> = {
  ships: "shipyard",
  transport: "shipyard",
  weapons: "volleys",
  ammunition: "combat",
  consumables: "combat",
  crafting: "crafting",
  resources: "nodes",
  warehouses: "craft-time",
  ports: "atlas",
  map: "atlas",
  crew: "crew",
  "wind-and-speed": "wind",
  "mines-and-factories": "nodes",
  workshops: "craft-time",
  "nps-ships": "npcs",
  "bom-port-battle-preparation": "pb-ready",
  "new-player-sailing": "wind",
  "new-player-ships": "shipyard",
  "new-player-money": "crafting",
  "new-player-combat": "combat",
  "new-player-crew": "crew",
  "new-player-port-battles": "pb-ready",
  "source-guide-basic-private-island": "islands",
  "source-guide-basic-port-crafting": "craft-time",
  "source-guide-basic-resource-mines": "nodes",
  "source-guide-b21-wind": "wind",
};
export const guideTool = (a: { slug: string; type: string }) => GUIDE_TOOL[a.slug] ?? GUIDE_TOOL[a.type];

/** Popular reference guides shown on the home page after the New Player Guide. */
const POPULAR = [
  "ports-and-port-battles",
  "boarding",
  "earning-gold",
  "mines-and-factories",
  "flags-pvp-and-tension",
  "bom-port-battle-preparation",
];

let guideCache: Promise<{ categories: Category[]; articles: Article[] }> | null = null;
export function useGuides() {
  const [data, setData] = useState<{ categories: Category[]; articles: Article[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    guideCache ??= portal("").catch((e) => {
      guideCache = null;
      throw e;
    });
    guideCache.then((d) => live && setData(d)).catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);
  return { data, error };
}

const human = (k: string) =>
  k
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
const scalar = (v: any) => v === null || ["string", "number", "boolean"].includes(typeof v);
const show = (v: any) =>
  v === null || v === undefined || v === ""
    ? "—"
    : typeof v === "number"
      ? v.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : typeof v === "boolean"
        ? v
          ? "Yes"
          : "No"
        : String(v);
const COLUMN_NAMES: Record<string, string> = {
  weightClass: "Size",
  goldCost: "Gold cost",
  tokenCost: "Token cost",
  maxAngle: "Max angle",
  arc: "Max angle",
  asOf: "Checked",
  durability: "Health",
  maneuverability: "Turning",
  dpm: "Damage per minute",
};
const column = (k: string) => COLUMN_NAMES[k] ?? human(k);
const LIST_NAMES: Record<string, string> = {
  ships: "All ships",
  weapons: "All guns",
  consumables: "All consumables",
  foods: "Food, best first",
  skills: "Captain skills",
  goods: "Trade goods",
  resources: "Resources",
  levels: "Warehouse levels",
  transports: "Transport ships",
  recipes: "Recipes",
  discounts: "Crafting discounts",
  costReferences: "Example costs",
  factions: "Factions",
  benefits: "Guild benefits",
  missions: "Faction missions",
  ports: "Ports",
  markers: "Map locations",
  shop: "Pirate shop",
  flags: "Flags",
  items: "Ammunition",
  boardingCrew: "Boarding crew",
  specialistSkills: "Special crew",
  crew: "Crew",
};

/** A readable table for a list of records a data guide carries. */
function GuideTable({ rows, title }: { rows: any[]; title: string }) {
  const [all, setAll] = useState(false);
  const cols = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows.slice(0, 60))
      for (const [k, v] of Object.entries(r ?? {}))
        if (
          scalar(v) &&
          !/^(entityKey|entity_key|id|source|sourceRef|recordKey|codexPath|sourceId)$/i.test(k)
        )
          counts.set(k, (counts.get(k) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k]) => k)
      .sort((a, b) => (a === "name" ? -1 : b === "name" ? 1 : 0));
  }, [rows]);
  if (!cols.length) return null;
  const shown = all ? rows : rows.slice(0, 25);
  return (
    <section className="whGuideTable">
      <h2>{LIST_NAMES[title] ?? human(title)}</h2>
      <div className="gwOverflow">
        <table>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c}>{column(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c}>{show(r?.[c])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 25 && (
        <button type="button" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
    </section>
  );
}

/** Every glossary term, searchable and grouped. */
function Glossary() {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const list = GLOSSARY.filter(
    (t) => !term || `${t.term} ${t.meaning} ${(t.aliases ?? []).join(" ")}`.toLowerCase().includes(term),
  );
  const groups = [...new Set(GLOSSARY.map((t) => t.group))];
  return (
    <div className="whGlossary">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Look up a word…"
        aria-label="Search the glossary"
      />
      {groups.map((g) => {
        const items = list.filter((t) => t.group === g).sort((a, b) => a.term.localeCompare(b.term));
        if (!items.length) return null;
        return (
          <section key={g}>
            <h2>{g}</h2>
            <dl>
              {items.map((t) => (
                <div key={t.term}>
                  <dt>
                    {t.term}
                    {t.aliases?.length ? <small> also: {t.aliases.slice(0, 3).join(", ")}</small> : null}
                  </dt>
                  <dd>{t.meaning}</dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
      {!list.length && <p className="gwMuted">No words match.</p>}
    </div>
  );
}

/** New Player Guide reading progress, saved per member. */
let progressCache: Promise<string[]> | null = null;
export function useProgress() {
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    progressCache ??= fetch("/api/internal/wiki/portal/progress", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { done: [] }))
      .then((b) => (Array.isArray(b.done) ? b.done : []))
      .catch(() => []);
    progressCache.then((d) => live && setDone(d));
    return () => {
      live = false;
    };
  }, []);
  const mark = async (slug: string, value: boolean) => {
    const next = value ? [...new Set([...done, slug])] : done.filter((x) => x !== slug);
    setDone(next);
    progressCache = Promise.resolve(next);
    await fetch(`/api/internal/wiki/portal/progress/${encodeURIComponent(slug)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ done: value }),
    }).catch(() => {});
  };
  return { done, mark };
}

const day = (d: any) => {
  const v = String(d ?? ""),
    t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00` : v);
  return Number.isFinite(t) ? t : null;
};
/** "Checked" line for a guide, flagging guides older than the installed game data. */
function Checked({ a, dataAsOf }: { a: any; dataAsOf?: string | null }) {
  const checked = day(a.checked ?? (a.system === false ? a.updated_at : null)),
    data = day(dataAsOf);
  if (!checked)
    return a.category === "community" ? null : (
      <p className="whChecked">Not reviewed since it was added to the wiki.</p>
    );
  const stale = data !== null && checked < data;
  return (
    <p className={`whChecked ${stale ? "stale" : ""}`}>
      Last checked {new Date(checked).toLocaleDateString(undefined, { dateStyle: "medium" })}
      {stale ? " · the game has been updated since, so some details may have changed" : ""}
    </p>
  );
}

function GuideArticle({
  slug,
  go,
  openGuide,
  articles,
  dataAsOf,
}: {
  slug: string;
  go: (tab: string) => void;
  openGuide: (s: string) => void;
  articles: Article[];
  dataAsOf?: string | null;
}) {
  const progress = useProgress();
  const [a, setA] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setA(null);
    setError("");
    portal(`/articles/${encodeURIComponent(slug)}`)
      .then((d) => live && setA(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [slug]);
  if (error) return <p className="gwError">{error}</p>;
  if (!a) return <p role="status">Loading guide…</p>;
  const nav = { onGuide: openGuide, onTool: go };
  const data = a.data ?? {};
  const guides = [data.guide, data.development, data.treasury, data.tension, data.pvp].filter(
    (g: any) => g?.body || g?.text,
  );
  const lists = Object.entries(data).filter(
    ([k, v]) => Array.isArray(v) && v.length && typeof v[0] === "object" && !["notes"].includes(k),
  ) as [string, any[]][];
  const tool = guideTool(a);
  const path = chapters(articles),
    at = path.findIndex((c) => c.slug === slug);
  const original = guides.map((g: any, i: number) => (
    <section key={i}>
      {guides.length > 1 && g.title && <h2>{g.title}</h2>}
      <Prose text={tidy(String(g.body ?? g.text))} nav={nav} terms={!a.content} />
    </section>
  ));
  return (
    <article className="whArticle">
      <header>
        <p className="gwEyebrow">
          {a.category === "start" && at >= 0
            ? `NEW PLAYER GUIDE · CHAPTER ${at + 1} OF ${path.length}`
            : (a.categoryLabel ?? "Guide")}
        </p>
        <h1>{cleanTitle(a.title).replace(/^\d+\.\s*/, "")}</h1>
        {a.summary && <p className="whLead">{a.summary}</p>}
        {a.type !== "glossary" && <Checked a={a} dataAsOf={dataAsOf} />}
        {isCommunity(a) && (
          <p className="whNote">
            From an older community guide or patch notes. Some details may have changed since.
          </p>
        )}
        {tool && (
          <button type="button" className="whCta" onClick={() => go(tool)}>
            Open the {ALL_TOOLS.find((t) => t.id === tool)?.title} →
          </button>
        )}
      </header>
      {a.type === "glossary" ? (
        <Glossary />
      ) : (
        <>
          {a.content && <Prose text={a.content} nav={nav} />}
          {a.content && guides.length > 0 ? (
            <details className="whOriginal">
              <summary>Original game text</summary>
              {original}
            </details>
          ) : (
            original
          )}
          {(data.notes ?? []).length > 0 && (
            <ul className="whNotes">
              {data.notes.map((n: string, i: number) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
          {lists.map(([k, rows]) => (
            <GuideTable key={k} title={k} rows={rows} />
          ))}
          {!guides.length && !a.content && !lists.length && (
            <p className="gwMuted">There's no written text for this guide yet.</p>
          )}
        </>
      )}
      {at >= 0 && (
        <label className="whRead gwCheck">
          <input
            type="checkbox"
            checked={progress.done.includes(slug)}
            onChange={(e) => progress.mark(slug, e.target.checked)}
          />{" "}
          I've read this chapter
        </label>
      )}
      {at >= 0 && (
        <nav className="whChapterNav" aria-label="Chapters">
          {at > 0 ? (
            <button type="button" onClick={() => openGuide(path[at - 1].slug)}>
              <small>← Previous</small>
              {path[at - 1].title}
            </button>
          ) : (
            <span />
          )}
          {at < path.length - 1 && (
            <button type="button" className="next" onClick={() => openGuide(path[at + 1].slug)}>
              <small>Next →</small>
              {path[at + 1].title}
            </button>
          )}
        </nav>
      )}
      {at < 0 && a.related?.length > 0 && (
        <section className="whRelated">
          <h2>Related guides</h2>
          <div>
            {a.related
              .filter((r: any) => !isCommunity(r))
              .map((r: any) => (
                <button key={r.slug} type="button" onClick={() => openGuide(r.slug)}>
                  {cleanTitle(r.title)}
                </button>
              ))}
          </div>
        </section>
      )}
      {a.type !== "glossary" && <ReportMistake page={slug} label={cleanTitle(a.title)} />}
    </article>
  );
}

/** The New Player Guide as a numbered path. */
function ChapterPath({ articles, openGuide }: { articles: Article[]; openGuide: (s: string) => void }) {
  const path = chapters(articles);
  const { done } = useProgress();
  if (!path.length) return null;
  const read = path.filter((c) => done.includes(c.slug)).length;
  return (
    <>
      {read > 0 && (
        <p className="whProgress" role="status">
          <span style={{ width: `${(read / path.length) * 100}%` }} />
          <b>
            {read === path.length
              ? "All chapters read. Nice work, captain!"
              : `${read} of ${path.length} chapters read`}
          </b>
        </p>
      )}
      <ol className="whPath">
        {path.map((c, i) => (
          <li key={c.slug}>
            <button
              type="button"
              className={done.includes(c.slug) ? "read" : ""}
              onClick={() => openGuide(c.slug)}
            >
              <span className="whPathNum">{done.includes(c.slug) ? "✓" : i + 1}</span>
              <span>
                <b>{c.title.replace(/^\d+\.\s*/, "")}</b>
                {c.summary && <small>{c.summary}</small>}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

export function WikiGuides({
  slug,
  go,
  openGuide,
  dataAsOf,
}: {
  slug: string | null;
  go: (tab: string) => void;
  openGuide: (s: string | null) => void;
  dataAsOf?: string | null;
}) {
  const { data, error } = useGuides();
  const [cat, setCat] = useState("all"),
    [q, setQ] = useState(""),
    [community, setCommunity] = useState(false);
  if (error) return <p className="gwError">{error}</p>;
  if (!data) return <p role="status">Loading guides…</p>;
  const label = (id: string) => data.categories.find((c) => c.id === id)?.label ?? id;
  if (slug)
    return (
      <div className="whGuideLayout">
        <nav className="whCrumbs" aria-label="Breadcrumb">
          <button type="button" onClick={() => openGuide(null)}>
            Guides
          </button>
          <span aria-hidden="true">›</span>
          <span>{label(data.articles.find((a) => a.slug === slug)?.category ?? "")}</span>
        </nav>
        <GuideArticle
          slug={slug}
          go={go}
          openGuide={openGuide}
          articles={data.articles}
          dataAsOf={dataAsOf}
        />
      </div>
    );
  const term = q.trim().toLowerCase();
  const list = data.articles.filter(
    (a) =>
      (cat === "all" || a.category === cat) &&
      (community || cat === "community" || !isCommunity(a)) &&
      (!term || `${a.title} ${a.summary ?? ""}`.toLowerCase().includes(term)),
  );
  const communityCount = data.articles.filter(isCommunity).length;
  const cats = data.categories.filter((c) => c.id !== "community" || community || cat === "community");
  return (
    <section className="whHub">
      <header className="whPageHead">
        <p className="gwEyebrow">GUIDES</p>
        <h1>How things work, in plain English</h1>
        <p>
          Short guides to every part of the game. Underlined words explain themselves when you hover or tap
          them, and the{" "}
          <button type="button" className="whLink" onClick={() => openGuide("glossary")}>
            Glossary
          </button>{" "}
          has the rest.
        </p>
      </header>
      <div className="whFilters">
        <div className="whChips" role="tablist" aria-label="Guide topics">
          {[["all", "All topics"], ...data.categories.map((c) => [c.id, c.label])].map(([id, l]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={cat === id}
              className={cat === id ? "active" : ""}
              onClick={() => setCat(id)}
            >
              {l}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter guides…"
          aria-label="Filter guides"
        />
        <label className="gwCheck">
          <input type="checkbox" checked={community} onChange={(e) => setCommunity(e.target.checked)} /> Show
          older community notes ({communityCount})
        </label>
      </div>
      {(cat === "all" ? cats : cats.filter((c) => c.id === cat)).map((c) => {
        const items = list.filter((a) => a.category === c.id);
        if (!items.length) return null;
        if (c.id === "start" && !term)
          return (
            <section key={c.id} className="whGroup">
              <div className="whGroupHead">
                <h2>{c.label}</h2>
                <p>{c.description}</p>
              </div>
              <ChapterPath articles={data.articles} openGuide={openGuide} />
              <button type="button" className="whMore" onClick={() => openGuide("glossary")}>
                Glossary of game terms →
              </button>
            </section>
          );
        return (
          <section key={c.id} className="whGroup">
            <div className="whGroupHead">
              <h2>{c.label}</h2>
              <p>{c.description}</p>
            </div>
            <div className="whGuideGrid">
              {items.map((a) => (
                <button key={a.slug} type="button" className="whGuideCard" onClick={() => openGuide(a.slug)}>
                  <b>{cleanTitle(a.title)}</b>
                  {a.summary && <small>{a.summary}</small>}
                  <span className="whTags">
                    {isCommunity(a) && <em>Older notes</em>}
                    {guideTool(a) && <em className="tool">Has a calculator</em>}
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
      {!list.length && <p className="gwMuted">No guides match.</p>}
    </section>
  );
}

// ---- Home -------------------------------------------------------------------

export function WikiHome({
  go,
  openGuide,
  onSearch,
  groups,
  openGroup,
}: {
  go: (tab: string) => void;
  openGuide: (s: string) => void;
  onSearch: (q: string) => void;
  groups: { name: string; count: number }[];
  openGroup: (g: string) => void;
}) {
  const { data } = useGuides();
  const [q, setQ] = useState("");
  const popular = POPULAR.map((s) => data?.articles.find((a) => a.slug === s)).filter(Boolean) as Article[];
  return (
    <div className="whHome">
      <section className="whHero">
        <p className="gwEyebrow">WORLD OF SEA BATTLE · BAND OF MISFITS</p>
        <h1>Everything you need to know at sea</h1>
        <p>
          Plain-English guides, calculators that do the maths for you, and every number from the game when you
          want it.
        </p>
        <form
          className="whHeroSearch"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) onSearch(q.trim());
          }}
        >
          <Icon name="search" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Try “Bellona”, “mortar”, “oak” or “Tortuga”"
            aria-label="Search the wiki"
          />
          <button type="submit">Search</button>
        </form>
      </section>

      {data && chapters(data.articles).length > 0 && (
        <section className="whGroup">
          <div className="whGroupHead">
            <h2>New to the game? Start here</h2>
            <p>The New Player Guide, from your first ship to your first port battle.</p>
          </div>
          <ChapterPath articles={data.articles} openGuide={openGuide} />
        </section>
      )}

      {popular.length > 0 && (
        <section className="whGroup">
          <div className="whGroupHead">
            <h2>Popular guides</h2>
            <p>What captains look up most.</p>
          </div>
          <div className="whGuideGrid">
            {popular.map((a) => (
              <button key={a.slug} type="button" className="whGuideCard" onClick={() => openGuide(a.slug)}>
                <b>{cleanTitle(a.title)}</b>
                {a.summary && <small>{a.summary}</small>}
              </button>
            ))}
          </div>
          <button type="button" className="whMore" onClick={() => go("guides")}>
            All guides →
          </button>
        </section>
      )}

      <section className="whGroup">
        <div className="whGroupHead">
          <h2>Calculators & tools</h2>
          <p>Let the wiki do the maths.</p>
        </div>
        <div className="whGroupCards">
          {TOOL_GROUPS.filter((g) => g.id !== "reference").map((g) => (
            <article key={g.id} className="whGroupCard">
              <h3>{g.title}</h3>
              <p>{g.blurb}</p>
              <ul>
                {g.tools.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => go(t.id)}>
                      <Icon name={t.icon} size={16} /> {t.title}
                    </button>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {groups.length > 0 && (
        <section className="whGroup">
          <div className="whGroupHead">
            <h2>Game data</h2>
            <p>Every number from the game, with filters, comparisons and downloads.</p>
          </div>
          <div className="whDataGrid">
            {groups.map((g) => (
              <button key={g.name} type="button" onClick={() => openGroup(g.name)}>
                <b>{g.name}</b>
                <small>
                  {g.count} collection{g.count === 1 ? "" : "s"}
                </small>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ---- Comparison chart -------------------------------------------------------

/** Side-by-side bars for every numeric attribute the compared entries share. */
export function CompareChart({
  entries,
  label,
}: {
  entries: { row: number; name: string; data: Record<string, any> }[];
  label: (f: string) => string;
}) {
  const [only, setOnly] = useState(true);
  const fields = useMemo(() => {
    const keys = [...new Set(entries.flatMap((e) => Object.keys(e.data)))];
    return keys.filter((k) => {
      const vals = entries.map((e) => Number(e.data[k]));
      if (!entries.every((e) => e.data[k] !== "" && e.data[k] !== null && Number.isFinite(Number(e.data[k]))))
        return false;
      if (/(^|_)(id|ID|Id)$|ID$|Index$|Order$|Sort/.test(k)) return false;
      return !only || new Set(vals).size > 1;
    });
  }, [entries, only]);
  if (!fields.length) return null;
  const colors = ["#d9a441", "#4f8edb", "#53b96e", "#c0392b", "#9a68d8", "#4fc4bd"];
  return (
    <section className="whCompare">
      <header>
        <h3>At a glance</h3>
        <label className="gwCheck">
          <input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> Only show
          differences
        </label>
      </header>
      <div className="whLegend">
        {entries.map((e, i) => (
          <span key={e.row}>
            <i style={{ background: colors[i % colors.length] }} /> {e.name}
          </span>
        ))}
      </div>
      <div className="whBars">
        {fields.map((f) => {
          const vals = entries.map((e) => Number(e.data[f])),
            max = Math.max(...vals.map(Math.abs)) || 1,
            best = Math.max(...vals);
          return (
            <div key={f} className="whBarRow">
              <span className="whBarLabel">{label(f)}</span>
              <div className="whBarSet">
                {vals.map((v, i) => (
                  <div key={i} className="whBar" title={`${entries[i].name}: ${v.toLocaleString()}`}>
                    <span
                      style={{
                        width: `${(Math.abs(v) / max) * 100}%`,
                        background: colors[i % colors.length],
                      }}
                    />
                    <small className={v === best && vals.filter((x) => x === best).length === 1 ? "top" : ""}>
                      {v.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </small>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="gwMuted">
        Bars are scaled per row. Higher isn't always better: check what each stat means.
      </p>
    </section>
  );
}

/** Keeps one broken tool from taking the whole wiki down with it. */
export class ToolBoundary extends Component<{ tool: string; children: ReactNode }, { error: string }> {
  state = { error: "" };
  static getDerivedStateFromError(e: any) {
    return { error: e?.message ?? "This tool failed to load." };
  }
  componentDidUpdate(prev: { tool: string }) {
    if (prev.tool !== this.props.tool && this.state.error) this.setState({ error: "" });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="gwError" role="alert">
        <b>This tool couldn't load its data.</b> The rest of the wiki still works. Try again in a moment, or
        pick another tool. <small>({this.state.error})</small>
        <div>
          <button type="button" onClick={() => this.setState({ error: "" })}>
            Try again
          </button>
        </div>
      </div>
    );
  }
}

// ---- One search for everything ----------------------------------------------

const score = (text: string, term: string) => {
  const t = text.toLowerCase();
  if (t === term) return 100;
  if (t.startsWith(term)) return 60;
  if (new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(t)) return 40;
  return t.includes(term) ? 20 : 0;
};

export function WikiSearch({
  q,
  go,
  openGuide,
  openShip,
  openPort,
  pick,
}: {
  q: string;
  go: (tab: string) => void;
  openGuide: (s: string) => void;
  openShip: (n: string) => void;
  openPort: (n: string) => void;
  pick: (table: string, row?: number) => void;
}) {
  const term = q.trim().toLowerCase();
  const { data: guides } = useGuides();
  const { ships } = useShips();
  const { data: ports } = useLoad<any>("wiki/portal/ports");
  const [records, setRecords] = useState<any[] | null>(null);
  useEffect(() => {
    let live = true;
    setRecords(null);
    if (term.length > 1)
      load(`game-wiki/search?q=${encodeURIComponent(term)}`)
        .then((d) => live && setRecords(d.results ?? []))
        .catch(() => live && setRecords([]));
    return () => {
      live = false;
    };
  }, [term]);
  if (term.length < 2) return <p className="gwMuted">Type at least two letters to search.</p>;
  const rank = <T,>(items: T[], text: (x: T) => string, title: (x: T) => string) =>
    items
      .map((x) => ({ x, s: score(title(x), term) * 2 + score(text(x), term) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((r) => r.x);
  const g = rank(
    guides?.articles ?? [],
    (a) => `${a.title} ${a.summary ?? ""}`,
    (a) => a.title,
  ).slice(0, 12);
  const t = rank(
    ALL_TOOLS,
    (x) => `${x.title} ${x.blurb} ${x.group.title}`,
    (x) => x.title,
  ).slice(0, 6);
  const w = rank(
    GLOSSARY,
    (x) => `${x.term} ${(x.aliases ?? []).join(" ")} ${x.meaning}`,
    (x) => x.term,
  ).slice(0, 6);
  const s = rank(
    ships ?? [],
    (x) => `${x.name} ${x.class ?? ""}`,
    (x) => x.name,
  ).slice(0, 8);
  const p = rank(
    ports?.ports ?? [],
    (x: any) => `${x.name} ${x.rate}`,
    (x: any) => x.name,
  ).slice(0, 6);
  const total = g.length + t.length + w.length + s.length + p.length + (records?.length ?? 0);
  return (
    <section className="whHub whSearchPage">
      <header className="whPageHead">
        <p className="gwEyebrow">SEARCH</p>
        <h1>Results for “{q}”</h1>
        {records !== null && (
          <p>{total ? `${total} results` : "Nothing found. Try a shorter word or a different spelling."}</p>
        )}
      </header>
      {w.length > 0 && (
        <section className="whGroup">
          <div className="whGroupHead">
            <h2>Meaning</h2>
          </div>
          <dl className="whSearchTerms">
            {w.map((x) => (
              <div key={x.term}>
                <dt>{x.term}</dt>
                <dd>{x.meaning}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {s.length > 0 && (
        <section className="whGroup">
          <div className="whGroupHead">
            <h2>Ships</h2>
          </div>
          <div className="spGrid">
            {s.map((x) => {
              const img = portrait(x);
              return (
                <button key={x.name} type="button" className="spCard" onClick={() => openShip(x.name)}>
                  <span className="spThumb">{img ? <img src={img} alt="" loading="lazy" /> : <i>⛵</i>}</span>
                  <b>{x.name}</b>
                  <small>
                    {rateName(x.rate)} · {x.class ?? "Ship"}
                  </small>
                </button>
              );
            })}
          </div>
        </section>
      )}
      {g.length > 0 && (
        <section className="whGroup">
          <div className="whGroupHead">
            <h2>Guides</h2>
          </div>
          <div className="whGuideGrid">
            {g.map((a) => (
              <button key={a.slug} type="button" className="whGuideCard" onClick={() => openGuide(a.slug)}>
                <b>{cleanTitle(a.title)}</b>
                {a.summary && <small>{a.summary}</small>}
                {isCommunity(a) && (
                  <span className="whTags">
                    <em>Older notes</em>
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}
      {(t.length > 0 || p.length > 0) && (
        <section className="whGroup">
          <div className="whGroupHead">
            <h2>Tools & ports</h2>
          </div>
          <div className="whToolGrid">
            {t.map((x) => (
              <ToolCard key={x.id} tool={x} go={go} />
            ))}
            {p.map((x: any) => (
              <button key={x.name} type="button" className="whToolCard" onClick={() => openPort(x.name)}>
                <span className="whToolIcon">
                  <Icon name="map" size={22} />
                </span>
                <span>
                  <b>{x.name}</b>
                  <small>
                    Port battle port · {x.rate} · {x.size}v{x.size}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      <section className="whGroup">
        <div className="whGroupHead">
          <h2>Game data</h2>
          <p>Exact records from the game.</p>
        </div>
        {records === null ? (
          <p role="status">Searching game data…</p>
        ) : records.length ? (
          <ul className="whRecordList">
            {records.slice(0, 40).map((r: any, i: number) => (
              <li key={`${r.table}${r.row}${i}`}>
                <button type="button" className="whLink" onClick={() => pick(r.table, r.row)}>
                  {r.name}
                </button>{" "}
                <small>
                  {String(r.table)
                    .replace(/_/g, " ")
                    .replace(/([a-z])([A-Z])/g, "$1 $2")}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="gwMuted">No game records match.</p>
        )}
      </section>
    </section>
  );
}
