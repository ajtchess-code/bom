import TerritoryMap from '@/components/TerritoryMap';
import {internalFetch} from '@/lib/api';
import {redirect} from 'next/navigation';
export default async function ReviewPage({params}:{params:Promise<{id:string}>}){const {id}=await params;const r=await internalFetch('/v1/wosb/territory/reviews/'+encodeURIComponent(id));if(r.status===403||r.status===401)redirect('/?auth=member');if(!r.ok)return <section className="panel"><h1>Review Link Expired Or Unavailable</h1></section>;return <TerritoryMap battles={[]} config={{}} manager reviewId={id}/>;}
