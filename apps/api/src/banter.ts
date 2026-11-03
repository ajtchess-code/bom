import {BANTER_VOICE,gazetteContext} from './banterKnowledge.js';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {db,many,oneOrNone} from '@bom/db';
import {redis} from '@bom/redis';
import {discordContext} from './authz.js';
import {generateAi,providerConfigured,aiFeatureAvailable,getAiRoute,aiAvailability} from './aiGateway.js';

const ids=z.array(z.string().regex(/^\d{15,22}$/)).max(100);
const body=z.object({
  enabled:z.boolean(),spontaneous_enabled:z.boolean(),roast_enabled:z.boolean(),
  aggression:z.number().int().min(1).max(10),spontaneity:z.number().int().min(0).max(100),
  channel_cooldown_minutes:z.number().int().min(0).max(240),
  spontaneous_user_cooldown_seconds:z.number().int().min(0).max(3600).default(30),
  minimum_participants:z.number().int().min(1).max(5).default(1),
  daily_spontaneous_limit:z.number().int().min(0).max(1000),daily_total_limit:z.number().int().min(1).max(1000),
  context_messages:z.number().int().min(3).max(20),
  spontaneous_channels:ids,excluded_channels:ids,excluded_role_ids:ids,
  custom_instructions:z.string().max(1200)
}).strict();

export function registerBanterRoutes(app:FastifyInstance,{guildId,requireAdmin,userId}:{guildId:string;requireAdmin:(req:any,reply:any)=>Promise<boolean>;userId:(req:any)=>string}){
  app.get('/v1/banter/settings',async(req:any,reply:any)=>{
    if(!await requireAdmin(req,reply))return;
    await db.query('INSERT INTO bom_banter_settings(guild_id) VALUES($1) ON CONFLICT DO NOTHING',[guildId]);
    const [settings,discord,activity]=await Promise.all([
      oneOrNone<any>('SELECT * FROM bom_banter_settings WHERE guild_id=$1',[guildId]),
      discordContext(),
      many<any>(`SELECT trigger_kind,COUNT(*)::int AS count FROM bom_banter_activity WHERE guild_id=$1 AND created_at>=NOW()-INTERVAL '7 days' GROUP BY trigger_kind`,[guildId])
    ]);
    const channels=(discord.textChannels??[]).map((c:any)=>({id:String(c.id),name:String(c.name),type:c.type}));
    const route=await getAiRoute('banter'),availability=await aiAvailability('banter','private');
    return {aiBudget:{daily:route.daily_limit,minute:route.minute_limit},availability,settings,channels,roles:(discord.roles??[]).map((r:any)=>({id:String(r.id),name:String(r.name)})),activity,configured:aiFeatureAvailable('banter'),providers:{groq:providerConfigured('groq'),gemini:providerConfigured('gemini'),openai:providerConfigured('openai')}};
  });
  app.put('/v1/banter/settings',async(req:any,reply:any)=>{
    if(!await requireAdmin(req,reply))return;
    const parsed=body.safeParse(req.body);
    if(!parsed.success)return reply.code(400).send({error:'invalid_banter_settings',issues:parsed.error.issues});
    const b=parsed.data;
    const roleSet=new Set((await discordContext()).roles.map((r:any)=>String(r.id)));
    if(b.excluded_role_ids.some(id=>!roleSet.has(id)))return reply.code(400).send({error:'role_no_longer_exists'});
    await db.query(`INSERT INTO bom_banter_settings(guild_id) VALUES($1) ON CONFLICT DO NOTHING`,[guildId]);
    await db.query(`UPDATE bom_banter_settings SET enabled=$2,spontaneous_enabled=$3,roast_enabled=$4,aggression=$5,spontaneity=$6,channel_cooldown_minutes=$7,daily_spontaneous_limit=$8,daily_total_limit=$9,context_messages=$10,spontaneous_channels=$11::jsonb,excluded_channels=$12::jsonb,excluded_role_ids=$13::jsonb,custom_instructions=$14,updated_by=$15,spontaneous_user_cooldown_seconds=$16,minimum_participants=$17,updated_at=NOW() WHERE guild_id=$1`,[guildId,b.enabled,b.spontaneous_enabled,b.roast_enabled,b.aggression,b.spontaneity,b.channel_cooldown_minutes,b.daily_spontaneous_limit,b.daily_total_limit,b.context_messages,JSON.stringify(b.spontaneous_channels),JSON.stringify(b.excluded_channels),JSON.stringify(b.excluded_role_ids),b.custom_instructions,userId(req),b.spontaneous_user_cooldown_seconds,b.minimum_participants]);
    return {ok:true};
  });
  app.post('/v1/banter/preview',async(req:any,reply:any)=>{
    if(!await requireAdmin(req,reply))return;
    const payload=z.object({prompt:z.string().min(2).max(300),aggression:z.number().int().min(1).max(10),custom_instructions:z.string().max(1200).optional()}).safeParse(req.body);
    if(!payload.success)return reply.code(400).send({error:'invalid_preview'});
    const {prompt,aggression,custom_instructions}=payload.data;
    const claim=await redis.set(`banter:preview:${guildId}:${userId(req)}`,'1','EX',15,'NX');
    if(claim!=='OK')return reply.code(429).send({error:'preview_cooldown_15_seconds'});
    const output=await generateAi({feature:'banter',sensitivity:'public',instructions:`${BANTER_VOICE} Intensity: ${aggression}/10. Additional administrator style preferences: ${custom_instructions??''}`,input:prompt+await gazetteContext(prompt),maxOutputTokens:130,timeoutMs:12_000});
    if(!output)return reply.code(503).send({error:'ai_gateway_unavailable_or_daily_limit_reached'});
    return {text:output.text.slice(0,600),provider:output.provider,model:output.model};
  });
}
