"use client";
import { useRef, useState } from "react";
import { parseArmyLink, spellDamage } from "@bom/shared";
import { toolRequest, type ToolContext } from "../ClashTools";
import { Panel, Table, DocumentCards, DocumentEditor, imageFile, download, date } from "./ui";
import s from "../clash-tools.module.css";
export default function ArsenalTools({ tool, ctx }: { tool: string; ctx: ToolContext }) {
  const [editing, setEditing] = useState<any>(null),
    [draft, setDraft] = useState(false),
    [detail, setDetail] = useState<any>(null),
    [army, setArmy] = useState(""),
    [parsed, setParsed] = useState<any>(null),
    [target, setTarget] = useState(
      ctx.state.catalog.items.find((i: any) => i.slug === "air-defense")?.id ?? "",
    ),
    [targetLevel, setTargetLevel] = useState(1),
    [lightningLevel, setLightningLevel] = useState(1),
    [quakeLevel, setQuakeLevel] = useState(1),
    [lightning, setLightning] = useState(4),
    [quakes, setQuakes] = useState(1),
    [comment, setComment] = useState("");
  async function open(d: any) {
    try {
      setDetail(await toolRequest("/documents/" + d.id));
    } catch (e: any) {
      ctx.message(e.message);
    }
  }
  if (tool === "Attack planner") return <AttackBoard ctx={ctx} />;
  if (tool === "Spell calculator") {
    const item = ctx.state.catalog.items.find((i: any) => i.id === target),
      level = item?.levels.find((l: any) => l.level === targetLevel),
      zap = ctx.state.catalog.items.find((i: any) => i.slug === "lightning-spell"),
      quake = ctx.state.catalog.items.find((i: any) => i.slug === "earthquake-spell"),
      z = zap?.levels.find((l: any) => l.level === lightningLevel),
      q = quake?.levels.find((l: any) => l.level === quakeLevel);
    let result: any = null,
      error = "";
    try {
      if (level?.hitpoints && z?.damage != null && q?.earthquakePercent != null)
        result = spellDamage(level.hitpoints, z.damage, lightning, q.earthquakePercent, quakes);
      else error = "Statistics are missing for the chosen levels.";
    } catch (e: any) {
      error = e.message;
    }
    return (
      <Panel title="Lightning / Earthquake calculator">
        <div className={s.grid}>
          <label>
            Target defense
            <select
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setTargetLevel(1);
              }}
            >
              {ctx.state.catalog.items
                .filter((i: any) => i.base === "home" && i.category === "defense")
                .map((i: any) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Defense level
            <select value={targetLevel} onChange={(e) => setTargetLevel(Number(e.target.value))}>
              {item?.levels
                .filter((l: any) => !l.supercharge)
                .map((l: any) => (
                  <option key={l.level} value={l.level}>
                    {l.level} · {l.hitpoints ?? "?"} HP
                  </option>
                ))}
            </select>
          </label>
          <label>
            Lightning level
            <select value={lightningLevel} onChange={(e) => setLightningLevel(Number(e.target.value))}>
              {zap?.levels.map((l: any) => (
                <option value={l.level} key={l.level}>
                  {l.level} · {l.damage ?? "?"} damage
                </option>
              ))}
            </select>
          </label>
          <label>
            Earthquake level
            <select value={quakeLevel} onChange={(e) => setQuakeLevel(Number(e.target.value))}>
              {quake?.levels.map((l: any) => (
                <option value={l.level} key={l.level}>
                  {l.level} · {l.earthquakePercent ?? "?"}%
                </option>
              ))}
            </select>
          </label>
          <label>
            Lightning spells
            <input
              type="number"
              min={0}
              max={30}
              value={lightning}
              onChange={(e) => setLightning(Number(e.target.value))}
            />
          </label>
          <label>
            Earthquake spells
            <input
              type="number"
              min={0}
              max={12}
              value={quakes}
              onChange={(e) => setQuakes(Number(e.target.value))}
            />
          </label>
        </div>
        {error && <p role="alert">{error}</p>}
        {result && (
          <>
            <p className={s.metric}>
              {result.destroyed
                ? "Destroyed under these assumptions"
                : Math.ceil(result.remainingHp) + " HP remaining"}
            </p>
            <p>
              Combined modeled damage: {Math.floor(result.damage).toLocaleString()} · Spell space:{" "}
              {lightning + quakes}
            </p>
            <p className={s.quiet}>
              {result.assumptions} Verify special target behavior and current game balance.
            </p>
          </>
        )}
      </Panel>
    );
  }
  const kind = tool === "Army library" ? "ARMY" : "BASE";
  const fields = (v: any, set: any) => (
    <>
      <label>
        Official {kind === "ARMY" ? "army" : "base"} link
        <input
          required
          value={v.link ?? ""}
          onChange={(e) => set("link", e.target.value)}
          placeholder="https://link.clashofclans.com/…"
        />
      </label>
      <label>
        Town Hall
        <input
          type="number"
          min={1}
          max={30}
          value={v.townHall ?? 13}
          onChange={(e) => set("townHall", Number(e.target.value))}
        />
      </label>
      {kind === "ARMY" ? (
        <>
          <label>
            Strategy
            <input required value={v.strategy ?? ""} onChange={(e) => set("strategy", e.target.value)} />
          </label>
          <label>
            Hero / equipment choices
            <textarea value={v.equipment ?? ""} onChange={(e) => set("equipment", e.target.value)} />
          </label>
          <label>
            Demonstration video URL
            <input type="url" value={v.videoUrl ?? ""} onChange={(e) => set("videoUrl", e.target.value)} />
          </label>
        </>
      ) : (
        <>
          <label>
            Purpose
            <select value={v.purpose ?? "WAR"} onChange={(e) => set("purpose", e.target.value)}>
              {["WAR", "FARMING", "TROPHY", "BUILDER"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            Last tested
            <input
              type="date"
              value={v.lastTested ?? ""}
              onChange={(e) => set("lastTested", e.target.value)}
            />
          </label>
          <label>
            Screenshot (PNG, JPEG or WebP, below 2 MB)
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={async (e) => {
                try {
                  if (e.target.files?.[0]) set("imageData", await imageFile(e.target.files[0]));
                } catch (e: any) {
                  ctx.message(e.message);
                }
              }}
            />
          </label>
        </>
      )}
    </>
  );
  return (
    <>
      <Panel title={tool}>
        {kind === "ARMY" && (
          <div className={s.form}>
            <label>
              Inspect an army link
              <input
                value={army}
                onChange={(e) => setArmy(e.target.value)}
                placeholder="Paste an official army link or u…s… code"
              />
            </label>
            <button
              onClick={() => {
                try {
                  setParsed(parseArmyLink(army, ctx.state.catalog));
                } catch (e: any) {
                  ctx.message(e.message);
                  setParsed(null);
                }
              }}
            >
              Inspect Army
            </button>
            {parsed && (
              <>
                <Table
                  heads={["Unit", "Quantity", "Housing each"]}
                  rows={parsed.entries.map((e: any) => [e.name, e.amount, e.housing ?? "Unknown"])}
                />
                <p>
                  {parsed.troopSpace} known troop space · {parsed.spellSpace} known spell space{" "}
                  {parsed.unknownHousing ? "· Contains unknown entries; totals are incomplete" : ""}
                </p>
                <a href={parsed.url}>Open in Clash</a>
              </>
            )}
          </div>
        )}
        <DocumentCards
          ctx={ctx}
          kind={kind}
          create={() => {
            setEditing(null);
            setDraft(true);
          }}
          open={(d) => void open(d)}
        >
          {(d) => (
            <>
              <span className={s.tag}>TH {d.payload.townHall}</span>
              <span className={s.tag}>{d.payload.strategy ?? d.payload.purpose}</span>
              <p>
                {d.rating ? d.rating + " / 5" : "Unrated"} · {d.comments} comments
              </p>
              {d.payload.lastTested && <p>Last tested {d.payload.lastTested}</p>}
              <a href={d.payload.link} target="_blank" rel="noreferrer">
                Open in game ↗
              </a>
            </>
          )}
        </DocumentCards>
      </Panel>
      {draft && (
        <DocumentEditor
          ctx={ctx}
          kind={kind}
          initial={editing}
          fields={fields}
          close={() => {
            setDraft(false);
            setEditing(null);
          }}
        />
      )}
      {detail && (
        <div className={s.modal}>
          <section role="dialog" aria-modal="true" aria-label="Library entry">
            <div className={s.toolbar}>
              <h3>{detail.title}</h3>
              <button onClick={() => setDetail(null)}>Close</button>
            </div>
            {detail.payload.imageData && (
              <img className={s.image} src={detail.payload.imageData} alt={detail.title} />
            )}
            <p className={s.body}>{detail.body}</p>
            {detail.payload.equipment && (
              <p className={s.body}>Hero / equipment: {detail.payload.equipment}</p>
            )}
            {detail.payload.videoUrl && (
              <a href={detail.payload.videoUrl} target="_blank" rel="noreferrer">
                Watch demonstration ↗
              </a>
            )}
            <div className={s.buttons}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={async () => {
                    await ctx.act("/documents/" + detail.id + "/rating", { score: n });
                    await open(detail);
                  }}
                >
                  Rate {n}★
                </button>
              ))}
              {(ctx.state.manager || detail.owner_id === ctx.state.viewerId) && (
                <button
                  onClick={() => {
                    setEditing(detail);
                    setDraft(true);
                    setDetail(null);
                  }}
                >
                  Edit entry
                </button>
              )}
            </div>
            <h4>Discussion</h4>
            {detail.comments.map((c: any) => (
              <p key={c.id}>
                <b>{c.user_id}</b>: {c.note}
              </p>
            ))}
            <label>
              Comment
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} />
            </label>
            <button
              disabled={!comment.trim() || ctx.busy}
              onClick={async () => {
                if (await ctx.act("/documents/" + detail.id + "/comments", { note: comment })) {
                  setComment("");
                  await open(detail);
                }
              }}
            >
              Add Comment
            </button>
          </section>
        </div>
      )}
    </>
  );
}
export function AttackBoard({ ctx }: { ctx: ToolContext }) {
  const [title, setTitle] = useState("Attack plan"),
    [body, setBody] = useState(""),
    [image, setImage] = useState(""),
    [strokes, setStrokes] = useState<any[]>([]),
    [mode, setMode] = useState("ARROW"),
    [color, setColor] = useState("#f4c56a"),
    [label, setLabel] = useState(""),
    [doc, setDoc] = useState<any>(null),
    [visibility, setVisibility] = useState("CLAN"),
    [dragging, setDragging] = useState(false);
  const board = useRef<SVGSVGElement>(null);
  const pos = (e: React.PointerEvent) => {
    const box = board.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
    };
  };
  async function load(d: any) {
    try {
      const full = await toolRequest("/documents/" + d.id);
      setDoc(full);
      setTitle(full.title);
      setBody(full.body);
      setImage(full.payload.imageData ?? "");
      setStrokes(full.payload.strokes ?? []);
      setVisibility(full.visibility);
    } catch (e: any) {
      ctx.message(e.message);
    }
  }
  async function save() {
    const b = {
        kind: "BOARD",
        title,
        body,
        visibility,
        payload: { imageData: image || undefined, strokes },
        ...(doc ? { expectedRevision: doc.revision } : {}),
      },
      r = await ctx.act(doc ? "/documents/" + doc.id : "/documents", b, doc ? "PUT" : "POST");
    if (r) await load({ id: doc?.id ?? r.id });
  }
  async function exportPng() {
    const canvas = document.createElement("canvas");
    canvas.width = 1400;
    canvas.height = 1400;
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#192526";
    g.fillRect(0, 0, 1400, 1400);
    if (image) {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Image could not be loaded"));
        img.src = image;
      });
      g.drawImage(img, 0, 0, 1400, 1400);
    }
    for (const st of strokes) {
      g.strokeStyle = st.color;
      g.fillStyle = st.color;
      g.lineWidth = 5;
      if (st.type === "LABEL") {
        g.font = "25px Arial";
        g.fillText(st.label, st.points[0].x * 1400, st.points[0].y * 1400);
        continue;
      }
      g.beginPath();
      st.points.forEach((p: any, i: number) =>
        i ? g.lineTo(p.x * 1400, p.y * 1400) : g.moveTo(p.x * 1400, p.y * 1400),
      );
      g.stroke();
      if (st.type === "ARROW" && st.points.length > 1) {
        const a = st.points.at(-2),
          b = st.points.at(-1),
          angle = Math.atan2(b.y - a.y, b.x - a.x);
        g.beginPath();
        g.moveTo(b.x * 1400, b.y * 1400);
        g.lineTo(b.x * 1400 - 20 * Math.cos(angle - 0.5), b.y * 1400 - 20 * Math.sin(angle - 0.5));
        g.lineTo(b.x * 1400 - 20 * Math.cos(angle + 0.5), b.y * 1400 - 20 * Math.sin(angle + 0.5));
        g.closePath();
        g.fill();
      }
    }
    g.font = "18px Arial";
    g.fillStyle = "#fff";
    g.fillText("BOM · " + title.slice(0, 80), 20, 1375);
    const a = document.createElement("a");
    a.download = "bom-attack-plan.png";
    a.href = canvas.toDataURL("image/png");
    a.click();
  }
  return (
    <>
      <Panel title="Attack drawing board">
        <div className={s.form}>
          <label>
            Plan title
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            Upload a base screenshot
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={async (e) => {
                try {
                  if (e.target.files?.[0]) setImage(await imageFile(e.target.files[0]));
                } catch (e: any) {
                  ctx.message(e.message);
                }
              }}
            />
          </label>
          <div className={s.row}>
            <label>
              Tool
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                {["ARROW", "PATH", "LABEL"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label>
              Color
              <select value={color} onChange={(e) => setColor(e.target.value)}>
                {["#f4c56a", "#ef7777", "#7ac9f2", "#92d6a6", "#ffffff"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            {mode === "LABEL" && (
              <label>
                Label
                <input maxLength={100} value={label} onChange={(e) => setLabel(e.target.value)} />
              </label>
            )}
            <button onClick={() => setStrokes((v) => v.slice(0, -1))}>Undo</button>
            <button
              onClick={() => {
                if (confirm("Clear annotations?")) setStrokes([]);
              }}
            >
              Clear
            </button>
          </div>
          <div className={s.board}>
            {image && <img src={image} alt="Base screenshot" />}
            <svg
              aria-label="Attack annotation canvas"
              role="img"
              ref={board}
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              onPointerDown={(e) => {
                if (strokes.length >= 500) {
                  ctx.message("Plan is limited to 500 annotations");
                  return;
                }
                if (mode === "LABEL" && !label.trim()) {
                  ctx.message("Enter a label first");
                  return;
                }
                e.currentTarget.setPointerCapture(e.pointerId);
                setStrokes((v) => [...v, { type: mode, color, label, points: [pos(e)] }]);
                setDragging(mode !== "LABEL");
              }}
              onPointerMove={(e) => {
                if (!dragging) return;
                const p = pos(e);
                setStrokes((v) => {
                  const copy = [...v],
                    last = { ...copy.at(-1) };
                  if (last.points.length < 1000) last.points = [...last.points, p];
                  copy[copy.length - 1] = last;
                  return copy;
                });
              }}
              onPointerUp={() => setDragging(false)}
              onPointerCancel={() => setDragging(false)}
            >
              <defs>
                <marker
                  id="bom-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
                </marker>
              </defs>
              {strokes.map((st, i) =>
                st.type === "LABEL" ? (
                  <text
                    key={i}
                    x={st.points[0].x * 1000}
                    y={st.points[0].y * 1000}
                    fill={st.color}
                    fontSize="20"
                  >
                    {st.label}
                  </text>
                ) : (
                  <polyline
                    key={i}
                    points={st.points.map((p: any) => `${p.x * 1000},${p.y * 1000}`).join(" ")}
                    stroke={st.color}
                    strokeWidth="4"
                    fill="none"
                    markerEnd={st.type === "ARROW" ? "url(#bom-arrow)" : undefined}
                  />
                ),
              )}
            </svg>
          </div>
          <label>
            Deployment / spell instructions
            <textarea value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          <label>
            Visibility
            <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              <option value="PRIVATE">Only me</option>
              <option value="CLAN">Clan</option>
              <option value="OFFICERS">Officers</option>
            </select>
          </label>
          <div className={s.buttons}>
            <button disabled={ctx.busy || !title.trim()} onClick={() => void save()}>
              Save Plan
            </button>
            <button onClick={() => void exportPng().catch((e) => ctx.message(e.message))}>Export PNG</button>
            <button
              onClick={() =>
                download(
                  "bom-annotations.json",
                  JSON.stringify({ title, body, strokes }, null, 2),
                  "application/json",
                )
              }
            >
              Export annotations
            </button>
            <button
              onClick={() => {
                setDoc(null);
                setImage("");
                setStrokes([]);
                setTitle("Attack plan");
              }}
            >
              New Plan
            </button>
          </div>
        </div>
        <p className={s.quiet}>
          Annotations are manual coaching notes. No attack execution or game-screen access is performed.
        </p>
      </Panel>
      <Panel title="Saved attack plans">
        <DocumentCards ctx={ctx} kind="BOARD" open={(d) => void load(d)} />
      </Panel>
    </>
  );
}
