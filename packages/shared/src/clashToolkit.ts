/** BOM Clash Toolkit. Catalog: chiefpansancolt/clash-of-clans-data (MIT).
 * Potion coverage adapted from LukasMFR/clash-potion-calculator (MIT),
 * copyright (c) 2025 Lukas MAUFFRE. Full licenses and original files in third_party/. */
export type ClashLevel={level:number;supercharge?:boolean;cost:number|null;resource:string|null;seconds:number|null;hall:number|null;laboratory?:number|null;heroHall?:number|null;petHouse?:number|null;blacksmith?:number|null;hitpoints?:number|null;damage?:number|null;earthquakePercent?:number|null;ore:{shiny:number;glowing:number;starry:number};stats?:any};
export type ClashItem={id:string;slug:string;name:string;base:string;category:string;housing?:number|null;hero?:string;levels:ClashLevel[];availability?:any[]};
export type ClashCatalog={source:any;items:ClashItem[]};
export type VillageEntry={key:string;dataId:string;name:string;base:string;category:string;level:number;timerSeconds:number;known:boolean};
export type VillageImport={tag:string;exportedAt:string;townHall:number|null;builderHall:number|null;entries:VillageEntry[];warnings:string[]};
export type UpgradeTask={id:string;entryKey:string;accountId:string;name:string;base:string;category:string;fromLevel:number;toLevel:number;seconds:number;cost:number;resource:string;lane:string;dependsOn:string[];blocked:string[];earliestAt?:string};
const fail=(message:string):never=>{throw new Error(message);};
function integer(v:any,min=0,max=1e12){if(!Number.isInteger(v)||v<min||v>max)fail('Expected a bounded whole number');return Number(v);}
export function normalizeVillageExport(raw:unknown,catalog:ClashCatalog,now=Date.now()):VillageImport{
 const source=typeof raw==='string'?JSON.parse(raw):raw;if(!source||typeof source!=='object'||Array.isArray(source))fail('Paste a village JSON object');const v=source as any;
 if(!/^#[0289PYLQGRJCUV]{3,15}$/i.test(v.tag??''))fail('Village export must include a valid player tag');
 let timestamp=typeof v.timestamp==='number'?v.timestamp:null;if(timestamp&&timestamp<1e12)timestamp*=1000;
 if(!timestamp||!Number.isFinite(timestamp)||timestamp>now+300000||timestamp<Date.UTC(2012,0,1))fail('Village export has an invalid timestamp');
 const lookup=new Map(catalog.items.map(i=>[i.id,i])),warnings:string[]=[],entries:VillageEntry[]=[];
 const sections=[['buildings','home'],['traps','home'],['units','home'],['siege_machines','home'],['spells','home'],['heroes','home'],['pets','home'],['equipment','home'],['buildings2','builder'],['traps2','builder'],['units2','builder'],['heroes2','builder']];
 const counts=new Map<string,number>();
 for(const [section,base] of sections){const rows=v[section];if(rows==null)continue;if(!Array.isArray(rows)||rows.length>2000)fail('Invalid or oversized '+section+' section');
  for(const row of rows){if(!row||typeof row!=='object')fail('Invalid export row');const id=String(integer(row.data??row.dataId,1,999999999)),level=integer(row.lvl??row.level??0,0,500),count=integer(row.cnt??1,1,600),timer=integer(row.timer??0,0,315360000),item=lookup.get(id);
   if(entries.length+count>5000)fail('Village export has too many entries');if(!item)warnings.push('Unknown data ID '+id+' retained without inferred costs');if(timer&&count>1)warnings.push('Grouped active timer for '+(item?.name??id)+' assigned only to its first copy; confirm in game');
   for(let copy=0;copy<count;copy++){const ordinal=(counts.get(base+':'+id)??0)+1;counts.set(base+':'+id,ordinal);entries.push({key:`${base}:${id}:${ordinal}`,dataId:id,name:item?.name??`Unknown ${id}`,base,category:item?.category??section,level,timerSeconds:copy===0?timer:0,known:!!item});}
  }
 }
 if(!entries.length)fail('Export does not contain recognized village sections');
 const hall=(slug:string)=>Math.max(0,...entries.filter(e=>lookup.get(e.dataId)?.slug===slug).map(e=>e.level))||null;
 return {tag:v.tag.toUpperCase(),exportedAt:new Date(timestamp).toISOString(),townHall:hall('town-hall'),builderHall:hall('builder-hall'),entries,warnings:[...new Set(warnings)]};
}
export function nextUpgrades(village:VillageImport,catalog:ClashCatalog):UpgradeTask[]{
 const lookup=new Map(catalog.items.map(i=>[i.id,i])),buildingLevel=(slug:string,base:string)=>Math.max(0,...village.entries.filter(e=>e.base===base&&lookup.get(e.dataId)?.slug===slug).map(e=>e.level));
 return village.entries.flatMap(e=>{
  const item=lookup.get(e.dataId),level=item?.levels.find(l=>l.level===e.level+1&&!l.supercharge);if(!item||!level||e.category==='hero-equipment')return [];
  const blocked:string[]=[];if(e.timerSeconds>0)blocked.push('Upgrade already active in the imported snapshot');
  const hall=e.base==='builder'?village.builderHall:village.townHall;if(level.hall&&hall==null)blocked.push('Hall level missing from export');if(level.hall!=null&&hall!=null&&level.hall>hall)blocked.push(`Requires ${e.base==='builder'?'Builder Hall':'Town Hall'} ${level.hall}`);
  for(const [key,slug] of [['laboratory',e.base==='builder'?'star-laboratory':'laboratory'],['heroHall','hero-hall'],['petHouse','pet-house'],['blacksmith','blacksmith']] as const){const required=level[key];if(required&&buildingLevel(slug,e.base)<required)blocked.push(`Requires ${slug.replaceAll('-',' ')} ${required}`);}
  if(level.seconds==null||level.cost==null||!level.resource)blocked.push('Catalog has no complete cost/time for this upgrade');
  const lane=e.category==='hero'?'builders':e.category==='pet'?'pets':['troop','spell','siege-machine'].includes(e.category)?'laboratory':'builders';
  return [{id:village.tag+':'+e.key+':'+level.level,entryKey:e.key,accountId:village.tag,name:e.name,base:e.base,category:e.category,fromLevel:e.level,toLevel:level.level,seconds:level.seconds??0,cost:level.cost??0,resource:level.resource??'Unknown',lane,dependsOn:[],blocked}];
 });
}
export function prioritizeUpgrades(tasks:UpgradeTask[],goal:'OFFENSE'|'WAR'|'BALANCED'|'MAXING'='BALANCED'){
 const weights:Record<string,Record<string,number>>={OFFENSE:{army:100,hero:90,troop:85,spell:85,'siege-machine':80,pet:75},WAR:{hero:100,troop:95,spell:95,pet:90,army:85,defense:70},BALANCED:{army:80,hero:75,resource:70,defense:65,troop:70,spell:70},MAXING:{}};
 return tasks.map(t=>({task:t,score:(weights[goal][t.category]??50)+(goal==='MAXING'?Math.min(40,t.seconds/86400):0),explanation:`${goal.toLowerCase()} goal · ${t.category} · ${(t.seconds/86400).toFixed(1)} builder/research days${t.blocked.length?' · prerequisites need attention':''}`})).sort((a,b)=>Number(!!a.task.blocked.length)-Number(!!b.task.blocked.length)||b.score-a.score||a.task.id.localeCompare(b.task.id));
}
export function scheduleUpgrades(tasks:UpgradeTask[],options:{startAt:string;builders:number;builderBaseBuilders:number;laboratories?:number;petSlots?:number;boostPercent?:number}){
 const start=Date.parse(options.startAt);if(!Number.isFinite(start))fail('Invalid plan start');
 const builders=integer(options.builders,1,6),bb=integer(options.builderBaseBuilders,1,3),lab=integer(options.laboratories??1,1,1),pets=integer(options.petSlots??1,1,1),boost=Number(options.boostPercent??0);if(!Number.isFinite(boost)||boost<0||boost>80)fail('Boost must be between 0% and 80%');
 if(tasks.length>1000)fail('Plan exceeds 1000 upgrades');const lanes=new Map<string,number[]>(),done=new Map<string,number>(),pending=[...tasks],rows:any[]=[],skipped:any[]=[];const ids=new Set<string>();for(const t of tasks){if(ids.has(t.id))fail('Duplicate task ID');ids.add(t.id);if(!Number.isFinite(t.seconds)||t.seconds<0)fail('Invalid task duration');}
 while(pending.length){let changed=false;
  for(let i=0;i<pending.length;){const t=pending[i];if(t.blocked.length){skipped.push({id:t.id,reasons:t.blocked});pending.splice(i,1);changed=true;continue;}if(t.dependsOn.some(id=>!done.has(id))){i++;continue;}
   const key=`${t.accountId}:${t.base}:${t.lane}`,n=t.lane==='builders'?(t.base==='builder'?bb:builders):t.lane==='pets'?pets:lab,slots=lanes.get(key)??Array(n).fill(start);lanes.set(key,slots);
   const lane=slots.indexOf(Math.min(...slots)),earliest=t.earliestAt?Date.parse(t.earliestAt):start;if(!Number.isFinite(earliest))fail('Invalid earliest start');const begin=Math.max(start,slots[lane],earliest,...t.dependsOn.map(id=>done.get(id)!)),duration=Math.ceil(t.id.startsWith('active:')?t.seconds:t.seconds*(1-boost/100)),end=begin+duration*1000;
   slots[lane]=end;done.set(t.id,end);rows.push({...t,slot:lane+1,laneKey:key,startAt:new Date(begin).toISOString(),endAt:new Date(end).toISOString(),scheduledSeconds:duration});pending.splice(i,1);changed=true;
  }
  if(!changed){skipped.push(...pending.map(t=>({id:t.id,reasons:['Missing or cyclic dependency']})));break;}
 }
 const totals:Record<string,number>={};for(const t of rows)totals[t.resource]=(totals[t.resource]??0)+t.cost;
 return {rows,skipped,resourceTotals:totals,finishAt:new Date(Math.max(start,...rows.map(t=>Date.parse(t.endAt)))).toISOString(),assumptions:['Resources are available at each scheduled start.','Builder, lab and pet lanes are separate per village/base.','Boost is a fixed user-entered time reduction.','Only explicit dependencies are enforced.']};
}
export function potionSavings(seconds:number,potions:number,kind:'BUILDER'|'RESEARCH'|'PET'){
 if(!Number.isFinite(seconds)||seconds<0)fail('Invalid remaining duration');integer(potions,0,10000);
 // Adapted from Lukas MAUFFRE: potion coverage = one real hour times the speed multiplier.
 const speed=kind==='BUILDER'?10:24,covered=potions*3600*speed,under=Math.min(seconds,covered)/speed,normal=Math.max(0,seconds-covered),remaining=Math.ceil(under+normal);
 return {remainingSeconds:remaining,savedSeconds:Math.max(0,seconds-remaining),speed,potionsNeeded:Math.ceil(seconds/(3600*speed))};
}
export function magicItemComparison(tasks:UpgradeTask[],kind:'BOOK'|'HAMMER'|'BUILDER_POTION'|'RESEARCH_POTION'|'PET_POTION',count=1){
 integer(count,1,1000);return tasks.filter(t=>!t.blocked.length).filter(t=>kind==='BUILDER_POTION'?t.lane==='builders':kind==='RESEARCH_POTION'?t.lane==='laboratory':kind==='PET_POTION'?t.lane==='pets':true).map(t=>({id:t.id,name:t.name,timeSavedSeconds:kind==='BOOK'||kind==='HAMMER'?t.seconds:potionSavings(t.seconds,count,kind==='BUILDER_POTION'?'BUILDER':kind==='PET_POTION'?'PET':'RESEARCH').savedSeconds,resourceSaved:kind==='HAMMER'?t.cost:0,resource:t.resource})).sort((a,b)=>b.timeSavedSeconds-a.timeSavedSeconds);
}
export function equipmentOre(item:ClashItem,current:number,target:number,inventory={shiny:0,glowing:0,starry:0},daily={shiny:0,glowing:0,starry:0}){
 integer(current,0,100);integer(target,current,100);const costs={shiny:0,glowing:0,starry:0};for(let n=current+1;n<=target;n++){const level=item.levels.find(l=>l.level===n);if(!level)throw new Error('Equipment level missing from pinned catalog');for(const k of ['shiny','glowing','starry'] as const)costs[k]+=Number(level.ore?.[k]??0);}
 const remaining={shiny:0,glowing:0,starry:0};let days=0;for(const k of ['shiny','glowing','starry'] as const){if(!Number.isFinite(inventory[k])||inventory[k]<0||!Number.isFinite(daily[k])||daily[k]<0)fail('Ore inputs must be nonnegative');remaining[k]=Math.max(0,costs[k]-inventory[k]);days=Math.max(days,remaining[k]?(daily[k]>0?Math.ceil(remaining[k]/daily[k]):Infinity):0);}return {costs,remaining,estimatedDays:Number.isFinite(days)?days:null};
}
export function spellDamage(hp:number,lightningDamage:number,lightningCount:number,quakePercent:number,quakeCount:number){
 if(!Number.isFinite(hp)||hp<=0||!Number.isFinite(lightningDamage)||lightningDamage<0||!Number.isFinite(quakePercent)||quakePercent<0||quakePercent>100)fail('Invalid target/spell statistics');integer(lightningCount,0,30);integer(quakeCount,0,12);
 let quakeDamage=0;for(let i=0;i<quakeCount;i++)quakeDamage+=hp*(quakePercent/100)/(2*i+1);const damage=quakeDamage+lightningDamage*lightningCount;return {damage,remainingHp:Math.max(0,hp-damage),destroyed:damage+1e-9>=hp,assumptions:'Ordinary non-immune building; earthquakes applied before lightning. No supercharge, equipment effects, walls or special target immunity.'};
}
export function parseArmyLink(input:string,catalog:ClashCatalog){
 let code=input.trim();if(code.length>4000)fail('Army link is too long');if(/^https?:/i.test(code)){const u=new URL(code);if(u.protocol!=='https:'||u.hostname!=='link.clashofclans.com'||u.searchParams.get('action')!=='CopyArmy')fail('Use an official HTTPS CopyArmy link');code=u.searchParams.get('army')??'';}
 if(!/^(?:[us](?:\d+x\d+)(?:-\d+x\d+)*){1,2}$/.test(code))fail('Unsupported army code. Only troop/spell sections can be parsed; retain other loadout choices as notes.');
 const entries:any[]=[],sections=[...code.matchAll(/([us])([^us]+)/g)],seen=new Set<string>();for(const m of sections){if(seen.has(m[1]))fail('Duplicate army section');seen.add(m[1]);for(const token of m[2].split('-')){const [amount,id]=token.split('x').map(Number);integer(amount,1,500);integer(id,0,1000000);const dataId=String((m[1]==='u'?4000000:26000000)+id),item=catalog.items.find(i=>i.id===dataId&&i.base==='home');entries.push({type:m[1],id:dataId,amount,name:item?.name??`Unknown ${dataId}`,housing:item?.housing??null});}}
 const sum=(type:string)=>entries.filter(e=>e.type===type).reduce((v,e)=>v+(e.housing??0)*e.amount,0);return {code,url:'https://link.clashofclans.com/en?action=CopyArmy&army='+encodeURIComponent(code),entries,troopSpace:sum('u'),spellSpace:sum('s'),unknownHousing:entries.some(e=>e.housing==null)};
}
export function officialBaseLink(input:string){const u=new URL(input);if(u.protocol!=='https:'||u.hostname!=='link.clashofclans.com'||u.searchParams.get('action')!=='OpenLayout'||!u.searchParams.get('id'))fail('Use an official HTTPS OpenLayout link');return u.toString();}
export function warAnalysis(snapshots:any[],history:any[],clanTags:string[]){
 const wars=new Map<string,{data:any;seen:number}>();for(const s of [...history,...snapshots]){if(!s.resource?.endsWith(':war')&&!s.resource?.endsWith(':cwlwar'))continue;const w=s.data;if(!w?.startTime||!Array.isArray(w.clan?.members))continue;const key=[w.startTime,w.clan?.tag,w.opponent?.tag].join(':'),seen=Date.parse(s.fetched_at??s.created_at??0)||0;if(!wars.has(key)||wars.get(key)!.seen<seen)wars.set(key,{data:w,seen});}
 const players=new Map<string,any>();let observedWars=0;
 for(const {data:w} of wars.values()){const own=clanTags.includes(w.clan?.tag)?w.clan:clanTags.includes(w.opponent?.tag)?w.opponent:null;if(!own)continue;observedWars++;const enemy=own===w.clan?w.opponent:w.clan,targets=new Map((enemy?.members??[]).map((m:any)=>[m.tag,m])),attacks=(own.members??[]).flatMap((m:any)=>(m.attacks??[]).map((a:any)=>({...a,attacker:m}))).sort((a:any,b:any)=>(a.order??Infinity)-(b.order??Infinity)),seenTargets=new Set();
  for(const m of own.members){const p=players.get(m.tag)??{tag:m.tag,name:m.name,townHall:m.townhallLevel??null,appearances:0,attacks:0,stars:0,triples:0,freshHits:0,followUps:0,unclassified:0,destruction:0,missed:0,expected:0,hitContexts:[]};p.appearances++;const expected=Number(w.attacksPerMember??1);if(w.state==='warEnded')p.expected+=expected;if(w.state==='warEnded')p.missed+=Math.max(0,expected-(m.attacks??[]).length);players.set(m.tag,p);}
  for(const a of attacks){const p=players.get(a.attacker.tag),target:any=targets.get(a.defenderTag);p.attacks++;p.stars+=Number(a.stars??0);p.triples+=a.stars===3?1:0;p.destruction+=Number(a.destructionPercentage??0);if(a.order==null)p.unclassified++;else if(seenTargets.has(a.defenderTag))p.followUps++;else p.freshHits++;seenTargets.add(a.defenderTag);p.hitContexts.push({warStart:w.startTime,attackerTH:a.attacker.townhallLevel??null,defenderTH:target?.townhallLevel??null,stars:a.stars,order:a.order??null});}
 }
 return {observedWars,players:[...players.values()].map(p=>({...p,tripleRate:p.attacks?p.triples/p.attacks:null,averageDestruction:p.attacks?p.destruction/p.attacks:null,reliability:p.expected?Math.max(0,1-p.missed/p.expected):null})),dataLabel:'Observed API war snapshots; raw attack stars, not incremental scoreboard stars.'};
}
export function suggestLineup(candidates:any[],size:number,options:{minTownHall?:number;maxAccountsPerMember?:number}={}){
 integer(size,1,50);const max=integer(options.maxAccountsPerMember??2,1,12),ranked=candidates.filter(p=>p.available!==false&&Number(p.townHall??0)>=Number(options.minTownHall??0)).map(p=>{
  const reliability=p.reliability??0.5,triples=p.tripleRate??0.5,readiness=p.ready==null?0.5:p.ready===false?0:1,rotation=1/(1+Number(p.recentSelections??0));const score=35*reliability+25*triples+20*Math.min(1,Number(p.townHall??0)/18)+10*rotation+10*readiness;
  return {...p,score,explanation:[p.reliability==null?'Reliability unknown: neutral weight':`${Math.round(reliability*100)}% observed attendance`,p.tripleRate==null?'Attack performance unknown: neutral weight':`${Math.round(triples*100)}% observed triple rate`,`${p.recentSelections??0} recent selections`,p.ready===false?'Readiness declared incomplete':'Check hero/equipment readiness'],confidence:p.attacks>=5?'observed':'limited sample'};
 }).sort((a,b)=>b.score-a.score||String(a.tag).localeCompare(String(b.tag))),selected:any[]=[],reserves:any[]=[],counts=new Map<string,number>();
 for(const p of ranked){const member=p.userId??p.tag;if(selected.length<size&&(counts.get(member)??0)<max){selected.push(p);counts.set(member,(counts.get(member)??0)+1);}else reserves.push(p);}return {selected,reserves,shortfall:Math.max(0,size-selected.length)};
}
export function cwlScenarios(rows:any[],options={teamSize:15,winBonus:10}){
 integer(options.teamSize,5,50);integer(options.winBonus,0,100);return rows.map(r=>{for(const k of ['stars','remaining','projectedStars','projectedWins'])if(!Number.isFinite(Number(r[k]))||Number(r[k])<0)fail('Scenario inputs must be nonnegative');if(Number(r.projectedWins)>Number(r.remaining))fail('Wins exceed remaining wars');if(Number(r.projectedStars)>Number(r.remaining)*options.teamSize*3)fail('Projected stars exceed the maximum');return {...r,projectedTotal:Number(r.stars)+Number(r.projectedStars)+Number(r.projectedWins)*options.winBonus,maximum:Number(r.stars)+Number(r.remaining)*(options.teamSize*3+options.winBonus)};}).sort((a,b)=>b.projectedTotal-a.projectedTotal||Number(b.destruction??0)-Number(a.destruction??0));
}
export function clanHealth(latest:any,history:any[],analysis:any){
 const roster=latest?.memberList??[],older=history.filter(h=>h.data?.tag===latest?.tag&&Array.isArray(h.data?.memberList)).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at))[0]?.data;
 const prev=new Map((older?.memberList??[]).map((m:any)=>[m.tag,m])),now=new Set(roster.map((m:any)=>m.tag));
 return {members:roster.map((m:any)=>{const before:any=prev.get(m.tag),war=analysis.players.find((p:any)=>p.tag===m.tag),reset=before&&Number(m.donations)<Number(before.donations);return {tag:m.tag,name:m.name,townHall:m.townHallLevel??null,donations:m.donations??null,donationDelta:before&&!reset?Number(m.donations??0)-Number(before.donations??0):null,flags:[...(reset?['Donation counter reset; delta unknown']:[]),...(war?.missed?['Missed '+war.missed+' attacks in observed completed wars']:[]),...(!before?['New to observed roster']:[])],war};}),joined:roster.filter((m:any)=>!prev.has(m.tag)).map((m:any)=>m.tag),left:[...prev.keys()].filter(tag=>!now.has(tag)),windowLabel:older?'Compared with earliest retained snapshot':'No earlier roster snapshot'};
}
export function compareRecruit(profile:any,requirements:{minTownHall:number;minDonations:number;minHeroAverage:number}){
 const heroes=(profile?.heroes??[]).filter((h:any)=>h.village==='home'),average=heroes.length?heroes.reduce((s:number,h:any)=>s+Number(h.level??0),0)/heroes.length:null;
 return [{label:'Town Hall',value:profile?.townHallLevel??null,required:requirements.minTownHall},{label:'Current donation counter',value:profile?.donations??null,required:requirements.minDonations},{label:'Mean home hero level',value:average,required:requirements.minHeroAverage}].map(r=>({...r,result:r.value==null?'UNKNOWN':r.value>=r.required?'MEETS':'BELOW'}));
}
export function safeCsv(rows:any[][]){return rows.map(row=>row.map(v=>{let s=String(v??'');if(/^(?:\s*[=+@\-]|[\t\r])/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n');}
