import {guildReference} from './guildCatalogue.js';
export type Diplomacy={trackedGuilds:string[];alliances:{id:string;name:string;color:string}[];memberships:{guildTag:string;allianceId:string}[];relations:{from:string;to:string;status:'ALLIED'|'NEUTRAL'|'NAP'|'HOSTILE';directed:boolean}[]};
export const emptyDiplomacy=():Diplomacy=>({trackedGuilds:[],alliances:[],memberships:[],relations:[]});
/** Keep previously explicit memberships/treaties, never the automatically displayed catalogue. */
export function normalizeDiplomacy(input:any):Diplomacy {
 const d=input??{},memberships=Array.isArray(d.memberships)?d.memberships:[],relations=Array.isArray(d.relations)?d.relations:[];
 const trackedGuilds=Array.isArray(d.trackedGuilds)?d.trackedGuilds:[...new Set<string>([...memberships.map((m:any)=>m.guildTag),...relations.flatMap((r:any)=>[r.from,r.to].filter((s:any)=>typeof s==='string'&&s.startsWith('guild:')).map((s:string)=>s.slice(6)))].filter(Boolean))];
 return {trackedGuilds,alliances:(Array.isArray(d.alliances)?d.alliances:[]).map((a:any)=>({id:a.id,name:a.name,color:a.color})),memberships,relations};
}
export function validateDiplomacy(input:any,tags:string[]):Diplomacy {
 for(const key of ['trackedGuilds','alliances','memberships','relations'])if(!Array.isArray(input?.[key]))throw Error(`Missing ${key}`);
 const data:Diplomacy=normalizeDiplomacy(JSON.parse(JSON.stringify(input)));
 if(data.trackedGuilds.length>500||data.alliances.length>60||data.memberships.length>500||data.relations.length>500)throw Error('Diplomacy chart is too large');
 const resolve=(t:any)=>{if(typeof t!=='string')return undefined;if(tags.includes(t))return t;const matches=tags.filter(s=>s.toLowerCase()===t.toLowerCase());return matches.length===1?matches[0]:undefined;};
 const selected=new Set<string>();data.trackedGuilds=data.trackedGuilds.map(t=>{const canonical=resolve(t);if(!canonical||selected.has(canonical))throw Error('Choose each known guild once');selected.add(canonical);return canonical;});
 const alliances=new Set<string>();for(const row of data.alliances){
  if(!row||!/^[a-zA-Z0-9_-]{1,60}$/.test(row.id)||row.id==='__independent__'||alliances.has(row.id))throw Error('Use unique alliance IDs');alliances.add(row.id);
  if(typeof row.name!=='string'||!row.name.trim()||row.name.length>80)throw Error('Name must be 1–80 characters');row.name=row.name.trim();
  if(!/^#[a-f0-9]{6}$/i.test(row.color))throw Error('Use a six-digit hex color');
 }
 const assigned=new Set<string>();for(const row of data.memberships){const tag=resolve(row?.guildTag);if(!tag||!selected.has(tag)||!alliances.has(row.allianceId)||assigned.has(tag))throw Error('Each tracked guild may belong to one alliance');row.guildTag=tag;assigned.add(tag);}
 const endpoints=new Set([...selected].map(t=>'guild:'+t).concat(data.alliances.map(a=>'alliance:'+a.id))),edges=new Set<string>(),mutual=new Set<string>(),pairs=new Set<string>();
 for(const row of data.relations){if(!row||!endpoints.has(row.from)||!endpoints.has(row.to)||row.from===row.to||!['ALLIED','NEUTRAL','NAP','HOSTILE'].includes(row.status)||typeof row.directed!=='boolean')throw Error('Relationships must use tracked guilds or alliances');const pair=[row.from,row.to].sort().join('|'),key=row.from+'|'+row.to;if((row.directed&&(edges.has(key)||mutual.has(pair)))||(!row.directed&&pairs.has(pair)))throw Error('Duplicate or conflicting relationship');if(row.directed)edges.add(key);else mutual.add(pair);pairs.add(pair);}
 return data;
}
const xml=(s:any)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
/** Membership groups and external treaties are separate so connectors never cross guilds. */
export function allianceChartSvg(data:Diplomacy,guilds:{tag:string;reference?:string;name?:string}[]){
 data=normalizeDiplomacy(data);
 const guildRows=data.trackedGuilds.map(ref=>guilds.find(g=>guildReference(g)===ref)??{tag:ref,reference:ref}).sort((a,b)=>a.tag.localeCompare(b.tag));
 const groups=[...data.alliances.map(a=>({...a,guilds:guildRows.filter(g=>data.memberships.some(m=>m.guildTag===guildReference(g)&&m.allianceId===a.id))})),{id:'__independent__',name:'Independent guilds',color:'#8b9bab',guilds:guildRows.filter(g=>!data.memberships.some(m=>m.guildTag===guildReference(g)))}].filter(g=>g.guilds.length||g.id!=='__independent__');
 const columns=3,cellW=480,width=1500,rowHeights:number[]=[];
 for(let i=0;i<groups.length;i+=columns)rowHeights.push(Math.max(260,...groups.slice(i,i+columns).map(g=>112+Math.ceil(g.guilds.length/2)*56)));
 let shapes='';
 for(let i=0;i<groups.length;i++){
  const g=groups[i],col=i%columns,row=Math.floor(i/columns),x=30+col*cellW,y=120+rowHeights.slice(0,row).reduce((a,b)=>a+b,0),h=rowHeights[row]-20;
  shapes+=`<g data-alliance-group="${xml(g.id)}"><rect x="${x}" y="${y}" width="460" height="${h}" rx="18" fill="${xml(g.color)}" fill-opacity=".07" stroke="${xml(g.color)}"/><text x="${x+20}" y="${y+32}" fill="${xml(g.color)}" font-size="18" font-weight="bold">${xml(g.name)}</text><text x="${x+20}" y="${y+55}" fill="#a5b7c2" font-size="13">${g.guilds.length} guild${g.guilds.length===1?'':'s'} · ${g.id==='__independent__'?'No alliance membership':'Alliance members'}</text>`;
  g.guilds.forEach((guild,n)=>{const gx=x+20+(n%2)*220,gy=y+75+Math.floor(n/2)*56;shapes+=`<g data-member="${xml(guildReference(guild))}"><title>${xml(guild.name??guild.tag)}</title><rect x="${gx}" y="${gy}" width="200" height="42" rx="10" fill="#12232d" stroke="${xml(g.color)}" stroke-opacity=".6"/><text x="${gx+100}" y="${gy+27}" text-anchor="middle" font-size="16" fill="#e3f4ff">${xml(guild.tag)}</text></g>`;});
  if(!g.guilds.length)shapes+=`<text x="${x+20}" y="${y+100}" fill="#a5b7c2" font-size="14">No guilds assigned</text>`;
  shapes+='</g>';
 }
 const colors={ALLIED:'#52b9ae',NAP:'#e7b858',HOSTILE:'#f27364',NEUTRAL:'#9aabb8'},treatyY=140+rowHeights.reduce((a,b)=>a+b,0),treatyH=100+Math.max(1,data.relations.length)*72,height=treatyY+treatyH+80;
 const endpoint=(ref:string)=>{const alliance=ref.startsWith('alliance:');return {label:alliance?data.alliances.find(a=>a.id===ref.slice(9))?.name??ref:guildRows.find(g=>guildReference(g)===ref.slice(6))?.tag??ref.slice(6),scope:alliance?'Alliance-wide':'Guild only'};};
 let treaties=`<g data-external-treaties="true"><rect x="30" y="${treatyY}" width="1420" height="${treatyH}" rx="18" fill="#132630" stroke="#405360"/><text x="50" y="${treatyY+32}" fill="#f4d49b" font-size="22">External treaties</text><text x="50" y="${treatyY+57}" fill="#a5b7c2" font-size="14">These are explicit relationships. A guild-only treaty does not extend to its alliance.</text>`;
 data.relations.forEach((edge,i)=>{const a=endpoint(edge.from),b=endpoint(edge.to),y=treatyY+98+i*72,color=colors[edge.status];treaties+=`<g data-treaty-from="${xml(edge.from)}" data-treaty-to="${xml(edge.to)}"><title>${xml(a.label)} ${edge.directed?'→':'↔'} ${xml(b.label)}: ${edge.status}</title><text x="65" y="${y}" fill="#e3f4ff" font-size="18">${xml(a.label)}</text><text x="65" y="${y+21}" fill="#a5b7c2" font-size="13">${a.scope}</text><text x="540" y="${y}" fill="${color}" font-size="17">${edge.directed?'→':'↔'} ${edge.status} · ${edge.directed?'One-way':'Mutual'}</text><text x="960" y="${y}" fill="#e3f4ff" font-size="18">${xml(b.label)}</text><text x="960" y="${y+21}" fill="#a5b7c2" font-size="13">${b.scope}</text></g>`;});
 if(!data.relations.length)treaties+=`<text x="65" y="${treatyY+105}" fill="#a5b7c2" font-size="16">No external treaties recorded.</text>`;
 treaties+='</g>';
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#0e1d27"/><g font-family="DejaVu Sans, sans-serif"><text x="40" y="47" font-size="30" fill="#f4d49b">WoSB Alliance Chart</text><text x="40" y="77" font-size="15" fill="#a5b7c2">Alliance membership above · Explicit external treaties below · ↔ Mutual · → One-way</text>${groups.length?shapes:'<text x="40" y="125" fill="#e3f4ff" font-size="20">No guilds or alliances tracked. Add them in the dashboard.</text>'}${treaties}<text x="40" y="${height-30}" font-size="14" fill="#a5b7c2">Unlisted relationships are unknown. Treaty scope is explicit; moving a guild does not create new treaties.</text></g></svg>`;
}
