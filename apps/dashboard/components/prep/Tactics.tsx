"use client";
// Tactical layer for Battle Prep, drawn on top of the real port map:
// wind and points of sail, the weather gauge, squadrons with formations, and
// battlefield objects (firing arcs, denial zones, numbered towers).
// Everything is plain data saved in the plan's view_state.tactics.
import { type PointerEvent as ReactPointerEvent, type RefObject, useRef } from "react";

export type ShipType = "line" | "siege" | "skirmish";
export type Side = "friendly" | "enemy";
export type Formation = "line-ahead" | "line-abreast" | "echelon-port" | "echelon-stbd";
export type TShip = { id: string; type: ShipType; x: number; y: number; heading: number };
export type Squadron = {
  id: string;
  name: string;
  side: Side;
  color: number;
  formation: Formation;
  heading: number;
  spacing: number;
  ships: TShip[];
};
export type Cone = { id: string; x: number; y: number; heading: number; range: number; width: number };
export type Zone = { id: string; x: number; y: number; radius: number; label: string };
export type Tower = { id: string; x: number; y: number; number: number; label: string };
export type Tactics = { wind: number; squadrons: Squadron[]; cones: Cone[]; zones: Zone[]; towers: Tower[] };
export type Selection =
  | { kind: "ship"; squadronId: string; id: string }
  | { kind: "cone" | "zone" | "tower"; id: string }
  | null;
export type TacticTool = "select" | "cone" | "zone" | "tower";

/** wind = the compass direction the wind blows TOWARD (0 = up/north). */
export const emptyTactics = (): Tactics => ({ wind: 90, squadrons: [], cones: [], zones: [], towers: [] });

export function readTactics(raw: unknown): Tactics {
  const t = (raw && typeof raw === "object" ? raw : {}) as Partial<Tactics>;
  const arr = <T,>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);
  return {
    wind: Number.isFinite(Number(t.wind)) ? norm360(Number(t.wind)) : 90,
    squadrons: arr<Squadron>(t.squadrons).map((s) => ({ ...s, ships: arr<TShip>(s.ships) })),
    cones: arr<Cone>(t.cones),
    zones: arr<Zone>(t.zones),
    towers: arr<Tower>(t.towers),
  };
}

export const SQUADRON_COLORS = [
  "#4f8edb",
  "#53b96e",
  "#e1bf43",
  "#9a68d8",
  "#4fc4bd",
  "#dc4b45",
  "#e0843f",
  "#d96aa0",
  "#9aabbd",
  "#b3b85f",
];
export const SIDE_LABEL: Record<Side, string> = { friendly: "Friendly", enemy: "Enemy" };
export const FORMATIONS: [Formation, string][] = [
  ["line-ahead", "Line ahead"],
  ["line-abreast", "Line abreast"],
  ["echelon-port", "Echelon (port)"],
  ["echelon-stbd", "Echelon (starboard)"],
];
export const SHIP_TYPES: [ShipType, string][] = [
  ["line", "Line"],
  ["siege", "Siege"],
  ["skirmish", "Skirmish"],
];

// Points of sail by angle off the wind. Speed is a rough fraction of best speed.
export const TIERS = [
  { key: "irons", label: "In irons", min: 0, max: 45, speed: 0.05, color: "#dc4b45" },
  { key: "close", label: "Close-hauled", min: 45, max: 70, speed: 0.45, color: "#e0843f" },
  { key: "beam", label: "Beam reach", min: 70, max: 100, speed: 0.8, color: "#e1bf43" },
  { key: "broad", label: "Broad reach", min: 100, max: 155, speed: 1, color: "#53b96e" },
  { key: "run", label: "Running", min: 155, max: 181, speed: 0.85, color: "#4f8edb" },
] as const;

export const norm360 = (a: number) => ((a % 360) + 360) % 360;
const D2R = Math.PI / 180;
const rid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

export function pointOfSail(heading: number, wind: number) {
  const windFrom = norm360(wind + 180);
  let diff = Math.abs(norm360(heading) - windFrom);
  if (diff > 180) diff = 360 - diff;
  return { ...(TIERS.find((t) => diff >= t.min && diff < t.max) ?? TIERS[TIERS.length - 1]), diff };
}
export function compassName(deg: number) {
  const n = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  return n[Math.round(norm360(deg) / 22.5) % 16];
}

