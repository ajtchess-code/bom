import {internalFetch} from '@/lib/api';
import {redirect} from 'next/navigation';
import CasinoDashboard from '@/components/CasinoDashboard';
export default async function CasinoAdminPage(){const r=await internalFetch('/v1/casino');if(!r.ok)redirect('/dashboard');const data=await r.json();if(!data.admin)redirect('/dashboard/casino');return <CasinoDashboard initial={data} adminOnly/>;}
