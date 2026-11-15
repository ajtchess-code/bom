// Search engines may index the public wiki, never the member dashboard.
export function GET(req: Request) {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(":")[0];
  const body = host.startsWith("wiki.")
    ? "User-agent: *\nAllow: /\nDisallow: /api/\n"
    : "User-agent: *\nAllow: /wiki\nDisallow: /\n";
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
