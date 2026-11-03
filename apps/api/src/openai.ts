/** Legacy export names kept for compatibility; requests now use BOM AI Gateway. */
import {aiFeatureAvailable,generateAi,type AiFeature} from './aiGateway.js';
export type OpenAIResponseUrl={url:string;title:string|null};
export type OpenAIResponseResult={text:string;requestId:string|null;urls:OpenAIResponseUrl[]};
type OpenAIResponseArgs={model?:string;feature?:AiFeature;instructions?:string;input:string;maxOutputTokens?:number;timeoutMs?:number;webSearch?:boolean;sensitivity?:'public'|'private'};
/** Original OPENAI_* feature toggles no longer require an OpenAI key. */
export function openAIEnabled(flag:string){
  const feature:AiFeature=flag.includes('SENTINEL')?'sentinel':flag.includes('BANTER')?'banter':'wiki';
  return aiFeatureAvailable(feature);
}
export async function openAIResponse(args:OpenAIResponseArgs):Promise<OpenAIResponseResult|null>{
  const feature=args.feature??'wiki';
  // Models belong to route settings. A legacy OpenAI model string is NOT a valid Groq model.
  // Requests for web_search are not forwarded as unsupported tools; local Wiki remains authoritative.
  const output=await generateAi({feature,input:args.input,instructions:args.instructions,maxOutputTokens:args.maxOutputTokens,timeoutMs:args.timeoutMs,webSearch:args.webSearch,sensitivity:args.sensitivity??(feature==='sentinel'?'private':'public')});
  return output?{text:output.text,requestId:output.requestId,urls:output.urls}:null;
}
