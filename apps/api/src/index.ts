import {registerConfigDiagnostics} from './configDiagnostics.js';
import {registerMusicSessionTools} from './musicSessionTools.js';
import {registerGlobalSearch} from './globalSearch.js';
import {registerCommandHome} from './commandHome.js';
import {allianceApiAllowed,dashboardRoleScope} from '@bom/shared';
import {getAlliedGrant,pbAllyPathAllowed} from './pbAllies.js';
import {registerCommunityRoutes} from './community.js';
import {installAssistantRequestLocks} from './assistantContext.js';
import {registerSentinelRoutes,sentinelRecord} from "./sentinel.js";
import {registerMusicDiscoveryRoutes} from "./musicDiscovery.js";
import {registerBanterRoutes} from "./banter.js";
import {registerAiGatewayRoutes} from "./aiGatewayRoutes.js";
import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { z, ZodError } from "zod";
import { db, many, oneOrNone } from "@bom/db";
import { redis, redisSub, getRoomState, queueItems, keys, stateBackend } from "@bom/redis";
import { FILTER_PRESETS, MusicPermission, SkipMode } from "@bom/shared";
import { configuredGuildId, dashboardAdminRole, discordAccess, discordContext, hasDashboardAdminAccess, hasMusicPermission } from "./authz.js";
import { bootstrapBrandingDefaults, registerBrandingRoutes } from "./branding.js";
import { featureSummary, memberLite, registerFeatureRoutes } from "./features.js";
import { registerAutomationSocialRoutes, startSocialEngine } from "./automationSocial.js";
import { bootstrapWikiSeed, registerWikiRoutes } from "./wiki.js";
import {registerPrepReviewRoutes} from "./prepReview.js";
import {registerWikiPortalRoutes} from "./wikiPortal.js";
import {registerGameWiki} from "./gameWiki.js";
import {registerWikiExtras} from "./wikiExtras.js";
import {registerRoleAssignRoutes} from "./roleAssign.js";
import {registerWosbWorkspaceRoutes} from "./wosbWorkspace.js";
import {registerPbResetRoutes} from "./pbResetRoutes.js";
import {bootstrapFeedbackCenter,registerFeedbackRoutes} from "./feedback.js";
import {registerMembershipRoutes} from "./membership.js";
import {registerRecruitmentRoutes} from "./recruitment.js";
import {registerPlatformOpsRoutes,startPlatformJobRunner,emitPlatformEvent} from "./platformOps.js";
// A rejected background promise (Discord event handler, timer, cache refresh) must not take
// the whole service down; the supervisor restart would drop every in-flight request.
process.on("unhandledRejection",reason=>{console.error("[api] unhandled promise rejection",reason);});

const app=Fastify({
  logger:{
    level:process.env.BOM_LOG_LEVEL??process.env.LOG_LEVEL??"info",
    base:{service:"api"},
    redact:{paths:["req.headers.authorization","req.headers.cookie","req.headers.x-internal-token","headers.authorization","headers.cookie","headers.x-internal-token"],censor:"[REDACTED]"}
  },
  disableRequestLogging:true,
  genReqId:()=>randomUUID()
});
const port=Number(process.env.API_PORT??process.env.PORT??4100);
const slowRequestMs=Math.max(50,Number(process.env.API_SLOW_REQUEST_MS??750));
const internalToken=process.env.INTERNAL_API_TOKEN;
const guildId=configuredGuildId();
if(!internalToken)throw new Error("INTERNAL_API_TOKEN is required");

