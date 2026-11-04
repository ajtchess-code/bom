"use client";
import { useEffect, useRef, useState } from "react";
import AwayAdminPanel from "./AwayAdminPanel";
import { operationsApi, displayDate, downloadCsv } from "./operationsApi";
import "./CommunityOperations.css";
export default function LeaveDashboard() {
  const settingsDirty = useRef(false);
  const [data, setData] = useState<any>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("away"),
    [target, setTarget] = useState(""),
    [when, setWhen] = useState("in 7 days"),
    [reason, setReason] = useState(""),
    [ack, setAck] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [rejoins, setRejoins] = useState<any[]>([]),
    [settings, setSettings] = useState<any>(null);
  async function load() {
    const d = await operationsApi("community/leaves");
    setData(d);
    setTarget((current) => current || d.userId);
    if (d.canReviewRejoins) setRejoins(await operationsApi("community/rejoins"));
    if (d.canConfigure && !settingsDirty.current) {
      const nextSettings = await operationsApi("community/operations/settings");
      if (!settingsDirty.current) setSettings(nextSettings);
    }
  }
  useEffect(() => {
    void load().catch((e) => setNotice(e.message));
    const timer = setInterval(() => void load().catch(() => {}), 15000);
    return () => clearInterval(timer);
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
  const now = Date.now(),
    rows = (data?.leaves ?? []).filter((r: any) =>
      filter === "history"
        ? true
        : r.status === "AWAY" &&
          (filter === "week"
            ? new Date(r.return_at).getTime() >= now && new Date(r.return_at).getTime() < now + 7 * 86400000
            : filter === "overdue"
              ? new Date(r.return_at).getTime() < now
              : filter === "mine"
                ? r.user_id === data.userId
                : true),
    );
  return (
    <div className="opsPage">
      <header>
        <div>
          <h1>Leave of Absence</h1>
          <p>Requests, return dates and member check-ins</p>
        </div>
        <div className="opsActions">
          <a className="opsLink" href="/dashboard/members">
            Guild Roster
          </a>
          <button disabled={busy} onClick={() => void act(load)}>
            Refresh
          </button>
        </div>
      </header>
      {notice && (
        <p className="opsNotice" role="status">
          {notice}
        </p>
      )}
      <div className="opsGrid">
        <section className="opsCard">
          <h2>Request or Update Leave</h2>
          {data?.canManage && (
            <label>
              Discord member ID
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="Your ID or a member's ID"
              />
            </label>
          )}
          <label>
            Expected return
            <select
              value={["in 3 days", "in 7 days", "in 14 days", "in 30 days"].includes(when) ? when : "custom"}
              onChange={(e) => setWhen(e.target.value === "custom" ? "" : e.target.value)}
            >
              {[3, 7, 14, 30].map((n) => (
                <option key={n} value={`in ${n} days`}>
                  {n} days
                </option>
              ))}
              <option value="custom">Choose a date</option>
            </select>
          </label>
          <label>
            Return date or natural language
            <input
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              placeholder="in 14 days / August 6th / Jan 12 2028"
            />
          </label>
          <label>
            Reason (optional)
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </label>
          <label className="opsCheckbox">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            For leave longer than 30 days, I understand that I should leave the active in-game guild and apply
            to BoM.
          </label>
          <div className="opsActions">
            <button
              className="primary"
              disabled={busy || !when.trim()}
              onClick={() =>
                void act(async () => {
                  const job = await operationsApi("community/leaves", {
                    method: "POST",
                    body: JSON.stringify({
                      userId: target || data.userId,
                      action: "LEAVE",
                      when,
                      reason,
                      extendedAcknowledged: ack,
                    }),
                  });
                  setNotice("Leave update queued. Check its delivery status below. Reference: " + job.jobId);
                })
              }
            >
              Save Leave
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await operationsApi("community/leaves", {
                    method: "POST",
                    body: JSON.stringify({ userId: target || data.userId, action: "RETURN" }),
                  });
                  setNotice("Return update queued. Check its delivery status below.");
                })
              }
            >
              I Have Returned (Mark as Active)
            </button>
          </div>
        </section>
        <section className="opsCard">
          <h2>Away Overview</h2>
          <div className="opsStat">
            {data?.leaves?.filter((r: any) => r.status === "AWAY").length ?? 0} away
          </div>
          <p>
            {data?.leaves?.filter((r: any) => r.status === "AWAY" && new Date(r.return_at).getTime() < now)
              .length ?? 0}{" "}
            overdue returns
          </p>
          <p className="opsHint">
            Leave details live in a private Discord thread. The bot archives it after 24 hours and reopens it
            at the return date to ask whether to extend or return. Optional reasons are visible to the
            requester and officers.
          </p>
          {data?.canAdmin && (
            <>
              <h3>Member Check-ins</h3>
              <p className="opsHint">
                Select away members below, then send the existing “Still playing / Take leave / No longer
                playing” check-in. DM mutes are respected.
              </p>
              <button
                disabled={busy || !selected.length}
                onClick={() => {
                  if (confirm(`Send check-in DMs to ${selected.length} selected members?`))
                    void act(async () => {
                      const results = [];
                      for (let i = 0; i < selected.length; i += 15) {
                        const result = await operationsApi("membership/checkins/send", {
                          method: "POST",
                          body: JSON.stringify({ userIds: selected.slice(i, i + 15) }),
                        });
                        results.push(...(result.results ?? []));
                      }
                      setNotice(JSON.stringify(results, null, 2));
                      setSelected([]);
                    });
                }}
              >
                Send Check-ins ({selected.length})
              </button>
            </>
          )}
        </section>
      </div>
      <section className="opsCard">
        <div className="opsToolbar">
          <h2>Leave Records</h2>
          <select
            aria-label="Filter leave records"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setSelected([]);
            }}
          >
            {[
              ["away", "All away"],
              ["week", "Returning this week"],
              ["overdue", "Overdue"],
              ["mine", "My leave"],
              ["history", "All history"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            onClick={() =>
              downloadCsv("bom-leave.csv", [
                ["Member", "Return", "Status", "Reason"],
                ...rows.map((r: any) => [r.display_name ?? r.user_id, r.return_at, r.status, r.reason ?? ""]),
              ])
            }
          >
            Export CSV
          </button>
        </div>
        <div className="opsTableScroll">
          <table>
            <thead>
              <tr>
                {data?.canManage && (
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all away members in this view"
                      checked={
                        Boolean(rows.filter((r: any) => r.status === "AWAY").length) &&
                        rows
                          .filter((r: any) => r.status === "AWAY")
                          .every((r: any) => selected.includes(r.user_id))
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [
                                ...new Set<string>(
                                  rows.filter((r: any) => r.status === "AWAY").map((r: any) => r.user_id),
                                ),
                              ]
                            : [],
                        )
                      }
                    />
                  </th>
                )}
                <th>Member</th>
                <th>Return</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id}>
                  {data?.canManage && (
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.display_name ?? r.user_id}`}
                        disabled={r.status !== "AWAY"}
                        checked={selected.includes(r.user_id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, r.user_id]
                              : selected.filter((x) => x !== r.user_id),
                          )
                        }
                      />
                    </td>
                  )}
                  <td>
                    {r.display_name ?? r.user_id}
                    <small>{r.user_id}</small>
                    {data?.canManage && r.status === "AWAY" && (
                      <button
                        onClick={() => {
                          setTarget(r.user_id);
                          setWhen(new Date(r.return_at).toISOString().slice(0, 10));
                          setReason(r.reason ?? "");
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        Edit Leave
                      </button>
                    )}
                  </td>
                  <td>{displayDate(r.return_at)}</td>
                  <td>{r.status}</td>
                  <td>
                    {r.reason ?? "—"}
                    {r.thread_error && <small>Thread needs repair: {r.thread_error}</small>}
                    {r.thread_id && (data.canManage || r.user_id === data.userId) && (
                      <small>
                        <a
                          href={`https://discord.com/channels/${data.guildId}/${r.thread_id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open leave thread
                        </a>
                      </small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p className="uiEmpty">No leave records in this view.</p>}
      </section>
      <section className="opsCard">
        <h2>Recent Leave Updates</h2>
        <div className="opsList">
          {data?.jobs?.map((j: any) => (
            <article key={j.id}>
              <b>
                {j.action} · {j.status}
              </b>{" "}
              · {j.user_id}
              <p>{j.error ?? displayDate(j.created_at)}</p>
            </article>
          ))}
        </div>
      </section>
      {(data?.canReviewRejoins || data?.canConfigure || data?.canAdmin) && (
        <>
          {data?.canAdmin && (
            <details className="opsCard">
              <summary>All-Member Check-ins & Prefix Audit</summary>
              <AwayAdminPanel />
            </details>
          )}
          {data?.canReviewRejoins && (
            <section className="opsCard">
              <h2>Returning Member Review</h2>
              <p className="opsHint">
                No former permissions are restored before approval. Administrative roles require manual
                Discord review. Kicked, banned and unknown departures remain subject to the same explicit
                review.
              </p>
              <div className="opsList">
                {rejoins.map((r) => (
                  <article key={r.id}>
                    <div className="opsToolbar">
                      <b>
                        {r.user_id} · {r.departure_kind}
                      </b>
                      <span className="opsTag">{r.review_status}</span>
                    </div>
                    <small>
                      Left {displayDate(r.departed_at)} · Returned {displayDate(r.returned_at)}
                    </small>
                    <p>Previous roles: {(r.role_ids ?? []).join(", ") || "None recorded"}</p>
                    {r.review_status === "PENDING" && (
                      <div className="opsActions">
                        {["APPROVED", "DECLINED"].map((status) => (
                          <button
                            key={status}
                            disabled={busy}
                            onClick={() => {
                              if (
                                confirm(
                                  `${status === "APPROVED" ? "Restore eligible former roles and request access" : "Decline access restoration"} for this member?`,
                                )
                              )
                                void act(async () => {
                                  await operationsApi(`community/rejoins/${r.id}/decision`, {
                                    method: "POST",
                                    body: JSON.stringify({ status }),
                                  });
                                });
                            }}
                          >
                            {status === "APPROVED" ? "Approve Restoration" : "Decline"}
                          </button>
                        ))}
                      </div>
                    )}
                    {r.error && <p role="status">{r.error}</p>}
                    {r.restored_role_ids && (
                      <p>Restored roles: {r.restored_role_ids.join(", ") || "None eligible"}</p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
          {settings && (
            <section className="opsCard">
              <h2>Guild Operations Settings</h2>
              <div className="opsRow">
                {[
                  ["ledger_role_id", "Treasury / Donation Verification Role ID"],
                  ["rejoin_role_id", "Returning Member Review Role ID"],
                  ["officer_channel_id", "Officer Notification Channel ID"],
                ].map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      disabled={busy}
                      value={settings[key] ?? ""}
                      onChange={(e) => {
                        settingsDirty.current = true;
                        setSettings({ ...settings, [key]: e.target.value });
                      }}
                    />
                  </label>
                ))}
              </div>
              <button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await operationsApi("community/operations/settings", {
                      method: "PUT",
                      body: JSON.stringify({
                        ledgerRoleId: settings.ledger_role_id,
                        rejoinRoleId: settings.rejoin_role_id,
                        officerChannelId: settings.officer_channel_id,
                      }),
                    });
                    settingsDirty.current = false;
                    setNotice("Operations settings saved.");
                  })
                }
              >
                Save Settings
              </button>
            </section>
          )}
        </>
      )}
    </div>
  );
}
