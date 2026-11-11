"use client";
// Ship profiles (one page per ship) and the ship-vs-ship comparison.
import { useMemo, useState } from "react";
import ReportMistake from "./ReportMistake";
import {
  STAT_LABELS,
  bomPick,
  classBlurb,
  portrait,
  rateName,
  shipSlug,
  useLoad,
  useShips,
  type Ship,
} from "./wikiData";

const COLORS = ["#d9a441", "#4f8edb", "#53b96e"];
const fmt = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(Number(v))
    ? "—"
    : Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 });

/** Averages and maximums for each stat among ships of the same rate. */
function rateStats(ships: Ship[], rate: number | null) {
  const peers = ships.filter((s) => s.rate === rate);
  const out: Record<string, { avg: number | null; max: number | null; n: number }> = {};
  for (const [k] of STAT_LABELS) {
    const vals = peers.map((s) => Number(s.stats?.[k])).filter((v) => Number.isFinite(v) && v > 0);
    out[k] = {
      avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
      max: vals.length ? Math.max(...vals) : null,
      n: vals.length,
    };
  }
  return { peers, out };
}

function ShipIndex({ ships, openShip }: { ships: Ship[]; openShip: (n: string) => void }) {
  const [q, setQ] = useState(""),
    [cls, setCls] = useState("all");
  const term = q.trim().toLowerCase();
  const classes = [...new Set(ships.map((s) => s.class).filter(Boolean))] as string[];
  const list = ships.filter(
    (s) => (cls === "all" || s.class === cls) && (!term || s.name.toLowerCase().includes(term)),
  );
  const rates = [...new Set(list.map((s) => s.rate ?? 99))].sort((a, b) => a - b);
  return (
    <section className="wpPlanner spIndex">
      <p className="gwEyebrow">SHIPS</p>
      <h2>Every ship, one page each</h2>
      <p>
        Pick a ship for its stats compared with others of its rate, what it's good at, and BOM's view on it.
      </p>
      <div className="gwToolControls">
        <label>
          Find a ship
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bellona, Victory…" />
        </label>
        <label>
          Class
          <select value={cls} onChange={(e) => setCls(e.target.value)}>
            <option value="all">All classes</option>
            {classes.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      {rates.map((r) => (
        <section key={r}>
          <h3>{r === 99 ? "Unrated" : rateName(r)}</h3>
          <div className="spGrid">
            {list
              .filter((s) => (s.rate ?? 99) === r)
              .map((s) => {
                const img = portrait(s);
                return (
                  <button key={s.name} type="button" className="spCard" onClick={() => openShip(s.name)}>
                    <span className="spThumb">
                      {img ? <img src={img} alt="" loading="lazy" /> : <i>⛵</i>}
                    </span>
                    <b>{s.name}</b>
                    <small>
                      {s.class ?? "Ship"}
                      {bomPick(s.name) ? " · BOM pick" : ""}
                    </small>
                  </button>
                );
              })}
          </div>
        </section>
      ))}
      {!list.length && <p className="gwMuted">No ships match.</p>}
    </section>
  );
}

export function ShipPage({
  name,
  openShip,
  go,
  compare,
}: {
  name: string | null;
  openShip: (n: string | null) => void;
  go: (tab: string) => void;
  compare: (names: string[]) => void;
}) {
  const { ships, error } = useShips();
  const { data: library } = useLoad<any>(name ? "wosb/build-library" : null);
  if (error) return <p className="gwError">{error}</p>;
  if (!ships) return <p role="status">Loading ships…</p>;
  if (!name) return <ShipIndex ships={ships} openShip={openShip} />;
  const ship = ships.find((s) => shipSlug(s.name) === shipSlug(name));
  if (!ship)
    return (
      <p className="gwError">
        No ship called “{name}”.{" "}
        <button type="button" className="whLink" onClick={() => openShip(null)}>
          See all ships
        </button>
      </p>
    );
  const { peers, out } = rateStats(ships, ship.rate);
  const img = portrait(ship),
    pick = bomPick(ship.name);
  const builds = (library?.builds ?? []).filter(
    (b: any) => shipSlug(String(b.ship_name ?? "")) === shipSlug(ship.name),
  );
  const similar = peers.filter((s) => s.name !== ship.name && s.class === ship.class).slice(0, 6);
  return (
    <article className="wpPlanner spPage">
      <nav className="whCrumbs" aria-label="Breadcrumb">
        <button type="button" onClick={() => openShip(null)}>
          Ships
        </button>
        <span aria-hidden="true">›</span>
        <span>{rateName(ship.rate)}</span>
      </nav>
      <header className="spHead">
        <div className="spHero">{img ? <img src={img} alt={ship.name} /> : <span>⛵</span>}</div>
        <div>
          <p className="gwEyebrow">
            {rateName(ship.rate).toUpperCase()} · {(ship.class ?? "SHIP").toUpperCase()}
            {ship.faction ? ` · ${ship.faction.toUpperCase()}` : ""}
          </p>
          <h1>{ship.name}</h1>
          {classBlurb(ship.class) && <p className="whLead">{classBlurb(ship.class)}</p>}
          {pick && (
            <aside className="whCallout bom">
              <b>BOM</b>
              <span>{pick}</span>
            </aside>
          )}
          <div className="spActions">
            <button
              type="button"
              className="whCta"
              onClick={() => compare([ship.name, ...similar.slice(0, 1).map((s) => s.name)])}
            >
              Compare with another ship →
            </button>
            <button type="button" onClick={() => go("shipyard")}>
              Open in the Shipyard
            </button>
          </div>
        </div>
      </header>

      <section>
        <h2>How it stacks up</h2>
        <p className="gwMuted">
          Each bar is compared with the best {rateName(ship.rate)} ship ({peers.length} ships). The tick shows
          the average for its rate.
        </p>
        <div className="spStats">
          {STAT_LABELS.map(([k, label]) => {
            const v = Number(ship.stats?.[k]),
              o = out[k];
            if (!Number.isFinite(v) || !o.max) return null;
            const pct = Math.min(100, (v / o.max) * 100),
              avg = o.avg ? Math.min(100, (o.avg / o.max) * 100) : null;
            const verdict = o.avg
              ? v >= o.avg * 1.05
                ? "above average"
                : v <= o.avg * 0.95
                  ? "below average"
                  : "about average"
              : "";
            return (
              <div key={k} className="spStat">
                <span className="spLabel">{label}</span>
                <div className="spBar" title={`Average for its rate: ${fmt(o.avg)}`}>
                  <span style={{ width: `${pct}%` }} />
                  {avg !== null && <i style={{ left: `${avg}%` }} />}
                </div>
                <b>{fmt(v)}</b>
                <small className={verdict.replace(/ /g, "-")}>{verdict}</small>
              </div>
            );
          })}
        </div>
      </section>

      {ship.historicalInspiration && (
        <section>
          <h2>The real ship</h2>
          <p>{String(ship.historicalInspiration)}</p>
        </section>
      )}

      {builds.length > 0 && (
        <section>
          <h2>BOM builds for this ship</h2>
          <ul className="spBuilds">
            {builds.slice(0, 8).map((b: any) => (
              <li key={b.id}>
                <a href={`/dashboard/ship-builder?build=${encodeURIComponent(b.id)}`}>
                  {b.title || "Untitled build"}
                </a>
                {b.description && <small> — {String(b.description).slice(0, 140)}</small>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {similar.length > 0 && (
        <section>
          <h2>Similar ships</h2>
          <div className="whRelated">
            <div>
              {similar.map((s) => (
                <button key={s.name} type="button" onClick={() => openShip(s.name)}>
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
      <ReportMistake page={`ship:${shipSlug(ship.name)}`} label={ship.name} />
    </article>
  );
}

export function ShipCompare({
  names,
  setNames,
  openShip,
}: {
  names: string[];
  setNames: (n: string[]) => void;
  openShip: (n: string) => void;
}) {
  const { ships, error } = useShips();
  const chosen = useMemo(
    () => names.map((n) => ships?.find((s) => shipSlug(s.name) === shipSlug(n))).filter(Boolean) as Ship[],
    [names, ships],
  );
  if (error) return <p className="gwError">{error}</p>;
  if (!ships) return <p role="status">Loading ships…</p>;
  const set = (i: number, v: string) => {
    const next = [...chosen.map((s) => s.name)];
    if (v) next[i] = v;
    else next.splice(i, 1);
    setNames(next.filter(Boolean));
  };
  return (
    <section className="wpPlanner scmp">
      <p className="gwEyebrow">SHIP VS SHIP</p>
      <h2>Compare ships side by side</h2>
      <p>Pick two or three ships. Longer bars are higher numbers; the best in each row is marked.</p>
      <div className="gwToolControls">
        {[0, 1, 2].map((i) => (
          <label key={i}>
            Ship {i + 1}
            <select value={chosen[i]?.name ?? ""} onChange={(e) => set(i, e.target.value)}>
              <option value="">{i < 2 ? "Choose a ship" : "None"}</option>
              {ships.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} ({rateName(s.rate)})
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {chosen.length > 0 && (
        <>
          <div className="scmpHeads">
            {chosen.map((s, i) => {
              const img = portrait(s);
              return (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => openShip(s.name)}
                  style={{ borderColor: COLORS[i] }}
                >
                  {img ? <img src={img} alt="" /> : <span>⛵</span>}
                  <b>{s.name}</b>
                  <small>
                    {rateName(s.rate)} · {s.class ?? "Ship"}
                  </small>
                </button>
              );
            })}
          </div>
          <div className="whBars">
            {STAT_LABELS.map(([k, label]) => {
              const vals = chosen.map((s) => Number(s.stats?.[k]));
              if (!vals.some((v) => Number.isFinite(v))) return null;
              const max = Math.max(...vals.filter(Number.isFinite), 1),
                best = Math.max(...vals.filter(Number.isFinite));
              return (
                <div key={k} className="whBarRow">
                  <span className="whBarLabel">{label}</span>
                  <div className="whBarSet">
                    {vals.map((v, i) => (
                      <div key={i} className="whBar" title={`${chosen[i].name}: ${fmt(v)}`}>
                        <span
                          style={{
                            width: `${Number.isFinite(v) ? (v / max) * 100 : 0}%`,
                            background: COLORS[i],
                          }}
                        />
                        <small
                          className={v === best && vals.filter((x) => x === best).length === 1 ? "top" : ""}
                        >
                          {fmt(v)}
                          {v === best && vals.filter((x) => x === best).length === 1 ? " ★" : ""}
                        </small>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="gwMuted">
            Higher isn't always better: a bigger hold or crew can mean a slower, heavier ship.
          </p>
        </>
      )}
    </section>
  );
}
