import CommandHome from "@/components/CommandHome";
import { internalFetch } from "@/lib/api";
import Link from "next/link";
import CommandIcon from "@/components/CommandIcon";
import VoicePresenceCard from "@/components/VoicePresenceCard";

// Home answers one question first: "what needs me right now?"
// Everything else (shortcuts, music, voice) sits below it.
export default async function DashboardHome() {
  const [musicR, experienceR, meR, widgetR] = await Promise.all([
    internalFetch("/v1/music/summary"),
    internalFetch("/v1/feedback/experience"),
    internalFetch("/v1/platform/me"),
    internalFetch("/v1/platform/discord-widget"),
  ]);
  const music: any = musicR.ok ? await musicR.json() : { unavailable: true };
  const experience: any = experienceR.ok
    ? await experienceR.json()
    : { favorites: [], recents: [], notifications: [], unread: 0 };
  const me: any = meR.ok ? await meR.json() : null;
  const widget: any = widgetR.ok ? await widgetR.json() : { enabled: false, members: [], voiceChannels: [] };

  const name = me?.displayName ?? "Captain";
  const unread = (experience.notifications ?? []).filter((n: any) => !n.read).slice(0, 4);
  const favorites = (experience.favorites ?? []).filter((x: any) => x.href && x.href !== "/dashboard");
  const recents = (experience.recents ?? []).filter(
    (x: any) => x.href && x.href !== "/dashboard" && !favorites.some((f: any) => f.href === x.href),
  );
  const shortcuts = [...favorites, ...recents].slice(0, 8);
  const track = music.activeRoom?.state?.track;

  return (
    <div className="homeNow">
      <header className="homeNowHeader">
        <div>
          <span className="eyebrow">BAND OF MISFITS</span>
          <h1>
            Welcome back, <span className="goldPulseText">{name}</span>
          </h1>
          <p>{me?.rank ? `${me.rank} · ` : ""}Here's what needs you today.</p>
        </div>
        <Link className="secondaryAction" href="/dashboard/feedback?new=bug">
          <CommandIcon name="feedback" size={17} /> Report an issue
        </Link>
      </header>

      <CommandHome />

      {unread.length > 0 && (
        <article className="homeCard">
          <header>
            <h2>Unread notifications</h2>
            <span className="uiMuted">{experience.unread} unread</span>
          </header>
          <ul className="homeList">
            {unread.map((n: any) => (
              <li key={n.key}>
                <Link href={n.href ?? "/dashboard"}>
                  <b>{n.title ?? n.label ?? "Notification"}</b>
                  <small>{n.body ?? n.detail ?? ""}</small>
                </Link>
              </li>
            ))}
          </ul>
        </article>
      )}

      <article className="homeCard">
        <header>
          <h2>{favorites.length ? "Your shortcuts" : "Jump back in"}</h2>
        </header>
        {shortcuts.length ? (
          <nav className="homeShortcuts" aria-label="Shortcuts">
            {shortcuts.map((x: any) => (
              <Link key={`${x.kind}-${x.item_key}`} href={x.href}>
                {x.label}
                <CommandIcon name="arrow" size={13} />
              </Link>
            ))}
          </nav>
        ) : (
          <p className="homeQuiet">Pages you use, and pages you star, will show up here.</p>
        )}
      </article>

      <section className="homeSecondary">
        <article className="homeCard">
          <header>
            <h2>{track ? "Playing now" : "Music"}</h2>
            <Link href="/dashboard/music">Open music</Link>
          </header>
          {track ? (
            <div className="homeNowPlaying">
              <span>
                {track.artworkUrl ? (
                  <img src={track.artworkUrl} alt="" />
                ) : (
                  <CommandIcon name="music" size={28} />
                )}
              </span>
              <div>
                <b>{track.title}</b>
                <small>{track.author}</small>
              </div>
            </div>
          ) : (
            <p className="homeQuiet">
              {music.unavailable ? "Music is temporarily unavailable." : "Nothing is playing right now."}
            </p>
          )}
        </article>
        <VoicePresenceCard initial={widget} />
      </section>
    </div>
  );
}
