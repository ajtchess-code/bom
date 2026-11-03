import {db,many} from '@bom/db';
import {hasDashboardAdminAccess,discordAccess} from './authz.js';
export function registerCommandHome(app:any,{guildId,requireMember,userId}:any){
 app.get('/v1/notification-delivery',async(req:any,reply:any)=>{
  if(!(await requireMember(req,reply))?.member)return;const admin=await hasDashboardAdminAccess(userId(req)),all=admin&&req.query?.scope==='all';
  const [history,pending]=await Promise.all([
   many<any>(`SELECT * FROM dm_delivery_history WHERE guild_id=$1 AND ($3::boolean OR user_id=$2) ORDER BY created_at DESC LIMIT 200`,[guildId,userId(req),all]),
   many<any>(`SELECT id,user_id,status,error,updated_at FROM pb_invitations WHERE guild_id=$1 AND ($3::boolean OR user_id=$2) AND status IN ('QUEUED','SENDING','FAILED') ORDER BY updated_at DESC LIMIT 100`,[guildId,userId(req),all])
  ]);return {admin,history,pending};
 });
 app.get('/v1/saved-views/:section' ,async(req:any,reply:any)=>{
  if(!(await requireMember(req,reply))?.member)return;
  return {views:await many<any>('SELECT name,state FROM dashboard_saved_views WHERE guild_id=$1 AND user_id=$2 AND section=$3 ORDER BY name',[guildId,userId(req),String(req.params.section).slice(0,60)])};
 });
 app.put('/v1/saved-views/:section',async(req:any,reply:any)=>{
  if(!(await requireMember(req,reply))?.member)return;
  const b=req.body??{},name=String(b.name??'').trim().slice(0,40),section=String(req.params.section).slice(0,60);
  if(!name||!b.state||Array.isArray(b.state)||typeof b.state!=='object'||JSON.stringify(b.state).length>4000)return reply.code(400).send({error:'invalid_view'});
  await db.query(`INSERT INTO dashboard_saved_views(guild_id,user_id,section,name,state) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(guild_id,user_id,section,name) DO UPDATE SET state=EXCLUDED.state,updated_at=now()`,[guildId,userId(req),section,name,JSON.stringify(b.state)]);return {ok:true};
 });
 app.delete('/v1/saved-views/:section',async(req:any,reply:any)=>{
  if(!(await requireMember(req,reply))?.member)return;
  await db.query('DELETE FROM dashboard_saved_views WHERE guild_id=$1 AND user_id=$2 AND section=$3 AND name=$4',[guildId,userId(req),String(req.params.section).slice(0,60),String(req.body?.name??'').slice(0,40)]);return {ok:true};
 });
 app.get('/v1/command-home' ,async(req:any,reply:any)=>{
  if(!(await requireMember(req,reply))?.member)return;
  const uid=userId(req),admin=await hasDashboardAdminAccess(uid),access=await discordAccess(uid);
  const cfg=(await many<any>('SELECT manager_role_id FROM pb_discord_settings WHERE guild_id=$1',[guildId]))[0];
  const manager=admin||Boolean(cfg?.manager_role_id&&access.roles.includes(cfg.manager_role_id));
  const sources=[
   {key:'battles',run:()=>many<any>(`SELECT b.id,b.port_name,b.starts_at,s.confirmed_ship,s.commander_duty,s.horn_duty,s.flare_duty,s.signup_status FROM pb_signups s JOIN pb_battles b ON b.id=s.battle_id WHERE b.guild_id=$1 AND s.user_id=$2 AND b.status IN ('OPEN','CLOSED') ORDER BY b.starts_at NULLS LAST LIMIT 8`,[guildId,uid])},
   {key:'contributions',run:()=>many<any>(`SELECT COUNT(*) FILTER(WHERE outcome IN ('ATTENDED','LATE'))::int attended,COUNT(*) FILTER(WHERE outcome='NO_SHOW')::int no_show FROM pb_attendance_outcomes WHERE guild_id=$1 AND user_id=$2`,[guildId,uid])},
   {key:'applications',run:()=>many<any>(`SELECT id,captain_name,status,waiting_on,updated_at FROM recruitment_applications WHERE guild_id=$1 AND ${admin?"waiting_on IN ('RECRUITER','LEADERSHIP')":"user_id=$2"} AND status NOT IN ('DRAFT','ACCEPTED','DECLINED','CLOSED','WITHDRAWN') ORDER BY updated_at LIMIT 12`,admin?[guildId]:[guildId,uid])},
   ...(admin?[{key:'attention',run:()=>many<any>(`SELECT 'Role requests' AS label,COUNT(*)::int count,'/dashboard/admin/membership' AS href FROM custom_role_requests WHERE guild_id=$1 AND status='PENDING' UNION ALL SELECT 'Wiki corrections',COUNT(*)::int,'/dashboard/admin/wiki' FROM wiki_feedback_queue WHERE guild_id=$1 AND status='PENDING' UNION ALL SELECT 'Unanswered Wiki questions',COUNT(*)::int,'/dashboard/admin/wiki' FROM wiki_question_log WHERE guild_id=$1 AND answered=FALSE UNION ALL SELECT 'Failed background jobs',COUNT(*)::int,'/dashboard/admin/diagnostics' FROM platform_jobs WHERE guild_id=$1 AND status='FAILED'`,[guildId])}]:[]),
   ...(manager?[{key:'withdrawals',run:()=>many<any>(`SELECT w.id,w.battle_id,w.user_id,w.reason,w.created_at,b.port_name,s.display_name FROM pb_withdrawal_requests w JOIN pb_battles b ON b.id=w.battle_id LEFT JOIN pb_signups s ON s.battle_id=w.battle_id AND s.user_id=w.user_id WHERE w.guild_id=$1 AND w.resolved_at IS NULL AND b.status IN ('OPEN','CLOSED') ORDER BY w.created_at LIMIT 12`,[guildId])}]:[])
  ];
  const settled=await Promise.allSettled(sources.map(s=>s.run())),out:any={admin,manager,unavailable:[]};
  settled.forEach((x,i)=>{if(x.status==='fulfilled')out[sources[i].key]=x.value;else{out.unavailable.push(sources[i].key);req.log.warn({err:x.reason,section:sources[i].key},'Homepage section unavailable');}});
  return out;
 });
}
