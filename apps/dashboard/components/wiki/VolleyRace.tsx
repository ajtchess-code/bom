"use client";
// Cannon showdown: how much damage two or three guns deal over time, volley by
// volley. Uses each gun's damage and reload from the wiki's weapon list.
import { useEffect, useMemo, useState } from "react";

type Gun = {
  name: string;
  damage: number;
  reload: number;
  range?: number;
  penetration?: number;
  weightClass?: string;
};
const COLORS = ["#d9a441", "#4f8edb", "#53b96e"];
const num = (v: any) => {
  const n = parseFloat(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

export default function VolleyRace() {
  const [guns, setGuns] = useState<Gun[] | null>(null),
    [error, setError] = useState("");
  const [picks, setPicks] = useState<string[]>([]),
    [count, setCount] = useState(30),
    [bonus, setBonus] = useState(0),
    [seconds, setSeconds] = useState(180);
  useEffect(() => {
    fetch("/api/internal/wiki/portal/articles/cannons-and-weapons", { cache: "no-store" })
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b.message || "The gun list isn't available right now.");
        return b;
      })
      .then((b) => {
        const list: Gun[] = (b.data?.weapons ?? [])
          .map((w: any) => ({
            name: w.name,
            damage: num(w.damage),
            reload: num(w.reload),
            range: num(w.range),
            penetration: num(w.penetration),
            weightClass: w.weightClass,
          }))
          .filter((g: Gun) => g.damage > 0 && g.reload > 0)
          .filter((g: Gun, i: number, a: Gun[]) => a.findIndex((x) => x.name === g.name) === i);
        setGuns(list);
        const want = [/32.?pdr long/i, /jericho/i];
        setPicks(want.map((re) => list.find((g) => re.test(g.name))?.name).filter(Boolean) as string[]);
      })
      .catch((e) => setError(e.message));
  }, []);
  const chosen = useMemo(
    () => picks.map((n) => guns?.find((g) => g.name === n)).filter(Boolean) as Gun[],
    [picks, guns],
  );
  const reloadOf = (g: Gun) => g.reload * (1 - Math.min(Math.max(bonus, 0), 60) / 100);
  // Damage after each volley: the first volley fires at 0 s (guns start loaded).
  const series = chosen.map((g) => {
    const r = reloadOf(g),
      pts: { t: number; d: number }[] = [];
    for (let n = 1; (n - 1) * r <= seconds; n++) pts.push({ t: (n - 1) * r, d: g.damage * count * n });
    return pts;
  });
  const maxD = Math.max(1, ...series.flatMap((s) => s.map((p) => p.d)));
  const W = 640,
    H = 260,
    P = 40;
  const x = (t: number) => P + (t / seconds) * (W - P - 10),
    y = (d: number) => H - 26 - (d / maxD) * (H - 46);
  const path = (s: { t: number; d: number }[]) => {
    let p = `M${x(0)},${y(0)}`;
    let prev = 0;
    for (const pt of s) {
      p += ` L${x(pt.t)},${y(prev)} L${x(pt.t)},${y(pt.d)}`;
      prev = pt.d;
    }
    return p + ` L${x(seconds)},${y(prev)}`;
  };
  const rows = Array.from({ length: 10 }, (_, i) => i + 1);
  const at = (g: Gun, t: number) => g.damage * count * (Math.floor(t / reloadOf(g)) + 1);
  const leader = (t: number) => {
    if (chosen.length < 2) return "";
    const v = chosen.map((g) => at(g, t)),
      best = Math.max(...v);
    return v.filter((x) => x === best).length > 1 ? "Level" : chosen[v.indexOf(best)].name;
  };
  // Every moment the lead changes hands.
  const changes: { t: number; who: string }[] = [];
  if (chosen.length > 1)
    for (let t = 0; t <= seconds; t = Math.round((t + 0.1) * 10) / 10) {
      const who = leader(t);
      if (!changes.length || changes[changes.length - 1].who !== who) changes.push({ t, who });
    }
  if (error) return <p className="gwError">{error}</p>;
  if (!guns) return <p role="status">Loading guns…</p>;
  return (
    <section className="wpPlanner vrRace">
      <p className="gwEyebrow">CANNON SHOWDOWN</p>
      <h2>Which gun deals more damage over time?</h2>
      <p>
        Pick two or three guns. Guns that hit hard but reload slowly win the first shot; faster-reloading guns
        catch up and pull ahead. This shows when that happens.
      </p>
      <div className="gwToolControls">
        {[0, 1, 2].map((i) => (
          <label key={i}>
            Gun {i + 1}
            <select
              value={picks[i] ?? ""}
              onChange={(e) => {
                const v = [...picks];
                v[i] = e.target.value;
                setPicks(v.filter(Boolean));
              }}
            >
              <option value="">{i < 2 ? "Choose a gun" : "None"}</option>
              {guns.map((g) => (
                <option key={g.name} value={g.name}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          Guns firing
          <input
            type="number"
            min={1}
            max={120}
            value={count}
            onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
        <label>
          Faster reload (%)
          <input
            type="number"
            min={0}
            max={60}
            step={1}
            value={bonus}
            onChange={(e) => setBonus(Number(e.target.value) || 0)}
          />
        </label>
        <label>
          Fight length (s)
          <input
            type="number"
            min={30}
            max={600}
            step={10}
            value={seconds}
            onChange={(e) => setSeconds(Math.min(600, Math.max(30, Number(e.target.value) || 30)))}
          />
        </label>
      </div>
      <div className="vrQuick">
        Add a reload bonus:{" "}
        <button type="button" onClick={() => setBonus(bonus + 12)}>
          Ammunition cradles (+12%)
        </button>{" "}
        <button type="button" onClick={() => setBonus(bonus + 4)}>
          Gunner (+4%)
        </button>{" "}
        <button type="button" onClick={() => setBonus(0)}>
          Reset
        </button>
      </div>
      {chosen.length > 0 && (
        <>
          <div className="whLegend">
            {chosen.map((g, i) => (
              <span key={g.name}>
                <i style={{ background: COLORS[i] }} /> {g.name}: {g.damage} damage, reloads in{" "}
                {reloadOf(g).toFixed(1)} s
              </span>
            ))}
          </div>
          <svg
            className="vrChart"
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label="Total damage over time for each gun"
          >
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <g key={f}>
                <line x1={P} x2={W - 10} y1={y(maxD * f)} y2={y(maxD * f)} className="vrGrid" />
                <text x={P - 4} y={y(maxD * f) + 4} textAnchor="end" className="vrAxis">
                  {maxD * f >= 1000
                    ? `${((maxD * f) / 1000).toFixed(maxD >= 10000 ? 0 : 1)}k`
                    : Math.round(maxD * f)}
                </text>
              </g>
            ))}
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <text
                key={f}
                x={x(seconds * f)}
                y={H - 8}
                textAnchor={f === 1 ? "end" : f === 0 ? "start" : "middle"}
                className="vrAxis"
              >
                {Math.round(seconds * f)}s
              </text>
            ))}
            {series.map((s, i) => (
              <path key={i} d={path(s)} fill="none" stroke={COLORS[i]} strokeWidth="2.5" />
            ))}
          </svg>
          {changes.length > 0 && (
            <ol className="vrStory">
              {changes.slice(0, 8).map((c, i) => (
                <li key={i}>
                  {i === 0 ? "At the start" : `At ${c.t.toFixed(1)} s`}:{" "}
                  {c.who === "Level" ? "they're level" : <b>{c.who}</b>}
                  {c.who !== "Level" && (i === 0 ? " leads" : " takes the lead")}
                  {i === changes.length - 1 && i > 0 && i < 8 && c.who !== "Level" ? " and keeps it" : ""}.
                </li>
              ))}
            </ol>
          )}
          <div className="gwOverflow">
            <table>
              <thead>
                <tr>
                  <th>Volley</th>
                  {chosen.map((g) => (
                    <th key={g.name}>{g.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((n) => (
                  <tr key={n}>
                    <td>{n}</td>
                    {chosen.map((g) => (
                      <td key={g.name}>
                        {(g.damage * count * n).toLocaleString()}{" "}
                        <small>at {((n - 1) * reloadOf(g)).toFixed(1)} s</small>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="gwMuted">
        Total damage = the gun's damage number × guns firing × volleys. It doesn't count armor, angles,
        misses, fires or ammo type, so use it to compare guns, not to predict a fight.
      </p>
    </section>
  );
}
