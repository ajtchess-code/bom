"use client";
import { useEffect, useState } from "react";
import { EVENT_CRAFT_RESOURCES } from "@bom/shared";
import { operationsApi } from "./operationsApi";
import "./CommunityOperations.css";
export default function EventCraftingAdmin() {
  const [data, setData] = useState<any>(null),
    [ship, setShip] = useState(""),
    [costs, setCosts] = useState<Record<string, string>>({}),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  function select(name: string, d: any) {
    setShip(name);
    const row = d.costs.find((c: any) => c.ship_name === name);
    setVersion(row?.version ?? 0);
    setCosts(
      Object.fromEntries(
        EVENT_CRAFT_RESOURCES.map((r) => [
          r.key,
          row?.costs[r.key] === undefined ? "" : String(row.costs[r.key]),
        ]),
      ),
    );
  }
  async function load(name?: string) {
    const d = await operationsApi("event-tool/crafting");
    setData(d);
    select(name ?? d.ships[0] ?? "", d);
  }
  useEffect(() => {
    void load().catch((e) => setNotice(e.message));
  }, []);
  return (
    <div className="opsPage">
      <header>
        <div>
          <h1>Halloween Event · Ship Crafting Costs</h1>
          <p>
            Configure the costs shown on event ship cards. Blank means unspecified; enter 0 for a confirmed
            zero cost.
          </p>
        </div>
        <a href="/dashboard/events">Open Halloween Event</a>
      </header>
      {notice && (
        <p className="opsNotice" role="status">
          {notice}
        </p>
      )}
      {data && (
        <section className="opsCard">
          <label>
            Event ship
            <select value={ship} disabled={busy} onChange={(e) => select(e.target.value, data)}>
              {data.ships.map((name: string) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <div className="opsRow">
            {EVENT_CRAFT_RESOURCES.map((r) => (
              <label key={r.key}>
                {r.label}
                <input
                  aria-label={r.label}
                  type="number"
                  min="0"
                  max="1000000000"
                  step="1"
                  value={costs[r.key] ?? ""}
                  disabled={busy}
                  onChange={(e) => setCosts((v) => ({ ...v, [r.key]: e.target.value }))}
                  placeholder="Not specified"
                />
              </label>
            ))}
          </div>
          <button
            disabled={
              busy ||
              !ship ||
              Object.values(costs).some(
                (v) =>
                  v !== "" && (!Number.isSafeInteger(Number(v)) || Number(v) < 0 || Number(v) > 1000000000),
              )
            }
            onClick={async () => {
              setBusy(true);
              try {
                await operationsApi("event-tool/crafting", {
                  method: "PUT",
                  body: JSON.stringify({
                    shipName: ship,
                    version,
                    costs: Object.fromEntries(
                      Object.entries(costs)
                        .filter(([, v]) => v !== "")
                        .map(([k, v]) => [k, Number(v)]),
                    ),
                  }),
                });
                await load(ship);
                setNotice("Crafting cost saved. Event cards will show it on refresh.");
              } catch (e: any) {
                setNotice(e.message);
                await load(ship).catch(() => {});
              } finally {
                setBusy(false);
              }
            }}
          >
            Save crafting cost
          </button>
          <small>
            Costs apply to this guild’s event page and ship guide. Saving does not consume materials or change
            players’ progress.
          </small>
        </section>
      )}
    </div>
  );
}
