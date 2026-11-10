import {internalFetch} from '@/lib/api';
import {redirect} from 'next/navigation';
import RecruitmentSettings from '@/components/RecruitmentSettings';
export default async function RecruitmentAdminPage(){const r=await internalFetch('/v1/recruitment/settings');if(!r.ok)redirect('/dashboard/recruitment');return <RecruitmentSettings initial={await r.json()}/>;}
