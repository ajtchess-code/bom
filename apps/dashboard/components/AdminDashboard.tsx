"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LANGUAGES } from "@bom/shared";
import BrandingManager from "./BrandingManager";
import MusicPlatformAdmin from "./MusicPlatformAdmin";
import AutomationSocialAdmin from "./AutomationSocialAdmin";
import CommandIcon from "./CommandIcon";
import HelpTip from "./HelpTip";
import PlatformAdmin from "./PlatformAdmin";
import DiscordPreview from "./DiscordPreview";

const PERMS = [
  "USE_MUSIC",
  "MANAGE_MUSIC",
  "FORCE_SKIP",
  "CHANGE_SKIP_POLICY",
  "MANAGE_QUEUE",
  "MANAGE_FILTERS",
  "DJ",
  "MANAGE_INTEGRATIONS",
  "BYPASS_RESTRICTIONS",
];
const SKIPS = ["MAJORITY", "SUPERMAJORITY", "UNANIMOUS", "DJ_REQUESTER", "NO_SKIP"];
const friendlyPerm = (p: string) =>
  (
    ({
      USE_MUSIC: "Use music",
      MANAGE_MUSIC: "Manage music",
      FORCE_SKIP: "Force skip",
      CHANGE_SKIP_POLICY: "Change skip policy",
      MANAGE_QUEUE: "Manage queue",
      MANAGE_FILTERS: "Manage audio filters",
      DJ: "DJ controls",
      MANAGE_INTEGRATIONS: "Manage integrations",
      BYPASS_RESTRICTIONS: "Bypass restrictions",
    }) as Record<string, string>
  )[p] ?? p.replaceAll("_", " ").toLowerCase();
const friendlySkip = (p: string) =>
  (
    ({
      MAJORITY: "Majority vote",
      SUPERMAJORITY: "Supermajority vote",
      UNANIMOUS: "Unanimous vote",
      DJ_REQUESTER: "DJ or requester",
      NO_SKIP: "Skipping disabled",
    }) as Record<string, string>
  )[p] ?? p;
async function api(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return fetch(path, { ...init, headers, cache: "no-store" });
}
function statusLabel(v: string) {
  return v === "healthy" ? "Healthy" : v === "offline" ? "Offline" : "Needs attention";
}
function ms(v: any) {
  return Number.isFinite(Number(v)) ? `${Number(v).toFixed(Number(v) >= 10 ? 0 : 1)} ms` : "—";
}

