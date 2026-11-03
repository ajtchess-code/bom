import {sendBotDm} from './dmDelivery.js';
import {db,many,oneOrNone} from '@bom/db';
import {canDiscordDm} from './notifications.js';
export async function deliverBattleCancellations(client:any,guildId:string){
 const events=await many<any>("SELECT id,discord_scheduled_event_id FROM pb_battles WHERE guild_id=$1 AND status='CANCELLED' AND discord_scheduled_event_id IS NOT NULL AND discord_event_cancelled_at IS NULL LIMIT 10",[guildId]);
 for(const b of events){try{const guild=await client.guilds.fetch(guildId),event=await guild.scheduledEvents.fetch(b.discord_scheduled_event_id).catch((e:any)=>{if(Number(e.code)===10070)return null;throw e;});if(event&&event.status===1)await event.setStatus(4);else if(event&&event.status===2)await event.setStatus(3);await db.query('UPDATE pb_battles SET discord_event_cancelled_at=now(),discord_event_error=NULL WHERE id=$1',[b.id]);}catch(e:any){await db.query('UPDATE pb_battles SET discord_event_error=$2 WHERE id=$1',[b.id,String(e.message??e).slice(0,1000)]);}}
 const rows=await many<any>(`SELECT d.*,b.port_name,b.cancellation_reason FROM pb_cancellation_deliveries d JOIN pb_battles b ON b.id=d.battle_id WHERE b.guild_id=$1 AND b.status='CANCELLED' AND d.status IN('PENDING','FAILED') AND d.attempts<5 AND d.next_attempt_at<=now() ORDER BY d.next_attempt_at LIMIT 20`,[guildId]);
 for(const r of rows){const claimed=await oneOrNone<any>(`UPDATE pb_cancellation_deliveries SET status='SENDING',attempts=attempts+1,next_attempt_at=now()+interval '10 minutes' WHERE battle_id=$1 AND user_id=$2 AND status IN('PENDING','FAILED') RETURNING user_id`,[r.battle_id,r.user_id]);if(!claimed)continue;
 try{const permitted=await canDiscordDm(r.user_id,'battles');if(permitted){const u=await client.users.fetch(r.user_id);await sendBotDm(u,`**Battle of ${r.port_name} — CANCELLED**\n${r.cancellation_reason}\nYou do not need to attend. This cancellation does not affect attendance records.`);}await db.query("UPDATE pb_cancellation_deliveries SET status=$3,sent_at=now(),error=NULL WHERE battle_id=$1 AND user_id=$2",[r.battle_id,r.user_id,permitted?'SENT':'SUPPRESSED']);}
 catch(e:any){await db.query("UPDATE pb_cancellation_deliveries SET status='FAILED',error=$3,next_attempt_at=now()+interval '5 minutes' WHERE battle_id=$1 AND user_id=$2",[r.battle_id,r.user_id,String(e.message??e).slice(0,1000)]);}
 }
 // SENDING indicates delivery was interrupted; do not automatically duplicate an uncertain DM.
 await db.query("UPDATE pb_cancellation_deliveries SET status='REVIEW',error='Delivery interrupted; verify receipt before manual resend.' WHERE status='SENDING' AND next_attempt_at<now()");
}
