import {internalFetch} from '@/lib/api';
import {redirect} from 'next/navigation';
import RecruitmentDashboard from '@/components/RecruitmentDashboard';

export default async function RecruitmentPage(){
  const [summaryRes,settingsRes,responsesRes]=await Promise.all([internalFetch('/v1/recruitment/summary'),internalFetch('/v1/recruitment/settings'),internalFetch('/v1/recruitment/responses')]);
  if(summaryRes.status===401||summaryRes.status===403)redirect('/?auth=member');
  if(!summaryRes.ok)throw new Error('Failed to load Recruitment');
  if(!settingsRes.ok)redirect('/dashboard/recruitment');
  const summary=await summaryRes.json();
  const settings=settingsRes.ok?await settingsRes.json():null;
  const responses=responsesRes.ok?await responsesRes.json():[];
  return <RecruitmentDashboard settingsOnly initialSummary={summary} adminData={settings} initialResponses={responses}/>;
}
