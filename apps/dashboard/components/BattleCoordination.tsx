"use client";
import Link from "next/link";
import RosterHistory from "./RosterHistory";
import { useEffect, useRef, useState } from "react";
async function api(path: string, body?: any, method = "POST") {
  const r = await fetch("/api/internal/wosb/port-battles/" + path, {
    method: body === undefined ? "GET" : method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const x = await r.json();
  if (!r.ok) throw Error(x.message || x.error || "Request failed");
  return x;
}
export default function BattleCoordination({
  battle,
  manager,
  onChanged,
}: {
  battle: any;
  manager: boolean;
  onChanged: () => void;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(""),
    [selected, setSelected] = useState<Record<string, string>>({}),
    [ship, setShip] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState({ userId: "", startsAt: "", endsAt: "", transferMinutes: 0, note: "" }),
    [attendance, setAttendance] = useState({ userId: "", outcome: "ATTENDED", note: "" });
  const activeBattle = useRef(battle.id);
  activeBattle.current = battle.id;
  const refresh = async () => {
    if (!manager) return;
    const id = battle.id;
    try {
      const next = await api(id + "/coordination");
      if (activeBattle.current === id) {
        setData(next);
        setError("");
      }
    } catch (e: any) {
      if (activeBattle.current === id) setError(e.message);
    }
  };
  useEffect(() => {
    setData(null);
    void refresh();
    if (!manager) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [battle.id, manager]);
  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const active = ["OPEN", "CLOSED"].includes(battle.status);
  return (
    <section className="panel battleCoordination">
      <header>
        {manager && <Link href="/dashboard/port-battles/coordination">Multi-battle board →</Link>}
        <h3>{manager ? "Coordination & attendance" : "Availability"}</h3>
      </header>
      {error && (
        <p role="alert">
          {error}{" "}
          {manager && (
            <button className="outlineButton" onClick={refresh}>
              Retry
            </button>
          )}
        </p>
      )}
      {active && (
        <details>
          <summary>I can no longer attend</summary>
          <p>This alerts the coordinator and keeps your slot visible until they handle the change.</p>
          <label>
            Reason <input maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <button
            className="outlineButton"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api(battle.id + "/withdrawal", { reason });
                setError("Coordinator notified.");
              })
            }
          >
            Notify coordinator
          </button>
        </details>
      )}
      {manager && data && (
        <>
          <RosterHistory key={battle.id} battleId={battle.id} onChanged={onChanged} />
          {data.withdrawals.length > 0 && (
            <div className="withdrawalAlert" role="status">
              <h4>Players no longer able to attend</h4>
              {data.withdrawals.map((w: any) => {
                const options = data.candidates.filter((s: any) => !s.confirmed_ship),
                  candidate = options.find((s: any) => s.id === selected[w.id]);
                return (
                  <div key={w.id}>
                    <b>{w.display_name || w.user_id}</b> · {w.confirmed_ship || "Unassigned"}
                    <p>{w.reason}</p>
                    <label>
                      Suggested replacement{" "}
                      <select
                        value={selected[w.id] || ""}
                        onChange={(e) => {
                          setSelected({ ...selected, [w.id]: e.target.value });
                          setShip({ ...ship, [w.id]: "" });
                        }}
                      >
                        <option value="">Choose captain</option>
                        {options.map((c: any) => (
                          <option key={c.id} value={c.id}>
                            {c.display_name} · {c.appearances} appearances · {c.previous_signups} past signups
                          </option>
                        ))}
                      </select>
                    </label>
                    {candidate && (
                      <label>
                        Playable ship{" "}
                        <select
                          value={ship[w.id] || ""}
                          onChange={(e) => setShip({ ...ship, [w.id]: e.target.value })}
                        >
                          <option value="">Choose ship</option>
                          {candidate.ships.map((s: string) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    <p>
                      Suggestions favor recorded attendance, then past signups. Check availability before
                      assigning.
                    </p>
                    <button
                      className="goldButton"
                      disabled={busy || !candidate || !ship[w.id] || !active}
                      onClick={() =>
                        run(async () => {
                          await api(battle.id + "/withdrawals/" + w.id + "/replace", {
                            signupId: candidate.id,
                            assignmentVersion: candidate.assignment_version,
                            confirmedShip: ship[w.id],
                          });
                        })
                      }
                    >
                      Assign replacement
                    </button>
                    <button
                      className="outlineButton"
                      disabled={busy}
                      onClick={() => run(() => api(battle.id + "/withdrawals/" + w.id + "/resolve", {}))}
                    >
                      Dismiss notice
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <details>
            <summary>Multi-battle handoffs</summary>
            <p>
              Plan each captain’s participation inside the one-hour battle window. Times use your local
              timezone. A plan does not guarantee that leaving and joining another battle is possible in game.
            </p>
            <div className="coordinationFields">
              <label>
                Captain
                <select value={phase.userId} onChange={(e) => setPhase({ ...phase, userId: e.target.value })}>
                  <option value="">Choose captain</option>
                  {data.candidates
                    .filter((s: any) => s.user_id)
                    .map((s: any) => (
                      <option key={s.id} value={s.user_id}>
                        {s.display_name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Start
                <input
                  type="datetime-local"
                  value={phase.startsAt}
                  onChange={(e) => setPhase({ ...phase, startsAt: e.target.value })}
                />
              </label>
              <label>
                Finish
                <input
                  type="datetime-local"
                  value={phase.endsAt}
                  onChange={(e) => setPhase({ ...phase, endsAt: e.target.value })}
                />
              </label>
              <label>
                Transfer minutes
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={phase.transferMinutes}
                  onChange={(e) => setPhase({ ...phase, transferMinutes: Number(e.target.value) })}
                />
              </label>
              <button
                className="goldButton"
                disabled={busy || !active || !phase.userId || !phase.startsAt || !phase.endsAt}
                onClick={() =>
                  run(() =>
                    api(
                      battle.id + "/phases/" + phase.userId,
                      {
                        ...phase,
                        startsAt: new Date(phase.startsAt).toISOString(),
                        endsAt: new Date(phase.endsAt).toISOString(),
                      },
                      "PUT",
                    ),
                  )
                }
              >
                Save phase
              </button>
            </div>
            <ul>
              {data.phases.map((p: any) => (
                <li key={p.battle_id + p.user_id}>
                  {data.candidates.find((s: any) => s.user_id === p.user_id)?.display_name || p.user_id} ·{" "}
                  {p.port_name} · {new Date(p.starts_at).toLocaleTimeString()}–
                  {new Date(p.ends_at).toLocaleTimeString()} · {p.transfer_minutes}m transfer
                </li>
              ))}
            </ul>
          </details>
          <details>
            <summary>Role suggestions from previous battles</summary>
            <p>
              Previous duties at this port are advisory. Assignments still require officer review and current
              capabilities.
            </p>
            {data.candidates
              .filter((s: any) => s.suggested_role)
              .map((s: any) => (
                <p key={s.id}>
                  <b>{s.display_name}</b> ·{" "}
                  {[
                    s.suggested_role.formation,
                    s.suggested_role.commanderDuty,
                    s.suggested_role.hornDuty,
                    s.suggested_role.flareDuty,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "No special duty"}{" "}
                  · {s.suggested_role.count} matching past assignments
                  {s.confirmed_ship && active && (
                    <button
                      className="outlineButton"
                      disabled={busy}
                      onClick={() =>
                        run(() =>
                          api(
                            battle.id + "/assignments/" + s.id,
                            {
                              assignmentVersion: s.assignment_version,
                              formation: s.suggested_role.formation || null,
                              commanderDuty: s.suggested_role.commanderDuty || null,
                              ...(s.horn_capable ? { hornDuty: s.suggested_role.hornDuty || null } : {}),
                              ...(s.flare_capabilities?.includes(s.suggested_role.flareDuty)
                                ? { flareDuty: s.suggested_role.flareDuty }
                                : {}),
                            },
                            "PUT",
                          ),
                        )
                      }
                    >
                      Use previous duties
                    </button>
                  )}
                </p>
              ))}
          </details>
          <details>
            <summary>Attendance records & corrections</summary>
            <p>
              Record actual participation, including captains who never signed up. Changes are retained in the
              correction history.
            </p>
            <label>
              Discord user ID
              <input
                inputMode="numeric"
                value={attendance.userId}
                onChange={(e) => setAttendance({ ...attendance, userId: e.target.value })}
              />
            </label>
            <label>
              Outcome
              <select
                value={attendance.outcome}
                onChange={(e) => setAttendance({ ...attendance, outcome: e.target.value })}
              >
                {["ATTENDED", "LATE", "CANCELLED", "NO_SHOW", "WAITLIST", "UNKNOWN"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Correction reason
              <input
                maxLength={1000}
                value={attendance.note}
                onChange={(e) => setAttendance({ ...attendance, note: e.target.value })}
              />
            </label>
            <button
              className="goldButton"
              disabled={busy || !attendance.userId || !attendance.note.trim()}
              onClick={() =>
                run(() =>
                  api(
                    battle.id + "/attendance/" + attendance.userId,
                    { outcome: attendance.outcome, note: attendance.note },
                    "PUT",
                  ),
                )
              }
            >
              Save attendance
            </button>
            {data.attendance.map((a: any) => (
              <p key={a.user_id}>
                <button
                  className="outlineButton"
                  onClick={() => setAttendance({ userId: a.user_id, outcome: a.outcome, note: "" })}
                >
                  {a.display_name || a.user_id}
                </button>{" "}
                · {a.outcome} · {a.signed_up ? "Signed up" : "No signup record"} · {a.note}
              </p>
            ))}
            <details>
              <summary>Correction history</summary>
              {data.audit.map((a: any) => (
                <p key={a.id}>
                  {new Date(a.created_at).toLocaleString()} · {a.user_id}:{" "}
                  {a.before_state?.outcome || "Unrecorded"} → {a.after_state?.outcome} · {a.after_state?.note}{" "}
                  · by {a.actor_id}
                </p>
              ))}
            </details>
          </details>
        </>
      )}
    </section>
  );
}
