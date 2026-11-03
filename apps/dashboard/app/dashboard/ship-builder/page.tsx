import {internalFetch} from "@/lib/api";
import {getSession} from "@/lib/session";
import {redirect} from "next/navigation";
import ShipBuilderDashboard from "@/components/ShipBuilderDashboard";
async function get(path:string){const r=await internalFetch(path);if(r.status===401||r.status===403)redirect('/?auth=member');if(!r.ok)throw new Error(`Ship Builder request failed: ${path}`);return r.json();}
export default async function ShipBuilderPage(){const [catalogue,builds,access,session]=await Promise.all([get('/v1/wosb/catalogue'),get('/v1/wosb/builds'),get('/v1/access'),getSession()]);const a=access.access??{};return <ShipBuilderDashboard catalogue={catalogue} initialBuilds={builds??[]} viewerId={String(session?.id??'')} roleIds={(a.roleIds??a.roles??[]).map(String)}/>;}
