import { decodeSession } from "./session";

/** True when the request carries a dashboard session whose user has the dashboard admin role. */
export async function isDashboardAdmin(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";
  const token = /(?:^|;\s*)bom_session=([^;]+)/.exec(cookie)?.[1];
  const session = token ? await decodeSession(decodeURIComponent(token)) : null;
  if (!session) return null;
  const r = await fetch(`${process.env.INTERNAL_API_URL ?? "http://127.0.0.1:4100"}/v1/access`, {
    headers: { "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "", "x-discord-user-id": session.id },
    cache: "no-store",
  }).catch(() => null);
  if (!r?.ok) return null;
  const access = await r.json().catch(() => null);
  return access?.dashboardAdmin ? session : null;
}

/** Same-origin check for state-changing dashboard requests. */
export function sameOrigin(req: Request) {
  const expected = process.env.PUBLIC_DASHBOARD_URL ? new URL(process.env.PUBLIC_DASHBOARD_URL).origin : null;
  return !expected || req.headers.get("origin") === expected;
}
