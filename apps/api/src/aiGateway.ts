/** BOM AI Gateway v4.2.9. Keys never leave API process; usage logs never store prompts. */
import {db,oneOrNone,many} from '@bom/db';
import {redis,stateBackend,reserveCounters} from '@bom/redis';

type Feature='banter'|'wiki'|'sentinel';
type Provider='groq'|'gemini'|'openai'|'none';
export type AiFeature=Feature;
export type AiProvider=Provider;
export type AiGatewayResult={text:string;requestId:string|null;urls:{url:string;title:string|null}[];provider:Exclude<Provider,'none'>;model:string};
export type AiGenerateArgs={feature:Feature;instructions?:string;input:string;maxOutputTokens?:number;timeoutMs?:number;webSearch?:boolean;sensitivity?:'public'|'private';providerOnly?:Exclude<Provider,'none'>};
export type AiRoute={feature:Feature;enabled:boolean;primary_provider:Provider;fallback_provider:Provider;groq_model:string;gemini_model:string;openai_model:string;allow_gemini_fallback:boolean;allow_private_gemini:boolean;daily_limit:number;minute_limit:number;updated_at?:string};
const GUILD_ID=process.env.DISCORD_GUILD_ID??'';
const FEATURES:Feature[]=['banter','wiki','sentinel'];
const PROVIDERS:Provider[]=['groq','gemini','openai','none'];
const MODEL_IDS:Record<Exclude<Provider,'none'>,string>={groq:'openai/gpt-oss-20b',gemini:'gemini-3.5-flash-lite',openai:'gpt-4.1-mini'};
const BASE:Record<Feature,AiRoute>={
  banter:{feature:'banter',enabled:true,primary_provider:'groq',fallback_provider:'gemini',groq_model:'openai/gpt-oss-20b',gemini_model:'gemini-3.5-flash-lite',openai_model:'gpt-4.1-mini',allow_gemini_fallback:false,allow_private_gemini:false,daily_limit:80,minute_limit:8},
  wiki:{feature:'wiki',enabled:true,primary_provider:'groq',fallback_provider:'gemini',groq_model:'openai/gpt-oss-120b',gemini_model:'gemini-3.5-flash-lite',openai_model:'gpt-4.1-mini',allow_gemini_fallback:true,allow_private_gemini:false,daily_limit:150,minute_limit:12},
  sentinel:{feature:'sentinel',enabled:true,primary_provider:'groq',fallback_provider:'gemini',groq_model:'openai/gpt-oss-120b',gemini_model:'gemini-3.5-flash-lite',openai_model:'gpt-4.1-mini',allow_gemini_fallback:false,allow_private_gemini:false,daily_limit:60,minute_limit:8}
};
const TOKEN_ESTIMATE=(s:string)=>Math.ceil(s.length/4);
const cooldownLocal=new Map<string,number>();
const routeCache=new Map<Feature,{at:number;value:AiRoute}>();
const today=()=>new Date().toISOString().slice(0,10);
const minute=()=>new Date().toISOString().slice(0,16);
const credentials=(p:Provider)=>p==='groq'?process.env.GROQ_API_KEY?.trim():p==='gemini'?process.env.GEMINI_API_KEY?.trim():p==='openai'?process.env.OPENAI_API_KEY?.trim():undefined;
export function providerConfigured(p:Provider){return p!=='none'&&Boolean(credentials(p));}
export function anyProviderConfigured(){return Boolean(credentials('groq')||credentials('gemini')||credentials('openai'));}
export function aiFeatureAvailable(feature:Feature){return anyProviderConfigured()&&process.env[`BOM_AI_${feature.toUpperCase()}_ENABLED`]?.toLowerCase()!=='false';}
export function clearRouteCache(){routeCache.clear();}

