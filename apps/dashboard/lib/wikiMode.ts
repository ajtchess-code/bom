// Whether the wiki is running publicly (no login) or inside the member dashboard.
// Only updated in the browser so SSR never mutates process-global state across concurrent requests.
export const wikiMode = { public: false };
export const setPublicWiki = (value: boolean) => {
  if (typeof window !== "undefined") wikiMode.public = value;
};
const isWikiRootHost = () =>
  typeof window !== "undefined" &&
  (window.location.hostname.startsWith("wiki.") || /^(?:www\.)?bandofmisfits\.org$/i.test(window.location.hostname));
/** Base for API calls: the read-only public proxy, or the member proxy. */
export const apiRoot = (isPublic = wikiMode.public) => (isPublic ? "/api/public" : "/api/internal");
/** Where wiki links point: the public site root, /wiki on the dashboard host, or the member wiki. */
export function wikiHref(query = "", isPublic = wikiMode.public) {
  const qs = query ? (query.startsWith("?") ? query : `?${query}`) : "";
  if (!isPublic) return `/dashboard/wiki${qs}`;
  return `${isWikiRootHost() ? "/" : "/wiki"}${qs}`;
}
export const prepHref = (isPublic = wikiMode.public) =>
  isPublic
    ? isWikiRootHost()
      ? "/prep"
      : "/wiki/prep"
    : "/dashboard/battle-prep";
