"use client";
// Home page "needs you now": only things the viewer can act on, most urgent first.
import Link from "next/link";
import {useEffect, useState} from "react";
import {EmptyState, ErrorState, LoadingState} from "./ui/State";

const when = (v?: string | null) =>
  v ? new Date(v).toLocaleString([], {weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"}) : "Time to be set";

export default function CommandHome() {
  const [data, setData] = useState<any>(null), [error, setError] = useState("");
  const load = () => {
    setError("");
    fetch("/api/internal/command-home", {cache: "no-store"})
      .then(async (r) => { if (!r.ok) throw Error("Your workspace could not be loaded."); return r.json(); })
      .then(setData)
      .catch((e) => setError(e.message));
  };
  useEffect(() => { load(); }, []);

  if (error) return <ErrorState title="Couldn't load what needs you" onRetry={load}>{error}</ErrorState>;
  if (!data) return <LoadingState label="Checking what needs you…" />;

  const battles: any[] = data.battles ?? [], open: any[] = data.openBattles ?? [], leave = data.leave?.[0];
  const applications: any[] = data.applications ?? [];
  const attention: any[] = (data.attention ?? []).filter((a: any) => a.count > 0);
  const withdrawals: any[] = data.manager ? data.withdrawals ?? [] : [];
  const officerItems = applications.length + attention.length + withdrawals.length;
  const nothing = !battles.length && !open.length && !leave && !officerItems;

  return (
    <div className="homeNowGrid">
      {leave && (
        <article className="homeCard urgent">
          <header><h2>You're on leave</h2><Link href="/dashboard/members/leave">Manage</Link></header>
          <p className="homeQuiet">Back {new Date(leave.return_at).toLocaleDateString([], {month: "short", day: "numeric"})}{leave.reason ? ` · ${leave.reason}` : ""}. Welcome back early any time from the Leave page.</p>
        </article>
      )}

      {open.length > 0 && (
        <article className="homeCard urgent">
          <header><h2>Battles you haven't joined</h2><Link href="/dashboard/port-battles">All battles</Link></header>
          <ul className="homeList">
            {open.map((b) => (
              <li key={b.id}><Link href={`/dashboard/port-battles?battle=${b.id}`}><b>{b.port_name}</b><small>{when(b.starts_at)} · {b.signed}/{b.team_size} signed up</small><em>Sign up →</em></Link></li>
            ))}
          </ul>
        </article>
      )}

      <article className="homeCard">
        <header><h2>Your port battles</h2><Link href="/dashboard/port-battles">Open</Link></header>
        {battles.length ? (
          <ul className="homeList">
            {battles.map((b) => (
              <li key={b.id}><Link href={`/dashboard/port-battles?battle=${b.id}`}><b>{b.port_name}</b><small>{when(b.starts_at)} · {[b.confirmed_ship, b.commander_duty, b.horn_duty, b.flare_duty].filter(Boolean).join(" · ") || "Awaiting assignment"}</small></Link></li>
            ))}
          </ul>
        ) : (
          <p className="homeQuiet">{data.unavailable?.includes("battles") ? "Battle signups are temporarily unavailable." : "You're not signed up for any upcoming battles."}</p>
        )}
      </article>

      {(data.admin || data.manager || applications.length > 0) && (
        <article className="homeCard">
          <header><h2>{data.admin ? "Officer queue" : "Your application"}</h2>{data.admin && <Link href="/dashboard/admin">Admin</Link>}</header>
          {officerItems ? (
            <ul className="homeList">
              {applications.map((a) => (
                <li key={a.id}><Link href={`/dashboard/recruitment?application=${a.id}`}><b>{a.captain_name || "Application"}</b><small>{String(a.status).replaceAll("_", " ").toLowerCase()} · waiting on {String(a.waiting_on).toLowerCase()}</small></Link></li>
              ))}
              {attention.map((a) => (
                <li key={a.href + a.label}><Link href={a.href}><b>{a.count} {String(a.label).toLowerCase()}</b><small>Review pending items</small><em>Review →</em></Link></li>
              ))}
              {withdrawals.map((w) => (
                <li key={w.id}><Link href={`/dashboard/port-battles?battle=${w.battle_id}`}><b>{w.display_name || w.user_id} can't make {w.port_name}</b><small>Find a replacement · {w.reason}</small></Link></li>
              ))}
            </ul>
          ) : (
            <p className="homeQuiet">Nothing is waiting on you.</p>
          )}
        </article>
      )}

      {nothing && (
        <div className="homeCard">
          <EmptyState title="You're all caught up" icon="activity" actions={[{label: "Browse port battles", href: "/dashboard/port-battles", primary: true}]}>
            No battles, leave or reviews need you right now.
          </EmptyState>
        </div>
      )}

      {data.contributions?.[0] && (data.contributions[0].attended > 0 || data.contributions[0].no_show > 0) && (
        <p className="homeQuiet">Your record: {data.contributions[0].attended} battles attended · {data.contributions[0].no_show} no-shows. Ask an officer if something looks wrong.</p>
      )}
    </div>
  );
}
