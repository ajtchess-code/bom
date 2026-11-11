"use client";
// World atlas for the game wiki: trade routes, ports and nearby placements drawn
// on the real World of Sea Battle map, with drag-to-pan and wheel/pinch zoom.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Pt = { x: number; y: number };
type View = { x: number; y: number; w: number };

/** The game map image is 1863×1551; chart units are 0–100 vertically. */
const MAP_W = (1863 / 1551) * 100,
  MAP_H = 100,
  ASPECT = MAP_H / MAP_W;
const MIN_W = MAP_W / 18;
const FULL: View = { x: 0, y: 0, w: MAP_W };

/** Game coordinates → map chart units (affine fit against 34 known port markers). */
const project = (p: Pt): Pt => ({
  x: (-0.08651901053 * p.x) / 10000 + (53.07514584455 * p.y) / 10000 + 59.94519574561,
  y: 100 - ((53.05204593999 * p.x) / 10000 - (0.11112675982 * p.y) / 10000 + 50.29679572795),
});
const fmt = (v: any) =>
  typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v ?? "—");

function clampView(v: View): View {
  const w = Math.min(MAP_W, Math.max(MIN_W, v.w)),
    h = w * ASPECT;
  return { w, x: Math.min(MAP_W - w, Math.max(0, v.x)), y: Math.min(MAP_H - h, Math.max(0, v.y)) };
}
/** A view that frames the given points with some breathing room. */
function frame(points: Pt[], minW = MAP_W / 6): View {
  if (!points.length) return FULL;
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const w = Math.max(minW, (x1 - x0) * 1.35, ((y1 - y0) * 1.35) / ASPECT);
  return clampView({ w, x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - (w * ASPECT) / 2 });
}

type Mode = "routes" | "ports" | "battles";

