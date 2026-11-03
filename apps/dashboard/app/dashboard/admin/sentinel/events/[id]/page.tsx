import Link from 'next/link';
import {internalFetch} from '@/lib/api';
import {redirect,notFound} from 'next/navigation';
export default async function SentinelEventPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
 const response=await internalFetch(`/v1/sentinel/events/${id}`);
 if(response.status===401)redirect('/');if(response.status===403)redirect('/dashboard');if(response.status===404)notFound();
 if(!response.ok)throw new Error('The audit event could not be loaded.');
 const event=await response.json();
 return <div><header className="experienceHero"><div><span className="eyebrow">SENTINEL EVIDENCE</span><h1>{String(event.action).replaceAll('.',' ')}</h1><p>{new Date(event.occurred_at).toLocaleString('en-US',{timeZone:'UTC'})} UTC · {event.attribution_confidence}</p><Link href="/dashboard/admin/sentinel">Back to Sentinel</Link></div></header><section className="panel"><h2>Recorded event</h2><dl>{[['Source',event.source],['Actor',event.initiator_id??event.actor_id??'Unconfirmed'],['Target',event.target_id],['Channel',event.channel_id],['Outcome',event.outcome]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value??'—'}</dd></div>)}</dl><details><summary>Evidence and recorded state</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify({before:event.before_state,after:event.after_state,metadata:event.metadata,cause:event.cause,accessChanges:event.accessChanges},null,2)}</pre></details></section></div>;
}
