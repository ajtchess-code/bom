/** Daily port windows use the same local game-clock offset as PB scheduling. */
export const territoryKey=(v:unknown)=>String(v??'').normalize('NFKD').replace(/[^a-z0-9]/gi,'').toLowerCase();
export const TRADER_PORTS=['Sharhat','Assab','Al-Khalif'];
export const FIXED_PORTS=['Corsa-Noir Bay','Aldansk','Freedom Bay','Freebooter Bay','St. Jean','Tortuga','Nordberg','Surako','Naabad','Santa Marta','Puerto Salada','Pirate City','El Tigre',...TRADER_PORTS];
export const isTraderPort=(name:string)=>territoryKey(name)==='portassab'||TRADER_PORTS.some(p=>territoryKey(p)===territoryKey(name));
export const isFixedPort=(name:string)=>isTraderPort(name)||FIXED_PORTS.some(p=>territoryKey(p)===territoryKey(name))||['corsanoisbay','stjohn','naabadstronghold','santamaria'].includes(territoryKey(name));
export function zonedParts(ms:number,zone:string){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(ms).map(p=>[p.type,p.value]));}
export function zonedInstant(date:string,minute:number,zone:string){const [y,m,d]=date.split('-').map(Number);const desired=Date.UTC(y,m-1,d,0,minute);let t=desired;for(let i=0;i<4;i++){const p=zonedParts(t,zone);const actual=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);t+=desired-actual;}return t;}
export function portWindows(port:any,from:number,to:number):{start:number;end:number}[]{
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(port.window_start??'')||!portWindowEnd(port.window_start??''))return [];
 const zone=port.time_zone??'America/Chicago',a=String(port.window_start).split(':').map(Number),b=portWindowEnd(port.window_start).split(':').map(Number),start=a[0]*60+a[1],end=b[0]*60+b[1],offset=Number(port.game_offset_minutes??60),p=zonedParts(from,zone),base=Date.UTC(+p.year,+p.month-1,+p.day);const rows=[];
 for(let i=-2;i<Math.ceil((to-from)/86400000)+3;i++){const date=new Date(base+i*86400000).toISOString().slice(0,10);const s=zonedInstant(date,start+offset,zone),e=zonedInstant(date,end+offset+(end<=start?1440:0),zone);if(e>from&&s<to)rows.push({start:s,end:e});}return rows;
}
export function portStatus(port:any,now=Date.now()){
 const protectedUntil=effectiveProtectionUntil(port);
 const windows=portWindows(port,now-86400000,now+3*86400000);
 const pending=supportsPortTension(port.name)&&Date.parse(port.tension_battle_at??'')>now;
 const active=!pending&&!isFixedPort(port.name)&&protectedUntil<=now&&windows.some(w=>w.start<=now&&w.end>now);
 const next=windows.find(w=>w.start>now&&w.end>protectedUntil);
 const soon=!pending&&!isFixedPort(port.name)&&protectedUntil<=now&&Boolean(next&&next.start-now<7200000);
 const tag=String(port.owner_tag??'').toUpperCase();
 const color=!Object.prototype.hasOwnProperty.call(port,'owner_tag')?'#718096':!tag?'#ffffff':['BOM','BOM 2'].includes(tag)?'#4cce87':['FAT','DPS'].includes(tag)?'#62a8ff':active?'#f26363':soon?'#f6d365':'transparent';
 return {active,soon,color,protected:protectedUntil>now,protectionMs:Math.max(0,protectedUntil-now),nextStart:next?.start??null};
}
export function couldChange(port:any,from:number,to:number){if(isFixedPort(port.name))return false;const until=effectiveProtectionUntil(port),since=effectiveProtectionSince(port);return portWindows(port,from,to).some(w=>Math.max(w.start,from)<Math.min(w.end,to)&&!(since<=Math.max(w.start,from)&&until>=Math.min(w.end,to)));}
/** Reconstruct protection/window changes so clearing a shield cannot rewrite the day. */
export function couldChangeWithHistory(port:any,events:any[],from:number,to:number){
 if(isFixedPort(port.name))return false;
 const timeline=events.filter(e=>Date.parse(e.created_at)>=from&&Date.parse(e.created_at)<to).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at));
 let state=timeline.length?{...port,...(timeline[0].snapshot?.before??{} )}:port,cursor=from;
 const possible=(p:any,a:number,b:number)=>b>a&&(!p.window_start||couldChange(p,a,b));
 for(const event of timeline){const at=Math.min(to,Date.parse(event.created_at));if(possible(state,cursor,at))return true;state={...port,...event.snapshot.after};cursor=at;}
 return possible(state,cursor,to);
}

