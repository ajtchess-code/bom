import { internalFetch } from "@/lib/api";
import { redirect } from "next/navigation";
import PrepReviewDashboard from "@/components/PrepReviewDashboard";
async function get() {
  const r = await internalFetch("/v1/prep-review/bootstrap");
  if (r.status === 401 || r.status === 403) redirect("/?auth=member");
  if (!r.ok) throw new Error("Prep & Review bootstrap failed");
  return r.json();
}
export default async function PrepReviewPage() {
  const data = await get();
  return (
    <PrepReviewDashboard
      initialKind="PREP"
      initialPorts={data.ports ?? []}
      initialSessions={data.sessions ?? []}
    />
  );
}
