import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const base = process.env.INTERNAL_API_URL ?? "http://127.0.0.1:4100";
  const upstream = await fetch(`${base}/v1/music/events`, {
    method: "GET",
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
      "x-discord-user-id": session.id,
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
    },
    cache: "no-store",
    signal: req.signal,
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return new Response(text || "Music event stream unavailable", {
      status: upstream.status || 502,
      headers: { "Cache-Control": "no-store" },
    });
  }

  // Keep SSE semantics explicit at the public Next.js boundary. The stream is
  // passed through byte-for-byte and is never buffered, transformed, or cached.
  const headers = new Headers({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-store, no-transform, must-revalidate",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "Content-Encoding": "identity",
  });

  return new Response(upstream.body, { status: 200, headers });
}
