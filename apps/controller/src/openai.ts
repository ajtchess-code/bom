/** Controller only calls internal BOM AI Gateway; API keys stay server-side. */
export type OpenAIResponseUrl={url:string;title:string|null};
export type OpenAIResponseResult={text:string;requestId:string|null;urls:OpenAIResponseUrl[]};
type OpenAIResponseArgs={model?:string;feature?:'banter'|'wiki'|'sentinel';instructions?:string;input:string;maxOutputTokens?:number;timeoutMs?:number;webSearch?:boolean;sensitivity?:'public'|'private'};
const base=(process.env.INTERNAL_API_URL??'http://127.0.0.1:4100').replace(/\/$/,'');
function headers(){return {'x-internal-token':process.env.INTERNAL_API_TOKEN??'','x-bom-ai-client':'controller','content-type':'application/json'};}
const failures=new Map<string,string>();
export function aiFailureMessage(feature:string){
 const reason=failures.get(feature)??'provider_request_failed';
 const messages:Record<string,string>={feature_disabled:'The AI route is disabled.',provider_not_configured:'The selected provider has no API key.',provider_policy_blocked:'The selected providers are blocked by the route privacy/fallback settings.',daily_budget_exhausted:'The daily AI request budget is exhausted.',minute_budget_exhausted:'The per-minute AI budget is busy; try again shortly.',providers_blocked_or_limited:'The providers are cooling down or have reached their limits.',gateway_unreachable:'The AI gateway could not be reached.',provider_request_failed:'The provider did not return a usable reply.'};
 return messages[reason]??'Check Administration → AI Providers for route and budget status.';
}
export function openAIEnabled(_flag:string){return Boolean(process.env.INTERNAL_API_TOKEN);}
export async function aiGatewayStatus():Promise<any|null>{
  try{const r=await fetch(`${base}/v1/ai/controller-status`,{headers:headers(),signal:AbortSignal.timeout(4500)});return r.ok?await r.json():null;}catch{return null;}
}
export async function openAIResponse({feature='banter',instructions,input,maxOutputTokens=500,timeoutMs=10000,sensitivity='public'}:OpenAIResponseArgs):Promise<OpenAIResponseResult|null>{
  if(!process.env.INTERNAL_API_TOKEN){failures.set(feature,'gateway_unreachable');return null;}
  try{
    const r=await fetch(`${base}/v1/ai/generate-internal`,{method:'POST',headers:headers(),signal:AbortSignal.timeout(Math.max(3500,Math.min(52_000,timeoutMs*2+4500))),body:JSON.stringify({feature,instructions,input,maxOutputTokens,timeoutMs,sensitivity})});
    if(!r.ok){const body:any=await r.json().catch(()=>({}));failures.set(feature,String(body.error??'provider_request_failed'));console.warn('[ai-gateway] controller request unavailable',{feature,status:r.status});return null;}
    const body:any=await r.json();failures.delete(feature);return typeof body?.text==='string'&&body.text.trim()?{text:body.text,requestId:null,urls:[]}:null;
  }catch{failures.set(feature,'gateway_unreachable');console.warn('[ai-gateway] controller request timed out or unreachable',{feature});return null;}
}
