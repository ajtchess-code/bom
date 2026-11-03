/** Query/body numbers: blank, missing or non-numeric values fall back instead of becoming NaN. */
const numberOr=(value:unknown,fallback:number)=>{const n=Math.floor(Number(value??fallback));return Number.isFinite(n)?n:fallback;};
import {randomUUID,createHash} from "node:crypto";
import {db,many,oneOrNone} from "@bom/db";
import {redis} from "@bom/redis";
import {DEFAULT_PLATFORM_FEATURES,PLATFORM_CONFIG_VERSION,PlatformSettingsSchema} from "@bom/shared";
import {discordAccess,discordContext,discordMemberProfile,hasDashboardAdminAccess} from "./authz.js";

const json=<T>(v:any,fallback:T):T=>{if(v==null)return fallback;if(typeof v!=="string")return v as T;try{return JSON.parse(v) as T}catch{return fallback}};
const clean=(v:any,n=2000)=>String(v??"").trim().slice(0,n);
const bool=(v:any,d=false)=>typeof v==="boolean"?v:d;
const PLATFORM_JOB_TYPES=new Set(["WIKI_STALE_SCAN","CONFIG_EXPORT","HEALTH_SNAPSHOT"]);

export async function emitPlatformEvent(guildId:string,event:{eventType:string;category?:string;actorId?:string|null;subjectType?:string|null;subjectId?:string|null;title:string;summary?:string|null;severity?:"info"|"success"|"warning"|"error";metadata?:Record<string,unknown>}){
  const row=await oneOrNone<any>(`INSERT INTO platform_events(guild_id,event_type,category,actor_id,subject_type,subject_id,title,summary,severity,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) RETURNING *`,[guildId,event.eventType,event.category??"system",event.actorId??null,event.subjectType??null,event.subjectId??null,event.title,event.summary??null,event.severity??"info",JSON.stringify(event.metadata??{})]);
  try{await redis.publish("platform:events",JSON.stringify(row??event));}catch{}
  return row;
}

export async function enqueuePlatformJob(guildId:string,jobType:string,payload:any={},requestedBy?:string|null,priority=100){
  if(!PLATFORM_JOB_TYPES.has(jobType))throw new Error(`Unsupported platform job type: ${jobType}`);
  const id=randomUUID();
  await db.query(`INSERT INTO platform_jobs(id,guild_id,job_type,payload,requested_by,priority) VALUES($1,$2,$3,$4::jsonb,$5,$6)`,[id,guildId,jobType.slice(0,80),JSON.stringify(payload??{}),requestedBy??null,priority]);
  await emitPlatformEvent(guildId,{eventType:"job.queued",category:"system",actorId:requestedBy??null,subjectType:"job",subjectId:id,title:`Queued ${jobType}`,summary:"Background work was added to the centralized BOM job queue."}).catch(()=>{});
  return id;
}

async function ensureSettings(guildId:string){
  await db.query(`INSERT INTO platform_settings(guild_id,config_version,feature_flags,navigation,defaults) VALUES($1,$2,$3::jsonb,'{}'::jsonb,'{}'::jsonb) ON CONFLICT DO NOTHING`,[guildId,PLATFORM_CONFIG_VERSION,JSON.stringify(DEFAULT_PLATFORM_FEATURES)]);
  const row=await oneOrNone<any>(`SELECT * FROM platform_settings WHERE guild_id=$1`,[guildId]);
  return {...row,feature_flags:{...DEFAULT_PLATFORM_FEATURES,...json(row?.feature_flags,{})},navigation:json(row?.navigation,{}),defaults:json(row?.defaults,{})};
}

