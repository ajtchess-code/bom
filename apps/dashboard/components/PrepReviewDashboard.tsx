"use client";
import ReviewBookmarks from "./ReviewBookmarks";

import { useSearchParams } from "next/navigation";
import { PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import CommandIcon from "./CommandIcon";
import { useWorkspaceFullscreen, requestWorkspaceFullscreen } from "./useWorkspaceFullscreen";
import {
  TacticsLayer,
  placeObject,
  readTactics,
  type Selection,
  type TacticTool,
  type Tactics,
} from "./prep/Tactics";
import TacticsPanel from "./prep/TacticsPanel";
import { PrepDock, PrepPalette, isTacticTool, type PrepTool } from "./prep/PrepDock";

type Kind = "PREP" | "REVIEW";
type Tool = "arrow" | "line" | "dots" | "ship" | "eraser";
type Point = [number, number];
type Shape = {
  id: string;
  tool: Exclude<Tool, "eraser">;
  points: Point[];
  color: string;
  width: number;
  label: string;
  layer: string;
};
type Port = {
  name: string;
  rate: string;
  size: number;
  mapFile: string | null;
  mapUrl: string | null;
  archivedMap: boolean;
};
type SessionSummary = {
  id: string;
  kind: Kind;
  title: string;
  port_name: string;
  map_key: string | null;
  video_url: string | null;
  version: number;
  updated_at: string;
};
type Session = {
  id: string;
  kind: Kind;
  title: string;
  port_name: string;
  map_key: string | null;
  video_url: string | null;
  version: number;
  drawing: Shape[];
  map_drawing: Shape[];
  view_state: Record<string, unknown>;
  updated_at: string;
};
type Props = { initialKind?: Kind; initialPorts: Port[]; initialSessions: SessionSummary[] };
type ToolState = { tool: Tool; color: string; width: number; label: string; layer: string };

const LABELS = ["Mainline", "Flank", "Siege", "Heavy", "Friend", "Foe", "Ally", "Edge"];
const LAYERS = ["Main", "Flank", "Siege", "Enemy", "Notes"];
const COLORS = ["#dc4b45", "#53b96e", "#e1bf43", "#f1f2ee", "#4f8edb", "rainbow"];
const defaultTools: ToolState = {
  tool: "arrow",
  color: "#53b96e",
  width: 4,
  label: "Mainline",
  layer: "Main",
};

async function api(path: string, init: RequestInit = {}) {
  const h = new Headers(init.headers);
  if (init.body && !h.has("content-type")) h.set("content-type", "application/json");
  const r = await fetch(`/api/internal/prep-review${path}`, { ...init, headers: h, cache: "no-store" });
  const text = await r.text();
  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: text };
  }
  if (!r.ok) {
    const e = new Error(body?.error ?? body?.message ?? `Request failed (${r.status})`) as Error & {
      status?: number;
      body?: any;
    };
    e.status = r.status;
    e.body = body;
    throw e;
  }
  return body;
}
const rid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const fmtDate = (v: string) => new Date(v).toLocaleString();
const isYoutube = (url: string) => /youtu\.be|youtube\.com/i.test(url);
function youtubeId(url: string) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("/")[0] || null;
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    const m = u.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

