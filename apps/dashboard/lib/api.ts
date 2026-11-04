import { getSession } from "./session";
export async function internalFetch(path: string, init: RequestInit = {}) {
  const session = await getSession();
  if (!session) throw new Error("Unauthenticated");
  const base = process.env.INTERNAL_API_URL ?? "http://127.0.0.1:4100";
  const headers = new Headers(init.headers);
  headers.set("x-internal-token", process.env.INTERNAL_API_TOKEN ?? "");
  headers.set("x-discord-user-id", session.id);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return fetch(`${base}${path}`, { ...init, headers, cache: "no-store" });
}
