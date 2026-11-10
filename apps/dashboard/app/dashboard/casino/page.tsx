import {internalFetch} from '@/lib/api';
import {redirect} from 'next/navigation';
import CasinoDashboard from '@/components/CasinoDashboard';
export default async function CasinoPage(){const r=await internalFetch('/v1/casino');if(r.status===401||r.status===403)redirect('/?auth=member');if(!r.ok)throw Error('Could not load casino.');return <CasinoDashboard initial={await r.json()}/>;}