function rainbow(id: string) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#e04f50" />
      <stop offset=".2" stopColor="#e1bf43" />
      <stop offset=".4" stopColor="#53b96e" />
      <stop offset=".6" stopColor="#4f8edb" />
      <stop offset=".8" stopColor="#9a68d8" />
      <stop offset="1" stopColor="#e05ea5" />
    </linearGradient>
  );
}
function ShapeMarks({ shapes, hiddenLayers }: { shapes: Shape[]; hiddenLayers: Set<string> }) {
  return (
    <>
      {shapes
        .filter((s) => !hiddenLayers.has(s.layer))
        .map((s) => {
          const pts = s.points;
          if (!pts.length) return null;
          const stroke = s.color === "rainbow" ? `url(#rainbow-${s.id})` : s.color;
          const points = pts.map((p) => p.join(",")).join(" ");
          const mid = pts[Math.floor(pts.length / 2)] ?? pts[0];
          const last = pts[pts.length - 1],
            prev = pts[Math.max(0, pts.length - 2)];
          let arrow: Point[] = [];
          if (s.tool === "arrow" && last && prev) {
            const a = Math.atan2(last[1] - prev[1], last[0] - prev[0]),
              len = 14 + s.width * 2;
            arrow = [
              [last[0], last[1]],
              [last[0] - len * Math.cos(a - 0.45), last[1] - len * Math.sin(a - 0.45)],
              [last[0] - len * Math.cos(a + 0.45), last[1] - len * Math.sin(a + 0.45)],
            ];
          }
          return (
            <g key={s.id}>
              {rainbow(`rainbow-${s.id}`)}
              {s.tool === "dots" ? (
                pts.map((p, i) => (
                  <circle key={i} cx={p[0]} cy={p[1]} r={Math.max(3, s.width)} fill={stroke} />
                ))
              ) : s.tool === "ship" ? (
                <g transform={`translate(${pts[0][0]} ${pts[0][1]})`}>
                  <path d="M -18 12 L 0 -18 L 18 12 L 0 7 Z" fill={stroke} stroke="#080909" strokeWidth="2" />
                  <line
                    x1="0"
                    y1="-12"
                    x2="0"
                    y2="16"
                    stroke={stroke}
                    strokeWidth={Math.max(2, s.width / 2)}
                  />
                </g>
              ) : (
                <>
                  <polyline
                    points={points}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={s.width}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {arrow.length > 0 && (
                    <polygon points={arrow.map((p) => p.join(",")).join(" ")} fill={stroke} />
                  )}
                </>
              )}
              {s.label && s.tool !== "ship" && (
                <text
                  x={mid[0]}
                  y={mid[1] - 10}
                  fill={stroke}
                  stroke="#080909"
                  strokeWidth="4"
                  paintOrder="stroke"
                  fontSize="18"
                  fontWeight="700"
                >
                  {s.label}
                </text>
              )}
              {s.tool === "ship" && s.label && (
                <text
                  x={pts[0][0] + 22}
                  y={pts[0][1] + 5}
                  fill={stroke}
                  stroke="#080909"
                  strokeWidth="4"
                  paintOrder="stroke"
                  fontSize="17"
                  fontWeight="700"
                >
                  {s.label}
                </text>
              )}
            </g>
          );
        })}
    </>
  );
}

function DrawingToolbar({
  state,
  onState,
  shapes,
  onShapes,
  hiddenLayers,
  onHiddenLayers,
  pen = false,
}: {
  pen?: boolean;
  state: ToolState;
  onState: (v: ToolState) => void;
  shapes: Shape[];
  onShapes: (v: Shape[]) => void;
  hiddenLayers: Set<string>;
  onHiddenLayers: (v: Set<string>) => void;
}) {
  const set = <K extends keyof ToolState>(key: K, value: ToolState[K]) => onState({ ...state, [key]: value });
  return (
    <div className={pen ? "prToolbar psPen" : "prToolbar"}>
      {!pen && (
        <div className="prToolGroup" aria-label="Drawing tools">
          {(["arrow", "line", "dots", "ship", "eraser"] as Tool[]).map((t) => (
            <button
              key={t}
              type="button"
              className={state.tool === t ? "active" : ""}
              onClick={() => set("tool", t)}
            >
              {t === "arrow" ? "↗" : t === "line" ? "╱" : t === "dots" ? "•••" : t === "ship" ? "⛵" : "⌫"}
              <span>{t}</span>
            </button>
          ))}
        </div>
      )}
      <label>
        Label
        <select value={state.label} onChange={(e) => set("label", e.target.value)}>
          {LABELS.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <label>
        Layer
        <select value={state.layer} onChange={(e) => set("layer", e.target.value)}>
          {LAYERS.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <label>
        Width
        <select value={state.width} onChange={(e) => set("width", Number(e.target.value))}>
          {[2, 4, 6, 9, 13].map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </label>
      <div className="prColors">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={state.color === c ? "active" : ""}
            aria-label={c}
            onClick={() => set("color", c)}
            style={c === "rainbow" ? undefined : { background: c }}
          >
            {c === "rainbow" ? "🌈" : ""}
          </button>
        ))}
      </div>
      {!pen && (
        <button type="button" onClick={() => onShapes(shapes.slice(0, -1))} disabled={!shapes.length}>
          Undo
        </button>
      )}
      <button
        type="button"
        className="dangerGhost"
        onClick={() => {
          if (shapes.length && confirm("Clear all annotations on this surface?")) onShapes([]);
        }}
        disabled={!shapes.length}
      >
        {pen ? "Clear drawings" : "Reset"}
      </button>
      <div className="prLayers">
        {LAYERS.map((layer) => (
          <button
            key={layer}
            type="button"
            className={hiddenLayers.has(layer) ? "muted" : ""}
            onClick={() => {
              const n = new Set(hiddenLayers);
              n.has(layer) ? n.delete(layer) : n.add(layer);
              onHiddenLayers(n);
            }}
          >
            {hiddenLayers.has(layer) ? "○" : "●"} {layer}
          </button>
        ))}
      </div>
    </div>
  );
}

