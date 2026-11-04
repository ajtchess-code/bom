"use client";
import { useState } from "react";
export default function RosterHistory({ battleId, onChanged }: { battleId: string; onChanged: () => void }) {
  const [data, setData] = useState<any>(null),
    [name, setName] = useState(""),
    [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState(false);
  const call = async (path = "", body?: any) => {
    const r = await fetch("/api/internal/wosb/port-battles/" + battleId + "/roster-history" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const x = await r.json();
    if (!r.ok) throw Error(x.message || x.error || "History unavailable");
    return x;
  };
  const load = async () => {
    try {
      setData(await call());
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  };
  const checkpoint = data?.checkpoints.find((x: any) => x.id === selected);
  return (
    <details
      onToggle={(e) => {
        if (e.currentTarget.open && !data) void load();
      }}
    >
      <summary>Roster history &amp; checkpoints</summary>
      <p>
        Save a named lineup before making changes. Restoration checks current signups, playable ships, duties
        and withdrawal notices.
      </p>
      {error && <p role="alert">{error}</p>}
      <label>
        Checkpoint name
        <input maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <button
        className="outlineButton"
        disabled={busy || !name.trim()}
        onClick={async () => {
          setBusy(true);
          try {
            await call("/checkpoints", { name });
            setName("");
            await load();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Save current lineup
      </button>
      <button className="outlineButton" onClick={load}>
        Reload history
      </button>
      {data && (
        <>
          <label>
            Saved lineup
            <select
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setReview(false);
              }}
            >
              <option value="">Choose checkpoint</option>
              {data.checkpoints.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {new Date(c.created_at).toLocaleString()}
                </option>
              ))}
            </select>
          </label>
          {checkpoint && (
            <>
              <ul>
                {checkpoint.roster.map((s: any) => (
                  <li key={s.id}>
                    {s.display_name} · {s.confirmed_ship || "Unassigned"} ·{" "}
                    {[s.formation, s.horn_duty, s.flare_duty, s.commander_duty].filter(Boolean).join(" · ")}
                  </li>
                ))}
              </ul>
              {!review ? (
                <button className="outlineButton" onClick={() => setReview(true)}>
                  Review restoration
                </button>
              ) : (
                <div>
                  <p>
                    Restore this lineup? Current assignments will be replaced. The changes will remain in
                    history.
                  </p>
                  <button
                    className="goldButton"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await call("/restore", { checkpointId: selected, digest: data.digest });
                        setReview(false);
                        await load();
                        onChanged();
                      } catch (e: any) {
                        setError(e.message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Restore lineup
                  </button>
                  <button className="outlineButton" onClick={() => setReview(false)}>
                    Back
                  </button>
                </div>
              )}
            </>
          )}
          <details>
            <summary>Recent assignment changes</summary>
            {data.events.map((e: any) => (
              <p key={e.id}>
                {new Date(e.created_at).toLocaleString()} · {e.action} · {e.actor_id} ·{" "}
                {e.after_state?.confirmed_ship || "Unassigned"}
              </p>
            ))}
          </details>
        </>
      )}
    </details>
  );
}
