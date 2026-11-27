export type ResolverSettings = {
  searchChain: string[];
  maxCandidates: number;
  rejectVariants: boolean;
  fallbackOnFailure: boolean;
  preferredSource: string | null;
};

export type ResolvedTrack = {
  selected: any;
  remainder: any[];
  fallbacks: any[];
  resolution: {
    strategy: string;
    score: number;
    provider: string;
    attempts: number;
    matchedQuery: string;
    fallbackProviders: string[];
  };
};

const variantTerms = [
  "live",
  "remix",
  "sped up",
  "sped-up",
  "slowed",
  "nightcore",
  "cover",
  "karaoke",
  "instrumental",
  "extended",
  "bass boosted",
  "1 hour",
  "10 hour",
  "loop",
  "lyric video",
  "reaction",
  "8d audio",
  "reverb",
  "tiktok",
  "earrape",
  "chipmunk",
  "shorts",
];

const RESOLVE_CACHE_TTL_MS = 5 * 60_000;
const RESOLVE_CACHE_MAX = 250;
const PROVIDER_TIMEOUT_MS = 4500;
const resolveCache = new Map<string, { expiresAt: number; result: ResolvedTrack }>();

function clean(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}
function tokens(s: string) {
  return new Set(clean(s).split(/\s+/).filter(Boolean));
}
function overlap(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / Math.max(a.size, b.size);
}
function info(t: any) {
  return t?.info ?? {};
}
function providerOf(t: any) {
  return String(info(t).sourceName ?? "unknown").toLowerCase();
}
function dedupeKey(t: any) {
  const i = info(t);
  return `${clean(String(i.author ?? ""))}|${clean(String(i.title ?? ""))}`;
}

function scoreTrack(t: any, query: string, preferredSource: string | null, rejectVariants: boolean) {
  const i = info(t);
  const q = clean(query);
  const title = clean(String(i.title ?? ""));
  const author = clean(String(i.author ?? ""));
  const qt = tokens(q);
  const tt = tokens(`${title} ${author}`);
  let score = overlap(qt, tt) * 70;
  if (title && q.includes(title)) score += 18;
  if (author && q.includes(author)) score += 12;
  if (preferredSource && providerOf(t).includes(preferredSource.toLowerCase())) score += 6;
  for (const term of variantTerms) {
    if ((title.includes(term) || author.includes(term)) && !q.includes(term)) {
      score -= rejectVariants ? 26 : 8;
    }
  }
  const length = Number(i.length ?? 0);
  if (length > 60 * 60 * 1000 && !/hour|mix|set|playlist/.test(q)) score -= 18;
  if (length > 0 && length < 35_000 && !/intro|interlude|skit|short/.test(q)) score -= 24;
  if (i.isStream) score -= 8;
  // Prefer full-length YouTube/YouTube Music Opus audio over SoundCloud MP3 / 30s Go+ previews.
  const provider = providerOf(t);
  if (provider.includes("youtube")) score += 8;
  else if (provider.includes("soundcloud")) {
    score -= 10;
    if (length >= 29_000 && length <= 31_000) score -= 60;
  }
  return Math.round(score * 100) / 100;
}

function tracksFromResult(result: any): any[] {
  if (!result) return [];
  if (result.loadType === "track") return result.data ? [result.data] : [];
  if (result.loadType === "search") return Array.isArray(result.data) ? result.data : [];
  if (result.loadType === "playlist") return result.data?.tracks ?? [];
  return [];
}

function isDirect(q: string) {
  if (/^playlist:/i.test(q)) return false;
  return /^https?:\/\//i.test(q) || /^[a-z]+(?:search|rec):/i.test(q);
}