export default function AdminDashboard({ initial, section = "music" }: { initial: any; section?: string }) {
  const params = useSearchParams();
  const initialMode = section === "diagnostics" ? "diagnostics" : "basic";

  const [mode, setMode] = useState<"basic" | "advanced" | "diagnostics">(initialMode);
  const [data, setData] = useState(initial),
    [health, setHealth] = useState<any>(null),
    [healthBusy, setHealthBusy] = useState(false);
  const [notice, setNotice] = useState(""),
    [search, setSearch] = useState("");
  const [pending, setPending] = useState<any>(null);
  const [rule, setRule] = useState({
    roleId: initial.context?.roles?.[0]?.id ?? "",
    permission: "MANAGE_MUSIC",
    allowed: true,
  });
  const [settings, setSettings] = useState({
    defaultLanguage: initial.settings?.default_language ?? "en-US",
    autoplayDefault: Boolean(initial.settings?.autoplay_default ?? true),
    skipMode: initial.settings?.skip_mode ?? "MAJORITY",
    stickyAfterMessages: Number(initial.settings?.sticky_after_messages ?? 4),
  });
  const adminRole = initial.context?.roles?.find((r: any) => r.id === initial.adminRoleId);
  const online = data.workers?.filter((w: any) => !w.offline).length ?? 0;
  const q = search.trim().toLowerCase();
  const match = (...words: string[]) => !q || words.join(" ").toLowerCase().includes(q);

  async function refresh() {
    const r = await api("/api/internal/admin/summary");
    if (r.ok) setData(await r.json());
  }
  async function refreshDiscordOptions() {
    try {
      const response = await api("/api/internal/membership/discord-context");
      if (!response.ok) throw new Error(`Refresh failed (${response.status})`);
      const fresh = await response.json();
      setData((current: any) => ({ ...current, context: fresh.discord }));
      setNotice("Discord roles, channels and categories refreshed. Unsaved changes preserved.");
    } catch (e: any) {
      setNotice(String(e.message ?? e));
    }
  }
  async function refreshHealth() {
    setHealthBusy(true);
    try {
      const r = await api("/api/internal/admin/health");
      if (r.ok) setHealth(await r.json());
      else setNotice(`Health check failed (${r.status}).`);
    } catch {
      setNotice("Health check could not complete.");
    } finally {
      setHealthBusy(false);
    }
  }
  useEffect(() => {
    if (mode === "diagnostics") void refreshHealth();
  }, [mode]);

  function reviewSettings(e: FormEvent) {
    e.preventDefault();
    setPending({
      kind: "defaults",
      title: "Review music defaults",
      items: [
        [
          "Default language",
          LANGUAGES.find((x) => x.value === settings.defaultLanguage)?.label ?? settings.defaultLanguage,
        ],
        ["Skip policy", friendlySkip(settings.skipMode)],
        ["Controller repost interval", `${settings.stickyAfterMessages} messages`],
        ["Autoplay", settings.autoplayDefault ? "Starts automatically" : "Starts manually"],
      ],
    });
  }
  function reviewRule(e: FormEvent) {
    e.preventDefault();
    const role = data.context?.roles?.find((r: any) => r.id === rule.roleId)?.name ?? rule.roleId;
    setPending({
      kind: "permission",
      title: "Review permission change",
      items: [
        ["Role", `@${role}`],
        ["Capability", friendlyPerm(rule.permission)],
        ["Access", rule.allowed ? "Allow" : "Deny"],
      ],
    });
  }
  async function confirmPending() {
    const p = pending;
    setPending(null);
    if (!p) return;
    if (p.kind === "defaults") {
      const r = await api("/api/internal/music/settings", { method: "POST", body: JSON.stringify(settings) });
      setNotice(r.ok ? "Server defaults saved." : `Save failed (${r.status})`);
      if (r.ok) await refresh();
    } else if (p.kind === "permission") {
      const r = await api("/api/internal/music/permissions", { method: "PUT", body: JSON.stringify(rule) });
      setNotice(r.ok ? "Permission rule saved." : `Save failed (${r.status})`);
      if (r.ok) await refresh();
    }
  }
  async function removeRule(id: string) {
    if (!window.confirm("Remove this permission rule?")) return;
    const r = await api(`/api/internal/music/permissions/${id}`, { method: "DELETE" });
    if (r.ok) {
      setNotice("Permission rule removed.");
      await refresh();
    }
  }

  const visibleServices = health?.services ?? [];
  const perf = health?.clientPerformance ?? [];
  const apiPerf = health?.apiPerformance ?? {};
  const basicVisible = {
    platform: section === "platform",
    defaults: section === "music",
    permissions: section === "music",
    membership: false,
    branding: section === "brand-kit",
    voice: section === "voice",
  };

  return (
    <div className="adminExperience adminV34">
      <h1>
        {section === "music"
          ? "Music"
          : section === "diagnostics"
            ? "Diagnostics"
            : section === "brand-kit"
              ? "Branding"
              : "Platform & Access"}
      </h1>
      {notice && (
        <div className="notice" onClick={() => setNotice("")}>
          {notice}
        </div>
      )}

      <section className="adminOverview">
        <div>
          <span className="adminAccessIcon">
            <CommandIcon name="shield" size={22} />
          </span>
          <span>
            <b>Administrator access</b>
            <small>
              {adminRole
                ? `Controlled by @${adminRole.name}`
                : "Guild owner / Manage Server fallback is active"}
            </small>
          </span>
        </div>
        <span className={`statusPill ${data.adminRoleId ? "healthy" : ""}`}>
          <i /> {data.adminRoleId ? "Protected by role" : "Fallback access"}
        </span>
      </section>

      <button type="button" className="outlineButton" onClick={() => void refreshDiscordOptions()}>
        Refresh Discord Roles & Channels
      </button>

      {mode === "basic" && (
        <>
          {basicVisible.platform && <PlatformAdmin />}
          <section className="adminGrid">
            {basicVisible.defaults && (
              <div className="panel adminCard">
                <div className="panelHead">
                  <div>
                    <span className="cardKicker">MEMBER EXPERIENCE</span>
                    <h3>
                      Music defaults{" "}
                      <HelpTip title="Music defaults">
                        These values are used when a new listening session begins. Members can still use
                        controls they have permission to use.
                      </HelpTip>
                    </h3>
                  </div>
                  <span>New listening sessions</span>
                </div>
                <form className="stackForm" onSubmit={reviewSettings}>
                  <label>
                    Default language
                    <select
                      value={settings.defaultLanguage}
                      onChange={(e) => setSettings({ ...settings, defaultLanguage: e.target.value })}
                    >
                      {LANGUAGES.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.emoji} {l.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Default skip policy
                    <select
                      value={settings.skipMode}
                      onChange={(e) => setSettings({ ...settings, skipMode: e.target.value })}
                    >
                      {SKIPS.map((x) => (
                        <option key={x} value={x}>
                          {friendlySkip(x)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Keep the music controller visible after
                    <input
                      type="number"
                      min={1}
                      max={25}
                      value={settings.stickyAfterMessages}
                      onChange={(e) =>
                        setSettings({ ...settings, stickyAfterMessages: Number(e.target.value) })
                      }
                    />
                    <small className="fieldHelp">
                      Reposts the controller after this many newer chat messages.
                    </small>
                  </label>
                  <label className="toggleLine">
                    <input
                      type="checkbox"
                      checked={settings.autoplayDefault}
                      onChange={(e) => setSettings({ ...settings, autoplayDefault: e.target.checked })}
                    />{" "}
                    Start autoplay automatically
                  </label>
                  <button className="goldButton">Review changes</button>
                </form>
                <div className="adminLivePreview">
                  <span className="cardKicker">LIVE DISCORD PREVIEW</span>
                  <DiscordPreview
                    title="Now Playing"
                    description={`Music controller · ${friendlySkip(settings.skipMode)} · ${settings.autoplayDefault ? "Autoplay on" : "Autoplay off"}`}
                    buttons={["Pause", "Skip", "Queue", "Lyrics"]}
                  />
                </div>
              </div>
            )}
            {basicVisible.permissions && (
              <div className="panel adminCard">
                <div className="panelHead">
                  <div>
                    <span className="cardKicker">ACCESS CONTROL</span>
                    <h3>
                      Role permissions{" "}
                      <HelpTip title="Role permissions">
                        Choose which Discord roles can use or manage music features. Specific deny rules can
                        override a general allow.
                      </HelpTip>
                    </h3>
                  </div>
                  <span>Discord roles</span>
                </div>
                <form className="stackForm" onSubmit={reviewRule}>
                  <label>
                    Discord role
                    <select
                      value={rule.roleId}
                      onChange={(e) => setRule({ ...rule, roleId: e.target.value })}
                    >
                      {data.context?.roles?.map((r: any) => (
                        <option key={r.id} value={r.id}>
                          @{r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    What they can do
                    <select
                      value={rule.permission}
                      onChange={(e) => setRule({ ...rule, permission: e.target.value })}
                    >
                      {PERMS.map((p) => (
                        <option key={p} value={p}>
                          {friendlyPerm(p)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Access
                    <select
                      value={String(rule.allowed)}
                      onChange={(e) => setRule({ ...rule, allowed: e.target.value === "true" })}
                    >
                      <option value="true">Allow</option>
                      <option value="false">Deny</option>
                    </select>
                  </label>
                  <button className="goldButton">Review permission</button>
                </form>
                <div className="ruleList modernRuleList">
                  {data.permissions?.map((p: any) => (
                    <div key={p.id}>
                      <span>
                        <b>@{data.context?.roles?.find((r: any) => r.id === p.role_id)?.name ?? p.role_id}</b>
                        <small>{friendlyPerm(p.permission)}</small>
                      </span>
                      <em className={p.allowed ? "allow" : "deny"}>{p.allowed ? "Allowed" : "Denied"}</em>
                      <button
                        aria-label="Remove permission rule"
                        onClick={() => void removeRule(String(p.id))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {basicVisible.membership && (
              <div className="panel adminCard membershipSetupShortcut">
                <div className="panelHead">
                  <div>
                    <span className="cardKicker">MEMBERSHIP & WELCOME</span>
                    <h3>Onboarding & Role Automation</h3>
                  </div>
                  <span>Server setup</span>
                </div>
                <p>
                  Configure the Welcome channel, BOM Control Desk, Leave, Diplomacy, roster membership, Custom
                  Roles, Guild Prefix rules, and automatic Role Connections in one place.
                </p>
                <div className="setupFeatureChips">
                  <span>Welcome</span>
                  <span>Control Desk</span>
                  <span>Leave</span>
                  <span>Diplomacy</span>
                  <span>Roster</span>
                  <span>Custom Roles</span>
                  <span>Guild Prefix</span>
                  <span>Role Connections</span>
                </div>
                <Link className="goldButton" href="/dashboard/admin/membership">
                  Open Membership & Welcome
                </Link>
              </div>
            )}
          </section>
          {basicVisible.branding && (
            <>
              <div className="adminSectionAnchor">
                <span className="eyebrow">BRANDING</span>
                <h3>Bot Identity</h3>
                <p>Manage the artwork and visual identity members see in Discord.</p>
              </div>
              <BrandingManager />
            </>
          )}
          {section === "music" && <MusicPlatformAdmin />}
          {basicVisible.voice && (
            <>
              <div className="adminSectionAnchor">
                <span className="eyebrow">VOICE</span>
                <h3>Temporary Voice Rooms</h3>
                <p>
                  Create and edit Join-to-Create rules here, including automatic room numbering such as BOM¹,
                  BOM² and BOM³.
                </p>
              </div>
              <AutomationSocialAdmin voiceOnly />
            </>
          )}
        </>
      )}

      {mode === "advanced" && (
        <>
          <div className="adminModeIntro">
            <span className="eyebrow">ADVANCED</span>
            <h3>Integrations and Automation</h3>
            <p>
              Less-frequent controls for the music platform, server automation, social delivery and knowledge
              management.
            </p>
          </div>
          {match("music platform radio recommendations collaboration achievements") && (
            <>
              <div className="adminSectionAnchor">
                <span className="eyebrow">MUSIC PLATFORM</span>
                <h3>Advanced Music Behavior</h3>
                <p>Radio, recommendations, collaboration, achievements and other music features.</p>
              </div>
              <MusicPlatformAdmin />
            </>
          )}
          {match("automations social threads reactions join voice feeds") && (
            <>
              <div className="adminSectionAnchor">
                <span className="eyebrow">AUTOMATIONS & SOCIAL</span>
                <h3>Server Automations and Social Feeds</h3>
                <p>
                  Configure Join-to-Create voice, automatic threads and reactions, and social feed delivery.
                </p>
              </div>
              <AutomationSocialAdmin />
            </>
          )}
          {match("wiki knowledge articles corrections") && (
            <section className="panel adminCard adminKnowledgeShortcut">
              <div>
                <span className="cardKicker">WIKI</span>
                <h3>Wiki Studio</h3>
                <p>Edit manual articles, review corrections, and maintain the knowledge members see.</p>
              </div>
              <Link className="goldButton" href="/dashboard/wiki#knowledge-studio">
                Open Wiki Studio
              </Link>
            </section>
          )}
        </>
      )}

      {mode === "diagnostics" && (
        <>
          <div className="adminModeIntro diagnosticsIntro">
            <div>
              <span className="eyebrow">DIAGNOSTICS</span>
              <h3>System Health & Performance</h3>
              <p>
                Current availability, worker status and recent dashboard responsiveness. Technical details
                stay here instead of leaking into member-facing pages.
              </p>
            </div>
            <button className="outlineButton" onClick={() => void refreshHealth()} disabled={healthBusy}>
              {healthBusy ? "Checking…" : "Refresh health"}
            </button>
          </div>
          <section className="healthOverview panel">
            <div>
              <span className={`healthOrb ${health?.overall ?? "degraded"}`} />
              <div>
                <b>
                  {health?.overall === "healthy"
                    ? "All monitored systems are healthy"
                    : "Some systems need attention"}
                </b>
                <small>
                  {health?.generatedAt
                    ? `Checked ${new Date(health.generatedAt).toLocaleTimeString()}`
                    : "Run a health check to load current status."}
                </small>
              </div>
            </div>
            <span className="diagnosticSummary">
              {online}/{data.workers?.length ?? 8} music workers online
            </span>
          </section>
          <section className="healthGrid">
            {visibleServices.map((s: any) => (
              <article className={`panel healthService ${s.status}`} key={s.key}>
                <div>
                  <span className={`serviceDot ${s.status}`} />
                  <b>{s.label}</b>
                </div>
                <strong>{statusLabel(s.status)}</strong>
                <p>{s.detail}</p>
                {s.latencyMs != null && <small>{ms(s.latencyMs)} response</small>}
              </article>
            ))}
            {!visibleServices.length && (
              <div className="panel healthEmpty">
                <b>No health result loaded yet.</b>
                <p>Refresh health to check the current services.</p>
              </div>
            )}
          </section>
          <section className="panel performancePanel">
            <div className="panelHead">
              <div>
                <span className="cardKicker">LAST 24 HOURS</span>
                <h3>
                  Dashboard performance{" "}
                  <HelpTip title="Performance telemetry">
                    BOM records coarse timing measurements such as page responsiveness. It does not record
                    typed text or page content.
                  </HelpTip>
                </h3>
              </div>
              <span>{apiPerf.count ?? 0} API requests measured</span>
            </div>
            <div className="performanceGrid">
              <div>
                <span>API average</span>
                <b>{ms(apiPerf.avgMs)}</b>
              </div>
              <div>
                <span>API p95</span>
                <b>{ms(apiPerf.p95Ms)}</b>
              </div>
              <div>
                <span>Server error rate</span>
                <b>
                  {Number(apiPerf.errorRate ?? 0) * 100 < 0.1
                    ? "0%"
                    : `${(Number(apiPerf.errorRate ?? 0) * 100).toFixed(1)}%`}
                </b>
              </div>
              {perf.map((x: any) => (
                <div key={x.metric}>
                  <span>{x.metric} p95</span>
                  <b>{x.metric === "CLS" ? Number(x.p95 ?? 0).toFixed(3) : ms(x.p95)}</b>
                  <small>{x.count} samples</small>
                </div>
              ))}
            </div>
          </section>
          <section className="panel">
            <div className="panelHead">
              <div>
                <h3>Music Connections</h3>
                <span>Listening capacity</span>
              </div>
              <span>
                {online}/{data.workers?.length ?? 8} available
              </span>
            </div>
            <div className="workers">
              {(health?.workers ?? data.workers ?? []).map((w: any) => (
                <div key={w.workerId} className={w.offline ? "worker offline" : "worker"}>
                  <i />
                  <b>Instance {w.workerId}</b>
                  <small>{w.offline ? "Offline" : w.roomId ? "In use" : "Available"}</small>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {pending && (
        <div
          className="modalBackdrop"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) setPending(null);
          }}
        >
          <section
            className="modalCard reviewChangesModal"
            role="dialog"
            aria-modal="true"
            aria-label={pending.title}
          >
            <div className="modalHead">
              <div>
                <span className="eyebrow">REVIEW</span>
                <h3>{pending.title}</h3>
              </div>
              <button onClick={() => setPending(null)}>×</button>
            </div>
            <p>Confirm these changes before they are applied.</p>
            <dl>
              {pending.items.map((x: any) => (
                <div key={x[0]}>
                  <dt>{x[0]}</dt>
                  <dd>{x[1]}</dd>
                </div>
              ))}
            </dl>
            <div className="modalActions">
              <button className="outlineButton" onClick={() => setPending(null)}>
                Cancel
              </button>
              <button className="goldButton" onClick={() => void confirmPending()}>
                Apply changes
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
