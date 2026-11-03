import {randomUUID,createHash} from 'node:crypto';
import {many,oneOrNone,db,pool} from '@bom/db';
const fields=['confirmed_ship','signup_status','horn_duty','flare_duty','formation','commander_duty','build_id'];
const digest=(rows:any[])=>createHash('sha256').update(JSON.stringify(rows.map(s=>[s.id,s.assignment_version]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))).digest('hex');
export function registerRosterHistory(app:any,{guildId,pbManager,userId}:any){
 const manager=async(req:any,reply:any)=>{if(!await pbManager(req,reply))return false;if(req._pbMemberAccess?.pbOnly||req._pbMemberAccess?.allianceOnly){reply.code(403).send({error:'bom_coordination_only'});return false;}return true};
 app.get('/v1/wosb/port-battles/:id/roster-history',async(req:any,reply:any)=>{
  if(!await manager(req,reply))return;const id=req.params.id;
  const [rows,checkpoints,events]=await Promise.all([many<any>('SELECT * FROM pb_signups WHERE guild_id=$1 AND battle_id=$2 ORDER BY id',[guildId,id]),many<any>('SELECT * FROM pb_roster_checkpoints WHERE guild_id=$1 AND battle_id=$2 ORDER BY created_at DESC LIMIT 50',[guildId,id]),many<any>('SELECT * FROM pb_assignment_events WHERE guild_id=$1 AND battle_id=$2 ORDER BY created_at DESC LIMIT 200',[guildId,id])]);return {digest:digest(rows),checkpoints,events};
 });
 app.post('/v1/wosb/port-battles/:id/roster-history/checkpoints',async(req:any,reply:any)=>{
  if(!await manager(req,reply))return;const name=String(req.body?.name??'').trim().slice(0,80);if(!name)return reply.code(400).send({error:'checkpoint_name_required'});
  const rows=await many<any>('SELECT * FROM pb_signups WHERE guild_id=$1 AND battle_id=$2 ORDER BY id',[guildId,req.params.id]);
  if(!await oneOrNone('SELECT id FROM pb_battles WHERE guild_id=$1 AND id=$2',[guildId,req.params.id]))return reply.code(404).send({error:'battle_not_found'});
  const roster=rows.map(s=>Object.fromEntries(['id','user_id','display_name',...fields].map(k=>[k,s[k]])));
  await db.query('INSERT INTO pb_roster_checkpoints(id,guild_id,battle_id,name,roster,created_by) VALUES($1,$2,$3,$4,$5::jsonb,$6)',[randomUUID(),guildId,req.params.id,name,JSON.stringify(roster),userId(req)]);return {ok:true};
 });
 app.post('/v1/wosb/port-battles/:id/roster-history/restore',async(req:any,reply:any)=>{
  if(!await manager(req,reply))return;const id=req.params.id;if(!/^[0-9a-f-]{36}$/i.test(String(req.body?.checkpointId))||!/^([0-9a-f]{64})$/.test(String(req.body?.digest)))return reply.code(400).send({error:'invalid_restore_request'});const tx=await pool.connect();try{await tx.query('BEGIN');
   const battle=(await tx.query('SELECT * FROM pb_battles WHERE guild_id=$1 AND id=$2 FOR UPDATE',[guildId,id])).rows[0];if(!battle||!['OPEN','CLOSED'].includes(battle.status)){await tx.query('ROLLBACK');return reply.code(409).send({error:'battle_read_only'});}
   const rows=(await tx.query('SELECT * FROM pb_signups WHERE guild_id=$1 AND battle_id=$2 ORDER BY id FOR UPDATE',[guildId,id])).rows;
   if(req.body?.digest!==digest(rows)){await tx.query('ROLLBACK');return reply.code(409).send({error:'roster_changed',message:'Another captain or officer changed this roster. Reload history before restoring.'});}
   const checkpoint=(await tx.query('SELECT * FROM pb_roster_checkpoints WHERE guild_id=$1 AND battle_id=$2 AND id=$3',[guildId,id,req.body?.checkpointId])).rows[0];if(!checkpoint){await tx.query('ROLLBACK');return reply.code(404).send({error:'checkpoint_not_found'});}
   const saved=typeof checkpoint.roster==='string'?JSON.parse(checkpoint.roster):checkpoint.roster;
   const withdrawals=(await tx.query('SELECT user_id FROM pb_withdrawal_requests WHERE battle_id=$1',[id])).rows;
   const fail=(message:string)=>Object.assign(new Error(message),{statusCode:409});
   if(!Array.isArray(saved)||saved.length!==rows.length||saved.some(s=>!rows.some(r=>r.id===s.id)))throw fail('Signup membership changed. Restore assignments manually so new or withdrawn signups are preserved.');
   if(saved.filter(s=>s.confirmed_ship).length>battle.team_size)throw fail('This checkpoint exceeds the current battle capacity.');
   const unique=new Set<string>();for(const s of saved){const current=rows.find(r=>r.id===s.id),ships=typeof current.ships==='string'?JSON.parse(current.ships):current.ships,flare=typeof current.flare_capabilities==='string'?JSON.parse(current.flare_capabilities):current.flare_capabilities;
    if(s.confirmed_ship&&(!ships?.includes(s.confirmed_ship)||withdrawals.some(w=>w.user_id===s.user_id)))throw fail('A checkpoint captain withdrew or changed playable ships. Review the lineup manually.');
    if(s.horn_duty&&!current.horn_capable||s.flare_duty&&!flare?.includes(s.flare_duty))throw fail('A checkpoint duty is no longer volunteered. Review duties manually.');
    for(const key of ['horn_duty','flare_duty','commander_duty'])if(s[key]){const value=key+':'+s[key];if(unique.has(value))throw fail('This checkpoint contains duplicate unique duties.');unique.add(value);}
   }
   await tx.query('UPDATE pb_signups SET horn_duty=NULL,flare_duty=NULL,commander_duty=NULL WHERE guild_id=$1 AND battle_id=$2',[guildId,id]);
   for(const s of saved){const before=rows.find(r=>r.id===s.id);await tx.query(`UPDATE pb_signups SET confirmed_ship=$2,signup_status=$3,horn_duty=$4,flare_duty=$5,formation=$6,commander_duty=$7,build_id=$8,assignment_version=assignment_version+1,updated_at=now() WHERE id=$1`,[s.id,...fields.map(k=>k==='signup_status'?(before.signup_status==='LATE'?'LATE':s[k]):s[k]??null)]);await tx.query(`INSERT INTO pb_assignment_events(id,guild_id,battle_id,signup_id,actor_id,action,before_state,after_state) VALUES($1,$2,$3,$4,$5,'RESTORE_CHECKPOINT',$6::jsonb,$7::jsonb)`,[randomUUID(),guildId,id,s.id,userId(req),JSON.stringify(Object.fromEntries(fields.map(k=>[k,before[k]]))),JSON.stringify(Object.fromEntries(fields.map(k=>[k,k==='signup_status'&&before.signup_status==='LATE'?'LATE':s[k]])))]);}
   await tx.query('COMMIT');return {ok:true};
  }catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
 });
}