function AnnotationSurface({
  background,
  missing,
  shapes,
  onShapes,
  tools,
  hiddenLayers,
  className = "",
  tactics,
}: {
  tactics?: {
    data: Tactics;
    onChange: (t: Tactics) => void;
    active: boolean;
    tool: TacticTool;
    selected: Selection;
    onSelect: (s: Selection) => void;
  };
  background?: string | null;
  missing?: string;
  shapes: Shape[];
  onShapes: (v: Shape[]) => void;
  tools: ToolState;
  hiddenLayers: Set<string>;
  className?: string;
}) {
  const [draft, setDraft] = useState<Point[]>([]);
  const [zoom, setZoom] = useState(1);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const W = 1200,
    H = 900;
  const point = (e: ReactPointerEvent<SVGSVGElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(W, ((e.clientX - r.left) / r.width) * W)),
      Math.max(0, Math.min(H, ((e.clientY - r.top) / r.height) * H)),
    ];
  };
  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const p = point(e);
    if (tactics?.active) {
      // Ships and objects stop propagation when grabbed, so this is a click on open water.
      if (tactics.tool === "select") tactics.onSelect(null);
      else {
        const r = placeObject(tactics.data, tactics.tool, p[0], p[1]);
        tactics.onChange(r.tactics);
        tactics.onSelect(r.selected);
      }
      return;
    }
    if (tools.tool === "eraser") {
      let best = -1,
        dist = 42;
      shapes.forEach((s, i) =>
        s.points.forEach((q) => {
          const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
          if (d < dist) {
            dist = d;
            best = i;
          }
        }),
      );
      if (best >= 0) onShapes(shapes.filter((_, i) => i !== best));
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraft([p]);
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!draft.length || tools.tool === "eraser") return;
    const p = point(e),
      last = draft[draft.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 5) setDraft((v) => [...v, p]);
  };
  const up = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!draft.length || tools.tool === "eraser") return;
    let pts = [...draft];
    const p = point(e);
    if (!pts.length || Math.hypot(p[0] - pts[pts.length - 1][0], p[1] - pts[pts.length - 1][1]) > 2)
      pts.push(p);
    if (tools.tool === "ship") pts = [pts[0]];
    if (pts.length === 1 && tools.tool !== "ship") pts.push([pts[0][0] + 1, pts[0][1] + 1]);
    onShapes([
      ...shapes,
      {
        id: rid(),
        tool: tools.tool as Exclude<Tool, "eraser">,
        points: pts,
        color: tools.color,
        width: tools.width,
        label: tools.label,
        layer: tools.layer,
      },
    ]);
    setDraft([]);
  };
  const preview = draft.length
    ? [
        {
          id: "draft",
          tool: (tools.tool === "eraser" ? "line" : tools.tool) as Exclude<Tool, "eraser">,
          points: draft,
          color: tools.color,
          width: tools.width,
          label: tools.label,
          layer: tools.layer,
        },
      ]
    : [];
  return (
    <div ref={shellRef} className={`prCanvasShell ${className}`}>
      <div className="prZoom">
        <button type="button" onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}>
          −
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}>
          +
        </button>
        <button type="button" onClick={() => setZoom(1)}>
          Fit
        </button>
        <button
          type="button"
          aria-label="Toggle workspace full screen"
          title="Full screen with tools"
          onClick={() => requestWorkspaceFullscreen(shellRef.current)}
        >
          ⛶
        </button>
      </div>
      <div className="prCanvasScroller">
        <div className="prCanvasScaled" style={{ width: `${zoom * 100}%` }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label="Tactical drawing surface"
            className={tactics?.active ? `tcSurface tcTool-${tactics.tool}` : undefined}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => setDraft([])}
          >
            {background ? (
              <image href={background} x="0" y="0" width={W} height={H} preserveAspectRatio="xMidYMid meet" />
            ) : (
              <>
                <defs>
                  <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                    <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#3f443f" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width={W} height={H} fill="#121615" />
                <rect width={W} height={H} fill="url(#grid)" />
                <circle
                  cx={W / 2}
                  cy={H / 2}
                  r="170"
                  fill="none"
                  stroke="#8d7a46"
                  strokeWidth="2"
                  strokeDasharray="8 12"
                />
                <line x1={W / 2} x2={W / 2} y1="80" y2={H - 80} stroke="#565e58" strokeWidth="2" />
                <line x1="80" x2={W - 80} y1={H / 2} y2={H / 2} stroke="#565e58" strokeWidth="2" />
                <text
                  x={W / 2}
                  y={H / 2 - 22}
                  textAnchor="middle"
                  fill="#d7a92f"
                  fontSize="34"
                  fontWeight="700"
                >
                  {missing ?? "TACTICAL GRID"}
                </text>
                <text x={W / 2} y={H / 2 + 24} textAnchor="middle" fill="#88908a" fontSize="18">
                  Archived tactical map not present in the legacy source
                </text>
              </>
            )}
            <ShapeMarks shapes={shapes} hiddenLayers={hiddenLayers} />
            <ShapeMarks shapes={preview} hiddenLayers={new Set()} />
            {tactics && (
              <TacticsLayer
                tactics={tactics.data}
                onTactics={tactics.onChange}
                selected={tactics.selected}
                onSelect={tactics.onSelect}
                svgRef={svgRef}
                interactive={tactics.active && tactics.tool === "select"}
              />
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}

function VideoSurface({
  url,
  shapes,
  onShapes,
  tools,
  hiddenLayers,
}: {
  url: string;
  shapes: Shape[];
  onShapes: (v: Shape[]) => void;
  tools: ToolState;
  hiddenLayers: Set<string>;
}) {
  const native = Boolean(url) && !isYoutube(url);
  const videoRef = useRef<HTMLVideoElement | null>(null),
    stageRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<Point[]>([]),
    [step, setStep] = useState(5),
    [time, setTime] = useState(0),
    [duration, setDuration] = useState(0),
    [paused, setPaused] = useState(true),
    [annotating, setAnnotating] = useState(true);
  const W = 1200,
    H = 675;
  const yid = youtubeId(url);
  const point = (e: ReactPointerEvent<SVGSVGElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    const p = point(e);
    if (tools.tool === "eraser") {
      let best = -1,
        d = 38;
      shapes.forEach((s, i) =>
        s.points.forEach((q) => {
          const n = Math.hypot(q[0] - p[0], q[1] - p[1]);
          if (n < d) {
            d = n;
            best = i;
          }
        }),
      );
      if (best >= 0) onShapes(shapes.filter((_, i) => i !== best));
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraft([p]);
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!draft.length) return;
    const p = point(e),
      q = draft[draft.length - 1];
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 5) setDraft((v) => [...v, p]);
  };
  const up = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!draft.length) return;
    let pts = [...draft, point(e)];
    if (tools.tool === "ship") pts = [pts[0]];
    onShapes([
      ...shapes,
      {
        id: rid(),
        tool: tools.tool as Exclude<Tool, "eraser">,
        points: pts,
        color: tools.color,
        width: tools.width,
        label: tools.label,
        layer: tools.layer,
      },
    ]);
    setDraft([]);
  };
  const seek = (delta: number) => {
    if (videoRef.current)
      videoRef.current.currentTime = Math.max(
        0,
        Math.min(videoRef.current.duration || Infinity, videoRef.current.currentTime + delta),
      );
  };
  return (
    <div className="prVideoBlock">
      <div ref={stageRef} className="prVideoStage">
        {native ? (
          <video
            ref={videoRef}
            src={url}
            preload="metadata"
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
          />
        ) : yid ? (
          <iframe
            src={`https://www.youtube.com/embed/${yid}?enablejsapi=1&rel=0`}
            title="Review video"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="prVideoEmpty">
            <CommandIcon name="activity" size={44} />
            <b>Add a direct MP4/WebM or YouTube URL</b>
            <span>The review canvas stays available once a VOD is loaded.</span>
          </div>
        )}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="prVideoOverlay"
          style={{ pointerEvents: annotating ? "auto" : "none" }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => setDraft([])}
        >
          <ShapeMarks shapes={shapes} hiddenLayers={hiddenLayers} />
          {draft.length > 0 && (
            <ShapeMarks
              shapes={[
                {
                  id: "draft",
                  tool: (tools.tool === "eraser" ? "line" : tools.tool) as Exclude<Tool, "eraser">,
                  points: draft,
                  color: tools.color,
                  width: tools.width,
                  label: tools.label,
                  layer: tools.layer,
                },
              ]}
              hiddenLayers={new Set()}
            />
          )}
        </svg>
        <div className="prVideoMode">
          <button
            type="button"
            className={annotating ? "active" : ""}
            onClick={() => setAnnotating((v) => !v)}
          >
            {annotating ? "Drawing on" : "Interact with video"}
          </button>
          <button type="button" onClick={() => requestWorkspaceFullscreen(stageRef.current)}>
            ⛶ Fullscreen
          </button>
        </div>
      </div>
      {native && (
        <div className="prPlayback">
          <button
            type="button"
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              v.paused ? void v.play() : v.pause();
            }}
          >
            {paused ? "▶ Play" : "Ⅱ Pause"}
          </button>
          <button type="button" onClick={() => seek(-step)}>
            −{step}s
          </button>
          <select value={step} onChange={(e) => setStep(Number(e.target.value))}>
            {[1, 2, 3, 5, 10].map((x) => (
              <option key={x} value={x}>
                {x}s step
              </option>
            ))}
          </select>
          <button type="button" onClick={() => seek(step)}>
            +{step}s
          </button>
          <input
            aria-label="VOD position"
            type="range"
            min="0"
            max={Math.max(duration, 1)}
            step="0.05"
            value={Math.min(time, Math.max(duration, 1))}
            onChange={(e) => {
              const v = videoRef.current,
                n = Number(e.target.value);
              if (v) v.currentTime = n;
              setTime(n);
            }}
          />
          <span>
            {Math.floor(time / 60)}:{String(Math.floor(time % 60)).padStart(2, "0")} /{" "}
            {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, "0")}
          </span>
        </div>
      )}
      {yid && (
        <div className="prPlayback">
          <button type="button" onClick={() => setAnnotating((v) => !v)}>
            {annotating ? "Switch to YouTube controls" : "Return to drawing"}
          </button>
          <small>Switch out of drawing mode whenever you need the YouTube player controls.</small>
        </div>
      )}
    </div>
  );
}

