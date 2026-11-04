/** Port of the Python bot's render_signup_summary, render_roster and V2 document layout. */
export const PB_LEGACY_GOLD=0xc27c0e;
export type PanelOptions={base:string;guildId:string;guilds?:any[];dutyEmojis?:Record<string,string>;page?:number;banner?:string|null;thumbnail?:string|null;rows?:any[];preferred?:boolean;pageKind?:string;pageId?:string};
const text=(value:any)=>String(value??'').replace(/<@!?\d+>|<@&\d+>|@everyone|@here/g,'captain').replace(/[\\*_`~|]/g,'\\$&');
export const pbRate=(r:any)=>{const n=Number(r);return n?`${n}${n===1?'st':n===2?'nd':n===3?'rd':'th'} Rate`:'Rate TBD';};
export function pbTimestamp(value:any){const unix=Math.floor(new Date(value).getTime()/1000);return value&&Number.isFinite(unix)?`Battle starts <t:${unix}:R>\n<t:${unix}:F>`:'Time to be set';}
const array=(x:any):any[]=>{if(Array.isArray(x))return x;if(typeof x==='string')try{return array(JSON.parse(x));}catch{}return [];};
const sorted=(rows:any[])=>[...rows].sort((a,b)=>String(a.display_name??'').localeCompare(String(b.display_name??'')));
function split(s:string,limit=3200){const out:string[]=[];while(s.length>limit){let end=s.lastIndexOf('\n',limit);if(end<limit/2)end=limit;if(end>0&&/[\uD800-\uDBFF]/.test(s[end-1]))end--;out.push(s.slice(0,end));s=s.slice(end).replace(/^\n/,'');}out.push(s);return out;}
const sep=()=>({type:14,divider:true,spacing:2});
export const pbButton=(label:string,id:string,style=2)=>({type:2,style,label,custom_id:id});
export const pbLink=(label:string,url:string)=>({type:2,style:5,label,url});
export const pbRow=(...components:any[])=>({type:1,components});
export function legacyPanel(title:string,body:string,o:PanelOptions){
 const pages=split(`## ${title}\n\n${body}`),page=Math.min(Math.max(0,Math.floor(o.page??0)),pages.length-1),components:any[]=[];
 if(o.banner)components.push({type:12,items:[{media:{url:o.banner}}]});
 const display={type:10,content:pages[page]+(pages.length>1?`\n\n-# Page ${page+1} of ${pages.length}`:'')};
 components.push(o.thumbnail?{type:9,components:[display],accessory:{type:11,media:{url:o.thumbnail}}}:display);
 for(const row of o.rows??[])components.push(sep(),row);
 if(o.preferred){components.push(sep(),{type:10,content:'### Preferred Ships\nChoose the ships you can sail and your favourites for automatic port battle signups.'},...(o.base?[pbRow(pbLink('Set Preferred Ships',o.base+'/dashboard/port-battles?preferences=1'),pbLink('My Profile & Ships',o.base+'/dashboard/members?view=profile'))]:[]));}
 if(pages.length>1){components.push(sep(),pbRow({...pbButton('Previous page',`pb:panel:${o.pageKind}:${o.pageId}:${Math.max(0,page-1)}`),disabled:page===0},{...pbButton('Next page',`pb:panel:${o.pageKind}:${o.pageId}:${Math.min(pages.length-1,page+1)}`),disabled:page===pages.length-1}));}
 return {flags:32768,allowedMentions:{parse:[]},components:[{type:17,accent_color:PB_LEGACY_GOLD,components}]};
}
function dutyIcon(d:any,o:PanelOptions){const label=String(d??''),key=/horn/i.test(label)?'horn':/red flare/i.test(label)?'red-flare':/gold flare/i.test(label)?'gold-flare':/blue flare/i.test(label)?'blue-flare':'';return key?(o.dutyEmojis?.[key]||({'horn':'📯','red-flare':'🔴','gold-flare':'🟡','blue-flare':'🔵'} as any)[key]):'';}
export function signupPanel(b:any,signups:any[],o:PanelOptions){
 if(b.status==='CANCELLED')return legacyPanel(`Battle of ${text(b.port_name)} — Cancelled`,`**CANCELLED**\n${text(b.cancellation_reason??'Cancelled by an officer.')}\n\n${pbTimestamp(b.starts_at)}\n\nSignups are closed. No attendance is required.`,{...o,rows:[],pageKind:'signup',pageId:b.id});
 let body=`**${text(b.attacker||'Attacker')}** vs. **${text(b.defender||'Defender')}**\n\n**${pbRate(b.rate)}** · **${Number(b.team_size)||20}v${Number(b.team_size)||20}** · **${b.status==='OPEN'?'Open':'Closed'}**\n${pbTimestamp(b.starts_at)}`;
 for(const [label,players] of [['Attending',signups.filter(s=>!['WAITLIST','TENSIONING','LATE'].includes(s.signup_status)&&!s.late_minutes)],['Running Late',signups.filter(s=>!['WAITLIST','TENSIONING'].includes(s.signup_status)&&(s.signup_status==='LATE'||s.late_minutes))],['On Waitlist',signups.filter(s=>s.signup_status==='WAITLIST')],['Tensioning (not in PB)',signups.filter(s=>s.signup_status==='TENSIONING')]] as [string,any[]][]){if(players.length)body+=`\n\n**${label} · ${players.length}**\n`+sorted(players).map(s=>`• ${text(s.display_name)}${s.late_minutes?` · Late +${Number(s.late_minutes)}m`:''}${s.horn_capable?` · ${dutyIcon('Horn',o)} Horn`:''}${array(s.flare_capabilities).filter((f:any)=>!/blue/i.test(String(f))).map(f=>` · ${dutyIcon(f,o)} ${text(f)}`).join('')}`).join('\n');}
 if(!signups.length)body+='\n\nNo players signed up yet.';
 return legacyPanel(`Battle of ${text(b.port_name)} — Signups`,body,{...o,pageKind:'signup',pageId:b.id});
}
export function rosterPanel(b:any,signups:any[],o:PanelOptions){
 if(b.status==='CANCELLED')return legacyPanel(`Battle of ${text(b.port_name)} — Cancelled`,`**CANCELLED**\n${text(b.cancellation_reason??'Cancelled by an officer.')}\n\nRoster preserved for history:\n${sorted(signups).map(s=>text(s.display_name)+(s.confirmed_ship?' · '+text(s.confirmed_ship):'')).join('\n')||'No signups'}`,{...o,rows:[],pageKind:'roster',pageId:b.id});
 const confirmed=signups.filter(s=>s.confirmed_ship),size=Number(b.team_size)||20,remaining=Math.max(0,size-confirmed.length);let targets:any=b.ship_targets??{};if(typeof targets==='string')try{targets=JSON.parse(targets);}catch{targets={};}
 let body=`${pbTimestamp(b.starts_at)}\n\n**ROSTER**\n**${confirmed.length}/${size}**${remaining?` · ${remaining} player${remaining===1?'':'s'} still remaining to confirm for the port battle.`:''}`;
 for(const ship of [...new Set(confirmed.map(s=>String(s.confirmed_ship)))]){const captains=sorted(confirmed.filter(s=>s.confirmed_ship===ship));body+=`\n\n**${text(ship)} [${captains.length}${targets[ship]!=null?`/${Number(targets[ship])}`:''}]**\n`+captains.map(s=>`• ${text(s.display_name)}${s.late_minutes?` · Late +${Number(s.late_minutes)}m`:''}${array(s.preferred_ships).includes(ship)?' · ★':''}${[s.horn_duty,s.flare_duty,s.formation,s.commander_duty].filter(Boolean).map(d=>' · '+dutyIcon(d,o)+' '+text(d)).join('')}`).join('\n');}
 const wait=sorted(signups.filter(s=>s.signup_status==='WAITLIST'));if(wait.length)body+=`\n\n**WAITLIST**\n**${wait.length}** on waitlist\n`+wait.map(s=>`• ${text(s.display_name)}${s.late_minutes?` · Late +${Number(s.late_minutes)}m`:''}`).join('\n');
 return legacyPanel(`Battle of ${text(b.port_name)}`,body,{...o,pageKind:'roster',pageId:b.id});
}
export function indexPanel(active:any[],o:PanelOptions,kind='signup'){
 let body=active.length?'':kind==='signup'?'No active signups.':'No active rosters.';
 for(const b of active){const id=kind==='signup'?b.discord_signup_message_id:b.discord_roster_message_id;const channel=kind==='signup'?b.discord_signup_channel_id:b.discord_roster_channel_id;body+=`${body?'\n\n':''}**${text(b.port_name)}**\n${pbTimestamp(b.starts_at)}\n${pbRate(b.rate)} • ${Number(b.team_size)||20}v${Number(b.team_size)||20} • ${b.status==='OPEN'?'Open':'Closed'}\n${text(b.attacker)} vs ${text(b.defender)}${id&&channel?`\n[Open ${kind==='signup'?'signup':'roster'}](https://discord.com/channels/${o.guildId}/${channel}/${id})`:`\n${kind==='signup'?'Signup':'Roster'} post pending.`}`;}
 const rows=kind==='signup'?[pbRow(pbButton('Sign Up for ALL Port Battles',`pb:all:${o.guildId}`,3))]:[];
 return legacyPanel(kind==='signup'?'Active Port Battle Signups':'Rosters Index',body,{...o,rows,preferred:kind==='signup',pageKind:kind==='signup'?'index':'rosterindex',pageId:o.guildId});
}
/** One V2 section per guild, packed under message text and component limits. */
export function schedulePanels(active:any[],o:PanelOptions){
 const guilds=new Map((o.guilds??[]).map(g=>[String(g.tag).toUpperCase(),g]));
 const groups=new Map<string,any[]>();
 for(const b of active.filter(b=>!b.status||['OPEN','CLOSED'].includes(b.status))){const tag=String(b.signup_guild??'BOM').toUpperCase();if(tag==='YIP')continue;groups.set(tag,[...(groups.get(tag)??[]),b]);}
 const blocks:any[]=[];
 for(const [tag,battles] of groups){const g=guilds.get(tag)??{tag};const emoji=g.emoji||o.dutyEmojis?.bom||'⚓';const header=`## ${emoji} ${text(g.tag??tag)}`;
 const lines=battles.map(b=>`**Battle of ${text(b.port_name)}**\n${text(b.attacker)} vs. ${text(b.defender)}\n${pbTimestamp(b.starts_at)}\n${pbRate(b.rate)} · ${Number(b.team_size)||20}v${Number(b.team_size)||20} · Confirmed **${Number(b.confirmed_count)||0}/${Number(b.team_size)||20}**${b.discord_signup_message_id&&b.discord_signup_channel_id?`\n[Open signup](https://discord.com/channels/${o.guildId}/${b.discord_signup_channel_id}/${b.discord_signup_message_id})`:''}`);
 const sections:string[]=[];let body=header;for(const line of lines){if(body.length+line.length>2700){sections.push(body);body=header+' · Continued';}body+='\n\n'+line;}sections.push(body+(lines.length?'':'\nNo port battles scheduled.'));
 const raw=g.logoUrl||'/wosb/pb/bom-logo.png',logo=raw.startsWith('/')?o.base+raw:raw;
 for(const content of sections)blocks.push(o.base||!raw.startsWith('/')?{type:9,components:[{type:10,content}],accessory:{type:11,media:{url:logo}}}:{type:10,content});
 }
 if(!blocks.length)blocks.push({type:10,content:'No port battles scheduled.'});
 const pages:any[]=[];let rows:any[]=[],length=0;
 const finish=()=>{if(!rows.length)return;const components:any[]=[{type:10,content:'## Port Battle Schedule'}];if(o.banner)components.unshift({type:12,items:[{media:{url:o.banner}}]});for(const row of rows)components.push(sep(),row);if(o.base)components.push(sep(),pbRow(pbLink('Schedule a Port Battle',o.base+'/dashboard/port-battles?schedule=1')));pages.push({flags:32768,allowedMentions:{parse:[]},components:[{type:17,accent_color:PB_LEGACY_GOLD,components}]});rows=[];length=0;};
 for(const block of blocks){const n=block.content?.length??block.components[0].content.length;if(rows.length&&(rows.length>=5||length+n>3500))finish();rows.push(block);length+=n;}finish();return pages;
}
export function schedulePanel(active:any[],o:PanelOptions){return schedulePanels(active,o)[0];}

/** Discord adds component IDs and default false values; neither changes the authored panel. */
export function samePBPanel(message:any,payload:any){
 const clean=(v:any):any=>Array.isArray(v)?v.map(clean):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>!['id','proxy_url','width','height','content_type','attachment_id','loading_state'].includes(k)&&v[k]!==undefined&&v[k]!==false&&v[k]!==null).map(k=>[k,clean(v[k])])):v;
 if((message.embeds??[]).length||!(Number(message.flags?.bitfield??message.flags??0)&32768))return false;
 return JSON.stringify(clean((message.components??[]).map((c:any)=>c.toJSON?.()??c)))===JSON.stringify(clean(payload.components));
}
