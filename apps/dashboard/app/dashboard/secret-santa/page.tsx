import SecretSantaDashboard from "@/components/SecretSantaDashboard";
import { internalFetch } from "@/lib/api";

export const metadata = {
  title: "Secret Santa",
};

export default async function SecretSantaPage() {
  const [curR, accessR] = await Promise.all([
    internalFetch("/v1/secret-santa/current"),
    internalFetch("/v1/access"),
  ]);
  const initial = curR.ok ? await curR.json() : null;
  const access = accessR.ok ? await accessR.json() : { dashboardAdmin: false };
  const admin = Boolean(initial?.admin ?? access?.dashboardAdmin);

  return <SecretSantaDashboard initial={initial} isAdmin={admin} />;
}
