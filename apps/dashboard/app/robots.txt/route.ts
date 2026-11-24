// Search engines and the AdSense crawler may read the public wiki, never the member dashboard.
import { configuredPublicHosts, requestHost } from "@/lib/publicHost";
// When the wiki has moved to its own domain (PUBLIC_WIKI_REDIRECT), its sitemap lives there.
const wikiMoved = (process.env.PUBLIC_WIKI_REDIRECT ?? "").trim() !== "";
export function GET(req: Request) {
  const host = requestHost(req.headers);
  const allowed = configuredPublicHosts().all;
  const body =
    host && allowed.includes(host)
      ? `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /dashboard\nDisallow: /pack/\n\n# AdSense may read every public page\nUser-agent: Mediapartners-Google\nAllow: /\n${wikiMoved ? "" : `\nSitemap: https://${host}/sitemap.xml\n`}`
      : "User-agent: *\nAllow: /wiki\nAllow: /ads.txt\nDisallow: /\n";
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", vary: "Host, X-Forwarded-Host" } });
}
