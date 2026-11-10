import {randomUUID} from 'node:crypto';
import {pool,many,oneOrNone,db} from '@bom/db';
export function registerBattleCoordination(app:any,{guildId,requireMember,userId,pbManager}:any){
 const uuid=(v:any)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v));
 app.get('/v1/wosb/coordination',async(req:any,reply:any)=>{
  if(!await pbManager(req,reply))return;if(req._pbMemberAccess?.pbOnly||req._pbMemberAccess?.allianceOnly)return reply.code(403).send({error:'bom_coordination_only'});
  const battles=await many<any>(`SELECT id,port_name,starts_at,team_size,status FROM pb_battles WHERE guild_id=$1 AND status IN ('OPEN','CLOSED') ORDER BY starts_at NULLS LAST LIMIT 50`,[guildId]);
  const [signups,phases]=await Promise.all([
   many<any>(`SELECT s.id,s.battle_id,s.user_id,s.display_name,s.confirmed_ship,s.signup_status,s.formation,s.commander_duty,EXISTS(SELECT 1 FROM pb_withdrawal_requests w WHERE w.battle_id=s.battle_id AND w.user_id=s.user_id AND w.resolved_at IS NULL) withdrawing FROM pb_signups s JOIN pb_battles b ON b.id=s.battle_id WHERE s.guild_id=$1 AND b.status IN ('OPEN','CLOSED') AND s.user_id IS NOT NULL ORDER BY s.display_name LIMIT 5000`,[guildId]),
   many<any>(`SELECT p.* FROM pb_player_phases p JOIN pb_battles b ON b.id=p.battle_id WHERE p.guild_id=$1 AND b.status IN ('OPEN','CLOSED')`,[guildId])
  ]);return {battles,signups,phases};
 });
 app.post('/v1/wosb/port-battles/:id/withdrawal',async(req:any,reply:any)=>{
  if(!(await requireMember(req,reply))?.member)return;
  if(!uuid(req.params.id))return reply.code(400).send({error:'invalid_battle'});
  const b=await oneOrNone<any>(`SELECT b.id FROM pb_battles b JOIN pb_signups s ON s.battle_id=b.id WHERE b.guild_id=$1 AND b.id=$2 AND s.user_id=$3 AND b.status IN ('OPEN','CLOSED')`,[guildId,req.params.id,userId(req)]);
  if(!b)return reply.code(409).send({error:'no_active_signup'});
  await db.query(`INSERT INTO pb_withdrawal_requests(id,guild_id,battle_id,user_id,reason) VALUES($1,$2,$3,$4,$5) ON CONFLICT(battle_id,user_id) DO UPDATE SET reason=EXCLUDED.reason,created_at=now(),resolved_at=NULL,resolved_by=NULL`,[randomUUID(),guildId,b.id,userId(req),String(req.body?.reason??'').trim().slice(0,500)]);
  return {ok:true,message:'Coordinator notified. Your roster slot remains visible until they handle the withdrawal.'};
 });
 app.get('/v1/wosb/port-battles/:id/coordination',async(req:any,reply:any)=>{
  if(!await pbManager(req,reply))return;if(req._pbMemberAccess?.pbOnly||req._pbMemberAccess?.allianceOnly)return reply.code(403).send({error:'bom_coordination_only'});
  if(!uuid(req.params.id))return reply.code(400).send({error:'invalid_battle'});
  const b=await oneOrNone<any>('SELECT * FROM pb_battles WHERE guild_id=$1 AND id=$2',[guildId,req.params.id]);if(!b)return reply.code(404).send({error:'battle_not_found'});
  const [withdrawals,candidates,phases,attendance,audit]=await Promise.all([
   many<any>(`SELECT w.*,s.display_name,s.confirmed_ship FROM pb_withdrawal_requests w LEFT JOIN pb_signups s ON s.battle_id=w.battle_id AND s.user_id=w.user_id WHERE w.guild_id=$1 AND w.battle_id=$2 AND w.resolved_at IS NULL ORDER BY w.created_at`,[guildId,b.id]),
   many<any>(`SELECT s.*, (SELECT COUNT(*)::int FROM pb_attendance_outcomes o WHERE o.guild_id=$1 AND o.user_id=s.user_id AND o.outcome IN ('ATTENDED','LATE')) AS appearances,(SELECT COUNT(*)::int FROM pb_signups h JOIN pb_battles hb ON hb.id=h.battle_id WHERE h.guild_id=$1 AND h.user_id=s.user_id AND hb.status='FINISHED') AS previous_signups,NULL AS suggested_role FROM pb_signups s WHERE s.guild_id=$1 AND s.battle_id=$2 AND NOT EXISTS(SELECT 1 FROM pb_withdrawal_requests w WHERE w.battle_id=s.battle_id AND w.user_id=s.user_id AND w.resolved_at IS NULL) ORDER BY appearances DESC,previous_signups DESC,s.created_at`,[guildId,b.id]),
   many<any>(`SELECT p.*,b.port_name,b.starts_at AS battle_start FROM pb_player_phases p JOIN pb_battles b ON b.id=p.battle_id WHERE p.guild_id=$1 AND b.status IN ('OPEN','CLOSED') AND b.starts_at BETWEEN $2::timestamptz-INTERVAL '1 day' AND $2::timestamptz+INTERVAL '1 day' ORDER BY p.user_id,p.starts_at`,[guildId,b.starts_at]),
   many<any>(`SELECT o.*,p.display_name,(s.id IS NOT NULL) AS signed_up FROM pb_attendance_outcomes o LEFT JOIN member_profiles p ON p.guild_id=o.guild_id AND p.user_id=o.user_id LEFT JOIN pb_signups s ON s.battle_id=o.battle_id AND s.user_id=o.user_id WHERE o.guild_id=$1 AND o.battle_id=$2`,[guildId,b.id]),
   many<any>('SELECT * FROM pb_attendance_audit WHERE guild_id=$1 AND battle_id=$2 ORDER BY id DESC LIMIT 100',[guildId,b.id])
  ]);return {withdrawals,candidates,phases,attendance,audit};
 });
 app.put('/v1/wosb/port-battles/:id/phases/:userId',async(req:any,reply:any)=>{
  if(!await pbManager(req,reply))return;if(req._pbMemberAccess?.pbOnly||req._pbMemberAccess?.allianceOnly)return reply.code(403).send({error:'bom_coordination_only'});
  const actor=userId(req),uid=String(req.params.userId),id=req.params.id,b=req.body??{},start=new Date(b.startsAt),end=new Date(b.endsAt),transfer=Number(b.transferMinutes??0);
  if(!uuid(id)||!/^\d{15,22}$/.test(uid)||!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start||!Number.isInteger(transfer)||transfer<0||transfer>120)return reply.code(400).send({error:'invalid_phase'});
  const tx=await pool.connect();try{await tx.query('BEGIN');await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[guildId+':'+uid]);
   const battle=(await tx.query(`SELECT b.* FROM pb_battles b JOIN pb_signups s ON s.battle_id=b.id AND s.user_id=$3 WHERE b.guild_id=$1 AND b.id=$2 AND b.status IN ('OPEN','CLOSED') FOR UPDATE OF b`,[guildId,id,uid])).rows[0];
   if(!battle||!battle.starts_at||start<new Date(battle.starts_at)||+end>+new Date(battle.starts_at)+3600000){await tx.query('ROLLBACK');return reply.code(409).send({error:'outside_battle_window',message:'Choose a signed-up player and a phase within the one-hour battle window.'});}
   const conflicts=(await tx.query(`SELECT p.*,b.port_name FROM pb_player_phases p JOIN pb_battles b ON b.id=p.battle_id WHERE p.guild_id=$1 AND p.user_id=$2 AND p.battle_id<>$3 AND b.status IN ('OPEN','CLOSED') AND p.starts_at<$5::timestamptz+($6::int*INTERVAL '1 minute') AND p.ends_at+(p.transfer_minutes*INTERVAL '1 minute')>$4::timestamptz`,[guildId,uid,id,start,end,transfer])).rows;
   if(conflicts.length){await tx.query('ROLLBACK');return reply.code(409).send({error:'player_transfer_conflict',conflicts});}
   await tx.query(`INSERT INTO pb_player_phases(guild_id,battle_id,user_id,starts_at,ends_at,transfer_minutes,note,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(battle_id,user_id) DO UPDATE SET starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,transfer_minutes=EXCLUDED.transfer_minutes,note=EXCLUDED.note,updated_by=EXCLUDED.updated_by,updated_at=now()`,[guildId,id,uid,start,end,transfer,String(b.note??'').slice(0,500),actor]);await tx.query('COMMIT');return {ok:true};
  }catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
 });
 app.post('/v1/wosb/port-battles/:id/withdrawals/:withdrawalId/replace',async(req:any,reply:any)=>{
  if(!await pbManager(req,reply))return;if(req._pbMemberAccess?.pbOnly||req._pbMemberAccess?.allianceOnly)return reply.code(403).send({error:'bom_coordination_only'});
  const id=req.params.id,wid=req.params.withdrawalId,b=req.body??{};
  if(!uuid(id)||!uuid(wid)||!uuid(b.signupId))return reply.code(400).send({error:'invalid_id'});
  const tx=await pool.connect();try{await tx.query('BEGIN');
   const battle=(await tx.query(`SELECT * FROM pb_battles WHERE guild_id=$1 AND id=$2 FOR UPDATE`,[guildId,id])).rows[0];
   if(!battle||!['OPEN','CLOSED'].includes(battle.status)){await tx.query('ROLLBACK');return reply.code(409).send({error:'battle_read_only'});}
   const w=(await tx.query(`SELECT * FROM pb_withdrawal_requests WHERE guild_id=$1 AND battle_id=$2 AND id=$3 AND resolved_at IS NULL FOR UPDATE`,[guildId,id,wid])).rows[0];
   const rows=(await tx.query('SELECT * FROM pb_signups WHERE guild_id=$1 AND battle_id=$2 FOR UPDATE',[guildId,id])).rows;
   const old=rows.find((s:any)=>s.user_id===w?.user_id),next=rows.find((s:any)=>s.id===b.signupId);
   const ships=typeof next?.ships==='string'?JSON.parse(next.ships):next?.ships;
   const blocked=next?.user_id&&(await tx.query('SELECT 1 FROM pb_withdrawal_requests WHERE battle_id=$1 AND user_id=$2 AND resolved_at IS NULL',[id,next.user_id])).rowCount;
   if(!w||!old||!next||next.id===old.id||next.confirmed_ship||blocked||!Array.isArray(ships)||!ships.includes(b.confirmedShip)||Number(next.assignment_version)!==Number(b.assignmentVersion)){
    await tx.query('ROLLBACK');return reply.code(409).send({error:'replacement_changed',message:'Refresh: the withdrawal, candidate, or playable ships changed.'});
   }
   if(!old.confirmed_ship&&rows.filter((s:any)=>s.confirmed_ship).length>=battle.team_size){await tx.query('ROLLBACK');return reply.code(409).send({error:'roster_full'});}
   for(const [signup,ship,status] of [[old,null,'WAITLIST'],[next,b.confirmedShip,'ATTENDING']] as any[]){
    const after={confirmed_ship:ship,signup_status:status,horn_duty:null,flare_duty:null,formation:null,commander_duty:null,build_id:null};
    await tx.query(`UPDATE pb_signups SET confirmed_ship=$2,signup_status=$3,horn_duty=NULL,flare_duty=NULL,formation=NULL,commander_duty=NULL,build_id=NULL,assignment_version=assignment_version+1,updated_at=now() WHERE id=$1`,[signup.id,ship,status]);
    await tx.query(`INSERT INTO pb_assignment_events(id,guild_id,battle_id,signup_id,actor_id,action,before_state,after_state) VALUES($1,$2,$3,$4,$5,'REPLACEMENT',$6::jsonb,$7::jsonb)`,[randomUUID(),guildId,id,signup.id,userId(req),JSON.stringify(signup),JSON.stringify(after)]);
   }
   await tx.query('DELETE FROM pb_player_phases WHERE guild_id=$1 AND battle_id=$2 AND user_id=$3',[guildId,id,old.user_id]);
   await tx.query('UPDATE pb_withdrawal_requests SET resolved_at=now(),resolved_by=$2 WHERE id=$1',[wid,userId(req)]);await tx.query('COMMIT');return {ok:true};
  }catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
 });
 app.post('/v1/wosb/port-battles/:id/withdrawals/:withdrawalId/resolve',async(req:any,reply:any)=>{
  if(!await pbManager(req,reply))return;if(req._pbMemberAccess?.pbOnly||req._pbMemberAccess?.allianceOnly)return reply.code(403).send({error:'bom_coordination_only'});
  if(!uuid(req.params.id)||!uuid(req.params.withdrawalId))return reply.code(400).send({error:'invalid_id'});
  // Assignment stays on the existing version-checked assignment endpoint; resolution does not silently change a fleet.
  const result=await db.query(`UPDATE pb_withdrawal_requests SET resolved_at=now(),resolved_by=$4 WHERE guild_id=$1 AND battle_id=$2 AND id=$3 AND resolved_at IS NULL`,[guildId,req.params.id,req.params.withdrawalId,userId(req)]);return {ok:true,changed:result.rowCount};
 });
}