/** Which side is further upwind. */
export function weatherGauge(t: Tactics): { holder: Side | "even" | null; text: string } {
  const centroid = (side: Side) => {
    const ships = t.squadrons.filter((s) => s.side === side).flatMap((s) => s.ships);
    if (!ships.length) return null;
    return {
      x: ships.reduce((a, s) => a + s.x, 0) / ships.length,
      y: ships.reduce((a, s) => a + s.y, 0) / ships.length,
    };
  };
  const f = centroid("friendly"),
    e = centroid("enemy");
  if (!f || !e) return { holder: null, text: "Add friendly and enemy ships to read the weather gauge" };
  const up = norm360(t.wind + 180) * D2R,
    ux = Math.sin(up),
    uy = -Math.cos(up);
  const sf = f.x * ux + f.y * uy,
    se = e.x * ux + e.y * uy;
  if (Math.abs(sf - se) < 15) return { holder: "even", text: "Neither side holds the weather gauge" };
  return sf > se
    ? { holder: "friendly", text: "We hold the weather gauge" }
    : { holder: "enemy", text: "The enemy holds the weather gauge" };
}

/** Arrange a squadron's ships in its formation around their current centre. */
export function formUp(s: Squadron): Squadron {
  const n = s.ships.length;
  if (!n) return s;
  const cx = s.ships.reduce((a, x) => a + x.x, 0) / n,
    cy = s.ships.reduce((a, x) => a + x.y, 0) / n;
  const r = s.heading * D2R,
    fwd = { x: Math.sin(r), y: -Math.cos(r) },
    right = { x: Math.cos(r), y: Math.sin(r) };
  const sp = s.spacing,
    mid = (n - 1) / 2;
  return {
    ...s,
    ships: s.ships.map((ship, i) => {
      const rank = mid - i,
        side = i - mid;
      let x: number, y: number;
      if (s.formation === "line-ahead") ((x = cx + fwd.x * rank * sp), (y = cy + fwd.y * rank * sp));
      else if (s.formation === "line-abreast")
        ((x = cx + right.x * side * sp), (y = cy + right.y * side * sp));
      else {
        const dir = s.formation === "echelon-stbd" ? 1 : -1;
        x = cx + dir * right.x * side * sp * 0.75 + fwd.x * rank * sp * 0.75;
        y = cy + dir * right.y * side * sp * 0.75 + fwd.y * rank * sp * 0.75;
      }
      return { ...ship, x: Math.round(clampX(x)), y: Math.round(clampY(y)), heading: s.heading };
    }),
  };
}
export const W = 1200,
  H = 900;
const clampX = (x: number) => Math.max(10, Math.min(W - 10, x));
const clampY = (y: number) => Math.max(10, Math.min(H - 10, y));

