"use client";
// Port battle checklist: a pre-battle loadout check and BOM's stockpile targets,
// with "what I have" boxes that show what's still missing. Saved in this browser.
import { useEffect, useState } from "react";

type Row = { item: string; target: number; image?: string };
const b = (n: string) => `/wosb/builds/${n}.png`;

/** Rough loadout for a 1st rate, from the port battle guide in the New Player Guide. */
const LOADOUT: Row[] = [
  { item: "Wood", target: 3000, image: b("resource-wood") },
  { item: "Fabric", target: 500, image: b("resource-fabric") },
  { item: "Food (provisions)", target: 400, image: b("resource-provision") },
  { item: "Fire ships", target: 4, image: b("ammunition-fire-ship") },
];
/** BOM stockpile minimums (BOM Port Battle Preparation guide). */
const AMMO: Row[] = [
  { item: "Saxon Shot", target: 15000, image: b("ammunition-saxon-shots") },
  { item: "Heavy Shot", target: 10000, image: b("ammunition-heavy-shots") },
  { item: "Strike Rounds", target: 5000, image: b("ammunition-strike-rounds") },
  { item: "Burning Arrows", target: 500 },
  { item: "Phosphorus Shot", target: 500 },
  { item: "Small Gunpowder Barrels", target: 500 },
  { item: "Small Flaming Barrels", target: 500, image: b("ammunition-small-flaming-barrels") },
  { item: "Large Phosphorus Mines", target: 500, image: b("ammunition-large-phosphorous-mines") },
  { item: "Fire Ship", target: 250, image: b("ammunition-fire-ship") },
];
const CONSUMABLES: Row[] = [
  ["Iron Patches", "consumable-iron-patches"],
  ["Bronze Patches", "consumable-bronze-patches"],
  ["Field Kit", "consumable-field-kit"],
  ["Smoke Screen", "consumable-smoke-screen"],
  ["Large Plates", "consumable-large-plates"],
  ["Small Plates", "consumable-small-plates"],
  ["Black Double Powder", "consumable-black-double-powder"],
  ["Red Double Powder", "consumable-red-double-powder"],
  ["White Double Powder", "consumable-white-double-powder"],
  ["Yellow Signal Flare", ""],
  ["Horn", ""],
  ["Phosphorus", "consumable-phosphorus"],
  ["Filling Ration", "consumable-filling-ration"],
  ["Red Signal Flare", "consumable-red-signal-flare"],
].map(([item, img]) => ({ item, target: 100, image: img ? b(img) : undefined }));
const PER_PORT: Row[] = [
  { item: "Provisions", target: 300, image: b("resource-provision") },
  { item: "Wood", target: 20000, image: b("resource-wood") },
  { item: "Fabric", target: 1500, image: b("resource-fabric") },
];
const STEPS = [
  "Signed up on the dashboard (Port Battles)",
  "Checked the plan in Battle Prep",
  "Upgrades fitted (tacking sails, ammunition cradles, fortified gun ports, repair arsenal)",
  "Three consumables picked (e.g. phosphorus, large plates, bronze patches)",
  "Lantern fitted",
  "Hold insurance bought (40 scrolls, port shop)",
  "Hold packed: wood, fabric, food, ammo, fire ships, mines",
];

const STORE = "bom:pb-checklist";
type State = { have: Record<string, number>; done: Record<string, boolean>; ports: number; shots: number };
const blank: State = { have: {}, done: {}, ports: 1, shots: 2000 };

export default function PbChecklist() {
  const [s, set] = useState<State>(blank);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(STORE) || "null");
      if (v && typeof v === "object") set({ ...blank, ...v });
    } catch {}
  }, []);
  const update = (patch: Partial<State>) =>
    set((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORE, JSON.stringify(next));
      } catch {}
      return next;
    });
  const have = (key: string) => s.have[key] ?? 0;
  const table = (id: string, title: string, rows: Row[], scale = 1) => {
    const missing = rows.filter((r) => have(`${id}:${r.item}`) < r.target * scale).length;
    return (
      <section className="pbTable">
        <header>
          <h3>{title}</h3>
          <span className={missing ? "pbShort" : "pbOk"}>
            {missing ? `${missing} short` : "All stocked ✓"}
          </span>
        </header>
        <div className="gwOverflow">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Target</th>
                <th>I have</th>
                <th>Still need</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const k = `${id}:${r.item}`,
                  need = Math.max(0, r.target * scale - have(k));
                return (
                  <tr key={k} className={need ? "" : "pbDone"}>
                    <td>
                      <span className="pbItem">
                        {r.image ? <img src={r.image} alt="" loading="lazy" /> : <i aria-hidden="true" />}
                        {r.item}
                      </span>
                    </td>
                    <td>{(r.target * scale).toLocaleString()}</td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        aria-label={`${r.item}: how many I have`}
                        value={s.have[k] ?? ""}
                        placeholder="0"
                        onChange={(e) =>
                          update({ have: { ...s.have, [k]: Math.max(0, Number(e.target.value) || 0) } })
                        }
                      />
                    </td>
                    <td>{need ? need.toLocaleString() : "✓"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    );
  };
  const steps = STEPS.filter((t) => s.done[t]).length;
  return (
    <section className="wpPlanner pbCheck">
      <p className="gwEyebrow">PORT BATTLE CHECKLIST</p>
      <h2>Ready for the port battle?</h2>
      <p>Tick off your prep and fill in what you have. Everything saves in this browser.</p>

      <section className="pbSteps">
        <header>
          <h3>Before the battle</h3>
          <span className={steps === STEPS.length ? "pbOk" : "pbShort"}>
            {steps} of {STEPS.length} done
          </span>
        </header>
        <ul>
          {STEPS.map((t) => (
            <li key={t}>
              <label className="gwCheck">
                <input
                  type="checkbox"
                  checked={!!s.done[t]}
                  onChange={(e) => update({ done: { ...s.done, [t]: e.target.checked } })}
                />{" "}
                {t}
              </label>
            </li>
          ))}
        </ul>
      </section>

      {table("hold", "Your hold (1st rate, rough guide)", LOADOUT)}
      <div className="pbSplit">
        <label>
          Shots you carry
          <input
            type="number"
            min={0}
            value={s.shots}
            onChange={(e) => update({ shots: Math.max(0, Number(e.target.value) || 0) })}
          />
        </label>
        <p>
          A common split is about 80% Saxon and 20% Heavy:{" "}
          <b>{Math.round(s.shots * 0.8).toLocaleString()} Saxon</b> and{" "}
          <b>{Math.round(s.shots * 0.2).toLocaleString()} Heavy</b>. Bring 4 to 6 fire ships and some mines.
        </p>
      </div>
      <p className="gwMuted">Smaller ships need less. Ask an officer if you're unsure.</p>

      <h3 className="pbSection">BOM stockpile targets</h3>
      <p className="gwMuted">
        Our minimums from the BOM Port Battle Preparation guide. Officers may change them.
      </p>
      {table("ammo", "Ammunition", AMMO)}
      {table("cons", "Consumables", CONSUMABLES)}
      <div className="pbSplit">
        <label>
          Ports you keep stock in
          <input
            type="number"
            min={1}
            max={20}
            value={s.ports}
            onChange={(e) => update({ ports: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })}
          />
        </label>
        <p>Food and materials are per port, so the targets below are multiplied by this.</p>
      </div>
      {table("port", "Food & materials", PER_PORT, s.ports)}
      <button type="button" className="pbReset" onClick={() => update({ ...blank })}>
        Clear everything
      </button>
    </section>
  );
}
