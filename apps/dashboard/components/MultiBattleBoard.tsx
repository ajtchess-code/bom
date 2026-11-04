"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
export default function MultiBattleBoard() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [date, setDate] = useState(""),
    [query, setQuery] = useState("");
  const load = async () => {
    try {
      const r = await fetch("/api/internal/wosb/coordination", { cache: "no-store" });
      const x = await r.json();
      if (!r.ok) throw Error(x.message || x.error);
      setData(x);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const localDate = (v: string) => {
    const d = new Date(v);
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  };
  const battles = (data?.battles ?? []).filter(
      (b: any) => !date || (b.starts_at && localDate(b.starts_at) === date),
    ),
    ids = new Set(battles.map((b: any) => b.id)),
    players = [
      ...new Map<string, any>(
        (data?.signups ?? [])
          .filter(
            (s: any) => ids.has(s.battle_id) && s.display_name.toLowerCase().includes(query.toLowerCase()),
          )
          .map((s: any) => [s.user_id, s]),
      ).values(),
    ];
  const interval = (s: any) => {
    const phase = data.phases.find((p: any) => p.battle_id === s.battle_id && p.user_id === s.user_id),
      b = battles.find((b: any) => b.id === s.battle_id);
    return phase
      ? {
          start: +new Date(phase.starts_at),
          end: +new Date(phase.ends_at) + phase.transfer_minutes * 60000,
          planned: true,
        }
      : b?.starts_at
        ? { start: +new Date(b.starts_at), end: +new Date(b.starts_at) + 3600000, planned: false }
        : null;
  };
  return (
    <section className="panel">
      <header>
        <h1>Multi-battle coordination</h1>
        <p>
          Plan starting fleets and captain handoffs across simultaneous battles. Unplanned assignments reserve
          the full battle hour.
        </p>
      </header>
      <label>
        Date in your timezone
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label>
        Find captain
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <button className="outlineButton" onClick={load}>
        Refresh
      </button>
      {error && <p role="alert">{error}</p>}
      {data && (
        <div className="uiScrollX">
          <table>
            <thead>
              <tr>
                <th>Captain</th>
                {battles.map((b: any) => (
                  <th key={b.id}>
                    <Link href={"/dashboard/port-battles?battle=" + b.id}>{b.port_name}</Link>
                    <br />
                    {b.starts_at ? new Date(b.starts_at).toLocaleString() : "Unscheduled"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {players.map((p: any) => {
                const assignments = data.signups.filter(
                  (s: any) =>
                    s.user_id === p.user_id && ids.has(s.battle_id) && s.confirmed_ship && !s.withdrawing,
                );
                const conflicts = assignments.some((s: any, i: number) =>
                  assignments.slice(i + 1).some((t: any) => {
                    const a = interval(s),
                      b = interval(t);
                    return a && b && a.start < b.end && b.start < a.end;
                  }),
                );
                return (
                  <tr key={p.user_id}>
                    <th>
                      {p.display_name}
                      {conflicts && <small className="uiBlock uiWarnText">Overlapping assignments</small>}
                    </th>
                    {battles.map((b: any) => {
                      const s = data.signups.find(
                          (s: any) => s.user_id === p.user_id && s.battle_id === b.id,
                        ),
                        phase = data.phases.find((v: any) => v.user_id === p.user_id && v.battle_id === b.id);
                      return (
                        <td key={b.id}>
                          {s ? (
                            <Link href={"/dashboard/port-battles?battle=" + b.id}>
                              {s.withdrawing ? "Cannot attend" : s.confirmed_ship || "Signed up · unassigned"}
                              {phase && (
                                <small className="uiBlock">
                                  {new Date(phase.starts_at).toLocaleTimeString()}–
                                  {new Date(phase.ends_at).toLocaleTimeString()} + {phase.transfer_minutes}m
                                  transfer
                                </small>
                              )}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!players.length && <p className="uiEmpty">No captains match this view.</p>}
        </div>
      )}
      <p>
        Open a battle to edit a captain’s phase. Check game eligibility and realistic travel or loading time
        before relying on a handoff.
      </p>
    </section>
  );
}
