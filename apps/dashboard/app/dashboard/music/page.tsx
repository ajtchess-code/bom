import { internalFetch } from "@/lib/api";
import { redirect } from "next/navigation";
import MusicDashboard from "@/components/MusicDashboard";

export default async function MusicPage(){
  const r=await internalFetch("/v1/music/summary");
  if(r.status===401||r.status===403)redirect("/?auth=member");
  if(!r.ok)throw new Error("Failed to load music workspace");
  return <MusicDashboard initial={await r.json()}/>;
}
