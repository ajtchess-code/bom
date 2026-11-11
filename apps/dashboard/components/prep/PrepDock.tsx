"use client";
// One tool palette for Prep. Drawing tools and tactics tools live side by side, so
// there is no mode to switch. In full screen the panel floats over the map as a
// dock that can be dragged anywhere and collapsed down to just the palette.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { TACTIC_TOOLS } from "./TacticsPanel";
import type { TacticTool } from "./Tactics";

export type DrawTool = "arrow" | "line" | "dots" | "ship" | "eraser";
export type PrepTool = DrawTool | TacticTool;
export const isTacticTool = (t: PrepTool): t is TacticTool => ["select", "cone", "zone", "tower"].includes(t);

const DRAW_TOOLS: [DrawTool, string, string][] = [
  ["arrow", "M3 13 13 3M6 3h7v7", "Arrow"],
  ["line", "M3 13 13 3", "Line"],
  ["dots", "M3 13h.01M6.5 9.5h.01M10 6h.01M13 3h.01", "Dotted path"],
  ["ship", "M2 11h12l-2 3H4zM8 2v8M8 3l4 5H8", "Marker"],
  ["eraser", "M6 14h8M3 10l6-6 4 4-6 6H5z", "Eraser"],
];
const KEYS: Record<string, PrepTool> = {
  v: "select",
  c: "cone",
  z: "zone",
  t: "tower",
  a: "arrow",
  l: "line",
  d: "dots",
  m: "ship",
  e: "eraser",
};
const KEY_OF = Object.fromEntries(Object.entries(KEYS).map(([k, v]) => [v, k.toUpperCase()]));

export const TOOL_HINTS: Record<PrepTool, string> = {
  select: "Drag ships, objects and the wind arrow. Click something to edit it.",
  cone: "Click a ship (or anywhere) to add a firing arc.",
  zone: "Click the map to mark a denial zone.",
  tower: "Click the map to place the next numbered tower.",
  arrow: "Drag on the map to draw an arrow.",
  line: "Drag on the map to draw a line.",
  dots: "Drag on the map to draw a dotted path.",
  ship: "Click the map to drop a labelled marker.",
  eraser: "Click a drawing to remove it.",
};

function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Every Prep tool in one palette, with keyboard shortcuts. */
export function PrepPalette({
  tool,
  onTool,
  onUndo,
  canUndo,
}: {
  tool: PrepTool;
  onTool: (t: PrepTool) => void;
  onUndo: () => void;
  canUndo: boolean;
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable=true]")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        if (canUndo) {
          e.preventDefault();
          onUndo();
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = KEYS[e.key.toLowerCase()];
      if (t) onTool(t);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onTool, onUndo, canUndo]);
  const group = (label: string, items: [PrepTool, string, string][]) => (
    <div className="psGroup" role="group" aria-label={label}>
      <span className="psGroupLabel">{label}</span>
      <div>
        {items.map(([t, d, name]) => (
          <button
            key={t}
            type="button"
            className={tool === t ? "active" : ""}
            aria-pressed={tool === t}
            title={`${name} (${KEY_OF[t]})`}
            onClick={() => onTool(t)}
          >
            <Glyph d={d} />
            <span>{name}</span>
            <kbd>{KEY_OF[t]}</kbd>
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <div className="psPalette">
      {group(
        "Plan",
        TACTIC_TOOLS.map(([t, d, l]) => [t, d, l === "Move" ? "Move" : l]),
      )}
      {group("Draw", DRAW_TOOLS)}
      <p className="psHint" role="status">
        {TOOL_HINTS[tool]}
      </p>
      <button
        type="button"
        className="psUndo"
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo last drawing (Ctrl+Z)"
      >
        ↶ Undo drawing
      </button>
    </div>
  );
}

type Pos = { x: number; y: number };
const STORE = "bom:prep-dock";
function load(): { pos: Pos | null; collapsed: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) || "{}");
    return {
      pos: Number.isFinite(v?.pos?.x) && Number.isFinite(v?.pos?.y) ? v.pos : null,
      collapsed: !!v?.collapsed,
    };
  } catch {
    return { pos: null, collapsed: false };
  }
}
function persist(v: { pos: Pos | null; collapsed: boolean }) {
  try {
    localStorage.setItem(STORE, JSON.stringify(v));
  } catch {}
}

