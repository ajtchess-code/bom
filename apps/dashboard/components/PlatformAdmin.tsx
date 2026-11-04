"use client";
import DiscordOptionsSelect from "./DiscordOptionsSelect";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import DiscordPreview from "./DiscordPreview";
import { SaveBar, SettingRow, StatusBadge } from "./DesignSystem";

const LABELS: Record<string, string> = {
  recruitment: "Recruitment",
  portBattles: "Port Battles",
  wiki: "Wiki",
  music: "Music",
  membership: "Membership",
  minecraft: "Minecraft",
  publicTools: "Public Tools",
  activityFeed: "Activity Feed",
  notificationCenter: "Notification Center",
  supportCenter: "Support Center",
  experimentalUi: "Experimental UI",
};
async function api(path: string, init: RequestInit = {}) {
  const h = new Headers(init.headers);
  if (init.body && !h.has("content-type")) h.set("content-type", "application/json");
  const r = await fetch(`/api/internal/platform${path}`, { ...init, headers: h, cache: "no-store" });
  const t = await r.text();
  let b: any = {};
  try {
    b = t ? JSON.parse(t) : {};
  } catch {
    b = { message: t };
  }
  if (!r.ok) throw new Error(b.message ?? b.error ?? `Request failed (${r.status})`);
  return b;
}
export default function PlatformAdmin() {
  const [data, setData] = useState<any>(null),
    [flags, setFlags] = useState<Record<string, boolean>>({}),
    [initialFlags, setInitialFlags] = useState<Record<string, boolean>>({}),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [preview, setPreview] = useState<any>(null),
    [filter, setFilter] = useState(""),
    [rankData, setRankData] = useState<any>(null),
    [rankMap, setRankMap] = useState<Record<string, string>>({});
  const importRef = useRef<HTMLInputElement | null>(null);
  const dirty = JSON.stringify(flags) !== JSON.stringify(initialFlags);
  async function load() {
    try {
      const [d, ranks] = await Promise.all([api("/summary"), api("/member-ranks").catch(() => null)]);
      setData(d);
      if (ranks) {
        setRankData(ranks);
        setRankMap(ranks.roleMap ?? {});
      }
      const f = d.settings?.feature_flags ?? {};
      setFlags(f);
      setInitialFlags(f);
    } catch (e: any) {
      setNotice(e.message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("bom:dirty", { detail: { dirty } }));
    return () => {
      window.dispatchEvent(new CustomEvent("bom:dirty", { detail: { dirty: false } }));
    };
  }, [dirty]);
  async function save() {
    setBusy(true);
    try {
      await api("/settings", { method: "PUT", body: JSON.stringify({ featureFlags: flags }) });
      setInitialFlags(flags);
      setNotice("Platform settings saved.");
      await load();
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function saveRanks() {
    setBusy(true);
    try {
      await api("/member-ranks", { method: "PUT", body: JSON.stringify({ roleMap: rankMap }) });
      setNotice("Member rank role mapping saved.");
      await load();
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    if (!confirm("Reset platform feature flags to BOM defaults?")) return;
    setBusy(true);
    try {
      await api("/settings/reset", { method: "POST", body: JSON.stringify({ section: "featureFlags" }) });
      setNotice("Feature flags reset to defaults.");
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function resetOne(key: string) {
    setBusy(true);
    try {
      const r = await api("/settings/reset", {
        method: "POST",
        body: JSON.stringify({ section: "featureFlags", key }),
      });
      const f = r.settings?.feature_flags ?? r.settings?.featureFlags ?? {};
      setFlags(f);
      setInitialFlags(f);
      setNotice(`${LABELS[key] ?? key} reset to the BOM default.`);
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function exportConfig() {
    setBusy(true);
    try {
      const r = await fetch("/api/internal/platform/config/export", { cache: "no-store" });
      if (!r.ok) throw new Error(`Export failed (${r.status})`);
      const blob = await r.blob(),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `bom-config-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Configuration export downloaded.");
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function importConfig(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (
      !confirm(
        "Import this configuration? Existing channel, role and module settings included in the export may be replaced.",
      )
    )
      return;
    setBusy(true);
    try {
      const bundle = JSON.parse(await file.text());
      const result = await api("/config/import", { method: "POST", body: JSON.stringify({ bundle }) });
      setNotice(result.message ?? "Configuration imported.");
      await load();
    } catch (err: any) {
      setNotice(err?.message ?? "Configuration import failed.");
    } finally {
      setBusy(false);
    }
  }
  async function test(kind: string) {
    setBusy(true);
    try {
      setPreview(await api(`/test/${kind}`, { method: "POST" }));
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function queue(jobType: string) {
    try {
      await api("/jobs", { method: "POST", body: JSON.stringify({ jobType }) });
      setNotice(`${jobType.replaceAll("_", " ")} queued.`);
      await load();
    } catch (e: any) {
      setNotice(e.message);
    }
  }
  async function supportBundle() {
    setBusy(true);
    try {
      const r = await fetch("/api/internal/platform/support-bundle", { cache: "no-store" });
      if (!r.ok) throw new Error(`Support bundle failed (${r.status})`);
      const blob = await r.blob(),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `bom-support-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Sanitized support bundle created.");
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  const q = filter.trim().toLowerCase();
  const featureEntries = Object.entries(flags).filter(
    ([k]) => k !== "notificationCenter" && (!q || `${k} ${LABELS[k] ?? ""}`.toLowerCase().includes(q)),
  );
  if (!data)
    return (
      <section className="panel">
        <div className="uiSkeleton">
          <i />
          <i />
          <i />
        </div>
        {notice && <p className="notice">{notice}</p>}
      </section>
    );
  return (
    <div className="platformAdmin">
      {notice && (
        <button className="notice" onClick={() => setNotice("")}>
          {notice}
        </button>
      )}
      <section className="panel platformModeCard">
        <div>
          <span className="cardKicker">RUNTIME MODE</span>
          <h3>Single-server Architecture</h3>
          <p>
            BOM is intentionally bound to one Discord server. Historical <code>guild_id</code> columns remain
            only as compatibility partition keys; there is no multi-guild selector or cross-server
            configuration path.
          </p>
        </div>
        <StatusBadge tone="success">Single guild</StatusBadge>
      </section>
      {rankData && (
        <section className="panel memberRankSettings">
          <div className="panelHead">
            <div>
              <span className="cardKicker">MEMBER CARDS</span>
              <h3>Community Rank Roles</h3>
              <p>The highest matching rank wins on member cards and personalized dashboard surfaces.</p>
            </div>
            <button className="goldButton" onClick={() => void saveRanks()} disabled={busy}>
              Save Rank Roles
            </button>
          </div>
          <div className="memberRankRoleGrid">
            {rankData.ranks.map((rank: string) => (
              <label key={rank}>
                <span>
                  <b>{rank}</b>
                  <small>
                    {rank === "Guest"
                      ? "Fallback when no mapped rank role matches."
                      : "Choose the Discord role that represents this community rank."}
                  </small>
                </span>
                <DiscordOptionsSelect
                  onRefresh={() =>
                    void api("/member-ranks")
                      .then((updated: any) => setRankData(updated))
                      .catch((e: any) => setNotice(e.message))
                  }
                  value={rankMap[rank] ?? ""}
                  onChange={(e) => setRankMap((x) => ({ ...x, [rank]: e.target.value }))}
                >
                  <option value="">{rank === "Guest" ? "No Role / Fallback" : "Not Configured"}</option>
                  {(rankData.roles ?? []).map((role: any) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </DiscordOptionsSelect>
              </label>
            ))}
          </div>
        </section>
      )}
      <section className="panel platformSettingsPanel">
        <div className="panelHead">
          <div>
            <span className="cardKicker">FEATURE FLAGS</span>
            <h3>Modules & Rollout Controls</h3>
          </div>
          <input
            className="settingsInlineSearch"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find a module…"
          />
        </div>
        <div className="uiSettingList">
          {featureEntries.map(([key, value]) => (
            <SettingRow
              key={key}
              title={LABELS[key] ?? key}
              description={`${key === "experimentalUi" ? "Use only for controlled UI tests." : "Enable or disable this module without redeploying."} Effective value: ${value ? "Enabled" : "Disabled"}.`}
              help="Flags are server-wide and take effect without changing database schemas."
            >
              <div className="settingControlGroup">
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(e) => setFlags({ ...flags, [key]: e.target.checked })}
                />
                <button
                  className="settingResetButton"
                  type="button"
                  onClick={() => void resetOne(key)}
                  disabled={busy}
                >
                  Reset
                </button>
              </div>
            </SettingRow>
          ))}
        </div>
        <div className="panelActions">
          <button className="outlineButton" onClick={() => void reset()}>
            Reset all to defaults
          </button>
        </div>
      </section>
      <section className="panel setupChecklist">
        <div className="panelHead">
          <div>
            <span className="cardKicker">SETUP CHECKLIST</span>
            <h3>Configuration Readiness</h3>
          </div>
          <strong>{data.checklist.percent}%</strong>
        </div>
        <div className="setupProgress">
          <span style={{ width: `${data.checklist.percent}%` }} />
        </div>
        <div className="checklistRows">
          {data.checklist.items.map((x: any) => (
            <article key={x.key}>
              <span className={x.ready ? "ready" : "todo"}>{x.ready ? "✓" : "!"}</span>
              <div>
                <b>{x.label}</b>
                <small>{x.detail}</small>
              </div>
              <button className="tinyButton" onClick={() => void test(x.key)}>
                {x.ready ? "Preview / test" : "Review"}
              </button>
            </article>
          ))}
        </div>
      </section>
      {preview && (
        <section className="panel configTestResult">
          <div className="panelHead">
            <div>
              <span className="cardKicker">LIVE DISCORD PREVIEW</span>
              <h3>{preview.preview?.title ?? "Preview"}</h3>
            </div>
            <button className="textButton" onClick={() => setPreview(null)}>
              Close
            </button>
          </div>
          <div className="previewSplit">
            <DiscordPreview
              title={preview.preview?.title ?? "Preview"}
              description={preview.preview?.description}
              image={preview.preview?.media}
              buttons={preview.preview?.buttons ?? []}
              componentsV2={preview.validation?.key === "welcome"}
            />
            <div className="validationCard">
              <StatusBadge tone={preview.ok ? "success" : "warning"}>
                {preview.ok ? "Configuration valid" : "Needs attention"}
              </StatusBadge>
              <p>{preview.validation?.detail}</p>
              <small>
                This preview is rendered from dashboard state; it does not post anything to Discord.
              </small>
            </div>
          </div>
        </section>
      )}
      <section className="panelGrid platformOpsGrid">
        <section className="panel">
          <div className="panelHead">
            <div>
              <span className="cardKicker">BACKGROUND WORK</span>
              <h3>Central Job Queue</h3>
            </div>
            <span>
              {data.jobs.filter((x: any) => x.status === "QUEUED" || x.status === "RUNNING").length} active
            </span>
          </div>
          <div className="jobActions">
            <button onClick={() => void queue("HEALTH_SNAPSHOT")}>Run health snapshot</button>
            <button onClick={() => void queue("WIKI_STALE_SCAN")}>Scan Wiki freshness</button>
            <button onClick={() => void exportConfig()}>Download configuration</button>
            <button onClick={() => importRef.current?.click()}>Import configuration</button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => void importConfig(e)}
            />
          </div>
          <div className="jobRows">
            {data.jobs.slice(0, 8).map((j: any) => (
              <article key={j.id}>
                <span className={`jobState ${String(j.status).toLowerCase()}`} />
                <div>
                  <b>{String(j.job_type).replaceAll("_", " ")}</b>
                  <small>{j.progress_message ?? j.status}</small>
                </div>
                <em>{j.progress}%</em>
              </article>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panelHead">
            <div>
              <span className="cardKicker">SUPPORT CENTER</span>
              <h3>Diagnostics Bundle</h3>
            </div>
            <StatusBadge tone="live">Sanitized</StatusBadge>
          </div>
          <p>
            Creates a support file with service state, setup readiness, recent platform jobs/events, version
            information and only whether environment variables exist. Tokens, passwords, cookies and IDs are
            not exported in clear text.
          </p>
          <button className="goldButton" onClick={() => void supportBundle()} disabled={busy}>
            Create support bundle
          </button>
        </section>
      </section>
      <section className="panel platformEventPanel">
        <div className="panelHead">
          <div>
            <span className="cardKicker">EVENT BUS</span>
            <h3>Recent Platform Activity</h3>
          </div>
          <span>Shared audit stream</span>
        </div>
        <div className="eventRows">
          {data.events.slice(0, 12).map((e: any) => (
            <article key={e.id}>
              <span className={`activityDot ${e.severity}`} />
              <div>
                <b>{e.title}</b>
                <small>{e.summary ?? e.event_type}</small>
              </div>
              <time>{new Date(e.created_at).toLocaleString()}</time>
            </article>
          ))}
        </div>
      </section>
      <SaveBar
        dirty={dirty}
        saving={busy}
        onSave={() => void save()}
        onReset={() => setFlags(initialFlags)}
      />
    </div>
  );
}
