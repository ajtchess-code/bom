"use client";
import { useEffect, useState } from "react";
import { operationsApi, displayDate } from "./operationsApi";
import "./CommunityOperations.css";
export default function PermissionPresetsDashboard() {
  const [data, setData] = useState<any>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [source, setSource] = useState(""),
    [name, setName] = useState(""),
    [members, setMembers] = useState(false),
    [preset, setPreset] = useState(""),
    [stack, setStack] = useState<string[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [search, setSearch] = useState(""),
    [mode, setMode] = useState("REPLACE"),
    [preview, setPreview] = useState<any>(null),
    [result, setResult] = useState<any>(null);
  async function load() {
    setData(await operationsApi("admin/permission-presets"));
  }
  useEffect(() => {
    void load().catch((e) => setNotice(e.message));
  }, []);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  const channels = data?.channels ?? [],
    visible = channels.filter((c: any) => c.name.toLowerCase().includes(search.toLowerCase()));
  const roleName = (id: string) => data?.roles?.find((r: any) => r.id === id)?.name ?? id;
  const permissionText = (value: string) => {
    const bits = BigInt(value);
    const names: [[bigint, string]] | any = [
      [1n, "Create invite"],
      [2n, "Kick members"],
      [4n, "Ban members"],
      [8n, "Administrator"],
      [16n, "Manage channels"],
      [64n, "Add reactions"],
      [1024n, "View channel"],
      [2048n, "Send messages"],
      [4096n, "Send TTS"],
      [8192n, "Manage messages"],
      [16384n, "Embed links"],
      [32768n, "Attach files"],
      [65536n, "Read history"],
      [131072n, "Mention everyone"],
      [262144n, "External emoji"],
      [1048576n, "Connect"],
      [2097152n, "Speak"],
      [4194304n, "Mute members"],
      [8388608n, "Deafen members"],
      [16777216n, "Move members"],
      [33554432n, "Voice activity"],
      [268435456n, "Manage roles"],
      [536870912n, "Manage webhooks"],
      [2147483648n, "Application commands"],
      [17179869184n, "Manage threads"],
      [34359738368n, "Public threads"],
      [68719476736n, "Private threads"],
      [137438953472n, "External stickers"],
      [274877906944n, "Send in threads"],
      [4398046511104n, "Soundboard"],
      [35184372088832n, "External sounds"],
    ];
    const set = names.filter(([bit]: any) => (bits & bit) !== 0n).map(([, label]: any) => label);
    return set.join(", ") || "None";
  };
  const overwriteText = (rows: any[]) =>
    rows
      .map(
        (r) =>
          `${r.type === 0 ? "Role" : "Member"}: ${r.type === 0 ? roleName(r.id) : r.id} · Allow: ${permissionText(r.allow)} · Deny: ${permissionText(r.deny)}`,
      )
      .join("\n") || "No channel-specific overrides (server base permissions apply).";
  return (
    <div className="opsPage">
      <header>
        <div>
          <h1>Channel Permission Presets</h1>
          <p>Capture permissions once, preview changes, and apply them to selected channels.</p>
        </div>
        <button disabled={busy} onClick={() => void act(load)}>
          Refresh Channels & Roles
        </button>
      </header>
      {notice && (
        <div className="opsNotice" role="status">
          {notice}
        </div>
      )}
      <div className="opsGrid">
        <section className="opsCard">
          <h2>Save a Permission Preset</h2>
          <label>
            Source channel
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Choose channel</option>
              {channels.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.type === 4 ? "Category: " : c.type === 2 ? "Voice: " : "#"}
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Preset name
            <input
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              placeholder="BOM Members · Read & Chat"
            />
          </label>
          <label className="opsCheckbox">
            <input type="checkbox" checked={members} onChange={(e) => setMembers(e.target.checked)} />
            Include individual member overrides
          </label>
          <p className="opsHint">
            Role overrides are always captured, including @everyone. Channel settings and server-wide role
            permissions are not copied. The saved snapshot stays unchanged if the source channel is edited
            later.
          </p>
          {source && (
            <details>
              <summary>Source permission overrides</summary>
              <pre className="uiPre">
                {overwriteText(
                  (channels.find((c: any) => c.id === source)?.permission_overwrites ?? []).filter(
                    (o: any) => members || o.type === 0,
                  ),
                )}
              </pre>
            </details>
          )}
          <button
            className="primary"
            disabled={busy || !source || !name.trim()}
            onClick={() =>
              void act(async () => {
                const saved = await operationsApi("admin/permission-presets", {
                  method: "POST",
                  body: JSON.stringify({ channelId: source, name, includeMembers: members }),
                });
                setPreset(saved.id);
                setStack([saved.id]);
                setName("");
                setNotice("Permission preset saved.");
              })
            }
          >
            Save Preset
          </button>
        </section>
        <section className="opsCard">
          <h2>Choose Preset & Mode</h2>
          <div className="opsList">
            {data?.presets?.map((p: any) => (
              <label className="opsCheckbox" key={p.id}>
                <input
                  type="checkbox"
                  checked={stack.includes(p.id)}
                  onChange={(e) => {
                    const next = e.target.checked ? [...stack, p.id] : stack.filter((x) => x !== p.id);
                    setStack(next);
                    setPreset(next[0] ?? "");
                    setPreview(null);
                  }}
                />
                {p.name}
              </label>
            ))}
          </div>
          <h3>Priority · Highest First</h3>
          <p className="opsHint">
            For the same role or member override, the first preset wins conflicting permission bits. Lower
            presets add bits left unspecified. Discord still combines a user's roles using its normal
            allow/deny rules.
          </p>
          {stack.map((id, n) => (
            <div className="opsToolbar" key={id}>
              <b>
                {n + 1}. {data?.presets?.find((p: any) => p.id === id)?.name}
              </b>
              <div>
                <button
                  disabled={n === 0}
                  aria-label="Move preset up"
                  onClick={() => {
                    const next = [...stack];
                    [next[n - 1], next[n]] = [next[n], next[n - 1]];
                    setStack(next);
                    setPreset(next[0]);
                    setPreview(null);
                  }}
                >
                  ↑
                </button>
                <button
                  disabled={n === stack.length - 1}
                  aria-label="Move preset down"
                  onClick={() => {
                    const next = [...stack];
                    [next[n + 1], next[n]] = [next[n], next[n + 1]];
                    setStack(next);
                    setPreset(next[0]);
                    setPreview(null);
                  }}
                >
                  ↓
                </button>
              </div>
            </div>
          ))}
          <label>
            Apply mode
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value);
                setPreview(null);
              }}
            >
              <option value="REPLACE">Replace all channel overrides</option>
              <option value="MERGE">Merge — preserve permissions left unspecified</option>
            </select>
          </label>
          <p className="opsHint">
            Replace makes each selected channel match the saved preset exactly. Merge preserves overrides for
            roles or members absent from the preset. Changes to a category also affect its synced children.
          </p>
          {preset && (
            <details>
              <summary>Saved permission overrides</summary>
              <pre className="uiPre">
                {overwriteText(data?.presets?.find((p: any) => p.id === preset)?.overwrites ?? [])}
              </pre>
              <button
                className="danger"
                disabled={busy}
                onClick={() => {
                  if (confirm("Archive this preset? Existing batch history is retained."))
                    void act(async () => {
                      await operationsApi(`admin/permission-presets/${preset}/archive`, { method: "POST" });
                      const next = stack.filter((x) => x !== preset);
                      setPreset(next[0] ?? "");
                      setStack(next);
                      setPreview(null);
                    });
                }}
              >
                Archive Preset
              </button>
            </details>
          )}
        </section>
      </div>
      <section className="opsCard">
        <div className="opsToolbar">
          <h2>Target Channels · {selected.length} selected</h2>
          <input
            aria-label="Search target channels"
            placeholder="Search channels"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            disabled={busy || !visible.length}
            onClick={() => {
              setSelected([...new Set([...selected, ...visible.map((c: any) => c.id)])]);
              setPreview(null);
            }}
          >
            Select Visible
          </button>
          <button
            onClick={() => {
              setSelected([]);
              setPreview(null);
            }}
          >
            Clear
          </button>
        </div>
        <div className="opsGrid">
          {visible.map((c: any) => (
            <label className="opsCheckbox" key={c.id}>
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                onChange={(e) => {
                  setSelected(e.target.checked ? [...selected, c.id] : selected.filter((x) => x !== c.id));
                  setPreview(null);
                }}
              />
              {c.type === 4 ? "▣ " : c.type === 2 ? "🔊 " : "#"}
              {c.name}
              <small>
                {c.parent_id ? " · " + channels.find((x: any) => x.id === c.parent_id)?.name : ""}
              </small>
            </label>
          ))}
        </div>
        <button
          className="primary"
          disabled={busy || !preset || !selected.length || selected.length > 100}
          onClick={() =>
            void act(async () => {
              const p = await operationsApi(`admin/permission-presets/${preset}/preview`, {
                method: "POST",
                body: JSON.stringify({ channelIds: selected, mode, presetIds: stack }),
              });
              setPreview(p);
              setResult(null);
              setNotice("Review the changes below before applying.");
            })
          }
        >
          Preview Changes
        </button>
        {selected.length > 100 && <p>Select at most 100 channels per batch.</p>}
      </section>
      {preview && (
        <section className="opsCard">
          <h2>Permission Change Preview</h2>
          <p className="opsHint">
            Preview expires in 15 minutes. Channels changed after this preview will be skipped and reported as
            conflicts.
          </p>
          <div className="opsList">
            {preview.changes.map((c: any) => (
              <article key={c.channelId}>
                <b>{c.name}</b> · {c.status}
                {c.warning && <p className="opsNotice">{c.warning}</p>}
                <details>
                  <summary>Compare before / after</summary>
                  <div className="opsGrid">
                    <section>
                      <h3>Before</h3>
                      <pre className="uiPre">{overwriteText(c.before)}</pre>
                    </section>
                    <section>
                      <h3>After</h3>
                      <pre className="uiPre">{overwriteText(c.after)}</pre>
                    </section>
                  </div>
                </details>
              </article>
            ))}
          </div>
          <button
            className="primary"
            disabled={busy}
            onClick={() => {
              if (
                confirm(
                  `Apply this preset to ${preview.changes.length} channels? ${mode === "REPLACE" ? "Existing overrides will be replaced." : ""}`,
                )
              )
                void act(async () => {
                  const r = await operationsApi(`admin/permission-presets/batches/${preview.id}/apply`, {
                    method: "POST",
                  });
                  setResult(r);
                  setPreview(null);
                  setNotice("Batch completed. Review each channel result below.");
                });
            }}
          >
            Apply Preset to Selected Channels
          </button>
        </section>
      )}
      {result && (
        <section className="opsCard">
          <h2>Batch Result · {result.status}</h2>
          {result.changes.map((c: any) => (
            <p key={c.channelId}>
              {c.name} — <b>{c.status}</b>
              {c.error ? " · " + c.error : ""}
            </p>
          ))}
        </section>
      )}
      <section className="opsCard">
        <h2>Batch History & Undo</h2>
        <div className="opsList">
          {data?.batches?.map((b: any) => (
            <article key={b.id}>
              <div className="opsToolbar">
                <b>
                  {(b.preset_ids?.length ? b.preset_ids : [b.preset_id])
                    .map(
                      (id: string) => data.presets.find((p: any) => p.id === id)?.name ?? "Archived preset",
                    )
                    .join(" → ")}{" "}
                  · {b.status}
                </b>
                <span>{displayDate(b.created_at)}</span>
              </div>
              <p>
                {b.changes.length} channels · Requested by {b.actor_id}
              </p>
              <details>
                <summary>Per-channel results</summary>
                {b.changes.map((c: any) => (
                  <p key={c.channelId}>
                    {c.name} — {c.status}
                    {c.error ? " · " + c.error : ""}
                  </p>
                ))}
              </details>
              {b.status === "APPLYING" && (
                <button
                  disabled={busy || new Date(b.expires_at).getTime() > Date.now()}
                  onClick={() =>
                    void act(async () => {
                      setResult(
                        await operationsApi(`admin/permission-presets/batches/${b.id}/recover`, {
                          method: "POST",
                        }),
                      );
                      setNotice("Interrupted batch checked against live permissions.");
                    })
                  }
                >
                  Recover Interrupted Batch
                </button>
              )}
              {["APPLIED", "PARTIAL"].includes(b.status) && (
                <button
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        "Undo this batch? Channels edited since the batch will be skipped to preserve newer changes.",
                      )
                    )
                      void act(async () => {
                        setResult(
                          await operationsApi(`admin/permission-presets/batches/${b.id}/undo`, {
                            method: "POST",
                          }),
                        );
                        setNotice("Undo completed. Review the results.");
                      });
                  }}
                >
                  Undo Batch
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
