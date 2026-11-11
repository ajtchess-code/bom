"use client";
// Special crew, laid out like the in-game Special Crew menu: the same four
// tabs, in the same order, with plain-English effects. Game-data pictures and
// full records are added when the installed game data has them.
import { useEffect, useMemo, useState } from "react";
import { Evidence, Numeric, Picture, number } from "./PlannerUI";
import {
  CREW_CLASSES,
  CREW_PRESETS,
  CREW_USES,
  SPECIALISTS,
  type CrewClass,
  type CrewUse,
  type Specialist,
} from "./crewData";

const STORE = "bom:crew-shortlist";
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

export default function SpecialCrewGuide({
  data: given,
  open,
}: {
  data?: any;
  open?: (table: string, row?: number) => void;
}) {
  const [data, setData] = useState<any>(given ?? null);
  useEffect(() => {
    if (given) return;
    let live = true;
    fetch("/api/internal/game-wiki/visuals/crew")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && d && setData(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [given]);
  const [tab, setTab] = useState<CrewClass | "all">("Military"),
    [sort, setSort] = useState<"game" | "az">("game"),
    [use, setUse] = useState<CrewUse | "all">("all"),
    [query, setQuery] = useState(""),
    [picked, setPicked] = useState<string[]>([]),
    [captives, setCaptives] = useState(50),
    [targeted, setTargeted] = useState(false);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(STORE) || "[]");
      if (Array.isArray(v)) setPicked(v.filter((n) => SPECIALISTS.some((s) => s.name === n)));
    } catch {}
  }, []);
  const save = (v: string[]) => {
    setPicked(v);
    try {
      localStorage.setItem(STORE, JSON.stringify(v));
    } catch {}
  };
  const toggle = (n: string) => save(picked.includes(n) ? picked.filter((x) => x !== n) : [...picked, n]);
  // Match each specialist to its game-data record for pictures and details.
  const client = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of data?.crew ?? []) m.set(norm(String(c.EnglishName ?? c.ID)), c);
    return m;
  }, [data]);
  const term = query.trim().toLowerCase();
  const list = (cls: CrewClass | "all") => {
    let l = SPECIALISTS.filter(
      (s) =>
        (cls === "all" || s.cls === cls) &&
        (use === "all" || s.uses.includes(use)) &&
        (!term || `${s.name} ${s.effect} ${s.game}`.toLowerCase().includes(term)),
    );
    if (sort === "az") l = [...l].sort((a, b) => a.name.localeCompare(b.name));
    return l;
  };
  const card = (s: Specialist) => {
    const c = client.get(norm(s.name)),
      on = picked.includes(s.name);
    return (
      <article key={s.name} className={`scCard ${on ? "picked" : ""}`}>
        <div className="scPic">
          {s.image ? (
            <img src={s.image} alt="" loading="lazy" />
          ) : c?.images?.length ? (
            <Picture images={c.images} name={s.name} />
          ) : (
            <span aria-hidden="true">{s.name.slice(0, 1)}</span>
          )}
        </div>
        <div className="scBody">
          <strong>{s.name}</strong>
          <p>{s.effect}</p>
          <small className="scGame">In game: “{s.game}”</small>
          <span className="scTags">
            {s.uses.map((u) => (
              <em key={u}>{u}</em>
            ))}
          </span>
        </div>
        <div className="scActions">
          <button type="button" aria-pressed={on} onClick={() => toggle(s.name)}>
            {on ? "✓ On my list" : "+ Add to list"}
          </button>
          {c && open && (
            <button type="button" className="scMore" onClick={() => open("Crew_Special", c.row)}>
              Full details
            </button>
          )}
        </div>
      </article>
    );
  };
  const shown = list(tab);
  const copy = () => {
    const text = picked
      .map((n) => SPECIALISTS.find((s) => s.name === n))
      .filter(Boolean)
      .map((s) => `${s!.name} (${s!.cls}): ${s!.effect}`)
      .join("\n");
    navigator.clipboard?.writeText(text).catch(() => {});
  };
  return (
    <section className="wpPlanner scCrew">
      <p className="gwEyebrow">SPECIAL CREW</p>
      <h2>Special crew, like the in-game menu</h2>
      <p>
        The same four tabs and order you see in the game, with what each one actually does in plain words. Add
        specialists to your list to plan a crew.
      </p>

      <div className="scTabs" role="tablist" aria-label="Crew class">
        {CREW_CLASSES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={tab === c.id}
            className={tab === c.id ? "active" : ""}
            onClick={() => setTab(c.id)}
          >
            {c.label} <small>{SPECIALISTS.filter((s) => s.cls === c.id).length}</small>
          </button>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={tab === "all"}
          className={tab === "all" ? "active" : ""}
          onClick={() => setTab("all")}
        >
          All <small>{SPECIALISTS.length}</small>
        </button>
      </div>
      {tab !== "all" && <p className="scBlurb">{CREW_CLASSES.find((c) => c.id === tab)?.blurb}</p>}

      <div className="gwToolControls scControls">
        <label>
          Search
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Gunner, reload, fishing…"
          />
        </label>
        <label>
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as any)}>
            <option value="game">In-game order</option>
            <option value="az">A to Z</option>
          </select>
        </label>
        <label>
          Good for
          <select value={use} onChange={(e) => setUse(e.target.value as any)}>
            <option value="all">Anything</option>
            {CREW_USES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
      </div>

      {tab === "all" && sort === "game" ? (
        CREW_CLASSES.map((c) => {
          const items = list(c.id);
          return items.length ? (
            <section key={c.id}>
              <h3>{c.label}</h3>
              <div className="scGrid">{items.map(card)}</div>
            </section>
          ) : null;
        })
      ) : (
        <div className="scGrid">{shown.map(card)}</div>
      )}
      {!shown.length && <p className="gwMuted">No specialists match.</p>}

      <section className="scList" aria-live="polite">
        <h3>My crew list {picked.length > 0 && <small>({picked.length})</small>}</h3>
        <div className="scPresets">
          <span>Start from an idea:</span>
          {CREW_PRESETS.map((p) => (
            <button key={p.id} type="button" onClick={() => save(p.names)}>
              {p.label}
            </button>
          ))}
        </div>
        <p className="gwMuted">
          These are starting ideas, not BOM rules. How many specialists you can carry, and which ones clash,
          depends on your ship and game version, so check in game.
        </p>
        {picked.length ? (
          <>
            <ul>
              {picked.map((n) => {
                const s = SPECIALISTS.find((x) => x.name === n)!;
                return (
                  <li key={n}>
                    <b>{n}</b> <small>{s.cls}</small> — {s.effect}{" "}
                    <button type="button" aria-label={`Remove ${n}`} onClick={() => toggle(n)}>
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
            <button type="button" onClick={copy}>
              Copy list
            </button>{" "}
            <button type="button" onClick={() => save([])}>
              Clear
            </button>
          </>
        ) : (
          <p>Your list is empty. Use “Add to list” on any specialist.</p>
        )}
      </section>

      <h3>Where to find special crew</h3>
      <ul>
        <li>
          <b>Taverns</b>: cities have military and sailor specialists; pirate coves and pirate cities have
          pirates.
        </li>
        <li>
          <b>At sea</b>: rescue them, or recruit them from captives.
        </li>
        <li>
          <b>Your personal island</b>: finds rarer specialists than taverns.
        </li>
      </ul>
      {(data?.acquisition ?? []).length > 0 && (
        <details>
          <summary>The game's own wording</summary>
          {data.acquisition.map((p: string, i: number) => (
            <p key={i}>{p.replaceAll("#", "")}</p>
          ))}
        </details>
      )}

      <h3>Recruiting on your personal island</h3>
      <p>
        Island recruiting costs Labor: <b>50</b> for a random specialist, or <b>75</b> to choose the class.
        Each captive you land adds 1 Labor (up to your island's Labor limit).
      </p>
      <div className="gwToolControls">
        <Numeric
          label="Captives to land"
          value={captives}
          onChange={(v) => setCaptives(Math.max(0, Math.floor(v)))}
        />
        <label>
          Recruit
          <select
            value={targeted ? "targeted" : "any"}
            onChange={(e) => setTargeted(e.target.value === "targeted")}
          >
            <option value="any">Anyone · 50 Labor</option>
            <option value="targeted">Choose the class · 75 Labor</option>
          </select>
        </label>
      </div>
      <p>
        {number(captives)} captives → <strong>{Math.floor(captives / (targeted ? 75 : 50))} recruits</strong>,
        with {captives % (targeted ? 75 : 50)} Labor left over. You won't always get the specialist you want,
        and the exact odds aren't known.
      </p>
      <Evidence>
        <p>
          Tab order and in-game wording come from a screenshot of the in-game Special Crew menu. Pictures and
          full details come from the installed game data (Crew_Special / UnitsInfo). Labor costs:
          get_RecruitSpecialUnitCT and get_RecruitSpecialUnitCTTrageted; one Labor per landed captive:
          get_BonusCraftTimeForBondman. The island picker favours specialists you don't own yet, so no fixed
          per-specialist chance is shown.
        </p>
      </Evidence>
    </section>
  );
}
