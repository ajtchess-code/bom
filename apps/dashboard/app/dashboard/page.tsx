import CommandHome from "@/components/CommandHome";
import { internalFetch } from "@/lib/api";
import Link from "next/link";
import CommandIcon from "@/components/CommandIcon";
import VoicePresenceCard from "@/components/VoicePresenceCard";

// Home answers one question first: "what needs me right now?"
// Everything else (shortcuts, music, voice) sits below it.
export default async function DashboardHome() {
  const [musicR, experienceR, meR, widgetR, santaR] = await Promise.all([
    internalFetch("/v1/music/summary"),
    internalFetch("/v1/feedback/experience"),
    internalFetch("/v1/platform/me"),
    internalFetch("/v1/platform/discord-widget"),
    internalFetch("/v1/secret-santa/current"),
  ]);
  const music: any = musicR.ok ? await musicR.json() : { unavailable: true };
  const experience: any = experienceR.ok
    ? await experienceR.json()
    : { favorites: [], recents: [], notifications: [], unread: 0 };
  const me: any = meR.ok ? await meR.json() : null;
  const widget: any = widgetR.ok ? await widgetR.json() : { enabled: false, members: [], voiceChannels: [] };
  const santa: any = santaR.ok ? await santaR.json() : null;

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
          <span className="eyebrow">BAND OF MISFITS · CHRISTMAS</span>
          <h1>
            Merry Christmas, <span className="goldPulseText">{name}</span>
          </h1>
          <p>{me?.rank ? `${me.rank} · ` : ""}Here's what needs you today.</p>
        </div>
        <div className="uiRow">
          <Link className="primaryAction" href="/dashboard/secret-santa">
            <CommandIcon name="gift" size={16} /> Secret Santa
          </Link>
          <Link className="secondaryAction" href="/dashboard/feedback?new=bug">
            <CommandIcon name="feedback" size={17} /> Report an issue
          </Link>
        </div>
      </header>

      {santa?.event && (
        <article className="homeCard xmasSpotlight">
          <div className="xmasSpotlightBody">
            <img
              className="xmasSpotlightAvatar"
              src="/branding/christmas/jolly-misfit-avatar.png"
              alt="Jolly Misfit"
              width={54}
              height={54}
            />
            <div>
              <span className="eyebrow">SECRET SANTA · {String(santa.event.status).replace("_", " ")}</span>
              <h2>{santa.event.title}</h2>
              <p className="homeQuiet">
                {santa.match
                  ? `You're matched with ${santa.match.displayName}! View their wishlist and mark your gift sent.`
                  : santa.participant
                    ? `You're signed up with ${santa.event.participantCount} Misfits. You can update your wishlist any time.`
                    : santa.eligible
                      ? `${santa.event.participantCount} Misfits have joined. Add your wishlist before signups close!`
                      : `${santa.event.participantCount} Misfits signed up — open Secret Santa for details and required roles.`}
              </p>
            </div>
            <Link className="primaryAction" href="/dashboard/secret-santa">
              {santa.match ? "View My Match" : santa.participant ? "Edit Wishlist" : "Open Secret Santa"} →
            </Link>
          </div>
        </article>
      )}

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

      <section className="homeSecondary">
        <article className="homeCard">
          <header>
            <h2>Guild Services & Donations</h2>
            <Link href="/dashboard/guild-ledger">Treasury</Link>
          </header>
          <p className="homeQuiet">
            Fort donations, captain profile, leave of absence, and personal Discord requests.
          </p>
          <nav className="homeShortcuts" aria-label="Guild Services">
            <Link href="/dashboard/guild-ledger?new=donation">
              Submit Donation <CommandIcon name="arrow" size={13} />
            </Link>
            <Link href="/dashboard/guild-ledger">
              Donations & Treasury <CommandIcon name="arrow" size={13} />
            </Link>
            <Link href="/dashboard/members?view=profile">
              My Profile & Ships <CommandIcon name="arrow" size={13} />
            </Link>
            <Link href="/dashboard/members">
              Guild Roster <CommandIcon name="arrow" size={13} />
            </Link>
            <Link href="/dashboard/port-battles">
              Preferred Ships <CommandIcon name="arrow" size={13} />
            </Link>
            <Link href="/dashboard/members/leave">
              Leave of Absence <CommandIcon name="arrow" size={13} />
            </Link>
            <Link href="/dashboard/members?view=role">
              Custom Role <CommandIcon name="arrow" size={13} />
            </Link>
            <Link href="/dashboard/members?view=media">
              Emoji / Sticker / Soundboard <CommandIcon name="arrow" size={13} />
            </Link>
            <Link href="/dashboard/diplomacy">
              Guilds & Alliances <CommandIcon name="arrow" size={13} />
            </Link>
          </nav>
        </article>

        <article className="homeCard">
          <header>
            <h2>Guild Tools</h2>
            <Link href="/dashboard/wiki">WoSB Wiki</Link>
          </header>
          <p className="homeQuiet">
            Battle planning, fleet references, maps, and member tools.
          </p>
          <nav className="homeShortcuts" aria-label="Guild Tools">
            <Link href="/dashboard/port-battles">
              Port Battles <CommandIcon name="arrow" size={13} />
            </Link>
            <Link href="/dashboard/battle-prep">
              Battle Prep <CommandIcon name="arrow" size={13} />
            </Link>
            <Link href="/dashboard/battle-review">
              Battle Review · VODs <CommandIcon name="arrow" size={13} />
            </Link>
            <Link href="/dashboard/after-action-reports">
              After Action Reports <CommandIcon name="arrow" size={13} />
            </Link>
            <Link href="/dashboard/wiki">
              Wiki <CommandIcon name="arrow" size={13} />
            </Link>
            <Link href="/dashboard/ship-builder">
              Build Library <CommandIcon name="arrow" size={13} />
            </Link>
            <Link href="/dashboard/ships">
              Ships <CommandIcon name="arrow" size={13} />
            </Link>
            <Link href="/dashboard/map">
              Battle Map <CommandIcon name="arrow" size={13} />
            </Link>
            <Link href="/dashboard/casino">
              The ßǾM Casino <CommandIcon name="arrow" size={13} />
            </Link>
            <Link href="/dashboard/recruitment">
              Recruitment <CommandIcon name="arrow" size={13} />
            </Link>
            <Link href="/dashboard/feedback">
              Feedback & Bugs <CommandIcon name="arrow" size={13} />
            </Link>
          </nav>
        </article>
      </section>

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
