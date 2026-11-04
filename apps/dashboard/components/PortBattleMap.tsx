"use client";
const W = (1863 / 1551) * 100,
  H = 100;
const norm = (v: any) =>
  String(v ?? "")
    .normalize("NFKD")
    .replace(/[ß]/g, "b")
    .replace(/[ǾØ]/g, "O")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
export default function PortBattleMap({
  mapData,
  battles,
  allies,
}: {
  mapData: any;
  battles: any[];
  allies: any[];
}) {
  const allyTags = new Set(allies.filter((g) => g.allied).map((g) => norm(g.tag)));
  const active = battles.filter(
    (b) =>
      ["OPEN", "CLOSED"].includes(b.status) &&
      (!b.starts_at || Date.parse(b.starts_at) + 2 * 3600000 > Date.now()),
  );
  const ports = (mapData?.markers ?? []).filter(
    (m: any) =>
      ["port", "city"].includes(String(m.type ?? "").toLowerCase()) &&
      Number.isFinite(Number(m.lat)) &&
      Number.isFinite(Number(m.lng)),
  );
  return (
    <section className="panel pbStrategicMap">
      <header>
        <div>
          <span className="eyebrow">PORT BATTLE OVERVIEW</span>
          <h2>Battle Map</h2>
        </div>
        <div className="pbMapLegend">
          <span>
            <i style={{ background: "#edc355" }} />
            BOM Attacks
          </span>
          <span>
            <i style={{ background: "#b68aff" }} />
            Allied Attacks
          </span>
        </div>
      </header>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Port Battle map with gold BOM attacks and purple allied attacks"
      >
        <image href="/wosb/map/world-map.png" width={W} height={H} />
        {ports.map((p: any, i: number) => {
          const attacks = active.filter((b) => norm(b.port_name) === norm(p.name));
          const bom = attacks.some((b) => norm(b.attacker) === "bom");
          const ally = attacks.some((b) => allyTags.has(norm(b.attacker)));
          const x = Number(p.lng),
            y = H - Number(p.lat);
          return (
            <g key={p.entityKey ?? i}>
              <title>{`${p.name}${bom ? " · BOM Attack" : ""}${ally ? " · Allied Attack" : ""}`}</title>
              <image
                href={`/wosb/map/icons/${String(p.type).toLowerCase()}.png`}
                x={x - 1.1}
                y={y - 1.1}
                width="2.2"
                height="2.2"
              />
              {(bom || ally) && (
                <circle
                  cx={x}
                  cy={y}
                  r="2.6"
                  fill={bom ? "#edc35530" : "#b68aff30"}
                  stroke={bom ? "#edc355" : "#b68aff"}
                  strokeWidth=".45"
                />
              )}
              {bom && ally && <circle cx={x} cy={y} r="3.4" fill="none" stroke="#b68aff" strokeWidth=".35" />}
            </g>
          );
        })}
      </svg>
      <p>Ports and cities only. Configure allied guilds in Fleet Configuration.</p>
    </section>
  );
}
