import { NextRequest } from "next/server";

// Read-only proxy for the public wiki. No login; the API only allows wiki read paths for these requests.
export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!path.length || path.some((part) => part === "" || part === "." || part === ".." || /[\\/]/.test(part)))
    return Response.json({ error: "invalid_path" }, { status: 400 });
  const base = process.env.INTERNAL_API_URL ?? "http://127.0.0.1:4100";
  const headers = new Headers({
    "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    "x-bom-public": "1",
  });
  const up = await fetch(`${base}/v1/${path.join("/")}${new URL(req.url).search}`, {
    headers,
    cache: "no-store",
  });
  const h = new Headers(up.headers);
  h.delete("content-encoding");
  h.delete("content-length");
  // Let Cloudflare and browsers cache public wiki data briefly.
  if (up.ok) h.set("cache-control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
  return new Response(up.body, { status: up.status, headers: h });
}
