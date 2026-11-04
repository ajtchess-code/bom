import { internalFetch } from "@/lib/api";
import { redirect } from "next/navigation";
import AfterActionReports from "@/components/AfterActionReports";
export default async function ReportsPage() {
  const r = await internalFetch("/v1/wosb/pb-config");
  if (r.status === 401 || r.status === 403) redirect("/?auth=member");
  if (!r.ok) throw new Error("Report Access Unavailable");
  const cfg = await r.json();
  return <AfterActionReports manager={Boolean(cfg.manager && !cfg.pbOnly)} />;
}
