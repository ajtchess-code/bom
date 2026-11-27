export const DESK_DESTINATIONS = [
  { value: "home", label: "Dashboard", path: "/dashboard" },
  { value: "battles", label: "Port Battles · Signups & Schedule", path: "/dashboard/port-battles" },
  { value: "prep", label: "Battle Prep", path: "/dashboard/battle-prep" },
  { value: "review", label: "Battle Review · VODs", path: "/dashboard/battle-review" },
  { value: "aar", label: "After Action Reports", path: "/dashboard/after-action-reports" },
  { value: "wiki", label: "Wiki", path: "/dashboard/wiki" },
  { value: "builder", label: "Build Library", path: "/dashboard/ship-builder" },
  { value: "ships", label: "Ships", path: "/dashboard/ships" },
  { value: "alliances", label: "Guilds & Alliances", path: "/dashboard/diplomacy" },
  { value: "map", label: "Battle Map", path: "/dashboard/map" },
  { value: "recruitment", label: "Applications & Recruitment", path: "/dashboard/recruitment" },
  { value: "feedback", label: "Feedback & Bug Reports", path: "/dashboard/feedback" },
];

export type PersonalRequestKind = "role" | "emoji" | "animated_emoji" | "sticker" | "soundboard";

const text = (content: string) => ({ type: 10, content });
const button = (id: string, label: string, style = 2) => ({ type: 2, style, custom_id: id, label });
const link = (url: string, label: string) => ({ type: 2, style: 5, url, label });
const row = (...components: any[]) => ({ type: 1, components });
const menu = (
  id: string,
  placeholder: string,
  options: { label: string; value: string }[],
  disabled = false,
) => row({ type: 3, custom_id: id, placeholder, min_values: 1, max_values: 1, disabled, options });
const container = (components: any[]) => ({ type: 17, accent_color: 0xd9aa3c, components });
const sep = () => ({ type: 14, divider: true, spacing: 1 });

/** Ephemeral Leave / Away interactive panel triggered by `/leave`. */
export function leaveCommandPayload(
  url: string,
  leaveEnabled: boolean,
  activeLeave?: { return_at: string; reason?: string | null } | null,
) {
  const base = url.replace(/\/$/, "");
  const statusLine = activeLeave
    ? `You are currently marked **[AFK]** until **<t:${Math.floor(new Date(activeLeave.return_at).getTime() / 1000)}:F>** (<t:${Math.floor(new Date(activeLeave.return_at).getTime() / 1000)}:R>).${activeLeave.reason ? `\n-# Reason: ${String(activeLeave.reason).slice(0, 180)}` : ""}`
    : "Set a return date, extend your leave, or mark yourself active.";

  return {
    flags: 32768 | 64,
    allowedMentions: { parse: [] },
    components: [
      container([
        text("## Leave / Away"),
        text(statusLine),
        menu(
          "membership:leave:choose",
          activeLeave ? "Extend or update your leave" : "Request leave of absence",
          [
            { label: "3 days", value: "3" },
            { label: "7 days", value: "7" },
            { label: "14 days", value: "14" },
            { label: "30 days", value: "30" },
            { label: "Choose a return date", value: "custom" },
          ],
          !leaveEnabled,
        ),
        row(
          { ...button("membership:leave:return", "I Have Returned (Mark as Active)", 3), disabled: !leaveEnabled },
          link(`${base}/dashboard/members/leave`, "Open Leave Dashboard"),
        ),
        sep(),
        menu("membership:leave:view", "View away information", [
          { label: "All away members", value: "all" },
          { label: "Returning in the next week", value: "week" },
          { label: "Overdue returns", value: "overdue" },
          { label: "My leave", value: "mine" },
        ]),
      ]),
    ],
  };
}

const PERSONAL_REQUEST_META: Record<
  PersonalRequestKind,
  { title: string; body: string; label: string; path: string }
