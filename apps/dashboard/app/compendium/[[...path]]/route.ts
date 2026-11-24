// Serves the active WoSB Wiki release. On the public wiki hosts the proxy maps every
// path here, so the Compendium lives at the site root; elsewhere it is under /compendium/.
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { CHROME_CSS, activeRelease, decorate, safeJoin, typeFor } from "@/lib/compendium";
import { isPublicWikiHost } from "@/lib/publicHost";
import { publicSettings } from "@/lib/publicApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function serve(req: Request, parts: string[], head: boolean) {
  const home = isPublicWikiHost(req.headers) ? "/" : "/compendium/";
  if (parts.length === 1 && parts[0] === "compendium-chrome.css")
    return new Response(head ? null : CHROME_CSS, { headers: { "content-type": "text/css; charset=utf-8", "cache-control": "public, max-age=3600" } });
  const active = await activeRelease();
  if (!active) return Response.redirect(new URL("/wiki", req.url), 302);
  let file = safeJoin(active.directory, parts.length ? parts : ["index.html"]);
  if (!file) return new Response("Not found", { status: 404 });
  let info = await stat(file).catch(() => null);
  let wasDirectory = false;
  if (info?.isDirectory()) {
    wasDirectory = true;
    file = join(file, "index.html");
    info = await stat(file).catch(() => null);
  }
  if (!info?.isFile()) {
    const page = await readFile(join(active.directory, "index.html"), "utf8").catch(() => "");
    let missing = page
      .replace(/<meta name="robots" content="index/i, '<meta name="robots" content="noindex')
      .replace(/<main[\s\S]*?<\/main>/i, () => '<main><h1>Page not found</h1><p>That page isn\'t in the Compendium. Try the search box or the <a href="' + home + '">main page</a>.</p></main>');
    if (!/<meta name="robots" content="noindex/i.test(missing)) {
      missing = missing.includes("</head>")
        ? missing.replace("</head>", () => '<meta name="robots" content="noindex,nofollow"></head>')
        : '<meta name="robots" content="noindex,nofollow">' + missing;
    }
    return new Response(head ? null : decorate(missing, publicSettings(), home), { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  }
  const type = typeFor(file);
  const etag = `"${active.release}-${info.size}-${Math.floor(info.mtimeMs)}-${home === "/" ? "r" : "c"}"`;
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { etag, vary: "Host, X-Forwarded-Host" } });
  const headers: Record<string, string> = {
    "content-type": type,
    etag,
    vary: "Host, X-Forwarded-Host",
    "x-content-type-options": "nosniff",
    "cache-control": type.startsWith("text/html") ? "public, max-age=60" : "public, max-age=3600",
  };
  if (head) return new Response(null, { headers: type.startsWith("text/html") ? headers : { ...headers, "content-length": String(info.size) } });
  if (type.startsWith("text/html")) {
    const rel = file.slice(active.directory.length + 1).split(/[\\/]/);
    const dirHref = home + rel.slice(0, -1).map(encodeURIComponent).join("/") + (rel.length > 1 ? "/" : "");
    const base = home === "/" ? (wasDirectory && parts.length > 0 ? dirHref : "") : dirHref;
    const reqUrl = new URL(req.url);
    const publicPath = home === "/" ? reqUrl.pathname.replace(/^\/compendium(?=\/|$)/, "") || "/" : reqUrl.pathname;
    const publicUrl = `${reqUrl.origin}${publicPath}${reqUrl.search}`;
    const html = decorate(await readFile(file, "utf8"), publicSettings(), home, publicUrl, base);
    return new Response(html, { headers });
  }
  return new Response(new Uint8Array(await readFile(file)), { headers });
}

type Ctx = { params: Promise<{ path?: string[] }> };
export async function GET(req: Request, ctx: Ctx) {
  return serve(req, (await ctx.params).path ?? [], false);
}
export async function HEAD(req: Request, ctx: Ctx) {
  return serve(req, (await ctx.params).path ?? [], true);
}
