// Whether the wiki is running publicly (no login) or inside the member dashboard.
// Set by the page that renders the wiki, before any data is fetched.
export const wikiMode = { public: false };
export const setPublicWiki = (value: boolean) => {
  wikiMode.public = value;
};
/** Base for API calls: the read-only public proxy, or the member proxy. */
export const apiRoot = () => (wikiMode.public ? "/api/public" : "/api/internal");
/** Where wiki links point: the public site root, /wiki on the dashboard host, or the member wiki. */
export function wikiHref(query = "") {
  const qs = query ? (query.startsWith("?") ? query : `?${query}`) : "";
  if (!wikiMode.public) return `/dashboard/wiki${qs}`;
  const onWikiHost = typeof window !== "undefined" && window.location.hostname.startsWith("wiki.");
  return `${onWikiHost ? "/" : "/wiki"}${qs}`;
}
export const prepHref = () =>
  wikiMode.public
    ? typeof window !== "undefined" && window.location.hostname.startsWith("wiki.")
      ? "/prep"
      : "/wiki/prep"
    : "/dashboard/battle-prep";