> = {
  role: {
    title: "Custom Discord Role Request",
    body: "Request or update your personal Discord role. Use the quick Discord form below, or open the Dashboard Designer for live solid, gradient, holographic color and icon previews.",
    label: "Open Role Designer",
    path: "/dashboard/members?view=role",
  },
  emoji: {
    title: "Custom Static Emoji Request",
    body: "Upload a static PNG, JPEG, or WebP image (under 256 KiB) on the Dashboard to submit a custom server emoji for Admiralty approval.",
    label: "Upload Custom Emoji",
    path: "/dashboard/members?view=media&type=emoji",
  },
  animated_emoji: {
    title: "Custom Animated Emoji Request",
    body: "Upload an animated GIF (under 256 KiB) on the Dashboard to submit a custom animated emoji for Admiralty approval.",
    label: "Upload Animated Emoji",
    path: "/dashboard/members?view=media&type=animated_emoji",
  },
  sticker: {
    title: "Custom Sticker Request",
    body: "Upload a PNG or APNG sticker (up to 512 KiB, 320×320 recommended) on the Dashboard for Admiralty approval.",
    label: "Upload Custom Sticker",
    path: "/dashboard/members?view=media&type=sticker",
  },
  soundboard: {
    title: "Custom Soundboard Request",
    body: "Upload a short MP3 audio clip (under 512 KiB and 5 seconds max) on the Dashboard to submit a custom server soundboard sound for Admiralty approval.",
    label: "Upload Soundboard Clip",
    path: "/dashboard/members?view=media&type=soundboard",
  },
};

/** Ephemeral Personal Discord Request panel triggered by `/role-req`, `/emoji-req`, etc. */
export function personalRequestPayload(kind: PersonalRequestKind, url: string) {
  const base = url.replace(/\/$/, "");
  const meta = PERSONAL_REQUEST_META[kind];
  const actions =
    kind === "role"
      ? row(button("membership:role:request", "Quick Request Form", 1), link(`${base}${meta.path}`, meta.label))
      : row(link(`${base}${meta.path}`, meta.label));
  return {
    flags: 32768 | 64,
    allowedMentions: { parse: [] },
    components: [container([text(`## ${meta.title}`), text(meta.body), actions])],
  };
}

/** Persistent BOM Music surface posted in the bots channel directly below the WoSB Battle Map. */
export function musicDeskPayload(url: string) {
  const base = url.replace(/\/$/, "");
  return {
    flags: 32768,
    allowedMentions: { parse: [] },
    components: [
      container([
        text("## BOM Music"),
        text(
          "Join a voice channel, then drop any **song name**, **artist - track**, **playlist request**, or **music link** right in this channel — no command needed! Or use the controls below.",
        ),
        row(
          button("console:music:add", "Request Music", 3),
          button("console:music:queue", "View Queue"),
          link(`${base}/dashboard/music`, "Music Dashboard"),
        ),
        menu("console:music:menu", "Playback and music options", [
          { label: "Pause / resume", value: "pause" },
          { label: "Vote to skip", value: "skip" },
          { label: "Lyrics", value: "lyrics" },
          { label: "Audio filters", value: "filters" },
          { label: "Recommendations", value: "recommend" },
          { label: "Toggle autoplay", value: "autoplay" },
          { label: "Stop playback", value: "stop" },
        ]),
      ]),
    ],
  };
}

/** Persistent WoSB Battle Map & Diplomacy surface posted at the top of the bots channel. */
export function battleDiplomacyPayload(summary: string, mapFile: string, chartFile: string, url: string) {
  const base = url.replace(/\/$/, "");
  return {
    flags: 32768,
    allowedMentions: { parse: [] },
    components: [
      container([
        text("## WoSB Battle Map & Diplomacy"),
        text(summary),
        {
          type: 12,
          items: [
            { media: { url: "attachment://" + mapFile }, description: "WoSB Battle Map — remaining attack opportunities today" },
            { media: { url: "attachment://" + chartFile }, description: "WoSB Alliance Chart" },
          ],
        },
        row(
          button("membership:map:detail", "Detailed Battle Map"),
          button("membership:map:update", "Update Battle Map"),
          link(`${base}/dashboard/diplomacy`, "Guilds & Alliances"),
        ),
      ]),
    ],
  };
}