async function setupChecklist(guildId:string){
  const [membership,recruitment,pb,music,wiki,platform]=await Promise.all([
    oneOrNone<any>(`SELECT * FROM membership_settings WHERE guild_id=$1`,[guildId]).catch(()=>null),
    oneOrNone<any>(`SELECT * FROM recruitment_settings WHERE guild_id=$1`,[guildId]).catch(()=>null),
    oneOrNone<any>(`SELECT * FROM pb_discord_settings WHERE guild_id=$1`,[guildId]).catch(()=>null),
    oneOrNone<any>(`SELECT * FROM guild_settings WHERE guild_id=$1`,[guildId]).catch(()=>null),
    oneOrNone<any>(`SELECT * FROM wiki_settings WHERE guild_id=$1`,[guildId]).catch(()=>null),
    ensureSettings(guildId)
  ]);
  const items=[
    {key:"platform",label:"Core platform",ready:Boolean(platform),detail:"Single-guild runtime and platform settings are initialized."},
    {key:"welcome",label:"Welcome & membership",ready:Boolean(membership?.welcome_channel_id&&membership?.member_role_id),detail:membership?.welcome_channel_id?"Welcome channel configured; confirm the BOM member role too.":"Choose a Welcome channel and BOM member role."},
    {key:"recruitment",label:"Recruitment",ready:Boolean(recruitment?.enabled&&recruitment?.ticket_category_id&&Array.isArray(json(recruitment?.recruiter_role_ids,[]))&&json<any[]>(recruitment?.recruiter_role_ids,[]).length),detail:recruitment?.enabled?"Recruitment is enabled; verify roles and ticket category.":"Recruitment is currently disabled."},
    {key:"portBattles",label:"Port Battles",ready:Boolean(pb?.signup_channel_id&&pb?.roster_channel_id&&pb?.schedule_channel_id&&pb?.manager_role_id),detail:"Signup, roster, schedule and manager role should all be configured."},
    {key:"music",label:"Music",ready:Boolean(music),detail:"Music defaults and worker pool configuration are initialized."},
    {key:"wiki",label:"Wiki",ready:Boolean(wiki),detail:"Wiki settings and knowledge engine are initialized."},
  ];
  return {items,complete:items.filter(x=>x.ready).length,total:items.length,percent:Math.round(items.filter(x=>x.ready).length/items.length*100)};
}