export async function getAiRoute(feature:Feature):Promise<AiRoute>{
  const cache=routeCache.get(feature);if(cache&&cache.at>Date.now())return cache.value;
  const defaults=BASE[feature];
  await db.query(`INSERT INTO bom_ai_routes(guild_id,feature,enabled,primary_provider,fallback_provider,groq_model,gemini_model,openai_model,allow_gemini_fallback,allow_private_gemini,daily_limit,minute_limit)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(guild_id,feature) DO NOTHING`,
    [GUILD_ID,feature,defaults.enabled,defaults.primary_provider,defaults.fallback_provider,defaults.groq_model,defaults.gemini_model,defaults.openai_model,defaults.allow_gemini_fallback,defaults.allow_private_gemini,defaults.daily_limit,defaults.minute_limit]);
  const value=await oneOrNone<AiRoute>(`SELECT feature,enabled,primary_provider,fallback_provider,groq_model,gemini_model,openai_model,allow_gemini_fallback,allow_private_gemini,daily_limit,minute_limit,updated_at FROM bom_ai_routes WHERE guild_id=$1 AND feature=$2`,[GUILD_ID,feature]);
  if(!value)throw new Error('ai_route_not_found');
  routeCache.set(feature,{at:Date.now()+10_000,value});return value;
}
export async function saveAiRoute(feature:Feature,change:Omit<AiRoute,'feature'|'updated_at'>,editor:string){
  await getAiRoute(feature);
  await db.query(`UPDATE bom_ai_routes SET enabled=$3,primary_provider=$4,fallback_provider=$5,groq_model=$6,gemini_model=$7,openai_model=$8,allow_gemini_fallback=$9,allow_private_gemini=$10,daily_limit=$11,minute_limit=$12,updated_by=$13,updated_at=NOW() WHERE guild_id=$1 AND feature=$2`,
    [GUILD_ID,feature,change.enabled,change.primary_provider,change.fallback_provider,change.groq_model,change.gemini_model,change.openai_model,change.allow_gemini_fallback,change.allow_private_gemini,change.daily_limit,change.minute_limit,editor]);
  clearRouteCache();return getAiRoute(feature);
}

