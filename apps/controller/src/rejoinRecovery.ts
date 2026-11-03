import {randomUUID} from 'node:crypto';
import {AuditLogEvent,PermissionFlagsBits} from 'discord.js';
import {db,many,oneOrNone} from '@bom/db';
const guildId=process.env.DISCORD_GUILD_ID??'';
const json=(v:any)=>typeof v==='string'?JSON.parse(v):v;
export function installRejoinRecovery(client:any){
 client.on('guildMemberRemove',async(member:any)=>{if(member.guild.id!==guildId||member.user.bot)return;const id=randomUUID();try{
  await db.query('INSERT INTO member_departures(id,guild_id,user_id,role_ids,nickname) VALUES($1,$2,$3,$4::jsonb,$5)',[id,guildId,member.id,JSON.stringify([...member.roles.cache.keys()].filter(x=>x!==guildId)),member.nickname]);
  // An audit-log lookup can lag the gateway departure event. Unknown stays manual.
  const timer=setTimeout(()=>void (async()=>{let kind='UNKNOWN';try{const logs=await member.guild.fetchAuditLogs({limit:20});const event=logs.entries.find((e:any)=>String(e.targetId)===String(member.id)&&Math.abs(e.createdTimestamp-Date.now())<20000&&[AuditLogEvent.MemberKick,AuditLogEvent.MemberBanAdd].includes(e.action));kind=event?.action===AuditLogEvent.MemberKick?'KICKED':event?.action===AuditLogEvent.MemberBanAdd?'BANNED':'VOLUNTARY';}catch{}await db.query('UPDATE member_departures SET departure_kind=$2 WHERE id=$1',[id,kind]);})().catch(console.error),2500);timer.unref();
 }catch(e){console.error('[rejoin] departure snapshot failed',e);}});
 client.on('guildMemberAdd',async(member:any)=>{if(member.guild.id!==guildId||member.user.bot)return;try{
  const row=await oneOrNone<any>("UPDATE member_departures SET returned_at=now(),review_status='PENDING' WHERE id=(SELECT id FROM member_departures WHERE guild_id=$1 AND user_id=$2 AND review_status='AWAITING_RETURN' ORDER BY departed_at DESC LIMIT 1) RETURNING *",[guildId,member.id]);if(!row)return;
  const cfg=await oneOrNone<any>('SELECT * FROM community_operations_settings WHERE guild_id=$1',[guildId]);if(cfg?.officer_channel_id){const channel=await member.guild.channels.fetch(cfg.officer_channel_id);await channel.send({content:`${cfg.rejoin_role_id?`<@&${cfg.rejoin_role_id}> · `:''}<@${member.id}> returned to Discord. Previous departure: **${row.departure_kind}**. Review previous roles and open requests before restoring access.\n${process.env.PUBLIC_DASHBOARD_URL??''}/dashboard/members/leave?view=rejoins`,allowedMentions:{roles:cfg.rejoin_role_id?[cfg.rejoin_role_id]:[],users:[],parse:[]}});}
 }catch(e){console.error('[rejoin] return review failed',e);}});
 let busy=false;const timer=setInterval(()=>void(async()=>{if(busy||!client.isReady())return;busy=true;try{const guild=await client.guilds.fetch(guildId),rows=await many<any>("SELECT * FROM member_departures WHERE guild_id=$1 AND review_status='APPROVED' AND restored_role_ids IS NULL ORDER BY reviewed_at LIMIT 10",[guildId]);for(const row of rows){try{
   const member=await guild.members.fetch(row.user_id),restored=[];for(const id of json(row.role_ids)??[]){const role=await guild.roles.fetch(id);if(!role||role.managed||!role.editable)continue;
    // Sensitive server administration privileges always require direct Discord review.
    if(role.permissions.any([PermissionFlagsBits.Administrator,PermissionFlagsBits.ManageGuild,PermissionFlagsBits.ManageRoles,PermissionFlagsBits.BanMembers,PermissionFlagsBits.KickMembers]))continue;
    await member.roles.add(role,'Officer approved returning member');restored.push(id);}
   const apps=await many<any>("SELECT ticket_channel_id FROM recruitment_applications WHERE guild_id=$1 AND user_id=$2 AND status NOT IN('CLOSED','DECLINED','WITHDRAWN','ACCEPTED')",[guildId,row.user_id]);for(const app of apps){if(!app.ticket_channel_id)continue;try{const channel=await guild.channels.fetch(app.ticket_channel_id);if(channel)await channel.permissionOverwrites.edit(row.user_id,{ViewChannel:true,SendMessages:true,ReadMessageHistory:true});}catch(e:any){if(Number(e.code)!==10003)throw e;}}
   const requests=await many<any>("SELECT DISTINCT r.text_channel_id,r.voice_channel_id FROM diplomacy_requests r LEFT JOIN diplomacy_participants p ON p.request_id=r.id AND p.status='APPROVED' WHERE r.guild_id=$1 AND r.status='OPEN' AND (r.owner_id=$2 OR p.user_id=$2)",[guildId,row.user_id]);
   for(const request of requests)for(const [id,voice] of [[request.text_channel_id,false],[request.voice_channel_id,true]] as const){if(!id)continue;try{const channel=await guild.channels.fetch(id);if(channel)await channel.permissionOverwrites.edit(row.user_id,voice?{ViewChannel:true,Connect:true}:{ViewChannel:true,SendMessages:true,ReadMessageHistory:true});}catch(e:any){if(Number(e.code)!==10003)throw e;}}
   const leaves=await many<any>("SELECT thread_id FROM member_leaves WHERE guild_id=$1 AND user_id=$2 AND status='AWAY' AND thread_id IS NOT NULL",[guildId,row.user_id]);for(const leave of leaves){try{const thread=await guild.channels.fetch(leave.thread_id);if(thread){if(thread.archived)await thread.setArchived(false);await thread.members.add(row.user_id);}}catch(e:any){if(Number(e.code)!==10003)throw e;}}
   await db.query('UPDATE member_departures SET restored_role_ids=$2::jsonb,error=NULL WHERE id=$1',[row.id,JSON.stringify(restored)]);
  }catch(e:any){await db.query('UPDATE member_departures SET error=$2 WHERE id=$1',[row.id,String(e.message).slice(0,500)]);}}
 }catch(e){console.error('[rejoin] recovery failed',e);}finally{busy=false;}})(),15000);timer.unref();
}
