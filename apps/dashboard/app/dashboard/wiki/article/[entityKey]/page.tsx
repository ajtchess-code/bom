import { internalFetch } from "@/lib/api";
import { wosbShipImage } from "@/lib/wosbShipImages";
import { redirect } from "next/navigation";
import Link from "next/link";
import WikiReader from "@/components/WikiReader";
import { MarkdownLite } from "@/components/WikiPortalDashboard";
async function get(path: string) {
  const r = await internalFetch(path);
  if (r.status === 401 || r.status === 403) redirect("/?auth=member");
  if (!r.ok) return null;
  return r.json();
}
function label(v: string) {
  return String(v ?? "")
    .replaceAll("_", " ")
    .replaceAll(".", " · ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
function value(v: any): string {
  if (v == null || v === "") return "Unknown";
  if (typeof v === "string") return v;
  if (typeof v === "number") return v.toLocaleString(undefined, { maximumFractionDigits: 3 });
  if (Array.isArray(v)) return v.map(value).join(" · ");
  return Object.entries(v)
    .map(([k, x]) => `${label(k)}: ${value(x)}`)
    .join("; ");
}
function FactTable({ facts, caption }: { facts: any[]; caption: string }) {
  return (
    <div className="wikiTableWrap">
      <table className="wikiDataTable">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Characteristic</th>
            <th scope="col">Reference value</th>
          </tr>
        </thead>
        <tbody>
          {facts.map((f) => (
            <tr key={f.path}>
              <th scope="row">{f.label ?? label(f.path)}</th>
              <td>{value(f.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export default async function WikiArticlePage({ params }: { params: Promise<{ entityKey: string }> }) {
  const { entityKey } = await params,
    article = await get(`/v1/wiki/article/${encodeURIComponent(decodeURIComponent(entityKey))}`);
  if (!article) redirect("/dashboard/wiki");
  const access = await get("/v1/access"),
    isShip = article.kind === "ship" || String(article.entityKey).startsWith("ship:"),
    data = article.current?.data ?? {},
    facts = (article.facts ?? []).filter(
      (f: any) => !/^historicalInspiration|^(body|description|image|sourceSheet)$/.test(f.path),
    );
  const quickPaths = [
      "rate",
      "class",
      "faction",
      "stats.durability",
      "stats.armor",
      "stats.speed",
      "stats.hold",
      "stats.crew",
      "stats.guns",
    ],
    quick = facts.filter((f: any) => quickPaths.includes(f.path)),
    materials = facts.filter((f: any) => /^(materials|baseMaterials|ingredients)\./.test(f.path)),
    stats = facts.filter((f: any) => /^stats\./.test(f.path)),
    other = facts.filter((f: any) => !quick.includes(f) && !materials.includes(f) && !stats.includes(f)),
    image = isShip ? wosbShipImage(article.name) : null;
  const infobox = (
    <>
      <div className="wikiInfoboxTitle">{article.name}</div>
      {image && <img src={image} alt={`${article.name} in World of Sea Battles`} />}
      <FactTable facts={quick} caption={isShip ? "Ship at a glance" : label(article.kind)} />
      {article.current?.asOf && <small>Snapshot: {article.current.asOf}</small>}
      {isShip && (
        <Link
          className="goldButton"
          href={`/dashboard/ship-builder?ship=${encodeURIComponent(article.name)}`}
        >
          Build this ship
        </Link>
      )}
    </>
  );
  return (
    <WikiReader
      title={article.name}
      category={label(article.kind)}
      admin={Boolean(access?.dashboardAdmin)}
      sources={article.current?.sourceNames ?? []}
      asOf={article.current?.asOf}
      infobox={quick.length || image ? infobox : undefined}
    >
      <section>
        <h2>Overview</h2>
        <p>
          {isShip
            ? `${article.name} is ${data.rate ? `a Rate ${data.rate} ` : "a "}${data.class ? `${String(data.class).toLowerCase()} ` : ""}ship${data.faction ? ` associated with ${data.faction}` : ""} in World of Sea Battles.`
            : `${article.name} is a ${label(article.kind).toLowerCase()} reference in the World of Sea Battles knowledge base.`}
        </p>
        {article.aliases?.filter((x: string) => x.toLowerCase() !== article.name.toLowerCase()).length >
          0 && (
          <p>
            Also known as:{" "}
            {article.aliases.filter((x: string) => x.toLowerCase() !== article.name.toLowerCase()).join(", ")}
            .
          </p>
        )}
        {article.historicalOnly && (
          <p className="wikiArticleNote">
            Only archived reference data is available. Values have not been verified against the current game
            version.
          </p>
        )}
        {(data.body || data.description) && <MarkdownLite text={String(data.body ?? data.description)} />}
      </section>
      {stats.length > 0 && (
        <section>
          <h2>Characteristics and armament</h2>
          <FactTable facts={stats} caption="Base characteristics · source units" />
          <p>
            These are base reference values. Equipment, skills and temporary effects may change a fitted
            ship's performance.
          </p>
        </section>
      )}
      {materials.length > 0 && (
        <section>
          <h2>{isShip ? "Obtaining and crafting" : "Recipe and ingredients"}</h2>
          <FactTable facts={materials} caption="Source recipe quantities" />
          <p>Check the source snapshot and applicable discounts before purchasing materials.</p>
          <Link href="/dashboard/wiki/topic/crafting">Crafting recipes and batch calculator</Link>
        </section>
      )}
      {other.length > 0 && (
        <section>
          <h2>{isShip ? "Fitting and role references" : "Details and usage"}</h2>
          <FactTable facts={other} caption="Additional recorded information" />
          {isShip && (
            <p>
              Imported Port Battle role labels describe the legacy BOM catalogue. Current battle assignments
              and targets are managed by officers.
            </p>
          )}
        </section>
      )}
      {isShip && (
        <section>
          <h2>Fitting and comparisons</h2>
          <p>
            Review the hull's available slots and restrictions in{" "}
            <Link href={`/dashboard/ship-builder?ship=${encodeURIComponent(article.name)}`}>
              Ship Builder
            </Link>
            . Compare known base statistics with{" "}
            <Link href="/dashboard/wiki/topic/ships">other ships of the same rate</Link>.
          </p>
          <p>
            For BOM fleet preparation, see{" "}
            <Link href="/dashboard/wiki/topic/bom-port-battle-preparation">
              Port Battle stockpiles and fleet doctrine
            </Link>
            .
          </p>
        </section>
      )}
      {article.supplemental?.length > 0 && (
        <section>
          <h2>Additional source references</h2>
          <p>
            Build layouts and material estimates are kept with their source labels. Conflicting estimates are
            not combined into a new recipe.
          </p>
          {article.supplemental.map((s: any, i: number) => (
            <details className="wikiReferenceDetails" key={`${s.entityKey}:${i}`}>
              <summary>
                {label(s.kind)} · {s.sourceName}
                {s.historical ? " · archived" : ""}
              </summary>
              <FactTable facts={s.facts ?? []} caption={s.sourceName} />
            </details>
          ))}
        </section>
      )}
      {article.historicalInspiration && (
        <section>
          <h2>Historical inspiration</h2>
          <p>{article.historicalInspiration}</p>
          <small>
            Source-derived background; the in-game ship may differ from its historical counterpart.
          </small>
        </section>
      )}
      {(article.changes?.length > 0 || article.historical?.length > 0) && (
        <section>
          <h2>Patch and source history</h2>
          {article.changes?.length > 0 && (
            <div className="wikiTableWrap">
              <table className="wikiDataTable">
                <caption>B21 changes</caption>
                <thead>
                  <tr>
                    <th>Characteristic</th>
                    <th>Previous</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {article.changes.map((c: any, i: number) => (
                    <tr key={i}>
                      <th>{c.label ?? c.field}</th>
                      <td>{value(c.old)}</td>
                      <td>{value(c.new)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {article.historical?.map((s: any, i: number) => (
            <details className="wikiReferenceDetails" key={i}>
              <summary>
                {s.sourceName}
                {s.asOf ? ` · ${s.asOf}` : ""} · archived snapshot
              </summary>
              <FactTable
                facts={(s.facts ?? []).filter((f: any) => !/^historicalInspiration/.test(f.path))}
                caption="Archived values · not current statistics"
              />
            </details>
          ))}
        </section>
      )}
      {article.related?.length > 0 && (
        <section>
          <h2>See also</h2>
          <ul>
            {article.related.map((r: any) => (
              <li key={r.entityKey}>
                <Link href={`/dashboard/wiki/article/${encodeURIComponent(r.entityKey)}`}>{r.name}</Link> ·{" "}
                {label(r.kind)}
              </li>
            ))}
          </ul>
        </section>
      )}
      {!facts.length && !data.body && !data.description && (
        <p>
          Current details have not been recovered for this entry. Available reference snapshots are retained
          above.
        </p>
      )}
    </WikiReader>
  );
}