async function processJob(guildId:string,row:any){
  const payload=json(row.payload,{} as any);
  const finish=async(result:any,message:string)=>{await db.query(`UPDATE platform_jobs SET status='SUCCEEDED',progress=100,progress_message=$2,result=$3::jsonb,finished_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status='RUNNING' AND claimed_by=$4`,[row.id,message,JSON.stringify(result??{}),row.claimed_by]);};
  if(row.job_type==="WIKI_STALE_SCAN"){
    await db.query(`UPDATE platform_jobs SET progress=30,progress_message='Reviewing Wiki article and source freshness',updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[row.id]);
    const [articleRows,sourceRows,previousHealth]=await Promise.all([
      many<any>(`SELECT slug,title,updated_at FROM wiki_articles WHERE guild_id=$1 AND archived_at IS NULL`,[guildId]).catch(()=>[]),
      many<any>(`SELECT source_id,name,source_kind,sha256,metadata,updated_at FROM wiki_sources ORDER BY name`).catch(()=>[]),
      many<any>(`SELECT source_key,content_hash,status FROM wiki_source_health WHERE guild_id=$1`,[guildId]).catch(()=>[])
    ]);
    const cutoff=Date.now()-1000*60*60*24*90,healthBy=new Map<string,any>(previousHealth.map((x:any)=>[String(x.source_key),x] as [string,any]));
    const staleArticles=articleRows.filter((x:any)=>+new Date(x.updated_at)<cutoff);
    const sourceResults=[] as any[];
    for(const source of sourceRows){
      const prior=healthBy.get(String(source.source_id)),kind=String(source.source_kind??'unknown'),hash=source.sha256?String(source.sha256):null;
      const changed=Boolean(prior?.content_hash&&hash&&String(prior.content_hash)!==hash),aged=+new Date(source.updated_at)<cutoff;
      const status=changed?'CHANGED':aged?'STALE':'FRESH';
      const confidence=/official/i.test(kind)?'VERIFIED':/(user_|community|third_party|public_spreadsheet|website_snapshot)/i.test(kind)?'COMMUNITY':/(legacy|internal|bom|curated)/i.test(kind)?'CURATED':'UNVERIFIED';
      await db.query(`INSERT INTO wiki_source_health(guild_id,source_key,source_type,confidence,last_checked_at,last_changed_at,content_hash,status,details) VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP,$5,$6,$7,$8::jsonb) ON CONFLICT(guild_id,source_key) DO UPDATE SET source_type=EXCLUDED.source_type,confidence=EXCLUDED.confidence,last_checked_at=EXCLUDED.last_checked_at,last_changed_at=CASE WHEN EXCLUDED.status='CHANGED' THEN CURRENT_TIMESTAMP ELSE COALESCE(wiki_source_health.last_changed_at,EXCLUDED.last_changed_at) END,content_hash=EXCLUDED.content_hash,status=EXCLUDED.status,details=EXCLUDED.details`,[guildId,String(source.source_id),kind,confidence,source.updated_at,hash,status,JSON.stringify({name:source.name,updatedAt:source.updated_at,metadata:json(source.metadata,{})})]);
      sourceResults.push({sourceKey:source.source_id,name:source.name,sourceType:kind,confidence,status,updatedAt:source.updated_at});
    }
    const staleSources=sourceResults.filter((x:any)=>x.status!=='FRESH');
    await finish({staleArticles:staleArticles.map((x:any)=>({slug:x.slug,title:x.title,updatedAt:x.updated_at})),sources:sourceResults,staleArticleCount:staleArticles.length,staleSourceCount:staleSources.length},`Found ${staleArticles.length} stale article${staleArticles.length===1?'':'s'} and ${staleSources.length} source${staleSources.length===1?'':'s'} needing review.`);
    return;
  }
  if(row.job_type==="CONFIG_EXPORT"){
    const platform=await ensureSettings(guildId),membership=await oneOrNone<any>(`SELECT * FROM membership_settings WHERE guild_id=$1`,[guildId]).catch(()=>null),recruitment=await oneOrNone<any>(`SELECT * FROM recruitment_settings WHERE guild_id=$1`,[guildId]).catch(()=>null),pb=await oneOrNone<any>(`SELECT * FROM pb_discord_settings WHERE guild_id=$1`,[guildId]).catch(()=>null),music=await oneOrNone<any>(`SELECT * FROM guild_settings WHERE guild_id=$1`,[guildId]).catch(()=>null);
    await finish({schemaVersion:PLATFORM_CONFIG_VERSION,exportedAt:new Date().toISOString(),mode:"single-guild",platform:{featureFlags:platform.feature_flags,navigation:platform.navigation,defaults:platform.defaults},membership:safeConfigRow("membership_settings",membership),recruitment:safeConfigRow("recruitment_settings",recruitment),portBattles:safeConfigRow("pb_discord_settings",pb),music:safeConfigRow("guild_settings",music)},"Configuration export is ready.");return;
  }
  if(row.job_type==="HEALTH_SNAPSHOT"){
    const [dbOk,redisOk]=await Promise.all([db.query(`SELECT 1`).then(()=>true).catch(()=>false),redis.ping().then(()=>true).catch(()=>false)]);
    await finish({database:dbOk,redis:redisOk,at:new Date().toISOString(),requested:payload},"Health snapshot completed.");return;
  }
  await finish({echo:payload},"Job completed.");
}

let runner:any=null;
export function startPlatformJobRunner(guildId:string){
  if(runner)return;
  const workerId='api:'+randomUUID();let working=false;
  const tick=async()=>{
    if(working)return;working=true;
    try{
    await db.query(`UPDATE platform_jobs SET status=CASE WHEN attempts<max_attempts THEN 'QUEUED' ELSE 'FAILED' END,claimed_by=NULL,available_at=now(),updated_at=now(),progress_message='Recovered expired worker lease' WHERE guild_id=$1 AND status='RUNNING' AND updated_at<now()-INTERVAL '15 minutes'`,[guildId]);
    const row=await oneOrNone<any>(`UPDATE platform_jobs SET status='RUNNING',attempts=attempts+1,claimed_by=$2,started_at=COALESCE(started_at,CURRENT_TIMESTAMP),progress=GREATEST(progress,5),progress_message='Starting',updated_at=CURRENT_TIMESTAMP WHERE id=(SELECT id FROM platform_jobs WHERE guild_id=$1 AND status='QUEUED' AND available_at<=CURRENT_TIMESTAMP ORDER BY priority ASC,created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`,[guildId,workerId]).catch(()=>null);
    if(!row)return;
    const heartbeat=setInterval(()=>void db.query(`UPDATE platform_jobs SET updated_at=now() WHERE id=$1 AND claimed_by=$2 AND status='RUNNING'`,[row.id,workerId]).catch(()=>{}),30000);heartbeat.unref?.();
    try{
      await processJob(guildId,row);
      const state=await oneOrNone<any>(`SELECT status FROM platform_jobs WHERE id=$1`,[row.id]);
      if(state?.status==='SUCCEEDED')await emitPlatformEvent(guildId,{eventType:"job.succeeded",category:"system",subjectType:"job",subjectId:row.id,title:`${row.job_type} completed`,severity:"success"}).catch(()=>{});
    }catch(err:any){
      const retry=Number(row.attempts??0)<Number(row.max_attempts??3);
      const updated=await db.query(`UPDATE platform_jobs SET status=$2,progress_message=$3,result=$4::jsonb,available_at=CASE WHEN $2='QUEUED' THEN CURRENT_TIMESTAMP+INTERVAL '30 seconds' ELSE available_at END,finished_at=CASE WHEN $2='FAILED' THEN CURRENT_TIMESTAMP ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status='RUNNING' AND claimed_by=$5`,[row.id,retry?"QUEUED":"FAILED",clean(err?.message??err,500),JSON.stringify({error:clean(err?.message??err,1000)}),workerId]);
      if(updated.rowCount)await emitPlatformEvent(guildId,{eventType:"job.failed",category:"system",subjectType:"job",subjectId:row.id,title:`${row.job_type} ${retry?"will retry":"failed"}`,summary:clean(err?.message??err,500),severity:"error"}).catch(()=>{});
    }finally{clearInterval(heartbeat)}
    }catch(err){console.error('[platform-jobs] runner failed',err)}finally{working=false}
  };
  runner=setInterval(()=>void tick(),1500);runner.unref?.();void tick();
}

function safeEnvPresence(){const keys=["DISCORD_BOT_TOKEN","DISCORD_CLIENT_ID","DISCORD_GUILD_ID","DATABASE_URL","POSTGRES_HOST","REDIS_URL","LAVALINK_URL","PUBLIC_DASHBOARD_URL","INTERNAL_API_TOKEN"];return Object.fromEntries(keys.map(k=>[k,Boolean(process.env[k])]));}

const CONFIG_IMPORT_COLUMNS={
  membership_settings:["welcome_enabled","welcome_channel_id","application_url","trade_role_id","diplomacy_enabled","diplomacy_category_id","diplomacy_role_id","diplomacy_archive_channel_id","diplomacy_voice_enabled","custom_roles_enabled","custom_role_approval_channel_id","custom_role_approval_role_id","custom_role_anchor_role_id","member_role_id","member_console_channel_id","roster_enabled","profile_reminder_role_id","officer_role_ids","leave_enabled","leave_officer_role_id","leave_reminder_channel_id"],
  recruitment_settings:["enabled","ticket_category_id","application_channel_id","recruiter_role_ids","applicant_role_id","trial_role_id","accepted_role_id","interview_voice_category_id","community_feedback_role_id","trial_voter_role_ids","application_reapply_days","trial_reapply_days","default_trial_days","midpoint_day","screenshot_required","auto_close_hours","unclaimed_reminder_minutes","applicant_reminder_hours","vote_mode","anonymous_votes"],
  pb_discord_settings:["signup_channel_id","roster_channel_id","schedule_channel_id","manager_role_id","signup_role_id","enabled"],
  guild_settings:["default_language","autoplay_default","skip_mode","sticky_after_messages"]
} as const;
function safeConfigRow(table:keyof typeof CONFIG_IMPORT_COLUMNS,row:any){if(!row||typeof row!=="object")return null;return Object.fromEntries(CONFIG_IMPORT_COLUMNS[table].filter(k=>Object.prototype.hasOwnProperty.call(row,k)).map(k=>[k,row[k]]));}
async function restoreConfigRow(table:keyof typeof CONFIG_IMPORT_COLUMNS,guildId:string,payload:any){
  if(!payload||typeof payload!=="object")return 0;
  const allowed=CONFIG_IMPORT_COLUMNS[table];
  const entries=allowed.filter(k=>Object.prototype.hasOwnProperty.call(payload,k)).map(k=>[k,payload[k]] as const);
  if(!entries.length)return 0;
  await db.query(`INSERT INTO ${table}(guild_id) VALUES($1) ON CONFLICT DO NOTHING`,[guildId]);
  const jsonColumns=new Set(["officer_role_ids","recruiter_role_ids","trial_voter_role_ids"]);
  const set=entries.map(([k],i)=>`${k}=$${i+2}${jsonColumns.has(k)?"::jsonb":""}`).join(",");
  const values=entries.map(([k,v])=>jsonColumns.has(k)?JSON.stringify(v??[]):v);
  await db.query(`UPDATE ${table} SET ${set},updated_at=CURRENT_TIMESTAMP WHERE guild_id=$1`,[guildId,...values]);
  return entries.length;
}


const MEMBER_RANKS=["Guest","Friend","Trusted Friend","Ally","Trade Partner","Member","BoM","Officer","Admiral","Leader"] as const;
function stripGuildPrefix(value:any){return clean(value,80).replace(/^\s*\[[^\]\n]{1,16}\]\s*/u,"").trim()||"Captain";}
function rankFromRoles(roleIds:string[],configured:any){
  const map=configured&&typeof configured==="object"?configured:{};
  for(const rank of [...MEMBER_RANKS].reverse()){const roleId=String(map[rank]??"");if(roleId&&roleIds.includes(roleId))return rank;}
  return "Guest";
}
async function memberCard(guildId:string,uid:string){
  const [profile,settings,access]=await Promise.all([discordMemberProfile(uid),ensureSettings(guildId),discordAccess(uid)]);
  if(!profile||!access.member)return null;
  await db.query(`INSERT INTO member_card_ids(guild_id,user_id) VALUES($1,$2) ON CONFLICT(guild_id,user_id) DO NOTHING`,[guildId,uid]);
  const identity=await oneOrNone<any>(`SELECT member_no,created_at FROM member_card_ids WHERE guild_id=$1 AND user_id=$2`,[guildId,uid]);
  const rankRoles=(settings.defaults??{}).memberRankRoles??{};
  const displayName=stripGuildPrefix(profile.nick??profile.globalName??profile.username);
  const avatar=profile.avatar?`https://cdn.discordapp.com/guilds/${guildId}/users/${uid}/avatars/${profile.avatar}.png?size=256`:profile.userAvatar?`https://cdn.discordapp.com/avatars/${uid}/${profile.userAvatar}.png?size=256`:null;
  const pb=await oneOrNone<any>(`SELECT manager_role_id FROM pb_discord_settings WHERE guild_id=$1`,[guildId]).catch(()=>null);
  const recruitment=await oneOrNone<any>(`SELECT recruiter_role_ids FROM recruitment_settings WHERE guild_id=$1`,[guildId]).catch(()=>null);
  const recruiterRoles=json<any[]>(recruitment?.recruiter_role_ids,[]).map(String);
  const dashboardAdmin=await hasDashboardAdminAccess(uid);
  const capabilities={dashboardAdmin,pbManager:dashboardAdmin||Boolean(pb?.manager_role_id&&profile.roles.includes(String(pb.manager_role_id))),recruitmentStaff:dashboardAdmin||recruiterRoles.some(r=>profile.roles.includes(r)),sentinel:dashboardAdmin};
  return {id:uid,username:profile.username,displayName,rawDisplayName:profile.nick??profile.globalName??profile.username,avatar,rank:rankFromRoles(profile.roles,rankRoles),memberNumber:`BOM-${String(identity?.member_no??0).padStart(6,"0")}`,joinedAt:profile.joinedAt,roleIds:profile.roles,capabilities};
}

export function registerPlatformOpsRoutes(app:any,deps:{guildId:string;requireMember:any;requireAdmin:any;userId:(req:any)=>string}){
  const {guildId,requireMember,requireAdmin,userId}=deps;

  app.get('/v1/platform/summary',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;const [settings,checklist,jobs,events]=await Promise.all([ensureSettings(guildId),setupChecklist(guildId),many<any>(`SELECT id,job_type,status,priority,progress,progress_message,attempts,requested_by,created_at,started_at,finished_at FROM platform_jobs WHERE guild_id=$1 ORDER BY created_at DESC LIMIT 30`,[guildId]),many<any>(`SELECT * FROM platform_events WHERE guild_id=$1 ORDER BY created_at DESC LIMIT 40`,[guildId])]);return {mode:"single-guild",guildId,configVersion:PLATFORM_CONFIG_VERSION,settings,checklist,jobs,events};});

  app.get('/v1/platform/features',async(req:any,reply:any)=>{if(!(await requireMember(req,reply))?.member)return;const s=await ensureSettings(guildId);return {mode:'single-guild',configVersion:PLATFORM_CONFIG_VERSION,featureFlags:s.feature_flags,navigation:s.navigation};});
  app.get('/v1/platform/me',async(req:any,reply:any)=>{if(!(await requireMember(req,reply))?.member)return;const card=await memberCard(guildId,userId(req));if(!card)return reply.code(404).send({error:"member_not_found"});return card;});
  app.get('/v1/platform/member-ranks',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;const s=await ensureSettings(guildId),ctx=await discordContext();return {ranks:MEMBER_RANKS,roleMap:(s.defaults??{}).memberRankRoles??{},roles:ctx.roles};});
  app.put('/v1/platform/member-ranks',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;const s=await ensureSettings(guildId),incoming=req.body?.roleMap&&typeof req.body.roleMap==="object"?req.body.roleMap:{},allowed=new Set(MEMBER_RANKS),roleMap:any={};for(const [rank,roleId] of Object.entries(incoming)){if(allowed.has(rank as any)&&String(roleId??"").trim())roleMap[rank]=String(roleId);}const defaults={...(s.defaults??{}),memberRankRoles:roleMap};await db.query(`UPDATE platform_settings SET defaults=$2::jsonb,updated_by=$3,updated_at=CURRENT_TIMESTAMP WHERE guild_id=$1`,[guildId,JSON.stringify(defaults),userId(req)]);return {ok:true,roleMap};});
  app.get('/v1/platform/discord-widget',async(req:any,reply:any)=>{if(!(await requireMember(req,reply))?.member)return;
    try{const raw=await redis.get(`platform:voice:live:${guildId}`);if(!raw)return {enabled:false,source:'bot-gateway',members:[],voiceChannels:[]};
      const snapshot=JSON.parse(raw);if(Date.now()-Number(snapshot.at??0)>45_000)return {enabled:false,source:'bot-gateway',members:[],voiceChannels:[]};
      return {enabled:true,source:'bot-gateway',members:snapshot.members??[],voiceChannels:snapshot.voiceChannels??[],at:snapshot.at};
    }catch{return {enabled:false,source:'bot-gateway',members:[],voiceChannels:[]};}});
  app.post('/v1/platform/actions/use',async(req:any,reply:any)=>{if(!(await requireMember(req,reply))?.member)return;const key=clean(req.body?.key,120);if(!key)return reply.code(400).send({error:"action_key_required"});await db.query(`INSERT INTO dashboard_action_usage(guild_id,user_id,action_key,use_count,last_used_at) VALUES($1,$2,$3,1,CURRENT_TIMESTAMP) ON CONFLICT(guild_id,user_id,action_key) DO UPDATE SET use_count=dashboard_action_usage.use_count+1,last_used_at=CURRENT_TIMESTAMP`,[guildId,userId(req),key]);return {ok:true};});
  app.get('/v1/platform/actions/usage',async(req:any,reply:any)=>{if(!(await requireMember(req,reply))?.member)return;return many<any>(`SELECT action_key,use_count,last_used_at FROM dashboard_action_usage WHERE guild_id=$1 AND user_id=$2 ORDER BY use_count DESC,last_used_at DESC LIMIT 40`,[guildId,userId(req)]);});


  app.put('/v1/platform/settings',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;const current=await ensureSettings(guildId),incoming=PlatformSettingsSchema.partial().parse(req.body??{}),featureFlags={...current.feature_flags,...(incoming.featureFlags??{})},navigation={...current.navigation,...(incoming.navigation??{})},defaults={...current.defaults,...(incoming.defaults??{})};await db.query(`UPDATE platform_settings SET config_version=$2,feature_flags=$3::jsonb,navigation=$4::jsonb,defaults=$5::jsonb,updated_by=$6,updated_at=CURRENT_TIMESTAMP WHERE guild_id=$1`,[guildId,PLATFORM_CONFIG_VERSION,JSON.stringify(featureFlags),JSON.stringify(navigation),JSON.stringify(defaults),userId(req)]);await emitPlatformEvent(guildId,{eventType:"settings.updated",category:"admin",actorId:userId(req),subjectType:"platform",subjectId:guildId,title:"Platform settings updated",summary:"Feature flags, navigation, or shared defaults changed."});return {ok:true,settings:await ensureSettings(guildId)};});

  app.post('/v1/platform/settings/reset',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;const section=String(req.body?.section??"all"),key=clean(req.body?.key,80);const current=await ensureSettings(guildId);let flags=current.feature_flags,nav=current.navigation,defs=current.defaults;if(section==="all"){flags={...DEFAULT_PLATFORM_FEATURES};nav={};defs={};}else if(section==="featureFlags"){flags=key?{...current.feature_flags,[key]:(DEFAULT_PLATFORM_FEATURES as any)[key]??true}:{...DEFAULT_PLATFORM_FEATURES};}else if(section==="navigation")nav={};else if(section==="defaults")defs={};await db.query(`UPDATE platform_settings SET feature_flags=$2::jsonb,navigation=$3::jsonb,defaults=$4::jsonb,updated_by=$5,updated_at=CURRENT_TIMESTAMP WHERE guild_id=$1`,[guildId,JSON.stringify(flags),JSON.stringify(nav),JSON.stringify(defs),userId(req)]);await emitPlatformEvent(guildId,{eventType:"settings.reset",category:"admin",actorId:userId(req),title:key?`Reset ${key}`:`Reset ${section}`,summary:"Configuration returned to its BOM default.",severity:"success"});return {ok:true,settings:await ensureSettings(guildId)};});

  app.get('/v1/platform/setup-checklist',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;return setupChecklist(guildId);});
  app.get('/v1/platform/jobs',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;return many<any>(`SELECT * FROM platform_jobs WHERE guild_id=$1 ORDER BY created_at DESC LIMIT 100`,[guildId]);});
  app.post('/v1/platform/jobs',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;const type=clean(req.body?.jobType,80);if(!type)return reply.code(400).send({error:"job_type_required"});if(!PLATFORM_JOB_TYPES.has(type))return reply.code(400).send({error:"unsupported_job_type",allowed:[...PLATFORM_JOB_TYPES]});const id=await enqueuePlatformJob(guildId,type,req.body?.payload??{},userId(req),Math.max(1,Math.min(1000,numberOr(req.body?.priority,100))));return reply.code(202).send({ok:true,id});});
  app.post('/v1/platform/jobs/:id/cancel',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;await db.query(`UPDATE platform_jobs SET status='CANCELLED',progress_message='Cancelled by administrator',finished_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE guild_id=$1 AND id=$2 AND status IN ('QUEUED','RUNNING')`,[guildId,String(req.params.id)]);return {ok:true};});
  app.post('/v1/platform/jobs/:id/retry',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;await db.query(`UPDATE platform_jobs SET status='QUEUED',progress=0,progress_message='Queued for retry',result='{}'::jsonb,available_at=CURRENT_TIMESTAMP,finished_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE guild_id=$1 AND id=$2 AND status IN ('FAILED','CANCELLED')`,[guildId,String(req.params.id)]);return {ok:true};});

  app.get('/v1/platform/activity',async(req:any,reply:any)=>{if(!(await requireMember(req,reply))?.member)return;const rows=await many<any>(`SELECT id,event_type,category,title,NULL::text AS summary,severity,created_at FROM platform_events WHERE guild_id=$1 AND category NOT IN ('admin','system','platform','sentinel') AND event_type NOT LIKE 'config.%' AND event_type NOT LIKE 'job.%' ORDER BY created_at DESC LIMIT 80`,[guildId]);return rows;});
  app.get('/v1/platform/events',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;return many<any>(`SELECT * FROM platform_events WHERE guild_id=$1 ORDER BY created_at DESC LIMIT 200`,[guildId]);});

  app.get('/v1/platform/notification-preferences',async(req:any,reply:any)=>{if(!(await requireMember(req,reply))?.member)return;const uid=userId(req);await db.query(`INSERT INTO dashboard_notification_preferences(guild_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[guildId,uid]);const row=await oneOrNone<any>(`SELECT * FROM dashboard_notification_preferences WHERE guild_id=$1 AND user_id=$2`,[guildId,uid]);return {...row,categories:json(row?.categories,{})};});
  app.put('/v1/platform/notification-preferences',async(req:any,reply:any)=>{if(!(await requireMember(req,reply))?.member)return;const uid=userId(req),b=req.body??{},categories=typeof b.categories==="object"&&b.categories?b.categories:{};await db.query(`INSERT INTO dashboard_notification_preferences(guild_id,user_id,dashboard_enabled,discord_dm_enabled,browser_enabled,categories,quiet_hours) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) ON CONFLICT(guild_id,user_id) DO UPDATE SET dashboard_enabled=EXCLUDED.dashboard_enabled,discord_dm_enabled=EXCLUDED.discord_dm_enabled,browser_enabled=EXCLUDED.browser_enabled,categories=EXCLUDED.categories,quiet_hours=EXCLUDED.quiet_hours,updated_at=CURRENT_TIMESTAMP`,[guildId,uid,b.dashboardEnabled!==false,b.discordDmEnabled!==false,Boolean(b.browserEnabled),JSON.stringify(categories),JSON.stringify(b.quietHours??{})]);return {ok:true};});

  app.post('/v1/platform/test/:kind',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;const kind=String(req.params.kind),checklist=await setupChecklist(guildId);const item=checklist.items.find((x:any)=>x.key===kind||x.key.toLowerCase().includes(kind.toLowerCase()));const previews:any={welcome:{title:"Welcome to Band of Misfits",description:"Welcome, @captain! The panel below has the fastest routes to apply, trade, or contact diplomacy.",buttons:["Apply to BOM","Trade with Misfits","Diplomacy"],media:"/branding/defaults/welcome-template.png"},music:{title:"Now Playing",description:"Track title — Artist",buttons:["Pause","Skip","Queue","Lyrics"]},recruitment:{title:"BOM Recruitment",description:"Start or continue your application to Band of Misfits.",buttons:["Apply","My Application"]},portBattles:{title:"Port Battle Signups",description:"Current and upcoming fleet operations.",buttons:["Sign Up","Preferred Ships"]}};return {ok:item?.ready??true,validation:item??{key:kind,ready:true,detail:"Preview generated."},preview:previews[kind]??{title:`${kind} preview`,description:"Configuration preview is available."}};});

  app.get('/v1/platform/config/export',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;const [platform,membership,recruitment,pb,music]=await Promise.all([ensureSettings(guildId),oneOrNone<any>(`SELECT * FROM membership_settings WHERE guild_id=$1`,[guildId]).catch(()=>null),oneOrNone<any>(`SELECT * FROM recruitment_settings WHERE guild_id=$1`,[guildId]).catch(()=>null),oneOrNone<any>(`SELECT * FROM pb_discord_settings WHERE guild_id=$1`,[guildId]).catch(()=>null),oneOrNone<any>(`SELECT * FROM guild_settings WHERE guild_id=$1`,[guildId]).catch(()=>null)]);const bundle={schemaVersion:PLATFORM_CONFIG_VERSION,exportedAt:new Date().toISOString(),mode:'single-guild',platform:{featureFlags:platform.feature_flags,navigation:platform.navigation,defaults:platform.defaults},membership:safeConfigRow('membership_settings',membership),recruitment:safeConfigRow('recruitment_settings',recruitment),portBattles:safeConfigRow('pb_discord_settings',pb),music:safeConfigRow('guild_settings',music)};reply.header('content-type','application/json; charset=utf-8');reply.header('content-disposition',`attachment; filename="bom-config-${new Date().toISOString().slice(0,10)}.json"`);return JSON.stringify(bundle,null,2);});
  app.post('/v1/platform/config/export',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;const id=await enqueuePlatformJob(guildId,"CONFIG_EXPORT",{},userId(req),20);return reply.code(202).send({ok:true,id});});
  app.post('/v1/platform/config/import',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;const bundle=req.body?.bundle??req.body;if(!bundle||Number(bundle.schemaVersion??0)<1)return reply.code(400).send({error:"invalid_config_bundle",message:"This is not a supported BOM configuration export."});await ensureSettings(guildId);const platform=bundle.platform??{};const featureFlags={...DEFAULT_PLATFORM_FEATURES,...(platform.feature_flags??platform.featureFlags??{})};await db.query(`UPDATE platform_settings SET config_version=$2,feature_flags=$3::jsonb,navigation=$4::jsonb,defaults=$5::jsonb,updated_by=$6,updated_at=CURRENT_TIMESTAMP WHERE guild_id=$1`,[guildId,PLATFORM_CONFIG_VERSION,JSON.stringify(featureFlags),JSON.stringify(platform.navigation??{}),JSON.stringify(platform.defaults??{}),userId(req)]);const restored={platform:1,membership:await restoreConfigRow("membership_settings",guildId,bundle.membership),recruitment:await restoreConfigRow("recruitment_settings",guildId,bundle.recruitment),portBattles:await restoreConfigRow("pb_discord_settings",guildId,bundle.portBattles??bundle.pb),music:await restoreConfigRow("guild_settings",guildId,bundle.music)};await emitPlatformEvent(guildId,{eventType:"config.imported",category:"admin",actorId:userId(req),title:"Configuration bundle imported",summary:`Restored ${Object.values(restored).reduce((a:any,b:any)=>Number(a)+Number(b),0)} configuration fields.`,severity:"success",metadata:{restored}});return {ok:true,restored,message:"Configuration imported. Runtime secrets, tokens, generated message IDs and environment variables were intentionally excluded."};});

  app.get('/v1/platform/support-bundle',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;const [settings,checklist,jobs,events]=await Promise.all([ensureSettings(guildId),setupChecklist(guildId),many<any>(`SELECT id,job_type,status,progress,progress_message,attempts,created_at,finished_at FROM platform_jobs WHERE guild_id=$1 ORDER BY created_at DESC LIMIT 50`,[guildId]),many<any>(`SELECT event_type,category,title,summary,severity,created_at FROM platform_events WHERE guild_id=$1 ORDER BY created_at DESC LIMIT 100`,[guildId])]);const support={generatedAt:new Date().toISOString(),mode:"single-guild",guildIdHash:createHash("sha256").update(guildId).digest("hex").slice(0,12),node:process.version,configVersion:PLATFORM_CONFIG_VERSION,settings:{featureFlags:settings.feature_flags,navigation:settings.navigation},checklist,jobs,events,environmentConfigured:safeEnvPresence()};reply.header('content-type','application/json; charset=utf-8');reply.header('content-disposition',`attachment; filename="bom-support-${new Date().toISOString().slice(0,10)}.json"`);return JSON.stringify(support,null,2);});
}
