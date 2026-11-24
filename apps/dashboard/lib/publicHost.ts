/** Extract the client-facing hostname safely even behind multi-hop proxies. */
export function requestHost(headers: Headers) {
  const raw = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim().split(":")[0].toLowerCase();
  return /^[a-z0-9.-]+$/.test(raw) ? raw : "";
}
/** Configured public wiki host and main domain hosts. */
export function configuredPublicHosts() {
  const publicWikiHost = (process.env.PUBLIC_WIKI_HOST ?? "wiki.bandofmisfits.org").trim().toLowerCase();
  const rootHosts = (process.env.PUBLIC_ROOT_HOSTS ?? "bandofmisfits.org,www.bandofmisfits.org")
    .toLowerCase().split(",").map((h) => h.trim()).filter(Boolean);
  return { publicWikiHost, rootHosts, all: [publicWikiHost, ...rootHosts].filter(Boolean) };
}
/** wiki.bandofmisfits.org (or PUBLIC_WIKI_HOST) and the main domain (PUBLIC_ROOT_HOSTS) serve the public wiki at their root. */
export function isPublicWikiHost(headers: Headers) {
  const h = requestHost(headers);
  if (!h) return false;
  return configuredPublicHosts().all.includes(h);
}
