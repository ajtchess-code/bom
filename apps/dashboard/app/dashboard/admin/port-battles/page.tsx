import { internalFetch } from "@/lib/api";
import { redirect } from "next/navigation";
import PortBattleAdmin from "@/components/PortBattleAdmin";
export default async function PortBattleAdminPage() {
  const [configR, catalogueR] = await Promise.all([
    internalFetch("/v1/wosb/pb-config"),
    internalFetch("/v1/wosb/catalogue"),
  ]);
  if (configR.status === 401) redirect("/");
  if (configR.status === 403) redirect("/dashboard");
  if (!configR.ok || !catalogueR.ok) throw new Error("Failed to load Port Battle configuration");
  const config: any = await configR.json();
  if (!config.manager) redirect("/dashboard/port-battles");
  return <PortBattleAdmin initial={config} catalogue={await catalogueR.json()} />;
}
