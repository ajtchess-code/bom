"use client";
// Trade route finder: the most profitable buy-here, sell-there runs from the
// wiki's port price list, ranked by profit for a full hold.
import { useMemo, useState } from "react";
import { useLoad } from "./wikiData";

type Good = { name: string; weight: number | null; ports: { port: string; price: number }[] };
type Run = {
  also?: string[];
  good: string;
  weight: number;
  buy: string;
  buyPrice: number;
  sell: string;
  sellPrice: number;
  units: number;
  profit: number;
  perWeight: number;
  distance: number | null;
};

const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

export default function TradeRoutes() {
  const { data, error } = useLoad<any>("wiki/portal/articles/trade-goods");
  const { data: atlas } = useLoad<any>("game-wiki/visuals/atlas");
  const [hold, setHold] = useState(2000),
    [from, setFrom] = useState("any"),
    [to, setTo] = useState("any"),
    [sort, setSort] = useState<"profit" | "perDistance">("profit");
  const goods: Good[] = useMemo(
    () =>
      (data?.data?.goods ?? [])
        .map((g: any) => ({
          name: g.name,
          weight: Number(g.weight) || null,
          ports: (g.ports ?? [])
            .map((p: any) => ({ port: String(p.port), price: Number(p.price) }))
            .filter((p: any) => Number.isFinite(p.price)),
        }))
        .filter((g: Good) => g.weight && g.ports.length > 1),
    [data],
  );
  const ports = useMemo(() => [...new Set(goods.flatMap((g) => g.ports.map((p) => p.port)))].sort(), [goods]);
  const coords = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const p of atlas?.ports ?? [])
      if (p.position) m.set(squash(String(p.EnglishName ?? "")), p.position);
    return m;
  }, [atlas]);
  const distance = (a: string, b: string) => {
    const p = coords.get(squash(a)),
      q = coords.get(squash(b));
    return p && q ? Math.hypot(p.x - q.x, p.y - q.y) : null;
  };
  const runs: Run[] = useMemo(() => {
    const out: Run[] = [];
    for (const g of goods) {
      const units = Math.floor(hold / g.weight!);
      if (!units) continue;
      for (const b of g.ports)
        for (const s of g.ports) {
          if (b.port === s.port || s.price <= b.price) continue;
          if (from !== "any" && b.port !== from) continue;
          if (to !== "any" && s.port !== to) continue;
          out.push({
            good: g.name,
            weight: g.weight!,
            buy: b.port,
            buyPrice: b.price,
            sell: s.port,
            sellPrice: s.price,
            units,
            profit: units * (s.price - b.price),
            perWeight: (s.price - b.price) / g.weight!,
            distance: distance(b.port, s.port),
          });
        }
    }
    const score = (r: Run) => (sort === "perDistance" && r.distance ? r.profit / r.distance : r.profit);
    // One row per good (its best run), listing other ports that pay the same.
    const best = new Map<string, Run>();
    for (const r of out.sort((a, b) => score(b) - score(a))) {
      const top = best.get(r.good);
      if (!top) best.set(r.good, { ...r, also: [] });
      else if (r.buy === top.buy && r.sellPrice === top.sellPrice) top.also!.push(r.sell);
    }
    return [...best.values()].sort((a, b) => score(b) - score(a)).slice(0, 40);
  }, [goods, hold, from, to, sort, coords]);
  if (error) return <p className="gwError">{error}</p>;
  if (!data) return <p role="status">Loading prices…</p>;
  const hasDistance = runs.some((r) => r.distance !== null);
  return (
    <section className="wpPlanner trRoutes">
      <p className="gwEyebrow">TRADE ROUTE FINDER</p>
      <h2>Where to buy, where to sell</h2>
      <p>
        The best run for each good with a full hold, from the wiki's price list of {goods.length} goods across{" "}
        {ports.length} ports.
      </p>
      <div className="gwToolControls">
        <label>
          Hold space (weight)
          <input
            type="number"
            min={1}
            value={hold}
            onChange={(e) => setHold(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
        <label>
          Buy at
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="any">Any port</option>
            {ports.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Sell at
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="any">Any port</option>
            {ports.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        {hasDistance && (
          <label>
            Rank by
            <select value={sort} onChange={(e) => setSort(e.target.value as any)}>
              <option value="profit">Most profit</option>
              <option value="perDistance">Profit for the distance</option>
            </select>
          </label>
        )}
      </div>
      {runs.length ? (
        <div className="gwOverflow">
          <table>
            <thead>
              <tr>
                <th>Good</th>
                <th>Buy at</th>
                <th>Sell at</th>
                <th>Units</th>
                <th>Profit</th>
                {hasDistance && <th>Distance</th>}
              </tr>
            </thead>
            <tbody>
              {runs.map((r, i) => (
                <tr key={`${r.good}${r.buy}${r.sell}`} className={i < 3 ? "trTop" : ""}>
                  <td>
                    <b>{r.good}</b> <small>({r.weight} each)</small>
                  </td>
                  <td>
                    {r.buy} <small>@ {r.buyPrice}</small>
                  </td>
                  <td>
                    {r.sell} <small>@ {r.sellPrice}</small>
                    {r.also && r.also.length > 0 && (
                      <small className="trAlso">
                        {" "}
                        or {r.also.slice(0, 3).join(", ")}
                        {r.also.length > 3 ? ` +${r.also.length - 3} more` : ""}
                      </small>
                    )}
                  </td>
                  <td>{r.units.toLocaleString()}</td>
                  <td>
                    <b>{r.profit.toLocaleString()}</b> <small>gold</small>
                  </td>
                  {hasDistance && (
                    <td>{r.distance ? `${Math.round(r.distance / 100).toLocaleString()}` : "—"}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="gwMuted">No profitable runs for that choice.</p>
      )}
      <p className="gwMuted">
        Prices come from a player-made price sheet and move as people trade, so check the trade house before
        you buy. Profit doesn't include taxes or mooring fees.
        {hasDistance ? " Distance is straight-line, in map units." : ""}
      </p>
    </section>
  );
}
