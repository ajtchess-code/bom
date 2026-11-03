import {randomUUID} from 'node:crypto';
import {pool} from '@bom/db';
import {discordAccess} from './authz.js';
import {checkedAssignment} from './pbAssignmentValidation.js';

/** Atomic adapter for conversational signup. Existing permission and assignment rules remain authoritative. */
export function registerMisfitBattleActions(app:any,opts:any){
 const {guildId,requireMember,userId,pbManager,ensure,catalogue}=opts;
 app.post('/v1/wosb/port-battles/:id/assistant-signup',async(req:any,reply:any)=>{
  const access=await requireMember(req,reply);if(!access?.member)return;
  await ensure();const actor=userId(req),b=req.body??{};
  const fail=(message:string,status=409)=>{throw Object.assign(new Error(message),{statusCode:status});};
  if(!/^\d{15,22}$/.test(String(b.playerId??''))||!/^\d{15,22}$/.test(String(b.sourceMessageId??''))||typeof b.ship!=='string'||b.ship.length>150)fail('A resolved member, ship and source message are required.',400);
  const manager=b.playerId!==actor||b.confirm===true||b.hornDuty!=null||b.commanderDuty!=null;
  if(manager&&!await pbManager(req,reply))return;
  if(!manager){const cfg=await opts.signupConfig();if(cfg?.signup_role_id&&!(access.roleIds??access.roles??[]).map(String).includes(String(cfg.signup_role_id)))fail('The signup role is required.',403);}
  const member=await discordAccess(b.playerId);if(!member.member)fail('That player is no longer a guild member.',404);
  const tx=await pool.connect();let committed=false;
  try{
   await tx.query('BEGIN');
   const requestKey=`pb:${b.sourceMessageId}`;
   await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${guildId}:${requestKey}`]);
   const receipt=(await tx.query('SELECT * FROM misfit_action_receipts WHERE guild_id=$1 AND request_key=$2',[guildId,requestKey])).rows[0];
   if(receipt){if(receipt.actor_id!==actor)fail('Receipt owner mismatch.',403);await tx.query('COMMIT');committed=true;return receipt.result;}
   const battle=(await tx.query('SELECT * FROM pb_battles WHERE guild_id=$1 AND id=$2 FOR UPDATE',[guildId,String(req.params.id)])).rows[0];
   if(!battle||battle.status!=='OPEN'||battle.starts_at&&new Date(battle.starts_at)<=new Date())fail('This battle is no longer open for signup.');
   const cat=await catalogue();const ship=(cat.ships??[]).find((s:any)=>s.name===b.ship&&Number(s.rate??s.level)===Number(battle.rate));
   if(!ship)fail('That ship is not eligible for this battle.',400);
   const config=await opts.signupConfig();let allowedShips=config?.preferred_ship_catalog??{};if(typeof allowedShips==='string')allowedShips=JSON.parse(allowedShips);const configured=allowedShips[String(battle.rate)];if(Array.isArray(configured)&&!configured.includes(b.ship))fail('That ship is not enabled in the officer catalogue for this battle rate.',400);
   const old=(await tx.query('SELECT * FROM pb_signups WHERE guild_id=$1 AND battle_id=$2 AND user_id=$3',[guildId,battle.id,b.playerId])).rows[0];
   const parse=(v:any)=>typeof v==='string'?JSON.parse(v):v;
   let ships=old?parse(old.ships)??[]:[];
   if(b.playerId!==actor){
    const pref=(await tx.query('SELECT * FROM pb_preferred_profiles WHERE guild_id=$1 AND user_id=$2',[guildId,b.playerId])).rows[0];
    const rates=parse(pref?.rates)??{};const available=[...ships,...(rates[String(battle.rate)]?.ships??[])];
    if(!available.includes(b.ship))fail('This captain has not selected that ship as playable. Ask them to save Preferred Ships first.');
   }
   ships=[...new Set([...ships,b.ship])];
   if((b.hornDuty||b.commanderDuty)&&!old?.confirmed_ship&&b.confirm!==true)return reply.code(409).send({error:'confirmation_required',message:'Horn and commander duties require a confirmed roster position. Reply “confirm” to confirm this captain and apply those duties. No changes were made.'});
   if(old?.confirmed_ship&&old.confirmed_ship!==b.ship&&b.confirm!==true)fail('This captain already has a different confirmed ship. Explicitly confirm the new ship to reassign them.');
   const confirmed=b.confirm===true?b.ship:old?.confirmed_ship??null;
   const proposed={...(old??{}),ships,signup_status:old?.signup_status??'ATTENDING'};
   const assigned=checkedAssignment(proposed,{confirmedShip:confirmed,status:'ATTENDING',hornDuty:b.hornDuty,commanderDuty:b.commanderDuty});
   if(assigned.horn&&old?.horn_capable!==true){const pref=(await tx.query('SELECT horn_capable,horn_requirements_ack FROM pb_preferred_profiles WHERE guild_id=$1 AND user_id=$2',[guildId,b.playerId])).rows[0];if(!pref?.horn_capable||!pref?.horn_requirements_ack)fail('This captain has not acknowledged the Horn requirements.');}
   const conflicts=(await tx.query('SELECT * FROM pb_signups WHERE battle_id=$1 AND user_id IS DISTINCT FROM $2 AND (($3::text IS NOT NULL AND horn_duty=$3) OR ($4::text IS NOT NULL AND commander_duty=$4))',[battle.id,b.playerId,assigned.horn,assigned.commander])).rows;
   if(conflicts.length)fail(`${conflicts.map((r:any)=>r.display_name).join(', ')} already holds a requested duty. Reassign it in Manage Port Battle; nobody was displaced.`);
   if(confirmed&&!old?.confirmed_ship){const count=Number((await tx.query('SELECT COUNT(*) AS n FROM pb_signups WHERE battle_id=$1 AND confirmed_ship IS NOT NULL',[battle.id])).rows[0].n);if(count>=battle.team_size)fail('The confirmed roster is full.');}
   const id=old?.id??randomUUID(),display=member.displayName??member.username??b.playerId;
   await tx.query(`INSERT INTO pb_signups(id,guild_id,battle_id,user_id,display_name,ships,preferred_ships,signup_status,confirmed_ship,horn_duty,commander_duty,horn_capable) VALUES($1,$2,$3,$4,$5,$6::jsonb,'[]'::jsonb,'ATTENDING',$7,$8,$9,$10) ON CONFLICT(battle_id,user_id) DO UPDATE SET ships=EXCLUDED.ships,signup_status='ATTENDING',confirmed_ship=EXCLUDED.confirmed_ship,horn_duty=EXCLUDED.horn_duty,commander_duty=EXCLUDED.commander_duty,assignment_version=pb_signups.assignment_version+1,updated_at=NOW()`,[id,guildId,battle.id,b.playerId,display,JSON.stringify(ships),assigned.ship,assigned.horn,assigned.commander,assigned.horn?true:old?.horn_capable??null]);
   const after={confirmed_ship:assigned.ship,signup_status:'ATTENDING',horn_duty:assigned.horn,commander_duty:assigned.commander,sourceMessageId:b.sourceMessageId,sourceChannelId:b.sourceChannelId??null};
   await tx.query(`INSERT INTO pb_assignment_events(id,guild_id,battle_id,signup_id,actor_id,action,before_state,after_state) VALUES($1,$2,$3,$4,$5,'MISFIT_SIGNUP',$6::jsonb,$7::jsonb)`,[randomUUID(),guildId,battle.id,id,actor,JSON.stringify(old??{}),JSON.stringify(after)]);
   const result={ok:true,signupId:id,player:display,ship:b.ship,confirmed:Boolean(assigned.ship),horn:assigned.horn,commander:assigned.commander,port:battle.port_name,startsAt:battle.starts_at};
   await tx.query(`INSERT INTO misfit_action_receipts(guild_id,request_key,actor_id,kind,status,result) VALUES($1,$2,$3,'pb_signup','DONE',$4::jsonb)`,[guildId,requestKey,actor,JSON.stringify(result)]);
   await tx.query('COMMIT');committed=true;return result;
  }finally{if(!committed)await tx.query('ROLLBACK').catch(()=>{});tx.release();}
 });
}
