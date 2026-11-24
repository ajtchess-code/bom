"use client";
// Public Battle Prep & Review: the same map planner members use, with no login.
// Plans are saved in the visitor's browser and can be exported as an image or a file.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AnnotationSurface,
  DrawingToolbar,
  VideoSurface,
  defaultTools,
  type Port,
  type Shape,
  type ToolState,
} from "../PrepReviewDashboard";
import { readTactics, type Selection, type TacticTool, type Tactics } from "./Tactics";
import TacticsPanel from "./TacticsPanel";
import { PrepDock, PrepPalette, isTacticTool, type PrepTool } from "./PrepDock";
import { useWorkspaceFullscreen } from "../useWorkspaceFullscreen";

type Plan = {
  id: string;
  kind: "PREP" | "REVIEW";
  title: string;
  port: string;
  videoUrl: string;
  drawing: Shape[];
  mapDrawing: Shape[];
  tactics: Tactics;
  updatedAt: string;
};
const STORE = "bom:public-prep";
const rid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
function sanitizeShapes(raw: unknown): Shape[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 2000)
    .filter(
      (s): s is Shape =>
        Boolean(s) &&
        typeof s === "object" &&
        Array.isArray((s as any).points) &&
        (s as any).points.every(
          (pt: unknown) => Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1]),
        ),
    );
}
function loadPlans(): Plan[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) || "[]");
    return Array.isArray(v)
      ? v
          .filter((p) => p && typeof p === "object")
          .map((p) => ({
            ...p,
            drawing: sanitizeShapes(p.drawing),
            mapDrawing: sanitizeShapes(p.mapDrawing),
            tactics: readTactics(p.tactics),
          }))
      : [];
  } catch {
    return [];
  }
}
function savePlans(plans: Plan[]) {
  try {
    localStorage.setItem(STORE, JSON.stringify(plans));
    return true;
  } catch {
    return false;
  }
}

