import GameWiki from "@/components/GameWiki";
import { publicFetch } from "@/lib/publicApi";

export const dynamic = "force-dynamic";

export default async function PublicWikiPage() {
  const r = await publicFetch("/v1/game-wiki/catalog").catch(() => null);
  const catalog = r && r.ok ? await r.json() : null;
  return <GameWiki catalog={catalog} publicMode />;
}
