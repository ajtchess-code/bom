import { headers } from "next/headers";
import { redirect } from "next/navigation";
import GameWiki from "@/components/GameWiki";
import { activeRelease } from "@/lib/compendium";
import { isPublicWikiHost } from "@/lib/publicHost";
import { publicFetch } from "@/lib/publicApi";

export const dynamic = "force-dynamic";

/** The old encyclopedia is only shown until the first Sea Battle Compendium release is installed. */
export default async function PublicWikiPage() {
  if (await activeRelease()) redirect(isPublicWikiHost(await headers()) ? "/" : "/compendium/");
  const r = await publicFetch("/v1/game-wiki/catalog").catch(() => null);
  const catalog = r && r.ok ? await r.json() : null;
  return <GameWiki catalog={catalog} publicMode />;
}