app.addHook("onRequest",async(req,reply)=>{
  (req as any).bomStartedAt=performance.now();
  reply.header("x-request-id",String(req.id));
  if(req.url==="/health")return;
  if(req.headers["x-internal-token"]!==internalToken)return reply.code(401).send({error:"unauthorized"});
});
installAssistantRequestLocks(app,guildId);
app.get("/health",async(_req,reply)=>{
 const bounded=async(work:Promise<any>)=>{let timer:any;try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Readiness timeout')),2200)})])}finally{clearTimeout(timer)}};
 const checks=await Promise.allSettled([bounded(db.query('SELECT 1')),bounded(redis.ping())]);
 const ok=checks.every(c=>c.status==='fulfilled');return reply.code(ok?200:503).send({ok});
});


const userId=(req:any)=>String(req.headers["x-discord-user-id"]??"");
const userVoiceKey=(uid:string)=>`music:user-voice:${uid}`;
const voiceChannelKey=(channelId:string)=>`music:voice-channel:${channelId}`;
const voiceRoomKey=(channelId:string)=>`music:voice-room:${channelId}`;

app.addHook("onResponse",async(req,reply)=>{
  const started=Number((req as any).bomStartedAt??performance.now());
  const durationMs=Number((performance.now()-started).toFixed(1));
  const uid=userId(req)||undefined;
  const path=req.url.split("?")[0];
  const fields={reqId:req.id,method:req.method,url:req.url,statusCode:reply.statusCode,durationMs,userId:uid};
  if(reply.statusCode>=500)app.log.error(fields,"request completed with server error");
  else if(reply.statusCode>=400)app.log.warn(fields,"request completed with client error");
  else if(durationMs>=slowRequestMs)app.log.warn({...fields,slowRequestMs},"slow request completed");
  else app.log.debug(fields,"request completed");
  if(path!=="/health"&&uid)void sentinelRecord({source:"api",category:"api",action:"api.request",actorId:uid,initiatorId:uid,executorId:"api",severity:reply.statusCode>=500?"error":reply.statusCode>=400?"warning":"info",outcome:reply.statusCode>=400?"failed":"success",metadata:{requestId:req.id,method:req.method,url:path,statusCode:reply.statusCode,durationMs}}).catch(()=>{});
  // One normalized event stream backs Activity, diagnostics and cross-module auditing.
  // Only successful mutations are promoted to the human-facing feed so ordinary GETs
  // and failures do not drown out meaningful guild changes.
  if(uid&&reply.statusCode<400&&!["GET","HEAD","OPTIONS"].includes(req.method)&&!path.startsWith("/v1/platform/")&&!path.startsWith("/v1/games/")){
    const module=path.split("/").filter(Boolean)[1]??"platform";
    void emitPlatformEvent(guildId,{eventType:`${module}.mutation`,category:module,severity:"info",actorId:uid,title:`${module.replaceAll("-"," ")} updated`,summary:`${req.method} ${path}`,metadata:{requestId:req.id,durationMs}}).catch(()=>{});
  }
});
app.addHook("onTimeout",async(req,_reply)=>{app.log.error({reqId:req.id,method:req.method,url:req.url,userId:userId(req)||undefined},"request timed out");});

function logSafeQuery(value:unknown){
  const raw=String(value??"").replace(/\s+/g," ").trim();
  if(!raw)return undefined;
  try{
    const u=new URL(raw);
    return `${u.protocol}//${u.host}${u.pathname}`.slice(0,180);
  }catch{return raw.slice(0,180);}
}

async function requirePermission(req:any,reply:any,p:any="MANAGE_MUSIC"){
  const uid=userId(req);
  if(!uid||!await hasMusicPermission(uid,p)){reply.code(403).send({error:"forbidden"});return false;}
  return true;
}
async function requireMember(req:any,reply:any){
  const uid=userId(req);if(!uid){reply.code(401).send({error:"unauthenticated"});return false;}
  if(req._pbMemberAccess)return req._pbMemberAccess;
  if(req._dashboardScope?.allianceOnly||req._dashboardScope?.guestOnly)return req._pbMemberAccess=req._dashboardScope;
  const access=await discordAccess(uid),grant=req._pbGrantLoaded?req._pbGrant:await getAlliedGrant(guildId,uid);
  if(grant&&!await hasDashboardAdminAccess(uid)){if(!pbAllyPathAllowed(String(req.url??'').split('?')[0],req.method)){reply.code(403).send({error:'port_battles_only'});return null;}return req._pbMemberAccess={...access,member:true,pbOnly:true,alliedPB:grant};}
  if(!access.member){reply.code(403).send({error:'not_a_member'});return null;}return req._pbMemberAccess=access;
}
async function requireAdmin(req:any,reply:any){
  const uid=userId(req);if(!uid){reply.code(401).send({error:"unauthenticated"});return false;}
  if(!await hasDashboardAdminAccess(uid)){reply.code(403).send({error:"admin_role_required"});return false;}
  return true;
}

app.addHook('preHandler',async(req:any,reply:any)=>{const uid=userId(req);if(!uid)return;const access=await discordAccess(uid),cfg=await oneOrNone<any>('SELECT * FROM membership_settings WHERE guild_id=$1',[guildId]),admin=await hasDashboardAdminAccess(uid);req._pbGrant=await getAlliedGrant(guildId,uid);req._pbGrantLoaded=true;
 if(!access.member)return reply.code(403).send({error:'not_a_member'});
 const scope=dashboardRoleScope(access.roles,cfg,admin);if(scope==='MEMBER'&&(admin||cfg?.member_role_id||cfg?.bom2_member_role_id||cfg?.afk_role_id||cfg?.bom2_afk_role_id||cfg?.leave_member_role_ids?.length||cfg?.officer_role_ids?.length))req._pbGrant=null;
 if(scope==='GUEST'&&!req._pbGrant){req._dashboardScope={...access,guestOnly:true};const path=String(req.url).split('?')[0];if(path!=='/v1/access'&&!path.startsWith('/v1/recruitment/'))return reply.code(403).send({error:'member_or_alliance_role_required',message:'You need a configured Member or Alliance role to use this tool. Ask an Officer to check your Discord roles and the dashboard membership settings.'});return;}
 if(scope==='ALLIANCE'){req._dashboardScope={...access,allianceOnly:true};if(!allianceApiAllowed(String(req.url).split('?')[0],req.method))return reply.code(403).send({error:'alliance_dashboard_restricted'});return;}
 if(req._pbGrant&&!admin&&!pbAllyPathAllowed(String(req.url).split('?')[0],req.method))return reply.code(403).send({error:'port_battles_only'});
});
registerBrandingRoutes(app,{guildId,requireAdmin,userId});
registerFeatureRoutes(app,{guildId,requireMember,requireAdmin,requirePermission,userId});
registerSentinelRoutes(app,requireAdmin,userId);
registerMusicDiscoveryRoutes(app,{guildId,requireMember,requireAdmin,userId});
registerBanterRoutes(app,{guildId,requireAdmin,userId});
registerCommunityRoutes(app,{guildId,requireAdmin,userId});
registerAiGatewayRoutes(app,{requireAdmin,userId});
registerAutomationSocialRoutes(app,{guildId,requireAdmin,userId});
await bootstrapWikiSeed();
registerWikiRoutes(app,{guildId,requireMember,requireAdmin,userId});
registerWikiPortalRoutes(app,{guildId,requireMember,requireAdmin,userId});
registerGameWiki(app,{requireMember,requireAdmin});
registerWikiExtras(app,{guildId,requireMember,requireAdmin,userId});
registerRoleAssignRoutes(app,{guildId,requireAdmin,userId});
registerWosbWorkspaceRoutes(app,{guildId,requireMember,requireAdmin,userId});
registerPbResetRoutes(app,{guildId,requireAdmin,userId});
await bootstrapFeedbackCenter(guildId);
registerFeedbackRoutes(app,{guildId,requireMember,requireAdmin,userId,isAdmin:hasDashboardAdminAccess});
registerPrepReviewRoutes(app,{guildId,requireMember,userId});
registerMembershipRoutes(app,{guildId,requireMember,requireAdmin,userId});
registerRecruitmentRoutes(app,{guildId,requireMember,requireAdmin,userId});
registerPlatformOpsRoutes(app,{guildId,requireMember,requireAdmin,userId});
registerCommandHome(app,{guildId,requireMember,userId});
registerGlobalSearch(app,{guildId,requireMember,userId});
registerConfigDiagnostics(app,{guildId,requireAdmin});
registerMusicSessionTools(app,{guildId,requireMember,requirePermission,userId,ensureVoiceRoom});

async function voiceContextForUser(uid:string){
  const channelId=await redis.get(userVoiceKey(uid));
  if(!channelId)return {connected:false,channelId:null,name:null,bitrate:null,roomId:null,room:null as any};

  // The controller owns live Discord voice-state updates and mirrors channel
  // metadata into Redis. Use that hot path instead of doing Discord REST calls
  // on every Play/Queue click.
  const [metaRaw,cachedRoomId]=await Promise.all([
    redis.get(voiceChannelKey(channelId)),
    redis.get(voiceRoomKey(channelId))
  ]);
  let meta:any=null;
  if(metaRaw){try{meta=JSON.parse(metaRaw);}catch{}}
  if(cachedRoomId)return {connected:true,channelId,name:meta?.name??"Voice channel",bitrate:meta?.bitrate??null,roomId:String(cachedRoomId),room:{id:String(cachedRoomId),voice_channel_id:channelId}};

  // Cache miss is expected only for a brand-new voice session or immediately
  // after a deploy. Resolve it once from PostgreSQL, then keep routing in Redis.
  const room=await oneOrNone<any>(`SELECT * FROM music_rooms WHERE guild_id=$1 AND voice_channel_id=$2 AND enabled=TRUE LIMIT 1`,[guildId,channelId]);
  if(room){
    await redis.set(voiceRoomKey(channelId),String(room.id),"EX",24*3600);
    return {connected:true,channelId,name:meta?.name??room.name??"Voice channel",bitrate:meta?.bitrate??null,roomId:room.id,room};
  }

  // If controller metadata has not arrived yet, use the slower Discord context
  // lookup only for this first request and cache it for subsequent actions.
  if(!meta){
    const ctx=await discordContext();const channel=ctx.voiceChannels.find((c:any)=>String(c.id)===String(channelId));
    if(!channel){await redis.del(userVoiceKey(uid));return {connected:false,channelId:null,name:null,bitrate:null,roomId:null,room:null as any};}
    meta=channel;await redis.set(voiceChannelKey(channelId),JSON.stringify({id:channelId,name:channel.name,bitrate:channel.bitrate??null,type:channel.type??2,updatedAt:Date.now()}),"EX",6*3600);
  }
  return {connected:true,channelId,name:meta?.name??"Voice channel",bitrate:meta?.bitrate??null,roomId:null,room:null as any};
}

async function ensureVoiceRoom(uid:string){
  const voice=await voiceContextForUser(uid);
  if(!voice.connected||!voice.channelId)throw Object.assign(new Error("Join a Discord voice channel before using music."),{statusCode:409,code:"NOT_IN_VOICE"});
  let room=voice.room;
  if(room)return {room,voice};

  await db.query(`INSERT INTO guild_settings(guild_id) VALUES($1) ON CONFLICT DO NOTHING`,[guildId]);
  const settings:any=await oneOrNone(`SELECT autoplay_default FROM guild_settings WHERE guild_id=$1`,[guildId]);
  const id=randomUUID();
  try{
    await db.query(`INSERT INTO music_rooms(id,guild_id,name,text_channel_id,voice_channel_id,preferred_worker_id,language,autoplay,delete_requests,skip_mode,default_filter,enabled) VALUES($1,$2,$3,$4,$5,NULL,NULL,$6,TRUE,NULL,'flat',TRUE)`,[id,guildId,voice.name??"Voice session",voice.channelId,voice.channelId,Boolean(settings?.autoplay_default??true)]);
  }catch(err:any){if(err?.code!=="ER_DUP_ENTRY")throw err;}
  room=await oneOrNone<any>(`SELECT * FROM music_rooms WHERE guild_id=$1 AND voice_channel_id=$2 AND enabled=TRUE LIMIT 1`,[guildId,voice.channelId]);
  if(!room)throw new Error("Unable to establish a music session for this voice channel");
  await redis.set(voiceRoomKey(voice.channelId),String(room.id),"EX",24*3600);
  // Do not enqueue REFRESH_ROOM ahead of the first song. That UI refresh can
  // perform Discord message I/O and used to sit in front of QUEUE in the same
  // controller stream. TRACK_START will build/update the public controls.
  return {room,voice:{...voice,roomId:room.id,room}};
}

async function liveRoom(room:any){
  const [state,queue,lyricsRaw,metadataRaw,musicSettings]=await Promise.all([
    getRoomState(room.id),queueItems(room.id),redis.get(`music:room:${room.id}:lyrics`),redis.get(`music:room:${room.id}:metadata`),oneOrNone<any>(`SELECT * FROM room_music_settings WHERE room_id=$1`,[room.id])
  ]);
  const ids=[...new Set(queue.map((q:any)=>q.requesterId).filter((x:any)=>x&&/^\d+$/.test(String(x))))];
  const owners=Object.fromEntries(await Promise.all(ids.map(async(id:any)=>[String(id),await memberLite(guildId,String(id))] as const)));
  const autoplayRaw=await redis.get(`music:room:${room.id}:autoplay-diagnostics`).catch(()=>null);
  const playbackTimeline=(await redis.lrange(`music:room:${room.id}:timeline`,0,39)).map((raw:string)=>{try{return JSON.parse(raw);}catch{return null;}}).filter(Boolean);
  const snapshot=await oneOrNone<any>('SELECT updated_at,queue_json FROM queue_snapshots WHERE room_id=$1',[room.id]);
  const heartbeat=state.workerId?await redis.get(keys.workerHeartbeat(state.workerId)):null;
  const playbackHealth={connected:Boolean(heartbeat),queueCount:queue.length,snapshotAt:snapshot?.updated_at??null,snapshotCount:Array.isArray(snapshot?.queue_json)?snapshot.queue_json.length:0,status:state.status};

  return {...room,state,queue:queue.map((q:any)=>({...q,requester:owners[q.requesterId]??null})),lyrics:lyricsRaw?JSON.parse(lyricsRaw):null,metadata:metadataRaw?JSON.parse(metadataRaw):null,musicSettings:musicSettings??null,autoplayDiagnostics:autoplayRaw?JSON.parse(autoplayRaw):null,playbackTimeline,playbackHealth};
}

async function workerHealth(){
  const workerCount=Math.min(8,Math.max(1,Number(process.env.WORKER_COUNT??8)));
  return Promise.all(Array.from({length:workerCount},async(_,i)=>{const workerId=String(i+1);const h=await redis.get(keys.workerHeartbeat(workerId));return h?JSON.parse(h):{workerId,offline:true};}));
}

function qualityFor(access:any){
  const premiumTier=Number(access.guild?.premiumTier??0);const discordCap=premiumTier>=3?384000:premiumTier===2?256000:premiumTier===1?128000:96000;const target=Math.max(8000,Math.min(discordCap,Number(process.env.VOICE_BITRATE_TARGET??384000)));
  return {premiumTier,discordCapBps:discordCap,targetBps:target,enforceVoiceChannelBitrate:(process.env.ENFORCE_VOICE_CHANNEL_BITRATE??"true").toLowerCase()!=="false",workerSelfDeaf:true,defaultFilter:"flat"};
}

app.setErrorHandler((error:any,req:any,reply)=>{
  const requestId=String(req.id);
  if(error instanceof ZodError)return reply.code(400).send({error:"invalid_request",message:"One or more fields are invalid.",requestId,issues:error.issues});
  if(["23505","ER_DUP_ENTRY"].includes(String(error?.code)))return reply.code(409).send({error:"conflict",message:"That configuration is already in use.",requestId});
  const status=Number(error?.statusCode);
  if(status>=400&&status<500)return reply.code(status).send({error:error?.code??"invalid_request",message:error.message,requestId});
  app.log.error({err:error,reqId:req.id,method:req.method,url:req.url,userId:userId(req)||undefined},"unhandled API request error");
  void emitPlatformEvent(guildId,{eventType:"platform.error",category:"platform",severity:"error",actorId:userId(req)||null,title:"Platform request failed",summary:`${req.method} ${req.url.split("?")[0]}`,metadata:{requestId}}).catch(()=>{});
  return reply.code(500).send({error:"internal_error",message:"The request could not be completed. Use the request ID when contacting support.",requestId});
});


app.get("/v1/access",async(req:any,reply)=>{
  const access=await requireMember(req,reply);if(!access)return;
  if(access.guestOnly)return {access,guestOnly:true,capabilities:{},dashboardAdmin:false};
  if(access.allianceOnly)return {access,allianceOnly:true,capabilities:{},dashboardAdmin:false};
  if(access.pbOnly)return {access,pbOnly:true,alliedPB:access.alliedPB,capabilities:{},dashboardAdmin:false};
  const uid=userId(req);const capabilities:Record<string,boolean>={};for(const permission of MusicPermission.options)capabilities[permission]=await hasMusicPermission(uid,permission);
  return {access,capabilities,dashboardAdmin:await hasDashboardAdminAccess(uid),dashboardAdminRoleId:dashboardAdminRole()};
});

app.get("/v1/music/context",async(req:any,reply)=>{if(!await requireAdmin(req,reply))return;return discordContext();});

app.get("/v1/music/summary",async(req:any,reply)=>{
  const access=await requireMember(req,reply);if(!access)return;
  const uid=userId(req);
  await db.query(`INSERT INTO guild_settings(guild_id) VALUES($1) ON CONFLICT DO NOTHING`,[guildId]);
  const [settings,rows,voiceContext,history,preferencesRaw,workers,capabilityPairs,dashboardAdmin,featureData]=await Promise.all([
    oneOrNone(`SELECT * FROM guild_settings WHERE guild_id=$1`,[guildId]),
    many<any>(`SELECT * FROM music_rooms WHERE guild_id=$1 AND enabled=TRUE ORDER BY updated_at DESC`,[guildId]),
    voiceContextForUser(uid),
    many(`SELECT th.*,tp.origin,tp.surface,tp.requested_query,tp.resolver_strategy,tp.resolver_provider,tp.resolver_score,tp.resolution_attempts,tp.fallback_reason FROM track_history th LEFT JOIN track_provenance tp ON tp.history_id=th.id WHERE th.guild_id=$1 ORDER BY th.started_at DESC LIMIT 50`,[guildId]),
    oneOrNone(`SELECT * FROM user_music_preferences WHERE guild_id=$1 AND user_id=$2`,[guildId,uid]),
    workerHealth(),
    Promise.all(MusicPermission.options.map(async permission=>[permission,await hasMusicPermission(uid,permission)] as const)),
    hasDashboardAdminAccess(uid),featureSummary(guildId,uid)
  ]);
  const rooms=await Promise.all(rows.map(room=>liveRoom(room)));
  const activeRoom=voiceContext.roomId?rooms.find((r:any)=>r.id===voiceContext.roomId)??null:null;
  const preferences=preferencesRaw??{guild_id:guildId,user_id:uid,language:null,autoplay_opt_in:true,explicit_content:true};
  const capabilities=Object.fromEntries(capabilityPairs) as Record<string,boolean>;
  const {room:_,...publicVoiceContext}=voiceContext as any;
  return {settings,rooms,activeRoom,voiceContext:publicVoiceContext,history,workers,access,preferences,stateBackend,capabilities,dashboardAdmin,quality:qualityFor(access),...featureData};
});

app.post("/v1/music/actions",async(req:any,reply)=>{
  const receivedAt=Date.now();
  const body=z.discriminatedUnion("type",[
    z.object({type:z.literal("QUEUE"),query:z.string().min(1).max(1000)}),z.object({type:z.enum(["PAUSE","RESUME","SKIP","VOTE_SKIP","STOP","QUEUE_CLEAR"])}),z.object({type:z.literal("QUEUE_REMOVE"),index:z.number().int().min(0)}),z.object({type:z.literal("SKIP_TO"),requestId:z.string().min(1).max(128),currentRequestId:z.string().min(1).max(128)}),z.object({type:z.literal("SEEK"),positionMs:z.number().int().min(0)}),z.object({type:z.literal("FILTER"),preset:z.string().min(1)}),z.object({type:z.literal("VOLUME"),volume:z.number().int().min(0).max(200)})
  ]).parse(req.body);
  const uid=userId(req);
  const actionId=randomUUID();
  const perm=body.type==="FILTER"?"MANAGE_FILTERS":body.type==="QUEUE"||body.type==="VOTE_SKIP"?"USE_MUSIC":body.type==="SKIP"||body.type==="SKIP_TO"?"FORCE_SKIP":body.type==="QUEUE_CLEAR"||body.type==="QUEUE_REMOVE"?"MANAGE_QUEUE":"MANAGE_MUSIC";
  if(!await requirePermission(req,reply,perm)){app.log.warn({actionId,userId:uid,type:body.type,permission:perm},"[music-action] permission denied");return;}
  if(body.type==="SKIP_TO"&&!await requirePermission(req,reply,"MANAGE_QUEUE"))return;
  if(body.type==="FILTER"&&!Object.prototype.hasOwnProperty.call(FILTER_PRESETS,body.preset))return reply.code(400).send({error:"invalid_filter"});
  let routed;
  try{routed=await ensureVoiceRoom(uid);}
  catch(err:any){app.log.warn({actionId,userId:uid,type:body.type,error:err?.message??String(err)},"[music-route] unable to resolve requester voice channel");throw err;}
  const {room,voice}=routed;
  app.log.info({actionId,userId:uid,type:body.type,roomId:room.id,voiceChannelId:voice.channelId,voiceChannelName:voice.name,query:body.type==="QUEUE"?logSafeQuery(body.query):undefined,routeMs:Date.now()-receivedAt},"[music-action] accepted");
  if(body.type==="QUEUE"){const rate=await redis.set(`music:api-request:${room.id}:${uid}`,"1","EX",2,"NX");if(!rate){app.log.warn({actionId,userId:uid,roomId:room.id},"[music-action] rate limited");return reply.code(429).send({error:"rate_limited",actionId});}}
  const streamId=await redis.xadd(keys.controllerCommands,"MAXLEN","~",2000,"*","payload",JSON.stringify({...body,roomId:room.id,requesterId:uid,actionId}));
  const apiTotalMs=Date.now()-receivedAt;
  app.log.info({actionId,streamId,roomId:room.id,type:body.type,apiTotalMs},"[music-action] dispatched to controller");
  void db.query(`INSERT INTO music_metrics(guild_id,room_id,trace_id,metric,value_ms,details) VALUES($1,$2,$3,'api_action_ms',$4,$5)`,[guildId,room.id,actionId,apiTotalMs,{type:body.type,routeMs:apiTotalMs}]).catch(()=>{});
  return {ok:true,actionId,roomId:room.id,voiceChannelId:voice.channelId,voiceChannelName:voice.name};
});

// Compatibility action route for Discord components and older dashboard clients.
app.post("/v1/music/rooms/:roomId/actions",async(req:any,reply)=>{
  const {roomId}=req.params;
  const body=z.discriminatedUnion("type",[
    z.object({type:z.literal("QUEUE"),query:z.string().min(1).max(1000)}),z.object({type:z.enum(["PAUSE","RESUME","SKIP","VOTE_SKIP","STOP","QUEUE_CLEAR"])}),z.object({type:z.literal("QUEUE_REMOVE"),index:z.number().int().min(0)}),z.object({type:z.literal("SKIP_TO"),requestId:z.string().min(1).max(128),currentRequestId:z.string().min(1).max(128)}),z.object({type:z.literal("SEEK"),positionMs:z.number().int().min(0)}),z.object({type:z.literal("FILTER"),preset:z.string().min(1)}),z.object({type:z.literal("VOLUME"),volume:z.number().int().min(0).max(200)})
  ]).parse(req.body);
  const perm=body.type==="FILTER"?"MANAGE_FILTERS":body.type==="QUEUE"||body.type==="VOTE_SKIP"?"USE_MUSIC":body.type==="SKIP"||body.type==="SKIP_TO"?"FORCE_SKIP":body.type==="QUEUE_CLEAR"||body.type==="QUEUE_REMOVE"?"MANAGE_QUEUE":"MANAGE_MUSIC";
  if(!await requirePermission(req,reply,perm))return;
  const exists=await oneOrNone(`SELECT id FROM music_rooms WHERE id=$1 AND guild_id=$2`,[roomId,guildId]);if(!exists)return reply.code(404).send({error:"not_found"});
  if(body.type==="SKIP_TO"&&!await requirePermission(req,reply,"MANAGE_QUEUE"))return;
  if(body.type==="FILTER"&&!Object.prototype.hasOwnProperty.call(FILTER_PRESETS,body.preset))return reply.code(400).send({error:"invalid_filter"});
  const actionId=randomUUID(),uid=userId(req);
  app.log.info({actionId,userId:uid,type:body.type,roomId,query:body.type==="QUEUE"?logSafeQuery(body.query):undefined},"[music-action] compatibility action accepted");
  const streamId=await redis.xadd(keys.controllerCommands,"MAXLEN","~",2000,"*","payload",JSON.stringify({...body,roomId,requesterId:uid,actionId}));
  app.log.info({actionId,streamId,roomId,type:body.type},"[music-action] dispatched to controller");
  return{ok:true,actionId};
});

app.get("/v1/music/room/:id/live",async(req:any,reply)=>{const access=await requireMember(req,reply);if(!access)return;const room=await oneOrNone<any>(`SELECT * FROM music_rooms WHERE guild_id=$1 AND id=$2 AND enabled=TRUE`,[guildId,String(req.params.id)]);if(!room)return reply.code(404).send({error:"not_found"});return liveRoom(room);});

app.post("/v1/music/settings",async(req:any,reply)=>{
  if(!await requireAdmin(req,reply))return;
  const body=z.object({defaultLanguage:z.string().min(2).max(15).optional(),autoplayDefault:z.boolean().optional(),skipMode:SkipMode.optional(),stickyAfterMessages:z.number().int().min(1).max(25).optional()}).parse(req.body);
  await db.query(`INSERT INTO guild_settings(guild_id) VALUES($1) ON CONFLICT DO NOTHING`,[guildId]);
  await db.query(`UPDATE guild_settings SET default_language=COALESCE($2,default_language),autoplay_default=COALESCE($3,autoplay_default),skip_mode=COALESCE($4,skip_mode),sticky_after_messages=COALESCE($5,sticky_after_messages),updated_at=CURRENT_TIMESTAMP WHERE guild_id=$1`,[guildId,body.defaultLanguage??null,body.autoplayDefault??null,body.skipMode??null,body.stickyAfterMessages??null]);
  await db.query(`INSERT INTO audit_log(guild_id,actor_id,action,details) VALUES($1,$2,'settings.update',$3)`,[guildId,userId(req),body]);return{ok:true};
});

app.get("/v1/music/permissions",async(req:any,reply)=>{if(!await requireAdmin(req,reply))return;return many(`SELECT * FROM music_permission_rules WHERE guild_id=$1 ORDER BY role_id,permission`,[guildId]);});
app.put("/v1/music/permissions",async(req:any,reply)=>{
  if(!await requireAdmin(req,reply))return;const b=z.object({roleId:z.string(),permission:MusicPermission,allowed:z.boolean()}).parse(req.body);
  const ctx=await discordContext();if(!ctx.roles.some((r:any)=>r.id===b.roleId))return reply.code(400).send({error:"invalid_role"});
  await db.query(`INSERT INTO music_permission_rules(guild_id,role_id,permission,allowed) VALUES($1,$2,$3,$4) ON CONFLICT (guild_id,role_id,permission) DO UPDATE SET allowed=EXCLUDED.allowed`,[guildId,b.roleId,b.permission,b.allowed]);return{ok:true};
});
app.delete("/v1/music/permissions/:id",async(req:any,reply)=>{const {id}=req.params;if(!await requireAdmin(req,reply))return;await db.query(`DELETE FROM music_permission_rules WHERE guild_id=$1 AND id=$2`,[guildId,id]);return{ok:true};});

app.get("/v1/admin/summary",async(req:any,reply)=>{
  if(!await requireAdmin(req,reply))return;
  await db.query(`INSERT INTO guild_settings(guild_id) VALUES($1) ON CONFLICT DO NOTHING`,[guildId]);
  const [settings,permissions,context,workers,sessions,integrations]=await Promise.all([
    oneOrNone(`SELECT * FROM guild_settings WHERE guild_id=$1`,[guildId]),
    many(`SELECT * FROM music_permission_rules WHERE guild_id=$1 ORDER BY role_id,permission`,[guildId]),
    discordContext(),workerHealth(),
    many<any>(`SELECT * FROM music_rooms WHERE guild_id=$1 AND enabled=TRUE ORDER BY updated_at DESC`,[guildId]),
    many(`SELECT provider,enabled,config FROM integrations WHERE guild_id=$1 ORDER BY provider`,[guildId])
  ]);
  const liveSessions=[];for(const room of sessions)liveSessions.push(await liveRoom(room));
  return {settings,permissions,context,workers,sessions:liveSessions,adminRoleId:dashboardAdminRole(),integrations:{saved:integrations,runtime:{lastfm:Boolean(process.env.LASTFM_API_KEY),musicbrainz:true,lavalink:true,lavalyrics:(process.env.LAVALYRICS_ENABLED??"true").toLowerCase()!=="false",lavasrc:(process.env.LAVASRC_ENABLED??"true").toLowerCase()!=="false"}}};
});


app.get("/v1/admin/health",async(req:any,reply)=>{
  if(!await requireAdmin(req,reply))return;
  const started=performance.now();
  const services:any[]=[{key:"api",label:"Core service",status:"healthy",detail:"Responding normally"}];
  let databaseMs:number|null=null;
  try{const t=performance.now();await db.query(`SELECT 1`);databaseMs=Number((performance.now()-t).toFixed(1));services.push({key:"database",label:"Database",status:"healthy",detail:"Connected",latencyMs:databaseMs});}
  catch{services.push({key:"database",label:"Database",status:"offline",detail:"Not reachable"});}
  try{const t=performance.now();const pong=await redis.ping();services.push({key:"live",label:"Live state",status:pong?"healthy":"degraded",detail:pong?"Available":"Unexpected response",latencyMs:Number((performance.now()-t).toFixed(1))});}
  catch{services.push({key:"live",label:"Live state",status:"degraded",detail:"Live updates are temporarily unavailable; saved data remains safe"});}
  const lavalinkRaw=String(process.env.LAVALINK_URL??process.env.LAVALINK_HOST??"").trim().replace(/\/$/,"");
  const lavalinkBase=lavalinkRaw&&!/^https?:\/\//i.test(lavalinkRaw)?`http://${lavalinkRaw}`:lavalinkRaw;
  if(lavalinkBase){try{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),2800);const t=performance.now();const headers:Record<string,string>={};if(process.env.LAVALINK_PASSWORD)headers.authorization=String(process.env.LAVALINK_PASSWORD);const r=await fetch(`${lavalinkBase}/version`,{headers,signal:controller.signal});clearTimeout(timer);services.push({key:"audio",label:"Audio engine",status:r.ok?"healthy":"degraded",detail:r.ok?"Connected":`Responded with ${r.status}`,latencyMs:Number((performance.now()-t).toFixed(1))});}catch{services.push({key:"audio",label:"Audio engine",status:"degraded",detail:"Health check could not complete"});}}
  else services.push({key:"audio",label:"Audio engine",status:"degraded",detail:"Endpoint is not configured"});
  const publicUrl=String(process.env.PUBLIC_DASHBOARD_URL??"").trim();
  if(publicUrl){try{const r=await fetch(new URL('/api/health',publicUrl),{signal:AbortSignal.timeout(4000),redirect:'error'});const body:any=await r.json();services.push({key:'dashboard',label:'Dashboard',status:r.ok&&body.ok===true?'healthy':'degraded',detail:r.ok&&body.ok===true?'Public dashboard and backend request succeeded':'Public dashboard readiness failed'});}catch{services.push({key:'dashboard',label:'Dashboard',status:'degraded',detail:'Public dashboard readiness request failed'});}}
  else services.push({key:'dashboard',label:'Dashboard',status:'degraded',detail:'Public route is not configured'});
  const workers=await workerHealth();
  const workerOnline=workers.filter((w:any)=>!w.offline).length;
  services.push({key:"workers",label:"Music workers",status:workerOnline===workers.length?"healthy":workerOnline?"degraded":"offline",detail:`${workerOnline}/${workers.length} available`});
  // Unified platform/module health. These checks intentionally stay cheap so the Health page can be polled.
  try{const raw=await redis.get(`platform:heartbeat:controller:${guildId}`);const hb=raw?JSON.parse(raw):null;const age=hb?.at?Date.now()-new Date(hb.at).getTime():Infinity;services.push({key:"controller",label:"Discord controller",status:age<60000?"healthy":age<180000?"degraded":"offline",detail:age<60000?"Heartbeat current":age<Infinity?`Last heartbeat ${Math.round(age/1000)}s ago`:"No heartbeat detected"});}catch{services.push({key:"controller",label:"Discord controller",status:"degraded",detail:"Heartbeat check unavailable"});}
  try{const q=await oneOrNone<any>(`SELECT COUNT(*) FILTER (WHERE status='QUEUED')::int queued,COUNT(*) FILTER (WHERE status='RUNNING')::int running,COUNT(*) FILTER (WHERE status='FAILED' AND updated_at>CURRENT_TIMESTAMP-INTERVAL '24 hours')::int failed FROM platform_jobs WHERE guild_id=$1`,[guildId]);const failed=Number(q?.failed??0),queued=Number(q?.queued??0),running=Number(q?.running??0);services.push({key:"jobs",label:"Background jobs",status:failed>5?"degraded":"healthy",detail:`${running} running · ${queued} queued${failed?` · ${failed} failed (24h)`:""}`});}catch{services.push({key:"jobs",label:"Background jobs",status:"degraded",detail:"Queue schema unavailable until migration completes"});}
  try{const wiki=await oneOrNone<any>(`SELECT COUNT(*)::int total,COUNT(*) FILTER (WHERE updated_at<CURRENT_TIMESTAMP-INTERVAL '90 days')::int stale FROM wiki_articles WHERE guild_id=$1 AND status='PUBLISHED'`,[guildId]);const stale=Number(wiki?.stale??0);services.push({key:"wiki",label:"Wiki knowledge",status:stale>25?"degraded":"healthy",detail:`${Number(wiki?.total??0)} published · ${stale} stale-review candidates`});}catch{services.push({key:"wiki",label:"Wiki knowledge",status:"degraded",detail:"Wiki check unavailable"});}
  try{const r=await oneOrNone<any>(`SELECT COUNT(*) FILTER (WHERE status IN ('RECRUITER_REVIEW','INTERVIEW'))::int active,COUNT(*) FILTER (WHERE status IN ('RECRUITER_REVIEW','INTERVIEW') AND waiting_on<>'APPLICANT' AND updated_at<CURRENT_TIMESTAMP-INTERVAL '14 days')::int aging FROM recruitment_applications WHERE guild_id=$1`,[guildId]);services.push({key:"recruitment",label:"Recruitment",status:Number(r?.aging??0)>0?"degraded":"healthy",detail:`${Number(r?.active??0)} open applications${Number(r?.aging??0)?` · ${Number(r.aging)} need attention`:""}`});}catch{services.push({key:"recruitment",label:"Recruitment",status:"degraded",detail:"Recruitment check unavailable"});}
  try{const pb=await oneOrNone<any>(`SELECT COUNT(*) FILTER (WHERE status IN ('OPEN','CLOSED'))::int current FROM pb_battles WHERE guild_id=$1`,[guildId]);services.push({key:"port-battles",label:"Port Battles",status:"healthy",detail:`${Number(pb?.current??0)} current battles`});}catch{services.push({key:"port-battles",label:"Port Battles",status:"degraded",detail:"Port Battle check unavailable"});}
  let apiPerformance:any={count:0,avgMs:null,p95Ms:null,errorRate:0};
  try{const r=await oneOrNone<any>(`SELECT COUNT(*)::int AS count, AVG((metadata->>'durationMs')::numeric)::float AS avg_ms, percentile_cont(0.95) WITHIN GROUP (ORDER BY (metadata->>'durationMs')::numeric)::float AS p95_ms, SUM(CASE WHEN (metadata->>'statusCode')::int>=500 THEN 1 ELSE 0 END)::int AS errors FROM sentinel_events WHERE guild_id=$1 AND action='api.request' AND metadata ? 'durationMs' AND occurred_at > CURRENT_TIMESTAMP-INTERVAL '24 hours'`,[guildId]);const count=Number(r?.count??0),errors=Number(r?.errors??0);apiPerformance={count,avgMs:r?.avg_ms==null?null:Number(r.avg_ms),p95Ms:r?.p95_ms==null?null:Number(r.p95_ms),errorRate:count?errors/count:0};}catch{}
  let clientPerformance:any[]=[];
  try{clientPerformance=await many<any>(`SELECT metric,COUNT(*)::int AS count,AVG(value)::float AS avg,percentile_cont(0.95) WITHIN GROUP (ORDER BY value)::float AS p95 FROM dashboard_performance_samples WHERE guild_id=$1 AND created_at>CURRENT_TIMESTAMP-INTERVAL '24 hours' GROUP BY metric ORDER BY metric`,[guildId]);}catch{}
  const overall=services.some(x=>x.status==="offline")?"degraded":services.some(x=>x.status==="degraded")?"degraded":"healthy";
  return {generatedAt:new Date().toISOString(),overall,services,workers,apiPerformance,clientPerformance,requestMs:Number((performance.now()-started).toFixed(1)),stateBackend};
});

