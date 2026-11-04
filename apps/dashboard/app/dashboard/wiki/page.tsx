import { internalFetch } from "@/lib/api";
import { redirect } from "next/navigation";
import WikiPortalDashboard from "@/components/WikiPortalDashboard";
async function get(path: string) {
  const r = await internalFetch(path);
  if (r.status === 401 || r.status === 403) redirect("/?auth=member");
  if (!r.ok) throw new Error(`Wiki request failed: ${path}`);
  return r.json();
}
export default async function WikiPage() {
  const [summary, portal, access] = await Promise.all([
    get("/v1/wiki/summary"),
    get("/v1/wiki/portal"),
    get("/v1/access"),
  ]);
  const admin = Boolean(access.dashboardAdmin);
  return <WikiPortalDashboard summary={summary} portal={portal} admin={admin} />;
}
