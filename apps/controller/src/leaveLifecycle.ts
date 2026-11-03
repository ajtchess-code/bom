import {ChannelType,PermissionFlagsBits} from 'discord.js';
import {db,many,oneOrNone} from '@bom/db';
const guildId=process.env.DISCORD_GUILD_ID??'';
const json=(v:any)=>typeof v==='string'?JSON.parse(v):v;
const threadWork=new Map<string,Promise<any>>();
const guildMemberLoads=new Map<string,{until:number;pending:Promise<void>}>();
const threadRetries=new Map<string,{until:number;failures:number}>();
/** Share gateway member chunks across leave requests and back off after rate limits. */
async function loadLeaveMembers(guild:any){
 const key=String(guild.id??guildId),cached=guildMemberLoads.get(key);
 if(cached&&cached.until>Date.now())return cached.pending;
 const entry={until:Date.now()+300000,pending:Promise.resolve()};
 entry.pending=Promise.resolve().then(()=>guild.members.fetch()).then(()=>{}).catch((e:any)=>{entry.until=Date.now()+60000;throw e;});
 guildMemberLoads.set(key,entry);return entry.pending;
}

export async function ensureLeaveThread(client:any,leaveId:string){
 const previous=threadWork.get(leaveId);if(previous)return previous;
 const next=ensureLeaveThreadNow(client,leaveId);threadWork.set(leaveId,next);
 try{return await next;}finally{if(threadWork.get(leaveId)===next)threadWork.delete(leaveId);}
}
async function ensureLeaveThreadNow(client:any,leaveId:string){
 const row=await oneOrNone<any>('SELECT * FROM member_leaves WHERE guild_id=$1 AND id=$2',[guildId,leaveId]);if(!row||row.status!=='AWAY')return;
 const cfg=await oneOrNone<any>('SELECT * FROM membership_settings WHERE guild_id=$1',[guildId]);const guild=await client.guilds.fetch(guildId);
 const parent=cfg?.member_console_channel_id?await guild.channels.fetch(cfg.member_console_channel_id):null;if(!parent||parent.type!==ChannelType.GuildText)throw Error('Configure a text Control Desk channel with private thread access');
 const member=await guild.members.fetch(row.user_id);let thread:any=null;
 if(row.thread_id){try{thread=await guild.channels.fetch(row.thread_id);}catch(e:any){if(![10003,10008].includes(Number(e.code)))throw e;}}
 const legacy=thread&&thread.type!==ChannelType.PrivateThread?thread:null;if(legacy)thread=null;
 if(!thread){thread=await parent.threads.create({name:`Leave · ${member.displayName}`.slice(0,100),type:ChannelType.PrivateThread,invitable:false,autoArchiveDuration:1440,reason:'Private leave of absence'});await db.query('UPDATE member_leaves SET thread_id=$2,thread_archive_at=now()+interval \'24 hours\',thread_error=NULL WHERE id=$1',[row.id,thread.id]);}
 if(legacy&&!legacy.archived)await legacy.setArchived(true);
 if(thread.archived)await thread.setArchived(false);
 await thread.members.add(member.id);
 if(cfg.leave_officer_role_id){await loadLeaveMembers(guild);const role=await guild.roles.fetch(cfg.leave_officer_role_id);if(!role)throw Error('Leave Request role is missing');for(const staff of role.members.values())if(!staff.user.bot)await thread.members.add(staff.id);}
 const extended=new Date(row.return_at).getTime()-Date.now()>30*86400000;
 await thread.send({content:`${cfg.leave_officer_role_id?`<@&${cfg.leave_officer_role_id}> · `:''}<@${row.user_id}> · Leave until **<t:${Math.floor(new Date(row.return_at).getTime()/1000)}:F>**\nReason: ${row.reason??'Not provided'}${extended?'\nFor leave longer than 30 days, please leave the active in-game guild and apply to **BoM**.':''}`,allowedMentions:{users:[row.user_id],roles:cfg.leave_officer_role_id?[cfg.leave_officer_role_id]:[],parse:[]}});
 await db.query("UPDATE member_leaves SET thread_archive_at=now()+interval '24 hours',thread_error=NULL WHERE id=$1",[row.id]);
}
export async function safelyEnsureLeaveThread(client:any,id:string){
 const previous=threadRetries.get(id);if(previous&&previous.until>Date.now())return;
 try{await ensureLeaveThread(client,id);threadRetries.delete(id);}catch(e:any){const failures=(previous?.failures??0)+1;threadRetries.set(id,{failures,until:Date.now()+Math.min(300000,30000*2**Math.min(failures-1,4))});await db.query('UPDATE member_leaves SET thread_error=$2 WHERE id=$1',[id,String(e.message??e).slice(0,500)]);console.warn('[leave] private thread needs repair; retry delayed',e);}
}
export async function syncLeaveLifecycle(client:any){
 const guild=await client.guilds.fetch(guildId);
 // Recreate a manually deleted private thread; never duplicate on access errors.
 const repair=await many<any>("SELECT id,thread_id,thread_error FROM member_leaves WHERE guild_id=$1 AND status='AWAY' ORDER BY updated_at LIMIT 1000",[guildId]);
 for(const row of repair){if(!row.thread_id||row.thread_error){await safelyEnsureLeaveThread(client,row.id);continue;}try{const thread=await guild.channels.fetch(row.thread_id);if(!thread)await safelyEnsureLeaveThread(client,row.id);}catch(e:any){if(Number(e.code)===10003)await safelyEnsureLeaveThread(client,row.id);}}
 const archives=await many<any>('SELECT id,thread_id FROM member_leaves WHERE guild_id=$1 AND thread_id IS NOT NULL AND thread_archive_at<=now()',[guildId]);
 for(const row of archives){try{const thread=await guild.channels.fetch(row.thread_id);if(thread&&!thread.archived)await thread.setArchived(true);await db.query('UPDATE member_leaves SET thread_archive_at=NULL WHERE id=$1',[row.id]);}catch(e){console.warn('[leave] archive failed',e);}}
 const due=await many<any>("SELECT * FROM member_leaves WHERE guild_id=$1 AND status='AWAY' AND reminded=FALSE AND return_at<=now() ORDER BY return_at LIMIT 100",[guildId]);
 for(const row of due){try{if(!row.thread_id){await safelyEnsureLeaveThread(client,row.id);continue;}const thread=await guild.channels.fetch(row.thread_id);if(!thread)continue;if(thread.archived)await thread.setArchived(false);await thread.members.add(row.user_id);const message=await thread.send({content:`<@${row.user_id}> · Your expected return date has passed. Extend your leave or mark yourself active.`,components:[{type:1,components:[{type:2,style:1,custom_id:'membership:leave:extend',label:'Extend Leave'},{type:2,style:3,custom_id:'membership:leave:return',label:'I Have Returned (Mark as Active)'}]}],allowedMentions:{users:[row.user_id],parse:[]}});await db.query("UPDATE member_leaves SET reminded=TRUE,reminder_message_id=$2,thread_archive_at=now()+interval '24 hours' WHERE id=$1",[row.id,message.id]);}catch(e){console.warn('[leave] reminder failed',e);}}
}
export function installLeaveJobs(client:any,actions:{start:(userId:string,until:Date,reason:string|null,actorId:string)=>Promise<any>;returned:(guild:any,userId:string,actorId:string)=>Promise<any>}){
 let running=false;
 const tick=async()=>{if(running||!client.isReady())return;running=true;try{
  await db.query("UPDATE community_jobs SET status='FAILED',error='Service restarted during update. Check leave status, then retry if needed.',updated_at=now() WHERE guild_id=$1 AND status='RUNNING' AND updated_at<now()-interval '5 minutes'",[guildId]);
  const row=await oneOrNone<any>("UPDATE community_jobs SET status='RUNNING',updated_at=now() WHERE id=(SELECT id FROM community_jobs WHERE guild_id=$1 AND status='QUEUED' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *",[guildId]);if(!row)return;
  try{const payload=json(row.payload),guild=await client.guilds.fetch(guildId);if(row.action==='LEAVE'){const result=await actions.start(row.user_id,new Date(payload.until),payload.reason,row.actor_id);await safelyEnsureLeaveThread(client,result.id);}else await actions.returned(guild,row.user_id,row.actor_id);await db.query("UPDATE community_jobs SET status='DONE',updated_at=now(),error=NULL WHERE id=$1",[row.id]);}catch(e:any){await db.query("UPDATE community_jobs SET status='FAILED',updated_at=now(),error=$2 WHERE id=$1",[row.id,String(e.message).slice(0,500)]);}
 }catch(e){console.error('[leave] dashboard queue failed',e);}finally{running=false;}};
 const timer=setInterval(()=>void tick(),2000);timer.unref();client.once('clientReady',()=>void tick());
}
