"use client";
import { useEffect, useState, type ReactNode } from "react";
export function EventSectionNav() {
  return (
    <nav className="eventHubNav" aria-label="Halloween event sections">
      {[
        ["halloween-rules", "Event Rules"],
        ["halloween-rewards", "Rewards & Lottery"],
        ["halloween-donations", "Heavy Shot Drive"],
        ["halloween-hourly", "Lollipops / Hour"],
        ["halloween-daily", "Daily Quests"],
        ["halloween-checklist", "Checklist"],
        ["halloween-calculator", "Calculator"],
        ["halloween-ship-guide", "Ship Guide"],
        ["halloween-leaderboard", "Leaderboard"],
      ].map(([id, label]) => (
        <a href={"#" + id} key={id}>
          {label}
        </a>
      ))}
    </nav>
  );
}
export function EventPersonalSummary({
  done,
  total,
  quests,
  rank,
  remaining,
  questTickets,
}: {
  done: number;
  total: number;
  quests: number;
  rank: number | null;
  remaining: number | null;
  questTickets?: number;
}) {
  return (
    <section className="eventPersonalSummary" aria-label="Your event progress">
      <article>
        <small>GOALS SECURED</small>
        <b>
          {done}
          <span> / {total}</span>
        </b>
      </article>
      <article>
        <small>DAILY QUESTS</small>
        <b>
          {quests}
          <span> / 14</span>
        </b>
      </article>
      <article>
        <small>YOUR RANK</small>
        <b>{rank ? "#" + rank : "Unranked"}</b>
      </article>
      <article>
        <small>{questTickets !== undefined ? "QUEST LOTTERY TICKETS" : "LOLLIPOPS STILL NEEDED"}</small>
        <b>
          {questTickets !== undefined ? questTickets : remaining === null ? "—" : remaining.toLocaleString()}
          <svg className="eventSummaryCandy" aria-hidden="true" viewBox="0 0 26 32">
            <path d="M13 17v13" stroke="#efc989" strokeWidth="3" />
            <circle cx="13" cy="10" r="9" fill="#9e55a6" stroke="#efc989" strokeWidth="2" />
            <path d="M13 10c-2-4-6-1-3 2 4 4 9-2 5-5" fill="none" stroke="#efc989" strokeWidth="2" />
          </svg>
        </b>
        <small>
          {questTickets !== undefined
            ? "Extra tickets shown in Rewards"
            : "From your calculator shopping list"}
        </small>
      </article>
    </section>
  );
}
export function EventPersonalRank({ board, userId, total }: { board: any[]; userId: string; total: number }) {
  const positive = board.filter((p) => Number(p.completed_count) > 0),
    index = positive.findIndex((p) => String(p.user_id) === userId),
    me = positive[index],
    above = index > 0 ? positive[index - 1] : null,
    gap = above ? Math.max(0, (Number(above.score_half_points) - Number(me.score_half_points)) / 2) : 0;
  return (
    <aside className="eventYourRank" aria-label="Your leaderboard position">
      <div>
        <span className="eventBadge tagPREFERRED">YOUR POSITION</span>
        <h3>
          {me
            ? `#${me.rank} · ${Number(me.score_half_points) / 2} points · ${me.completed_count}/${total} goals`
            : "Your first bragging rights await"}
        </h3>
      </div>
      <p>
        {!me
          ? "Check off a goal or mark Already have to join the rankings."
          : !above
            ? "You’re leading the fleet. Keep the hold full."
            : gap
              ? `${gap} points behind #${above.rank}.`
              : `Level on points with #${above.rank}; one more will put you ahead on score.`}
      </p>
    </aside>
  );
}
export function EventChecklistGroup({
  name,
  done,
  total,
  autoCollapse,
  children,
}: {
  name: string;
  done: number;
  total: number;
  autoCollapse: boolean;
  children: ReactNode;
}) {
  const allDone = done === total,
    [open, setOpen] = useState(!allDone || !autoCollapse);
  useEffect(() => {
    setOpen(!allDone || !autoCollapse);
  }, [allDone, autoCollapse]);
  return (
    <details
      className="eventGroup eventChecklistGroup"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <h3>{name}</h3>
        <span>
          {done}/{total}
          {allDone ? " · All secured" : ""}
        </span>
      </summary>
      <div className="eventGoalGrid">{children}</div>
    </details>
  );
}