app.get("/v1/music/preferences",async(req:any,reply)=>{const access=await requireMember(req,reply);if(!access)return;const uid=userId(req);return(await oneOrNone(`SELECT * FROM user_music_preferences WHERE guild_id=$1 AND user_id=$2`,[guildId,uid]))??{guild_id:guildId,user_id:uid,language:null,autoplay_opt_in:true,explicit_content:true};});
app.put("/v1/music/preferences",async(req:any,reply)=>{
  const access=await requireMember(req,reply);if(!access)return;const uid=userId(req);const b=z.object({language:z.string().max(15).nullable().optional(),autoplayOptIn:z.boolean().optional(),explicitContent:z.boolean().optional()}).parse(req.body);
  await db.query(`INSERT INTO user_music_preferences(guild_id,user_id,language,autoplay_opt_in,explicit_content) VALUES($1,$2,$3,COALESCE($4,TRUE),COALESCE($5,TRUE)) ON CONFLICT (guild_id,user_id) DO UPDATE SET language=COALESCE(EXCLUDED.language,user_music_preferences.language),autoplay_opt_in=COALESCE($4,user_music_preferences.autoplay_opt_in),explicit_content=COALESCE($5,user_music_preferences.explicit_content)`,[guildId,uid,b.language??null,b.autoplayOptIn??null,b.explicitContent??null]);return{ok:true};
});

