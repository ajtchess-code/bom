import { internalFetch } from "@/lib/api";
import { redirect } from "next/navigation";
import RoleAssigner from "@/components/RoleAssigner";

export default async function AssignRolesPage() {
  const r = await internalFetch("/v1/admin/roles");
  if (r.status === 401) redirect("/");
  if (r.status === 403) redirect("/dashboard");
  const body = r.ok ? await r.json() : { roles: [], error: (await r.json().catch(() => ({}))).message };
  return (
    <RoleAssigner
      initialRoles={body.roles ?? []}
      loadError={r.ok ? "" : body.error || "Couldn't load roles from Discord."}
    />
  );
}
