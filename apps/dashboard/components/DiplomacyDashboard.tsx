"use client";
import { useEffect, useState } from "react";
import AllianceBoard from "./AllianceBoard";
import {
  guildReference,
  allianceChartSvg,
  emptyDiplomacy,
  normalizeDiplomacy,
  type Diplomacy,
} from "@bom/shared";
import { operationsApi, displayDate } from "./operationsApi";
import "./CommunityOperations.css";
export default function DiplomacyDashboard() {
  const [state, setState] = useState<any>(null),
    [data, setData] = useState<Diplomacy>(emptyDiplomacy()),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [zoom, setZoom] = useState(0.75),
    [dirty, setDirty] = useState(false);
  const [name, setName] = useState(""),
    [color, setColor] = useState("#52b9ae"),
    [search, setSearch] = useState(""),
    [guild, setGuild] = useState("");
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [status, setStatus] = useState<"ALLIED" | "NEUTRAL" | "NAP" | "HOSTILE">("ALLIED"),
    [directed, setDirected] = useState(false);
  async function load() {
    const s = await operationsApi("community/diplomacy");
    setState(s);
    setData(normalizeDiplomacy(s.data));
    setDirty(false);
  }
  useEffect(() => {
    void load().catch((e) => setNotice(e.message));
  }, []);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    window.dispatchEvent(new CustomEvent("bom:dirty", { detail: { dirty } }));
    return () => {
      window.removeEventListener("beforeunload", handler);
      window.dispatchEvent(new CustomEvent("bom:dirty", { detail: { dirty: false } }));
    };
  }, [dirty]);
  const update = (next: Diplomacy) => {
    setData(next);
    setDirty(true);
  };
  async function save() {
    setBusy(true);
    try {
      await operationsApi("community/diplomacy", {
        method: "PUT",
        body: JSON.stringify({ revision: state.revision, data }),
      });
      await load();
      setNotice("Saved. The Discord alliance chart will refresh automatically.");
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  const catalogue: any[] = state?.guilds ?? [],
    label = (ref: string) => {
      const g = catalogue.find((g) => guildReference(g) === ref);
      return g ? g.tag + " — " + g.name : ref;
    };
  const options = [
    ...data.trackedGuilds.map((ref) => ({ value: "guild:" + ref, label: label(ref) })),
    ...data.alliances.map((a) => ({ value: "alliance:" + a.id, label: "Alliance: " + a.name })),
  ];
  const relationLabel = (id: string) => options.find((o) => o.value === id)?.label ?? id;
  const removeGuild = (ref: string) =>
    update({
      ...data,
      trackedGuilds: data.trackedGuilds.filter((x) => x !== ref),
      memberships: data.memberships.filter((m) => m.guildTag !== ref),
      relations: data.relations.filter((r) => r.from !== "guild:" + ref && r.to !== "guild:" + ref),
    });
  return (
    <div className="opsPage">
      <header>
        <div>
          <h1>Guilds & Alliances</h1>
          <p>
            Track only the guilds and alliances you add · Last recorded edit {displayDate(state?.updated_at)}
          </p>
        </div>
        <div className="opsActions">
          <button
            disabled={busy}
            onClick={() => {
              if (!dirty || confirm("Discard unsaved changes?")) {
                setBusy(true);
                void load()
                  .catch((e) => setNotice(e.message))
                  .finally(() => setBusy(false));
              }
            }}
          >
            Refresh
          </button>
          {state?.canManage && (
            <button className="primary" disabled={busy || !dirty} onClick={() => void save()}>
              Save Diplomacy
            </button>
          )}
        </div>
      </header>
      {notice && (
        <div className="opsNotice" role="status">
          {notice}
        </div>
      )}
      <AllianceBoard
        data={data}
        guilds={catalogue}
        editable={Boolean(state?.canManage) && !busy}
        onChange={update}
      />
      <section className="opsCard">
        <div className="opsToolbar">
          <h2>WoSB Alliance Chart</h2>
          <label>
            Zoom{" "}
            <input
              type="range"
              min="0.3"
              max="1.5"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </label>
          <a
            className="opsLink"
            href="/api/internal/community/diplomacy/chart"
            target="_blank"
            rel="noreferrer"
          >
            Open Saved Chart
          </a>
        </div>
        <div className="opsGraph" role="img" aria-label="Tracked guilds and alliance relationships">
          <div style={{ zoom }} dangerouslySetInnerHTML={{ __html: allianceChartSvg(data, catalogue) }} />
        </div>
        <p className="opsHint">
          Preview includes unsaved changes. Adding a catalogue guild here does not change port battle access.
          Guilds are never automatically tracked.
        </p>
      </section>
      {state?.canManage && (
        <fieldset disabled={busy} className="uiBareFieldset uiStackLg">
          <div className="opsGrid">
            <section className="opsCard">
              <h2>Tracked Guilds</h2>
              <label>
                Search guild catalogue
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setGuild("");
                  }}
                />
              </label>
              <label>
                Add guild
                <select value={guild} onChange={(e) => setGuild(e.target.value)}>
                  <option value="">Choose a guild</option>
                  {catalogue
                    .filter(
                      (g) =>
                        !data.trackedGuilds.includes(guildReference(g)) &&
                        `${g.tag} ${g.name}`.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((g) => (
                      <option key={guildReference(g)} value={guildReference(g)}>
                        {g.tag} — {g.name}
                      </option>
                    ))}
                </select>
              </label>
              <button
                disabled={!guild}
                onClick={() => {
                  update({ ...data, trackedGuilds: [...data.trackedGuilds, guild] });
                  setGuild("");
                }}
              >
                Add Guild
              </button>
              <div className="opsList">
                {data.trackedGuilds.map((ref) => (
                  <article key={ref}>
                    <b>{label(ref)}</b>
                    <label>
                      Alliance
                      <select
                        value={data.memberships.find((m) => m.guildTag === ref)?.allianceId ?? ""}
                        onChange={(e) =>
                          update({
                            ...data,
                            memberships: [
                              ...data.memberships.filter((m) => m.guildTag !== ref),
                              ...(e.target.value ? [{ guildTag: ref, allianceId: e.target.value }] : []),
                            ],
                          })
                        }
                      >
                        <option value="">Independent</option>
                        {data.alliances.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            "Stop tracking this guild? Its chart membership and relationships will be removed.",
                          )
                        )
                          removeGuild(ref);
                      }}
                    >
                      Remove Guild
                    </button>
                  </article>
                ))}
              </div>
              {!data.trackedGuilds.length && <p className="uiEmpty">No guilds tracked.</p>}
            </section>
            <section className="opsCard">
              <h2>Alliances</h2>
              <label>
                Alliance name
                <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
              </label>
              <label>
                Alliance color
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
              </label>
              <button
                disabled={!name.trim()}
                onClick={() => {
                  update({
                    ...data,
                    alliances: [...data.alliances, { id: crypto.randomUUID(), name: name.trim(), color }],
                  });
                  setName("");
                }}
              >
                Add Alliance
              </button>
              <div className="opsList">
                {data.alliances.map((a) => (
                  <article key={a.id}>
                    <label>
                      Name
                      <input
                        value={a.name}
                        maxLength={80}
                        onChange={(e) =>
                          update({
                            ...data,
                            alliances: data.alliances.map((x) =>
                              x.id === a.id ? { ...x, name: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Color
                      <input
                        type="color"
                        value={a.color}
                        onChange={(e) =>
                          update({
                            ...data,
                            alliances: data.alliances.map((x) =>
                              x.id === a.id ? { ...x, color: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            "Remove this alliance? Its guilds stay tracked as independent; its relationships are removed.",
                          )
                        )
                          update({
                            ...data,
                            alliances: data.alliances.filter((x) => x.id !== a.id),
                            memberships: data.memberships.filter((m) => m.allianceId !== a.id),
                            relations: data.relations.filter(
                              (r) => r.from !== "alliance:" + a.id && r.to !== "alliance:" + a.id,
                            ),
                          });
                      }}
                    >
                      Remove Alliance
                    </button>
                  </article>
                ))}
              </div>
            </section>
          </div>
          <section className="opsCard">
            <h2>Add Relationship</h2>
            <div className="opsRow">
              <label>
                From
                <select value={from} onChange={(e) => setFrom(e.target.value)}>
                  <option value="">Choose tracked guild / alliance</option>
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                To
                <select value={to} onChange={(e) => setTo(e.target.value)}>
                  <option value="">Choose tracked guild / alliance</option>
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select value={status} onChange={(e) => setStatus(e.target.value as any)}>
                  {["ALLIED", "NAP", "NEUTRAL", "HOSTILE"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="opsCheckbox">
                <input type="checkbox" checked={directed} onChange={(e) => setDirected(e.target.checked)} />
                One-way
              </label>
              <button
                disabled={
                  !options.some((o) => o.value === from) ||
                  !options.some((o) => o.value === to) ||
                  from === to
                }
                onClick={() =>
                  update({
                    ...data,
                    relations: [
                      ...data.relations.filter(
                        (r) =>
                          !(
                            (r.from === from && r.to === to) ||
                            ((!directed || !r.directed) && r.from === to && r.to === from)
                          ),
                      ),
                      { from, to, status, directed },
                    ],
                  })
                }
              >
                Set Relationship
              </button>
            </div>
          </section>
        </fieldset>
      )}
      <section className="opsCard">
        <h2>Relationships</h2>
        <div className="opsTableScroll">
          <table>
            <thead>
              <tr>
                <th>From</th>
                <th>To</th>
                <th>Status</th>
                <th>Direction</th>
                {state?.canManage && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {data.relations.map((r, i) => (
                <tr key={i}>
                  <td>{relationLabel(r.from)}</td>
                  <td>{relationLabel(r.to)}</td>
                  <td>{r.status}</td>
                  <td>{r.directed ? "One-way" : "Mutual"}</td>
                  {state?.canManage && (
                    <td>
                      <button
                        disabled={busy}
                        onClick={() =>
                          update({ ...data, relations: data.relations.filter((_, n) => n !== i) })
                        }
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
