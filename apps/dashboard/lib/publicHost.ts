/** wiki.bandofmisfits.org (or PUBLIC_WIKI_HOST) and the main domain (PUBLIC_ROOT_HOSTS) serve the public wiki at their root. */
export function isPublicWikiHost(headers: Headers) {
  const publicWikiHost = (process.env.PUBLIC_WIKI_HOST ?? "wiki.bandofmisfits.org").toLowerCase();
  const rootHosts = (process.env.PUBLIC_ROOT_HOSTS ?? "bandofmisfits.org,www.bandofmisfits.org")
    .toLowerCase().split(",").map((h) => h.trim()).filter(Boolean);
  const h = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(":")[0].toLowerCase();
  return h === publicWikiHost || h.startsWith("wiki.") || rootHosts.includes(h);
}
