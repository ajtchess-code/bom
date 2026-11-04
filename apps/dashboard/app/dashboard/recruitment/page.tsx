import { internalFetch } from "@/lib/api";
import { redirect } from "next/navigation";
import RecruitmentDashboard from "@/components/RecruitmentDashboard";

export default async function RecruitmentPage() {
  const summaryRes = await internalFetch("/v1/recruitment/summary");
  if (summaryRes.status === 401 || summaryRes.status === 403) redirect("/?auth=member");
  if (!summaryRes.ok) throw new Error("Failed to load Recruitment");
  const summary = await summaryRes.json();
  // Applicants do not request recruiter resources; only admins request settings.
  const [settingsRes, responsesRes] = await Promise.all([
    summary.admin ? internalFetch("/v1/recruitment/settings") : Promise.resolve(null),
    summary.access === "recruiter" ? internalFetch("/v1/recruitment/responses") : Promise.resolve(null),
  ]);
  const settings = settingsRes?.ok ? await settingsRes.json() : null;
  const responses = responsesRes?.ok ? await responsesRes.json() : [];
  return <RecruitmentDashboard initialSummary={summary} adminData={settings} initialResponses={responses} />;
}
