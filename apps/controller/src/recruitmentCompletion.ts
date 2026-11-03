import {sendBotDm} from './dmDelivery.js';

import {db,many,oneOrNone} from '@bom/db';
import {canDiscordDm} from './notifications.js';
const terminal=['ACCEPTED','DECLINED','WITHDRAWN','CLOSED'];
const fail=(e:any)=>String(e?.message??e).slice(0,1500);
async function channel(guild:any,id:string){try{return await guild.channels.fetch(id);}catch(e:any){if(Number(e.code)===10003)return null;throw e;}}
async function step(appId:string,patch:string,args:any[]=[]){await db.query(`UPDATE recruitment_completion_jobs SET ${patch},updated_at=now() WHERE application_id=$1`,[appId,...args]);}
export async function sweepRecruitmentCompletion(client:any,guildId:string){
 // Reconcile historical terminal tickets too. Explicitly cancelled cleanup jobs remain untouched.
 await db.query(`INSERT INTO recruitment_completion_jobs(application_id,guild_id) SELECT id,guild_id FROM recruitment_applications WHERE guild_id=$1 AND status IN('ACCEPTED','DECLINED','WITHDRAWN','CLOSED') AND ticket_channel_id IS NOT NULL ON CONFLICT DO NOTHING`,[guildId]);
 const due=await many<any>(`SELECT application_id FROM recruitment_completion_jobs WHERE guild_id=$1 AND status NOT IN('COMPLETE','CANCELLED') AND next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_attempt_at LIMIT 5`,[guildId]);
 for(const item of due){const claim=await oneOrNone<any>(`UPDATE recruitment_completion_jobs SET lease_until=now()+interval '5 minutes',attempts=attempts+1 WHERE application_id=$1 AND status NOT IN('COMPLETE','CANCELLED') AND (lease_until IS NULL OR lease_until<now()) RETURNING *`,[item.application_id]);if(!claim)continue;
 try{
  const a=await oneOrNone<any>('SELECT * FROM recruitment_applications WHERE guild_id=$1 AND id=$2',[guildId,item.application_id]);
  if(!a||!terminal.includes(a.status)){await step(item.application_id,"status='CANCELLED',lease_until=NULL");continue;}
  const s=await oneOrNone<any>('SELECT * FROM recruitment_settings WHERE guild_id=$1',[guildId]);const guild=await client.guilds.fetch(guildId);
  if(claim.role_state!=='COMPLETE'){
   const member=await guild.members.fetch(String(a.user_id)).catch((e:any)=>{if(Number(e.code)===10007)return null;throw e;});
   if(!member&&a.status==='ACCEPTED')throw new Error('Applicant has left Discord; membership cannot be assigned.');
   if(member){
    if(a.status==='ACCEPTED'){
     const m=await oneOrNone<any>('SELECT member_role_id FROM membership_settings WHERE guild_id=$1',[guildId]);const target=a.target_guild_tag==='BoM'?s?.accepted_second_guild_role_id:s?.accepted_role_id??m?.member_role_id;
     if(!target)throw new Error('Accepted membership role is not configured.');
     await member.roles.add(target,'Application accepted');
     const opposite=a.target_guild_tag==='BoM'?s?.accepted_role_id??m?.member_role_id:s?.accepted_second_guild_role_id;
     if(opposite&&opposite!==target&&member.roles.cache.has(opposite))await member.roles.remove(opposite,'Membership guild selected at acceptance');
     const name=String(member.nickname??member.user.globalName??member.user.username).replace(/^(?:\[(?:BOM|BoM(?: 2)?|AFK)\]\s*)+/i,'');const nick=`[${a.target_guild_tag==='BoM'?'BoM 2':'BOM'}] ${name}`.slice(0,32);
     if(member.nickname!==nick)await member.setNickname(nick,'Application accepted');
     await db.query(`INSERT INTO member_profiles(guild_id,user_id,captain_name,game_rank,updated_by,profile_completed_at) VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(guild_id,user_id) DO UPDATE SET captain_name=COALESCE(EXCLUDED.captain_name,member_profiles.captain_name),game_rank=COALESCE(EXCLUDED.game_rank,member_profiles.game_rank),updated_at=now()`,[guildId,a.user_id,a.captain_name,a.game_rank,a.decision_by]);
    }
    for(const role of [s?.applicant_role_id,s?.trial_role_id].filter(Boolean))if(member.roles.cache.has(role))await member.roles.remove(role,'Recruitment completed');
   }
   await step(a.id,"role_state='COMPLETE'");
  }
  if(claim.dm_state==='PENDING'){
   let state='SENT';try{if(await canDiscordDm(String(a.user_id),'recruitment')){const u=await client.users.fetch(a.user_id);await sendBotDm(u,`**Application ${a.status.toLowerCase()}**\n${a.status==='ACCEPTED'?`Welcome to ${a.target_guild_tag==='BoM'?'BoM 2':'BOM'}!\n`:''}${a.decision_reason??''}\n${process.env.PUBLIC_DASHBOARD_URL??'https://dashboard.bandofmisfits.org'}/dashboard/recruitment`);}else state='SUPPRESSED';}catch(e){state='FAILED';await db.query(`INSERT INTO recruitment_application_events(application_id,event_type,visibility,message) VALUES($1,'delivery.failed','INTERNAL',$2)`,[a.id,fail(e)]);}
   await step(a.id,'dm_state=$2',[state]);
  }
  const ch=a.ticket_channel_id?await channel(guild,String(a.ticket_channel_id)):null;
  if(claim.transcript_state!=='COMPLETE'){
   if(ch){
    if(ch.type!==0||!String(ch.name).startsWith('application-'))throw new Error('Refusing to delete a room that is not a dedicated application ticket.');
    // Freeze applicant writes while archival runs so no messages escape the transcript.
    await ch.permissionOverwrites.edit(a.user_id,{SendMessages:false,AttachFiles:false},'Application completed; transcript being archived');
    const batch=await ch.messages.fetch({limit:100,...(claim.transcript_cursor?{before:claim.transcript_cursor}:{})});
    const rows=[...batch.values()].map((m:any)=>({id:m.id,at:m.createdAt.toISOString(),author:{id:m.author.id,name:m.author.tag},content:m.content,attachments:[...m.attachments.values()].map((v:any)=>({name:v.name,url:v.url})),embeds:m.embeds.map((v:any)=>v.toJSON())}));
    if(rows.length)await step(a.id,"transcript=transcript||$2::jsonb,transcript_cursor=$3",[JSON.stringify(rows),rows.at(-1)!.id]);
    if(batch.size===100){await step(a.id,'lease_until=NULL,next_attempt_at=now()');continue;}
   }
   await step(a.id,"transcript_state='COMPLETE',delete_after=now()+($2::text||' seconds')::interval,status='COUNTDOWN'",[Number(s?.cleanup_delay_seconds??60)]);
   if(ch)await ch.send({content:`Application ${a.status.toLowerCase()}. The transcript is preserved in the recruiter dashboard. This ticket will be deleted in ${Number(s?.cleanup_delay_seconds??60)} seconds. Staff can cancel deletion in the dashboard.`,allowedMentions:{parse:[]}});

   await step(a.id,'lease_until=NULL,next_attempt_at=now()+interval \'10 seconds\'');continue;
  }
  if(claim.archive_state!=='COMPLETE'){
   if(s?.archive_channel_id){const archive=await channel(guild,s.archive_channel_id);if(!archive?.isTextBased())throw new Error('Recruitment archive channel is unavailable.');await archive.send({content:`Application ${a.id} · ${a.status} · transcript retained in the recruiter dashboard.`,allowedMentions:{parse:[]}});}
   await step(a.id,"archive_state='COMPLETE'");
  }
  const fresh=await oneOrNone<any>('SELECT * FROM recruitment_completion_jobs WHERE application_id=$1',[a.id]);
  if(fresh.deletion_cancelled){await step(a.id,"status='CANCELLED',lease_until=NULL");continue;}
  if(new Date(fresh.delete_after).getTime()>Date.now()){await step(a.id,'lease_until=NULL,next_attempt_at=delete_after');continue;}
  // Refresh outcome immediately before deletion; a reopened application must keep its room.
  const check=await oneOrNone<any>('SELECT status FROM recruitment_applications WHERE id=$1',[a.id]);if(!terminal.includes(check?.status)){await step(a.id,"status='CANCELLED',lease_until=NULL");continue;}
  const interviews=await many<any>('SELECT voice_channel_id FROM recruitment_interviews WHERE application_id=$1 AND voice_channel_id IS NOT NULL',[a.id]);
  for(const i of interviews){const room=await channel(guild,i.voice_channel_id);if(room){if(room.type!==2||!/^interview[ -]/i.test(String(room.name)))throw new Error('Interview room ownership needs staff review.');await room.delete('Application completed');}}
  if(ch)await ch.delete('Application completed and transcript preserved');
  await step(a.id,"status='COMPLETE',channel_deleted_at=now(),lease_until=NULL,error=NULL");
 }catch(e){await step(item.application_id,"status='FAILED',error=$2,lease_until=NULL,next_attempt_at=now()+interval '5 minutes'",[fail(e)]);}
 }
}