async function resolveWithTimeout(node: any, identifier: string, timeoutMs = PROVIDER_TIMEOUT_MS): Promise<any> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      node.rest.resolve(identifier),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Lavalink resolve timed out (${timeoutMs}ms)`)), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function cacheGet(key: string): ResolvedTrack | null {
  const hit = resolveCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    resolveCache.delete(key);
    return null;
  }
  return {
    ...hit.result,
    remainder: [...hit.result.remainder],
    fallbacks: [...hit.result.fallbacks],
  };
}

function cacheSet(key: string, result: ResolvedTrack) {
  if (resolveCache.size >= RESOLVE_CACHE_MAX) {
    const oldest = resolveCache.keys().next().value;
    if (oldest) resolveCache.delete(oldest);
  }
  resolveCache.set(key, {
    expiresAt: Date.now() + RESOLVE_CACHE_TTL_MS,
    result: {
      ...result,
      remainder: [...result.remainder],
      fallbacks: [...result.fallbacks],
    },
  });
}

export function resolverSettingsFromEnv(): ResolverSettings {
  const chain = (process.env.LAVALINK_SEARCH_CHAIN ?? "ytmsearch:,ytsearch:,scsearch:")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return {
    searchChain: chain.length ? chain : ["ytmsearch:", "ytsearch:"],
    maxCandidates: Math.max(2, Math.min(25, Number(process.env.RESOLVER_MAX_CANDIDATES ?? 10))),
    rejectVariants: (process.env.RESOLVER_REJECT_VARIANTS ?? "true").toLowerCase() !== "false",
    fallbackOnFailure: (process.env.RESOLVER_FALLBACK_ON_FAILURE ?? "true").toLowerCase() !== "false",
    preferredSource: (process.env.RESOLVER_PREFERRED_SOURCE ?? "").trim() || null,
  };
}

export function resolverSettingsFromRow(row: any, base = resolverSettingsFromEnv()): ResolverSettings {
  const parseList = (v: any, fallback: string[]) => {
    if (Array.isArray(v)) return v.map(String);
    if (typeof v === "string") {
      try {
        const x = JSON.parse(v);
        if (Array.isArray(x)) return x.map(String);
      } catch {}
    }
    return fallback;
  };
  return {
    searchChain: parseList(row?.search_chain, base.searchChain),
    maxCandidates: Math.max(2, Math.min(25, Number(row?.max_candidates ?? base.maxCandidates))),
    rejectVariants: row?.reject_variants === undefined ? base.rejectVariants : Boolean(row.reject_variants),
    fallbackOnFailure:
      row?.fallback_on_failure === undefined ? base.fallbackOnFailure : Boolean(row.fallback_on_failure),
    preferredSource: String(row?.preferred_source ?? base.preferredSource ?? "").trim() || null,
  };
}

export async function resolveSmart(
  node: any,
  query: string,
  settings = resolverSettingsFromEnv(),
): Promise<ResolvedTrack> {
  // 1. Direct URL or explicit Lavalink source prefix
  if (isDirect(query)) {
    const result = await resolveWithTimeout(node, query, 12_000);
    const tracks = tracksFromResult(result);
    if (!tracks.length) throw new Error("No playable track matched the request");
    const isPlaylist = result?.loadType === "playlist";
    const directFallbacks =
      settings.fallbackOnFailure && !isPlaylist ? tracks.slice(1, Math.min(settings.maxCandidates, 6)) : [];
    return {
      selected: tracks[0],
      remainder: isPlaylist ? tracks.slice(1, 250) : [],
      fallbacks: directFallbacks,
      resolution: {
        strategy: isPlaylist ? "direct-playlist" : "direct",
        score: 100,
        provider: providerOf(tracks[0]),
        attempts: 1,
        matchedQuery: query,
        fallbackProviders: directFallbacks.map(providerOf),
      },
    };
  }

  // 2. Natural-language playlist request (e.g. "playlist:christmas classics")
  const textPlaylistMatch = /^playlist:(.+)$/i.exec(query);
  if (textPlaylistMatch) {
    const playlistQuery = textPlaylistMatch[1].trim();
    const cacheKey = `pl:${clean(playlistQuery)}:${settings.searchChain.join(",")}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    const prefixes = settings.searchChain.slice(0, 2);
    const attempts = await Promise.all(
      prefixes.map(async (prefix) => {
        try {
          const result = await resolveWithTimeout(node, `${prefix}${playlistQuery}`);
          return { prefix, tracks: tracksFromResult(result) };
        } catch {
          return { prefix, tracks: [] as any[] };
        }
      }),
    );

    const seen = new Set<string>();
    const picked: any[] = [];
    for (const a of attempts) {
      for (const t of a.tracks) {
        const len = Number(info(t).length ?? 0);
        if (len > 0 && len < 45_000) continue; // skip shorts/clips
        const key = dedupeKey(t);
        if (seen.has(key)) continue;
        seen.add(key);
        picked.push(t);
        if (picked.length >= 15) break;
      }
      if (picked.length >= 15) break;
    }
    if (!picked.length) throw new Error("No playable playlist tracks matched the request");
    const resolved: ResolvedTrack = {
      selected: picked[0],
      remainder: picked.slice(1),
      fallbacks: picked.slice(1, 4),
      resolution: {
        strategy: "text-playlist",
        score: 90,
        provider: providerOf(picked[0]),
        attempts: attempts.length,
        matchedQuery: `${prefixes[0] ?? "ytmsearch:"}${playlistQuery}`,
        fallbackProviders: picked.slice(1, 4).map(providerOf),
      },
    };
    cacheSet(cacheKey, resolved);
    return resolved;
  }

  // 3. Cached text search lookup
  const cacheKey = `q:${clean(query)}:${settings.searchChain.join(",")}:${settings.rejectVariants ? 1 : 0}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  // 4. Two-stage fast search: try primary source (ytmsearch:) first for studio Opus audio & low latency.
  const primaryPrefix = settings.searchChain[0] ?? "ytmsearch:";
  const secondaryPrefixes = settings.searchChain.slice(1);
  let attemptsCount = 1;
  let primaryTracks: any[] = [];
  try {
    const primaryRes = await resolveWithTimeout(node, `${primaryPrefix}${query}`);
    primaryTracks = tracksFromResult(primaryRes);
  } catch {
    primaryTracks = [];
  }

  let ranked = primaryTracks
    .slice(0, settings.maxCandidates)
    .map((t) => ({
      track: t,
      prefix: primaryPrefix,
      score: scoreTrack(t, query, settings.preferredSource, settings.rejectVariants),
    }))
    .sort((a, b) => b.score - a.score);

  // Only fan out to fallback providers (ytsearch, scsearch) if primary missed or had a low-confidence match.
  if ((!ranked.length || ranked[0].score < 65) && secondaryPrefixes.length) {
    const rest = await Promise.all(
      secondaryPrefixes.map(async (prefix) => {
        try {
          const result = await resolveWithTimeout(node, `${prefix}${query}`);
          return { prefix, tracks: tracksFromResult(result) };
        } catch {
          return { prefix, tracks: [] as any[] };
        }
      }),
    );
    attemptsCount += rest.length;
    ranked = [
      ...ranked,
      ...rest.flatMap((a) =>
        a.tracks.slice(0, settings.maxCandidates).map((t) => ({
          track: t,
          prefix: a.prefix,
          score: scoreTrack(t, query, settings.preferredSource, settings.rejectVariants),
        })),
      ),
    ].sort((a, b) => b.score - a.score);
  }

  if (!ranked.length) throw new Error("No playable track matched the request across configured sources");

  const best = ranked[0];
  const unique: any[] = [];
  const bestInfo = info(best.track);
  const seen = new Set<string>([`${bestInfo.sourceName}:${bestInfo.identifier}`]);
  if (settings.fallbackOnFailure) {
    for (const r of ranked.slice(1)) {
      const i = info(r.track);
      const k = `${i.sourceName}:${i.identifier}`;
      if (seen.has(k)) continue;
      seen.add(k);
      unique.push(r.track);
      if (unique.length >= 5) break;
    }
  }

  const resolved: ResolvedTrack = {
    selected: best.track,
    remainder: [],
    fallbacks: unique,
    resolution: {
      strategy: "scored-multisource",
      score: best.score,
      provider: providerOf(best.track),
      attempts: attemptsCount,
      matchedQuery: `${best.prefix}${query}`,
      fallbackProviders: unique.map(providerOf),
    },
  };
  cacheSet(cacheKey, resolved);
  return resolved;
}
