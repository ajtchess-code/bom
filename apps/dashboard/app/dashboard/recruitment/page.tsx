import {internalFetch} from '@/lib/api';
import {redirect} from 'next/navigation';
export default async function RecruitmentPage(){
 const r=await internalFetch('/v1/recruitment/summary');if(r.status===401||r.status===403)redirect('/?auth=member');if(!r.ok)throw Error('Could not load applications.');const summary=await r.json();
 const applications=summary.applications??(summary.application?[summary.application.application??summary.application]:[]);
 const guild=process.env.DISCORD_GUILD_ID??'';
 return <section className="panel"><h1>Applications</h1><p>Applications are managed in Discord. Open your application channel, or use <strong>/apply</strong> in the server to get started. Recruiters can use <strong>/recruitment-tools</strong> inside a channel.</p>{applications.filter((a:any)=>a.ticket_channel_id).map((a:any)=><p key={a.id}><a href={`https://discord.com/channels/${guild}/${a.ticket_channel_id}`}>app-{a.captain_name} · {a.status}</a></p>)}</section>;
}
