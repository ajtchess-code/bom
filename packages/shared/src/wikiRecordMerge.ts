/** Complete a current record field-by-field without promoting reference snapshots. */
export function wikiRecordIsHistorical(r:any){return Boolean(r.qualifiers?.historical||r.qualifiers?.historicalSnapshot||r.qualifiers?.advisory||r.qualifiers?.current===false||r.data?.historicalSnapshot||r.data?.codexSnapshot);}
export function wikiRecordPriority(a:any,b:any){
 const stamp=(r:any)=>Date.parse(String(r.qualifiers?.asOf??r.data?.asOf??''))||0;
 return Number(Boolean(b.qualifiers?.current))-Number(Boolean(a.qualifiers?.current))||Number(wikiRecordIsHistorical(a))-Number(wikiRecordIsHistorical(b))||stamp(b)-stamp(a)||String(a.source_id??a.sourceId??'').localeCompare(String(b.source_id??b.sourceId??''));
}
export function wikiKnownValue(v:any):boolean{return v!=null&&(typeof v!=='string'||v.trim()!==''&&v.trim()!=='—'&&v.trim()!=='-')&&(!Array.isArray(v)||v.length>0);}
export function mergeWikiRecordData(records:any[]){
 const current=records.filter(r=>!wikiRecordIsHistorical(r));const ranked=[...(current.length?current:records)].sort(wikiRecordPriority);
 const merge=(target:any,source:any)=>{if(!source||typeof source!=='object'||Array.isArray(source))return;for(const [key,value]of Object.entries(source)){
  if(['__proto__','prototype','constructor'].includes(key)||!wikiKnownValue(value))continue;
  if(value&&typeof value==='object'&&!Array.isArray(value)){if(!target[key]||typeof target[key]!=='object'||Array.isArray(target[key]))target[key]={};merge(target[key],value);}
  else if(!wikiKnownValue(target[key]))target[key]=structuredClone(value);
 }};
 const data:any={};for(const r of ranked)merge(data,r.data??{});return data;
}
export function wikiNumber(value:any):number|null{
 if(typeof value==='number')return Number.isFinite(value)?value:null;
 if(typeof value!=='string'||!value.trim())return null;
 const match=value.trim().replace(/,/g,'').match(/^[+-]?\d+(?:\.\d+)?/);if(!match)return null;
 const n=Number(match[0]);return Number.isFinite(n)?n:null;
}
