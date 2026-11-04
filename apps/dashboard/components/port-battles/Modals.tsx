"use client";
import ScheduleMessagePreview from "../DiscordPayloadPreview";
import SavedViewControl from "../SavedViewControl";
import BattleCoordination from "../BattleCoordination";
import BattleHourButtons from "../BattleHourButtons";
import CancelPortBattle from "../CancelPortBattle";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PortBattleInvitations from "../PortBattleInvitations";
import TerritoryMap from "../TerritoryMap";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { emitInspector, emitRecent, emitToast, usePersistedState } from "@/lib/dashboardQoL";
import { api, fmt, rateLabel } from "./helpers";

export function PbResetModal({ onClose, onReset }: { onClose: () => void; onReset: () => Promise<void> }) {
  const [preview, setPreview] = useState<any>(null);
  const [phrase, setPhrase] = useState("");
  const [job, setJob] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void api("/pb-reset/preview")
      .then(setPreview)
      .catch((e: any) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!job?.id || ["COMPLETED", "PARTIAL", "FAILED"].includes(String(job.status))) return;
    const timer = setInterval(() => {
      void api(`/pb-reset/status/${job.id}`)
        .then(setJob)
        .catch((e: any) => setError(e.message));
    }, 2500);
    return () => clearInterval(timer);
  }, [job?.id, job?.status]);
  async function perform() {
    if (phrase !== "RESET ACTIVE BATTLES" || !preview) return;
    setBusy(true);
    setError("");
    try {
      const outcome = await api("/pb-reset", {
        method: "POST",
        body: JSON.stringify({ confirmation: phrase, expectedIds: preview.ids }),
      });
      setJob({
        id: outcome.jobId,
        status: "QUEUED",
        affected_battles: preview.active,
        removed_discord_messages: 0,
        cleanup_errors: [],
      });
      await onReset();
      emitToast(
        `${outcome.cleared} active battle${outcome.cleared === 1 ? "" : "s"} cleared. Discord cleanup queued.`,
        { tone: "success" },
      );
    } catch (e: any) {
      setError(e.message ?? "Reset failed. Re-open preview.");
      void api("/pb-reset/preview")
        .then(setPreview)
        .catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  const done = ["COMPLETED", "PARTIAL", "FAILED"].includes(String(job?.status));
  return (
    <div className="modalBackdrop" role="presentation">
      <section className="panel pbModal" role="dialog" aria-modal="true" aria-labelledby="pb-reset-title">
        <div className="panelHead">
          <div>
            <span className="cardKicker">ADMIRALTY · DESTRUCTIVE OPERATION</span>
            <h2 id="pb-reset-title">Reset Active Port Battles</h2>
            <p>
              Cancel every open/closed Port Battle, set the live count to zero, and remove obsolete Discord
              signup, roster and schedule cards. Historic attendance and reviews are preserved.
            </p>
          </div>
          <button className="iconCloseButton" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {preview ? (
          <div className="pbResetReview">
            <p>
              <b>
                {preview.count} active battle{preview.count === 1 ? "" : "s"}
              </b>{" "}
              currently recorded. The bot will also scan for orphaned messages from battles deleted earlier.
            </p>
            {preview.active.map((b: any) => (
              <p key={b.id}>
                <b>{b.port_name}</b> · {b.status} ·{" "}
                {b.starts_at ? new Date(b.starts_at).toLocaleString() : "No time set"}
              </p>
            ))}
            <p className="muted">
              Discord channels: Signup{" "}
              {preview.channels?.signup ? `#${preview.channels.signup}` : "Not configured"} · Roster{" "}
              {preview.channels?.roster ? `#${preview.channels.roster}` : "Not configured"} · Schedule{" "}
              {preview.channels?.schedule ? `#${preview.channels.schedule}` : "Not configured"}
            </p>
          </div>
        ) : (
          <p className="uiLoading" role="status">
            Loading the current fleet and Discord panel settings…
          </p>
        )}
        {preview?.lastJob && !job && (
          <div className="pbResetReport">
            <p>
              <b>Previous reset:</b> {preview.lastJob.status} ·{" "}
              {Number(preview.lastJob.removed_discord_messages ?? 0)} Discord messages removed
            </p>
            {(preview.lastJob.cleanup_errors ?? []).map((e: string, i: number) => (
              <p key={i} className="notice">
                {e}
              </p>
            ))}
          </div>
        )}
        {!job && (
          <>
            <label>
              Enter <b>RESET ACTIVE BATTLES</b> to confirm
              <input
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                autoComplete="off"
                placeholder="RESET ACTIVE BATTLES"
              />
            </label>
            <p className="muted">
              This is not a database purge. You can still review historical battles, but cancelled records
              will no longer appear in the active schedule.
            </p>
          </>
        )}
        {job && (
          <div className="pbResetReport">
            <p>
              <strong>Cleanup status:</strong>{" "}
              {job.status === "QUEUED"
                ? "Queued for bot"
                : job.status === "RUNNING"
                  ? "Cleaning Discord…"
                  : job.status}
            </p>
            <p>
              <b>{Number(job.removed_discord_messages ?? 0)}</b> Discord messages removed
            </p>
            {(job.cleanup_errors ?? []).map((e: string, i: number) => (
              <p key={i} className="notice">
                {e}
              </p>
            ))}
            {job.status === "PARTIAL" && (
              <p>
                Some messages could not be removed. Check the error report and rerun after fixing permissions.
              </p>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        <div className="controlRow">
          <button type="button" className="outlineButton" onClick={onClose}>
            {done ? "Close" : "Cancel / Close"}
          </button>
          {!job && (
            <button
              type="button"
              className="goldButton"
              disabled={busy || !preview || phrase !== "RESET ACTIVE BATTLES"}
              onClick={() => void perform()}
            >
              {busy ? "Submitting…" : "Reset All Active Battles"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

export function ArchiveModal({
  query,
  setQuery,
  rows,
  onSearch,
  onClose,
}: {
  query: string;
  setQuery: (v: string) => void;
  rows: any[];
  onSearch: (q?: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="modalBackdrop">
      <section className="panel pbModal pbArchiveModal">
        <div className="panelHead">
          <div>
            <span className="cardKicker">BATTLE ARCHIVE</span>
            <h2>Search Port Battle History</h2>
            <p>Search by port, opponent, attacker, defender or captain.</p>
          </div>
          <button className="iconCloseButton" onClick={onClose}>
            ×
          </button>
        </div>
        <form
          className="pbArchiveSearch"
          onSubmit={(e) => {
            e.preventDefault();
            void onSearch(query);
          }}
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Aruba, DVS, captain name…"
          />
          <button className="goldButton">Search</button>
        </form>
        <div className="pbArchiveResults">
          {rows.map((r) => (
            <article key={r.id}>
              <span>
                <b>Battle of {r.port_name}</b>
                <small>
                  {r.attacker || "Attacker"} vs {r.defender || "Defender"} · {fmt(r.starts_at)}
                </small>
              </span>
              <em>
                {r.result && r.result !== "UNKNOWN" ? `${r.result} · ` : ""}
                {r.confirmed_count}/{r.team_size} confirmed
              </em>
            </article>
          ))}
          {!rows.length && <p className="uiEmpty">No matching finished battles.</p>}
        </div>
      </section>
    </div>
  );
}
export function PbAnalyticsModal({ data, onClose }: { data: any; onClose: () => void }) {
  return (
    <div className="modalBackdrop">
      <section className="panel pbModal pbAnalyticsModal">
        <div className="panelHead">
          <div>
            <span className="cardKicker">OFFICER ANALYTICS</span>
            <h2>Fleet Reliability & Commander Dashboard</h2>
            <p>Attendance and outcome data are officer-only planning context, not public rankings.</p>
          </div>
          <button className="iconCloseButton" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="pbAnalyticsGrid">
          <article>
            <h3>Reliability</h3>
            {(data.reliability ?? []).slice(0, 30).map((r: any) => (
              <div key={r.user_id}>
                <span>
                  <b>{r.display_name || r.user_id}</b>
                  <small>
                    {r.recorded} recorded · {r.cancelled} cancelled · {r.no_show} no-show
                  </small>
                </span>
                <strong>{r.reliability == null ? "—" : `${r.reliability}%`}</strong>
              </div>
            ))}
            {!data.reliability?.length && (
              <p className="muted">Attendance outcomes will appear after officers record them.</p>
            )}
          </article>
          <article className="pbCommanderAnalytics">
            <h3>Commander History</h3>
            {(data.commanders ?? []).map((r: any) => (
              <div key={r.user_id ?? r.display_name}>
                <span>
                  <b>{r.display_name || r.user_id || "Guest"}</b>
                  <small>
                    {r.commander_assignments} battles · avg roster {r.avg_roster_size ?? "—"} · {r.late ?? 0}{" "}
                    late · {r.no_show ?? 0} no-show
                  </small>
                  {r.recurring_issues?.length > 0 && (
                    <em>
                      Recurring: {r.recurring_issues.map((x: any) => `${x.tag} ×${x.count}`).join(" · ")}
                    </em>
                  )}
                </span>
                <strong>{r.win_rate == null ? "No result data" : `${r.win_rate}% win`}</strong>
              </div>
            ))}
            {!data.commanders?.length && <p className="uiEmpty">No finished commander assignments yet.</p>}
          </article>
          <article>
            <h3>Recurring Battle Issues</h3>
            {(data.issues ?? []).map((r: any) => (
              <div key={r.tag}>
                <span>
                  <b>{r.tag}</b>
                  <small>Recorded in finished battle reviews</small>
                </span>
                <strong>{r.count}×</strong>
              </div>
            ))}
            {!data.issues?.length && (
              <p className="muted">Record issue tags when finishing battles to reveal recurring patterns.</p>
            )}
          </article>
        </div>
      </section>
    </div>
  );
}
export function TacticalBriefModal({
  battle,
  data,
  initialRole,
  onClose,
  onRefresh,
}: {
  battle: any;
  data: any;
  initialRole: string;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const roles = data.roles ?? [
    "ALL",
    "Mainline",
    "Flank",
    "Edge",
    "Primary Horn",
    "Secondary Horn",
    "Red Flare",
    "Gold Flare",
    "Blue Flare",
    "Fleet Commander",
    "Flank Commander",
    "Siege Commander",
  ];
  const [role, setRole] = useState(roles.includes(initialRole) ? initialRole : "ALL");
  const existing = useMemo(
    () => data.briefs?.find((x: any) => x.role_key === role) ?? null,
    [data.briefs, role],
  );
  const [planId, setPlanId] = useState(existing?.source_plan_id ?? data.plans?.[0]?.id ?? "");
  const [title, setTitle] = useState(existing?.title ?? `${role} · ${battle.port_name}`);
  const [instructions, setInstructions] = useState(existing?.instructions ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const next = data.briefs?.find((x: any) => x.role_key === role);
    setPlanId(next?.source_plan_id ?? data.plans?.[0]?.id ?? "");
    setTitle(next?.title ?? `${role} · ${battle.port_name}`);
    setInstructions(next?.instructions ?? "");
  }, [role, data, battle.port_name]);
  const plan = data.plans?.find((x: any) => x.id === planId);
  async function save(send = false) {
    setBusy(true);
    try {
      await api(`/port-battles/${battle.id}/tactical-briefs/${encodeURIComponent(role)}`, {
        method: "PUT",
        body: JSON.stringify({ planId, title, instructions }),
      });
      await onRefresh();
      if (send) {
        await api(`/port-battles/${battle.id}/tactical-briefs/${encodeURIComponent(role)}/dispatch`, {
          method: "POST",
        });
        emitToast(`Tactical brief queued for ${role === "ALL" ? "the confirmed fleet" : role}.`, {
          tone: "success",
        });
      } else emitToast("Tactical brief saved.", { tone: "success" });
    } catch (e: any) {
      emitToast(e.message ?? "Could not save tactical brief.", {
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modalBackdrop">
      <section className="panel pbModal pbTacticalModal">
        <div className="panelHead">
          <div>
            <span className="cardKicker">TACTICAL MAP DM</span>
            <h2>Battle of {battle.port_name}</h2>
            <p>
              Reuse a Battle Prep drawing, add role instructions, then DM the annotated map to the confirmed
              captains assigned to that duty.
            </p>
          </div>
          <button type="button" className="dangerGhost pbDismiss" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="formGrid">
          <label>
            Role
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {roles.map((r: string) => (
                <option key={r} value={r}>
                  {r === "ALL" ? "Entire Confirmed Fleet" : r}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tactical Plan
            <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">Choose Battle Prep Plan…</option>
              {(data.plans ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.title || p.port_name} · v{p.version}
                </option>
              ))}
            </select>
          </label>
        </div>
        {plan ? (
          <div className="pbTacticalPreview">
            <img
              src={`/wosb/prep-maps/${encodeURIComponent(plan.map_key || "")}.png`}
              alt=""
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
            <div>
              <b>{plan.title}</b>
              <small>
                {plan.drawing?.length ?? 0} drawing elements · Port: {plan.port_name}
              </small>
            </div>
          </div>
        ) : (
          <div className="pbTacticalEmpty">
            <b>No tactical plan selected.</b>
            <span>
              Create or update the map drawing in Battle Prep, then return here to send it to the role.
            </span>
            <Link className="outlineButton" href="/dashboard/battle-prep">
              Open Battle Prep
            </Link>
          </div>
        )}
        <label>
          DM Title
          <input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Instructions
          <textarea
            value={instructions}
            maxLength={4000}
            rows={6}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Formation, positioning, first turn, target priorities, fallback instructions…"
          />
        </label>
        <div className="pbTacticalNote">
          <b>Who Gets This?</b>
          <span>
            {role === "ALL"
              ? "Every confirmed Discord captain."
              : `Confirmed captains whose formation, Horn duty, or commander duty matches “${role}”.`}{" "}
            Non-Discord guests are skipped automatically.
          </span>
        </div>
        <div className="controlRow">
          <button type="button" className="outlineButton" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="outlineButton"
            disabled={busy || !planId || !title.trim()}
            onClick={() => void save(false)}
          >
            Save Brief
          </button>
          <button
            type="button"
            className="goldButton"
            disabled={busy || !planId || !title.trim()}
            onClick={() => void save(true)}
          >
            Save & DM Role
          </button>
        </div>
      </section>
    </div>
  );
}
export function FleetTemplateModal({
  templates,
  battle,
  onApply,
  onSave,
  onClose,
}: {
  templates: any[];
  battle: any;
  onApply: (x: any) => void;
  onSave: (name: string, notes?: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(`${rateLabel(battle.rate)} ${battle.team_size}v${battle.team_size}`);
  return (
    <div className="modalBackdrop">
      <section className="panel pbModal">
        <div className="panelHead">
          <div>
            <span className="cardKicker">FLEET DOCTRINE</span>
            <h2>Roster Templates</h2>
            <p>Reusable server-side ship targets and commander slot doctrine.</p>
          </div>
          <button className="iconCloseButton" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="pbTemplateList">
          {templates.map((t) => (
            <button key={t.id} onClick={() => void onApply(t)}>
              <span>
                <b>{t.name}</b>
                <small>
                  {rateLabel(t.rate)} · {t.team_size}v{t.team_size}
                </small>
              </span>
              <em>Apply →</em>
            </button>
          ))}
          {!templates.length && <p className="uiEmpty">No saved fleet templates for this rate yet.</p>}
        </div>
        <div className="pbTemplateCreate">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" />
          <button className="goldButton" disabled={!name.trim()} onClick={() => void onSave(name.trim())}>
            Save Current Doctrine
          </button>
        </div>
      </section>
    </div>
  );
}
