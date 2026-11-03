/** Deterministic cargo corrections, including commas and k shorthand. */
export function cargoCorrection(statement:string,records:any[],contextEntityKey?:string):any{
 if(/\b(?:upgrad|fitted|with sails|my build|loaded|remaining|free space|bonus)/i.test(statement))return {clarification:'Is that the base cargo capacity, or capacity with upgrades? Please specify the base capacity before changing the ship record.'};
 const m=statement.match(/\b(?:can\s+(?:carry|hold)|carries|holds|(?:base\s+)?(?:cargo(?:\s+(?:hold|capacity))?|hold(?:\s+capacity)?))\s*(?:(?:is|of|=|should be|can be|now)\s*)?(\d[\d,]*(?:\.\d+)?\s*k?)\b/i);
 if(!m)return null;
 const number=m[1].replace(/[\s,]/g,'');const value=parseFloat(number)*(/k$/i.test(number)?1000:1);
 if(!Number.isFinite(value)||value<=0||value>10_000_000)return {clarification:'Please provide a positive base cargo capacity, up to 10,000,000.'};
 const norm=(s:string)=>s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
 const text=` ${norm(statement)} `;const matches=new Map<string,any>();
 for(const r of records.filter(r=>r.kind==='ship')){let aliases=r.aliases??[];if(typeof aliases==='string')try{aliases=JSON.parse(aliases);}catch{aliases=[];}if([r.name,...(Array.isArray(aliases)?aliases:[])].some(n=>norm(String(n)).length>=3&&text.includes(` ${norm(String(n))} `)))matches.set(r.entity_key,r);}
 if(!matches.size&&contextEntityKey&&/^\s*(?:it|that ship|its|the (?:cargo|hold))\b/i.test(statement)){const r=records.find(r=>r.kind==='ship'&&r.entity_key===contextEntityKey);if(r)matches.set(r.entity_key,r);}
 if(matches.size!==1)return {clarification:matches.size?'Which ship are you correcting? Please name one ship per correction.':'Which ship has that base cargo capacity?'};
 return {entityKey:[...matches.keys()][0],fieldPath:'stats.hold',value,note:statement};
}
