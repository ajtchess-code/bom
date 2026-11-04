import { internalFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import PortBattlesDashboard from "@/components/PortBattlesDashboard";
async function get(path: string) {
  const r = await internalFetch(path);
  if (r.status === 401 || r.status === 403) redirect("/?auth=member");
  if (!r.ok) throw new Error(`Port Battle request failed: ${path}`);
  return r.json();
}
export default async function PortBattlesPage({
  searchParams,
}: {
  searchParams: Promise<{ battle?: string }>;
}) {
  const requested = (await searchParams).battle;
  const [battles, map, catalogue, builds, access, pbAccess, prefs, session, pbConfig] = await Promise.all([
    get("/v1/wosb/port-battles"),
    get("/v1/wosb/map"),
    get("/v1/wosb/catalogue"),
    get("/v1/wosb/builds"),
    get("/v1/access"),
    get("/v1/wosb/pb-access"),
    get("/v1/wosb/pb-preferences"),
    getSession(),
    get("/v1/wosb/pb-config"),
  ]);
  if (requested && /^[0-9a-f-]{36}$/i.test(requested) && !battles.some((b: any) => b.id === requested)) {
    const r = await internalFetch("/v1/wosb/port-battles/" + requested);
    if (r.ok) {
      const detail = await r.json();
      if (detail.battle) battles.push(detail.battle);
    }
  }
  return (
    <PortBattlesDashboard
      mapData={map}
      initialBattles={battles ?? []}
      ports={map.ports ?? []}
      catalogue={catalogue}
      builds={builds ?? []}
      admin={Boolean(access.dashboardAdmin || pbAccess.manager)}
      admiralty={Boolean(access.dashboardAdmin)}
      signupAllowed={Boolean(pbAccess.signupAllowed)}
      viewer={{
        id: String(session?.id ?? ""),
        name: String(session?.globalName ?? session?.username ?? "Captain"),
      }}
      initialPreferences={prefs}
      initialConfig={pbConfig}
    />
  );
}
