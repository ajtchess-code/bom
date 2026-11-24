import { NextRequest } from "next/server";
import { configuredPublicHosts } from "@/lib/publicHost";
export async function mapEditProxy(req: NextRequest, parts: string[] = []) {
  const method = req.method;
  const allowed =
    (method === "GET" && parts.length === 0) ||
    (method === "PUT" && parts.length === 2 && parts[0] === "ports" && /^[a-z0-9]+$/.test(parts[1])) ||
    (method === "POST" && parts.length === 1 && parts[0] === "close");
  if (!allowed) return Response.json({ error: "Map editing route unavailable" }, { status: 404 });
  const token = req.headers.get("x-map-edit-token") ?? "";
  if (!/^[a-f0-9]{64}$/.test(token))
    return Response.json({ error: "Invalid temporary link" }, { status: 401 });
  if (method !== "GET") {
    const origin = req.headers.get("origin") ?? "";
    const allowedOrigins = new Set<string>([
      new URL(process.env.PUBLIC_DASHBOARD_URL ?? req.url).origin,
      ...configuredPublicHosts().all.map((h) => `https://${h}`),
    ]);
    if (!allowedOrigins.has(origin))
      return Response.json({ error: "Invalid origin" }, { status: 403 });
  }
  const suffix = parts[0] === "ports" ? `ports/${parts[1]}` : parts[0] === "close" ? "edit/close" : "edit";
  const body = method === "PUT" ? await req.text() : undefined;
  const headers: Record<string, string> = {
    "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    "x-map-edit-token": token,
  };
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(
    `${process.env.INTERNAL_API_URL ?? "http://127.0.0.1:4100"}/v1/wosb/territory/${suffix}`,
    {
      method,
      headers,
      body,
      cache: "no-store",
    },
  );
  return new Response(response.body, {
    status: response.status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
}
