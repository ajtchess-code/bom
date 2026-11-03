import {queueClashToolReminders} from './clashToolReminders.js';
import {randomUUID} from 'node:crypto';
import {db,many,oneOrNone} from '@bom/db';
import {canDiscordDm} from './notifications.js';
const json=(v:any)=>{try{return typeof v==='string'?JSON.parse(v):v??{};}catch{return {};}};
export function installGameHubNotifications(client:any,guildId:string){let running=false;const timer=setInterval(async()=>{
 if(running||!client.isReady())return;running=true;try{
  await queueClashToolReminders(guildId);
  const events=await many<any>(`SELECT r.* FROM game_hub_records r WHERE r.guild_id=$1 AND r.kind='event' LIMIT 200`,[guildId]);
  for(const e of events){const data=json(e.data),start=Date.parse(data.startsAt??'');if(!Number.isFinite(start)||start<Date.now()||start>Date.now()+3600000)continue;const links=await many<any>('SELECT DISTINCT user_id FROM game_hub_links WHERE guild_id=$1 AND module=$2',[guildId,e.module]);for(const link of links)await db.query(`INSERT INTO game_hub_notices(id,guild_id,module,user_id,dedupe_key,title,body) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,[randomUUID(),guildId,e.module,link.user_id,'event:'+e.id+':'+start,e.title,'Starts '+new Date(start).toISOString()+'. '+e.body.slice(0,1000)]);}
  const rows=await many<any>(`SELECT n.*,s.settings FROM game_hub_notices n LEFT JOIN game_hub_settings s ON s.guild_id=n.guild_id AND s.module=n.module WHERE n.guild_id=$1 AND n.dm_status='PENDING' ORDER BY n.created_at LIMIT 15`,[guildId]);
  for(const n of rows){const settings=json(n.settings),pref=await oneOrNone<any>(`SELECT data FROM game_hub_records WHERE guild_id=$1 AND module=$2 AND owner_id=$3 AND kind='preferences' ORDER BY updated_at DESC LIMIT 1`,[guildId,n.module,n.user_id]);
   if(!settings.discordReminders||json(pref?.data).discordDm===false||!await canDiscordDm(n.user_id,n.module)){await db.query("UPDATE game_hub_notices SET dm_status='SUPPRESSED' WHERE id=$1",[n.id]);continue;}
   const claimed=await db.query("UPDATE game_hub_notices SET dm_status='SENDING' WHERE id=$1 AND dm_status='PENDING' RETURNING id",[n.id]);if(!claimed.rowCount)continue;
   try{const user=await client.users.fetch(n.user_id);await user.send({content:`**${n.module==='minecraft'?'BOMCraft':'Clash of Clans'} · ${n.title}**\n${n.body}\n${process.env.PUBLIC_DASHBOARD_URL??'https://dashboard.bandofmisfits.org'}/dashboard/${n.module}`,allowedMentions:{parse:[]}});await db.query("UPDATE game_hub_notices SET dm_status='SENT' WHERE id=$1",[n.id]);}
   catch{await db.query("UPDATE game_hub_notices SET dm_status='FAILED' WHERE id=$1",[n.id]);}
  }
 }catch(e){console.warn('[game-hub-notices]',e);}finally{running=false;}
 },15000);timer.unref();return ()=>clearInterval(timer);
}