app.get("/v1/music/recommendations",async(req:any,reply)=>{
  const access=await requireMember(req,reply);if(!access)return;const uid=userId(req);
  const [profile,feature,feedback]=await Promise.all([
    oneOrNone<any>(`SELECT * FROM music_user_profiles WHERE guild_id=$1 AND user_id=$2`,[guildId,uid]),
    oneOrNone<any>(`SELECT * FROM music_feature_settings WHERE guild_id=$1`,[guildId]),
    many<any>(`SELECT title,author,rating FROM track_feedback WHERE guild_id=$1 AND user_id=$2 ORDER BY updated_at DESC LIMIT 100`,[guildId,uid])
  ]);
  let seeds=await many<{title:string;author:string}>(`SELECT th.title,th.author FROM listening_events le JOIN track_history th ON th.id=le.history_id WHERE le.guild_id=$1 AND le.user_id=$2 AND (le.listened_ms>=30000 OR le.listened_ms>=th.duration_ms*0.5) ORDER BY le.joined_at DESC LIMIT 6`,[guildId,uid]);
  if(!seeds.length)seeds=await many<{title:string;author:string}>(`SELECT title,author FROM track_history WHERE guild_id=$1 AND requester_id=$2 ORDER BY started_at DESC LIMIT 6`,[guildId,uid]);
  const dislikes=new Set(feedback.filter((x:any)=>x.rating<0).map((x:any)=>`${x.author}|${x.title}`.toLowerCase()));const out:any[]=[];const seen=new Set<string>();const key=process.env.LASTFM_API_KEY;
  if(key){for(const seed of seeds.slice(0,4)){try{const u=new URL("https://ws.audioscrobbler.com/2.0/");u.search=new URLSearchParams({method:"track.getsimilar",artist:seed.author,track:seed.title,api_key:key,format:"json",limit:"8"}).toString();const r=await fetch(u,{headers:{"User-Agent":"BOMMusic/0.5"},signal:AbortSignal.timeout(2200)});if(!r.ok)continue;const j:any=await r.json();for(const x of j.similartracks?.track??[]){const author=x?.artist?.name,title=x?.name;if(!author||!title)continue;const k=`${author}|${title}`.toLowerCase();if(seen.has(k)||dislikes.has(k))continue;seen.add(k);out.push({title,author,query:`${author} ${title}`,reason:`Because you listened to ${seed.author} — ${seed.title}`});if(out.length>=10)break;}if(out.length>=10)break;}catch{}}}
  if(out.length<12){const rows=await many<{title:string;author:string}>(`SELECT title,author,COUNT(*) plays FROM track_history WHERE guild_id=$1 GROUP BY title,author ORDER BY ${feature?.autoplay_profile==='DEEP_CUTS'?'plays ASC':'plays DESC'},MAX(started_at) DESC LIMIT 50`,[guildId]);for(const x of rows){const k=`${x.author}|${x.title}`.toLowerCase();if(seen.has(k)||dislikes.has(k))continue;seen.add(k);out.push({title:x.title,author:x.author,query:`${x.author} ${x.title}`,reason:profile?.preferred_mood?`${profile.preferred_mood.toLowerCase()} discovery`:"Popular with BOM"});if(out.length>=12)break;}}
  return out;
});