// Redis holds *attempted* requests, shared among API processes. Redis failure fails closed.
async function reserve(feature:Feature,provider:Exclude<Provider,'none'>,route:AiRoute){
  const date=today(),minuteTag=minute();
  const cooldownKey=`ai:blocked:${provider}:${GUILD_ID}`;
  if(Date.now()<(cooldownLocal.get(cooldownKey)??0))return false;
  if(await redis.exists(cooldownKey))return false;
  const globalLimit=provider==='groq'?Math.max(1,Number(process.env.BOM_AI_GROQ_DAILY_CAP??900)):
    provider==='gemini'?Math.max(1,Number(process.env.BOM_AI_GEMINI_DAILY_CAP??40)):
    Math.max(1,Number(process.env.BOM_AI_OPENAI_DAILY_CAP??50));
  const providerMinute=provider==='groq'?25:provider==='gemini'?8:10;
  const limits:[string,number,number][]=[
    [`ai:day:feature:${GUILD_ID}:${feature}:${date}`,route.daily_limit,172800],
    [`ai:minute:feature:${GUILD_ID}:${feature}:${minuteTag}`,route.minute_limit,120],
    [`ai:day:provider:${GUILD_ID}:${provider}:${date}`,globalLimit,172800],
    [`ai:minute:provider:${GUILD_ID}:${provider}:${minuteTag}`,providerMinute,120]
  ];
  return reserveCounters(limits.map(([key,limit,ttlSeconds])=>({key,limit,ttlSeconds})));
}
async function block(provider:Exclude<Provider,'none'>,seconds:number){
  const ttl=Math.max(10,Math.min(21600,Math.ceil(seconds)));
  const key=`ai:blocked:${provider}:${GUILD_ID}`;cooldownLocal.set(key,Date.now()+ttl*1000);
  await redis.set(key,'1','EX',ttl).catch(()=>{});
}
function retrySeconds(value:string|null){
  if(!value)return 60;
  const n=Number(value);if(Number.isFinite(n)&&n>=0)return Math.min(21600,Math.max(10,n));
  const parsed=Date.parse(value);return Number.isFinite(parsed)?Math.min(21600,Math.max(10,(parsed-Date.now())/1000)):60;
}
class ProviderError extends Error{
  constructor(public provider:Exclude<Provider,'none'>,public kind:'auth'|'quota'|'transient'|'bad_request'|'empty',public status:number,public retryAfter:number=60){super(`ai_${provider}_${kind}`);}
}
async function requestJson(provider:Exclude<Provider,'none'>,url:string,headers:Record<string,string>,payload:unknown,timeout:number){
  let response:Response;
  try{response=await fetch(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(payload),signal:AbortSignal.timeout(Math.max(1500,Math.min(25000,timeout)))});}
  catch{throw new ProviderError(provider,'transient',0,35);}
  if(!response.ok){
    const status=response.status;
    // Never put upstream response bodies in logs: they may echo prompts or keys.
    const kind=status===401||status===403?'auth':status===429?'quota':status>=500?'transient':'bad_request';
    throw new ProviderError(provider,kind,status,retrySeconds(response.headers.get('retry-after')));
  }
  let body:any;try{body=await response.json();}catch{throw new ProviderError(provider,'empty',200,20);}
  return {body,requestId:response.headers.get('x-request-id')};
}
async function callProvider(provider:Exclude<Provider,'none'>,model:string,args:AiGenerateArgs):Promise<AiGatewayResult>{
  const key=credentials(provider);if(!key)throw new ProviderError(provider,'auth',0,600);
  const maxOutput=Math.max(32,Math.min(1600,Math.floor(Number(args.maxOutputTokens??320))));
  const timeout=args.timeoutMs??11000;
  if(provider==='groq'){
    const {body,requestId}=await requestJson(provider,'https://api.groq.com/openai/v1/chat/completions',{'authorization':`Bearer ${key}`},{model,messages:[{role:'system',content:args.instructions??'Answer clearly and concisely.'},{role:'user',content:args.input}],max_completion_tokens:maxOutput,temperature:args.feature==='banter'?0.85:0.15,...(model.startsWith('openai/gpt-oss-')?{reasoning_effort:'low'}:{})},timeout);
    const text=String(body?.choices?.[0]?.message?.content??'').trim();if(!text)throw new ProviderError(provider,'empty',200,20);
    return {text,requestId,urls:[],provider,model};
  }
  if(provider==='gemini'){
    if(!/^[a-zA-Z0-9._-]{3,90}$/.test(model))throw new ProviderError(provider,'bad_request',400);
    const {body,requestId}=await requestJson(provider,`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{'x-goog-api-key':key},{systemInstruction:{parts:[{text:args.instructions??'Answer clearly and concisely.'}]},contents:[{role:'user',parts:[{text:args.input}]}],generationConfig:{maxOutputTokens:maxOutput,temperature:args.feature==='banter'?0.85:0.15}},timeout);
    const text=(body?.candidates?.[0]?.content?.parts??[]).filter((p:any)=>typeof p?.text==='string').map((p:any)=>p.text).join('\n').trim();
    if(!text)throw new ProviderError(provider,'empty',200,20);
    return {text,requestId,urls:[],provider,model};
  }
  const base='https://api.openai.com/v1';
  const {body,requestId}=await requestJson(provider,`${base}/responses`,{'authorization':`Bearer ${key}`},{model,instructions:args.instructions,input:args.input,max_output_tokens:maxOutput},timeout);
  const text=String(body?.output_text??(body?.output??[]).flatMap((x:any)=>x?.content??[]).map((x:any)=>x?.text??x?.output_text??'').join('\n')).trim();
  if(!text)throw new ProviderError(provider,'empty',200,20);
  return {text,requestId,urls:[],provider,model};
}
async function logAttempt(feature:Feature,provider:Exclude<Provider,'none'>,model:string,result:'success'|'error'|'limited',latencyMs:number,tokenEstimate:number){
  await db.query(`INSERT INTO bom_ai_usage_daily(guild_id,usage_date,feature,provider,requests,successes,failures,estimated_input_tokens,latency_total_ms)
    VALUES($1,CURRENT_DATE,$2,$3,1,$4,$5,$6,$7)
    ON CONFLICT(guild_id,usage_date,feature,provider) DO UPDATE SET requests=bom_ai_usage_daily.requests+1,successes=bom_ai_usage_daily.successes+EXCLUDED.successes,failures=bom_ai_usage_daily.failures+EXCLUDED.failures,estimated_input_tokens=bom_ai_usage_daily.estimated_input_tokens+EXCLUDED.estimated_input_tokens,latency_total_ms=bom_ai_usage_daily.latency_total_ms+EXCLUDED.latency_total_ms`,
    [GUILD_ID,feature,provider,result==='success'?1:0,result==='success'?0:1,tokenEstimate,latencyMs]).catch(()=>{});
}
export async function generateAi(args:AiGenerateArgs):Promise<AiGatewayResult|null>{
  if(!FEATURES.includes(args.feature)||!args.input.trim()||args.input.length>14000||args.instructions?.length&&args.instructions.length>10000)return null;
  if(process.env[`BOM_AI_${args.feature.toUpperCase()}_ENABLED`]?.toLowerCase()==='false')return null;
  const route=await getAiRoute(args.feature);if(!route.enabled)return null;
  const order:Provider[]=args.providerOnly?[args.providerOnly]:[route.primary_provider,route.fallback_provider];
  const visited=new Set<Provider>();
  for(const provider of order){
    if(provider==='none'||visited.has(provider)||!providerConfigured(provider))continue;
    visited.add(provider);
    // Public Wiki can fall back by default. Banter/Sentinel must be explicitly opted in.
    if(provider==='gemini'&&!args.providerOnly&&((provider!==route.primary_provider&&!route.allow_gemini_fallback)||(args.sensitivity==='private'&&!route.allow_private_gemini)))continue;
    const model=String(route[`${provider}_model` as keyof AiRoute]||MODEL_IDS[provider]);
    if(!await reserve(args.feature,provider,route))continue;
    const start=Date.now();
    try{
      const output=await callProvider(provider,model,args);
      await logAttempt(args.feature,provider,model,'success',Date.now()-start,TOKEN_ESTIMATE(args.input+(args.instructions??'')));
      return output;
    }catch(err){
      if(!(err instanceof ProviderError)){await logAttempt(args.feature,provider,model,'error',Date.now()-start,0);continue;}
      await logAttempt(args.feature,provider,model,'error',Date.now()-start,0);
      if(err.kind==='quota'||err.kind==='auth'||err.kind==='transient')await block(provider,err.kind==='auth'?1800:err.retryAfter);
      console.warn('[ai-gateway] provider attempt failed',{feature:args.feature,provider,kind:err.kind,status:err.status});
      // A provider-specific model rejection should still allow a different provider.
    }
  }
  return null;
}
export async function aiStatus(){
  const blocked:Record<string,number>={};
  for(const p of ['groq','gemini','openai'] as const){
    const t=await redis.ttl(`ai:blocked:${p}:${GUILD_ID}`).catch(()=>-1);blocked[p]=Math.max(0,t);
  }
  return {rateLimiterAvailable:true,rateLimiterBackend:stateBackend,providers:{groq:{configured:providerConfigured('groq'),blockedSeconds:blocked.groq},gemini:{configured:providerConfigured('gemini'),blockedSeconds:blocked.gemini},openai:{configured:providerConfigured('openai'),blockedSeconds:blocked.openai}},routes:await Promise.all(FEATURES.map(getAiRoute)),usage:await many<any>(`SELECT usage_date,feature,provider,requests,successes,failures,estimated_input_tokens,latency_total_ms FROM bom_ai_usage_daily WHERE guild_id=$1 AND usage_date>=CURRENT_DATE-INTERVAL '7 days' ORDER BY usage_date DESC,feature,provider`,[GUILD_ID])};
}
export const aiFeatures=FEATURES;
export const aiProviders=PROVIDERS;

/** Explain configuration and budget failures without exposing prompts or credentials. */
export async function aiAvailability(feature:Feature,sensitivity:'public'|'private'='private'){
  const route=await getAiRoute(feature);
  if(!route.enabled||process.env[`BOM_AI_${feature.toUpperCase()}_ENABLED`]?.toLowerCase()==='false')return {available:false,reason:'feature_disabled'};
  const providers=[...new Set([route.primary_provider,route.fallback_provider])].filter((p):p is Exclude<Provider,'none'>=>p!=='none');
  const configured=providers.filter(providerConfigured);
  if(!configured.length)return {available:false,reason:'provider_not_configured'};
  const allowed=configured.filter(p=>p!=='gemini'||((p===route.primary_provider||route.allow_gemini_fallback)&&(sensitivity!=='private'||route.allow_private_gemini)));
  if(!allowed.length)return {available:false,reason:'provider_policy_blocked'};
  if(Number(await redis.get(`ai:day:feature:${GUILD_ID}:${feature}:${today()}`)??0)>=route.daily_limit)return {available:false,reason:'daily_budget_exhausted'};
  if(Number(await redis.get(`ai:minute:feature:${GUILD_ID}:${feature}:${minute()}`)??0)>=route.minute_limit)return {available:false,reason:'minute_budget_exhausted'};
  for(const provider of allowed){
    if(await redis.exists(`ai:blocked:${provider}:${GUILD_ID}`))continue;
    const capName=`BOM_AI_${provider.toUpperCase()}_DAILY_CAP`,fallback=provider==='groq'?900:provider==='gemini'?40:50;
    if(Number(await redis.get(`ai:day:provider:${GUILD_ID}:${provider}:${today()}`)??0)>=Number(process.env[capName]??fallback))continue;
    const cap=provider==='groq'?25:provider==='gemini'?8:10;
    if(Number(await redis.get(`ai:minute:provider:${GUILD_ID}:${provider}:${minute()}`)??0)<cap)return {available:true,reason:'ready'};
  }
  return {available:false,reason:'providers_blocked_or_limited'};
}
