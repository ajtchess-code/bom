"use client";
import MusicSessionTools from "./MusicSessionTools";

import { FormEvent, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { LANGUAGES, normalizeLocale, tr } from "@bom/shared";
import GlobalRadioBrowser from "./GlobalRadioBrowser";

type Summary = any;
type MusicTab =
  | "player"
  | "queue"
  | "discover"
  | "history"
  | "lyrics"
  | "profile"
  | "audio"
  | "radio"
  | "podcasts";
const tabs: [MusicTab, string, string][] = [
  ["player", "Now Playing", "◉"],
  ["queue", "Queue", "≡"],
  ["discover", "Discover", "✦"],
  ["history", "History", "◷"],
  ["lyrics", "Lyrics", "♫"],
  ["profile", "Profile", "♛"],
  ["audio", "Audio", "≋"],
  ["radio", "Radio", "◉"],
  ["podcasts", "Podcasts", "♬"],
];
const workerColors: Record<string, string> = {
  "1": "#9B4DFF",
  "2": "#ED4245",
  "3": "#F47B20",
  "4": "#F1C40F",
  "5": "#57F287",
  "6": "#3498DB",
  "7": "#F2F3F5",
  "8": "#232428",
};
const fmt = (ms: number = 0) => {
  const safe = Number.isFinite(Number(ms)) ? Number(ms) : 0,
    s = Math.floor(safe / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
async function api(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return fetch(path, { ...init, headers });
}

function lyricLines(raw: any) {
  const lines = raw?.lines ?? raw?.data?.lines ?? raw?.lyrics?.lines ?? [];
  return Array.isArray(lines)
    ? lines
        .map((x: any) => ({
          time: Number(x.timestamp ?? x.time ?? x.startTime ?? 0),
          text: String(x.line ?? x.text ?? x.content ?? ""),
        }))
        .filter((x: any) => x.text)
    : [];
}
function currentLyric(lines: any[], position: number) {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= position) idx = i;
    else break;
  }
  return idx;
}

export default function MusicDashboard({ initial }: { initial: Summary }) {
  const [data, setData] = useState(initial),
    [tab, setTab] = useState<MusicTab>("player"),
    [filters, setFilters] = useState<any[]>([]),
    [recommendations, setRecommendations] = useState<any[]>([]),
    [community, setCommunity] = useState<any>({}),
    [stats, setStats] = useState<any>({}),
    [query, setQuery] = useState(""),
    [notice, setNotice] = useState(""),
    [historyQ, setHistoryQ] = useState(""),
    [history, setHistory] = useState<any[]>(initial.history ?? []),
    [locale, setLocale] = useState(
      normalizeLocale(initial.preferences?.language ?? initial.settings?.default_language ?? "en-US"),
    ),
    [fullscreen, setFullscreen] = useState(false),
    [displayPosition, setDisplayPosition] = useState(Number(initial.activeRoom?.state?.position ?? 0)),
    [theme, setTheme] = useState(workerColors[String(initial.activeRoom?.state?.workerId ?? 1)]),
    [dragIndex, setDragIndex] = useState<number | null>(null),
    [profileDraft, setProfileDraft] = useState<any>({
      displayMode: initial.profile?.display_mode ?? "PUBLIC",
      preferredMood: initial.profile?.preferred_mood ?? "",
      discoveryLevel: initial.profile?.discovery_level ?? "BALANCED",
      favoriteGenres: Array.isArray(initial.profile?.favorite_genres)
        ? initial.profile.favorite_genres.join(", ")
        : "",
    });
  const heroRef = useRef<HTMLDivElement | null>(null);
  const room = data.activeRoom,
    voice = data.voiceContext,
    track = room?.state?.track,
    meta = room?.metadata,
    features = data.features ?? {},
    profile = data.profile ?? {},
    userMetrics = data.metrics ?? {},
    achievements = data.achievements ?? [],
    feedback = data.feedback ?? [],
    favorites = data.favorites ?? [];
  const can = (p: string) => Boolean(data.capabilities?.[p]);
  const online = data.workers?.filter((w: any) => !w.offline).length ?? 0;
  const isPlaying = room?.state?.status === "PLAYING";
  const currentFeedback = track
    ? feedback.find((x: any) => x.identifier === track.identifier && x.source_name === track.sourceName)
    : null;
  const isFavorite = track
    ? favorites.some((x: any) => x.identifier === track.identifier && x.source_name === track.sourceName)
    : false;
  const lines = useMemo(() => lyricLines(room?.lyrics), [room?.lyrics]);
  const lyricIndex = currentLyric(lines, Number(room?.state?.position ?? 0));

  async function refresh() {
    const r = await api("/api/internal/music/summary", { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      setData(j);
      setHistory(j.history ?? []);
    }
  }
  async function refreshRoom(roomId: string) {
    const r = await api(`/api/internal/music/room/${encodeURIComponent(roomId)}/live`, { cache: "no-store" });
    if (!r.ok) return;
    const live = await r.json();
    setData((d: any) => ({
      ...d,
      rooms: (d.rooms ?? []).map((x: any) => (x.id === roomId ? live : x)),
      activeRoom: d.activeRoom?.id === roomId ? live : d.activeRoom,
    }));
  }
  async function loadAux() {
    await Promise.all([
      api("/api/internal/filters")
        .then(async (r) => {
          if (r.ok) setFilters(await r.json());
        })
        .catch(() => {}),
      api("/api/internal/music/recommendations")
        .then(async (r) => {
          if (r.ok) setRecommendations(await r.json());
        })
        .catch(() => {}),
      api("/api/internal/music/community")
        .then(async (r) => {
          if (r.ok) setCommunity(await r.json());
        })
        .catch(() => {}),
      api("/api/internal/music/stats")
        .then(async (r) => {
          if (r.ok) setStats(await r.json());
        })
        .catch(() => {}),
    ]);
  }
  useEffect(() => {
    void loadAux();
    let stopped = false,
      fallback: ReturnType<typeof setInterval> | undefined;
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
      if (fallback) {
        clearInterval(fallback);
        fallback = undefined;
      }
    });
    es.onerror = () => {
      if (!stopped && !fallback) fallback = setInterval(() => void refresh(), 20_000);
    };
    return () => {
      stopped = true;
      es.close();
      if (fallback) clearInterval(fallback);
    };
  }, []);
  useEffect(() => {
    setTheme(workerColors[String(room?.state?.workerId ?? 1)] ?? "#9B4DFF");
  }, [room?.state?.workerId, track?.identifier]);
  useEffect(() => {
    setDisplayPosition(Number(room?.state?.position ?? 0));
    if (room?.state?.status !== "PLAYING") return;
    const base = Number(room?.state?.position ?? 0),
      started = Date.now(),
      timer = setInterval(
        () => setDisplayPosition(Math.min(Number(track?.length ?? Infinity), base + (Date.now() - started))),
        250,
      );
    return () => clearInterval(timer);
  }, [room?.state?.position, room?.state?.status, track?.identifier, track?.length]);

  async function action(type: string, extra: any = {}) {
    const r = await api("/api/internal/music/actions", {
      method: "POST",
      body: JSON.stringify({ type, ...extra }),
    });
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setNotice(
        body?.message ??
          (r.status === 409 ? "Join a Discord voice channel first." : `Command failed (${r.status})`),
      );
      return false;
    }
    setNotice(
      type === "QUEUE"
        ? `Sent to ${body?.voiceChannelName ?? "your voice channel"}.`
        : tr(locale, "commandSent"),
    );
    setTimeout(() => void refresh(), 150);
    return true;
  }
  async function addTrack(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    if (await action("QUEUE", { query: query.trim() })) setQuery("");
  }
  async function saveLanguage(language: string) {
    setLocale(normalizeLocale(language));
    const r = await api("/api/internal/music/preferences", {
      method: "PUT",
      body: JSON.stringify({ language }),
    });
    if (r.ok) {
      setData((d: any) => ({ ...d, preferences: { ...d.preferences, language } }));
      setNotice(tr(language, "languageSaved"));
    }
  }
  async function roomSetting(patch: any) {
    if (!room?.id) return;
    const r = await api("/api/internal/music/room-settings", {
      method: "PUT",
      body: JSON.stringify({ roomId: room.id, ...patch }),
    });
    if (r.ok) {
      setNotice("Session settings updated.");
      await refresh();
    } else {
      const reason = await r.json().catch(() => null);
      setNotice(`Music settings failed: ${reason?.message ?? reason?.error ?? r.status}`);
    }
  }
  async function saveProfile() {
    const body = {
      displayMode: profileDraft.displayMode,
      preferredMood: profileDraft.preferredMood || null,
      discoveryLevel: profileDraft.discoveryLevel,
      favoriteGenres: String(profileDraft.favoriteGenres ?? "")
        .split(",")
        .map((x: string) => x.trim())
        .filter(Boolean)
        .slice(0, 20),
    };
    const r = await api("/api/internal/music/profile", { method: "PUT", body: JSON.stringify(body) });
    setNotice(r.ok ? "Music profile saved." : `Profile save failed (${r.status})`);
    if (r.ok) await refresh();
  }
  async function react(rating: -1 | 0 | 1) {
    if (!track) return;
    await api("/api/internal/music/feedback", {
      method: "POST",
      body: JSON.stringify({
        track: {
          identifier: track.identifier,
          sourceName: track.sourceName,
          title: track.title,
          author: track.author,
          artworkUrl: track.artworkUrl ?? null,
        },
        rating,
      }),
    });
    await refresh();
    void loadAux();
  }
  async function favorite() {
    if (!track) return;
    if (isFavorite)
      await api(
        `/api/internal/music/favorites/${encodeURIComponent(track.sourceName)}/${encodeURIComponent(track.identifier)}`,
        { method: "DELETE" },
      );
    else
      await api("/api/internal/music/favorites", {
        method: "POST",
        body: JSON.stringify({
          identifier: track.identifier,
          sourceName: track.sourceName,
          title: track.title,
          author: track.author,
          uri: track.uri ?? null,
          artworkUrl: track.artworkUrl ?? null,
        }),
      });
    await refresh();
  }
  async function searchHistory(e: FormEvent) {
    e.preventDefault();
    const r = await api(`/api/internal/music/history/search?q=${encodeURIComponent(historyQ)}&limit=100`, {
      cache: "no-store",
    });
    if (r.ok) setHistory(await r.json());
  }
  async function reorder(from: number, to: number) {
    if (!room?.id) return false;
    if (from === to) return true;
    const r = await api("/api/internal/music/queue/reorder", {
      method: "POST",
      body: JSON.stringify({ roomId: room.id, from, to }),
    });
    if (r.ok) {
      await refresh();
      return true;
    }
    setNotice(`Queue reorder failed (${r.status})`);
    return false;
  }
  function onArtworkLoad(e: any) {
    try {
      const img = e.currentTarget as HTMLImageElement,
        c = document.createElement("canvas");
      c.width = c.height = 16;
      const x = c.getContext("2d");
      if (!x) return;
      x.drawImage(img, 0, 0, 16, 16);
      const d = x.getImageData(0, 0, 16, 16).data;
      let r = 0,
        g = 0,
        b = 0,
        n = 0;
      for (let i = 0; i < d.length; i += 16) {
        r += d[i];
        g += d[i + 1];
        b += d[i + 2];
        n++;
      }
      setTheme(`rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`);
    } catch {}
  }
  async function enterFullscreen() {
    if (!heroRef.current) return;
    if (!document.fullscreenElement) {
      await heroRef.current.requestFullscreen?.();
      setFullscreen(true);
    } else {
      await document.exitFullscreen?.();
      setFullscreen(false);
    }
  }

  const shellStyle = {
    "--music-accent": theme,
    "--album-bg": track?.artworkUrl ? `url("${track.artworkUrl}")` : "none",
  } as CSSProperties;
  return (
    <div className="musicExperience" style={shellStyle}>
      <header className="top musicTop">
        <div>
          <span className="eyebrow">BOM MUSIC</span>
          <h2>Music Deck</h2>
          <small className="musicTagline">Music for the whole crew.</small>
        </div>
        <div className="topTools">
          <select
            aria-label={tr(locale, "language")}
            className="select"
            value={locale}
            onChange={(e) => void saveLanguage(e.target.value)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.emoji} {l.label}
              </option>
            ))}
          </select>
          <div className="statusPill">
            <i /> {online > 0 ? "Music online" : "Music unavailable"}
          </div>
          <div className="statusPill">
            ♫ {Math.round(Number(data.quality?.targetBps ?? 0) / 1000) || "—"} kbps
          </div>
        </div>
      </header>
      {notice && (
        <div className="notice" onClick={() => setNotice("")}>
          {notice}
        </div>
      )}
      <div className="voiceContextBar musicVoice">
        <div>
          <span className="eyebrow">LIVE DESTINATION</span>
          <b>{voice?.connected ? `🔊 ${voice.name}` : "Join a Discord voice channel"}</b>
          <small>
            {voice?.connected
              ? "Music is automatically routed here; queues are collaborative by default."
              : "No music room setup is required."}
          </small>
        </div>
        {voice?.connected && <span className="statusPill">{room?.state?.status ?? "READY"}</span>}
      </div>
      <div className="musicSpotifyShell">
        <aside className="musicLibraryRail">
          <div className="musicLibraryHead">
            <span className="musicLibraryIcon">♫</span>
            <div>
              <b>Your Music</b>
              <small>BOM listening room</small>
            </div>
          </div>
          <nav className="musicLibraryNav" aria-label="Music sections">
            {tabs.map(([id, label, icon]) => (
              <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
                <i>{icon}</i>
                {label}
              </button>
            ))}
          </nav>
        </aside>
        <main className="musicSpotifyMain">
          {tab === "player" && (
            <section className="musicHero" ref={heroRef}>
              <div className="albumBackdrop" />
              <div className="heroAlbum">
                {track?.artworkUrl ? (
                  <img
                    crossOrigin="anonymous"
                    onLoad={onArtworkLoad}
                    src={track.artworkUrl}
                    alt="Album artwork"
                  />
                ) : (
                  <div className="musicArtworkFallback">♫</div>
                )}
                <MiniSpectrum active={isPlaying} />
              </div>
              <div className="heroInfo">
                <span className="eyebrow">
                  {room?.state?.status ?? "IDLE"}
                  {room?.state?.origin ? ` · ${room.state.origin}` : ""}
                  {track?.resolution?.provider ? ` · ${String(track.resolution.provider).toUpperCase()}` : ""}
                </span>
                <h1>{track?.title ?? "The deck is quiet."}</h1>
                <h3>{track?.author ?? "Pick a song to wake the crew."}</h3>
                {track && (
                  <>
                    <div className="progress">
                      <span
                        style={{
                          width: `${track.length ? Math.min(100, (displayPosition / track.length) * 100) : 0}%`,
                        }}
                      />
                    </div>
                    <div className="time">
                      <span>{fmt(displayPosition)}</span>
                      <span>{fmt(track.length)}</span>
                    </div>
                    <div className="visualizerDeck">
                      <DecorativeVisualizer
                        position={displayPosition}
                        duration={Number(track?.length ?? 0)}
                        accent={theme}
                        active={isPlaying}
                        onSeek={
                          can("MANAGE_MUSIC") ? (ms) => void action("SEEK", { positionMs: ms }) : undefined
                        }
                      />
                      <small>Playback progress</small>
                    </div>
                  </>
                )}
                <div className="playbackButtons heroButtons">
                  {room?.state?.workerId && can("MANAGE_MUSIC") && (
                    <button onClick={() => void action(room.state.status === "PAUSED" ? "RESUME" : "PAUSE")}>
                      {room.state.status === "PAUSED" ? "▶" : "Ⅱ"}
                    </button>
                  )}
                  {room?.state?.workerId && can("USE_MUSIC") && (
                    <button
                      aria-label="Skip track"
                      disabled={!can("USE_MUSIC")}
                      onClick={() => void action(can("FORCE_SKIP") ? "SKIP" : "VOTE_SKIP")}
                    >
                      ▶▶
                    </button>
                  )}
                  {room?.state?.workerId && can("MANAGE_MUSIC") && (
                    <button onClick={() => void action("STOP")}>■</button>
                  )}
                  <button
                    className={currentFeedback?.rating === 1 ? "selected" : ""}
                    disabled={!track}
                    onClick={() => void react(currentFeedback?.rating === 1 ? 0 : 1)}
                  >
                    ♥
                  </button>
                  <button
                    className={currentFeedback?.rating === -1 ? "selected dislike" : ""}
                    disabled={!track}
                    onClick={() => void react(currentFeedback?.rating === -1 ? 0 : -1)}
                  >
                    ×
                  </button>
                  <button
                    className={isFavorite ? "selected" : ""}
                    disabled={!track}
                    onClick={() => void favorite()}
                  >
                    ★
                  </button>
                </div>
                {can("USE_MUSIC") && (
                  <form className="quickAdd cinematicAdd" onSubmit={addTrack}>
                    <input
                      disabled={!voice?.connected}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={
                        voice?.connected
                          ? "Song, artist, playlist, station, stream or URL…"
                          : "Join voice first"
                      }
                    />
                    <button disabled={!voice?.connected}>Queue</button>
                  </form>
                )}
                <div className="sessionControls">
                  <span className="musicQueuePolicy">Playback stops when the queue ends.</span>
                  <label className="toggleLine">
                    <input
                      type="checkbox"
                      checked={room?.musicSettings?.avoid_recently_played !== false}
                      disabled={!room?.id || !can("USE_MUSIC")}
                      onChange={(e) => void roomSetting({ avoidRecentlyPlayed: e.target.checked })}
                    />
                    Avoid recently played songs
                  </label>
                  <label className="toggleLine">
                    <input
                      type="checkbox"
                      checked={room?.musicSettings?.recover_queue !== false}
                      disabled={!room?.id || !can("USE_MUSIC")}
                      onChange={(e) => void roomSetting({ recoverQueue: e.target.checked })}
                    />
                    Resume queue after reconnect
                  </label>
                  <label>
                    Mood
                    <select
                      value={
                        room?.musicSettings?.mood ?? profile.preferred_mood ?? features.default_mood ?? ""
                      }
                      onChange={(e) => roomSetting({ mood: e.target.value || null })}
                    >
                      <option value="">Automatic</option>
                      {[
                        "ENERGETIC",
                        "RELAXED",
                        "SAD",
                        "FOCUSED",
                        "PARTY",
                        "NOSTALGIC",
                        "CHILL",
                        "HEAVY",
                        "HAPPY",
                        "DARK",
                      ].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <button onClick={() => void enterFullscreen()}>
                    {fullscreen ? "Exit fullscreen" : "Fullscreen"}
                  </button>
                </div>
                {room?.autoplayDiagnostics && (
                  <div className="muted" role="status">
                    Autoplay:{" "}
                    {String(room.autoplayDiagnostics.status ?? "unknown")
                      .replaceAll("_", " ")
                      .toLowerCase()}
                    {room.autoplayDiagnostics.detail ? ` · ${room.autoplayDiagnostics.detail}` : ""}
                  </div>
                )}
                <details className="musicWorkerPool">
                  <summary>
                    Music workers · {online}/{data.workers?.length ?? 0} online
                  </summary>
                  <div>
                    {(data.workers ?? []).map((w: any) => (
                      <p key={w.workerId}>
                        <b>Bot {w.workerId}</b> ·{" "}
                        {w.offline ? "Offline" : w.roomId ? "Assigned to a session" : "Online"}
                        {w.eventLoopLagMs != null
                          ? ` · ${Math.round(w.eventLoopLagMs)}ms event loop lag`
                          : ""}
                      </p>
                    ))}
                  </div>
                </details>
                {room?.playbackHealth && (
                  <details className="musicRecoveryPanel">
                    <summary>Playback & Queue Recovery</summary>
                    <p>
                      {room.playbackHealth.connected
                        ? "Playback connection available"
                        : "Playback connection idle or unavailable"}{" "}
                      · {room.playbackHealth.queueCount} queued tracks · {room.playbackHealth.snapshotCount}{" "}
                      tracks in the last saved queue
                    </p>
                    <p>
                      Last queue save:{" "}
                      {room.playbackHealth.snapshotAt
                        ? new Date(room.playbackHealth.snapshotAt).toLocaleString()
                        : "No saved queue yet"}
                    </p>
                    <p>After a full bot restart, send a new music request to resume your saved queue.</p>
                    {room.playbackTimeline?.length > 0 && (
                      <ol>
                        {room.playbackTimeline.map((event: any, i: number) => (
                          <li key={i}>
                            <b>{String(event.stage).replaceAll("_", " ")}</b> ·{" "}
                            {new Date(event.at).toLocaleTimeString()}
                            {event.durationMs != null ? ` · ${Math.round(event.durationMs)} ms` : ""}
                            {event.detail ? ` · ${event.detail}` : ""}
                          </li>
                        ))}
                      </ol>
                    )}
                  </details>
                )}
                <div className="trackDetailGrid">
                  <Info label="Album" value={meta?.album} />
                  <Info label="Released" value={meta?.releaseDate} />
                  <Info label="Source" value={track?.sourceName} />
                  <Info label="Queue" value={room?.queue?.length ?? 0} />
                  <Info
                    label="Transition"
                    value={(
                      room?.musicSettings?.transition_mode ??
                      features.transition_mode ??
                      "GAPLESS"
                    ).replaceAll("_", " ")}
                  />
                  <Info label="Radio" value={features.radio_mode ? "BOM Radio active" : "Off"} />
                </div>
                {meta?.fact && (
                  <div className="fact">
                    <b>💡 Did you know?</b>
                    <p>{meta.fact}</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {tab === "radio" && (
            <GlobalRadioBrowser
              kind="radio"
              canQueue={Boolean(can("USE_MUSIC") && voice?.connected)}
              queue={async (stream) => {
                await action("QUEUE", { query: stream });
              }}
            />
          )}
          {tab === "podcasts" && (
            <GlobalRadioBrowser
              kind="podcasts"
              canQueue={Boolean(can("USE_MUSIC") && voice?.connected)}
              queue={async (stream) => {
                await action("QUEUE", { query: stream });
              }}
            />
          )}
          {tab === "queue" && (
            <section className="panel musicPanel">
              <div className="panelHead">
                <div>
                  <h3>Collaborative Queue</h3>
                  <span>Drag tracks to reorder · requester ownership shown</span>
                </div>
                {can("MANAGE_QUEUE") && room?.queue?.length > 0 && (
                  <button onClick={() => void action("QUEUE_CLEAR")}>Clear queue</button>
                )}
              </div>
              <MusicSessionTools canManage={can("MANAGE_QUEUE")} />
              <div className="queueList richQueue">
                {room?.queue?.map((q: any, i: number) => (
                  <div
                    key={q.requestId}
                    draggable={can("MANAGE_QUEUE")}
                    onDragStart={() => setDragIndex(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragIndex !== null) void reorder(dragIndex, i);
                      setDragIndex(null);
                    }}
                    className={dragIndex === i ? "dragging" : ""}
                  >
                    <b>{String(i + 1).padStart(2, "0")}</b>
                    <span className="queueArt">
                      {q.trackInfo?.artworkUrl ? <img src={q.trackInfo.artworkUrl} alt="" /> : "♫"}
                    </span>
                    <span className="queueTrack">
                      <strong>{q.trackInfo?.title ?? q.display ?? q.query}</strong>
                      <small>{q.trackInfo?.author ?? "Queued request"}</small>
                    </span>
                    <span className="requester">
                      {q.requester?.avatar ? <img src={q.requester.avatar} alt="" /> : <i />}
                      <small>
                        {q.requester?.name ??
                          (q.requesterId === "autoplay"
                            ? "Autoplay"
                            : q.requesterId === "BOM Radio"
                              ? "BOM Radio"
                              : "Listener")}
                      </small>
                    </span>
                    {can("MANAGE_QUEUE") && can("FORCE_SKIP") && room?.state?.requestId && q.requestId && (
                      <button
                        onClick={() =>
                          void action("SKIP_TO", {
                            requestId: q.requestId,
                            currentRequestId: room.state.requestId,
                          })
                        }
                      >
                        Play now
                      </button>
                    )}
                    {can("MANAGE_QUEUE") && (
                      <button
                        aria-label="Remove queued track"
                        className="iconCloseButton queueRemove"
                        onClick={() => void action("QUEUE_REMOVE", { index: i })}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                {!room?.queue?.length && (
                  <Empty
                    title="No cargo in the queue"
                    text="Add a track and the crew will take it from here."
                  />
                )}
              </div>
            </section>
          )}

          {tab === "discover" && (
            <>
              <section className="panel musicPanel">
                <div className="panelHead">
                  <div>
                    <h3>Discover</h3>
                    <span>Built from your listening, likes, skips and BOM-wide activity</span>
                  </div>
                </div>
                <div className="albumCarousel">
                  {recommendations.map((r: any) => (
                    <button
                      key={`${r.author}-${r.title}`}
                      onClick={() => void action("QUEUE", { query: r.query })}
                    >
                      <div className="carouselArt">♫</div>
                      <b>{r.title}</b>
                      <small>{r.author}</small>
                      <em>{r.reason}</em>
                    </button>
                  ))}
                </div>
              </section>
              <section className="musicMetricStrip">
                <div>
                  <b>{stats.total?.plays ?? 0}</b>
                  <small>tracks played</small>
                </div>
                <div>
                  <b>{Math.round(Number(stats.total?.duration ?? 0) / 3600000)}</b>
                  <small>hours queued</small>
                </div>
                <div>
                  <b>{community.topRequesters?.[0]?.member?.name ?? "—"}</b>
                  <small>top requester</small>
                </div>
                <div>
                  <b>
                    {stats.hours?.[0]?.hour !== undefined
                      ? `${String(stats.hours[0].hour).padStart(2, "0")}:00`
                      : "—"}
                  </b>
                  <small>busiest hour</small>
                </div>
              </section>
              <section className="panel musicPanel">
                <div className="panelHead">
                  <h3>Recently Played by BOM</h3>
                  <span>guild discovery feed</span>
                </div>
                <div className="recentFeed">
                  {community.recent?.slice(0, 12).map((x: any) => (
                    <button
                      key={x.id}
                      onClick={() => void action("QUEUE", { query: `${x.author} ${x.title}` })}
                    >
                      {x.artwork_url ? <img src={x.artwork_url} alt="" /> : <i>♫</i>}
                      <span>
                        <b>{x.title}</b>
                        <small>{x.author}</small>
                      </span>
                      <em>Queue again</em>
                    </button>
                  ))}
                </div>
              </section>
              <section className="panelGrid musicStatsGrid">
                <div className="panel">
                  <div className="panelHead">
                    <h3>Popular with BOM</h3>
                    <span>30 days</span>
                  </div>
                  <div className="miniCharts">
                    {community.popular?.slice(0, 8).map((x: any, i: number) => (
                      <div key={`${x.author}-${x.title}`}>
                        <span>{i + 1}</span>
                        <b>{x.title}</b>
                        <small>{x.author}</small>
                        <em>{x.plays} plays</em>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="panel">
                  <div className="panelHead">
                    <h3>Forgotten Favorites</h3>
                    <span>deep cuts</span>
                  </div>
                  <p className="muted">
                    Switch Autoplay to <b>Deep Cuts</b> to surface tracks the guild has only played once or
                    twice.
                  </p>
                  <div className="discoveryCallout">
                    ☠ <b>BOM Radio</b>
                    <span>Turn on community radio in Administration for hands-free continuous music.</span>
                  </div>
                </div>
              </section>
            </>
          )}

          {tab === "history" && (
            <section className="panel musicPanel">
              <div className="panelHead">
                <div>
                  <h3>Listening History</h3>
                  <span>Searchable guild archive</span>
                </div>
                <form className="historySearch" onSubmit={searchHistory}>
                  <input
                    value={historyQ}
                    onChange={(e) => setHistoryQ(e.target.value)}
                    placeholder="Search song or artist"
                  />
                  <button>Search</button>
                </form>
              </div>
              <div className="history richHistory">
                {history.map((h: any) => (
                  <div key={h.id}>
                    <span>{h.artwork_url ? <img src={h.artwork_url} alt="" /> : "♪"}</span>
                    <div>
                      <b>{h.title}</b>
                      <small>
                        {h.author} · {h.source_name}
                      </small>
                    </div>
                    <small>{new Date(h.started_at).toLocaleString()}</small>
                  </div>
                ))}
                {!history.length && (
                  <Empty title="No tracks in the logbook" text="Played music will be recorded here." />
                )}
              </div>
            </section>
          )}

          {tab === "lyrics" && (
            <section className="karaokeStage">
              <div className="karaokeBackdrop" />
              <span className="eyebrow">LIVE LYRICS · KARAOKE MODE</span>
              <h3>{track ? `${track.title} — ${track.author}` : "Nothing playing"}</h3>
              <div className="karaokeLines">
                {lines.length ? (
                  lines.slice(Math.max(0, lyricIndex - 2), lyricIndex + 4).map((l: any, offset: number) => {
                    const actual = Math.max(0, lyricIndex - 2) + offset;
                    return (
                      <p
                        key={`${l.time}-${actual}`}
                        className={
                          actual === lyricIndex ? "current" : actual < lyricIndex ? "past" : "future"
                        }
                      >
                        {l.text}
                      </p>
                    );
                  })
                ) : (
                  <Empty
                    title="Lyrics are still over the horizon"
                    text="Lyrics are unavailable for this track or the provider is temporarily unavailable."
                  />
                )}
              </div>
              <button
                disabled={!room?.state?.workerId}
                onClick={async () => {
                  const r = await api("/api/internal/music/lyrics/retry", { method: "POST", body: "{}" });
                  setNotice(
                    r.ok
                      ? "Lyrics retry requested; the provider may still be cooling down."
                      : "Lyrics could not be retried yet.",
                  );
                }}
              >
                Retry lyrics
              </button>
            </section>
          )}

          {tab === "profile" && (
            <>
              <section className="profileHero">
                <div className="profileCrest">☠</div>
                <div>
                  <span className="eyebrow">YOUR MUSIC PROFILE</span>
                  <h2>{userMetrics.minutes ?? 0} minutes aboard</h2>
                  <p>
                    {userMetrics.requests ?? 0} requests · {userMetrics.likes ?? 0} likes ·{" "}
                    {userMetrics.favorites ?? 0} favorites
                  </p>
                </div>
                <div className="profileStats">
                  <b>
                    {userMetrics.sessions ?? 0}
                    <small>sessions</small>
                  </b>
                  <b>
                    {achievements.length}
                    <small>achievements</small>
                  </b>
                </div>
              </section>
              <section className="panel profileSettings">
                <div className="panelHead">
                  <h3>Recommendation Profile</h3>
                  <span>tune how BOM learns your taste</span>
                </div>
                <div className="profileSettingsGrid">
                  <label>
                    Visibility
                    <select
                      value={profileDraft.displayMode}
                      onChange={(e) => setProfileDraft({ ...profileDraft, displayMode: e.target.value })}
                    >
                      <option>PUBLIC</option>
                      <option>PRIVATE</option>
                    </select>
                  </label>
                  <label>
                    Preferred mood
                    <select
                      value={profileDraft.preferredMood}
                      onChange={(e) => setProfileDraft({ ...profileDraft, preferredMood: e.target.value })}
                    >
                      <option value="">Automatic</option>
                      {[
                        "ENERGETIC",
                        "RELAXED",
                        "SAD",
                        "FOCUSED",
                        "PARTY",
                        "NOSTALGIC",
                        "CHILL",
                        "HEAVY",
                        "HAPPY",
                        "DARK",
                      ].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Discovery
                    <select
                      value={profileDraft.discoveryLevel}
                      onChange={(e) => setProfileDraft({ ...profileDraft, discoveryLevel: e.target.value })}
                    >
                      <option>FAMILIAR</option>
                      <option>BALANCED</option>
                      <option>ADVENTUROUS</option>
                    </select>
                  </label>
                  <label>
                    Favorite genres
                    <input
                      value={profileDraft.favoriteGenres}
                      onChange={(e) => setProfileDraft({ ...profileDraft, favoriteGenres: e.target.value })}
                      placeholder="rock, metal, synthwave"
                    />
                  </label>
                  <button className="goldButton" onClick={() => void saveProfile()}>
                    Save profile
                  </button>
                </div>
              </section>
              <section className="panelGrid">
                <div className="panel">
                  <div className="panelHead">
                    <h3>Top Artists</h3>
                    <span>your listening</span>
                  </div>
                  <div className="rankingList">
                    {userMetrics.topArtists?.map((x: any, i: number) => (
                      <div key={x.author}>
                        <b>{i + 1}</b>
                        <span>{x.author}</span>
                        <em>{x.plays} plays</em>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="panel">
                  <div className="panelHead">
                    <h3>Achievements</h3>
                    <span>configurable by admins</span>
                  </div>
                  <div className="achievementGrid">
                    {achievements.map((a: any) => (
                      <div key={a.code}>
                        <i>{a.icon}</i>
                        <b>{a.name}</b>
                        <small>{a.description}</small>
                      </div>
                    ))}
                    {!achievements.length && <p className="muted">Your first achievement is waiting.</p>}
                  </div>
                </div>
              </section>
              <section className="panel">
                <div className="panelHead">
                  <h3>Favorites</h3>
                  <span>your saved library</span>
                </div>
                <div className="albumCarousel compact">
                  {favorites.map((f: any) => (
                    <button
                      key={`${f.source_name}-${f.identifier}`}
                      onClick={() => void action("QUEUE", { query: `${f.author} ${f.title}` })}
                    >
                      {f.artwork_url ? (
                        <img src={f.artwork_url} alt="" />
                      ) : (
                        <div className="carouselArt">★</div>
                      )}
                      <b>{f.title}</b>
                      <small>{f.author}</small>
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}

          {tab === "audio" && (
            <section className="panel musicPanel">
              <div className="panelHead">
                <div>
                  <h3>Audio Studio</h3>
                  <span>{filters.length} filters · room memory · transition profiles</span>
                </div>
              </div>
              <div className="audioToolbar">
                <label>
                  Volume
                  <input
                    type="range"
                    min="0"
                    max="200"
                    defaultValue="100"
                    onChange={(e) => void action("VOLUME", { volume: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Transition
                  <select
                    value={room?.musicSettings?.transition_mode ?? features.transition_mode ?? "GAPLESS"}
                    onChange={(e) => roomSetting({ transitionMode: e.target.value })}
                  >
                    {["OFF", "GAPLESS", "FADE_2S", "FADE_5S", "SMOOTH_DJ", "RADIO"].map((x) => (
                      <option key={x}>{x.replaceAll("_", " ")}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="filterGrid richFilters">
                {filters.slice(0, 50).map((f: any) => (
                  <button
                    disabled={!room?.state?.workerId || !can("MANAGE_FILTERS")}
                    key={f.id}
                    onClick={() => void action("FILTER", { preset: f.id })}
                  >
                    <i>≋</i>
                    {f.id.replaceAll("_", " ")}
                  </button>
                ))}
              </div>
            </section>
          )}
        </main>
        <aside className="musicNowRail" aria-label="Now playing details">
          <div className="musicNowRailHead">
            <b>Up next</b>
            <button onClick={() => setTab("queue")}>Manage queue</button>
          </div>
          <div className="musicNextUp">
            <header>
              <b>Next in queue</b>
              <button onClick={() => setTab("queue")}>Open queue</button>
            </header>
            {room?.queue?.slice(0, 3).map((q: any, i: number) => (
              <div key={q.requestId ?? i}>
                <span>{q.trackInfo?.artworkUrl ? <img src={q.trackInfo.artworkUrl} alt="" /> : "♫"}</span>
                <div>
                  <b>{q.trackInfo?.title ?? q.display ?? q.query}</b>
                  <small>{q.trackInfo?.author ?? q.requester?.name ?? "Queued"}</small>
                </div>
              </div>
            ))}
            {!room?.queue?.length && <small className="muted">The queue is empty.</small>}
          </div>
        </aside>
      </div>
      {track && (
        <div className="compactPlayer spotifyPlayerBar" role="region" aria-label="Playback controls">
          <div className="compactArt">{track.artworkUrl ? <img src={track.artworkUrl} alt="" /> : "♫"}</div>
          <div className="compactTrackCopy">
            <b>{track.title}</b>
            <small>{track.author}</small>
          </div>
          <button className={isFavorite ? "selected" : ""} onClick={() => void favorite()}>
            ♡
          </button>
          <div className="compactProgress">
            <span
              style={{
                width: `${track.length ? Math.min(100, (displayPosition / track.length) * 100) : 0}%`,
              }}
            />
          </div>
          <button
            aria-label={isPlaying ? "Pause" : "Resume"}
            disabled={!can("MANAGE_MUSIC")}
            onClick={() => void action(room?.state?.status === "PAUSED" ? "RESUME" : "PAUSE")}
          >
            {room?.state?.status === "PAUSED" ? "▶" : "Ⅱ"}
          </button>
          <button
            aria-label="Skip track"
            disabled={!can("USE_MUSIC")}
            onClick={() => void action(can("FORCE_SKIP") ? "SKIP" : "VOTE_SKIP")}
          >
            ▶▶
          </button>
        </div>
      )}
    </div>
  );
}

const visualHeights = [
  18, 28, 44, 35, 58, 74, 52, 38, 63, 82, 68, 46, 31, 57, 76, 91, 70, 49, 36, 61, 84, 72, 53, 39, 66, 88, 79,
  58, 42, 69, 93, 81, 60, 45, 72, 86, 67, 50, 34, 59, 78, 64, 47, 30, 55, 73, 89, 71, 51, 37, 62, 83, 69, 48,
  33, 56, 75, 87, 65, 43, 29, 52, 70, 60, 41, 27, 49, 66, 54, 36, 24, 45, 61, 51, 34, 22, 40, 56, 47, 31, 20,
  37, 52, 44, 29, 18, 34, 48, 41, 27, 17, 31, 45, 38, 25, 16,
];

function DecorativeVisualizer({
  position,
  duration,
  accent,
  active,
  onSeek,
}: {
  position: number;
  duration: number;
  accent: string;
  active: boolean;
  onSeek?: (ms: number) => void;
}) {
  const progress = Math.max(0, Math.min(1, position / Math.max(1, duration)));
  return (
    <div
      className={active ? "decorativeWave active seekable" : "decorativeWave seekable"}
      title={onSeek ? "Click to seek" : "Decorative music visualizer"}
      onClick={(e) => {
        if (!onSeek) return;
        const r = e.currentTarget.getBoundingClientRect();
        onSeek(Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duration));
      }}
    >
      {visualHeights.map((h, i) => (
        <i
          key={i}
          style={{
            height: `${h}%`,
            background: i / visualHeights.length <= progress ? accent : "#454b56",
            animationDelay: `-${((i * 37) % 23) / 10}s`,
            animationDuration: `${1.05 + ((i * 17) % 9) / 10}s`,
          }}
        />
      ))}
      <span className="visualizerPlayhead" style={{ left: `${progress * 100}%` }} />
    </div>
  );
}
function MiniSpectrum({ active }: { active: boolean }) {
  return (
    <div className={active ? "liveVisualizer active" : "liveVisualizer"}>
      {Array.from({ length: 18 }, (_, i) => (
        <i
          key={i}
          style={{ animationDelay: `-${(i % 7) * 0.08}s`, animationDuration: `${0.7 + (i % 5) * 0.11}s` }}
        />
      ))}
    </div>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <small>{label}</small>
      <b>{value ?? "—"}</b>
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="pirateEmpty">
      <i>⚓</i>
      <b>{title}</b>
      <span>{text}</span>
    </div>
  );
}
