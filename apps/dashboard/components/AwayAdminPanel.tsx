"use client";

import {useEffect,useMemo,useState} from "react";

type Attempt={status:string;reason?:string|null;attempted_at?:string;batch_id?:string};
type Member={userId:string;displayName:string;username:string;avatarUrl:string|null;roles:string[];roleReview:"BOTH"|"NEITHER"|null;lastAttempt:Attempt|null;checkin?:{id:string;status:string;sent_at:string;responded_at?:string;expected_return_at?:string;error_message?:string}|null;leave?:{return_at:string}|null;notInGuild?:boolean};
type PrefixIssue={userId:string;current:string;expected:string;displayName?:string;username?:string;duplicateTags?:string[];prefixMismatch:boolean;roleConflict:boolean;missingRoleIds:string[]};
const failures=new Set(['DM_FAILED','ROLE_REVIEW_REQUIRED','AFK_ROLE_NOT_CONFIGURED','NOT_FOUND']);
const nice=(v:string)=>v.replaceAll('_',' ').toLowerCase().replace(/\b\w/g,m=>m.toUpperCase());
const safeCell=(text:unknown)=>{const raw=String(text??'');const protectedValue=/^[\s]*[=+@-]/.test(raw)?`'${raw}`:raw;return `"${protectedValue.replaceAll('"','""')}"`;};
function exportCsv(rows:string[][],filename:string){const contents='\ufeff'+rows.map(row=>row.map(safeCell).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([contents],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);}
async function membership(path:string,init:RequestInit={}){
  const headers=new Headers(init.headers);if(init.body)headers.set('content-type','application/json');
  const response=await fetch(`/api/internal/membership${path}`,{...init,headers,cache:'no-store'});
  const text=await response.text();let result:any;try{result=JSON.parse(text);}catch{result={error:text};}
  if(!response.ok)throw new Error(result?.message||result?.error||`Server returned ${response.status}`);
  return result;
}
export default function AwayAdminPanel(){
  const [data,setData]=useState<any>(null),[search,setSearch]=useState(''),[status,setStatus]=useState('all');
  const [selection,setSelection]=useState<string[]>([]),[running,setRunning]=useState(false),[loading,setLoading]=useState(false),[notice,setNotice]=useState('');
  const [audit,setAudit]=useState<any>(null),[auditBusy,setAuditBusy]=useState(false),[auditSelected,setAuditSelected]=useState<string[]>([]);
  const [,setLastBatch]=useState<any[]>([]),[resolving,setResolving]=useState<string|null>(null);
  async function load(){setLoading(true);try{setData(await membership('/checkins'));}catch(e:any){setNotice(String(e.message));}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);
  const members:Member[]=data?.members??[];
  const byId=useMemo(()=>new Map(members.map(m=>[m.userId,m])),[members]);
  const currentStatus=(m:Member)=>m.lastAttempt?.status==='SENT'||m.lastAttempt?.status==='ALREADY_PENDING'?(m.checkin?.status??'PENDING'):m.lastAttempt?.status??m.checkin?.status??'NOT_CONTACTED';
  const issues=members.filter(m=>failures.has(currentStatus(m)));
  const deliveryFailed=members.filter(m=>currentStatus(m)==='DM_FAILED'&&!m.notInGuild);
  const review=members.filter(m=>currentStatus(m)==='ROLE_REVIEW_REQUIRED'||currentStatus(m)==='AFK_ROLE_NOT_CONFIGURED');
  const filtered=useMemo(()=>members.filter(m=>{
    const q=search.trim().toLowerCase();if(q&&!`${m.displayName} ${m.username} ${m.userId}`.toLowerCase().includes(q))return false;
    if(status==='pending')return m.checkin?.status==='PENDING';
    if(status==='away')return Boolean(m.leave)||m.checkin?.status==='AWAY';
    if(status==='uncontacted')return !m.checkin&&!m.lastAttempt;
    if(status==='failed')return currentStatus(m)==='DM_FAILED';
    if(status==='review')return ['ROLE_REVIEW_REQUIRED','AFK_ROLE_NOT_CONFIGURED'].includes(currentStatus(m));
    if(status==='not-playing')return m.checkin?.status==='NOT_CONTINUING';
    return true;
  }),[members,search,status]);
  const selected=new Set(selection);
  const allVisible=filtered.length>0&&filtered.every(m=>selected.has(m.userId));
  const roleReady=Boolean(data?.configured);
  async function send(){
    if(!selection.length||running)return;
    if(!roleReady){setNotice('Enable Leave and configure BOM and/or BoM 2 membership-to-AFK role mappings in Membership settings.');return;}
    if(!window.confirm(`Send private BOM check-ins to ${selection.length} selected members? No role changes occur unless a member chooses Take Leave.`))return;
    setRunning(true);let sent=0,failed=0,pending=0;let completed=0;const results:any[]=[];
    try{
      // Small batches keep dashboard proxy requests under hosting timeouts and report partial progress.
      for(let i=0;i<selection.length;i+=15){const group=selection.slice(i,i+15);const outcome=await membership('/checkins/send',{method:'POST',body:JSON.stringify({userIds:group})});sent+=Number(outcome.sent??0);failed+=Number(outcome.failed??0);pending+=Number(outcome.pending??0);completed+=group.length;results.push(...(outcome.results??[]));setNotice(`Sent ${sent} of ${completed} processed · DM errors ${failed} · Pending ${pending}`);}
      setLastBatch(results);setSelection([]);await load();setNotice(`Processed ${completed}: ${sent} sent, ${failed} failed DMs, ${results.filter(x=>x.status==='ROLE_REVIEW_REQUIRED').length} role reviews, ${pending} already pending. See the delivery report below for every member.`);
    }catch(e:any){setLastBatch(results);setNotice(`Batch interrupted after ${completed} members. ${sent} DMs were sent. Only the unprocessed/failed members should be retried. ${String(e.message)}`);await load();}
    finally{setRunning(false);}
  }
  async function resolveRole(member:Member,guild:'BOM'|'BOM2'){
    if(running||resolving)return;
    if(!window.confirm(`Change ${member.displayName}'s Discord membership to ${guild==='BOM'?'BOM':'BoM 2'}? This adds the selected Member role and removes the other membership role. Other roles will remain unchanged.`))return;
    setResolving(member.userId);
    try{await membership(`/checkins/${encodeURIComponent(member.userId)}/resolve-role`,{method:'POST',body:JSON.stringify({guild,confirm:true})});setNotice(`${member.displayName}: membership role corrected. Select the member and resend their check-in.`);await load();}
    catch(e:any){setNotice(`Could not correct ${member.displayName}: ${String(e.message)}`);}
    finally{setResolving(null);}
  }
  function exportReport(){const records=(data?.attempts??[]) as any[];const rows=[['Attempted at','Member','Username','Discord ID','Status','Reason','Batch ID'],...records.map(x=>{const m=byId.get(String(x.user_id));return [String(x.attempted_at??''),m?.displayName??String(x.display_name??'Unknown'),m?.username??String(x.username??''),String(x.user_id??''),String(x.status??''),String(x.reason??''),String(x.batch_id??'')];})];exportCsv(rows,'BOM-checkin-delivery-report.csv');}
  async function scan(){setAuditBusy(true);try{setAudit(await membership('/prefix-audit'));setAuditSelected([]);}catch(e:any){setNotice(e.message);}finally{setAuditBusy(false);}}
  async function fixSelected(){if(auditBusy||!auditSelected.length)return;
    if(!window.confirm(`Correct nicknames for ${auditSelected.length} selected members? Only prefixes are changed; no Discord roles are added or removed.`))return;
    setAuditBusy(true);let ok=0;const errors:string[]=[];
    try{for(const uid of auditSelected){try{const r=await membership(`/prefix-audit/${encodeURIComponent(uid)}/apply`,{method:'POST',body:JSON.stringify({fixPrefix:true,fixConnections:false})});if(r.changedNickname)ok++;else if(r.failures?.length)errors.push(`${uid}: ${r.failures.join(', ')}`);}catch(e:any){errors.push(`${uid}: ${e.message}`);}}setNotice(`Corrected ${ok} nicknames.${errors.length?` ${errors.length} failed: ${errors.join('; ')}`:''}`);await scan();}
    finally{setAuditBusy(false);}
  }
  const repairable:PrefixIssue[]=(audit?.issues??[]).filter((x:PrefixIssue)=>x.prefixMismatch&&!x.roleConflict);
  return <article className="membershipPanel awayAdminPanel">
    <style>{`.awaySummary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0}
.awaySummary span{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;text-align:center;border:1px solid var(--cc-border,rgba(214,171,75,.24));border-radius:9px;padding:13px 8px}
.awaySummary strong{font-size:1.2rem;font-variant-numeric:tabular-nums}
.awayReviewSection{margin:20px 0;padding:16px 0;border-top:1px solid var(--cc-border,rgba(214,171,75,.2));min-width:0}
.awayReviewSection h3{margin:5px 0}.awayIssueList{display:grid;gap:9px;max-height:410px;overflow:auto}
.awayIssueRow{display:flex;gap:12px;justify-content:space-between;align-items:center;padding:12px;border:1px solid var(--cc-border,rgba(214,171,75,.24));border-radius:9px;min-width:0}
.awayIssueRow>div:first-child{display:grid;gap:4px;min-width:0;overflow-wrap:anywhere}.awayIssueRow small{opacity:.75}
.awayIssueActions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.awayIssueActions button{white-space:nowrap}
.awayIssueStatus{font-size:12px;font-weight:700;color:var(--cc-text-soft,#c9ad73)}
@media(max-width:760px){.awaySummary{grid-template-columns:repeat(2,minmax(0,1fr))}.awayIssueRow{align-items:stretch;flex-direction:column}.awayIssueActions{justify-content:flex-start}.awayIssueActions button{flex:1}}
@media(max-width:420px){.awaySummary{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.awaySummary span{font-size:12px}.awayReviewSection{padding:12px 0}}`}</style>
    <header><span className="eyebrow">ADMIRALTY · RETENTION</span><h2>Member Check-Ins & Away Management</h2><p>Send targeted private check-ins, review delivery failures and guild role conflicts, then resend only to the selected members. Extended absences should apply in-game to the <b>BoM 2nd guild</b>.</p></header>
    {!roleReady&&<p className="awayNotice">Configure Leave and at least one membership-to-AFK role mapping before sending check-ins.</p>}
    <div className="awaySummary" aria-label="Check-in delivery statistics"><span><strong>{members.filter(m=>m.checkin?.status==='PENDING').length}</strong> Awaiting responses</span><span><strong>{deliveryFailed.length}</strong> DM failures</span><span><strong>{review.length}</strong> Role reviews</span><span><strong>{members.filter(m=>Boolean(m.leave)).length}</strong> Away</span></div>
    <div className="awayToolbar"><label className="awaySearch">Find members<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, username, Discord ID"/></label><label>Show<select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All Discord members</option><option value="uncontacted">Never contacted</option><option value="pending">Awaiting response</option><option value="away">Away / AFK</option><option value="failed">DM delivery failed</option><option value="review">Role review / setup issues</option><option value="not-playing">Not continuing</option></select></label><button type="button" className="outlineButton" disabled={loading} onClick={()=>void load()}>{loading?'Refreshing…':'Refresh Discord & Responses'}</button></div>
    <div className="awayBulk"><label className="checkLine"><input type="checkbox" checked={allVisible} onChange={e=>setSelection(current=>e.target.checked?[...new Set([...current,...filtered.map(m=>m.userId)])]:current.filter(id=>!filtered.some(m=>m.userId===id)))}/>Select all {filtered.length} visible</label><span>{selection.length} selected</span><button type="button" className="goldButton" disabled={running||!selection.length||!roleReady} onClick={()=>void send()}>{running?'Sending…':`Send / Retry Check-In (${selection.length})`}</button><button type="button" className="outlineButton" disabled={running||!deliveryFailed.length} onClick={()=>setSelection([...new Set([...selection,...deliveryFailed.map(m=>m.userId)])])}>Select {deliveryFailed.length} Failed DMs</button><button type="button" className="outlineButton" onClick={()=>setSelection([])} disabled={!selection.length||running}>Clear</button></div>
    {notice&&<p className="awayNotice" role="status">{notice}</p>}
    <div className="awayMemberList">{filtered.map(m=><label className="awayMember" key={m.userId}><input type="checkbox" checked={selected.has(m.userId)} onChange={e=>setSelection(current=>e.target.checked?[...current,m.userId]:current.filter(id=>id!==m.userId))}/>{m.avatarUrl?<img src={m.avatarUrl} alt="" loading="lazy"/>:<span className="awayAvatar">☠</span>}<span className="awayName"><b>{m.displayName}</b><small>{m.username} · {m.userId}</small></span><span className="awayStatus"><b>{m.leave?'AFK / Away':nice(currentStatus(m))}</b>{m.leave?.return_at&&<small>Return: {new Date(m.leave.return_at).toLocaleDateString()}</small>}{m.lastAttempt?.reason&&<small>{m.lastAttempt.reason}</small>}{!m.lastAttempt?.reason&&m.checkin?.error_message&&<small>{m.checkin.error_message}</small>}</span></label>)}{!filtered.length&&<p>No members match this filter.</p>}</div>
    <section className="awayReviewSection"><header><span className="eyebrow">DELIVERY REPORT</span><h3>Failed and Skipped Members</h3><p>Each new delivery attempt is saved, including skipped users who never received a DM. Fix roles before resending where needed. Previous skipped recipients were not recorded by older versions.</p></header><div className="awayBulk"><span>{issues.length} currently unresolved · {data?.attempts?.length??0} stored attempts</span><button type="button" className="outlineButton" onClick={exportReport} disabled={!data?.attempts?.length}>Export Recent 5,000 Attempts CSV</button><button type="button" className="outlineButton" disabled={running||!issues.length} onClick={()=>{setStatus('all');setSelection(issues.filter(m=>!m.notInGuild&&(m.lastAttempt?.status==='DM_FAILED'||(m.lastAttempt?.status==='ROLE_REVIEW_REQUIRED'&&!m.roleReview)||m.lastAttempt?.status==='AFK_ROLE_NOT_CONFIGURED')).map(m=>m.userId));}}>Select Retry-Ready Members</button></div>
      <div className="awayIssueList">{issues.map(m=><div className="awayIssueRow" key={m.userId}><div><b>{m.displayName}</b><small>{m.username} · {m.userId}</small><span className="awayIssueStatus">{nice(currentStatus(m))}{m.roleReview==='BOTH'?' · Both membership roles':m.roleReview==='NEITHER'?' · No configured membership role':''}</span><small>{m.lastAttempt?.reason??m.checkin?.error_message??'Check membership settings and try again.'}</small></div><div className="awayIssueActions">{m.lastAttempt?.status==='ROLE_REVIEW_REQUIRED'&&m.roleReview&&<><button type="button" className="outlineButton" disabled={Boolean(resolving)||running} onClick={()=>void resolveRole(m,'BOM')}>Assign BOM</button><button type="button" className="outlineButton" disabled={Boolean(resolving)||running} onClick={()=>void resolveRole(m,'BOM2')}>Assign BoM 2</button></>}{!m.roleReview&&!m.notInGuild&&<button type="button" className="outlineButton" disabled={running} onClick={()=>setSelection(old=>old.includes(m.userId)?old:[...old,m.userId])}>Select to Resend</button>}</div></div>)}{!issues.length&&<p>No outstanding delivery failures or skipped members from recorded attempts.</p>}</div>
    </section>
    <div className="awayAudit"><header><span className="eyebrow">NICKNAME HYGIENE</span><h3>Guild Prefix Scanner</h3><p>Checks all leading bracketed prefixes, including duplicates such as <b>[FAT] [FAT]</b>, and <b>[BOM] [BOM]</b>. Different prefixes are retained, not merged or guessed. Scanning makes no changes.</p></header><div className="awayBulk"><button className="outlineButton" disabled={auditBusy} onClick={()=>void scan()}>{auditBusy?'Scanning…':'Scan All Member Prefixes'}</button>{audit&&<span>{audit.total} issues · {repairable.length} previewed safe nickname corrections</span>}<button className="goldButton" disabled={auditBusy||!auditSelected.length} onClick={()=>void fixSelected()}>Fix Selected ({auditSelected.length})</button><button type="button" className="outlineButton" disabled={!repairable.length||auditBusy} onClick={()=>setAuditSelected(repairable.map(m=>m.userId))}>Select Safe Fixes</button></div>
      {audit&&<div className="awayAuditList">{repairable.map(x=><label className="awayAuditRow" key={x.userId}><input type="checkbox" checked={auditSelected.includes(x.userId)} onChange={e=>setAuditSelected(old=>e.target.checked?[...old,x.userId]:old.filter(id=>id!==x.userId))}/><span><b>{x.displayName??x.current}</b><small>{x.username??''} · {x.userId}</small><small><strong>Current:</strong> {x.current}</small><small><strong>Preview:</strong> {x.expected}</small>{Boolean(x.duplicateTags?.length)&&<small>Repeated tags: {x.duplicateTags?.join(', ')}</small>}</span></label>)}{(audit.issues??[]).filter((x:PrefixIssue)=>x.roleConflict).map((x:PrefixIssue)=><div className="awayAuditRow" key={x.userId}><span><b>{x.displayName??x.current}</b><small>Manual role review required before prefix correction · {x.current}</small></span></div>)}{!audit.total&&<p>No prefix issues found.</p>}</div>}
    </div>
  </article>;
}
