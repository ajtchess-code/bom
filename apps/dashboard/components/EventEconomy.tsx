"use client";
import EventItemIcon from "./EventItemIcon";
import { useEffect, useState } from "react";
import { EVENT_DAILY_REWARDS, eventExchangeRates, EVENT_GOLD_VALUES } from "@bom/shared";
import { operationsApi, downloadCsv } from "./operationsApi";
const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
export function EventRewardTrack({ count }: { count: number }) {
  return (
    <div className="eventRewardTrack">
      <p>
        <b>40 Lollipops per completed daily quest</b> · milestones use the number of quests completed.
      </p>
      <div>
        {EVENT_DAILY_REWARDS.map((r) => (
          <article key={r.days} className={count >= r.days ? "secured" : ""}>
            <b>
              {count >= r.days ? "✓ " : ""}
              {r.days} quests
            </b>
            <span>{r.reward}</span>
          </article>
        ))}
      </div>
      <small>
        The 9-quest reward depends on active premium time: 30+ days gives 200 Coins instead of 14 Seal days.
        Exchange your Lollipops before the in-game expiry; check the current timer at the overseas merchant.
      </small>
    </div>
  );
}
export function EventExchangeChart() {
  const rows = eventExchangeRates();
  return (
    <section className="opsCard eventExchange">
      <div>
        <span className="eventBadge tagPREFERRED">GOLD PER LOLLIPOP</span>
        <h2>Exchange Value Chart</h2>
        <p>
          Highest value first, using your supplied selling prices. Compare bundles of the same item before
          spending.
        </p>
      </div>
      <div className="eventValueWinner">
        <b>Best listed value · {rows[0].name}</b>
        <span>
          {rows[0].quantity.toLocaleString()} for {rows[0].cost.toLocaleString()} Lollipops →{" "}
          {fmt(rows[0].gold)} gold · <strong>{fmt(rows[0].goldPerLollipop)} gold / Lollipop</strong>
        </span>
        <small>
          Saxon Shot at 20 gold each: 8,000 for 25 Lollipops → 160,000 gold · 6,400 gold / Lollipop.
        </small>
      </div>
      <div className="opsTableScroll">
        <table>
          <thead>
            <tr>
              <th>Exchange</th>
              <th>Lollipops</th>
              <th>Items / Lollipop</th>
              <th>Bundle gold value</th>
              <th>Gold / Lollipop</th>
              <th>Bundle comparison</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td>
                  <EventItemIcon name={r.name} />
                  <b>
                    {r.quantity.toLocaleString()} {r.name}
                  </b>
                  {i === 0 && <span className="eventBadge tagREQUIRED">BEST GOLD VALUE</span>}
                </td>
                <td>{r.cost.toLocaleString()}</td>
                <td>{fmt(r.unitsPerLollipop)}</td>
                <td>{fmt(r.gold)}</td>
                <td>
                  <strong>{fmt(r.goldPerLollipop)}</strong>
                  <div className="eventRateBar">
                    <i style={{ width: `${(r.goldPerLollipop / rows[0].goldPerLollipop) * 100}%` }} />
                  </div>
                </td>
                <td>
                  {r.bestBundle ? (
                    <span className="eventBadge tagPREFERRED">BEST {r.commodity.toUpperCase()} BUNDLE</span>
                  ) : (
                    "Lower return for this item"
                  )}
                  {r.bonusVsSmallest > 0.01 && <small>+{fmt(r.bonusVsSmallest)}% vs smallest bundle</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details>
        <summary>Gold values used</summary>
        <ul>
          {[...new Set(Object.values(EVENT_GOLD_VALUES).map((v) => v.note))].map((v) => (
            <li key={v}>{v}</li>
          ))}
        </ul>
      </details>
      <p>
        These are estimated selling values, before market fees or price changes. Premium Coins, lanterns,
        ships and other offers without supplied gold values are not ranked. Pirate Coins / Tokens are separate
        from premium Coins. Save for the best bundle of the item you want; a larger bundle is only better when
        its rate is higher.
      </p>
    </section>
  );
}
export default function EventEconomy({
  campaignId,
  eligible,
  revision,
}: {
  campaignId: string;
  eligible: boolean;
  revision: string;
}) {
  const [data, setData] = useState<any>(null),
    [selected, setSelected] = useState(campaignId),
    [extra, setExtra] = useState("0"),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function load(id: string) {
    const d = await operationsApi("event-tool/summary?campaignId=" + encodeURIComponent(id));
    setData(d);
    setExtra(String(d.earnings.additional_lollipops));
  }
  useEffect(() => {
    let active = true;
    void operationsApi("event-tool/summary?campaignId=" + encodeURIComponent(selected))
      .then((d) => {
        if (active) {
          setData(d);
          setExtra(String(d.earnings.additional_lollipops));
        }
      })
      .catch((e) => {
        if (active) setNotice(e.message);
      });
    return () => {
      active = false;
    };
  }, [selected, revision]);
  const s = data?.summary;
  return (
    <section className="opsCard eventEconomy">
      <div>
        <span className="eventBadge tagPRIORITIZE">YOUR EVENT HAUL</span>
        <h2>{data?.final ? "End-of-Event Summary" : "Lollipop Earnings & Gold Value"}</h2>
        <p>
          Daily quest earnings are calculated from your checked days. Add all other Lollipops earned,
          including any you have already spent.
        </p>
      </div>
      {notice && <p role="status">{notice}</p>}
      {data && (
        <>
          <label>
            Event summary
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              {data.campaigns.map((c: any) => (
                <option value={c.id} key={c.id}>
                  {c.name} · {c.start_date}
                </option>
              ))}
            </select>
          </label>
          <div className="eventEconomyTotals">
            <article>
              <small>LOLLIPOPS EARNED</small>
              <b>{fmt(s.totalLollipops)}</b>
              <small>
                {s.questLollipops} daily + {s.bonusLollipops} milestone + {s.additionalLollipops} other
              </small>
            </article>
            <article>
              <small>GOLD EQUIVALENT · SAXON SHOT</small>
              <b>{fmt(s.saxonGoldEquivalent)}</b>
              <small>8,000 / 25 Lollipops · {s.saxonUnused} Lollipops left over</small>
            </article>
            <article>
              <small>GOLD EQUIVALENT · LARGE BATTLE MARKS</small>
              <b>{fmt(s.battleMarkGoldEquivalent)}</b>
              <small>20,000 / 1,350 Lollipops · {s.battleMarkUnused} Lollipops left over</small>
            </article>
            <article>
              <small>GOLD EQUIVALENT · HEAVY SHOT</small>
              <b>{fmt(s.heavyGoldEquivalent)}</b>
              <small>6,000 / 40 Lollipops · {s.heavyUnused} Lollipops left over</small>
            </article>
          </div>
          <p>
            These are alternative exchange valuations of the same earnings, not amounts to add together.
            Recorded ammo acquired this event: <b>{fmt(s.trackedAmmoGold)} gold</b>. Items marked as already
            owned are excluded from that ammo value.
          </p>
          {selected === campaignId && (
            <div className="opsRow">
              <label>
                Other Lollipops earned (cumulative)
                <input
                  aria-label="Other Lollipops earned"
                  type="number"
                  min="0"
                  max="1000000000"
                  step="1"
                  value={extra}
                  disabled={busy || !eligible}
                  onChange={(e) => setExtra(e.target.value)}
                />
              </label>
              <button
                disabled={
                  busy ||
                  !eligible ||
                  extra === "" ||
                  !Number.isSafeInteger(Number(extra)) ||
                  Number(extra) < 0 ||
                  Number(extra) > 1000000000
                }
                onClick={async () => {
                  setBusy(true);
                  try {
                    await operationsApi("event-tool/earnings", {
                      method: "PUT",
                      body: JSON.stringify({
                        campaignId,
                        additionalLollipops: Number(extra),
                        version: data.earnings.version,
                      }),
                    });
                    await load(selected);
                    setNotice("Earnings saved.");
                  } catch (e: any) {
                    setNotice(e.message);
                    await load(selected).catch(() => {});
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Save earnings
              </button>
            </div>
          )}
          <button
            onClick={() =>
              downloadCsv("Halloween-Event-Summary.csv", [
                [
                  "Event",
                  "Lollipops earned",
                  "Daily quests",
                  "Daily Lollipops",
                  "Bonus",
                  "Other Lollipops",
                  "Saxon gold equivalent",
                  "Heavy gold equivalent",
                  "Large Battle Mark gold equivalent",
                  "Tracked new ammo gold",
                ],
                [
                  data.campaigns.find((c: any) => c.id === selected)?.name,
                  s.totalLollipops,
                  s.questCount,
                  s.questLollipops,
                  s.bonusLollipops,
                  s.additionalLollipops,
                  s.saxonGoldEquivalent,
                  s.heavyGoldEquivalent,
                  s.battleMarkGoldEquivalent,
                  s.trackedAmmoGold,
                ],
              ])
            }
          >
            Download summary
          </button>
          <small>
            Self-reported totals. This is an estimate, not verified gold earned from sales. Archived event
            summaries remain available here.
          </small>
        </>
      )}
    </section>
  );
}
