import AllianceDashboardShell from "@/components/AllianceDashboardShell";
import { getSession } from "@/lib/session";
import { internalFetch } from "@/lib/api";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/");
  const accessResponse = await internalFetch("/v1/access");
  if (accessResponse.status === 401 || accessResponse.status === 403) redirect("/?auth=member");
  const access = accessResponse.ok ? await accessResponse.json() : { dashboardAdmin: false };
  if (access.guestOnly)
    return (
      <div className="pbAlliedShell">
        <header>
          <b>Band of Misfits · Applications</b>
          <a href="/api/auth/logout">Sign out</a>
        </header>
        <main>{children}</main>
      </div>
    );
  if (access.allianceOnly) return <AllianceDashboardShell>{children}</AllianceDashboardShell>;
  if (access.pbOnly)
    return (
      <div className="pbAlliedShell">
        <header>
          <b>Allied Port Battles</b>
          <a href="/dashboard/port-battles">Port Battles</a>
          <a href="/api/auth/logout">Sign out</a>
        </header>
        <main>{children}</main>
      </div>
    );
  return (
    <DashboardShell session={session} admin={Boolean(access.dashboardAdmin)}>
      {children}
    </DashboardShell>
  );
}
