"use client";
import { PointerEvent, useEffect, useRef, useState, WheelEvent } from "react";
import { emitInspector, emitRecent, usePersistedState } from "@/lib/dashboardQoL";
import Link from "next/link";

type Props = { mapData: any; battles: any[] };
const MAP_W = (1863 / 1551) * 100;
const MAP_H = 100;
const iconNames: Record<string, string> = {
  city: "city.png",
  port: "port.png",
  pirate: "pirate.png",
  bay: "bay.png",
  fishing_village: "fishing-village.png",
  coal: "coal.png",
  copper: "copper.png",
  farm: "farm.png",
  iron: "iron.png",
  resin: "resin.png",
  rum: "rum.png",
  water: "water.png",
  wood: "wood.png",
  altar: "altar.png",
  fort: "fort.png",
  island: "island.png",
  lighthouse: "lighthouse.png",
  printshop: "printshop.png",
  points_of_interest: "points-of-interest.png",
};
function norm(v: any) {
  return String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
function human(v: any) {
  return String(v ?? "other")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
function markerType(m: any) {
  return String(m.type ?? "other")
    .toLowerCase()
    .trim()
    .replace(/[-\s]+/g, "_");
}
function iconFor(type: string) {
  return iconNames[type] ?? "points-of-interest.png";
}

export default function MapDashboard({ mapData, battles }: Props) {
  const markers = (mapData?.markers ?? []).filter(
    (m: any) => Number.isFinite(Number(m.lat)) && Number.isFinite(Number(m.lng)),
  );
  const types: string[] = [...new Set<string>(markers.map(markerType))].sort();
  const [savedLayers, setSavedLayers] = usePersistedState<string[]>("map:layers", []);
  const enabled = new Set(savedLayers.includes("__none__") ? [] : savedLayers.length ? savedLayers : types);
  const [query, setQuery] = usePersistedState("map:query", "");
  const [savedViews, setSavedViews] = usePersistedState<any[]>("map:savedViews", []);
  const [selected, setSelectedRaw] = useState<any | null>(null);
  const [view, setView] = usePersistedState("map:view", { x: 0, y: 0, w: MAP_W, h: MAP_H });
  function setSelected(m: any | null) {
    setSelectedRaw(m);
    if (m)
      emitRecent({
        kind: "map",
        key: String(m.entityKey ?? m.name),
        label: String(m.name ?? human(m.type)),
        href: "/dashboard/map",
        metadata: { detail: human(m.type) },
      });
  }
  const drag = useRef<any>(null);
  const activeBattles: any[] = [];
  const battleByPort = new Map(activeBattles.map((b: any) => [norm(b.port_name), b]));
  const filtered = markers.filter(
    (m: any) =>
      enabled.has(markerType(m)) &&
      (!query ||
        `${m.name ?? ""} ${m.type ?? ""} ${m.tradeZone ?? m.trade_zone ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  function point(m: any) {
    return { x: Number(m.lng), y: MAP_H - Number(m.lat) };
  }
  function reset() {
    setView({ x: 0, y: 0, w: MAP_W, h: MAP_H });
  }
  function saveCurrentView() {
    const name = prompt("Saved view name", "My map view")?.trim();
    if (!name) return;
    const layers = enabled.size ? [...enabled] : ["__none__"];
    setSavedViews(
      [{ name, layers, query, view }, ...savedViews.filter((x: any) => x.name !== name)].slice(0, 8),
    );
  }
  function applySavedView(v: any) {
    setSavedLayers(Array.isArray(v.layers) ? v.layers : []);
    setQuery(String(v.query ?? ""));
    if (v.view) setView(v.view);
  }
  function removeSavedView(name: string) {
    setSavedViews(savedViews.filter((x: any) => x.name !== name));
  }
  function wheel(e: WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.16 : 0.86;
    setView((v) => {
      const nw = Math.max(24, Math.min(MAP_W * 1.05, v.w * factor)),
        nh = (nw / MAP_W) * MAP_H;
      return { x: v.x + (v.w - nw) / 2, y: v.y + (v.h - nh) / 2, w: nw, h: nh };
    });
  }
  function down(e: PointerEvent<SVGSVGElement>) {
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, view };
  }
  function move(e: PointerEvent<SVGSVGElement>) {
    if (!drag.current) return;
    const rect = e.currentTarget.getBoundingClientRect(),
      dx = ((e.clientX - drag.current.x) / rect.width) * drag.current.view.w,
      dy = ((e.clientY - drag.current.y) / rect.height) * drag.current.view.h;
    setView({ ...drag.current.view, x: drag.current.view.x - dx, y: drag.current.view.y - dy });
  }
  function up() {
    drag.current = null;
  }
  function focus(m: any) {
    const p = point(m),
      w = Math.min(38, MAP_W),
      h = (w / MAP_W) * MAP_H;
    setView({ x: p.x - w / 2, y: p.y - h / 2, w, h });
    setSelected({ ...m, battle: battleByPort.get(norm(m.name)) });
  }
  useEffect(() => {
    const key = new URLSearchParams(location.search).get("marker");
    if (!key) return;
    const m = markers.find((x: any) => String(x.entityKey ?? x.name) === key);
    if (m) focus(m);
  }, []);
  function inspectSelected() {
    if (!selected) return;
    const fields = Object.entries(selected)
      .filter(
        ([k, v]) =>
          !["name", "entityKey", "battle", "type", "lat", "lng"].includes(k) &&
          !/source|provider|raw|metadata|file|path|hash|token|record|internal/i.test(k) &&
          v != null &&
          typeof v !== "object",
      )
      .slice(0, 10)
      .map(([k, v]) => ({ label: human(k), value: String(v) }));
    emitInspector({
      kind: human(selected.type),
      title: String(selected.name || human(selected.type)),
      subtitle: selected.battle ? "Active Port Battle nearby" : "Archipelago location",
      href: "/dashboard/map",
      fields,
      actions: [{ label: "Open world article", href: "/dashboard/wiki/topic/map-and-world", primary: true }],
    });
  }
  function copyLocation() {
    if (!selected) return;
    const u = new URL(location.href);
    u.searchParams.set("marker", String(selected.entityKey ?? selected.name));
    navigator.clipboard?.writeText(u.toString());
    window.dispatchEvent(
      new CustomEvent("bom:toast", { detail: { message: "Map location link copied.", tone: "success" } }),
    );
  }
  return (
    <div className="mapExperience redesignedExperience">
      <header className="experienceHero compactHero">
        <div>
          <span className="eyebrow">WORLD MAP</span>
          <h1>Archipelago Map</h1>
          <p>
            Explore the archipelago with searchable locations, useful map layers, and detailed world
            information.
          </p>
          <div className="heroPills">
            <span>{markers.length} mapped locations</span>
            <span>{types.length} map layers</span>
          </div>
        </div>
        <div className="topTools">
          <Link className="outlineButton" href="/dashboard/wiki/topic/map-and-world">
            Wiki: Map & World
          </Link>
          <button className="goldButton" onClick={reset}>
            Reset map
          </button>
        </div>
      </header>
      <div className="mapWorkspace legacyMapWorkspace">
        <aside className="panel mapLayers">
          <div className="panelHead">
            <div>
              <span className="cardKicker">MAP LAYERS</span>
              <h3>World Markers</h3>
            </div>
            <span>{filtered.length} shown</span>
          </div>
          <input
            type="search"
            placeholder="Search ports, mines, landmarks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="mapLayerActions">
            <button className="tinyButton" onClick={() => setSavedLayers([])}>
              Show all
            </button>
            <button className="tinyButton" onClick={() => setSavedLayers(["__none__"])}>
              Hide all
            </button>
            <button className="tinyButton" onClick={saveCurrentView}>
              Save view
            </button>
          </div>
          {savedViews.length > 0 && (
            <div className="mapSavedViews">
              <span>Saved views</span>
              {savedViews.map((v: any) => (
                <div key={v.name}>
                  <button onClick={() => applySavedView(v)}>{v.name}</button>
                  <button aria-label={`Delete ${v.name}`} onClick={() => removeSavedView(v.name)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="mapLayerList visualLayers">
            {types.map((t) => {
              const count = markers.filter((marker: any) => markerType(marker) === t).length;
              return (
                <label key={t} className={enabled.has(t) ? "enabled" : ""}>
                  <input
                    type="checkbox"
                    checked={enabled.has(t)}
                    onChange={() => {
                      const next = new Set(enabled);
                      next.has(t) ? next.delete(t) : next.add(t);
                      setSavedLayers(next.size ? [...next] : ["__none__"]);
                    }}
                  />
                  <img src={`/wosb/map/icons/${iconFor(t)}`} alt="" />
                  <span>{human(t)}</span>
                  <b>{count}</b>
                </label>
              );
            })}
          </div>
          {activeBattles.length > 0 && (
            <div className="mapBattleList">
              <span className="cardKicker">PORT BATTLES</span>
              {activeBattles.slice(0, 10).map((b: any) => (
                <button
                  key={b.id}
                  onClick={() => {
                    const m = markers.find((x: any) => norm(x.name) === norm(b.port_name));
                    if (m) focus(m);
                  }}
                >
                  <b>{b.port_name}</b>
                  <small>{b.starts_at ? new Date(b.starts_at).toLocaleString() : "Time TBD"}</small>
                </button>
              ))}
            </div>
          )}
          <div className="mapLegendNote">
            <b>Navigate the map</b>
            <p>Drag to pan · wheel to zoom · select an icon to inspect its Wiki data.</p>
          </div>
        </aside>
        <section className="panel mapCanvasPanel restoredMapPanel">
          <div className="worldMapToolbar">
            <div>
              <span className="cardKicker">WORLD MAP</span>
              <b>World of Sea Battles</b>
            </div>
            <span className="mapZoomBadge">{Math.round((MAP_W / view.w) * 100)}%</span>
          </div>
          <div className="worldMap restoredWorldMap">
            <svg
              viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
              preserveAspectRatio="xMidYMid meet"
              onWheel={wheel}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
            >
              <image
                href="/wosb/map/world-map.png"
                x="0"
                y="0"
                width={MAP_W}
                height={MAP_H}
                preserveAspectRatio="none"
              />
              {filtered.map((m: any) => {
                const p = point(m),
                  type = markerType(m),
                  battle = battleByPort.get(norm(m.name)),
                  size = battle ? 3.3 : 2.35;
                return (
                  <g
                    key={`${m.entityKey}-${m.id ?? ""}`}
                    className="mapMarker visualMarker"
                    data-selected={selected?.entityKey === m.entityKey}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setSelected({ ...m, battle })}
                  >
                    <image
                      href={`/wosb/map/icons/${iconFor(type)}`}
                      x={p.x - size / 2}
                      y={p.y - size / 2}
                      width={size}
                      height={size}
                    />
                    {battle && (
                      <>
                        <circle cx={p.x} cy={p.y} r="2.65" fill="none" stroke="#f4cf62" strokeWidth=".32" />
                        <circle
                          className="mapBattlePulse"
                          cx={p.x}
                          cy={p.y}
                          r="3.6"
                          fill="none"
                          stroke="#f4cf62"
                          strokeWidth=".15"
                        />
                      </>
                    )}
                    {view.w < 48 && m.name && (
                      <text x={p.x + size * 0.62} y={p.y + 0.35}>
                        {m.name}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="mapStatus">
            <span>Archipelago map</span>
            <span>{filtered.length} active markers</span>
          </div>
        </section>
        {selected && (
          <aside className="panel mapInspector premiumInspector">
            <button className="drawerClose" onClick={() => setSelected(null)}>
              ×
            </button>
            <div className="mapInspectorIcon">
              <img src={`/wosb/map/icons/${iconFor(markerType(selected))}`} alt="" />
            </div>
            <span className="cardKicker">{human(selected.type)}</span>
            <h2>{selected.name || human(selected.type)}</h2>
            {(selected.tradeZone || selected.trade_zone) && (
              <span className="infoChip">{human(selected.tradeZone ?? selected.trade_zone)} trade zone</span>
            )}
            <dl>
              {Object.entries(selected)
                .filter(
                  ([k, v]) =>
                    !["name", "entityKey", "battle", "type", "lat", "lng"].includes(k) &&
                    !/source|provider|raw|metadata|file|path|hash|token|record|internal/i.test(k) &&
                    v != null &&
                    typeof v !== "object",
                )
                .slice(0, 14)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt>{human(k)}</dt>
                    <dd>{String(v)}</dd>
                  </div>
                ))}
            </dl>
            {selected.battle && (
              <div className="mapBattleCard">
                <span className="cardKicker">ACTIVE PORT BATTLE</span>
                <b>
                  {selected.battle.attacker || "Attacker"} vs {selected.battle.defender || "Defender"}
                </b>
                <small>
                  {selected.battle.starts_at
                    ? new Date(selected.battle.starts_at).toLocaleString()
                    : "Time TBD"}
                </small>
                <Link href="/dashboard/port-battles">Open battle workspace →</Link>
              </div>
            )}
            <div className="drawerActions">
              <button className="outlineButton" onClick={inspectSelected}>
                Quick view
              </button>
              <Link className="outlineButton" href="/dashboard/wiki/topic/map-and-world">
                World article
              </Link>
              <button className="outlineButton" onClick={copyLocation}>
                Copy location link
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
