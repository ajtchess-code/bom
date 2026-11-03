export type ResolverSettings={searchChain:string[];maxCandidates:number;rejectVariants:boolean;fallbackOnFailure:boolean;preferredSource:string|null};
export type ResolvedTrack={selected:any;remainder:any[];fallbacks:any[];resolution:{strategy:string;score:number;provider:string;attempts:number;matchedQuery:string;fallbackProviders:string[]}};

const variantTerms=["live","remix","sped up","sped-up","slowed","nightcore","cover","karaoke","instrumental","extended","bass boosted","1 hour","10 hour","loop"];
function clean(s:string){return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g," ").trim();}
function tokens(s:string){return new Set(clean(s).split(/\s+/).filter(Boolean));}
function overlap(a:Set<string>,b:Set<string>){if(!a.size||!b.size)return 0;let n=0;for(const x of a)if(b.has(x))n++;return n/Math.max(a.size,b.size);}
function info(t:any){return t?.info??{};}
function providerOf(t:any){return String(info(t).sourceName??"unknown").toLowerCase();}
function scoreTrack(t:any,query:string,preferredSource:string|null,rejectVariants:boolean){
  const i=info(t),q=clean(query),title=clean(String(i.title??"")),author=clean(String(i.author??""));
  const qt=tokens(q),tt=tokens(`${title} ${author}`);let score=overlap(qt,tt)*70;
  if(title&&q.includes(title))score+=18;if(author&&q.includes(author))score+=12;
  if(preferredSource&&providerOf(t).includes(preferredSource.toLowerCase()))score+=6;
  for(const term of variantTerms){if((title.includes(term)||author.includes(term))&&!q.includes(term))score-=rejectVariants?26:8;}
  const length=Number(i.length??0);if(length>60*60*1000&&!/hour|mix|set|playlist/.test(q))score-=18;
  if(i.isStream)score-=8;
  return Math.round(score*100)/100;
}
function tracksFromResult(result:any):any[]{if(!result)return[];if(result.loadType==="track")return result.data?[result.data]:[];if(result.loadType==="search")return Array.isArray(result.data)?result.data:[];if(result.loadType==="playlist")return result.data?.tracks??[];return[];}
function isDirect(q:string){return /^https?:\/\//i.test(q)||/^[a-z]+(?:search|rec):/i.test(q);}
export function resolverSettingsFromEnv():ResolverSettings{
  const chain=(process.env.LAVALINK_SEARCH_CHAIN??"ytmsearch:,ytsearch:,scsearch:").split(",").map(x=>x.trim()).filter(Boolean);
  return {searchChain:chain.length?chain:["ytmsearch:","ytsearch:"],maxCandidates:Math.max(2,Math.min(25,Number(process.env.RESOLVER_MAX_CANDIDATES??10))),rejectVariants:(process.env.RESOLVER_REJECT_VARIANTS??"true").toLowerCase()!=="false",fallbackOnFailure:(process.env.RESOLVER_FALLBACK_ON_FAILURE??"true").toLowerCase()!=="false",preferredSource:(process.env.RESOLVER_PREFERRED_SOURCE??"").trim()||null};
}

export function resolverSettingsFromRow(row:any,base=resolverSettingsFromEnv()):ResolverSettings{
  const parseList=(v:any,fallback:string[])=>{if(Array.isArray(v))return v.map(String);if(typeof v==="string")try{const x=JSON.parse(v);if(Array.isArray(x))return x.map(String);}catch{}return fallback;};
  return {searchChain:parseList(row?.search_chain,base.searchChain),maxCandidates:Math.max(2,Math.min(25,Number(row?.max_candidates??base.maxCandidates))),rejectVariants:row?.reject_variants===undefined?base.rejectVariants:Boolean(row.reject_variants),fallbackOnFailure:row?.fallback_on_failure===undefined?base.fallbackOnFailure:Boolean(row.fallback_on_failure),preferredSource:String(row?.preferred_source??base.preferredSource??"").trim()||null};
}

export async function resolveSmart(node:any,query:string,settings=resolverSettingsFromEnv()):Promise<ResolvedTrack>{
  if(isDirect(query)){
    const result=await node.rest.resolve(query),tracks=tracksFromResult(result);if(!tracks.length)throw new Error("No playable track matched the request");
    const directFallbacks=settings.fallbackOnFailure&&result?.loadType!=="playlist"?tracks.slice(1,Math.min(settings.maxCandidates,6)):[];return {selected:tracks[0],remainder:result?.loadType==="playlist"?tracks.slice(1,250):[],fallbacks:directFallbacks,resolution:{strategy:result?.loadType==="playlist"?"direct-playlist":"direct",score:100,provider:providerOf(tracks[0]),attempts:1,matchedQuery:query,fallbackProviders:directFallbacks.map(providerOf)}};
  }
  const attempts=await Promise.all(settings.searchChain.map(async prefix=>{try{const result=await node.rest.resolve(`${prefix}${query}`);return {prefix,result,tracks:tracksFromResult(result)}}catch{return {prefix,result:null,tracks:[] as any[]}}}));
  const ranked=attempts.flatMap(a=>a.tracks.slice(0,settings.maxCandidates).map(t=>({track:t,prefix:a.prefix,score:scoreTrack(t,query,settings.preferredSource,settings.rejectVariants)}))).sort((a,b)=>b.score-a.score);
  if(!ranked.length)throw new Error("No playable track matched the request across configured sources");
  const best=ranked[0],unique:any[]=[];const bestInfo=info(best.track),seen=new Set<string>([`${bestInfo.sourceName}:${bestInfo.identifier}`]);if(settings.fallbackOnFailure)for(const r of ranked.slice(1)){const i=info(r.track),k=`${i.sourceName}:${i.identifier}`;if(seen.has(k))continue;seen.add(k);unique.push(r.track);if(unique.length>=5)break;}
  return {selected:best.track,remainder:[],fallbacks:unique,resolution:{strategy:"scored-multisource",score:best.score,provider:providerOf(best.track),attempts:attempts.length,matchedQuery:`${best.prefix}${query}`,fallbackProviders:unique.map(providerOf)}};
}
