import { NextRequest } from "next/server";
async function proxy(req: NextRequest) {
  const base = process.env.INTERNAL_API_URL ?? "http://127.0.0.1:4100",
    qs = new URL(req.url).search,
    headers = new Headers({ "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "" });
  const sig256 = req.headers.get("x-hub-signature-256");
  const sig1 = req.headers.get("x-hub-signature");
  if (sig256) headers.set("x-hub-signature-256", sig256);
  if (sig1) headers.set("x-hub-signature", sig1);
  let body: BodyInit | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.text();
    headers.set("content-type", "text/plain; charset=utf-8");
  }
  const up = await fetch(`${base}/v1/webhooks/social/meta${qs}`, {
    method: req.method,
    headers,
    body,
    cache: "no-store",
  });
  const h = new Headers(up.headers);
  h.delete("content-encoding");
  h.delete("content-length");
  return new Response(up.body, { status: up.status, headers: h });
}
export const GET = proxy;
export const POST = proxy;
