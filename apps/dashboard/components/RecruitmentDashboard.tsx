"use client";
import SavedViewControl from "./SavedViewControl";
import RecruitmentLifecycleControls from "./RecruitmentLifecycleControls";
import DiscordOptionsSelect from "./DiscordOptionsSelect";
import RoleTagPicker from "./RoleTagPicker";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Tab = "overview" | "applications" | "interviews" | "history" | "settings";
// Recruitment runs Review -> Interview -> Decision. "Waiting on" says who acts next.
const STAGES = ["RECRUITER_REVIEW", "INTERVIEW"];
const LABELS: Record<string, string> = {
  RECRUITER_REVIEW: "Review",
  INTERVIEW: "Interview",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  WITHDRAWN: "Withdrawn",
  CLOSED: "Closed",
};
const WAITING: Record<string, string> = {
  APPLICANT: "Applicant",
  RECRUITER: "BOM Recruiter",
  INTERVIEW: "Interview",
  LEADERSHIP: "BOM Leadership",
  NONE: "No one",
};
const FINAL = new Set(["ACCEPTED", "DECLINED", "WITHDRAWN", "CLOSED"]);
const MANUAL_STAGES = STAGES;

async function api(path: string, init: RequestInit = {}) {
  const h = new Headers(init.headers);
  if (init.body && !h.has("content-type")) h.set("content-type", "application/json");
  const r = await fetch(`/api/internal/recruitment${path}`, { ...init, headers: h, cache: "no-store" });
  const text = await r.text();
  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: text };
  }
  if (!r.ok) throw new Error(body?.message ?? body?.error ?? `Request failed (${r.status})`);
  return body;
}
function niceDate(v: any) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}
function shortDate(v: any) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return String(v);
  }
}
function ago(v: any) {
  if (!v) return "—";
  const ms = Date.now() - +new Date(v),
    m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function toast(message: string, tone = "success") {
  window.dispatchEvent(new CustomEvent("bom:toast", { detail: { message, tone } }));
}
function avatar(a: any) {
  return a?.avatar_url ?? a?.avatarUrl ?? a?.profile?.avatar_url ?? null;
}
function display(a: any) {
  return a?.display_name ?? a?.profile?.display_name ?? a?.captain_name ?? "Applicant";
}
function nextText(a: any) {
  if (a?.status === "RECRUITER_REVIEW")
    return a?.waiting_on === "APPLICANT"
      ? a.current_request || "A recruiter needs information from you."
      : "Our recruitment team is reviewing your application.";
  if (a?.status === "INTERVIEW")
    return a?.waiting_on === "LEADERSHIP"
      ? "Your interview is done and leadership is making the final decision."
      : a.current_request || "Your interview is being arranged.";
  if (a?.status === "ACCEPTED") return "Welcome to Band of Misfits.";
  if (a?.status === "DECLINED") return "Your application has concluded.";
  return "Our recruitment team is reviewing your application.";
}

export default function RecruitmentDashboard({
  initialSummary,
  adminData,
  initialResponses = [],
  settingsOnly = false,
}: {
  initialSummary: any;
  adminData: any;
  initialResponses?: any[];
  settingsOnly?: boolean;
}) {
  const [summary, setSummary] = useState(initialSummary),
    [tab, setTab] = useState<Tab>("overview"),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [selected, setSelected] = useState<any>(null),
    [busy, setBusy] = useState(false);
  const [statusDraft, setStatusDraft] = useState({
    status: "RECRUITER_REVIEW",
    waitingOn: "RECRUITER",
    currentRequest: "",
    applicantMessage: "",
  });
  const [note, setNote] = useState(""),
    [noteVisibility, setNoteVisibility] = useState("INTERNAL"),
    [responseId, setResponseId] = useState(""),
    [customResponse, setCustomResponse] = useState("");
  const [interview, setInterview] = useState({ scheduledAt: "", durationMinutes: 60, notes: "" });
  const [targetGuild, setTargetGuild] = useState<"BOM" | "BoM">("BOM");
  const [decision, setDecision] = useState({ decision: "DECLINE", reason: "" });
  const [settings, setSettings] = useState<any>(adminData),
    [responses, setResponses] = useState<any[]>(
      initialResponses.length ? initialResponses : (adminData?.responses ?? []),
    ),
    [newResponse, setNewResponse] = useState({
      name: "",
      category: "GENERAL",
      body: "",
      setStatus: "",
      setWaitingOn: "",
      requestedItem: "",
      followUpHours: "",
    });
  const routeParams = useSearchParams();
  const recruiter = summary.access === "recruiter";

  useEffect(() => {
    const id = routeParams.get("application");
    if (id) void openApplication(id);
  }, [routeParams]);
  async function refresh() {
    const fresh = await api("/summary");
    setSummary(fresh);
    if (selectedId) await openApplication(selectedId, false);
  }
  async function openApplication(id: string, changeTab = true) {
    setBusy(true);
    try {
      const d = await api(`/applications/${id}`);
      setSelected(d);
      setSelectedId(id);
      setStatusDraft({
        status: d.status,
        waitingOn: d.waiting_on,
        currentRequest: d.current_request ?? "",
        applicantMessage: "",
      });
      if (changeTab && tab === "overview") setTab("applications");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function act(path: string, body: any, message: string) {
    setBusy(true);
    try {
      await api(path, { method: "POST", body: JSON.stringify(body) });
      toast(message);
      await refresh();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function putAct(path: string, body: any, message: string) {
    setBusy(true);
    try {
      await api(path, { method: "PUT", body: JSON.stringify(body) });
      toast(message);
      await refresh();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function saveSettings() {
    if (!settings) return;
    const body = {
      cleanupDelaySeconds: Number(settings.cleanup_delay_seconds ?? 60),
      archiveChannelId: settings.archive_channel_id || null,
      enabled: Boolean(settings.enabled),
      ticketCategoryId: settings.ticket_category_id || null,
      recruiterRoleIds: settings.recruiter_role_ids ?? [],
      applicantRoleId: settings.applicant_role_id || null,
      acceptedRoleId: settings.accepted_role_id || null,
      acceptedSecondGuildRoleId: settings.accepted_second_guild_role_id || null,
      interviewVoiceCategoryId: settings.interview_voice_category_id || null,
      communityFeedbackRoleId: settings.community_feedback_role_id || null,
      applicationReapplyDays: Number(settings.application_reapply_days ?? 7),
      screenshotRequired: Boolean(settings.screenshot_required),
      autoCloseHours: Number(settings.auto_close_hours ?? 168),
      unclaimedReminderMinutes: Number(settings.unclaimed_reminder_minutes ?? 120),
      applicantReminderHours: Number(settings.applicant_reminder_hours ?? 24),
    };
    setBusy(true);
    try {
      await api("/settings", { method: "PUT", body: JSON.stringify(body) });
      toast("Recruitment settings saved.");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function saveResponse(r: any) {
    setBusy(true);
    try {
      await api(`/responses/${r.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: r.name,
          category: r.category,
          body: r.body,
          setStatus: r.set_status || null,
          setWaitingOn: r.set_waiting_on || null,
          requestedItem: r.requested_item || null,
          followUpHours: r.follow_up_hours == null ? null : Number(r.follow_up_hours),
          enabled: Boolean(r.enabled),
          sortOrder: Number(r.sort_order ?? 100),
        }),
      });
      toast("Response saved.");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function addResponse() {
    if (!newResponse.name.trim() || !newResponse.body.trim()) return;
    setBusy(true);
    try {
      await api("/responses", {
        method: "POST",
        body: JSON.stringify({
          name: newResponse.name,
          category: newResponse.category,
          body: newResponse.body,
          setStatus: newResponse.setStatus || null,
          setWaitingOn: newResponse.setWaitingOn || null,
          requestedItem: newResponse.requestedItem || null,
          followUpHours: newResponse.followUpHours ? Number(newResponse.followUpHours) : null,
        }),
      });
      const x = await api("/settings");
      setSettings(x);
      setResponses(x.responses ?? []);
      setNewResponse({
        name: "",
        category: "GENERAL",
        body: "",
        setStatus: "",
        setWaitingOn: "",
        requestedItem: "",
        followUpHours: "",
      });
      toast("Canned response added.");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function deleteResponse(id: string) {
    if (!confirm("Delete this canned response?")) return;
    await api(`/responses/${id}`, { method: "DELETE" });
    setResponses((x) => x.filter((r) => r.id !== id));
    toast("Response deleted.");
  }

  useEffect(() => {
    try {
      const id = new URLSearchParams(window.location.search).get("application");
      if (id && recruiter) void openApplication(id, false);
    } catch {}
  }, []);

  if (settingsOnly)
    return (
      <div>
        <h1>Recruitment Settings</h1>
        {settings && (
          <SettingsPanel
            settings={settings}
            setSettings={setSettings}
            responses={responses}
            setResponses={setResponses}
            newResponse={newResponse}
            setNewResponse={setNewResponse}
            busy={busy}
            onSave={saveSettings}
            onSaveResponse={saveResponse}
            onDeleteResponse={deleteResponse}
            onAddResponse={addResponse}
          />
        )}
      </div>
    );
  if (!recruiter) return <ApplicantView summary={summary} />;

  const applications = summary.applications ?? [];
  const active = applications.filter((a: any) => !FINAL.has(a.status));
  const history = applications.filter((a: any) => FINAL.has(a.status));
  const awaitingDecision = applications.filter(
    (a: any) => a.status === "INTERVIEW" && a.waiting_on === "LEADERSHIP",
  );
  const interviews = applications.filter((a: any) => a.status === "INTERVIEW");
  const tabItems: [Tab, string][] = [
    ["overview", "Overview"],
    ["applications", "Applications"],
    ["interviews", "Interviews"],
    ["history", "History"],
    ...(adminData ? [["settings", "Settings"] as [Tab, string]] : []),
  ];

  return (
    <div className="recruitmentPage">
      <header className="recruitmentHero">
        <div>
          <span className="eyebrow">GUILD RECRUITMENT</span>
          <h1>Recruitment</h1>
          <p>Review, interview, decide.</p>
        </div>
        <div className="recruitmentHeroStats">
          <span>
            <b>{active.length}</b>
            <small>Active</small>
          </span>
          <span>
            <b>{interviews.length}</b>
            <small>Interviews</small>
          </span>
          <span>
            <b>{awaitingDecision.length}</b>
            <small>Awaiting decision</small>
          </span>
        </div>
      </header>
      {summary.myApplication && (
        <section className="panel">
          <h3>Your Application · {summary.myApplication.status}</h3>
          {summary.myApplication.status === "DRAFT" ? (
            <>
              <p>
                Your first part is saved. Use Apply to BOM in Discord to resume it, or discard the draft to
                start again.
              </p>
              <button
                disabled={busy}
                onClick={() => {
                  if (confirm("Discard this unfinished application draft?"))
                    void act(
                      `/applications/${summary.myApplication.id}/discard-draft`,
                      {},
                      "Draft discarded. You can start a new application.",
                    );
                }}
              >
                Discard Draft
              </button>
            </>
          ) : (
            !FINAL.has(summary.myApplication.status) && (
              <button
                disabled={busy}
                onClick={() =>
                  void act(
                    `/applications/${summary.myApplication.id}/repair-ticket`,
                    {},
                    "Application ticket checked and repaired if missing.",
                  )
                }
              >
                Find / Repair My Application Ticket
              </button>
            )
          )}
        </section>
      )}
      <nav className="recruitmentTabs">
        {tabItems.map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() =>
              key === "settings" ? window.location.assign("/dashboard/admin/recruitment") : setTab(key)
            }
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <section className="recruitmentOverview">
          <div className="pipelineSummary">
            {[
              {
                key: "review",
                label: "Review",
                count: summary.counts?.RECRUITER_REVIEW ?? 0,
                tab: "applications",
              },
              {
                key: "interview",
                label: "Interview",
                count: interviews.length - awaitingDecision.length,
                tab: "interviews",
              },
              { key: "decision", label: "Decision", count: awaitingDecision.length, tab: "applications" },
            ].map((x) => (
              <button key={x.key} onClick={() => setTab(x.tab as Tab)}>
                <b>{x.count}</b>
                <span>{x.label}</span>
              </button>
            ))}
          </div>
          <div className="recruitmentAnalyticsStrip">
            <span>
              <small>Submitted · 180d</small>
              <b>{summary.analytics?.submitted ?? 0}</b>
            </span>
            <span>
              <small>Accepted</small>
              <b>{summary.analytics?.accepted ?? 0}</b>
            </span>
            <span>
              <small>Acceptance rate</small>
              <b>{Math.round(Number(summary.analytics?.acceptanceRate ?? 0) * 100)}%</b>
            </span>
            <span>
              <small>Avg. first response</small>
              <b>
                {summary.analytics?.avgFirstResponseHours == null
                  ? "—"
                  : `${Number(summary.analytics.avgFirstResponseHours).toFixed(1)}h`}
              </b>
            </span>
            <span>
              <small>Avg. cycle</small>
              <b>
                {summary.analytics?.avgDurationHours == null
                  ? "—"
                  : `${Number(summary.analytics.avgDurationHours).toFixed(1)}h`}
              </b>
            </span>
          </div>
          {active.length > 0 ? (
            <div className="recruitmentColumns">
              {STAGES.map((stage) => (
                <div className="recruitmentColumn" key={stage}>
                  <header>
                    <b>{LABELS[stage]}</b>
                    <span>{active.filter((a: any) => a.status === stage).length}</span>
                  </header>
                  {active
                    .filter((a: any) => a.status === stage)
                    .slice(0, 8)
                    .map((a: any) => (
                      <ApplicationCard
                        key={a.id}
                        app={a}
                        recruiters={summary.recruiters ?? []}
                        onOpen={() => void openApplication(a.id)}
                      />
                    ))}
                  {!active.some((a: any) => a.status === stage) && (
                    <p className="emptyColumn">Nothing here.</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="recruitmentOverviewEmpty">
              <div className="recruitmentOverviewEmptyIcon">⚓</div>
              <div>
                <h3>No Active Applications</h3>
                <p>
                  The Admiralty recruitment pipeline is clear. New applications will appear in their
                  respective stages here.
                </p>
              </div>
              <button type="button" className="outlineButton" onClick={() => setTab("applications")}>
                View applications
              </button>
            </div>
          )}
        </section>
      )}

      {selected && (
        <RecruitmentLifecycleControls
          application={selected}
          admin={Boolean(summary.admin)}
          onChanged={refresh}
        />
      )}
      {tab === "applications" && (
        <section className="recruitmentSplit">
          <ApplicationList
            apps={active}
            selectedId={selectedId}
            recruiters={summary.recruiters ?? []}
            onOpen={(id) => void openApplication(id, false)}
          />
          <ApplicationDetail
            app={selected}
            busy={busy}
            recruiters={summary.recruiters ?? []}
            responses={responses}
            statusDraft={statusDraft}
            setStatusDraft={setStatusDraft}
            note={note}
            setNote={setNote}
            noteVisibility={noteVisibility}
            setNoteVisibility={setNoteVisibility}
            responseId={responseId}
            setResponseId={setResponseId}
            customResponse={customResponse}
            setCustomResponse={setCustomResponse}
            interview={interview}
            setInterview={setInterview}
            admin={Boolean(summary.admin)}
            onAssign={(rid: string) =>
              act(
                `/applications/${selected.id}/assign`,
                { recruiterId: rid },
                "Recruiter assignment updated.",
              )
            }
            onStatus={() =>
              act(`/applications/${selected.id}/status`, statusDraft, "Application status updated.")
            }
            onNote={() =>
              act(
                `/applications/${selected.id}/note`,
                { body: note, visibility: noteVisibility },
                "Note added.",
              ).then(() => setNote(""))
            }
            onRespond={() =>
              act(
                `/applications/${selected.id}/respond`,
                responseId ? { responseId } : { body: customResponse },
                "Response sent.",
              ).then(() => {
                setResponseId("");
                setCustomResponse("");
              })
            }
            onInterview={() =>
              act(
                `/applications/${selected.id}/interview`,
                {
                  scheduledAt: new Date(interview.scheduledAt).toISOString(),
                  durationMinutes: Number(interview.durationMinutes),
                  interviewerIds: selected.assigned_recruiter_id ? [selected.assigned_recruiter_id] : [],
                  notes: interview.notes || null,
                },
                "Interview scheduled.",
              )
            }
            targetGuild={targetGuild}
            setTargetGuild={setTargetGuild}
            decision={decision}
            setDecision={setDecision}
            onDecision={() =>
              (decision.decision !== "ACCEPT" ||
                confirm(
                  `Accept ${selected.captain_name ?? "this applicant"} into ${targetGuild}? Their member role and prefix are applied and the ticket is archived.`,
                )) &&
              act(
                `/applications/${selected.id}/decision`,
                decision.decision === "ACCEPT" ? { ...decision, targetGuild } : decision,
                decision.decision === "ACCEPT"
                  ? `Accepted into ${targetGuild}.`
                  : decision.decision === "DECLINE"
                    ? "Application declined."
                    : "Application closed.",
              )
            }
          />
        </section>
      )}

      {tab === "interviews" && (
        <section className="recruitmentCardGrid">
          {interviews.map((a: any) => (
            <ApplicationCard
              key={a.id}
              app={a}
              recruiters={summary.recruiters ?? []}
              onOpen={() => {
                setTab("applications");
                void openApplication(a.id, false);
              }}
            />
          ))}
          {!interviews.length && (
            <Empty title="No interviews scheduled" text="Applications moved to Interview will appear here." />
          )}
        </section>
      )}

      {tab === "history" && (
        <section className="recruitmentHistory">
          <ApplicationList
            apps={history}
            selectedId={selectedId}
            recruiters={summary.recruiters ?? []}
            onOpen={(id) => void openApplication(id, false)}
          />
          {selected && FINAL.has(selected.status) && <ApplicationReadOnly app={selected} />}
        </section>
      )}

      {tab === "settings" && settings && (
        <SettingsPanel
          settings={settings}
          setSettings={setSettings}
          responses={responses}
          setResponses={setResponses}
          newResponse={newResponse}
          setNewResponse={setNewResponse}
          busy={busy}
          onSave={saveSettings}
          onSaveResponse={saveResponse}
          onDeleteResponse={deleteResponse}
          onAddResponse={addResponse}
        />
      )}
    </div>
  );
}

function ApplicantView({ summary }: { summary: any }) {
  const a = summary.application;
  if (!a)
    return (
      <div className="recruitmentPage">
        <header className="recruitmentHero">
          <div>
            <span className="eyebrow">BAND OF MISFITS</span>
            <h1>My Application</h1>
            <p>
              Your recruitment status will appear here after you apply from the Welcome panel or with{" "}
              <b>/apply</b>.
            </p>
          </div>
        </header>
        <Empty
          title={summary.enabled ? "No application yet" : "Applications are currently closed"}
          text={
            summary.enabled
              ? "Use the Apply to the Guild button in Discord or /apply to start your application."
              : "Recruitment is not accepting applications at the moment."
          }
        />
      </div>
    );
  const events = a.events ?? [],
    interview = (a.interviews ?? []).find((x: any) => x.status !== "CANCELLED");
  return (
    <div className="recruitmentPage applicantApplication">
      <header className="recruitmentHero">
        <div>
          <span className="eyebrow">MY BOM APPLICATION</span>
          <h1>{LABELS[a.status] ?? a.status}</h1>
          <p>{nextText(a)}</p>
        </div>
        <span className={`applicationState state-${String(a.status).toLowerCase()}`}>
          {LABELS[a.status] ?? a.status}
        </span>
      </header>
      <section className="applicantStatusGrid">
        <article>
          <small>Assigned recruiter</small>
          <b>
            {a.assignedRecruiter?.display_name ??
              a.assignedRecruiter?.username ??
              (a.assigned_recruiter_id ? "Assigned recruiter" : "Not assigned yet")}
          </b>
        </article>
        <article>
          <small>Waiting on</small>
          <b>{WAITING[a.waiting_on] ?? a.waiting_on}</b>
        </article>
        <article>
          <small>Last update</small>
          <b>{ago(a.updated_at)}</b>
        </article>
      </section>
      {interview && (
        <article className="membershipPanel">
          <span className="eyebrow">INTERVIEW</span>
          <h2>{niceDate(interview.scheduled_at)}</h2>
          <p>
            {interview.duration_minutes} minutes
            {interview.applicant_timezone ? ` · ${interview.applicant_timezone}` : ""}
          </p>
        </article>
      )}
      <article className="membershipPanel">
        <header>
          <span className="eyebrow">APPLICATION PROGRESS</span>
          <h2>Where Things Stand</h2>
        </header>
        <div className="recruitmentTimeline">
          {events
            .filter((e: any) => e.visibility === "APPLICANT")
            .map((e: any) => (
              <div key={e.id}>
                <i></i>
                <span>
                  <b>{e.message || e.event_type}</b>
                  <small>
                    {niceDate(e.created_at)}
                    {e.actor_id ? ` · by ${e.actor_id}` : ""}
                  </small>
                </span>
              </div>
            ))}
          {!events.length && <p className="muted">Your application timeline is just getting started.</p>}
        </div>
      </article>
    </div>
  );
}

function ApplicationCard({ app, recruiters, onOpen }: { app: any; recruiters: any[]; onOpen: () => void }) {
  const owner = recruiters.find((r) => String(r.id) === String(app.assigned_recruiter_id));
  return (
    <button className="applicationCard" onClick={onOpen}>
      <div className="applicationIdentity">
        {avatar(app) ? (
          <img src={avatar(app)} alt="" />
        ) : (
          <span>{String(display(app)).slice(0, 1).toUpperCase()}</span>
        )}
        <div>
          <b>{display(app)}</b>
          <small>{app.captain_name ?? "Captain name unavailable"}</small>
        </div>
      </div>
      <div className="applicationCardMeta">
        <span>{LABELS[app.status] ?? app.status}</span>
        <small>
          {owner?.displayName ?? (app.assigned_recruiter_id ? "Assigned" : "Unassigned")} ·{" "}
          {ago(app.updated_at)}
        </small>
      </div>
      <small>
        Waiting on {WAITING[app.waiting_on] ?? app.waiting_on} · last activity {ago(app.updated_at)}
      </small>
      {["RECRUITER", "LEADERSHIP"].includes(app.waiting_on) &&
        Date.now() - new Date(app.updated_at).getTime() > 86400000 && (
          <em>Follow-up due · over 24h without activity</em>
        )}
    </button>
  );
}
function ApplicationList({
  apps,
  selectedId,
  recruiters,
  onOpen,
}: {
  apps: any[];
  selectedId: string | null;
  recruiters: any[];
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [waiting, setWaiting] = useState("ALL");
  const visible = apps.filter(
    (a) =>
      (waiting === "ALL" || a.waiting_on === waiting) &&
      [display(a), a.captain_name, a.user_id].some((v) =>
        String(v ?? "")
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
  );
  return (
    <aside className="applicationList">
      <header>
        <b>Applications</b>
        <span>
          {visible.length}/{apps.length}
        </span>
      </header>
      <label>
        Find applicant
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <label>
        Waiting on
        <select value={waiting} onChange={(e) => setWaiting(e.target.value)}>
          <option value="ALL">Anyone</option>
          {Object.entries(WAITING).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <SavedViewControl
        section="recruitment-list"
        state={{ query, waiting }}
        onApply={(v) => {
          setQuery(String(v.query ?? ""));
          setWaiting(v.waiting === "ALL" || Object.hasOwn(WAITING, v.waiting) ? v.waiting : "ALL");
        }}
      />
      {visible.map((a) => (
        <div className={selectedId === a.id ? "selected" : ""} key={a.id}>
          <ApplicationCard app={a} recruiters={recruiters} onOpen={() => onOpen(a.id)} />
        </div>
      ))}
      {!visible.length && (
        <p className="muted">
          No applications match this view. Clear the search or change the waiting filter.
        </p>
      )}
    </aside>
  );
}

function ApplicationDetail(props: any) {
  const a = props.app;
  if (!a)
    return (
      <Empty title="Select an application" text="Choose an applicant to open their full review workspace." />
    );
  const recruiter = props.recruiters.find((r: any) => String(r.id) === String(a.assigned_recruiter_id));
  return (
    <section className="applicationDossier">
      <header className="dossierHead">
        <div className="applicationIdentity large">
          {avatar(a) ? <img src={avatar(a)} alt="" /> : <span>{String(display(a)).slice(0, 1)}</span>}
          <div>
            <span className="eyebrow">{LABELS[a.status] ?? a.status}</span>
            <h2>{display(a)}</h2>
            <p>
              Captain: <b>{a.captain_name ?? "—"}</b> · Rank {a.game_rank ?? "—"}
            </p>
          </div>
        </div>
        <div>
          <small>Assigned recruiter</small>
          <b>{recruiter?.displayName ?? "Unassigned"}</b>
        </div>
      </header>
      <div className="dossierFacts">
        <span>
          <small>Waiting on</small>
          <b>{WAITING[a.waiting_on] ?? a.waiting_on}</b>
        </span>
        <span>
          <small>Applied</small>
          <b>{niceDate(a.submitted_at)}</b>
        </span>
        <span>
          <small>Last update</small>
          <b>{ago(a.updated_at)}</b>
        </span>
        <span>
          <small>Previous applications</small>
          <b>{a.previousApplications?.length ?? 0}</b>
        </span>
      </div>
      <div className="dossierColumns">
        <article className="membershipPanel">
          <header>
            <h3>Application</h3>
          </header>
          <dl className="applicationAnswers">
            <dt>Why BOM?</dt>
            <dd>{a.why_bom || "—"}</dd>
            <dt>Port Battle / PvP experience</dt>
            <dd>{a.pb_experience || "—"}</dd>
            <dt>Previous guilds</dt>
            <dd>{a.previous_guilds || "—"}</dd>
            <dt>Time zone / usual play times</dt>
            <dd>{a.timezone || "—"}</dd>
            <dt>Expected activity</dt>
            <dd>{a.activity_expectation || "—"}</dd>
            <dt>Anything else</dt>
            <dd>{a.extra || "—"}</dd>
          </dl>
          {a.hours_attachment_url && (
            <a
              className="secondaryAction inlineAction"
              target="_blank"
              rel="noreferrer"
              href={a.hours_attachment_url}
            >
              View hours screenshot
            </a>
          )}
        </article>
        <article className="membershipPanel recruiterControls">
          <header>
            <h3>Recruiter Controls</h3>
            <p>Conversation stays in Discord. Use these controls for ownership and workflow state.</p>
          </header>
          <label>
            Assigned recruiter
            <select value={a.assigned_recruiter_id ?? ""} onChange={(e) => props.onAssign(e.target.value)}>
              <option value="">Choose recruiter</option>
              {props.recruiters.map((r: any) => (
                <option key={r.id} value={r.id}>
                  {r.displayName}
                </option>
              ))}
            </select>
          </label>
          <div className="twoCol">
            <label>
              Stage
              <select
                value={props.statusDraft.status}
                onChange={(e) => props.setStatusDraft({ ...props.statusDraft, status: e.target.value })}
              >
                {Object.entries(LABELS)
                  .filter(([k]) => MANUAL_STAGES.includes(k))
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Waiting on
              <select
                value={props.statusDraft.waitingOn}
                onChange={(e) => props.setStatusDraft({ ...props.statusDraft, waitingOn: e.target.value })}
              >
                {Object.entries(WAITING).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Outstanding request
            <input
              value={props.statusDraft.currentRequest}
              onChange={(e) => props.setStatusDraft({ ...props.statusDraft, currentRequest: e.target.value })}
              placeholder="What does the applicant need to do?"
            />
          </label>
          <label>
            Applicant-visible update
            <textarea
              value={props.statusDraft.applicantMessage}
              onChange={(e) =>
                props.setStatusDraft({ ...props.statusDraft, applicantMessage: e.target.value })
              }
              placeholder="Optional message posted to the applicant when you save this stage."
            />
          </label>
          <button disabled={props.busy} className="primaryAction" onClick={props.onStatus}>
            Update Stage
          </button>
        </article>
      </div>
      <div className="dossierColumns">
        <article className="membershipPanel">
          <header>
            <h3>Respond</h3>
            <p>Use a canned response or send a custom recruiter message.</p>
          </header>
          <label>
            Canned response
            <select
              value={props.responseId}
              onChange={(e) => {
                props.setResponseId(e.target.value);
                props.setCustomResponse("");
              }}
            >
              <option value="">Choose response</option>
              {props.responses
                .filter((r: any) => r.enabled)
                .map((r: any) => (
                  <option key={r.id} value={r.id}>
                    {r.category} · {r.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Or custom response
            <textarea
              value={props.customResponse}
              onChange={(e) => {
                props.setCustomResponse(e.target.value);
                if (e.target.value) props.setResponseId("");
              }}
              placeholder="Message sent into the applicant ticket."
            />
          </label>
          <button
            disabled={props.busy || (!props.responseId && !props.customResponse.trim())}
            className="primaryAction"
            onClick={props.onRespond}
          >
            Send Response
          </button>
        </article>
        <article className="membershipPanel">
          <header>
            <h3>Notes</h3>
            <p>Internal notes stay hidden. Applicant updates appear in their timeline and ticket.</p>
          </header>
          <label>
            Visibility
            <select value={props.noteVisibility} onChange={(e) => props.setNoteVisibility(e.target.value)}>
              <option value="INTERNAL">Internal note</option>
              <option value="APPLICANT">Applicant update</option>
            </select>
          </label>
          <textarea
            value={props.note}
            onChange={(e) => props.setNote(e.target.value)}
            placeholder="Write a recruitment note…"
          />
          <button
            disabled={props.busy || !props.note.trim()}
            className="secondaryAction"
            onClick={props.onNote}
          >
            Add Note
          </button>
        </article>
      </div>
      <div className="dossierColumns">
        <article className="membershipPanel">
          <header>
            <h3>Interview</h3>
          </header>
          <label>
            Date & time
            <input
              type="datetime-local"
              value={props.interview.scheduledAt}
              onChange={(e) => props.setInterview({ ...props.interview, scheduledAt: e.target.value })}
            />
          </label>
          <label>
            Duration
            <select
              value={props.interview.durationMinutes}
              onChange={(e) =>
                props.setInterview({ ...props.interview, durationMinutes: Number(e.target.value) })
              }
            >
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>60 minutes</option>
              <option value={90}>90 minutes</option>
            </select>
          </label>
          <label>
            Internal notes
            <textarea
              value={props.interview.notes}
              onChange={(e) => props.setInterview({ ...props.interview, notes: e.target.value })}
            />
          </label>
          <button
            disabled={props.busy || !props.interview.scheduledAt}
            className="primaryAction"
            onClick={props.onInterview}
          >
            Schedule Interview
          </button>
        </article>
      </div>
      <article className="membershipPanel applicationDecisionPanel">
        <header>
          <span className="eyebrow">DECISION</span>
          <h3>Decide this application</h3>
          <p>
            Usually after the interview. Accept gives the member role and closes the ticket; Decline applies
            the reapplication cooldown; Close ends the record without a cooldown.
            {!props.admin && " Only leadership can accept."}
          </p>
        </header>
        <div className="twoCol">
          <label>
            Decision
            <select
              value={props.decision.decision}
              onChange={(e) => props.setDecision({ ...props.decision, decision: e.target.value })}
            >
              {props.admin && <option value="ACCEPT">Accept</option>}
              <option value="DECLINE">Decline</option>
              <option value="CLOSE">Close without decision</option>
            </select>
          </label>
          {props.decision.decision === "ACCEPT" && (
            <label>
              Accept into
              <select value={props.targetGuild} onChange={(e) => props.setTargetGuild(e.target.value)}>
                <option value="BOM">BOM · Main Guild</option>
                <option value="BoM">BoM · Second Guild</option>
              </select>
            </label>
          )}
        </div>
        <label>
          Message to the applicant
          <textarea
            value={props.decision.reason}
            onChange={(e) => props.setDecision({ ...props.decision, reason: e.target.value })}
            placeholder={
              props.decision.decision === "ACCEPT"
                ? "Welcome them aboard."
                : "Explain the decision clearly and respectfully."
            }
          />
        </label>
        <button
          disabled={props.busy || !props.decision.reason.trim()}
          className={props.decision.decision === "ACCEPT" ? "primaryAction" : "dangerAction"}
          onClick={props.onDecision}
        >
          {props.decision.decision === "ACCEPT"
            ? `Accept into ${props.targetGuild}`
            : props.decision.decision === "DECLINE"
              ? "Decline Application"
              : "Close Application"}
        </button>
      </article>
      <article className="membershipPanel">
        <header>
          <h3>Timeline</h3>
        </header>
        <div className="recruitmentTimeline">
          {(a.events ?? []).map((e: any) => (
            <div key={e.id}>
              <i></i>
              <span>
                <b>{e.message || e.event_type}</b>
                <small>
                  {e.visibility === "INTERNAL" ? "Internal · " : ""}
                  {niceDate(e.created_at)}
                </small>
              </span>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

function ApplicationReadOnly({ app: a }: { app: any }) {
  return (
    <article className="applicationDossier">
      <header className="dossierHead">
        <div>
          <span className="eyebrow">APPLICATION HISTORY</span>
          <h2>{display(a)}</h2>
          <p>
            {LABELS[a.status] ?? a.status} · {niceDate(a.closed_at ?? a.updated_at)}
          </p>
        </div>
      </header>
      <p>{a.decision_reason || "No final note was recorded."}</p>
      <div className="recruitmentTimeline">
        {(a.events ?? []).map((e: any) => (
          <div key={e.id}>
            <i></i>
            <span>
              <b>{e.message || e.event_type}</b>
              <small>
                {niceDate(e.created_at)}
                {e.actor_id ? ` · by ${e.actor_id}` : ""}
              </small>
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

function SettingsPanel({
  settings,
  setSettings,
  responses,
  setResponses,
  newResponse,
  setNewResponse,
  busy,
  onSave,
  onSaveResponse,
  onDeleteResponse,
  onAddResponse,
}: any) {
  const [refreshingDiscord, setRefreshingDiscord] = useState(false);
  async function refreshDiscord() {
    setRefreshingDiscord(true);
    try {
      const r = await api("/discord-context");
      setSettings((current: any) => ({ ...current, discord: r.discord }));
    } catch (e) {
      console.warn("Could not refresh Discord options", e);
    } finally {
      setRefreshingDiscord(false);
    }
  }
  const d = settings.discord ?? {},
    roles = d.roles ?? [],
    categories = d.categories ?? [];
  return (
    <section className="recruitmentSettings">
      <article className="membershipPanel">
        <header>
          <span className="eyebrow">RECRUITMENT PIPELINE</span>
          <h2>Application Settings</h2>
        </header>
        <div className="adminFormGrid">
          <label className="checkLine">
            <input
              type="checkbox"
              checked={Boolean(settings.enabled)}
              onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
            />
            Recruitment enabled
          </label>
          <label>
            Application ticket category
            <DiscordOptionsSelect
              onRefresh={() => void refreshDiscord()}
              refreshing={refreshingDiscord}
              value={settings.ticket_category_id ?? ""}
              onChange={(e) => setSettings({ ...settings, ticket_category_id: e.target.value || null })}
            >
              <option value="">Choose category</option>
              {categories.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </DiscordOptionsSelect>
          </label>
          <label>
            Recruiter roles
            <RoleTagPicker
              roles={roles}
              value={settings.recruiter_role_ids ?? []}
              onChange={(ids) => setSettings({ ...settings, recruiter_role_ids: ids })}
              onRefresh={() => void refreshDiscord()}
            />
          </label>
          <label>
            Applicant role
            <DiscordOptionsSelect
              onRefresh={() => void refreshDiscord()}
              refreshing={refreshingDiscord}
              value={settings.applicant_role_id ?? ""}
              onChange={(e) => setSettings({ ...settings, applicant_role_id: e.target.value || null })}
            >
              <option value="">No Applicant role</option>
              {roles.map((r: any) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </DiscordOptionsSelect>
          </label>
          <label>
            Accepted member role
            <DiscordOptionsSelect
              onRefresh={() => void refreshDiscord()}
              refreshing={refreshingDiscord}
              value={settings.accepted_role_id ?? ""}
              onChange={(e) => setSettings({ ...settings, accepted_role_id: e.target.value || null })}
            >
              <option value="">Use Membership member role</option>
              {roles.map((r: any) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </DiscordOptionsSelect>
          </label>
          <label>
            BoM accepted member role
            <DiscordOptionsSelect
              onRefresh={() => void refreshDiscord()}
              refreshing={refreshingDiscord}
              value={settings.accepted_second_guild_role_id ?? ""}
              onChange={(e) =>
                setSettings({ ...settings, accepted_second_guild_role_id: e.target.value || null })
              }
            >
              <option value="">Choose BoM role</option>
              {roles.map((r: any) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </DiscordOptionsSelect>
            <small>Given when someone is accepted into BoM; BOM uses the member role above.</small>
          </label>
          <label>
            Interview voice category
            <DiscordOptionsSelect
              onRefresh={() => void refreshDiscord()}
              refreshing={refreshingDiscord}
              value={settings.interview_voice_category_id ?? ""}
              onChange={(e) =>
                setSettings({ ...settings, interview_voice_category_id: e.target.value || null })
              }
            >
              <option value="">Use application category</option>
              {categories.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </DiscordOptionsSelect>
          </label>
          <label>
            Community feedback role
            <DiscordOptionsSelect
              onRefresh={() => void refreshDiscord()}
              refreshing={refreshingDiscord}
              value={settings.community_feedback_role_id ?? ""}
              onChange={(e) =>
                setSettings({ ...settings, community_feedback_role_id: e.target.value || null })
              }
            >
              <option value="">Recruiters only</option>
              {roles.map((r: any) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </DiscordOptionsSelect>
          </label>
          <label>
            Reapply cooldown after a decline
            <input
              type="number"
              min={0}
              value={settings.application_reapply_days ?? 7}
              onChange={(e) => setSettings({ ...settings, application_reapply_days: Number(e.target.value) })}
            />
            <small>days</small>
          </label>
          <label className="checkLine">
            <input
              type="checkbox"
              checked={Boolean(settings.screenshot_required)}
              onChange={(e) => setSettings({ ...settings, screenshot_required: e.target.checked })}
            />
            Require hours screenshot
          </label>
          <label>
            Unclaimed reminder
            <input
              type="number"
              min={0}
              value={settings.unclaimed_reminder_minutes ?? 120}
              onChange={(e) =>
                setSettings({ ...settings, unclaimed_reminder_minutes: Number(e.target.value) })
              }
            />
            <small>minutes · 0 disables</small>
          </label>
          <label>
            Applicant reminder
            <input
              type="number"
              min={0}
              value={settings.applicant_reminder_hours ?? 24}
              onChange={(e) => setSettings({ ...settings, applicant_reminder_hours: Number(e.target.value) })}
            />
            <small>hours · 0 disables</small>
          </label>
          <label>
            Ticket deletion delay
            <input
              type="number"
              min={10}
              max={86400}
              value={settings.cleanup_delay_seconds ?? 60}
              onChange={(e) => setSettings({ ...settings, cleanup_delay_seconds: Number(e.target.value) })}
            />
            <small>seconds after archival</small>
          </label>
          <label>
            Archive channel ID
            <input
              value={settings.archive_channel_id ?? ""}
              onChange={(e) => setSettings({ ...settings, archive_channel_id: e.target.value })}
            />
          </label>
          <label>
            Auto-close inactivity
            <input
              type="number"
              min={0}
              value={settings.auto_close_hours ?? 168}
              onChange={(e) => setSettings({ ...settings, auto_close_hours: Number(e.target.value) })}
            />
            <small>hours · 0 disables</small>
          </label>
        </div>
        <button className="primaryAction" disabled={busy} onClick={onSave}>
          Save Recruitment Settings
        </button>
      </article>
      <article className="membershipPanel">
        <header>
          <span className="eyebrow">CANNED RESPONSES</span>
          <h2>Recruiter Response Library</h2>
          <p>Responses can optionally change the applicant stage and who the application is waiting on.</p>
        </header>
        <div className="cannedResponseList">
          {responses.map((r: any) => (
            <div className="cannedResponseEditor" key={r.id}>
              <div className="twoCol">
                <input
                  value={r.name}
                  onChange={(e) =>
                    setResponses((x: any[]) =>
                      x.map((q) => (q.id === r.id ? { ...q, name: e.target.value } : q)),
                    )
                  }
                />
                <input
                  value={r.category}
                  onChange={(e) =>
                    setResponses((x: any[]) =>
                      x.map((q) => (q.id === r.id ? { ...q, category: e.target.value } : q)),
                    )
                  }
                />
              </div>
              <textarea
                value={r.body}
                onChange={(e) =>
                  setResponses((x: any[]) =>
                    x.map((q) => (q.id === r.id ? { ...q, body: e.target.value } : q)),
                  )
                }
              />
              <div className="threeCol">
                <select
                  value={r.set_status ?? ""}
                  onChange={(e) =>
                    setResponses((x: any[]) =>
                      x.map((q) => (q.id === r.id ? { ...q, set_status: e.target.value || null } : q)),
                    )
                  }
                >
                  <option value="">No stage change</option>
                  {Object.entries(LABELS)
                    .filter(([k]) => MANUAL_STAGES.includes(k))
                    .map(([k, v]) => (
                      <option value={k} key={k}>
                        {v}
                      </option>
                    ))}
                </select>
                <select
                  value={r.set_waiting_on ?? ""}
                  onChange={(e) =>
                    setResponses((x: any[]) =>
                      x.map((q) => (q.id === r.id ? { ...q, set_waiting_on: e.target.value || null } : q)),
                    )
                  }
                >
                  <option value="">No waiting change</option>
                  {Object.entries(WAITING).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <input
                  value={r.requested_item ?? ""}
                  onChange={(e) =>
                    setResponses((x: any[]) =>
                      x.map((q) => (q.id === r.id ? { ...q, requested_item: e.target.value } : q)),
                    )
                  }
                  placeholder="Requested item"
                />
              </div>
              <div className="responseEditorActions">
                <label className="checkLine">
                  <input
                    type="checkbox"
                    checked={Boolean(r.enabled)}
                    onChange={(e) =>
                      setResponses((x: any[]) =>
                        x.map((q) => (q.id === r.id ? { ...q, enabled: e.target.checked } : q)),
                      )
                    }
                  />
                  Enabled
                </label>
                <button className="secondaryAction" onClick={() => onSaveResponse(r)}>
                  Save
                </button>
                <button className="textButton dangerText" onClick={() => onDeleteResponse(r.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="newResponseEditor">
          <h3>Add Response</h3>
          <div className="twoCol">
            <input
              value={newResponse.name}
              onChange={(e) => setNewResponse({ ...newResponse, name: e.target.value })}
              placeholder="Response name"
            />
            <input
              value={newResponse.category}
              onChange={(e) => setNewResponse({ ...newResponse, category: e.target.value })}
              placeholder="Category"
            />
          </div>
          <textarea
            value={newResponse.body}
            onChange={(e) => setNewResponse({ ...newResponse, body: e.target.value })}
            placeholder="Applicant-facing message"
          />
          <button
            className="primaryAction"
            disabled={!newResponse.name.trim() || !newResponse.body.trim()}
            onClick={onAddResponse}
          >
            Add Canned Response
          </button>
        </div>
      </article>
    </section>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="recruitmentEmpty">
      <div>
        <span>☠</span>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
    </div>
  );
}
