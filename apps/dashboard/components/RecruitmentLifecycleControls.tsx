"use client";
import { useState } from "react";
export default function RecruitmentLifecycleControls({
  application: a,
  admin,
  onChanged,
}: {
  application: any;
  admin: boolean;
  onChanged: () => Promise<void>;
}) {
  const [reason, setReason] = useState(""),
    [guild, setGuild] = useState(a.target_guild_tag ?? "BOM"),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [review, setReview] = useState(false);
  const terminal = ["ACCEPTED", "DECLINED", "WITHDRAWN", "CLOSED"].includes(a.status),
    job = a.completion;
  async function act(path: string, body: any) {
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch(`/api/internal/recruitment/applications/${a.id}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message ?? d.error);
      setReview(false);
      await onChanged();
      setNotice("Saved. Background work will appear below.");
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function transcript() {
    try {
      const r = await fetch(`/api/internal/recruitment/applications/${a.id}/transcript`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }),
        url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = `application-${a.id}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setNotice(e.message);
    }
  }
  return (
    <article className="membershipPanel">
      <header>
        <h3>Membership decision & ticket cleanup</h3>
        <p>Decisions remain in history after the private ticket is archived and removed.</p>
      </header>
      {notice && <p role="status">{notice}</p>}
      {!terminal && (
        <>
          <div className="twoCol">
            <label>
              Membership guild
              <select value={guild} onChange={(e) => setGuild(e.target.value)}>
                <option value="BOM">BOM</option>
                <option value="BoM">BoM 2</option>
              </select>
            </label>
            <label>
              Applicant-facing reason
              <textarea value={reason} maxLength={3000} onChange={(e) => setReason(e.target.value)} />
            </label>
          </div>
          {admin && (
            <button
              disabled={busy || !reason.trim()}
              className="primaryAction"
              onClick={() => setReview(true)}
            >
              Accept Without Trial
            </button>
          )}
          <button
            disabled={busy || !reason.trim()}
            onClick={() => void act("decision", { decision: "CLOSE", reason })}
          >
            Close Application
          </button>
          {review && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Review direct acceptance"
              className="warningPanel"
            >
              <h4>
                Accept {a.captain_name} into {guild === "BoM" ? "BoM 2" : "BOM"}?
              </h4>
              <p>
                The trial is bypassed. Membership roles and prefix will be applied, trial reminders stopped,
                and this ticket archived and deleted.
              </p>
              <blockquote>{reason}</blockquote>
              <button
                disabled={busy}
                onClick={() => void act("decision", { decision: "ACCEPT", reason, targetGuild: guild })}
              >
                Confirm Acceptance
              </button>
              <button disabled={busy} onClick={() => setReview(false)}>
                Back
              </button>
            </div>
          )}
        </>
      )}
      {terminal && (
        <>
          <dl className="dossierFacts">
            <span>
              <small>Decision</small>
              <b>{a.status}</b>
            </span>
            <span>
              <small>Roles / prefix</small>
              <b>{job?.role_state ?? "Queued"}</b>
            </span>
            <span>
              <small>Applicant DM</small>
              <b>{job?.dm_state ?? "Queued"}</b>
            </span>
            <span>
              <small>Transcript</small>
              <b>{job?.transcript_state ?? "Queued"}</b>
            </span>
            <span>
              <small>Archive notice</small>
              <b>{job?.archive_state ?? "Queued"}</b>
            </span>
            <span>
              <small>Ticket cleanup</small>
              <b>{job?.status ?? "Queued"}</b>
            </span>
          </dl>
          {job?.delete_after && !job.channel_deleted_at && (
            <p>Deletion scheduled: {new Date(job.delete_after).toLocaleString()}</p>
          )}
          {job?.error && <p role="alert">{job.error}</p>}
          <div className="controlRow">
            {admin && a.status !== "ACCEPTED" && (
              <button
                disabled={busy}
                onClick={() => {
                  const note = prompt("Reason to reopen this application?");
                  if (note?.trim()) void act("reopen", { reason: note });
                }}
              >
                Reopen Application
              </button>
            )}
            <button onClick={() => void onChanged()}>Refresh</button>
            <button disabled={job?.transcript_state !== "COMPLETE"} onClick={() => void transcript()}>
              Download Transcript
            </button>
            <button
              disabled={busy || job?.status === "COMPLETE"}
              onClick={() => void act("cleanup", { action: "CANCEL" })}
            >
              Cancel Deletion
            </button>
            <button
              disabled={busy || job?.status === "COMPLETE"}
              onClick={() => void act("cleanup", { action: "RETRY" })}
            >
              Retry Cleanup
            </button>
            {job?.dm_state === "FAILED" && (
              <button disabled={busy} onClick={() => void act("cleanup", { action: "RESEND_DM" })}>
                Resend Failed DM
              </button>
            )}
          </div>
        </>
      )}
    </article>
  );
}
