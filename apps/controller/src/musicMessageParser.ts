export type ParsedMusicMessage = {
  query: string;
  isPlaylistRequest: boolean;
  source: "attachment" | "url" | "prefix" | "natural";
};

const MUSIC_URL_RE =
  /https?:\/\/(?:(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)|open\.spotify\.com|spotify\.link|music\.apple\.com|(?:www\.|m\.)?soundcloud\.com|on\.soundcloud\.com|(?:www\.)?deezer\.com|deezer\.page\.link|(?:listen\.)?tidal\.com|[\w.-]+\.(?:mp3|ogg|opus|wav|flac|m4a))\S*/i;

const AUDIO_EXT_RE = /\.(?:mp3|ogg|opus|wav|flac|m4a|aac|webm)(?:\?.*)?$/i;
const STREAM_URL_RE = /^https?:\/\/\S*(?:radio|stream|listen|live|\.m3u8?|\.pls)\S*$/i;
const NON_MUSIC_URL_RE =
  /^https?:\/\/(?:(?:ptb\.|canary\.|www\.)?discord(?:app)?\.com|discord\.gg|tenor\.com|giphy\.com|imgur\.com|i\.imgur\.com|gyazo\.com|(?:[\w-]+\.)?bandofmisfits\.org|github\.com)\b/i;

const PLAYLIST_URL_RE = /(?:[?&]list=|\/playlist\/|\/playlists\/|\/sets\/|\/album\/|\/albums\/)/i;
const PREFIX_RE = /^[!/]?(?:play|p|queue|q|add|song|track|music)\s+(.+)$/i;
const PLAYLIST_PREFIX_RE = /^[!/]?(?:play\s+)?(?:playlist|mix|album)\s+(.+)$/i;
const PLAYLIST_INTENT_RE = /\b(?:playlist|mix|soundtrack|album)\b/i;
const OTHER_BOT_COMMAND_RE = /^[!?./]\S+/;
const ONLY_EMOJI_OR_PUNCT_RE = /^(?:<a?:\w+:\d+>|[\s\p{P}\p{S}])+$/u;

export function parseMusicMessageRequest(input: {
  content: string;
  attachmentUrl?: string | null;
  attachmentContentType?: string | null;
  isBotsChannel: boolean;
  isVoiceTextChannel: boolean;
  mentionsBot?: boolean;
}): ParsedMusicMessage | null {
  if (!input.isBotsChannel && !input.isVoiceTextChannel) return null;

  const raw = String(input.content ?? "").trim();

  // 1. Direct audio file attachment
  if (input.attachmentUrl) {
    const ct = String(input.attachmentContentType ?? "").toLowerCase();
    if (ct.startsWith("audio/") || AUDIO_EXT_RE.test(input.attachmentUrl)) {
      return { query: input.attachmentUrl, isPlaylistRequest: false, source: "attachment" };
    }
  }

  if (!raw || raw.length > 500) return null;

  // 2. Recognized music/playlist link anywhere in the message
  const musicUrlMatch = raw.match(MUSIC_URL_RE);
  if (musicUrlMatch) {
    const url = musicUrlMatch[0].replace(/[)>.,!?;]+$/, "");
    return { query: url, isPlaylistRequest: PLAYLIST_URL_RE.test(url), source: "url" };
  }

  // Standalone audio/stream URL
  if (/^https?:\/\/\S+$/i.test(raw)) {
    if (NON_MUSIC_URL_RE.test(raw)) return null;
    if (AUDIO_EXT_RE.test(raw) || STREAM_URL_RE.test(raw)) {
      return { query: raw, isPlaylistRequest: false, source: "url" };
    }
    return null;
  }

  // 3. Explicit playlist prefix (e.g. "playlist christmas hits" or "play playlist sea shanties")
  const playlistPrefixed = PLAYLIST_PREFIX_RE.exec(raw)?.[1]?.trim();
  if (playlistPrefixed && playlistPrefixed.length >= 2) {
    return { query: playlistPrefixed, isPlaylistRequest: true, source: "prefix" };
  }

  // 4. Explicit play/queue prefix (works in both bots channel and voice channel chat)
  const prefixed = PREFIX_RE.exec(raw)?.[1]?.trim();
  if (prefixed && prefixed.length >= 2) {
    return {
      query: prefixed,
      isPlaylistRequest: PLAYLIST_INTENT_RE.test(prefixed),
      source: "prefix",
    };
  }

  // Voice-channel chat stays conservative so ordinary voice chatter isn't hijacked.
  if (!input.isBotsChannel) return null;

  // 5. Natural plain-text song or playlist request in the bots channel (no command needed!)
  if (input.mentionsBot) return null;
  if (OTHER_BOT_COMMAND_RE.test(raw)) return null;
  if (raw.length < 2 || ONLY_EMOJI_OR_PUNCT_RE.test(raw)) return null;
  // Ignore messages containing unrelated non-music links
  const anyUrl = raw.match(/https?:\/\/\S+/i);
  if (anyUrl && NON_MUSIC_URL_RE.test(anyUrl[0])) return null;

  return {
    query: raw,
    isPlaylistRequest: PLAYLIST_INTENT_RE.test(raw),
    source: "natural",
  };
}
