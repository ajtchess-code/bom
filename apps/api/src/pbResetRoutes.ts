/** Admiral-only fleet reset: DB transition first, controller cleans Discord in a queued job. */
import {randomUUID} from 'node:crypto';
import {many,oneOrNone,pool} from '@bom/db';
import {redis} from '@bom/redis';

const confirmText='RESET ACTIVE BATTLES';
type Opts={guildId:string;requireAdmin:(req:any,reply:any)=>Promise<any>;userId:(req:any)=>string};
const sortedIds=(battles:any[])=>battles.map(b=>String(b.id)).sort();
const sameActiveSet=(left:string[],right:string[])=>left.length===right.length&&left.every((x,i)=>x===right[i]);

export function registerPbResetRoutes(app:any,{guildId,requireAdmin,userId}:Opts){
 // Reconciliation is non-destructive to battle records; only Discord panels for
 // retired battles are eligible for removal by the controller's validated sweep.
 app.get('/v1/wosb/pb-reconcile/preview',async(req:any,reply:any)=>{
  if(!await requireAdmin(req,reply))return;
  const [live,retired,last]=await Promise.all([
   oneOrNone<any>(`SELECT COUNT(*)::int count FROM pb_battles WHERE guild_id=$1 AND status IN ('OPEN','CLOSED')`,[guildId]),
   oneOrNone<any>(`SELECT COUNT(*)::int count FROM pb_battles WHERE guild_id=$1 AND status NOT IN ('OPEN','CLOSED') AND (discord_signup_message_id IS NOT NULL OR discord_roster_message_id IS NOT NULL)`,[guildId]),
   redis.get(`pb:reconcile:last:${guildId}`).catch(()=>null)
  ]);
  return {active:Number(live?.count??0),retiredWithCards:Number(retired?.count??0),last:last?JSON.parse(last):null};
 });
 app.post('/v1/wosb/pb-reconcile',async(req:any,reply:any)=>{
  if(!await requireAdmin(req,reply))return;
  await redis.set(`pb:reconcile:requested:${guildId}`,JSON.stringify({actor:userId(req),at:new Date().toISOString()}),'EX',300);
  return {ok:true,queued:true,message:'A Discord reconciliation sweep will run shortly. Live battles will not be cancelled.'};
 });
 const preview=async()=>{
  const [rows,settings,lastJob]=await Promise.all([
   many<any>(`SELECT id,port_name,status,starts_at,discord_signup_message_id,discord_roster_message_id FROM pb_battles WHERE guild_id=$1 AND status IN ('OPEN','CLOSED') ORDER BY created_at,id`,[guildId]),
   oneOrNone<any>(`SELECT signup_channel_id,roster_channel_id,schedule_channel_id FROM pb_discord_settings WHERE guild_id=$1`,[guildId]).catch(()=>null),
   oneOrNone<any>(`SELECT id,status,affected_battles,removed_discord_messages,cleanup_errors,created_at,completed_at FROM pb_reset_jobs WHERE guild_id=$1 ORDER BY created_at DESC LIMIT 1`,[guildId]).catch(()=>null)
  ]);
  return {active:rows,ids:sortedIds(rows),count:rows.length,channels:{signup:settings?.signup_channel_id??null,roster:settings?.roster_channel_id??null,schedule:settings?.schedule_channel_id??null},lastJob,confirmation:confirmText};
 };
 app.get('/v1/wosb/pb-reset/preview',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;return preview();});
 app.get('/v1/wosb/pb-reset/status/:id',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;const row=await oneOrNone<any>(`SELECT id,status,affected_battles,removed_discord_messages,cleanup_errors,created_at,completed_at FROM pb_reset_jobs WHERE guild_id=$1 AND id=$2`,[guildId,String(req.params.id)]);return row??reply.code(404).send({error:'reset_job_not_found'});});
 app.post('/v1/wosb/pb-reset',async(req:any,reply:any)=>{
  if(!await requireAdmin(req,reply))return;
  const body=req.body??{};
  if(body.confirmation!==confirmText||!Array.isArray(body.expectedIds)||body.expectedIds.some((x:any)=>typeof x!=='string'))return reply.code(400).send({error:'confirmation_required',message:'Preview the current battles and enter RESET ACTIVE BATTLES to confirm.'});
  const expected=[...new Set<string>(body.expectedIds)].sort();
  if(expected.length!==body.expectedIds.length)return reply.code(400).send({error:'duplicate_ids'});
  const connection=await pool.connect();
  try{
   await connection.query('BEGIN');
   await connection.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`pb-reset:${guildId}`]);
   const pending=(await connection.query(`SELECT id FROM pb_reset_jobs WHERE guild_id=$1 AND status IN ('QUEUED','RUNNING') ORDER BY created_at DESC LIMIT 1`,[guildId])).rows[0];
   if(pending){await connection.query('ROLLBACK');return reply.code(409).send({error:'reset_already_running',jobId:pending.id});}
   const active=(await connection.query(`SELECT id,port_name,status,starts_at,discord_signup_message_id,discord_roster_message_id FROM pb_battles WHERE guild_id=$1 AND status IN ('OPEN','CLOSED') ORDER BY created_at,id FOR UPDATE`,[guildId])).rows;
   if(!sameActiveSet(sortedIds(active),expected)){await connection.query('ROLLBACK');return reply.code(409).send({error:'battles_changed',message:'The active fleet changed since preview. Reload and confirm again.'});}
   const id=randomUUID();
   // Cancel, do not DELETE; retains PB attendance, reviews and audit history.
   await connection.query(`UPDATE pb_battles SET status='CANCELLED',revision=revision+1,updated_at=NOW() WHERE guild_id=$1 AND status IN ('OPEN','CLOSED') AND id=ANY($2::uuid[])`,[guildId,expected]);
   await connection.query(`INSERT INTO pb_reset_jobs(id,guild_id,actor_id,status,affected_battles) VALUES($1,$2,$3,'QUEUED',$4::jsonb)`,[id,guildId,userId(req),JSON.stringify(active)]);
   await connection.query('COMMIT');
   app.log.warn({jobId:id,actorId:userId(req),count:active.length},'[port-battle] emergency reset queued');
   return {ok:true,jobId:id,cleared:active.length,cleanup:'QUEUED',message:'Active fleet reset to zero. Discord cleanup is queued for the controller; watch the cleanup report.'};
  }catch(err){await connection.query('ROLLBACK').catch(()=>{});throw err;}finally{connection.release();}
 });
}
