import { internalFetch } from "@/lib/api";
import { redirect } from "next/navigation";
import MembershipDashboard from "@/components/MembershipDashboard";

export default async function MembersPage() {
  const [summaryRes, rosterRes, catRes, requestsRes, accessRes] = await Promise.all([
    internalFetch("/v1/membership/summary"),
    internalFetch("/v1/membership/roster"),
    internalFetch("/v1/wosb/catalogue"),
    internalFetch("/v1/membership/custom-roles"),
    internalFetch("/v1/access"),
  ]);
  if (summaryRes.status === 401 || summaryRes.status === 403) redirect("/?auth=member");
  if (!summaryRes.ok) throw new Error("Failed to load membership profile");
  const access = accessRes.ok ? await accessRes.json() : {};
  const settingsRes = access.dashboardAdmin ? await internalFetch("/v1/membership/settings") : null;
  const [summary, roster, catalogue, settings, requests] = await Promise.all([
    summaryRes.json(),
    rosterRes.ok ? rosterRes.json() : Promise.resolve({ members: [], total: 0, incomplete: 0 }),
    catRes.ok ? catRes.json() : Promise.resolve({ ships: [] }),
    settingsRes?.ok ? settingsRes.json() : Promise.resolve(null),
    requestsRes.ok ? requestsRes.json() : Promise.resolve([]),
  ]);
  return (
    <MembershipDashboard
      initialSummary={summary}
      initialRoster={roster}
      catalogue={catalogue}
      adminData={settings}
      initialRequests={requests}
    />
  );
}
