"use client";
import { useState } from "react";
import { cwlScenarios } from "@bom/shared";
import { toolRequest, type ToolContext } from "../ClashTools";
import { Panel, Table, AccountSelect, DocumentCards, DocumentEditor, date, download } from "./ui";
import s from "../clash-tools.module.css";
const localInput = (value: string) => {
  if (!value) return "";
  const d = new Date(value);
  return Number.isFinite(+d) ? new Date(+d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
};
export default function OfficerTools({ tool, ctx }: { tool: string; ctx: ToolContext }) {
  const [search, setSearch] = useState(""),
    [draft, setDraft] = useState(false),
    [editing, setEditing] = useState<any>(null),
    [detail, setDetail] = useState<any>(null),
    [account, setAccount] = useState(""),
    [progress, setProgress] = useState(0),
    [note, setNote] = useState(""),
    [size, setSize] = useState(15),
    [minTH, setMinTH] = useState(1),
    [maxAccounts, setMaxAccounts] = useState(2),
    [lineup, setLineup] = useState<any>(null),
    [name, setName] = useState("Next CWL lineup"),
    [scenarioRows, setScenarioRows] = useState<any[]>([
      { name: "Your clan", stars: 0, remaining: 1, projectedStars: 0, projectedWins: 0, destruction: 0 },
    ]),
    [teamSize, setTeamSize] = useState(15),
    [bonus, setBonus] = useState(10),
    [recruit, setRecruit] = useState({ accountId: "", minTownHall: 13, minDonations: 0, minHeroAverage: 0 }),
    [recruitResult, setRecruitResult] = useState<any>(null),
    [month, setMonth] = useState(new Date().toISOString().slice(0, 7)),
    [report, setReport] = useState<any>(null);
  const kind =
      tool === "Clan transfers"
        ? "TRANSFER"
        : tool === "Clan Games"
          ? "CLAN_GAMES"
          : tool === "Capital priorities"
            ? "CAPITAL_GOAL"
            : "AWARD",
    canCreate = ctx.state.manager;
  async function open(d: any) {
    try {
      setDetail(await toolRequest("/documents/" + d.id));
      setProgress(0);
      setNote("");
    } catch (e: any) {
      ctx.message(e.message);
    }
  }
  if (tool === "War performance") {
    const players = ctx.state.analysis.players.filter((p: any) =>
      (p.name + " " + p.tag).toLowerCase().includes(search.toLowerCase()),
    );
    return (
      <>
        <Panel title="Observed war performance">
          <p>{ctx.state.analysis.observedWars} distinct observed wars with member-level detail.</p>
          <p className={s.quiet}>
            {ctx.state.analysis.dataLabel} Fresh/follow-up classification requires attack-order data. This is
            not a complete lifetime record.
          </p>
          <input
            aria-label="Search performance"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a player…"
          />
          <Table
            heads={[
              "Village",
              "TH",
              "Appearances",
              "Attacks",
              "Triples",
              "Triple %",
              "Fresh",
              "Follow-up",
              "Unclassified",
              "Destruction avg",
              "Missed",
            ]}
            rows={players.map((p: any) => [
              p.name,
              p.townHall,
              p.appearances,
              p.attacks,
              p.triples,
              p.tripleRate == null ? "Unknown" : Math.round(p.tripleRate * 100) + "%",
              p.freshHits,
              p.followUps,
              p.unclassified,
              p.averageDestruction?.toFixed(1) ?? "Unknown",
              p.missed,
            ])}
          />
        </Panel>
        <Panel title="Attack matchup context">
          <Table
            heads={["Village", "War start", "Attacker TH", "Defender TH", "Stars", "Order"]}
            rows={players.flatMap((p: any) =>
              p.hitContexts
                .slice(-20)
                .map((h: any) => [
                  p.name,
                  h.warStart,
                  h.attackerTH,
                  h.defenderTH,
                  h.stars,
                  h.order ?? "Unknown",
                ]),
            )}
          />
        </Panel>
      </>
    );
  }
  if (tool === "Clan health")
    return (
      <>
        {ctx.state.health.map((h: any) => (
          <Panel key={h.tag} title={h.clan?.name ?? h.tag}>
            <p className={s.quiet}>
              {h.windowLabel} · Updated {date(h.updatedAt)} {h.error ?? ""}
            </p>
            <Table
              heads={["Village", "TH", "Donations", "Observed change", "Evidence / flags"]}
              rows={h.members.map((m: any) => [
                m.name,
                m.townHall,
                m.donations,
                m.donationDelta ?? "Unknown",
                m.flags.join("; ") || "No flag from available evidence",
              ])}
            />
            <p>New to retained roster: {h.joined.join(", ") || "None observed"}</p>
            <p>No longer on latest roster: {h.left.join(", ") || "None observed"}</p>
            <p className={s.quiet}>No online/last-seen inference is made from donations or missing data.</p>
          </Panel>
        ))}
      </>
    );
  if (tool === "CWL lineup")
    return (
      <>
        <Panel title="Explainable lineup assistant">
          <div className={s.row}>
            <label>
              Lineup size
              <input
                type="number"
                min={1}
                max={50}
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
              />
            </label>
            <label>
              Minimum Town Hall
              <input
                type="number"
                min={1}
                max={30}
                value={minTH}
                onChange={(e) => setMinTH(Number(e.target.value))}
              />
            </label>
            <label>
              Max villages per member
              <input
                type="number"
                min={1}
                max={12}
                value={maxAccounts}
                onChange={(e) => setMaxAccounts(Number(e.target.value))}
              />
            </label>
            <button
              disabled={ctx.busy}
              onClick={async () => {
                const r = await ctx.act("/lineup", {
                  size,
                  minTownHall: minTH,
                  maxAccountsPerMember: maxAccounts,
                });
                if (r) setLineup(r);
              }}
            >
              Suggest Lineup
            </button>
          </div>
          <p className={s.quiet}>
            Uses observed attacks, attendance, declared readiness and rotation. Unknown performance gets a
            neutral weight. Declarations older than seven days or past their stated expiry are not assumed
            current.
          </p>
          {lineup && (
            <>
              <p>
                {lineup.selected.length} selected · {lineup.shortfall} slots unfilled ·{" "}
                {lineup.reserves.length} reserves
              </p>
              <Table
                heads={["Village", "TH", "Score", "Evidence", "Sample"]}
                rows={lineup.selected.map((p: any) => [
                  p.name,
                  p.townHall,
                  p.score.toFixed(1),
                  p.explanation.join("; "),
                  p.confidence,
                ])}
              />
              <label>
                Plan name
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <button
                disabled={!name.trim() || ctx.busy}
                onClick={() =>
                  void ctx.act("/documents", {
                    kind: "LINEUP",
                    title: name,
                    visibility: "OFFICERS",
                    payload: {
                      event: name,
                      size,
                      selected: lineup.selected.map((p: any) => p.tag),
                      reserves: lineup.reserves.map((p: any) => p.tag),
                      notes: "Officer-reviewed suggestion; make actual lineup changes in game.",
                    },
                  })
                }
              >
                Save Officer Plan
              </button>
              <h4>Reserves</h4>
              <Table
                heads={["Village", "Score", "Reason"]}
                rows={lineup.reserves.map((p: any) => [p.name, p.score.toFixed(1), p.explanation.join("; ")])}
              />
            </>
          )}
        </Panel>
        <Panel title="Saved lineup plans">
          <DocumentCards ctx={ctx} kind="LINEUP">
            {(d) => (
              <p>
                Selected: {d.payload.selected.join(", ")}
                <br />
                Reserves: {d.payload.reserves.join(", ")}
              </p>
            )}
          </DocumentCards>
        </Panel>
      </>
    );
  if (tool === "CWL scenarios") {
    let calculated: any[] = [],
      error = "";
    try {
      calculated = cwlScenarios(scenarioRows, { teamSize, winBonus: bonus });
    } catch (e: any) {
      error = e.message;
    }
    return (
      <Panel title="CWL what-if table">
        <p className={s.quiet}>
          Enter current points and your hypothetical remaining results. These are user assumptions, not a
          prediction or synchronized standings.
        </p>
        <div className={s.row}>
          <label>
            Team size
            <input
              type="number"
              min={5}
              max={50}
              value={teamSize}
              onChange={(e) => setTeamSize(Number(e.target.value))}
            />
          </label>
          <label>
            Win bonus assumption
            <input
              type="number"
              min={0}
              max={100}
              value={bonus}
              onChange={(e) => setBonus(Number(e.target.value))}
            />
          </label>
        </div>
        <div className={s.scroll}>
          <table>
            <thead>
              <tr>
                {[
                  "Clan",
                  "Current points",
                  "Wars left",
                  "Projected attack stars",
                  "Projected wins",
                  "Destruction tiebreak",
                  "",
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scenarioRows.map((r, i) => (
                <tr key={i}>
                  {["name", "stars", "remaining", "projectedStars", "projectedWins", "destruction"].map(
                    (k) => (
                      <td key={k}>
                        <input
                          aria-label={k + " " + (i + 1)}
                          type={k === "name" ? "text" : "number"}
                          min={0}
                          value={r[k]}
                          onChange={(e) =>
                            setScenarioRows((v) =>
                              v.map((x, n) =>
                                n === i
                                  ? { ...x, [k]: k === "name" ? e.target.value : Number(e.target.value) }
                                  : x,
                              ),
                            )
                          }
                        />
                      </td>
                    ),
                  )}
                  <td>
                    <button onClick={() => setScenarioRows((v) => v.filter((_, n) => n !== i))}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          disabled={scenarioRows.length >= 8}
          onClick={() =>
            setScenarioRows((v) => [
              ...v,
              {
                name: "Clan " + (v.length + 1),
                stars: 0,
                remaining: 1,
                projectedStars: 0,
                projectedWins: 0,
                destruction: 0,
              },
            ])
          }
        >
          Add Clan
        </button>
        {error && <p role="alert">{error}</p>}
        <Table
          heads={["Projected order", "Clan", "Projected points", "Maximum possible"]}
          rows={calculated.map((r, i) => [i + 1, r.name, r.projectedTotal, r.maximum])}
        />
      </Panel>
    );
  }
  if (tool === "Recruit comparison")
    return (
      <>
        <Panel title="Recruit comparison">
          <div className={s.form}>
            <label>
              Prospect player tag
              <input
                value={recruit.accountId}
                onChange={(e) => setRecruit({ ...recruit, accountId: e.target.value.toUpperCase() })}
              />
            </label>
            <div className={s.row}>
              {[
                ["minTownHall", "Minimum Town Hall"],
                ["minDonations", "Minimum current donations"],
                ["minHeroAverage", "Minimum mean hero level"],
              ].map(([k, label]) => (
                <label key={k}>
                  {label}
                  <input
                    type="number"
                    min={0}
                    value={(recruit as any)[k]}
                    onChange={(e) => setRecruit({ ...recruit, [k]: Number(e.target.value) })}
                  />
                </label>
              ))}
            </div>
            <button
              disabled={ctx.busy}
              onClick={async () => {
                const r = await ctx.act("/recruit", recruit);
                if (r) setRecruitResult(r);
              }}
            >
              Compare Prospect
            </button>
          </div>
          {recruitResult && (
            <>
              <h4>{recruitResult.profile.name}</h4>
              <Table
                heads={["Requirement", "Observed", "Required", "Result"]}
                rows={recruitResult.checks.map((r: any) => [
                  r.label,
                  typeof r.value === "number" ? r.value.toFixed(1) : "Unknown",
                  r.required,
                  r.result,
                ])}
              />
              <p className={s.quiet}>
                {recruitResult.source} · {date(recruitResult.observedAt)}. Donation counters are
                season-sensitive; this is not a background check.
              </p>
              <button
                disabled={ctx.busy}
                onClick={() =>
                  void ctx.act("/documents", {
                    kind: "RECRUIT",
                    title: "Prospect: " + recruitResult.profile.name,
                    visibility: "OFFICERS",
                    payload: { ...recruit, status: "PROSPECT" },
                  })
                }
              >
                Save Prospect
              </button>
            </>
          )}
        </Panel>
        <Panel title="Recruit pipeline">
          <DocumentCards
            ctx={ctx}
            kind="RECRUIT"
            open={(d) => {
              setRecruit({
                accountId: d.payload.accountId,
                minTownHall: d.payload.minTownHall,
                minDonations: d.payload.minDonations,
                minHeroAverage: d.payload.minHeroAverage,
              });
              setEditing(d);
              setDraft(true);
            }}
          >
            {(d) => (
              <p>
                {d.payload.accountId} · {d.payload.status}
              </p>
            )}
          </DocumentCards>
        </Panel>
        {draft && (
          <DocumentEditor
            ctx={ctx}
            kind="RECRUIT"
            initial={editing}
            fields={fields}
            close={() => setDraft(false)}
          />
        )}
      </>
    );
  if (tool === "Season reports")
    return (
      <>
        <Panel title="Season report generator">
          <label>
            Observation month (UTC)
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
          <button
            disabled={ctx.busy}
            onClick={async () => {
              const r = await ctx.act("/report", { month });
              if (r) setReport(r);
            }}
          >
            Generate Report
          </button>
          {report && (
            <>
              <pre className={s.body}>{report.markdown}</pre>
              <div className={s.buttons}>
                <button
                  onClick={() => download("BOM-Clash-" + month + ".md", report.markdown, "text/markdown")}
                >
                  Download Markdown
                </button>
                <button onClick={() => download("BOM-Clash-" + month + ".csv", report.csv, "text/csv")}>
                  Download CSV
                </button>
                <button
                  disabled={ctx.busy}
                  onClick={() =>
                    void ctx.act("/documents", {
                      kind: "REPORT",
                      title: "Season report " + month,
                      visibility: "CLAN",
                      payload: { month, markdown: report.markdown },
                    })
                  }
                >
                  Publish in Clash Section
                </button>
              </div>
            </>
          )}
        </Panel>
        <Panel title="Published season reports">
          <DocumentCards ctx={ctx} kind="REPORT">
            {(d) => (
              <button
                onClick={() =>
                  download("BOM-Clash-" + d.payload.month + ".md", d.payload.markdown, "text/markdown")
                }
              >
                Download report
              </button>
            )}
          </DocumentCards>
        </Panel>
      </>
    );
  function fields(v: any, set: any): React.ReactNode {
    if (kind === "TRANSFER")
      return (
        <>
          <label>
            Village tag
            <input
              required
              value={v.accountId ?? ""}
              onChange={(e) => set("accountId", e.target.value.toUpperCase())}
            />
          </label>
          <label>
            From clan
            <input value={v.fromClan ?? ""} onChange={(e) => set("fromClan", e.target.value)} />
          </label>
          <label>
            To clan tag
            <input
              required
              value={v.toClan ?? ""}
              onChange={(e) => set("toClan", e.target.value.toUpperCase())}
            />
          </label>
          <label>
            Planned time
            <input
              required
              type="datetime-local"
              value={localInput(v.when ?? "")}
              onChange={(e) => set("when", e.target.value ? new Date(e.target.value).toISOString() : "")}
            />
          </label>
          <label>
            Status
            <select value={v.status ?? "PROPOSED"} onChange={(e) => set("status", e.target.value)}>
              {["PROPOSED", "APPROVED", "IN_GAME_COMPLETE", "CANCELLED"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        </>
      );
    if (kind === "CLAN_GAMES")
      return (
        <>
          {[
            ["startsAt", "Starts"],
            ["endsAt", "Ends"],
          ].map(([k, label]) => (
            <label key={k}>
              {label}
              <input
                type="datetime-local"
                value={localInput(v[k] ?? "")}
                onChange={(e) => set(k, e.target.value ? new Date(e.target.value).toISOString() : "")}
              />
            </label>
          ))}
          <label>
            Clan contribution target
            <input
              type="number"
              min={1}
              value={v.target ?? 50000}
              onChange={(e) => set("target", Number(e.target.value))}
            />
          </label>
          <label>
            Member goal
            <input
              type="number"
              min={1}
              value={v.memberTarget ?? 4000}
              onChange={(e) => set("memberTarget", Number(e.target.value))}
            />
          </label>
          <label>
            Status
            <select value={v.status ?? "OPEN"} onChange={(e) => set("status", e.target.value)}>
              <option>OPEN</option>
              <option>COMPLETE</option>
            </select>
          </label>
        </>
      );
    if (kind === "CAPITAL_GOAL")
      return (
        <>
          <label>
            District
            <input required value={v.district ?? ""} onChange={(e) => set("district", e.target.value)} />
          </label>
          <label>
            Upgrade priority
            <input required value={v.upgrade ?? ""} onChange={(e) => set("upgrade", e.target.value)} />
          </label>
          <label>
            Contribution target
            <input
              type="number"
              min={1}
              value={v.target ?? 10000}
              onChange={(e) => set("target", Number(e.target.value))}
            />
          </label>
          <label>
            Priority 1–10
            <input
              type="number"
              min={1}
              max={10}
              value={v.priority ?? 1}
              onChange={(e) => set("priority", Number(e.target.value))}
            />
          </label>
          <label>
            Status
            <select value={v.status ?? "OPEN"} onChange={(e) => set("status", e.target.value)}>
              <option>OPEN</option>
              <option>COMPLETE</option>
            </select>
          </label>
        </>
      );
    if (tool === "Recruit comparison")
      return (
        <>
          <label>
            Player tag
            <input value={v.accountId ?? ""} onChange={(e) => set("accountId", e.target.value)} />
          </label>
          <label>
            Recruit status
            <select value={v.status ?? "PROSPECT"} onChange={(e) => set("status", e.target.value)}>
              {["PROSPECT", "CONTACTED", "INVITED", "JOINED", "DECLINED"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        </>
      );
    return (
      <>
        <label>
          Recipient village tag
          <input
            required
            value={v.accountId ?? ""}
            onChange={(e) => set("accountId", e.target.value.toUpperCase())}
          />
        </label>
        <label>
          Recognition category
          <select value={v.category ?? "COMMUNITY"} onChange={(e) => set("category", e.target.value)}>
            {["IMPROVEMENT", "RELIABILITY", "DONATIONS", "COACHING", "ATTACK", "COMMUNITY"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Month
          <input type="month" value={v.month ?? month} onChange={(e) => set("month", e.target.value)} />
        </label>
      </>
    );
  }
  const leaders = [...ctx.state.analysis.players]
    .filter((p: any) => p.attacks >= 3)
    .sort((a: any, b: any) => b.tripleRate - a.tripleRate)
    .slice(0, 5);
  return (
    <>
      <Panel title={tool}>
        {kind === "AWARD" && (
          <>
            <h4>Observed attack highlights</h4>
            <Table
              heads={["Village", "Triples", "Attacks", "Triple rate"]}
              rows={leaders.map((p: any) => [
                p.name,
                p.triples,
                p.attacks,
                Math.round(p.tripleRate * 100) + "%",
              ])}
            />
            <p className={s.quiet}>
              Highlights require at least three observed attacks. Improvement/coaching awards are
              officer-reviewed recognitions, not inferred rankings.
            </p>
          </>
        )}
        {kind === "TRANSFER" && (
          <p className={s.quiet}>
            Coordinate moves across your clan family. Officers and players perform the actual transfer in
            game; completion status is a manual confirmation.
          </p>
        )}
        {["CLAN_GAMES", "CAPITAL_GOAL"].includes(kind) && (
          <p className={s.quiet}>
            Targets and submitted contributions are manual declarations. These are not automatically verified
            game totals.
          </p>
        )}
        <DocumentCards
          ctx={ctx}
          kind={kind}
          create={
            canCreate
              ? () => {
                  setEditing(null);
                  setDraft(true);
                }
              : undefined
          }
          open={(d) => void open(d)}
        >
          {(d) => (
            <p>
              {d.payload.accountId ?? d.payload.district ?? ""} · {d.payload.status ?? d.payload.category}{" "}
              {d.payload.target ? "· Target " + d.payload.target.toLocaleString() : ""}
            </p>
          )}
        </DocumentCards>
      </Panel>
      {draft && (
        <DocumentEditor
          ctx={ctx}
          kind={kind}
          initial={editing}
          fields={fields}
          close={() => setDraft(false)}
        />
      )}
      {detail && (
        <div className={s.modal}>
          <section role="dialog" aria-modal="true" aria-label="Clan coordination record">
            <header className={s.toolbar}>
              <h3>{detail.title}</h3>
              <button onClick={() => setDetail(null)}>Close</button>
            </header>
            <p className={s.body}>{detail.body}</p>
            {ctx.state.manager && (
              <button
                onClick={() => {
                  setEditing(detail);
                  setDraft(true);
                  setDetail(null);
                }}
              >
                Edit / Update Status
              </button>
            )}
            {["CLAN_GAMES", "CAPITAL_GOAL"].includes(kind) && (
              <>
                <p className={s.metric}>
                  {detail.enrollments.reduce((n: number, e: any) => n + e.progress, 0).toLocaleString()} /{" "}
                  {detail.payload.target.toLocaleString()} submitted
                </p>
                <Table
                  heads={["Village", "Submitted contribution", "Notes", "Updated"]}
                  rows={detail.enrollments.map((e: any) => [
                    e.account_id,
                    e.progress,
                    e.note,
                    date(e.updated_at),
                  ])}
                />
                <div className={s.form}>
                  <AccountSelect ctx={ctx} value={account} onChange={setAccount} />
                  <label>
                    Your total contribution to this goal
                    <input
                      type="number"
                      min={0}
                      value={progress}
                      onChange={(e) => setProgress(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Evidence / explanation
                    <textarea value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
                  </label>
                  <button
                    disabled={!account || ctx.busy || detail.payload.status === "COMPLETE"}
                    onClick={async () => {
                      if (
                        await ctx.act("/documents/" + detail.id + "/enroll", {
                          accountId: account,
                          progress,
                          note,
                        })
                      )
                        await open(detail);
                    }}
                  >
                    Save My Total
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