/**
 * Holds the palette and settings. Docked beside the map normally; in full screen
 * it floats and can be dragged by its handle, collapsed, or snapped back.
 */
export function PrepDock({
  floating,
  palette,
  children,
}: {
  floating: boolean;
  palette: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [pos, setPos] = useState<Pos | null>(null),
    [collapsed, setCollapsed] = useState(false);
  const drag = useRef<{ dx: number; dy: number; id: number } | null>(null);
  useEffect(() => {
    const v = load();
    setPos(v.pos);
    setCollapsed(v.collapsed);
  }, []);
  const clamp = (p: Pos): Pos => {
    const el = ref.current,
      w = el?.offsetWidth ?? 320,
      h = el?.offsetHeight ?? 200;
    return {
      x: Math.max(8, Math.min(window.innerWidth - Math.min(w, 120), p.x)),
      y: Math.max(8, Math.min(window.innerHeight - Math.min(h, 48), p.y)),
    };
  };
  // Keep the dock on screen when the window shrinks.
  useEffect(() => {
    if (!floating) return;
    const fit = () => setPos((p) => (p ? clamp(p) : p));
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [floating]);
  const start = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!floating || e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    const r = ref.current!.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setPos(clamp({ x: e.clientX - d.dx, y: e.clientY - d.dy }));
  };
  const end = () => {
    if (!drag.current) return;
    drag.current = null;
    setPos((p) => {
      persist({ pos: p, collapsed });
      return p;
    });
  };
  const nudge = (dx: number, dy: number) => {
    const r = ref.current!.getBoundingClientRect();
    const p = clamp({ x: (pos?.x ?? r.left) + dx, y: (pos?.y ?? r.top) + dy });
    setPos(p);
    persist({ pos: p, collapsed });
  };
  const toggle = () => {
    const c = !collapsed;
    setCollapsed(c);
    persist({ pos, collapsed: c });
  };
  const reset = () => {
    setPos(null);
    persist({ pos: null, collapsed });
  };
  const style =
    floating && pos
      ? {
          left: pos.x,
          top: pos.y,
          right: "auto",
          bottom: "auto",
          maxHeight: `calc(100dvh - ${Math.round(pos.y) + 12}px)`,
        }
      : undefined;
  return (
    <aside
      ref={ref}
      className={`psDock ${floating ? "floating" : ""} ${floating && collapsed ? "collapsed" : ""}`}
      style={style}
      aria-label="Prep tools"
    >
      <div
        className="psDockHead"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        tabIndex={floating ? 0 : -1}
        aria-label={floating ? "Tools dock. Drag, or use the arrow keys, to move it." : undefined}
        onKeyDown={(e) => {
          if (!floating) return;
          const step = e.shiftKey ? 60 : 20;
          const map: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
          };
          if (map[e.key]) {
            e.preventDefault();
            nudge(...map[e.key]);
          }
        }}
      >
        {floating && (
          <span className="psGrip" aria-hidden="true">
            ⠿
          </span>
        )}
        <b>Tools</b>
        {floating && (
          <span className="psDockActions">
            <button
              type="button"
              onClick={reset}
              title="Put the dock back in the corner"
              aria-label="Reset dock position"
            >
              ↘
            </button>
            <button
              type="button"
              onClick={toggle}
              aria-expanded={!collapsed}
              title={collapsed ? "Show settings" : "Palette only"}
              aria-label={collapsed ? "Show settings" : "Palette only"}
            >
              {collapsed ? "▾" : "▴"}
            </button>
          </span>
        )}
      </div>
      {palette}
      {!(floating && collapsed) && <div className="psDockBody">{children}</div>}
    </aside>
  );
}
