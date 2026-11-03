import {createHash} from 'node:crypto';
const normalize=(s:any)=>String(s??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const fields:[string,RegExp,string][]=[['hold',/\b(?:cargo|hold|capacity|carry|carrying)\b/i,'base cargo capacity'],['durability',/\b(?:durability|health|hp)\b/i,'durability'],['armor',/\barmo[u]?r\b/i,'armor'],['speed',/\b(?:speed|fast)\b/i,'speed'],['maneuverability',/\b(?:maneuverability|manoeuvrability)\b/i,'maneuverability'],['crew',/\bcrew\b/i,'crew capacity'],['guns',/\b(?:guns|cannons)\b/i,'gun count']];
export function isAskRetry(text:string){const plain=text.replace(/<@&\d+>/g,'').trim();return /\b(?:you (?:do |should )?know|try again|look again|check again|recheck|already (?:have|know)|do know the answer)\b/i.test(plain)&&!(/\b(?:is|should be|equals?|correct(?:ed)?(?: value)?)\s*[:=]?\s*\d/i.test(plain)||/\bsource:/.test(plain));}
/** Exact hull + one base stat + agreeing current records. No model inference or per-entity row collapse. */
export function shipFactFromRecords(question:string,records:any[]){
 const requested=fields.filter(([,re])=>re.test(question));if(requested.length!==1||/\b(?:upgrad\w*|lantern|purser|double hold|cellars|sturdy frame|build|bonus|percent|overweight)\b/i.test(question))return null;
 const [field,,label]=requested[0],q=` ${normalize(question)} `,ships=records.filter(r=>r.kind==='ship'&&!r.qualifiers?.historical&&!r.qualifiers?.historicalSnapshot&&!r.qualifiers?.advisory&&r.qualifiers?.current!==false),groups=new Map<string,any[]>();
 for(const r of ships){const names=[r.name,...(Array.isArray(r.aliases)?r.aliases:[])];if(!names.some(name=>normalize(name)&&q.includes(` ${normalize(name)} `)))continue;const rows=groups.get(r.entity_key)??[];rows.push(r);groups.set(r.entity_key,rows);}
 if(groups.size!==1)return null;
 const rows=[...groups.values()][0],backing=rows.filter(r=>typeof r.data?.stats?.[field]==='number'&&Number.isFinite(r.data.stats[field])),values=[...new Set(backing.map(r=>r.data.stats[field]))];if(values.length!==1)return null;
 const value=values[0],name=String(rows[0].name),formatted=Number(value).toLocaleString('en-US'),answer=field==='hold'?`${name} has a base cargo capacity of **${formatted} weight units**. Cargo upgrades and other bonuses can change this.`:`${name}'s ${label} is **${formatted}**.`;
 const sources=backing.map(r=>{const content=JSON.stringify(r.data);return {id:`record:${r.entity_key}:${r.source_id??'wiki'}:${r.record_key??r.id??'record'}`,title:`${name} · ${r.source_name??r.source_id??'Wiki record'}`,content,revision:createHash('sha256').update(content).digest('hex'),kind:'record' as const};});
 return {answer,sources,field,entityKey:rows[0].entity_key};
}