export function newSquadron(t: Tactics, side: Side): Squadron {
  const count = t.squadrons.filter((s) => s.side === side).length;
  const used = new Set(t.squadrons.map((s) => s.color));
  const color =
    side === "enemy" ? 5 : (SQUADRON_COLORS.findIndex((_, i) => i !== 5 && !used.has(i)) + 10) % 10;
  return {
    id: rid(),
    name:
      side === "friendly"
        ? (["Mainline", "Flank", "Siege", "Reserve"][count] ?? `Squadron ${count + 1}`)
        : `Enemy ${count + 1}`,
    side,
    color,
    formation: "line-ahead",
    heading: side === "friendly" ? 90 : 270,
    spacing: 46,
    ships: [],
  };
}
export function addShip(s: Squadron, type: ShipType): Squadron {
  const last = s.ships.at(-1);
  const r = s.heading * D2R;
  const start = last
    ? { x: last.x - Math.sin(r) * s.spacing, y: last.y + Math.cos(r) * s.spacing }
    : { x: s.side === "friendly" ? 300 : 900, y: 300 + (s.color % 4) * 80 };
  return {
    ...s,
    ships: [
      ...s.ships,
      { id: rid(), type, x: Math.round(clampX(start.x)), y: Math.round(clampY(start.y)), heading: s.heading },
    ],
  };
}
export function placeObject(
  t: Tactics,
  tool: TacticTool,
  x: number,
  y: number,
): { tactics: Tactics; selected: Selection } {
  x = Math.round(x);
  y = Math.round(y);
  if (tool === "cone") {
    // Snap an arc to a nearby ship so it inherits position and heading.
    let near: TShip | null = null,
      best = 30;
    for (const s of t.squadrons)
      for (const sh of s.ships) {
        const d = Math.hypot(sh.x - x, sh.y - y);
        if (d < best) ((best = d), (near = sh));
      }
    const c: Cone = {
      id: rid(),
      x: near?.x ?? x,
      y: near?.y ?? y,
      heading: near ? norm360(near.heading + 90) : 0,
      range: 160,
      width: 50,
    };
    return { tactics: { ...t, cones: [...t.cones, c] }, selected: { kind: "cone", id: c.id } };
  }
  if (tool === "zone") {
    const z: Zone = { id: rid(), x, y, radius: 80, label: "" };
    return { tactics: { ...t, zones: [...t.zones, z] }, selected: { kind: "zone", id: z.id } };
  }
  if (tool === "tower") {
    const number = (t.towers.reduce((m, x) => Math.max(m, x.number), 0) || 0) + 1;
    const tw: Tower = { id: rid(), x, y, number, label: "" };
    return { tactics: { ...t, towers: [...t.towers, tw] }, selected: { kind: "tower", id: tw.id } };
  }
  return { tactics: t, selected: null };
}

const HULL: Record<ShipType, { d: string; ring: number }> = {
  line: { d: "M0,-18 C7,-10 9,6 7,16 L-7,16 C-9,6 -7,-10 0,-18 Z", ring: 21 },
  siege: { d: "M0,-17 C9,-9 11,6 9,15 L-9,15 C-11,6 -9,-9 0,-17 Z", ring: 22 },
  skirmish: { d: "M0,-19 C5,-11 6,6 5,17 L-5,17 C-6,6 -5,-11 0,-19 Z", ring: 19 },
};

function arcPath(c: Cone) {
  const a0 = (c.heading - c.width / 2) * D2R,
    a1 = (c.heading + c.width / 2) * D2R;
  const p = (a: number) => `${c.x + Math.sin(a) * c.range},${c.y - Math.cos(a) * c.range}`;
  return `M${c.x},${c.y} L${p(a0)} A${c.range},${c.range} 0 ${c.width > 180 ? 1 : 0} 1 ${p(a1)} Z`;
}

