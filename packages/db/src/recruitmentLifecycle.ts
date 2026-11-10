
import {db,pool} from './index.js';
export const finalApplicationStates=['ACCEPTED','DECLINED','WITHDRAWN','CLOSED'];
export async function finishApplication(input:{guildId:string;id:string;actorId:string|null;status:string;reason:string;targetGuild?:string;bypass?:boolean;expectedStatus?:string}){
 if(!finalApplicationStates.includes(input.status))throw new Error('Invalid final application state');
 const tx=await pool.connect();
 try{
  await tx.query('BEGIN');
  const r=await tx.query('SELECT * FROM recruitment_applications WHERE guild_id=$1 AND id=$2 FOR UPDATE',[input.guildId,input.id]);const a=r.rows[0];
  if(!a)throw Object.assign(new Error('Application not found'),{statusCode:404});
  if(finalApplicationStates.includes(a.status)||input.expectedStatus&&a.status!==input.expectedStatus)throw Object.assign(new Error('Application changed. Refresh before deciding.'),{statusCode:409});
  const s=(await tx.query('SELECT * FROM recruitment_settings WHERE guild_id=$1',[input.guildId])).rows[0]??{};
  const target=input.targetGuild??a.target_guild_tag??'BOM';
  if(input.status==='ACCEPTED'){
   const membership=(await tx.query('SELECT member_role_id FROM membership_settings WHERE guild_id=$1',[input.guildId])).rows[0];
   if(!(target==='BoM'?s.accepted_second_guild_role_id:s.accepted_role_id??membership?.member_role_id))throw Object.assign(new Error('Configure the accepted membership role for this guild first.'),{statusCode:409});
  }
  const trial=(await tx.query("SELECT * FROM recruitment_trials WHERE application_id=$1 AND status IN('ACTIVE','FINAL_REVIEW') FOR UPDATE",[a.id])).rows[0];
  const days=input.status==='DECLINED'?Number(trial?s.trial_reapply_days??30:s.application_reapply_days??7):0;
  const updated=await tx.query("UPDATE recruitment_applications SET status=$3,waiting_on='NONE',current_request=NULL,decision_by=$4,decision_reason=$5,target_guild_tag=$6,cooldown_until=$7,closed_at=now(),updated_at=now() WHERE guild_id=$1 AND id=$2 RETURNING *",[input.guildId,a.id,input.status,input.actorId,input.reason,target,days?new Date(Date.now()+days*86400000):null]);
  if(trial)await tx.query("UPDATE recruitment_trials SET status=$2,final_decision=$3,final_decision_by=$4,final_decision_reason=$5,final_decision_at=now(),updated_at=now() WHERE id=$1",[trial.id,input.status==='ACCEPTED'?'ACCEPTED':input.status==='DECLINED'?'DECLINED':'WITHDRAWN',input.status==='ACCEPTED'?'ACCEPT':input.status==='DECLINED'?'DECLINE':null,input.actorId,input.reason]);
  await tx.query("UPDATE recruitment_interviews SET status='CANCELLED',updated_at=now() WHERE application_id=$1 AND status IN('SCHEDULED','ACTIVE')",[a.id]);
  await tx.query("INSERT INTO recruitment_completion_jobs(application_id,guild_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[a.id,input.guildId]);
  await tx.query("INSERT INTO recruitment_application_events(application_id,event_type,actor_id,visibility,message,metadata) VALUES($1,$2,$3,'APPLICANT',$4,$5::jsonb)",[a.id,'application.'+input.status.toLowerCase(),input.actorId,input.reason,JSON.stringify({bypassTrial:!!input.bypass,targetGuild:target})]);
  await tx.query('COMMIT');return updated.rows[0];
 }catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
}
export async function cancelPortBattle(guildId:string,id:string,actorId:string,reason:string,silent=false){
 const tx=await pool.connect();try{
  await tx.query('BEGIN');const r=await tx.query('SELECT * FROM pb_battles WHERE guild_id=$1 AND id=$2 FOR UPDATE',[guildId,id]);const b=r.rows[0];
  if(!b)throw Object.assign(new Error('Battle not found'),{statusCode:404});
  if(!['OPEN','CLOSED'].includes(b.status))throw Object.assign(new Error('Only a scheduled battle can be cancelled.'),{statusCode:409});
  await tx.query("UPDATE pb_battles SET status='CANCELLED',cancelled_at=now(),cancelled_by=$3,cancellation_reason=$4,cancellation_silent=$5,revision=revision+1,updated_at=now() WHERE guild_id=$1 AND id=$2",[guildId,id,actorId,reason,silent]);
  if(!silent)await tx.query("INSERT INTO pb_cancellation_deliveries(battle_id,user_id) SELECT DISTINCT battle_id,user_id FROM pb_signups WHERE battle_id=$1 AND user_id IS NOT NULL ON CONFLICT DO NOTHING",[id]);
  await tx.query("UPDATE pb_assignment_events SET notified_at=now(),notification_error='battle_cancelled' WHERE battle_id=$1 AND notified_at IS NULL",[id]);
  await tx.query("UPDATE pb_tactical_dispatches SET status='FAILED',result='{"+'"error":"battle_cancelled"'+"}'::jsonb,finished_at=now() WHERE battle_id=$1 AND status IN('QUEUED','RUNNING')",[id]);
  await tx.query("UPDATE pb_invitations SET status='SKIPPED',error='battle_cancelled',updated_at=now() WHERE battle_id=$1 AND status IN('QUEUED','FAILED')",[id]);
  await tx.query('COMMIT');return {...b,status:'CANCELLED',cancellation_reason:reason};
 }catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
}
