"use client";
// Port battle ports: one page each with the tactical map, format, BOM's record
// there and links to every Battle Prep plan made for it.
import { useState } from "react";
import ReportMistake from "./ReportMistake";
import { useLoad } from "./wikiData";

const when = (d: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";
const RESULT: Record<string, string> = { WIN: "Won", LOSS: "Lost", DRAW: "Draw", UNKNOWN: "Not recorded" };

function PortIndex({ openPort }: { openPort: (n: string) => void }) {
  const { data, error } = useLoad<any>("wiki/portal/ports");
  const [rate, setRate] = useState("all");
  if (error) return <p className="gwError">{error}</p>;
  if (!data) return <p role="status">Loading ports…</p>;
  const rates = [...new Set(data.ports.map((p: any) => p.rate))] as string[];
  const list = data.ports.filter((p: any) => rate === "all" || p.rate === rate);
  return (
    <section className="wpPlanner ppIndex">
      <p className="gwEyebrow">PORT BATTLE PORTS</p>
      <h2>Know the battlefield</h2>
      <p>Every port battle port with its map, team size and BOM's history there.</p>
      <div className="whChips" role="tablist" aria-label="Rate">
        {["all", ...rates].map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={rate === r}
            className={rate === r ? "active" : ""}
            onClick={() => setRate(r)}
          >
            {r === "all" ? "All rates" : r}
          </button>
        ))}
      </div>
      <div className="ppGrid">
        {list.map((p: any) => (
          <button key={p.name} type="button" className="ppCard" onClick={() => openPort(p.name)}>
            <span className="ppMap">
              {p.mapUrl ? <img src={p.mapUrl} alt="" loading="lazy" /> : <i>No map yet</i>}
            </span>
            <b>{p.name}</b>
            <small>
              {p.rate} · {p.size}v{p.size}
              {p.battles ? ` · ${p.battles} BOM battle${p.battles === 1 ? "" : "s"}` : ""}
            </small>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function PortPages({
  name,
  openPort,
}: {
  name: string | null;
  openPort: (n: string | null) => void;
}) {
  const { data, error } = useLoad<any>(name ? `wiki/portal/ports/${encodeURIComponent(name)}` : null);
  if (!name) return <PortIndex openPort={openPort} />;
  if (error) return <p className="gwError">{error}</p>;
  if (!data) return <p role="status">Loading port…</p>;
  const { port, battles, plans, record } = data;
  const played = record.wins + record.losses + record.draws;
  return (
    <article className="wpPlanner ppPage">
      <nav className="whCrumbs" aria-label="Breadcrumb">
        <button type="button" onClick={() => openPort(null)}>
          Port battle ports
        </button>
        <span aria-hidden="true">›</span>
        <span>{port.rate}</span>
      </nav>
      <header>
        <p className="gwEyebrow">
          {port.rate.toUpperCase()} · {port.size} VS {port.size}
        </p>
        <h1>{port.name}</h1>
        <div className="ppFacts">
          <div>
            <small>Ships per side</small>
            <b>{port.size}</b>
          </div>
          <div>
            <small>Ship rate</small>
            <b>{port.rate}</b>
          </div>
          <div>
            <small>BOM battles here</small>
            <b>{battles.length}</b>
          </div>
          <div>
            <small>BOM record</small>
            <b>
              {played
                ? `${record.wins}W · ${record.losses}L${record.draws ? ` · ${record.draws}D` : ""}`
                : "No results yet"}
            </b>
          </div>
        </div>
      </header>
      {port.mapUrl ? (
        <figure className="ppBigMap">
          <img src={port.mapUrl} alt={`Tactical map of ${port.name}`} />
          <figcaption>
            Tactical map. Plan your lines on it in{" "}
            <a href={`/dashboard/battle-prep?port=${encodeURIComponent(port.name)}`}>Battle Prep</a>.
          </figcaption>
        </figure>
      ) : (
        <p className="gwMuted">We don't have a tactical map for this port yet.</p>
      )}
      <section>
        <h2>BOM's plans for {port.name}</h2>
        {plans.length ? (
          <ul className="ppPlans">
            {plans.map((p: any) => (
              <li key={p.id}>
                <a href={`/dashboard/battle-prep?session=${encodeURIComponent(p.id)}`}>{p.title}</a>{" "}
                <small>
                  {p.kind === "REVIEW" ? "Review" : "Prep"} · updated {when(p.updated_at)}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="gwMuted">No plans yet. Officers can start one in Battle Prep.</p>
        )}
      </section>
      <section>
        <h2>Past battles</h2>
        {battles.length ? (
          <div className="gwOverflow">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Attacker</th>
                  <th>Defender</th>
                  <th>Result</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {battles.map((b: any) => (
                  <tr key={b.id}>
                    <td>{when(b.starts_at)}</td>
                    <td>{b.attacker || "—"}</td>
                    <td>{b.defender || "—"}</td>
                    <td className={`ppResult ${String(b.result ?? "").toLowerCase()}`}>
                      {RESULT[b.result] ?? (b.status === "CANCELLED" ? "Cancelled" : "Not recorded")}
                    </td>
                    <td>{b.notes ? String(b.notes).slice(0, 160) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="gwMuted">BOM hasn't fought here yet.</p>
        )}
      </section>
      <ReportMistake page={`port:${port.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} label={port.name} />
    </article>
  );
}
