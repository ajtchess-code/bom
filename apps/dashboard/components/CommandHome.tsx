"use client";
import Link from 'next/link';
import {useEffect,useState} from 'react';
export default function CommandHome(){
 const [data,setData]=useState<any>(null),[error,setError]=useState('');
 const load=()=>{setError('');fetch('/api/internal/command-home',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('Your workspace could not be loaded.');return r.json()}).then(setData).catch(e=>setError(e.message));};
 useEffect(()=>{load()},[]);
 if(error)return <section className="panel" role="alert">{error} <button className="outlineButton" onClick={load}>Try again</button></section>;
 if(!data)return <section className="panel bomSkeleton" aria-busy="true" aria-label="Loading your workspace">Loading your workspace…</section>;
 return <section className="panel commandHome"><header><div><span className="cardKicker">{data.manager?'YOUR WORKSPACE · ADMIRALTY':'YOUR WORKSPACE'}</span><h2>Coming up &amp; needs attention</h2></div><button className="outlineButton" onClick={load} aria-label="Refresh your workspace">Refresh</button></header>
 {data.unavailable?.length>0&&<p role="status">Some sections are temporarily unavailable. <button className="outlineButton" onClick={load}>Retry</button></p>}
 <div className="commandHomeGrid"><div><h3>Your Port Battles</h3>{(data.battles??[]).map((b:any)=><Link key={b.id} href={'/dashboard/port-battles?battle='+b.id}><b>{b.port_name}</b><span>{b.starts_at?new Date(b.starts_at).toLocaleString():'Time to be set'}</span><small>{[b.confirmed_ship,b.commander_duty,b.horn_duty,b.flare_duty].filter(Boolean).join(' · ')||'Awaiting assignment'}</small></Link>)}{!data.battles?.length&&!data.unavailable.includes('battles')&&<p>No upcoming signups. <Link href="/dashboard/port-battles">Browse battles</Link></p>}</div>
 <div><h3>{data.admin?'Recruitment needs attention':'Your application'}</h3>{(data.applications??[]).map((a:any)=><Link key={a.id} href={'/dashboard/recruitment?application='+a.id}><b>{a.captain_name||'Application'}</b><small>{a.status.replaceAll('_',' ')} · waiting on {a.waiting_on.toLowerCase()}</small></Link>)}{!data.applications?.length&&<p>No pending actions.</p>}
 {data.admin&&(data.attention??[]).filter((a:any)=>a.count>0).map((a:any)=><Link key={a.href+a.label} href={a.href}><b>{a.count} {a.label.toLowerCase()}</b><small>Review pending actions</small></Link>)}
 {data.manager&&(data.withdrawals??[]).map((w:any)=><Link key={w.id} href={'/dashboard/port-battles?battle='+w.battle_id}><b>{w.display_name||w.user_id} cannot attend {w.port_name}</b><small>Review replacement · {w.reason}</small></Link>)}</div></div>
 {data.contributions?.[0]&&<details><summary>Your participation record</summary><p>{data.contributions[0].attended} recorded appearances · {data.contributions[0].no_show} recorded no-shows. These are recorded outcomes; ask an officer to correct mistakes.</p></details>}
 </section>;
}
