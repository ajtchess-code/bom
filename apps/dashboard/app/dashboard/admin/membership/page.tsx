import {internalFetch} from '@/lib/api';
import {redirect} from 'next/navigation';
import MembershipDashboard from '@/components/MembershipDashboard';

export default async function MembershipAdminPage(){
  const [summaryRes,rosterRes,catRes,settingsRes,requestsRes]=await Promise.all([
    internalFetch('/v1/membership/summary'),
    internalFetch('/v1/membership/roster'),
    internalFetch('/v1/wosb/catalogue'),
    internalFetch('/v1/membership/settings'),
    internalFetch('/v1/membership/custom-roles')
  ]);
  if(summaryRes.status===401||summaryRes.status===403)redirect('/?auth=member');
  if(settingsRes.status===401||settingsRes.status===403)redirect('/dashboard/admin');
  if(!summaryRes.ok||!settingsRes.ok)throw new Error('Failed to load membership administration');
  const [summary,roster,catalogue,settings,requests]=await Promise.all([
    summaryRes.json(),
    rosterRes.ok?rosterRes.json():Promise.resolve({members:[],total:0,incomplete:0}),
    catRes.ok?catRes.json():Promise.resolve({ships:[]}),
    settingsRes.json(),
    requestsRes.ok?requestsRes.json():Promise.resolve([])
  ]);
  return <MembershipDashboard initialSummary={summary} initialRoster={roster} catalogue={catalogue} adminData={settings} initialRequests={requests} initialView="admin" adminOnly/>;
}
