// Search engines and the AdSense crawler may read the public wiki, never the member dashboard.
const publicHosts = () =>
  [
    process.env.PUBLIC_WIKI_HOST ?? "wiki.bandofmisfits.org",
    ...(process.env.PUBLIC_ROOT_HOSTS ?? "bandofmisfits.org,www.bandofmisfits.org").split(","),
  ]
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
export function GET(req: Request) {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const body =
    host.startsWith("wiki.") || publicHosts().includes(host)
      ? "User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /dashboard\n"
      : "User-agent: *\nAllow: /wiki\nAllow: /ads.txt\nDisallow: /\n";
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