/** SVG layer drawn inside the Prep map. Handles dragging when the Select tool is active. */
export function TacticsLayer({
  tactics,
  onTactics,
  selected,
  onSelect,
  svgRef,
  interactive,
}: {
  tactics: Tactics;
  onTactics: (t: Tactics) => void;
  selected: Selection;
  onSelect: (s: Selection) => void;
  svgRef: RefObject<SVGSVGElement | null>;
  interactive: boolean;
}) {
  const drag = useRef<{ sel: NonNullable<Selection>; dx: number; dy: number } | null>(null);
  const windDrag = useRef(false);
  const toLocal = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };
  const startDrag = (e: ReactPointerEvent, sel: NonNullable<Selection>, x: number, y: number) => {
    if (!interactive) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const p = toLocal(e);
    drag.current = { sel, dx: x - p.x, dy: y - p.y };
    onSelect(sel);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (windDrag.current) {
      const p = toLocal(e);
      const ang = Math.atan2(p.x - DIAL.x, -(p.y - DIAL.y)) / D2R;
      onTactics({ ...tactics, wind: Math.round(norm360(ang) / 5) * 5 });
      return;
    }
    const d = drag.current;
    if (!d) return;
    const p = toLocal(e),
      x = Math.round(clampX(p.x + d.dx)),
      y = Math.round(clampY(p.y + d.dy));
    if (d.sel.kind === "ship") {
      const sel = d.sel;
      onTactics({
        ...tactics,
        squadrons: tactics.squadrons.map((s) =>
          s.id === sel.squadronId
            ? { ...s, ships: s.ships.map((sh) => (sh.id === sel.id ? { ...sh, x, y } : sh)) }
            : s,
        ),
      });
    } else {
      const key = d.sel.kind === "cone" ? "cones" : d.sel.kind === "zone" ? "zones" : "towers";
      const id = d.sel.id;
      onTactics({
        ...tactics,
        [key]: (tactics[key] as any[]).map((o) => (o.id === id ? { ...o, x, y } : o)),
      });
    }
  };
  const endDrag = () => {
    drag.current = null;
    windDrag.current = false;
  };
  const isSel = (kind: string, id: string) => selected?.kind === kind && selected.id === id;
  const handlers = interactive
    ? { onPointerMove: onMove, onPointerUp: endDrag, onPointerCancel: endDrag }
    : {};
  const cursor = interactive ? "grab" : undefined;
  return (
    <g className="tacticsLayer" {...handlers} style={{ pointerEvents: interactive ? "auto" : "none" }}>
      {tactics.zones.map((z) => (
        <g
          key={z.id}
          onPointerDown={(e) => startDrag(e, { kind: "zone", id: z.id }, z.x, z.y)}
          style={{ cursor }}
        >
          <circle
            cx={z.x}
            cy={z.y}
            r={z.radius}
            fill="rgba(220,75,69,.16)"
            stroke={isSel("zone", z.id) ? "#fff" : "#dc4b45"}
            strokeWidth={isSel("zone", z.id) ? 3 : 2}
            strokeDasharray="10 7"
          />
          {z.label && (
            <text
              x={z.x}
              y={z.y + 6}
              textAnchor="middle"
              fill="#fff"
              stroke="#080909"
              strokeWidth="4"
              paintOrder="stroke"
              fontSize="17"
              fontWeight="700"
            >
              {z.label}
            </text>
          )}
        </g>
      ))}
      {tactics.cones.map((c) => (
        <path
          key={c.id}
          d={arcPath(c)}
          fill="rgba(225,191,67,.18)"
          stroke={isSel("cone", c.id) ? "#fff" : "#e1bf43"}
          strokeWidth={isSel("cone", c.id) ? 3 : 1.5}
          onPointerDown={(e) => startDrag(e, { kind: "cone", id: c.id }, c.x, c.y)}
          style={{ cursor }}
        />
      ))}
      {tactics.squadrons.map((s) => {
        const color = SQUADRON_COLORS[s.color % SQUADRON_COLORS.length];
        return (
          <g key={s.id}>
            {s.ships.length > 1 && (
              <polyline
                points={s.ships.map((sh) => `${sh.x},${sh.y}`).join(" ")}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeDasharray="4 6"
                opacity=".7"
              />
            )}
            {s.ships.map((sh, i) => {
              const tier = pointOfSail(sh.heading, tactics.wind);
              const hull = HULL[sh.type] ?? HULL.line;
              const sel = selected?.kind === "ship" && selected.id === sh.id;
              return (
                <g
                  key={sh.id}
                  transform={`translate(${sh.x} ${sh.y}) scale(1.4)`}
                  onPointerDown={(e) =>
                    startDrag(e, { kind: "ship", squadronId: s.id, id: sh.id }, sh.x, sh.y)
                  }
                  style={{ cursor }}
                >
                  <circle
                    r={hull.ring}
                    fill="none"
                    stroke={tier.color}
                    strokeWidth={sel ? 4 : 3}
                    opacity=".95"
                  />
                  {sel && (
                    <circle
                      r={hull.ring + 6}
                      fill="none"
                      stroke="#fff"
                      strokeWidth="1.5"
                      strokeDasharray="3 4"
                    />
                  )}
                  <g transform={`rotate(${sh.heading})`}>
                    <path
                      d={hull.d}
                      fill={color}
                      stroke={s.side === "enemy" ? "#2a0d0b" : "#081018"}
                      strokeWidth="2"
                    />
                    {sh.type === "siege" && (
                      <rect x="-4" y="-2" width="8" height="8" fill="#080909" opacity=".55" />
                    )}
                  </g>
                  <text
                    y={hull.ring + 13}
                    textAnchor="middle"
                    fill="#fff"
                    stroke="#080909"
                    strokeWidth="3"
                    paintOrder="stroke"
                    fontSize="11"
                    fontWeight="700"
                  >
                    {i === 0 ? s.name : ""}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
      {tactics.towers.map((t) => (
        <g
          key={t.id}
          transform={`translate(${t.x} ${t.y}) scale(1.3)`}
          onPointerDown={(e) => startDrag(e, { kind: "tower", id: t.id }, t.x, t.y)}
          style={{ cursor }}
        >
          <polygon
            points="0,-16 15,12 -15,12"
            fill="#2a2d33"
            stroke={isSel("tower", t.id) ? "#fff" : "#e1bf43"}
            strokeWidth="2.5"
          />
          <text y="9" textAnchor="middle" fill="#e1bf43" fontSize="13" fontWeight="800">
            {t.number}
          </text>
          {t.label && (
            <text
              y="30"
              textAnchor="middle"
              fill="#fff"
              stroke="#080909"
              strokeWidth="3"
              paintOrder="stroke"
              fontSize="12"
              fontWeight="700"
            >
              {t.label}
            </text>
          )}
        </g>
      ))}
      <WindDial
        wind={tactics.wind}
        onPointerDown={(e) => {
          if (!interactive) return;
          e.stopPropagation();
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          windDrag.current = true;
        }}
        interactive={interactive}
      />
    </g>
  );
}

const DIAL = { x: 86, y: 86, r: 60 };
/** Compass in the map corner: arrow shows where the wind blows; the ring shows the sailing bands. */
function WindDial({
  wind,
  onPointerDown,
  interactive,
}: {
  wind: number;
  onPointerDown: (e: ReactPointerEvent) => void;
  interactive: boolean;
}) {
  const from = norm360(wind + 180);
  const band = (t: (typeof TIERS)[number], sign: 1 | -1) => {
    const a0 = (from + sign * t.min) * D2R,
      a1 = (from + sign * Math.min(t.max, 180)) * D2R,
      r = DIAL.r;
    const p = (a: number) => `${DIAL.x + Math.sin(a) * r},${DIAL.y - Math.cos(a) * r}`;
    return `M${p(a0)} A${r},${r} 0 0 ${sign === 1 ? 1 : 0} ${p(a1)}`;
  };
  return (
    <g aria-label={`Wind from ${compassName(from)}`}>
      <circle cx={DIAL.x} cy={DIAL.y} r={DIAL.r + 12} fill="rgba(8,9,9,.72)" stroke="rgba(255,255,255,.18)" />
      {TIERS.map((t) => (
        <g key={t.key}>
          <path d={band(t, 1)} stroke={t.color} strokeWidth="7" fill="none" />
          <path d={band(t, -1)} stroke={t.color} strokeWidth="7" fill="none" />
        </g>
      ))}
      {["N", "E", "S", "W"].map((n, i) => (
        <text
          key={n}
          x={DIAL.x + Math.sin(i * 90 * D2R) * (DIAL.r - 14)}
          y={DIAL.y - Math.cos(i * 90 * D2R) * (DIAL.r - 14) + 4}
          textAnchor="middle"
          fill="#9aa2ae"
          fontSize="10"
          fontWeight="700"
        >
          {n}
        </text>
      ))}
      <g
        transform={`translate(${DIAL.x} ${DIAL.y}) rotate(${wind})`}
        onPointerDown={onPointerDown}
        style={{ cursor: interactive ? "grab" : undefined }}
      >
        <line
          x1="0"
          y1={DIAL.r - 22}
          x2="0"
          y2={-(DIAL.r - 22)}
          stroke="#f3f4f6"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <polygon points={`0,${-(DIAL.r - 12)} 9,${-(DIAL.r - 28)} -9,${-(DIAL.r - 28)}`} fill="#f3f4f6" />
        <circle r="18" fill="transparent" />
      </g>
      <text
        x={DIAL.x}
        y={DIAL.y + DIAL.r + 28}
        textAnchor="middle"
        fill="#f3f4f6"
        stroke="#080909"
        strokeWidth="3"
        paintOrder="stroke"
        fontSize="12"
        fontWeight="700"
      >
        Wind from {compassName(from)}
      </text>
    </g>
  );
}