app.get("/v1/music/integrations",async(req:any,reply)=>{if(!await requireAdmin(req,reply))return;const saved=await many(`SELECT provider,enabled,config FROM integrations WHERE guild_id=$1 ORDER BY provider`,[guildId]);return{saved,runtime:{lastfm:Boolean(process.env.LASTFM_API_KEY),musicbrainz:true,lavalink:true,lavalyrics:(process.env.LAVALYRICS_ENABLED??"true").toLowerCase()!=="false",lavasrc:(process.env.LAVASRC_ENABLED??"true").toLowerCase()!=="false"}};});
app.put("/v1/music/integrations/:provider",async(req:any,reply)=>{const {provider}=req.params;if(!await requireAdmin(req,reply))return;const b=z.object({enabled:z.boolean(),config:z.record(z.unknown()).default({})}).parse(req.body);await db.query(`INSERT INTO integrations(guild_id,provider,enabled,config) VALUES($1,$2,$3,$4) ON CONFLICT (guild_id,provider) DO UPDATE SET enabled=EXCLUDED.enabled,config=EXCLUDED.config`,[guildId,String(provider).slice(0,64),b.enabled,b.config]);return{ok:true};});

app.get("/v1/filters",async()=>Object.entries(FILTER_PRESETS).map(([id,config])=>({id,config})));
app.get("/v1/music/events",async(req:any,reply)=>{
  const access=await requireMember(req,reply);if(!access)return;
  const sub=redisSub.duplicate();
  await sub.subscribe("music:live");

  reply.hijack();
  reply.raw.writeHead(200,{
    "Content-Type":"text/event-stream; charset=utf-8",
    "Cache-Control":"no-cache, no-store, no-transform, must-revalidate",
    "Connection":"keep-alive",
    "X-Accel-Buffering":"no",
    "Content-Encoding":"identity"
  });
  reply.raw.flushHeaders?.();

  let closed=false;
  const write=(chunk:string)=>{
    if(closed||reply.raw.destroyed||reply.raw.writableEnded)return false;
    try{return reply.raw.write(chunk);}catch{return false;}
  };
  const cleanup=()=>{
    if(closed)return;
    closed=true;
    clearInterval(heartbeat);
    sub.removeAllListeners("message");
    void sub.quit().catch(()=>{});
  };

  // Give EventSource a retry hint and immediately establish the stream.
  write(`retry: 3000\n\n`);
  write(`event: ready\ndata: {"ok":true}\n\n`);

  const heartbeat=setInterval(()=>{
    if(!write(`: ping ${Date.now()}\n\n`))cleanup();
  },15_000);

  sub.on("message",(_c:string,msg:string)=>{
    if(!write(`data: ${msg}\n\n`))cleanup();
  });
  req.raw.once("aborted",cleanup);
  req.raw.once("close",cleanup);
  reply.raw.once("close",cleanup);
  reply.raw.once("error",cleanup);
});

await app.listen({port,host:process.env.API_HOST??"127.0.0.1"});
startSocialEngine(guildId);
startPlatformJobRunner(guildId);
void bootstrapBrandingDefaults(guildId).catch(err=>app.log.warn({err},"music worker branding bootstrap failed"));
