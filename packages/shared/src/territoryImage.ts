import './mapFonts.js';
/** Server-only map renderer. Do not export from the browser-facing shared index. */
import sharp,{type OverlayOptions} from 'sharp';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {portTaxes,portStatus,nextPortAttackAt,isFixedPort} from './territory.js';
const root=new URL('../../../',import.meta.url);
const fontfile=fileURLToPath(new URL('../assets/fonts/DejaVuSans-Bold.ttf',import.meta.url));
const escape=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
let staticGeography:Promise<Buffer>|null=null;
async function mapBackground(){if(!staticGeography)staticGeography=readFile(new URL('apps/dashboard/public/wosb/map/world-map.png',root)).then(buf=>sharp(buf).resize(1863,1551).png().toBuffer()).catch(e=>{staticGeography=null;throw e;});return staticGeography;}
export function clusterMapPorts(ports:any[],distance=24){
 const groups:any[][]=[];
 for(const port of [...ports].sort((a,b)=>String(a.name).localeCompare(String(b.name)))){
  const x=Number(port.lng)*15.51,y=(100-Number(port.lat))*15.51;
  if(!Number.isFinite(x)||!Number.isFinite(y))continue;
  const group=groups.find(group=>group.some(p=>Math.hypot(Number(p.lng)*15.51-x,(100-Number(p.lat))*15.51-y)<distance));
  if(group)group.push(port);else groups.push([port]);
 }
 return groups;
}
export async function renderTerritoryMap(ports:any[],now=Date.now()) {
 const width=1863,height=1551;
 const background=await mapBackground();
 const overlays:OverlayOptions[]=[];
 const occupied:{left:number;top:number;width:number;height:number}[]=[];
 const markers:string[]=[];
 for(const group of clusterMapPorts(ports)) {
  const p=group[0];
  if(!Number.isFinite(Number(p.lng))||!Number.isFinite(Number(p.lat)))continue;
  const x=Math.round(Number(p.lng)*height/100),y=Math.round((100-Number(p.lat))*height/100),s=portStatus(p,now);
  const owner=p.owner_tag?`[${p.owner_tag}]`:p.owner_tag===undefined?'Unverified':'Unowned';
  const next=nextPortAttackAt(p,now);
  const duration=(ms:number)=>`${(Math.max(0,ms)/3600000).toFixed(1)}h`;
  const availability=Date.parse(p.tension_battle_at??'')>now?`TENSION · Battle in ${duration(Date.parse(p.tension_battle_at)-now)}`:isFixedPort(p.name)?'Fixed port':next===null?'Attack window not set':next<=now?'ATTACKABLE NOW':`Attack in ${duration(next-now)}`;
  const taxes=portTaxes(p);
  const lines=[String(p.name),owner,...taxes.slice(0,3).map(t=>`Tax: ${t.tag} · ${Date.parse(t.protected_until??'')>now?duration(Date.parse(t.protected_until!)-now):'expired'}`),...(taxes.length>3?[`+${taxes.length-3} taxes (see summary)`]:[]),...(s.protected?[`Protected: ${duration(s.protectionMs)}`]:[]),availability];
  if(group.length>1){lines.splice(0,lines.length,`Cluster · ${group.length} ports`,...group.flatMap(port=>{const at=nextPortAttackAt(port,now),status=Date.parse(port.tension_battle_at??'')>now?`TENSION · Battle in ${duration(Date.parse(port.tension_battle_at)-now)}`:at===null?'No window':at<=now?'Attack now':`Attack in ${duration(at-now)}`;return [String(port.name),`${port.owner_tag?'['+port.owner_tag+']':'Unowned'} · ${status}`,...portTaxes(port).map(tax=>`Tax: ${tax.tag}`)];}));}
  const {data,info}=await sharp({text:{text:lines.map(line=>`<span foreground="white">${escape(line)}</span>`).join('\n'),font:'DejaVu Sans Bold 14',fontfile,width:210,align:'center',rgba:true,spacing:3}}).png().toBuffer({resolveWithObject:true});
  const w=info.width+12,h=info.height+10;
  // Search around the marker on both axes; minimize crowding when no free slot exists.
  const positions=[] as {left:number;top:number;cost:number}[];
  for(const dx of [0,-w/2,w/2,-w,w,-w*1.5,w*1.5])for(const dy of [18,-h-18,45,-h-45,75,-h-75,110,-h-110]){
    const l=Math.round(Math.max(28,Math.min(width-w-28,x-w/2+dx)));
    const t=Math.round(Math.max(28,Math.min(height-h-28,y+dy)));
    const overlap=occupied.reduce((a,r)=>a+Math.max(0,Math.min(l+w,r.left+r.width+4)-Math.max(l,r.left-4))*Math.max(0,Math.min(t+h,r.top+r.height+4)-Math.max(t,r.top-4)),0);
    positions.push({left:l,top:t,cost:overlap+(Math.abs(dx)+Math.abs(dy))*0.02});
  }
  // A full-grid fallback finds a free callout slot in dense regions.
  if(!positions.some(p=>p.cost<10))for(let l=28;l<width-w-28;l+=Math.max(40,w/2))for(let y0=28;y0<height-h-28;y0+=Math.max(30,h/2)){
   const overlap=occupied.reduce((n,r)=>n+Math.max(0,Math.min(l+w,r.left+r.width+5)-Math.max(l,r.left-5))*Math.max(0,Math.min(y0+h,r.top+r.height+5)-Math.max(y0,r.top-5)),0);
   positions.push({left:Math.round(l),top:Math.round(y0),cost:overlap*1000+Math.hypot(l+w/2-x,y0+h/2-y)*.01});
  }
  positions.sort((a,b)=>a.cost-b.cost);
  const {left:l,top}=positions[0];occupied.push({left:l,top,width:w,height:h});
  overlays.push({input:Buffer.from(`<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="4" fill="#101820" fill-opacity=".9"/></svg>`),left:l,top});
  overlays.push({input:data,left:l+6,top:top+5});
  markers.push(`<path d="M${x} ${y} L${x} ${top>y?top:top+h}" stroke="#d5c49c" stroke-width="1"/>${s.active||s.soon||s.protected?`<circle cx="${x}" cy="${y}" r="16" fill="none" stroke="${s.active?'#f26363':s.soon?'#f6d365':'#a7b2c2'}" stroke-width="3" ${s.protected?'stroke-dasharray="4 3"':''}/>`:''}<circle cx="${x}" cy="${y}" r="10" fill="${s.color==='transparent'?'#18232c':s.color}" stroke="#101820" stroke-width="2"/>${group.length>1?`<text x="${x}" y="${y+4}" text-anchor="middle" fill="white" font-size="12">${group.length}</text>`:''}`);
 }
 return sharp(background).resize(width,height).composite([{input:Buffer.from(`<svg width="${width}" height="${height}">${markers.join('')}</svg>`)},...overlays]).png().toBuffer();
}