/** Draws the map and the drawing layer into a PNG and downloads it. */
async function exportImage(root: HTMLElement | null, mapUrl: string | null, name: string) {
  const svg = root?.querySelector("svg[aria-label='Tactical drawing surface']") as SVGSVGElement | null;
  if (!svg) return false;
  const vb = svg.viewBox.baseVal,
    W = vb?.width || 1200,
    H = vb?.height || 900;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#0d1520";
  ctx.fillRect(0, 0, W, H);
  const draw = (src: string) =>
    new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, W, H);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = src;
    });
  if (mapUrl) await draw(mapUrl);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll("image").forEach((n) => n.remove());
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  await draw(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`,
  );
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `${name.replace(/[^\w-]+/g, "-") || "battle-plan"}.png`;
  a.click();
  return true;
}

export default function PublicPrep({ ports }: { ports: Port[] }) {
  const params = useSearchParams();
  const workspace = useWorkspaceFullscreen();
  const [plans, setPlans] = useState<Plan[]>([]),
    [activeId, setActiveId] = useState<string | null>(null),
    [notice, setNotice] = useState(""),
    [tools, setTools] = useState<ToolState>(defaultTools),
    [hiddenLayers, setHiddenLayers] = useState<Set<string>>(new Set()),
    [mode, setMode] = useState<"draw" | "tactics">("tactics"),
    [tacticTool, setTacticTool] = useState<TacticTool>("select"),
    [tacticSel, setTacticSel] = useState<Selection>(null),
    [activeSquadron, setActiveSquadron] = useState<string | null>(null),
    [newPort, setNewPort] = useState(ports[0]?.name ?? "");
  useEffect(() => {
    const saved = loadPlans();
    setPlans(saved);
    setActiveId(saved[0]?.id ?? null);
    const want = params.get("port");
    const match = want && ports.find((p) => p.name.toLowerCase() === want.toLowerCase());
    if (match) setNewPort(match.name);
  }, []);
  const plan = plans.find((p) => p.id === activeId) ?? null;
  const port = useMemo(() => ports.find((p) => p.name === plan?.port) ?? null, [ports, plan?.port]);
  const update = (patch: Partial<Plan>) => {
    if (!plan) return;
    const next = plans.map((p) =>
      p.id === plan.id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p,
    );
    setPlans(next);
    if (!savePlans(next)) setNotice("Your browser wouldn't save this plan (private mode or storage full).");
  };
  const create = (kind: "PREP" | "REVIEW") => {
    const p: Plan = {
      id: rid(),
      kind,
      title: `${newPort} ${kind === "PREP" ? "plan" : "review"}`,
      port: newPort,
      videoUrl: "",
      drawing: [],
      mapDrawing: [],
      tactics: readTactics(null),
      updatedAt: new Date().toISOString(),
    };
    const next = [p, ...plans];
    setPlans(next);
    setActiveId(p.id);
    savePlans(next);
  };
  const remove = (id: string) => {
    if (!confirm("Delete this plan from this browser? This can't be undone.")) return;
    const next = plans.filter((p) => p.id !== id);
    setPlans(next);
    savePlans(next);
    if (activeId === id) setActiveId(next[0]?.id ?? null);
  };
  const pickTool = (t: PrepTool) => {
    if (isTacticTool(t)) {
      setTacticTool(t);
      setMode("tactics");
    } else {
      setTools((v) => ({ ...v, tool: t }));
      setMode("draw");
      setTacticSel(null);
    }
  };
  const download = () => {
    if (!plan) return;
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${plan.title.replace(/[^\w-]+/g, "-")}.bomplan.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      if (!raw || typeof raw !== "object" || !Array.isArray(raw.drawing)) throw new Error();
      const p: Plan = {
        id: rid(),
        kind: raw.kind === "REVIEW" ? "REVIEW" : "PREP",
        title: String(raw.title ?? "Imported plan").slice(0, 80),
        port: ports.some((x) => x.name === raw.port) ? raw.port : (ports[0]?.name ?? ""),
        videoUrl: String(raw.videoUrl ?? "").slice(0, 500),
        drawing: sanitizeShapes(raw.drawing),
        mapDrawing: sanitizeShapes(raw.mapDrawing),
        tactics: readTactics(raw.tactics),
        updatedAt: new Date().toISOString(),
      };
      const next = [p, ...plans];
      setPlans(next);
      setActiveId(p.id);
      savePlans(next);
    } catch {
      setNotice("That file isn't a BOM battle plan.");
    }
  };
  const tactics = plan?.tactics ?? readTactics(null);
  const surface = (drawingKey: "drawing" | "mapDrawing", withTactics: boolean) => (
    <AnnotationSurface
      background={port?.mapUrl ?? null}
      missing={port?.name}
      shapes={plan ? plan[drawingKey] : []}
      onShapes={(v) => update({ [drawingKey]: v } as Partial<Plan>)}
      tools={tools}
      hiddenLayers={hiddenLayers}
      tactics={
        withTactics
          ? {
              data: tactics,
              onChange: (t) => update({ tactics: t }),
              active: mode === "tactics",
              tool: tacticTool,
              selected: tacticSel,
              onSelect: setTacticSel,
            }
          : undefined
      }
    />
  );
  return (
    <div
      ref={workspace.ref}
      className={`prepReviewExperience prWorkspaceRoot ppPublic ${workspace.fullscreen ? "prWorkspaceFullscreen" : ""}`}
    >
      <header className="prHero">
        <div>
          <span className="eyebrow">FREE TOOL · NO LOGIN</span>
          <h1>Battle Prep &amp; Review</h1>
          <p>
            Plan port battles on the real maps, or review a fight from video. Your plans save in this browser.
          </p>
        </div>
      </header>
      {notice && (
        <div className="notice" onClick={() => setNotice("")}>
          {notice}
        </div>
      )}
      <div className="prLayout">
        <aside className="prSidebar panel">
          <h3>My Plans</h3>
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
          <div className="ppNewRow">
            <button type="button" className="primaryButton" onClick={() => create("PREP")}>
              New Battle Plan
            </button>
            <button type="button" className="outlineButton" onClick={() => create("REVIEW")}>
              New Video Review
            </button>
          </div>
          <ul className="ppPlanList">
            {plans.map((p) => (
              <li key={p.id} className={p.id === activeId ? "active" : ""}>
                <button type="button" onClick={() => setActiveId(p.id)}>
                  <b>{p.title}</b>
                  <small>
                    {p.kind === "PREP" ? "Plan" : "Review"} · {p.port} ·{" "}
                    {new Date(p.updatedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                  </small>
                </button>
                <button
                  type="button"
                  className="ppDel"
                  aria-label={`Delete ${p.title}`}
                  onClick={() => remove(p.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          {!plans.length && <p className="muted">No plans yet. Pick a port and start one.</p>}
          <label className="ppImport">
            Open a plan file
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => upload(e.target.files?.[0])}
            />
          </label>
          <p className="muted ppNote">
            Plans are stored only in this browser. Download a plan file to share it or move it to another
            device.
          </p>
        </aside>
        <section className="panel prToolPanel">
          {!plan ? (
            <div className="ppEmpty">
              <h2>Start a Plan</h2>
              <p>
                Choose a port on the left, then press New Battle Plan. Draw lines and arrows, place squadrons,
                set the wind and mark towers.
              </p>
            </div>
          ) : (
            <>
              <div className="ppPlanHead">
                <input
                  value={plan.title}
                  onChange={(e) => update({ title: e.target.value.slice(0, 80) })}
                  aria-label="Plan name"
                />
                <select
                  value={plan.port}
                  onChange={(e) => update({ port: e.target.value })}
                  aria-label="Port"
                >
                  {ports.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => exportImage(workspace.ref.current, port?.mapUrl ?? null, plan.title)}
                >
                  Save as Image
                </button>
                <button type="button" onClick={download}>
                  Download Plan File
                </button>
                <button type="button" onClick={() => workspace.toggle()}>
                  {workspace.fullscreen ? "Exit Full Screen" : "Full Screen"}
                </button>
              </div>
              {plan.kind === "REVIEW" && (
                <div className="ppVideo">
                  <label>
                    Video link (YouTube or a direct video file)
                    <input
                      value={plan.videoUrl}
                      onChange={(e) => update({ videoUrl: e.target.value.slice(0, 500) })}
                      placeholder="https://youtube.com/watch?v=…"
                    />
                  </label>
                  {plan.videoUrl && (
                    <VideoSurface
                      url={plan.videoUrl}
                      shapes={plan.drawing}
                      onShapes={(v) => update({ drawing: v })}
                      tools={tools}
                      hiddenLayers={hiddenLayers}
                    />
                  )}
                </div>
              )}
              <div className={`psStudio ${workspace.fullscreen ? "psFull" : ""}`}>
                <div className="psStage">
                  {surface(plan.kind === "REVIEW" ? "mapDrawing" : "drawing", true)}
                </div>
                <PrepDock
                  floating={workspace.fullscreen}
                  palette={
                    <PrepPalette
                      tool={mode === "tactics" ? tacticTool : tools.tool}
                      onTool={pickTool}
                      canUndo={(plan.kind === "REVIEW" ? plan.mapDrawing : plan.drawing).length > 0}
                      onUndo={() => {
                        const key = plan.kind === "REVIEW" ? "mapDrawing" : "drawing";
                        update({ [key]: plan[key].slice(0, -1) } as Partial<Plan>);
                      }}
                    />
                  }
                >
                  <details className="psSection" open>
                    <summary>Pen &amp; Layers</summary>
                    <DrawingToolbar
                      pen
                      state={tools}
                      onState={setTools}
                      shapes={plan.kind === "REVIEW" ? plan.mapDrawing : plan.drawing}
                      onShapes={(v) =>
                        update({ [plan.kind === "REVIEW" ? "mapDrawing" : "drawing"]: v } as Partial<Plan>)
                      }
                      hiddenLayers={hiddenLayers}
                      onHiddenLayers={setHiddenLayers}
                    />
                  </details>
                  <TacticsPanel
                    showTools={false}
                    tactics={tactics}
                    onTactics={(t) => update({ tactics: t })}
                    tool={tacticTool}
                    onTool={setTacticTool}
                    selected={tacticSel}
                    onSelect={setTacticSel}
                    activeSquadron={activeSquadron}
                    onActiveSquadron={setActiveSquadron}
                  />
                </PrepDock>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
