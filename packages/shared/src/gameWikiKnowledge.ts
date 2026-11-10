/** Server-only access to the current static game release for Discord and API answers. */
import {readFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {readFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {resolve} from 'node:path';
const normalize=(s:string)=>s.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const stop=new Set('what which when where how does do is are the a an of for in on to with much many tell me about can have has it its and or my ship ships stats base current please'.split(' '));
type Hit={table:string;row:number;name:string;text:string};
let cached:{path:string;release:string;expires:number;rows:Hit[]}|null=null;
async function index(){
  let directory=process.env.WOSB_WIKI_DIR;
  if(!directory)try{directory=JSON.parse(readFileSync('data/wiki-active.json','utf8')).directory;}catch{}
  const path=resolve(directory||'data/wiki-v2');
  const catalog=JSON.parse(await readFile(resolve(path,'catalog.json'),'utf8'));
  if(cached?.path!==path||cached.release!==catalog.release||cached.expires<Date.now())cached={path,release:catalog.release,expires:Date.now()+60_000,rows:JSON.parse(await readFile(resolve(path,'search.json'),'utf8'))};
  return {...cached,asOf:catalog.asOf};
}
async function record(path:string,table:string,row:number){
  const pages=JSON.parse(await readFile(resolve(path,'indexes',`${table}.json`),'utf8'));
  const point=pages[Math.floor(row/100)];if(!point)return null;
  const input=createReadStream(resolve(path,'tables',table,point.file),{start:point.offset}),lines=createInterface({input,crlfDelay:Infinity});
  let n=0;try{for await(const line of lines){if(!line.trim())continue;if(n++===row%100)return JSON.parse(line);}}finally{lines.close();input.destroy();}return null;
}
export async function gameWikiSources(question:string){
  try{
    const data=await index(),q=normalize(question),words=q.split(' ').filter(w=>w.length>2&&!stop.has(w));
    if(!words.length)return [];
    const ranked=data.rows.map(r=>{
      const name=normalize(r.name),titleHits=words.filter(w=>name.includes(w)).length;
      const exactName=name.length>3&&(` ${q} `).includes(` ${name} `);
      const content=r.text.toLowerCase(),bodyHits=words.filter(w=>content.includes(w)).length;
      return {r,score:(exactName?1000+name.length:0)+titleHits*20+bodyHits,eligible:exactName||titleHits>0||bodyHits>=Math.min(3,words.length)};
    }).filter(x=>x.eligible&&x.score>0).sort((a,b)=>b.score-a.score).slice(0,6);
    const base=(process.env.PUBLIC_DASHBOARD_URL||'').replace(/\/$/,'');
    return await Promise.all(ranked.map(async({r})=>({id:`game:${r.table}:${r.row}`,title:r.name,content:`Static game client snapshot ${data.asOf}. Preserve original units and unknowns. Store flags and price limits are not live stock or prices. Raw fields take precedence over descriptive labels when they disagree; state the conflict.\n${JSON.stringify(await record(data.path,r.table,r.row))}`,revision:data.release,kind:'record' as const,url:`${base}/dashboard/wiki?table=${encodeURIComponent(r.table)}&record=${r.row}`})));
  }catch(e:any){if(e.code==='ENOENT')return [];throw e;}
}
export async function searchGameWiki(query:string){
  try{
    const data=await index(),terms=normalize(query).split(' ').filter(Boolean).slice(0,12);if(!terms.length)return [];
    return data.rows.filter(r=>terms.every(t=>normalize(r.text).includes(t))).map(r=>({...r,score:terms.reduce((n,t)=>n+(normalize(r.name).includes(t)?10:1),0)})).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,100).map(r=>({name:r.name,kind:r.table,entityKey:`game:${r.table}:${r.row}`,table:r.table,row:r.row,href:`/dashboard/wiki?table=${r.table}&record=${r.row}`}));
  }catch(e:any){if(e.code==='ENOENT')return null;throw e;}
}
export async function gameWikiShipFact(question:string){
  const data=await index().catch((e:any)=>{if(e.code==='ENOENT')return null;throw e;});if(!data)return null;
  const q=normalize(question),hits=data.rows.filter(r=>r.table==='ShipsToPlay'&&(` ${q} `).includes(` ${normalize(r.name)} `));
  if(hits.length!==1)return null;const hit=hits[0];
  const ship=await record(data.path,hit.table,hit.row);if(!ship)return null;
  const fields:[RegExp,string,string][]=[[/\b(speed|fast)\b/,'BasicSpeed','base speed'],[/\b(health|durability|hull)\b/,'Health','base hull durability'],[/\b(armor|armour)\b/,'Armor','base armor'],[/\b(mobility|maneuverability|manoeuvrability)\b/,'BasicMobility','base maneuverability'],[/\b(crew)\b/,'BaseCrewPlaces','base crew places'],[/\b(rate|rating)\b/,'ShipRank','ship rate']];
  const found=fields.filter(([pattern])=>pattern.test(q));if(found.length!==1)return null;
  const [,key,label]=found[0];if(ship[key]==null)return null;
  if(/\b(vs|versus|compare|bonus|upgrade|modified|percent|with|without|after)\b/.test(q))return null;
  return {answer:`${hit.name}: ${label} is ${ship[key]} (unmodified client value; snapshot ${String(data.asOf).slice(0,10)}).`,sources:[{id:`game:${hit.table}:${hit.row}`,title:`${hit.name} · ShipsToPlay`,name:'Game client export',ref:`ShipsToPlay / record ${hit.row+1}`}],confidence:'confirmed' as const,intent:'game.client.ship_fact'};
}
