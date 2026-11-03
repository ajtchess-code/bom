import {internalFetch} from '@/lib/api';
import {redirect} from 'next/navigation';
import CommunitySettingsPage from '@/components/CommunitySettingsPage';
export default async function Page(){const r=await internalFetch('/v1/admin/summary');if(r.status===401)redirect('/');if(r.status===403)redirect('/dashboard');if(!r.ok)throw new Error('Unable to load configuration');return <CommunitySettingsPage initial={(await r.json()).context??{}}/>}
