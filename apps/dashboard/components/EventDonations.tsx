"use client";
import { useEffect, useState } from "react";
import { operationsApi } from "./operationsApi";
export default function EventDonations({
  campaignId,
  canManage,
}: {
  campaignId: string;
  canManage: boolean;
}) {
  const [data, setData] = useState<any>(null),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("missing"),
    [selected, setSelected] = useState<string[]>([]),
    [amount, setAmount] = useState("5000"),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [balanceUser, setBalanceUser] = useState(""),
    [balance, setBalance] = useState(""),
    [reason, setReason] = useState("");
  const [pending, setPending] = useState<{ key: string; id: string } | null>(null);
  async function load() {
    setData(await operationsApi("event-tool/donations"));
  }
  useEffect(() => {
    setData(null);
    setSelected([]);
    setPending(null);
    void load().catch((e) => setNotice(e.message));
    const t = setInterval(() => void load().catch(() => {}), 30000);
    return () => clearInterval(t);
  }, [campaignId]);
  async function action(fn: () => Promise<void>) {
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
  const members = data?.members ?? [],
    shown = members.filter(
      (m: any) =>
        (!search || `${m.name} ${m.userId}`.toLowerCase().includes(search.toLowerCase())) &&
        (status === "all" ||
          (status === "missing" && m.total === 0) ||
          (status === "partial" && m.total > 0 && m.total < 5000) ||
          (status === "complete" && m.total >= 5000)),
    );
  return (
    <section id="halloween-donations" className="opsCard eventAnchor eventDonations">
      <div className="eventSectionHeading">
        <div>
          <h2>
            <img src="/event-guide/icons/heavy-shot.png" width="48" height="48" alt="" /> Heavy Shot Donation
            Drive
          </h2>
          <p>100 captains × 5,000 Heavy Shot = 500,000. Donations are recorded by Admiralty after receipt.</p>
        </div>
        <img
          src="/event-guide/donation-trophy.png"
          width="88"
          height="88"
          alt="BOM Halloween donation trophy"
        />
      </div>
      {notice && <p role="status">{notice}</p>}
      {!data ? (
        <p className="uiLoading" role="status">
          Loading donation ledger…
        </p>
      ) : (
        <>
          <h3>
            {data.total.toLocaleString()} / 500,000 Heavy Shot · {data.percent.toFixed(1)}%
          </h3>
          <progress
            aria-label="Guild Heavy Shot donation goal"
            max={500000}
            value={Math.min(500000, data.total)}
            className="uiProgress"
          />
          <p>
            {data.remaining.toLocaleString()} remaining · {data.donors.length} donors · {data.complete}{" "}
            members at 5,000+
            {data.total > 500000 ? ` · ${(data.total - 500000).toLocaleString()} above goal` : ""}
          </p>
          <h3>Top 10 Donors</h3>
          <p>
            <b>1st: 1st Rate · 2nd: 2nd Rate · 3rd: 3rd Rate ship of choice.</b> No Imperial/Premium; Unique
            permitted.
          </p>
          <ol>
            {data.donors.slice(0, 10).map((d: any) => (
              <li key={d.user_id} className="uiPadY">
                {d.rank <= 3 && (
                  <img
                    src={`/event-guide/donation-trophy-${d.rank}.png`}
                    width="36"
                    height="36"
                    alt={["Gold", "Silver", "Bronze"][d.rank - 1] + " trophy"}
                  />
                )}{" "}
                {d.rank > 3 && d.rank <= 9 && (
                  <img
                    src={`/event-guide/ranks/rank-${d.rank}.png`}
                    width="36"
                    height="36"
                    alt={`Rank ${d.rank} medal`}
                  />
                )}
                <b>{d.display_name}</b> — {d.total.toLocaleString()} Heavy Shot
              </li>
            ))}
          </ol>
          {!data.donors.length && <p className="uiEmpty">No donations recorded yet.</p>}
          <small>
            Ties use the earliest last donation, then Discord ID. Extra donations count toward the guild
            total.
          </small>
          {canManage && (
            <details>
              <summary>Admiralty · Record Donations & Check Missing Members</summary>
              <p>
                {members.filter((m: any) => !m.total).length} not donated ·{" "}
                {members.filter((m: any) => m.total > 0 && m.total < 5000).length} partial ·{" "}
                {members.filter((m: any) => m.total >= 5000).length} complete. Full current Member/AFK roster,
                including captains who have never opened the event page.
              </p>
              <label>
                Roster status
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="missing">Not donated</option>
                  <option value="partial">Partial</option>
                  <option value="complete">5,000+ complete</option>
                  <option value="all">All members</option>
                </select>
              </label>
              <details open>
                <summary>Search and select members ({selected.length} selected)</summary>
                <label>
                  Find member
                  <input
                    type="search"
                    placeholder="Name or Discord ID"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <div className="uiScrollBox">
                  {shown.map((m: any) => (
                    <label key={m.userId} className="uiRow uiPadSm">
                      <input
                        type="checkbox"
                        checked={selected.includes(m.userId)}
                        disabled={busy || (!selected.includes(m.userId) && selected.length >= 100)}
                        onChange={(e) =>
                          setSelected((v) =>
                            e.target.checked ? [...v, m.userId] : v.filter((id) => id !== m.userId),
                          )
                        }
                      />
                      <span>
                        {m.name} · {m.total.toLocaleString()} / 5,000 · {m.remaining.toLocaleString()}{" "}
                        remaining
                      </span>
                    </label>
                  ))}
                  {!shown.length && <p className="uiEmpty">No matching members.</p>}
                </div>
              </details>
              <div className="uiRow">
                {selected.map((id) => (
                  <button
                    key={id}
                    disabled={busy}
                    onClick={() => setSelected((v) => v.filter((x) => x !== id))}
                  >
                    {members.find((m: any) => m.userId === id)?.name ?? id} ×
                  </button>
                ))}
              </div>
              <label>
                Additional Heavy Shot per selected member
                <input
                  type="number"
                  min="1"
                  max="1000000000"
                  step="1"
                  value={amount}
                  disabled={busy}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <p>
                This adds {Number(amount || 0).toLocaleString()} to each of {selected.length} members (
                {(Number(amount || 0) * selected.length).toLocaleString()} total). Use separate entries for
                different amounts.
              </p>
              <button
                className="primary"
                disabled={
                  busy ||
                  !selected.length ||
                  !Number.isSafeInteger(Number(amount)) ||
                  Number(amount) <= 0 ||
                  Number(amount) > 1000000000
                }
                onClick={() =>
                  void action(async () => {
                    const key = JSON.stringify([campaignId, [...selected].sort(), Number(amount)]),
                      batchId = pending?.key === key ? pending.id : crypto.randomUUID();
                    setPending({ key, id: batchId });
                    await operationsApi("event-tool/donations", {
                      method: "POST",
                      body: JSON.stringify({
                        campaignId,
                        userIds: selected,
                        amount: Number(amount),
                        batchId,
                      }),
                    });
                    setSelected([]);
                    setPending(null);
                    setNotice("Donations recorded. Discord updates automatically.");
                  })
                }
              >
                Record {selected.length} Donation{selected.length === 1 ? "" : "s"}
              </button>
              <h3>Set Heavy Shot Balance</h3>
              <p>
                Set the member’s total donation balance. Original receipts remain in the audit trail. Lottery
                tickets are unchanged.
              </p>
              <label>
                Member
                <select
                  value={balanceUser}
                  onChange={(e) => {
                    setBalanceUser(e.target.value);
                    setBalance(String(members.find((m: any) => m.userId === e.target.value)?.total ?? 0));
                  }}
                >
                  <option value="">Choose a member</option>
                  {members
                    .filter(
                      (m: any) =>
                        !search || `${m.name} ${m.userId}`.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((m: any) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name} · {m.total.toLocaleString()}
                      </option>
                    ))}
                </select>
              </label>
              <small>Use Find member above to filter this list.</small>
              <label>
                New total Heavy Shot
                <input
                  type="number"
                  min="0"
                  max="1000000000"
                  step="1"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                />
              </label>
              <label>
                Correction reason
                <input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
              </label>
              <button
                disabled={
                  busy ||
                  !balanceUser ||
                  balance === "" ||
                  !Number.isSafeInteger(Number(balance)) ||
                  Number(balance) < 0 ||
                  Number(balance) > 1000000000 ||
                  !reason.trim()
                }
                onClick={() => {
                  const m = members.find((m: any) => m.userId === balanceUser);
                  if (!m) return;
                  if (
                    confirm(
                      `Set ${m.name} from ${m.total.toLocaleString()} to ${Number(balance).toLocaleString()} Heavy Shot?`,
                    )
                  )
                    void action(async () => {
                      await operationsApi("event-tool/donations/balance", {
                        method: "PUT",
                        body: JSON.stringify({
                          campaignId,
                          userId: balanceUser,
                          balance: Number(balance),
                          expectedBalance: m.total,
                          reason,
                        }),
                      });
                      setReason("");
                      setNotice("Balance corrected. Discord rankings update automatically.");
                    });
                }}
              >
                Set balance
              </button>
              <h3>Recent Entries</h3>
              <p>
                Corrections void an entry and retain its audit trail. Record the correct amount afterward.
              </p>
              <div className="opsTableScroll">
                <table>
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Amount</th>
                      <th>Recorded</th>
                      <th>Officer</th>
                      <th>Correction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.history.map((h: any) => (
                      <tr key={h.id}>
                        <td>{h.display_name}</td>
                        <td>
                          {h.amount.toLocaleString()}
                          {h.correction_reason && (
                            <small>
                              {" "}
                              · Balance {Number(h.balance_before).toLocaleString()} →{" "}
                              {Number(h.balance_after).toLocaleString()}: {h.correction_reason}
                            </small>
                          )}
                        </td>
                        <td>{new Date(h.recorded_at).toLocaleString()}</td>
                        <td>{h.recorded_by}</td>
                        <td>
                          {h.voided_at ? (
                            `Voided by ${h.voided_by}`
                          ) : h.correction_reason ? (
                            "Balance adjustment"
                          ) : h.request_id ? (
                            "Manage in Donation Requests"
                          ) : (
                            <button
                              disabled={busy}
                              onClick={() => {
                                if (
                                  confirm(
                                    `Void ${h.amount.toLocaleString()} Heavy Shot for ${h.display_name}?`,
                                  )
                                )
                                  void action(async () => {
                                    await operationsApi("event-tool/donations/" + h.id, {
                                      method: "DELETE",
                                      body: JSON.stringify({ campaignId }),
                                    });
                                    setNotice("Entry voided. Totals recalculated.");
                                  });
                              }}
                            >
                              Void entry
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
}
