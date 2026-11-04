"use client";
import { EVENT_CRAFT_RESOURCES } from "@bom/shared";
export default function EventCraftingCost({ ships }: { ships: any[] }) {
  return (
    <details className="eventCraftCost">
      <summary>Crafting cost</summary>
      {ships.map((s) => (
        <div key={s.name}>
          <b>{s.name}</b>
          {s.crafting ? (
            <dl>
              {EVENT_CRAFT_RESOURCES.map((r) => (
                <div key={r.key}>
                  <dt>{r.label}</dt>
                  <dd>
                    {s.crafting.costs[r.key] === undefined
                      ? "Not specified"
                      : Number(s.crafting.costs[r.key]).toLocaleString()}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>Not configured by Admiralty yet.</p>
          )}
        </div>
      ))}
      <small>Guild-configured costs. Unspecified resources are not assumed to be free.</small>
    </details>
  );
}
