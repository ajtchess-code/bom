import {internalFetch} from "@/lib/api";
import {redirect} from "next/navigation";
export default async function WikiArticlePage({params}:{params:Promise<{entityKey:string}>}){
 const {entityKey}=await params;const name=decodeURIComponent(entityKey).split(":").slice(1).join(" ").replaceAll("-"," ")||entityKey;
 const response=await internalFetch(`/v1/game-wiki/search?q=${encodeURIComponent(name)}`);
 if(response.status===401||response.status===403)redirect("/?auth=member");
 const result=response.ok?await response.json():null,hit=result?.results?.[0];
 redirect(hit?`/dashboard/wiki?table=${encodeURIComponent(hit.table)}&record=${hit.row}`:"/dashboard/wiki");
}
