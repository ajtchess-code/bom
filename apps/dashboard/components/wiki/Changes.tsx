"use client";
// "What changed this update": the differences between the installed game data and the release before it.
import { useState } from "react";
import { useLoad } from "./wikiData";

const WORDS: Record<string, string> = {
  EnglishName: "Name",
  HP: "Health",
  Hp: "Health",
  Distance: "Range",
  Maneuverability: "Turning",
  Displacement: "Weight",
  ReloadTime: "Reload",
  Price: "Price",
  Cost: "Cost",
};
export const friendlyField = (s: string) =>
  WORDS[s] ??
  (/^[PM][A-Z][a-z]/.test(s)
    ? `${s.slice(1).replace(/([a-z0-9])([A-Z])/g, "$1 $2")} (${s[0] === "P" ? "+%" : "+"})`
    : s.replaceAll("_", " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2"));
const show = (v: any) =>
  v === null || v === undefined || v === ""
    ? "—"
    : typeof v === "number"
      ? v.toLocaleString(undefined, { maximumFractionDigits: 3 })
      : String(v);
const LOWER_BETTER = /reload|cost|price|time|spread|cooldown|weight|displacement|consum/i;
function arrow(a: any, b: any, field = "") {
  const x = Number(a),
    y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x === y) return null;
  const pct = x ? ((y - x) / Math.abs(x)) * 100 : null;
  return (
    <em className={y > x !== LOWER_BETTER.test(field) ? "up" : "down"}>
      {y > x ? "▲" : "▼"}
      {pct !== null && Math.abs(pct) < 1000
        ? ` ${Math.abs(pct).toFixed(pct && Math.abs(pct) < 10 ? 1 : 0)}%`
        : ""}
    </em>
  );
}

export default function Changes({ open }: { open?: (table: string, row?: number) => void }) {
  const { data, error } = useLoad<any>("game-wiki/changes");
  const [section, setSection] = useState("all"),
    [q, setQ] = useState("");
  if (error) return <p className="gwError">{error}</p>;
  if (!data) return <p role="status">Comparing game updates… this can take a few seconds the first time.</p>;
  const term = q.trim().toLowerCase();
  const sections = (data.sections ?? []).filter((s: any) => section === "all" || s.table === section);
  const match = (r: any) =>
    !term || `${r.name} ${(r.fields ?? []).map((f: any) => f.field).join(" ")}`.toLowerCase().includes(term);
  const total = (data.sections ?? []).reduce(
    (n: number, s: any) => n + s.added.length + s.removed.length + s.changed.length,
    0,
  );
  return (
    <section className="wpPlanner chg">
      <p className="gwEyebrow">WHAT CHANGED</p>
      <h2>What changed in the latest game update</h2>
      {!data.previous ? (
        <p>
          There's only one game-data release on the server, so there's nothing to compare yet. After the next
          update is installed, this page lists every change.
        </p>
      ) : (
        <>
          <p>
            Comparing <b>{data.current.release}</b>
            {data.current.asOf ? ` (${String(data.current.asOf).slice(0, 10)})` : ""} with the release before
            it, <b>{data.previous.release}</b>
            {data.previous.asOf ? ` (${String(data.previous.asOf).slice(0, 10)})` : ""}.{" "}
            {total.toLocaleString()} changes found.
          </p>
          <div className="gwToolControls">
            <label>
              Show
              <select value={section} onChange={(e) => setSection(e.target.value)}>
                <option value="all">Everything</option>
                {data.sections.map((s: any) => (
                  <option key={s.table} value={s.table}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Search
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jericho, reload, armor…" />
            </label>
          </div>
          {!sections.length && (
            <p className="gwMuted">Nothing changed in the parts of the game the wiki tracks.</p>
          )}
          {sections.map((s: any) => {
            const changed = s.changed.filter(match),
              added = s.added.filter(match),
              removed = s.removed.filter(match);
            if (!changed.length && !added.length && !removed.length) return null;
            return (
              <section key={s.table} className="chgSection">
                <h3>
                  {s.label}{" "}
                  <small>
                    {[
                      added.length && `${added.length} new`,
                      changed.length && `${changed.length} changed`,
                      removed.length && `${removed.length} removed`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </h3>
                {added.length > 0 && (
                  <p className="chgAdded">
                    <b>New:</b> {added.map((r: any) => r.name).join(", ")}
                  </p>
                )}
                {removed.length > 0 && (
                  <p className="chgRemoved">
                    <b>Removed:</b> {removed.map((r: any) => r.name).join(", ")}
                  </p>
                )}
                {changed.slice(0, 200).map((r: any) => (
                  <details key={r.key} className="chgRow" open={changed.length <= 6}>
                    <summary>
                      <b>{r.name}</b>{" "}
                      <small>
                        {r.fields.length} change{r.fields.length === 1 ? "" : "s"}
                      </small>
                    </summary>
                    <table>
                      <tbody>
                        {r.fields.map((f: any) => (
                          <tr key={f.field}>
                            <th>{friendlyField(f.field)}</th>
                            <td>{show(f.before)}</td>
                            <td>→</td>
                            <td>
                              <b>{show(f.after)}</b> {arrow(f.before, f.after, f.field)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                ))}
                {changed.length > 200 && (
                  <p className="gwMuted">Showing the first 200. Search to narrow it down.</p>
                )}
              </section>
            );
          })}
          <p className="gwMuted">
            ▲ and ▼ show whether a number went up or down. Green means better for you (for reload times and
            costs, lower is better).
          </p>
        </>
      )}
    </section>
  );
}
