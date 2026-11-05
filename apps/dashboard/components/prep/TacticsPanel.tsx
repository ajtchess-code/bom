"use client";
// Side controls for the tactical layer: tools, wind, weather gauge, squadrons
// and an inspector for whatever is selected on the map.
import {
  FORMATIONS,
  SHIP_TYPES,
  SIDE_LABEL,
  SQUADRON_COLORS,
  TIERS,
  type Selection,
  type ShipType,
  type Side,
  type Squadron,
  type TacticTool,
  type Tactics,
  addShip,
  compassName,
  emptyTactics,
  formUp,
  newSquadron,
  norm360,
  pointOfSail,
  weatherGauge,
} from "./Tactics";

const TOOLS: [TacticTool, string, string][] = [
  ["select", "M8 1v14M1 8h14M8 1 6 3M8 1l2 2M8 15l-2-2M8 15l2-2M1 8l2-2M1 8l2 2M15 8l-2-2M15 8l-2 2", "Move"],
  ["cone", "M8 14 2 4a8 8 0 0 1 12 0Z", "Firing arc"],
  ["zone", "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Zm0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z", "Denial zone"],
  ["tower", "M8 2 14 14H2Z", "Tower"],
];

function Range({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="tcRange">
      <span>
        {label}{" "}
        <b>
          {Math.round(value)}
          {suffix}
        </b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export default function TacticsPanel({
  tactics,
  onTactics,
  tool,
  onTool,
  selected,
  onSelect,
  activeSquadron,
  onActiveSquadron,
}: {
  tactics: Tactics;
  onTactics: (t: Tactics) => void;
  tool: TacticTool;
  onTool: (t: TacticTool) => void;
  selected: Selection;
  onSelect: (s: Selection) => void;
  activeSquadron: string | null;
  onActiveSquadron: (id: string | null) => void;
}) {
  const gauge = weatherGauge(tactics);
  const from = norm360(tactics.wind + 180);
  const squadronId = selected?.kind === "ship" ? selected.squadronId : activeSquadron;
  const squadron = tactics.squadrons.find((s) => s.id === squadronId) ?? null;
  const setSquadron = (s: Squadron) =>
    onTactics({ ...tactics, squadrons: tactics.squadrons.map((x) => (x.id === s.id ? s : x)) });
  const reform = (s: Squadron, patch: Partial<Squadron>) => setSquadron(formUp({ ...s, ...patch }));
  const add = (side: Side) => {
    const s = addShip(addShip(addShip(newSquadron(tactics, side), "line"), "line"), "line");
    onTactics({ ...tactics, squadrons: [...tactics.squadrons, formUp(s)] });
    onActiveSquadron(s.id);
    onSelect(null);
  };
  const ship = selected?.kind === "ship" ? squadron?.ships.find((x) => x.id === selected.id) : undefined;
  const cone = selected?.kind === "cone" ? tactics.cones.find((x) => x.id === selected.id) : undefined;
  const zone = selected?.kind === "zone" ? tactics.zones.find((x) => x.id === selected.id) : undefined;
  const tower = selected?.kind === "tower" ? tactics.towers.find((x) => x.id === selected.id) : undefined;
  const patchList = <K extends "cones" | "zones" | "towers">(
    key: K,
    id: string,
    patch: Partial<Tactics[K][number]>,
  ) =>
    onTactics({
      ...tactics,
      [key]: (tactics[key] as any[]).map((o) => (o.id === id ? { ...o, ...patch } : o)),
    });
  const removeFrom = (key: "cones" | "zones" | "towers", id: string) => {
    onTactics({ ...tactics, [key]: (tactics[key] as any[]).filter((o) => o.id !== id) });
    onSelect(null);
  };
  const empty =
    !tactics.squadrons.length && !tactics.cones.length && !tactics.zones.length && !tactics.towers.length;

  return (
    <aside className="tcPanel" aria-label="Tactics">
      <section>
        <div className="prToolGroup tcTools" role="group" aria-label="Tactics tools">
          {TOOLS.map(([t, icon, label]) => (
            <button
              key={t}
              type="button"
              className={tool === t ? "active" : ""}
              aria-pressed={tool === t}
              onClick={() => onTool(t)}
            >
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path
                  d={icon}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
              <span>{label}</span>
            </button>
          ))}
        </div>
        <small className="tcHint">
          {tool === "select"
            ? "Drag ships, objects and the wind arrow on the map."
            : tool === "cone"
              ? "Click a ship (or anywhere) to add a firing arc."
              : tool === "zone"
                ? "Click the map to mark a denial zone."
                : "Click the map to place the next numbered tower."}
        </small>
      </section>

      <section>
        <h4>Wind</h4>
        <Range
          label={`From ${compassName(from)}`}
          value={from}
          min={0}
          max={355}
          step={5}
          suffix="°"
          onChange={(v) => onTactics({ ...tactics, wind: norm360(v + 180) })}
        />
        <p className={`tcGauge ${gauge.holder ?? "none"}`} role="status">
          {gauge.text}
        </p>
        <ul className="tcLegend" aria-label="Points of sail">
          {TIERS.map((t) => (
            <li key={t.key}>
              <i style={{ background: t.color }} />
              {t.label} <small>{Math.round(t.speed * 100)}%</small>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4>Squadrons</h4>
        <div className="tcRow">
          <button type="button" className="outlineButton" onClick={() => add("friendly")}>
            + Friendly
          </button>
          <button type="button" className="outlineButton" onClick={() => add("enemy")}>
            + Enemy
          </button>
        </div>
        {tactics.squadrons.length ? (
          <div className="tcList">
            {tactics.squadrons.map((s) => (
              <button
                key={s.id}
                type="button"
                className={s.id === squadron?.id ? "active" : ""}
                onClick={() => {
                  onActiveSquadron(s.id);
                  onSelect(null);
                }}
              >
                <i style={{ background: SQUADRON_COLORS[s.color % 10] }} />
                <span>{s.name}</span>
                <small>
                  {SIDE_LABEL[s.side]} · {s.ships.length}
                </small>
              </button>
            ))}
          </div>
        ) : (
          <p className="tcEmpty">Add a squadron to place ships in formation.</p>
        )}
        {squadron && (
          <div className="tcEditor">
            <label>
              <span>Name</span>
              <input
                value={squadron.name}
                maxLength={40}
                onChange={(e) => setSquadron({ ...squadron, name: e.target.value })}
              />
            </label>
            <div className="tcRow">
              <label>
                <span>Side</span>
                <select
                  value={squadron.side}
                  onChange={(e) => setSquadron({ ...squadron, side: e.target.value as Side })}
                >
                  <option value="friendly">Friendly</option>
                  <option value="enemy">Enemy</option>
                </select>
              </label>
              <label>
                <span>Formation</span>
                <select
                  value={squadron.formation}
                  onChange={(e) => reform(squadron, { formation: e.target.value as Squadron["formation"] })}
                >
                  {FORMATIONS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="tcSwatches" role="group" aria-label="Squadron colour">
              {SQUADRON_COLORS.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colour ${i + 1}`}
                  aria-pressed={squadron.color === i}
                  className={squadron.color === i ? "active" : ""}
                  style={{ background: c }}
                  onClick={() => setSquadron({ ...squadron, color: i })}
                />
              ))}
            </div>
            <Range
              label={`Heading ${compassName(squadron.heading)}`}
              value={squadron.heading}
              min={0}
              max={355}
              step={5}
              suffix="°"
              onChange={(v) => reform(squadron, { heading: v })}
            />
            <Range
              label="Spacing"
              value={squadron.spacing}
              min={24}
              max={120}
              onChange={(v) => reform(squadron, { spacing: v })}
            />
            <div className="tcRow">
              {SHIP_TYPES.map(([t, l]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSquadron(formUp(addShip(squadron, t as ShipType)))}
                  disabled={squadron.ships.length >= 25}
                >
                  + {l}
                </button>
              ))}
            </div>
            <div className="tcRow">
              <button type="button" onClick={() => setSquadron(formUp(squadron))}>
                Form up
              </button>
              <button
                type="button"
                className="dangerGhost"
                onClick={() => {
                  onTactics({ ...tactics, squadrons: tactics.squadrons.filter((s) => s.id !== squadron.id) });
                  onActiveSquadron(null);
                  onSelect(null);
                }}
              >
                Remove squadron
              </button>
            </div>
          </div>
        )}
      </section>

      {(ship || cone || zone || tower) && (
        <section className="tcInspector">
          <h4>Selected</h4>
          {ship &&
            squadron &&
            (() => {
              const pos = pointOfSail(ship.heading, tactics.wind);
              const setShip = (patch: Partial<typeof ship>) =>
                setSquadron({
                  ...squadron,
                  ships: squadron.ships.map((x) => (x.id === ship.id ? { ...x, ...patch } : x)),
                });
              return (
                <>
                  <p className="tcSail">
                    <i style={{ background: pos.color }} /> {pos.label} · {Math.round(pos.speed * 100)}% speed
                    · {Math.round(pos.diff)}° off the wind
                  </p>
                  <label>
                    <span>Ship type</span>
                    <select value={ship.type} onChange={(e) => setShip({ type: e.target.value as ShipType })}>
                      {SHIP_TYPES.map(([t, l]) => (
                        <option key={t} value={t}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Range
                    label={`Heading ${compassName(ship.heading)}`}
                    value={ship.heading}
                    min={0}
                    max={355}
                    step={5}
                    suffix="°"
                    onChange={(v) => setShip({ heading: v })}
                  />
                  <button
                    type="button"
                    className="dangerGhost"
                    onClick={() => {
                      setSquadron({ ...squadron, ships: squadron.ships.filter((x) => x.id !== ship.id) });
                      onSelect(null);
                    }}
                  >
                    Remove ship
                  </button>
                </>
              );
            })()}
          {cone && (
            <>
              <Range
                label="Facing"
                value={cone.heading}
                min={0}
                max={355}
                step={5}
                suffix="°"
                onChange={(v) => patchList("cones", cone.id, { heading: v })}
              />
              <Range
                label="Range"
                value={cone.range}
                min={40}
                max={400}
                step={10}
                onChange={(v) => patchList("cones", cone.id, { range: v })}
              />
              <Range
                label="Arc width"
                value={cone.width}
                min={10}
                max={180}
                step={5}
                suffix="°"
                onChange={(v) => patchList("cones", cone.id, { width: v })}
              />
              <button type="button" className="dangerGhost" onClick={() => removeFrom("cones", cone.id)}>
                Remove arc
              </button>
            </>
          )}
          {zone && (
            <>
              <label>
                <span>Label</span>
                <input
                  value={zone.label}
                  maxLength={30}
                  placeholder="e.g. Mortar zone"
                  onChange={(e) => patchList("zones", zone.id, { label: e.target.value })}
                />
              </label>
              <Range
                label="Radius"
                value={zone.radius}
                min={20}
                max={300}
                step={5}
                onChange={(v) => patchList("zones", zone.id, { radius: v })}
              />
              <button type="button" className="dangerGhost" onClick={() => removeFrom("zones", zone.id)}>
                Remove zone
              </button>
            </>
          )}
          {tower && (
            <>
              <div className="tcRow">
                <label>
                  <span>Number</span>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={tower.number}
                    onChange={(e) =>
                      patchList("towers", tower.id, {
                        number: Math.max(1, Math.min(99, Number(e.target.value) || 1)),
                      })
                    }
                  />
                </label>
                <label>
                  <span>Label</span>
                  <input
                    value={tower.label}
                    maxLength={30}
                    placeholder="e.g. Fort"
                    onChange={(e) => patchList("towers", tower.id, { label: e.target.value })}
                  />
                </label>
              </div>
              <button type="button" className="dangerGhost" onClick={() => removeFrom("towers", tower.id)}>
                Remove tower
              </button>
            </>
          )}
        </section>
      )}

      {!empty && (
        <button
          type="button"
          className="dangerGhost tcClear"
          onClick={() => {
            if (confirm("Remove all squadrons and battlefield objects from this plan?")) {
              onTactics({ ...emptyTactics(), wind: tactics.wind });
              onSelect(null);
              onActiveSquadron(null);
            }
          }}
        >
          Clear tactics
        </button>
      )}
    </aside>
  );
}
