import {internalFetch} from "@/lib/api";
import {redirect} from "next/navigation";
import FeedbackDashboard from "@/components/FeedbackDashboard";
export default async function FeedbackPage(){const r=await internalFetch('/v1/feedback/bootstrap');if(r.status===401||r.status===403)redirect('/?auth=member');if(!r.ok)throw new Error('Feedback Center failed to load');return <FeedbackDashboard initial={await r.json()}/>;}
