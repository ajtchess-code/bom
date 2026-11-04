"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
export default function PortDossier({ portKey }: { portKey: string }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [draft, setDraft] = useState({ priority: "NORMAL", notes: "", version: 0 }),
    [before, setBefore] = useState(""),
    [after, setAfter] = useState("");
  const load = async () => {
    try {
      const r = await fetch(
        "/api/internal/wosb/territory/ports/" + encodeURIComponent(portKey) + "/dossier",
        { cache: "no-store" },
      );
      const x = await r.json();
      if (!r.ok) throw Error(x.message || x.error);
      setData(x);
      setDraft({
        priority: x.strategy?.priority ?? "NORMAL",
        notes: x.strategy?.notes ?? "",
        version: x.strategy?.version ?? 0,
      });
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  };
  useEffect(() => {
    void load();
  }, [portKey]);
  const historical = (date: string) => {
    if (!date) return null;
    const cutoff = +new Date(date);
    const event = data.events.find((e: any) => +new Date(e.created_at) <= cutoff);
    if (event) return event.snapshot?.after ?? null;
    const earliest = data.events.at(-1);
    return earliest?.snapshot?.before && +new Date(earliest.snapshot.before.updated_at) <= cutoff
      ? earliest.snapshot.before
      : null;
  };
  return (
    <section className="panel">
      <header>
        <h1>{data?.port?.name || "Port intelligence"}</h1>
        <Link href="/dashboard/map">Back to map</Link>
      </header>
      {error && (
        <p role="alert">
          {error}{" "}
          <button className="outlineButton" onClick={load}>
            Reload
          </button>
        </p>
      )}
      {data && (
        <>
          <p>
            Owner: {data.port.owner_tag || "Unowned"} · Protection ends:{" "}
            {data.port.protected_until
              ? new Date(data.port.protected_until).toLocaleString()
              : "No recorded protection"}{" "}
            · last edited {new Date(data.port.updated_at).toLocaleString()}
          </p>
          <label>
            Strategic priority
            <select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>
              {["LOW", "NORMAL", "HIGH", "CRITICAL"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Officer notes
            <textarea
              maxLength={5000}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </label>
          <button
            className="outlineButton"
            onClick={async () => {
              try {
                const r = await fetch(
                  "/api/internal/wosb/territory/ports/" + encodeURIComponent(portKey) + "/strategy",
                  {
                    method: "PUT",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(draft),
                  },
                );
                const x = await r.json();
                if (!r.ok) throw Error(x.message || x.error);
                setDraft({ ...draft, version: x.version });
                setError("");
              } catch (e: any) {
                setError(e.message);
              }
            }}
          >
            Save strategy
          </button>
          <details>
            <summary>Attack-window planner · next seven days</summary>
            <p>
              Recorded port windows adjusted for current protection. Recheck ownership and timers before
              scheduling. These windows do not predict captain availability.
            </p>
            {data.windows?.map((w: any) => (
              <p key={w.start}>
                {new Date(w.start).toLocaleString()} → {new Date(w.end).toLocaleString()} ·{" "}
                {Math.round((w.end - w.start) / 60000)} minutes available
              </p>
            ))}
            {!data.windows?.length && (
              <p>No attackable window could be calculated from the recorded schedule and protection.</p>
            )}
          </details>
          <div className="commandHomeGrid">
            <section>
              <h2>Battles &amp; reports</h2>
              {data.battles.map((b: any) => (
                <Link key={b.id} href={"/dashboard/port-battles?battle=" + b.id}>
                  <b>
                    {b.status} · {b.port_name}
                  </b>
                  <small>{b.starts_at ? new Date(b.starts_at).toLocaleString() : "Unscheduled"}</small>
                </Link>
              ))}
            </section>
            <section>
              <h2>Plans &amp; VOD reviews</h2>
              {data.sessions.map((s: any) => (
                <Link
                  key={s.id}
                  href={
                    (s.kind === "PREP" ? "/dashboard/battle-prep" : "/dashboard/battle-review") +
                    "?session=" +
                    s.id
                  }
                >
                  <b>{s.title}</b>
                  <small>
                    {s.kind} · {new Date(s.updated_at).toLocaleString()}
                  </small>
                </Link>
              ))}
            </section>
          </div>
          <details>
            <summary>Ownership &amp; protection comparison</summary>
            <p>Uses up to the 200 most recent recorded changes. Missing history is shown as unknown.</p>
            <label>
              From
              <input type="datetime-local" value={before} onChange={(e) => setBefore(e.target.value)} />
            </label>
            <label>
              To
              <input type="datetime-local" value={after} onChange={(e) => setAfter(e.target.value)} />
            </label>
            <table>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>From</th>
                  <th>To</th>
                </tr>
              </thead>
              <tbody>
                {["owner_tag", "taxing_tag", "protected_until"].map((k) => (
                  <tr key={k}>
                    <th>{k.replaceAll("_", " ")}</th>
                    <td>
                      {before
                        ? historical(before)
                          ? (historical(before)[k] ?? (k === "owner_tag" ? "Unowned" : "None recorded"))
                          : "Unknown"
                        : "Choose time"}
                    </td>
                    <td>
                      {after
                        ? historical(after)
                          ? (historical(after)[k] ?? (k === "owner_tag" ? "Unowned" : "None recorded"))
                          : "Unknown"
                        : "Choose time"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <details>
            <summary>Taxation &amp; territory ledger</summary>
            {data.events.map((e: any) => (
              <article key={e.id}>
                <b>{e.kind}</b> · {new Date(e.created_at).toLocaleString()} · {e.actor_id}
                <p>
                  {e.snapshot?.before?.owner_tag || "Unowned"} → {e.snapshot?.after?.owner_tag || "Unowned"}
                </p>
                {(e.snapshot?.after?.taxes ?? []).map((t: any, i: number) => (
                  <p key={i}>
                    {t.tag} · {t.started_at ? new Date(t.started_at).toLocaleString() : "Start not recorded"}{" "}
                    → {t.protected_until || t.until || "Timer recorded in territory history"}
                  </p>
                ))}
              </article>
            ))}
          </details>
        </>
      )}
    </section>
  );
}
