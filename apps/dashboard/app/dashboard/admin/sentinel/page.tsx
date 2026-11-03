import {internalFetch} from '@/lib/api';
import {redirect} from 'next/navigation';
import SentinelDashboard from '@/components/SentinelDashboard';
export default async function SentinelAdminPage(){
 const response=await internalFetch('/v1/sentinel/summary');
 if(response.status===401)redirect('/');if(response.status===403)redirect('/dashboard');
 if(!response.ok)throw new Error('Sentinel could not be loaded. Check migrations and API health.');
 const summary=await response.json();
 const paths=['/events?limit=100','/snapshots','/recovery/jobs','/health','/context'];
 const results=await Promise.all(paths.map(async path=>{const r=await internalFetch('/v1/sentinel'+path);if(!r.ok)throw new Error('Sentinel data could not be loaded.');return r.json();}));
 const [events,snapshots,jobs,health,context]=results;
 return <SentinelDashboard initialSummary={summary} initialEvents={events.events??[]} initialSnapshots={snapshots.snapshots??[]} initialJobs={jobs.jobs??[]} initialHealth={health} initialSettings={summary.settings} context={context}/>;
}
