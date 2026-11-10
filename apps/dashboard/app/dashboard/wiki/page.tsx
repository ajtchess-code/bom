import { internalFetch } from "@/lib/api";
import { redirect } from "next/navigation";
import GameWiki from "@/components/GameWiki";
import "./game-wiki.css";
async function get(path: string) {
  const r = await internalFetch(path);
  if (r.status === 401 || r.status === 403) redirect("/?auth=member");
  if (r.status === 503) return null;
  if (!r.ok) throw new Error(`Wiki request failed: ${path}`);
  return r.json();
}
export default async function WikiPage() {
  const [catalog, access] = await Promise.all([
    get("/v1/game-wiki/catalog"),
    get("/v1/access"),
  ]);
  const admin = Boolean(access.dashboardAdmin);
  return <GameWiki catalog={catalog} admin={admin} />;
}