export default function WikiAtlas({
  data,
  open,
}: {
  data: any;
  open: (table: string, row?: number) => void;
}) {
  const routes: any[] = data.routes ?? [],
    ports: any[] = (data.ports ?? []).filter((p: any) => p.position),
    objects: any[] = data.objects ?? [],
    battleMaps: any[] = data.battleMaps ?? [];
  const [mode, setMode] = useState<Mode>("routes");
  const [route, setRoute] = useState(0);
  const [port, setPort] = useState(0);
  const [battle, setBattle] = useState(0);
  const [filter, setFilter] = useState("");
  const [showPorts, setShowPorts] = useState(true);
  const [showAll, setShowAll] = useState(true);
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState<View>(FULL);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const projectedRoutes = useMemo(
    () => routes.map((r) => ({ ...r, chart: (r.points ?? []).map(project) as Pt[] })),
    [routes],
  );
  const projectedPorts = useMemo(() => ports.map((p) => ({ ...p, chart: project(p.position) })), [ports]);
  const selectedRoute = projectedRoutes[route],
    selectedPort = projectedPorts[port];
  const nearby = useMemo(
    () =>
      mode === "ports" && selectedPort
        ? objects
            .filter(
              (o) =>
                o.position &&
                Math.hypot(o.position.x - selectedPort.position.x, o.position.y - selectedPort.position.y) <
                  1200,
            )
            .map((o) => ({ ...o, chart: project(o.position) }))
        : [],
    [mode, selectedPort, objects],
  );

  const focusRoute = useCallback(
    (i: number) => {
      setRoute(i);
      setView(frame(projectedRoutes[i]?.chart ?? []));
    },
    [projectedRoutes],
  );
  const focusPort = useCallback(
    (i: number) => {
      setPort(i);
      const p = projectedPorts[i]?.chart;
      if (p) setView(frame([p], MAP_W / 7));
    },
    [projectedPorts],
  );

  // Scale-independent sizes: markers stay the same size on screen at any zoom.
  const k = view.w / MAP_W;
  const h = view.w * ASPECT;

  // ---- pan / zoom ---------------------------------------------------------
  const toChart = (clientX: number, clientY: number): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    return {
      x: view.x + ((clientX - r.left) / r.width) * view.w,
      y: view.y + ((clientY - r.top) / r.height) * h,
    };
  };
  const zoomAt = (factor: number, at?: Pt) =>
    setView((v) => {
      const vh = v.w * ASPECT,
        c = at ?? { x: v.x + v.w / 2, y: v.y + vh / 2 };
      const w = Math.min(MAP_W, Math.max(MIN_W, v.w / factor));
      return clampView({ w, x: c.x - ((c.x - v.x) / v.w) * w, y: c.y - ((c.y - v.y) / vh) * (w * ASPECT) });
    });
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      setView((v) => {
        const vh = v.w * ASPECT,
          c = {
            x: v.x + ((e.clientX - r.left) / r.width) * v.w,
            y: v.y + ((e.clientY - r.top) / r.height) * vh,
          };
        const w = Math.min(MAP_W, Math.max(MIN_W, v.w * Math.exp(e.deltaY * 0.0015)));
        return clampView({ w, x: c.x - ((c.x - v.x) / v.w) * w, y: c.y - ((c.y - v.y) / vh) * (w * ASPECT) });
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ view: View; start: Pt; dist?: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    gesture.current = {
      view,
      start: { x: pts[0].x, y: pts[0].y },
      dist: pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : undefined,
      moved: false,
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current,
      r = svgRef.current!.getBoundingClientRect(),
      pts = [...pointers.current.values()];
    if (pts.length === 2 && g.dist) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const w = Math.min(MAP_W, Math.max(MIN_W, (g.view.w * g.dist) / d)),
        c = {
          x: g.view.x + ((mid.x - r.left) / r.width) * g.view.w,
          y: g.view.y + ((mid.y - r.top) / r.height) * g.view.w * ASPECT,
        };
      g.moved = true;
      setView(
        clampView({
          w,
          x: c.x - ((c.x - g.view.x) / g.view.w) * w,
          y: c.y - ((c.y - g.view.y) / (g.view.w * ASPECT)) * w * ASPECT,
        }),
      );
      return;
    }
    const dx = ((e.clientX - g.start.x) / r.width) * g.view.w,
      dy = ((e.clientY - g.start.y) / r.height) * g.view.w * ASPECT;
    if (Math.abs(e.clientX - g.start.x) + Math.abs(e.clientY - g.start.y) > 4) g.moved = true;
    setView(clampView({ w: g.view.w, x: g.view.x - dx, y: g.view.y - dy }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) setTimeout(() => (gesture.current = null), 0);
  };
  /** Ignore the click that ends a drag. */
  const tap = (fn: () => void) => () => {
    if (gesture.current?.moved) return;
    fn();
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = view.w * 0.15;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (moves[e.key]) {
      e.preventDefault();
      setView((v) => clampView({ ...v, x: v.x + moves[e.key][0], y: v.y + moves[e.key][1] }));
    } else if (e.key === "+" || e.key === "=") zoomAt(1.4);
    else if (e.key === "-") zoomAt(1 / 1.4);
    else if (e.key === "0") setView(FULL);
  };

  // ---- side panel lists ---------------------------------------------------
  const q = filter.trim().toLowerCase();
  const routeList = projectedRoutes
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => !q || `route ${r.id}`.includes(q) || String(r.id) === q);
  const portList = projectedPorts
    .map((p, i) => ({ p, i }))
    .filter(
      ({ p }) =>
        !q ||
        String(p.EnglishName ?? p.PortName)
          .toLowerCase()
          .includes(q),
    )
    .sort((a, b) => String(a.p.EnglishName).localeCompare(String(b.p.EnglishName)));
  const labelsVisible = k < 0.42;
  const chosenBattle = battleMaps[battle];

  return (
    <section className="gwAtlasSection">
      <header className="gwToolHeader">
        <div>
          <p className="gwEyebrow">WORLD ATLAS</p>
          <h2>Trade routes & ports</h2>
          <p>
            Every recorded trade route and port, drawn on the game's world map. Drag to move around, scroll or
            pinch to zoom, and pick a route or port to fly to it.
          </p>
        </div>
        <div className="gwSegmented" role="tablist" aria-label="Atlas view">
          {(
            [
              ["routes", "Trade routes", routes.length],
              ["ports", "Ports", ports.length],
              ["battles", "Port-battle maps", battleMaps.length],
            ] as const
          ).map(([id, label, n]) => (
            <button
              key={id}
              role="tab"
              aria-selected={mode === id}
              className={mode === id ? "active" : ""}
              onClick={() => {
                setMode(id);
                setFilter("");
                if (id === "routes") focusRoute(route);
                if (id === "ports") focusPort(port);
              }}
            >
              {label} <small>{n}</small>
            </button>
          ))}
        </div>
      </header>

      {mode === "battles" ? (
        <div className="gwAtlasBattle">
          <label>
            Port-battle map
            <select value={battle} onChange={(e) => setBattle(Number(e.target.value))}>
              {battleMaps.map((p: any, i: number) => (
                <option key={p.name} value={i}>
                  {p.name}
                  {p.mapFile ? "" : " (no image)"}
                </option>
              ))}
            </select>
          </label>
          {chosenBattle && (
            <>
              <p className="gwMuted">
                {chosenBattle.rate} · {chosenBattle.size} captains per team. Confirm current match settings in
                game.
              </p>
              {chosenBattle.mapFile ? (
                <img
                  className="gwBattleImage"
                  src={`/prep-review/maps/${chosenBattle.mapFile}`}
                  alt={`${chosenBattle.name} port-battle map`}
                />
              ) : (
                <p>No reference image is available for this port yet.</p>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="gwAtlasShell">
          <div className="gwAtlasStage">
            <svg
              ref={svgRef}
              className="gwAtlasMap"
              viewBox={`${view.x} ${view.y} ${view.w} ${h}`}
              role="application"
              aria-label="World map. Arrow keys move, plus and minus zoom, 0 shows the whole map."
              tabIndex={0}
              onKeyDown={onKey}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <image
                href="/wosb/map/world-map.png"
                x="0"
                y="0"
                width={MAP_W}
                height={MAP_H}
                preserveAspectRatio="none"
              />
              {mode === "routes" &&
                showAll &&
                projectedRoutes.map((r, i) =>
                  i === route ? null : (
                    <polyline
                      key={r.id}
                      className="gwRouteFaint"
                      points={r.chart.map((p: Pt) => `${p.x},${p.y}`).join(" ")}
                      onClick={tap(() => focusRoute(i))}
                      onPointerEnter={() => setHover(`Route ${r.id}`)}
                      onPointerLeave={() => setHover(null)}
                    >
                      <title>Route {r.id}</title>
                    </polyline>
                  ),
                )}
              {mode === "routes" && selectedRoute && (
                <g>
                  <polyline
                    className="gwRouteHalo"
                    points={selectedRoute.chart.map((p: Pt) => `${p.x},${p.y}`).join(" ")}
                  />
                  <polyline
                    className="gwRouteLine"
                    points={selectedRoute.chart.map((p: Pt) => `${p.x},${p.y}`).join(" ")}
                  />
                  {selectedRoute.chart.map((p: Pt, i: number) => {
                    const end = i === 0 || i === selectedRoute.chart.length - 1;
                    return (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={(end ? 0.75 : 0.42) * k * 1.4}
                        className={i === 0 ? "gwWaypointStart" : end ? "gwWaypointEnd" : "gwWaypoint"}
                      >
                        <title>
                          Waypoint {i + 1} of {selectedRoute.chart.length}
                        </title>
                      </circle>
                    );
                  })}
                </g>
              )}
              {nearby.map((o) => (
                <circle
                  key={o.row}
                  cx={o.chart.x}
                  cy={o.chart.y}
                  r={0.55 * k * 1.4}
                  className={/fort|port/i.test(o.path) ? "gwObjectFort" : "gwObject"}
                >
                  <title>
                    {o.path}
                    {o.parameters ? ` · ${o.parameters}` : ""}
                  </title>
                </circle>
              ))}
              {showPorts &&
                projectedPorts.map((p, i) => {
                  const active = mode === "ports" && i === port,
                    name = String(p.EnglishName ?? p.PortName);
                  return (
                    <g
                      key={p.PortName}
                      className={`gwPortPin${active ? " active" : ""}`}
                      transform={`translate(${p.chart.x} ${p.chart.y})`}
                      role="button"
                      tabIndex={-1}
                      aria-label={`Show ${name}`}
                      onClick={tap(() => {
                        setMode("ports");
                        focusPort(i);
                      })}
                      onPointerEnter={() => setHover(name)}
                      onPointerLeave={() => setHover(null)}
                    >
                      {active && <circle r={2.4 * k * 1.4} className="gwPortRing" />}
                      <circle r={(active ? 0.95 : 0.7) * k * 1.4} />
                      {(labelsVisible || active) && (
                        <text x={1.2 * k * 1.4} y={0.45 * k * 1.4} fontSize={2 * k * 1.4}>
                          {name}
                        </text>
                      )}
                    </g>
                  );
                })}
            </svg>
            <div className="gwMapControls" aria-label="Map controls">
              <button type="button" onClick={() => zoomAt(1.5)} aria-label="Zoom in">
                +
              </button>
              <button type="button" onClick={() => zoomAt(1 / 1.5)} aria-label="Zoom out">
                −
              </button>
              <button
                type="button"
                onClick={() => setView(FULL)}
                aria-label="Show the whole map"
                title="Whole map"
              >
                ⤢
              </button>
            </div>
            {hover && <div className="gwMapHover">{hover}</div>}
            <div className="gwMapLegend">
              {mode === "routes" ? (
                <>
                  <span>
                    <i className="lgRoute" /> Selected route
                  </span>
                  <span>
                    <i className="lgStart" /> First point
                  </span>
                  <span>
                    <i className="lgEnd" /> Last point
                  </span>
                </>
              ) : (
                <>
                  <span>
                    <i className="lgFort" /> Fort / port building
                  </span>
                  <span>
                    <i className="lgObject" /> Other placed object
                  </span>
                </>
              )}
              {showPorts && (
                <span>
                  <i className="lgPort" /> Port
                </span>
              )}
            </div>
          </div>

          <aside className="gwAtlasPanel">
            <div className="gwAtlasOptions">
              <label className="gwCheck">
                <input type="checkbox" checked={showPorts} onChange={(e) => setShowPorts(e.target.checked)} />{" "}
                Ports
              </label>
              {mode === "routes" && (
                <label className="gwCheck">
                  <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />{" "}
                  Other routes
                </label>
              )}
            </div>
            {mode === "routes" && selectedRoute && (
              <div className="gwAtlasDetail">
                <h3>Route {selectedRoute.id}</h3>
                <dl className="gwMiniFacts">
                  <div>
                    <dt>Waypoints</dt>
                    <dd>{selectedRoute.chart.length}</dd>
                  </div>
                  <div>
                    <dt>Length</dt>
                    <dd>{fmt(selectedRoute.length)}</dd>
                  </div>
                </dl>
                <div className="gwAtlasActions">
                  <button
                    type="button"
                    onClick={() => focusRoute(Math.max(0, route - 1))}
                    disabled={route === 0}
                  >
                    ‹ Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => focusRoute(Math.min(routes.length - 1, route + 1))}
                    disabled={route >= routes.length - 1}
                  >
                    Next ›
                  </button>
                  <button type="button" onClick={() => open("TradingRoutesInfo", selectedRoute.row)}>
                    Source record
                  </button>
                </div>
                <p className="gwMuted">
                  Length is in game-coordinate units. The game data doesn't say which way ships sail a route,
                  or what they carry.
                </p>
              </div>
            )}
            {mode === "ports" && selectedPort && (
              <div className="gwAtlasDetail">
                <h3>{selectedPort.EnglishName}</h3>
                <dl className="gwMiniFacts">
                  <div>
                    <dt>Type</dt>
                    <dd>{fmt(selectedPort.Type)}</dd>
                  </div>
                  <div>
                    <dt>Nearby placements</dt>
                    <dd>{nearby.length}</dd>
                  </div>
                  {selectedPort.BuildShipRangs != null && (
                    <div>
                      <dt>Shipyard ranks</dt>
                      <dd>{fmt(selectedPort.BuildShipRangs)}</dd>
                    </div>
                  )}
                </dl>
                <div className="gwAtlasActions">
                  <button type="button" onClick={() => open("WorldPorts", selectedPort.row)}>
                    Port details
                  </button>
                </div>
                <p className="gwMuted">
                  Gold dots near the port are forts and port buildings; teal dots are other placed objects.
                </p>
              </div>
            )}
            <label className="gwAtlasSearch">
              <span className="gwSrOnly">{mode === "routes" ? "Find a route" : "Find a port"}</span>
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={mode === "routes" ? "Find a route number…" : "Find a port…"}
              />
            </label>
            <ul className="gwAtlasList">
              {mode === "routes"
                ? routeList.map(({ r, i }) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        className={i === route ? "active" : ""}
                        onClick={() => focusRoute(i)}
                      >
                        <span>Route {r.id}</span>
                        <small>{r.chart.length} pts</small>
                      </button>
                    </li>
                  ))
                : portList.map(({ p, i }) => (
                    <li key={p.PortName}>
                      <button
                        type="button"
                        className={i === port ? "active" : ""}
                        onClick={() => focusPort(i)}
                      >
                        <span>{p.EnglishName}</span>
                        <small>{p.Type}</small>
                      </button>
                    </li>
                  ))}
              {(mode === "routes" ? routeList : portList).length === 0 && (
                <li className="gwMuted">Nothing matches.</li>
              )}
            </ul>
          </aside>
        </div>
      )}
      <details className="gwSourceNote">
        <summary>About this map</summary>
        <p>
          {routes.length} trade-route records ({routes.reduce((n, r) => n + (r.points?.length ?? 0), 0)}{" "}
          waypoints) and {ports.length} ports from the game client. Game coordinates are placed on the world
          map with a fit against 34 ports whose map positions are known, so positions can be off by a few
          pixels, and coastlines are not used to check that a route avoids land. Routes don't record cargo,
          schedules or direction.
        </p>
      </details>
    </section>
  );
}
