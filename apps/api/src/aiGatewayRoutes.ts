import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {aiFeatures,aiStatus,generateAi,getAiRoute,saveAiRoute,providerConfigured,aiAvailability} from './aiGateway.js';
const feature=z.enum(['banter','wiki','sentinel']);
const provider=z.enum(['groq','gemini','openai','none']);
const model=z.string().trim().min(3).max(100).regex(/^[a-zA-Z0-9_./-]+$/);
const settings=z.object({
  enabled:z.boolean(),primary_provider:provider,fallback_provider:provider,
  groq_model:model,gemini_model:model,openai_model:model,
  allow_gemini_fallback:z.boolean(),allow_private_gemini:z.boolean(),daily_limit:z.number().int().min(1).max(1000),minute_limit:z.number().int().min(1).max(30)
}).strict();
const internalRequest=z.object({feature:feature,instructions:z.string().max(10000).optional(),input:z.string().min(1).max(14000),maxOutputTokens:z.number().int().min(32).max(1600).optional(),timeoutMs:z.number().int().min(1500).max(25000).optional(),sensitivity:z.enum(['public','private']).optional()}).strict();
export function registerAiGatewayRoutes(app:FastifyInstance,{requireAdmin,userId}:{requireAdmin:(req:any,reply:any)=>Promise<boolean>;userId:(req:any)=>string}){
  app.get('/v1/ai/settings',async(req:any,reply:any)=>{
    if(!await requireAdmin(req,reply))return;
    return aiStatus();
  });
  app.put('/v1/ai/settings/:feature',async(req:any,reply:any)=>{
    if(!await requireAdmin(req,reply))return;
    const f=feature.safeParse(req.params?.feature),parsed=settings.safeParse(req.body);
    if(!f.success||!parsed.success)return reply.code(400).send({error:'invalid_ai_route',issues:parsed.success?[]:parsed.error.issues});
    if(parsed.data.primary_provider===parsed.data.fallback_provider&&parsed.data.primary_provider!=='none')return reply.code(400).send({error:'primary_and_fallback_must_differ'});
    return {ok:true,route:await saveAiRoute(f.data,parsed.data,userId(req))};
  });
  app.post('/v1/ai/test',async(req:any,reply:any)=>{
    if(!await requireAdmin(req,reply))return;
    const b=z.object({feature:feature,provider:z.enum(['groq','gemini','openai']).optional()}).strict().safeParse(req.body);
    if(!b.success)return reply.code(400).send({error:'invalid_ai_test'});
    // Fixed synthetic text only. Never use guild conversations as a connection test.
    const route=await getAiRoute(b.data.feature);
    if(!route.enabled)return reply.code(409).send({error:'feature_disabled'});
    const providerChoice=b.data.provider;
    if(providerChoice&&!providerConfigured(providerChoice))return reply.code(503).send({error:`${providerChoice}_not_configured`});
    const result=await generateAi({feature:b.data.feature,providerOnly:providerChoice,instructions:'This is a system connectivity check. Reply with only: BOM OK',input:'Test API connectivity.',maxOutputTokens:90,timeoutMs:12000,sensitivity:'public'});
    if(!result)return reply.code(503).send({error:'all_permitted_providers_unavailable_or_budget_exhausted'});
    return {ok:true,provider:result.provider,model:result.model,reply:result.text.slice(0,160)};
  });
  // Controller-internal generate endpoint: authenticated by INTERNAL_API_TOKEN in the
  // global onRequest hook, deliberately unreachable to browser/session requests.
  app.post('/v1/ai/generate-internal',async(req:any,reply:any)=>{
    if(userId(req))return reply.code(403).send({error:'internal_only'});
    if(req.headers['x-bom-ai-client']!=='controller')return reply.code(403).send({error:'controller_required'});
    const parsed=internalRequest.safeParse(req.body);
    if(!parsed.success)return reply.code(400).send({error:'invalid_ai_generation_request'});
    const result=await generateAi(parsed.data);
    if(!result){const status=await aiAvailability(parsed.data.feature,parsed.data.sensitivity??'private');return reply.code(503).send({error:status.available?'provider_request_failed':status.reason});}
    return {text:result.text,provider:result.provider,model:result.model};
  });
  app.get('/v1/ai/controller-status',async(req:any,reply:any)=>{
    if(userId(req)||req.headers['x-bom-ai-client']!=='controller')return reply.code(403).send({error:'internal_only'});
    const status=await aiStatus();return {rateLimiterAvailable:status.rateLimiterAvailable,rateLimiterBackend:status.rateLimiterBackend,availability:await aiAvailability('banter','private'),providers:status.providers,routes:status.routes.map(x=>({feature:x.feature,enabled:x.enabled,primary_provider:x.primary_provider,fallback_provider:x.fallback_provider,allow_gemini_fallback:x.allow_gemini_fallback}))};
  });
}