export default function PrepReviewDashboard({ initialPorts, initialSessions, initialKind = "PREP" }: Props) {
  const workspace = useWorkspaceFullscreen();
  const [ports] = useState(initialPorts),
    [sessions, setSessions] = useState(initialSessions),
    [kind, setKind] = useState<Kind>(initialKind),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [session, setSession] = useState<Session | null>(null),
    [tools, setTools] = useState<ToolState>(defaultTools),
    [hiddenLayers, setHiddenLayers] = useState<Set<string>>(new Set()),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [newPort, setNewPort] = useState(initialPorts[0]?.name ?? "Aruba"),
    [newTitle, setNewTitle] = useState(""),
    [videoDraft, setVideoDraft] = useState(""),
    [prepMode, setPrepMode] = useState<"draw" | "tactics">("tactics"),
    [tacticTool, setTacticTool] = useState<TacticTool>("select"),
    [tacticSel, setTacticSel] = useState<Selection>(null),
    [activeSquadron, setActiveSquadron] = useState<string | null>(null);
  const pickTool = (t: PrepTool) => {
    if (isTacticTool(t)) {
      setTacticTool(t);
      setPrepMode("tactics");
    } else {
      setTools((v) => ({ ...v, tool: t }));
      setPrepMode("draw");
      setTacticSel(null);
    }
  };
  const routeParams = useSearchParams();
  const visibleSessions = useMemo(() => sessions.filter((s) => s.kind === kind), [sessions, kind]);
  const port =
    ports.find((p) => p.name === session?.port_name) ?? ports.find((p) => p.name === newPort) ?? ports[0];
  async function refresh() {
    const b = await api("/bootstrap");
    setSessions(b.sessions ?? []);
  }
  useEffect(() => {
    const id = routeParams.get("session");
    if (id) void open(id);
  }, [routeParams]);
  async function create() {
    setBusy(true);
    setNotice("");
    try {
      const r: Session = await api("/sessions", {
        method: "POST",
        body: JSON.stringify({
          kind,
          portName: newPort,
          title: newTitle,
          videoUrl: kind === "REVIEW" ? videoDraft : null,
        }),
      });
      setSession(r);
      setSelectedId(r.id);
      setNewTitle("");
      await refresh();
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function open(id: string) {
    setBusy(true);
    setNotice("");
    try {
      const r: Session = await api(`/sessions/${id}`);
      setSession(r);
      setTacticSel(null);
      setActiveSquadron(null);
      setSelectedId(id);
      setKind(r.kind);
      setVideoDraft(r.video_url ?? "");
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!session) return;
    setBusy(true);
    setNotice("");
    try {
      const r: Session = await api(`/sessions/${session.id}`, {
        method: "PUT",
        body: JSON.stringify({
          version: session.version,
          kind: session.kind,
          title: session.title,
          portName: session.port_name,
          videoUrl: session.video_url,
          drawing: session.drawing,
          mapDrawing: session.map_drawing,
          viewState: session.view_state,
        }),
      });
      setSession(r);
      setNotice("Saved revision " + r.version + ".");
      await refresh();
    } catch (e: any) {
      if (e.status === 409 && e.body?.current) {
        setSession(e.body.current);
        setNotice(
          "A newer edit was saved first. I loaded the latest version; re-apply your change and save again.",
        );
      } else setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!session || !confirm(`Delete ${session.title}?`)) return;
    setBusy(true);
    try {
      await api(`/sessions/${session.id}`, { method: "DELETE" });
      setSession(null);
      setSelectedId(null);
      setNotice("Workspace deleted.");
      await refresh();
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  function switchKind(k: Kind) {
    setKind(k);
    setSession(null);
    setSelectedId(null);
    setNotice("");
  }
  function updateSession(patch: Partial<Session>) {
    setSession((s) => (s ? { ...s, ...patch } : s));
  }
  const mapUrl = port?.mapUrl ?? null;
  const tactics = useMemo(() => readTactics(session?.view_state?.tactics), [session?.view_state]);
  const setTactics = (t: Tactics) =>
    setSession((s) => (s ? { ...s, view_state: { ...s.view_state, tactics: t } } : s));
  return (
    <div
      ref={workspace.ref}
      className={`prepReviewExperience prWorkspaceRoot ${workspace.fullscreen ? "prWorkspaceFullscreen" : ""}`}
    >
      <header className="prHero">
        <div>
          <span className="eyebrow">TACTICAL WORKSPACE</span>
          <h1>{kind === "PREP" ? "Battle Prep" : "Battle Review"}</h1>
          <p>Plan the Battle. Review the Fight.</p>
        </div>
      </header>
      {notice && (
        <div className="notice" onClick={() => setNotice("")}>
          {notice}
        </div>
      )}
      <div className="prLayout">
        <aside className="prSidebar panel">
          <div className="panelHead">
            <div>
              <span className="cardKicker">{kind}</span>
              <h3>Workspaces</h3>
            </div>
          </div>
          <div className="prCreate">
            <label>
              Port
              <select value={newPort} onChange={(e) => setNewPort(e.target.value)}>
                {ports.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} · {p.rate} · {p.size}v{p.size}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Name
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={`${kind === "PREP" ? "Plan" : "Review"} name`}
              />
            </label>
            {kind === "REVIEW" && (
              <label>
                VOD URL
                <input
                  value={videoDraft}
                  onChange={(e) => setVideoDraft(e.target.value)}
                  placeholder="https://…mp4 or YouTube"
                />
              </label>
            )}
            <button className="goldButton" onClick={() => void create()} disabled={busy}>
              New {kind === "PREP" ? "prep" : "review"}
            </button>
          </div>
          <div className="prSessionList">
            {visibleSessions.map((s) => (
              <button
                key={s.id}
                className={selectedId === s.id ? "active" : ""}
                onClick={() => void open(s.id)}
              >
                <span>
                  <b>{s.title}</b>
                  <small>
                    {s.port_name} · v{s.version}
                  </small>
                </span>
                <time>{fmtDate(s.updated_at)}</time>
              </button>
            ))}
            {!visibleSessions.length && (
              <div className="emptyState">No saved {kind.toLowerCase()} workspaces yet.</div>
            )}
          </div>
        </aside>
        <main className="prMain">
          {!session ? (
            <section className="panel prWelcome">
              <CommandIcon name={kind === "PREP" ? "activity" : "sentinel"} size={52} />
              <h2>{kind === "PREP" ? "Create or open a battle plan" : "Create or open a VOD review"}</h2>
              <p>
                {kind === "PREP"
                  ? "Choose a port and start drawing routes, formations, ship markers and tactical labels."
                  : "Load a VOD, draw directly over the action, and optionally keep the port map alongside it for tactical reconstruction."}
              </p>
            </section>
          ) : (
            <>
              <section className="panel prSessionHead">
                <div>
                  <span className="cardKicker">
                    {session.kind} · REVISION {session.version}
                  </span>
                  <input
                    className="prTitle"
                    value={session.title}
                    onChange={(e) => updateSession({ title: e.target.value })}
                  />
                  <div className="prMeta">
                    <label>
                      Port
                      <select
                        value={session.port_name}
                        onChange={(e) =>
                          updateSession({
                            port_name: e.target.value,
                            map_key: ports.find((p) => p.name === e.target.value)?.mapFile ?? null,
                          })
                        }
                      >
                        {ports.map((p) => (
                          <option key={p.name}>{p.name}</option>
                        ))}
                      </select>
                    </label>
                    <span>
                      {port?.rate} · {port?.size}v{port?.size}
                    </span>
                    <span className={port?.archivedMap ? "mapAvailable" : "mapMissing"}>
                      {port?.archivedMap ? "Tactical map loaded" : "Neutral planning grid"}
                    </span>
                  </div>
                </div>
                <div className="prSessionActions">
                  <button
                    type="button"
                    className="outlineButton"
                    onClick={() => void workspace.toggle()}
                    aria-pressed={workspace.fullscreen}
                  >
                    {workspace.fullscreen ? "Exit fullscreen" : "Fullscreen"}
                  </button>
                  <button className="outlineButton" onClick={() => void save()} disabled={busy}>
                    {busy ? "Saving…" : "Save revision"}
                  </button>
                  <button className="dangerGhost" onClick={() => void remove()}>
                    Delete
                  </button>
                </div>
              </section>
              {session.kind === "PREP" ? (
                <section className="panel prToolPanel">
                  <div className={`psStudio ${workspace.fullscreen ? "psFull" : ""}`}>
                    <div className="psStage">
                      <AnnotationSurface
                        background={mapUrl}
                        missing={port?.name}
                        shapes={session.drawing}
                        onShapes={(v) => updateSession({ drawing: v })}
                        tools={tools}
                        hiddenLayers={hiddenLayers}
                        tactics={{
                          data: tactics,
                          onChange: setTactics,
                          active: prepMode === "tactics",
                          tool: tacticTool,
                          selected: tacticSel,
                          onSelect: setTacticSel,
                        }}
                      />
                    </div>
                    <PrepDock
                      floating={workspace.fullscreen}
                      palette={
                        <PrepPalette
                          tool={prepMode === "tactics" ? tacticTool : tools.tool}
                          onTool={pickTool}
                          canUndo={session.drawing.length > 0}
                          onUndo={() => updateSession({ drawing: session.drawing.slice(0, -1) })}
                        />
                      }
                    >
                      <details className="psSection" open>
                        <summary>Pen &amp; layers</summary>
                        <DrawingToolbar
                          pen
                          state={tools}
                          onState={setTools}
                          shapes={session.drawing}
                          onShapes={(v) => updateSession({ drawing: v })}
                          hiddenLayers={hiddenLayers}
                          onHiddenLayers={setHiddenLayers}
                        />
                      </details>
                      <TacticsPanel
                        showTools={false}
                        tactics={tactics}
                        onTactics={setTactics}
                        tool={tacticTool}
                        onTool={setTacticTool}
                        selected={tacticSel}
                        onSelect={setTacticSel}
                        activeSquadron={activeSquadron}
                        onActiveSquadron={setActiveSquadron}
                      />
                    </PrepDock>
                  </div>
                  <div className="prMapFoot">
                    <span>{port?.name}</span>
                    <small>
                      {port?.archivedMap
                        ? "Tactical map ready for planning and annotations."
                        : "No tactical map image is available for this port, so a neutral planning grid is shown instead."}
                    </small>
                  </div>
                </section>
              ) : (
                <section className="prReviewGrid">
                  <div className="panel prToolPanel">
                    <ReviewBookmarks
                      value={session.view_state.bookmarks}
                      onChange={(bookmarks) =>
                        updateSession({ view_state: { ...session.view_state, bookmarks } })
                      }
                    />
                    <div className="prReviewUrl">
                      <label>
                        VOD URL
                        <input
                          value={session.video_url ?? ""}
                          onChange={(e) => updateSession({ video_url: e.target.value })}
                          placeholder="Direct MP4/WebM or YouTube URL"
                        />
                      </label>
                    </div>
                    <DrawingToolbar
                      state={tools}
                      onState={setTools}
                      shapes={session.drawing}
                      onShapes={(v) => updateSession({ drawing: v })}
                      hiddenLayers={hiddenLayers}
                      onHiddenLayers={setHiddenLayers}
                    />
                    <VideoSurface
                      url={session.video_url ?? ""}
                      shapes={session.drawing}
                      onShapes={(v) => updateSession({ drawing: v })}
                      tools={tools}
                      hiddenLayers={hiddenLayers}
                    />
                  </div>
                  <div className="panel prToolPanel prReviewMap">
                    <div className="panelHead">
                      <div>
                        <span className="cardKicker">TACTICAL MAP</span>
                        <h3>{port?.name}</h3>
                      </div>
                      <span>Use the same labels and colors to reconstruct positions.</span>
                    </div>
                    <DrawingToolbar
                      state={tools}
                      onState={setTools}
                      shapes={session.map_drawing}
                      onShapes={(v) => updateSession({ map_drawing: v })}
                      hiddenLayers={hiddenLayers}
                      onHiddenLayers={setHiddenLayers}
                    />
                    <AnnotationSurface
                      background={mapUrl}
                      missing={port?.name}
                      shapes={session.map_drawing}
                      onShapes={(v) => updateSession({ map_drawing: v })}
                      tools={tools}
                      hiddenLayers={hiddenLayers}
                    />
                  </div>
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
