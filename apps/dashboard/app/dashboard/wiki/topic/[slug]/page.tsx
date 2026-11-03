import {internalFetch} from "@/lib/api";
import {redirect} from "next/navigation";
import WikiTopicDashboard from "@/components/WikiTopicDashboard";
export default async function WikiTopicPage({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const r=await internalFetch(`/v1/wiki/portal/articles/${encodeURIComponent(decodeURIComponent(slug))}`);if(r.status===401||r.status===403)redirect('/?auth=member');if(!r.ok)redirect('/dashboard/wiki');const access=await internalFetch('/v1/access');const permissions=access.ok?await access.json():{};return <WikiTopicDashboard article={await r.json()} admin={Boolean(permissions.dashboardAdmin)}/>;}
