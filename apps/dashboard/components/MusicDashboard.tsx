"use client";
// Music: one clean screen. Now playing with controls, add a song, the queue,
// and what played recently. Live updates come from the music event stream.
import { type FormEvent, useEffect, useRef, useState } from "react";
import CommandIcon from "./CommandIcon";
import { EmptyState } from "./ui/State";

type Summary = any;

const fmt = (ms: number = 0) => {
  const s = Math.max(0, Math.floor((Number.isFinite(Number(ms)) ? Number(ms) : 0) / 1000));
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};
const ago = (v: any) => {
  const m = Math.floor((Date.now() - +new Date(v)) / 60000);
  if (!Number.isFinite(m) || m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : new Date(v).toLocaleDateString([], { month: "short", day: "numeric" });
};
async function api(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return fetch(path, { ...init, headers, cache: "no-store" });
}
// Artwork with an icon fallback when the image is missing or fails to load.
function Art({ src, size }: { src?: string | null; size: number }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? (
    <img src={src} alt="" onError={() => setFailed(true)} />
  ) : (
    <CommandIcon name="music" size={size} />
  );
}
const requesterName = (q: any) =>
  q?.requester?.name ??
  (q?.requesterId === "autoplay" ? "Autoplay" : q?.requesterId === "BOM Radio" ? "BOM Radio" : "Listener");

export default function MusicDashboard({ initial }: { initial: Summary }) {
  const [data, setData] = useState<Summary>(initial);
  const [history, setHistory] = useState<any[]>(initial.history ?? []);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [position, setPosition] = useState(Number(initial.activeRoom?.state?.position ?? 0));
  const [volume, setVolume] = useState(100);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const volumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const room = data.activeRoom;
  const state = room?.state ?? {};
  const track = state.track;
  const queue: any[] = room?.queue ?? [];
  const voice = data.voiceContext;
  const can = (p: string) => Boolean(data.capabilities?.[p]);
  const paused = state.status === "PAUSED";
  const playing = state.status === "PLAYING";
  const active = Boolean(track) && !["IDLE", "STOPPED", "ERROR"].includes(String(state.status));
  const botsOnline = (data.workers ?? []).filter((w: any) => !w.offline).length;
  const botsTotal = (data.workers ?? []).length || 8;

  function say(text: string, tone: "ok" | "error" = "ok") {
    setNotice({ text, tone });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }
  async function refresh() {
    const r = await api("/api/internal/music/summary");
    if (!r.ok) return;
    const j = await r.json();
    setData(j);
    setHistory(j.history ?? []);
  }
  async function refreshRoom(roomId: string) {
    const r = await api(`/api/internal/music/room/${encodeURIComponent(roomId)}/live`);
    if (!r.ok) return void refresh();
    const live = await r.json();
    setData((d: any) => ({ ...d, activeRoom: d.activeRoom?.id === roomId ? live : d.activeRoom }));
  }

  // Live updates; fall back to polling if the stream drops.
  useEffect(() => {
    let fallback: ReturnType<typeof setInterval> | undefined;
    const es = new EventSource("/api/internal/music/events");
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg?.roomId) void refreshRoom(String(msg.roomId));
        else void refresh();
      } catch {
        void refresh();
      }
    };
    es.addEventListener("ready", () => {
      if (fallback) clearInterval(fallback);
      fallback = undefined;
    });
    es.onerror = () => {
      if (!fallback) fallback = setInterval(() => void refresh(), 15_000);
    };
    return () => {
      es.close();
      if (fallback) clearInterval(fallback);
    };
  }, []);

  // Smooth progress between server updates.
  useEffect(() => {
    setPosition(Number(state.position ?? 0));
    if (!playing) return;
    const base = Number(state.position ?? 0),
      started = Date.now();
    const t = setInterval(
      () => setPosition(Math.min(Number(track?.length ?? Infinity), base + (Date.now() - started))),
      500,
    );
    return () => clearInterval(t);
  }, [state.position, state.status, track?.identifier, track?.length]);

  async function action(type: string, extra: any = {}, optimistic?: (d: any) => any) {
    setBusy(type);
    const before = data;
    if (optimistic) setData((d: any) => optimistic(d));
    try {
      const r = await api("/api/internal/music/actions", {
        method: "POST",
        body: JSON.stringify({ type, ...extra }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        if (optimistic) setData(before);
        say(
          r.status === 409
            ? "Join a Discord voice channel first."
            : r.status === 403
              ? "You don't have permission to do that."
              : r.status === 429
                ? "Slow down a little."
                : (body?.message ?? `That didn't work (${r.status}).`),
          "error",
        );
        return false;
      }
      if (type === "QUEUE") say(`Added to ${body?.voiceChannelName ?? "your voice channel"}.`);
      setTimeout(() => void refresh(), 400);
      return true;
    } finally {
      setBusy(null);
    }
  }
  const patchState = (patch: any) => (d: any) =>
    d.activeRoom ? { ...d, activeRoom: { ...d.activeRoom, state: { ...d.activeRoom.state, ...patch } } } : d;
  const togglePause = () =>
    action(paused ? "RESUME" : "PAUSE", {}, patchState({ status: paused ? "PLAYING" : "PAUSED" }));
  const skip = () =>
    can("FORCE_SKIP") ? action("SKIP") : action("VOTE_SKIP").then((ok) => ok && say("Skip vote counted."));
  const stop = () => {
    if (window.confirm("Stop the music and clear the queue?"))
      void action("STOP", {}, patchState({ status: "IDLE", track: null }));
  };
  function changeVolume(v: number) {
    setVolume(v);
    if (volumeTimer.current) clearTimeout(volumeTimer.current);
    volumeTimer.current = setTimeout(() => void action("VOLUME", { volume: v }), 250);
  }
  async function add(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (await action("QUEUE", { query: q })) setQuery("");
  }
  async function reorder(from: number, to: number) {
    if (!room?.id || from === to) return;
    setData((d: any) => {
      const q = [...(d.activeRoom?.queue ?? [])];
      const [moved] = q.splice(from, 1);
      q.splice(to, 0, moved);
      return { ...d, activeRoom: { ...d.activeRoom, queue: q } };
    });
    const r = await api("/api/internal/music/queue/reorder", {
      method: "POST",
      body: JSON.stringify({ roomId: room.id, from, to }),
    });
    if (!r.ok) {
      say("Couldn't reorder the queue.", "error");
      void refresh();
    }
  }
  const removeAt = (i: number) =>
    action("QUEUE_REMOVE", { index: i }, (d: any) => ({
      ...d,
      activeRoom: {
        ...d.activeRoom,
        queue: (d.activeRoom?.queue ?? []).filter((_: any, k: number) => k !== i),
      },
    }));

  const pct = track?.length ? Math.min(100, (position / Number(track.length)) * 100) : 0;
  function seek(e: React.MouseEvent<HTMLDivElement>) {
    if (!can("MANAGE_MUSIC") || !track?.length || track.isStream) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ms = Math.round(((e.clientX - rect.left) / rect.width) * Number(track.length));
    setPosition(ms);
    void action("SEEK", { positionMs: ms });
  }

  return (
    <div className="mp">
      <header className="mpHeader">
        <div>
          <h1>Music</h1>
          <p>
            {voice?.connected ? (
              <>
                Playing to <b>{voice.name}</b>. Playback stops when the queue ends.
              </>
            ) : (
              "Join a Discord voice channel and a free music bot will join you."
            )}
          </p>
        </div>
        <span className={`mpChip ${botsOnline ? "" : "off"}`}>
          <i /> {botsOnline}/{botsTotal} bots online
        </span>
      </header>

      {notice && (
        <div className={`mpNotice ${notice.tone}`} role="status">
          {notice.text}
        </div>
      )}

      <div className="mpGrid">
        <div className="mpMain">
          <section className={`mpNow ${active ? "" : "idle"}`} aria-label="Now playing">
            <div className="mpArt">
              <Art key={track?.identifier ?? "none"} src={track?.artworkUrl} size={34} />
            </div>
            <div className="mpNowBody">
              <span className="mpLabel">
                {active ? (paused ? "Paused" : "Now playing") : "Nothing playing"}
              </span>
              <h2>{active ? track.title : "Queue something up"}</h2>
              <p>
                {active ? (
                  <>
                    {track.author}
                    {state.requesterId && (
                      <> · requested by {state.requester?.name ?? requesterName(state)}</>
                    )}
                  </>
                ) : (
                  "Add a song below, or use /play in Discord."
                )}
              </p>
              {active && !track.isStream && (
                <div className="mpProgress">
                  <span>{fmt(position)}</span>
                  <div
                    className={`mpBar ${can("MANAGE_MUSIC") ? "seekable" : ""}`}
                    onClick={seek}
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={Number(track.length)}
                    aria-valuenow={position}
                  >
                    <i style={{ width: `${pct}%` }} />
                  </div>
                  <span>{fmt(track.length)}</span>
                </div>
              )}
              {active && track.isStream && <span className="mpLive">● Live</span>}
              {active && (
                <div className="mpControls">
                  <button
                    type="button"
                    className="mpPlay"
                    onClick={() => void togglePause()}
                    disabled={!can("MANAGE_MUSIC") || busy === "PAUSE" || busy === "RESUME"}
                    aria-label={paused ? "Resume" : "Pause"}
                    title={can("MANAGE_MUSIC") ? undefined : "Needs a DJ role"}
                  >
                    {paused ? "▶" : "❚❚"}
                  </button>
                  <button
                    type="button"
                    className="mpBtn"
                    onClick={() => void skip()}
                    disabled={busy === "SKIP" || busy === "VOTE_SKIP"}
                  >
                    ⏭ {can("FORCE_SKIP") ? "Skip" : "Vote skip"}
                  </button>
                  {can("MANAGE_MUSIC") && (
                    <button type="button" className="mpBtn danger" onClick={stop} disabled={busy === "STOP"}>
                      ■ Stop
                    </button>
                  )}
                  {can("MANAGE_MUSIC") && (
                    <label className="mpVolume">
                      <span aria-hidden="true">🔊</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={volume}
                        onChange={(e) => changeVolume(Number(e.target.value))}
                        aria-label="Volume"
                      />
                      <small>{volume}</small>
                    </label>
                  )}
                </div>
              )}
            </div>
          </section>

          <form className="mpAdd" onSubmit={add}>
            <CommandIcon name="search" size={18} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={voice?.connected ? "Song, artist or link…" : "Join a voice channel to add songs"}
              aria-label="Add a song"
              maxLength={1000}
            />
            <button
              type="submit"
              className="goldButton"
              disabled={!query.trim() || busy === "QUEUE" || !can("USE_MUSIC")}
            >
              {busy === "QUEUE" ? "Adding…" : "Add"}
            </button>
          </form>

          <section className="mpCard" aria-label="Queue">
            <header>
              <h2>
                Up next{" "}
                <small>{queue.length ? `${queue.length} song${queue.length === 1 ? "" : "s"}` : ""}</small>
              </h2>
              {can("MANAGE_QUEUE") && queue.length > 0 && (
                <button
                  type="button"
                  className="textButton"
                  onClick={() => {
                    if (window.confirm("Clear the whole queue?"))
                      void action("QUEUE_CLEAR", {}, (d: any) => ({
                        ...d,
                        activeRoom: { ...d.activeRoom, queue: [] },
                      }));
                  }}
                >
                  Clear
                </button>
              )}
            </header>
            {queue.length ? (
              <ol className="mpQueue">
                {queue.map((q, i) => (
                  <li
                    key={q.requestId ?? i}
                    draggable={can("MANAGE_QUEUE")}
                    onDragStart={() => setDragIndex(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragIndex !== null) void reorder(dragIndex, i);
                      setDragIndex(null);
                    }}
                    className={dragIndex === i ? "dragging" : ""}
                  >
                    <span className="mpIndex">{i + 1}</span>
                    <span className="mpThumb">
                      <Art src={q.trackInfo?.artworkUrl} size={16} />
                    </span>
                    <span className="mpTrack">
                      <b>{q.trackInfo?.title ?? q.display ?? q.query}</b>
                      <small>
                        {q.trackInfo?.author ? `${q.trackInfo.author} · ` : ""}
                        {requesterName(q)}
                        {q.trackInfo?.length ? ` · ${fmt(q.trackInfo.length)}` : ""}
                      </small>
                    </span>
                    <span className="mpRowActions">
                      {can("MANAGE_QUEUE") && can("FORCE_SKIP") && state.requestId && q.requestId && (
                        <button
                          type="button"
                          className="tinyButton"
                          onClick={() =>
                            void action("SKIP_TO", {
                              requestId: q.requestId,
                              currentRequestId: state.requestId,
                            })
                          }
                        >
                          Play now
                        </button>
                      )}
                      {can("MANAGE_QUEUE") && (
                        <button
                          type="button"
                          className="mpIcon"
                          aria-label="Remove from queue"
                          onClick={() => void removeAt(i)}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState title="The queue is empty" icon="music">
                Songs you add will line up here
                {can("MANAGE_QUEUE") ? ", and you can drag to reorder them" : ""}.
              </EmptyState>
            )}
          </section>
        </div>

        <aside className="mpSide">
          <section className="mpCard" aria-label="Recently played">
            <header>
              <h2>Recently played</h2>
            </header>
            {history.length ? (
              <ul className="mpRecent">
                {history.slice(0, 12).map((h: any) => (
                  <li key={h.id}>
                    <span className="mpThumb">
                      <Art src={h.artwork_url} size={16} />
                    </span>
                    <span className="mpTrack">
                      <b>{h.title}</b>
                      <small>
                        {h.author} · {ago(h.started_at)}
                      </small>
                    </span>
                    {can("USE_MUSIC") && voice?.connected && (
                      <button
                        type="button"
                        className="mpIcon"
                        aria-label={`Play ${h.title} again`}
                        title="Add again"
                        onClick={() => void action("QUEUE", { query: `${h.author} ${h.title}` })}
                      >
                        +
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="uiEmpty">Nothing has played yet.</p>
            )}
          </section>
          <section className="mpCard mpTips">
            <header>
              <h2>In Discord</h2>
            </header>
            <ul>
              <li>
                <code>/play song</code> adds a song
              </li>
              <li>
                <code>/music skip</code>, <code>pause</code>, <code>stop</code>, <code>queue</code>
              </li>
              <li>
                Type <code>play song</code> or paste a link in voice chat
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
