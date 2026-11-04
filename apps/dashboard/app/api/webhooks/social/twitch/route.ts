import { NextRequest } from "next/server";
export async function POST(req: NextRequest) {
  const base = process.env.INTERNAL_API_URL ?? "http://127.0.0.1:4100",
    qs = new URL(req.url).search,
    headers = new Headers({
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
      "content-type": "text/plain; charset=utf-8",
    });
  for (const k of [
    "twitch-eventsub-message-id",
    "twitch-eventsub-message-retry",
    "twitch-eventsub-message-signature",
    "twitch-eventsub-message-timestamp",
    "twitch-eventsub-message-type",
    "twitch-eventsub-subscription-type",
    "twitch-eventsub-subscription-version",
  ]) {
    const v = req.headers.get(k);
    if (v) headers.set(k, v);
  }
  const body = await req.text();
  const up = await fetch(`${base}/v1/webhooks/social/twitch${qs}`, {
    method: "POST",
    headers,
    body,
    cache: "no-store",
  });
  const h = new Headers(up.headers);
  h.delete("content-encoding");
  h.delete("content-length");
  return new Response(up.body, { status: up.status, headers: h });
}
