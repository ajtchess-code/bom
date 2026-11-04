import { internalFetch } from "@/lib/api";
import { redirect } from "next/navigation";
import ShipsDashboard from "@/components/ShipsDashboard";
export default async function ShipsPage() {
  const r = await internalFetch("/v1/wosb/ships");
  if (r.status === 401 || r.status === 403) redirect("/?auth=member");
  if (!r.ok) throw new Error("Ships reference failed to load");
  return <ShipsDashboard ships={await r.json()} />;
}
