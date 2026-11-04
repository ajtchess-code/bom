import { forwardBody } from "@/lib/forwardBody";
import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const s = await getSession();
  if (!s) return Response.json({ error: "unauthenticated" }, { status: 401 });
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    const expected = process.env.PUBLIC_DASHBOARD_URL
      ? new URL(process.env.PUBLIC_DASHBOARD_URL).origin
      : null;
    if (expected && origin !== expected) return Response.json({ error: "invalid_origin" }, { status: 403 });
  }
  const { path } = await ctx.params;
  if (!path.length || path.some((part) => part === "" || part === "." || part === ".." || /[\\/]/.test(part)))
    return Response.json({ error: "invalid_path" }, { status: 400 });
  const qs = new URL(req.url).search;
  const base = process.env.INTERNAL_API_URL ?? "http://127.0.0.1:4100";
  const headers = new Headers();
  headers.set("x-internal-token", process.env.INTERNAL_API_TOKEN ?? "");
  headers.set("x-discord-user-id", s.id);
  const method = req.method;
  const rawBody = method === "GET" || method === "HEAD" ? undefined : await req.text();
  const { body, contentType } = forwardBody(method, req.headers.get("content-type"), rawBody);
  if (contentType) headers.set("content-type", contentType);
  const up = await fetch(`${base}/v1/${path.join("/")}${qs}`, { method, headers, body, cache: "no-store" });
  const h = new Headers(up.headers);
  h.delete("content-encoding");
  h.delete("content-length");
  if (up.status >= 400 && up.headers.get("content-type")?.includes("application/json")) {
    const data: any = await up
        .clone()
        .json()
        .catch(() => null),
      reference = data?.requestId ?? up.headers.get("x-request-id");
    if (data && typeof data === "object" && reference) {
      data.requestId = String(reference);
      const message = String(data.message ?? data.error ?? "Request failed");
      data.message = message.includes(String(reference)) ? message : message + " · Reference " + reference;
      return Response.json(data, { status: up.status, headers: h });
    }
  }
  return new Response(up.body, { status: up.status, headers: h });
}
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