export const TAX_PROTECTION_MS = 3.2 * 86400000;
/** Only a new taxation event restarts the default timer; ordinary edits preserve it. */
export function territoryProtection(current:any, change:any, now=Date.now()) {
 const days=Number(change.protectionDays??0),hours=Number(change.protectionHours??0),minutes=Number(change.protectionMinutes??0);
 if(!Number.isFinite(days)||days<0||days>365||!Number.isInteger(hours)||hours<0||hours>23||!Number.isInteger(minutes)||minutes<0||minutes>59)throw new Error('Invalid Protection Duration');
 const manual=(days*1440+hours*60+minutes)*60000;
 const newTax=Boolean(change.taxingTag)&& (change.action==='TAX'||String(change.taxingTag)!==String(current?.taxing_tag??''));
 if(change.clearProtection)return {protection_started_at:null,protected_until:null};
 const duration=change.adjustProtection||manual>0?manual:newTax?TAX_PROTECTION_MS:0;
 if(duration)return {protection_started_at:new Date(now).toISOString(),protected_until:new Date(now+duration).toISOString()};
 if(change.adjustProtection)return {protection_started_at:null,protected_until:null};
 return {protection_started_at:current?.protection_started_at??null,protected_until:current?.protected_until??null};
}

/** Protection can end inside an attack window, making that instant the next opportunity. */
export function nextPortAttackAt(port:any,now=Date.now()):number|null {
 if(isFixedPort(port.name))return null;
 const after=Math.max(now,effectiveProtectionUntil(port));
 const window=portWindows(port,after,after+3*86400000).find(w=>w.end>after);
 return window?Math.max(after,window.start):null;
}
/** Remaining attack opportunities on the current calendar day in the map timezone. */
export function todayAttackPorts(ports:any[],now=Date.now(),zone='America/Chicago') {
 const p=zonedParts(now,zone),end=zonedInstant(`${p.year}-${p.month}-${p.day}`,1440,zone);
 return ports.filter(port=>{const pending=Date.parse(port.tension_battle_at??'');const at=nextPortAttackAt(port,now);return pending>now&&pending<end||at!==null&&at<end;});
}
export function territoryMapSummary(ports:any[],now=Date.now(),budget=3500,context:{guilds?:any[];diplomacy?:any;detailed?:boolean}={}) {
 const stamp=(ms:number)=>`**<t:${Math.floor(ms/1000)}:t>** · **<t:${Math.floor(ms/1000)}:R>**`;
 const safe=(v:unknown)=>String(v??'').replace(/[\\*_~`<>|]/g,'').slice(0,70);
 const list=context.detailed?[...ports]:todayAttackPorts(ports,now),guilds=context.guilds??[],dip=context.diplomacy??{};
 const group=(p:any)=>{const g=guilds.find(g=>territoryKey(g.tag)===territoryKey(p.owner_tag)),m=dip.memberships?.find((m:any)=>territoryKey(m.guildTag)===territoryKey(p.owner_tag)),a=dip.alliances?.find((a:any)=>a.id===m?.allianceId);return {priority:['bom','fat','dps'].includes(territoryKey(p.owner_tag))?0:1,faction:g?.faction??'Unaligned',alliance:a?.name??'Independent guilds'};};
 list.sort((a,b)=>{const x=group(a),y=group(b);return x.priority-y.priority||String(x.faction).localeCompare(String(y.faction))||x.alliance.localeCompare(y.alliance)||(nextPortAttackAt(a,now)??Infinity)-(nextPortAttackAt(b,now)??Infinity);});
 const lines:string[]=[];let last='',shown=0;
 for(const p of list){const at=nextPortAttackAt(p,now),until=effectiveProtectionUntil(p),g=group(p),heading=g.priority===0?'BOM · FAT · DPS':`${safe(g.faction)} · ${safe(g.alliance)}`;
  const status=isFixedPort(p.name)?'🔵':at!==null&&at<=now?'🟢':at!==null&&at-now<=7200000?'🟡':'🔴';
  const attack=Date.parse(p.tension_battle_at??'')>now?'Battle pending '+stamp(Date.parse(p.tension_battle_at)):isFixedPort(p.name)?'Fixed port':at===null?'Attack window not set':at<=now?'Available for attack **now**':`Available for attack ${stamp(at)}`;
  const pending=Date.parse(p.tension_battle_at??'');
  const line=`${pending>now?'⚔ Tension':status} **${safe(p.name)}** ${p.owner_tag?'['+safe(p.owner_tag)+']':''} — ${until>now?`Protection ends ${stamp(until)} (${attack})`:attack}`;
  const title=last!==heading?`**${heading}**\n`:'';
  if(lines.join('\n').length+title.length+line.length+140>budget)continue;
  if(title)lines.push(title.trimEnd());lines.push(line);last=heading;shown++;
 }
 if(shown<list.length)lines.push(`\n${list.length-shown} more ports — open Detailed Battle Map or the dashboard.`);
 return lines.join('\n')||(context.detailed?'No ports recorded.':'No remaining attack opportunities today. Open Detailed Battle Map for every port.');
}

export type PortTax={id:string;tag:string;started_at:string|null;protected_until:string|null};
export function portTaxes(port:any):PortTax[]{
 let taxes=port.taxes;if(typeof taxes==='string'){try{taxes=JSON.parse(taxes);}catch{taxes=[];}}
 if(Array.isArray(taxes))return taxes.filter(t=>t&&typeof t.tag==='string');
 return port.taxing_tag?[{id:'legacy-'+(port.port_key??territoryKey(port.name)),tag:port.taxing_tag,started_at:port.protection_started_at??null,protected_until:port.protected_until??null}]:[];
}
export function effectiveProtectionUntil(port:any){return Math.max(0,Date.parse(port.protected_until??'')||0);}
export function effectiveProtectionSince(port:any){return Date.parse(port.protection_started_at??'')||0;}
/** Tax entries keep independent deadlines. Durations are never added together. */
export function updatePortTaxes(current:any,change:any,now=Date.now()):PortTax[]{
 const existing=portTaxes(current??{});
 if(change.action==='LIBERATE')return [];
 let incoming=change.taxes;
 if(incoming===undefined){
  if(!Object.prototype.hasOwnProperty.call(change,'taxingTag'))return existing;
  if(existing.length>1){
   if(change.action!=='TAX'&&String(change.taxingTag??'')===existing[0].tag)return existing;
   throw new Error('This port has multiple taxes. Reload and use the multi-tax editor.');
  }
  incoming=change.taxingTag?[{id:existing[0]?.id??'legacy-'+(current?.port_key??'tax'),tag:String(change.taxingTag),renew:change.action==='TAX',...change,taxes:undefined}]:[];
 }
 if(!Array.isArray(incoming)||incoming.length>50)throw new Error('Enter up to 50 tax entries');
 const ids=new Set<string>();
 return incoming.map((entry:any)=>{
  const id=String(entry.id??''),tag=String(entry.tag??'').trim();
  if(!id||id.length>100||ids.has(id)||!tag)throw new Error('Each tax needs a unique ID and a guild');ids.add(id);
  const old=existing.find(t=>t.id===id);
  const protection=territoryProtection({taxing_tag:old?.tag,protection_started_at:old?.started_at,protected_until:old?.protected_until},{...entry,taxingTag:tag,action:!old||old.tag!==tag||entry.renew?'TAX':'UPDATE'},now);
  return {id,tag,started_at:protection.protection_started_at,protected_until:protection.protected_until};
 });
}

/** Port attack windows always last one hour, including midnight rollover. */
export function portWindowEnd(start:string):string {
 const match=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(start??'');
 if(!match)return '';
 return `${String((Number(match[1])+1)%24).padStart(2,'0')}:${match[2]}`;
}

/** Names changed in game; retain the established marker key and coordinates. */
export function canonicalPortName(name:string){const key=territoryKey(name);return ({northbastion:'Bastion of the North',southbastion:'Bastion of the South',assab:'Port Assab'} as Record<string,string>)[key]??name;}
export function stablePortKey(name:string){const key=territoryKey(name);return ({bastionofthenorth:'northbastion',bastionofthesouth:'southbastion',portassab:'assab'} as Record<string,string>)[key]??key;}
export const supportsPortTension=(name:string)=>['lanavidad','everston'].includes(territoryKey(name));
