"use client";
import { useEffect, useState } from "react";
export default function MusicSessionTools({ canManage }: { canManage: boolean }) {
  const [data, setData] = useState<any>(null),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const call = async (path: string, body?: any, method = "POST") => {
    const r = await fetch("/api/internal/music/" + path, {
      method: body === undefined ? "GET" : method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const x = await r.json();
    if (!r.ok) throw Error(x.message || x.error || "Music request failed");
    return x;
  };
  const refresh = async () => {
    try {
      setData(await call("session-tools"));
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  };
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => clearInterval(timer);
  }, []);
  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="musicSessionTools">
      <summary>Session suggestions &amp; fair queue</summary>
      {error && (
        <p role="alert">
          {error}{" "}
          <button className="outlineButton" onClick={refresh}>
            Retry
          </button>
        </p>
      )}
      {data && (
        <>
          <p>
            Fair queue rotates between requesters while preserving each person’s track order. The displayed
            list shows arrival order; fair mode chooses the next requester at playback time.
          </p>
          {canManage ? (
            <label>
              <input
                type="checkbox"
                checked={data.fairQueue}
                disabled={busy}
                onChange={(e) => run(() => call("fair-queue", { enabled: e.target.checked }, "PUT"))}
              />{" "}
              Fair queue {data.fairQueue ? "ON" : "OFF"}
            </label>
          ) : (
            <p>Fair queue {data.fairQueue ? "ON" : "OFF"} · a DJ can change this setting.</p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await call("session-suggestions", { query });
                setQuery("");
              });
            }}
          >
            <label>
              Suggest a track
              <input
                maxLength={300}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Artist and title"
              />
            </label>
            <button className="goldButton" disabled={busy || query.trim().length < 2}>
              Suggest
            </button>
          </form>
          {data.suggestions.map((s: any) => (
            <div key={s.id}>
              <b>{s.query}</b> · {s.votes} votes · {s.status === "QUEUED" ? "Sent to queue" : "Open"}
              {s.status === "OPEN" && (
                <>
                  <button
                    className="outlineButton"
                    disabled={busy}
                    onClick={() =>
                      run(() => call("session-suggestions/" + s.id + "/vote", { voted: !s.voted }, "PUT"))
                    }
                  >
                    {s.voted ? "Remove vote" : "Vote"}
                  </button>
                  {canManage && (
                    <button
                      className="outlineButton"
                      disabled={busy}
                      onClick={() => run(() => call("session-suggestions/" + s.id + "/queue", {}))}
                    >
                      Queue selection
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
          {!data.suggestions.length && (
            <p className="uiEmpty">No suggestions yet. Add a track for the room to vote on.</p>
          )}
        </>
      )}
    </details>
  );
}
