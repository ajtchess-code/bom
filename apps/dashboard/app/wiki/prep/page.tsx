import { Suspense } from "react";
import type { Metadata } from "next";
import PublicPrep from "@/components/prep/PublicPrep";
import { publicFetch } from "@/lib/publicApi";

export const metadata: Metadata = {
  title: "Battle Prep & Review",
  description:
    "Free port battle planner for World of Sea Battle: draw on the real tactical maps, place squadrons, set the wind and review fights from video.",
};
export const dynamic = "force-dynamic";

export default async function PublicPrepPage() {
  const r = await publicFetch("/v1/wiki/portal/ports").catch(() => null);
  const body = r && r.ok ? await r.json() : { ports: [] };
  const ports = (body.ports ?? []).map((p: any) => ({ ...p, archivedMap: false }));
  return (
    <Suspense>
      <PublicPrep ports={ports} />
    </Suspense>
  );
}
