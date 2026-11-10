import { ChannelType, Client, type Guild, type GuildMember, type Message, type VoiceState } from "discord.js";
import { randomUUID } from "node:crypto";
import { db, many, oneOrNone } from "@bom/db";
import { redis, keys, publishWorkerCommand } from "@bom/redis";

const asArray=(v:any):string[]=>{if(Array.isArray(v))return v.map(String);if(typeof v==="string")try{const x=JSON.parse(v);return Array.isArray(x)?x.map(String):[];}catch{}return[];};
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));

const superscriptDigits:Record<string,string>={"0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹"};
function roomNumberText(value:number|null|undefined,style:string){
  if(!value)return "";
  if(style==="SUPERSCRIPT")return String(value).split("").map(x=>superscriptDigits[x]??x).join("");
  if(style==="PAD2")return String(value).padStart(2,"0");
  return String(value);
}
function renderTemplate(template:string,member:GuildMember,message?:Message,roomNumber?:number|null,numberStyle="STANDARD"){
  const display=(member.displayName||member.user.username||"Member").trim();
  const content=(message?.content||"Discussion").replace(/\s+/g," ").trim();
  return template
    .replaceAll("{displayName}",display)
    .replaceAll("{username}",member.user.username)
    .replaceAll("{author}",display)
    .replaceAll("{message}",content.slice(0,60)||"Discussion")
    .replaceAll("{channel}",message?.channel?.isTextBased()&&"name" in message.channel?String((message.channel as any).name??"channel"):"channel")
    .replaceAll("{date}",new Date().toISOString().slice(0,10))
    .replaceAll("{number}",roomNumberText(roomNumber,numberStyle));
}
async function nextRoomNumber(guildId:string,ruleId:string){
  const rows=await many<any>(`SELECT room_number FROM temp_voice_sessions WHERE guild_id=$1 AND status='ACTIVE' AND room_number IS NOT NULL ORDER BY room_number`,[guildId]);
  const used=new Set(rows.map(r=>Number(r.room_number)).filter(n=>Number.isInteger(n)&&n>0));
  let candidate=1;while(used.has(candidate))candidate++;return candidate;
}
function safeChannelName(name:string,voice=true){
  const clean=name.replace(/[\r\n\t]/g," ").replace(/\s+/g," ").trim().slice(0,100);
  return clean|| (voice?"Temporary Voice":"temporary-room");
}
function textChannelName(name:string){return name.toLowerCase().replace(/[^a-z0-9-_ ]/g,"").trim().replace(/\s+/g,"-").slice(0,100)||"temporary-room";}
function hasHumanMembers(channel:any){return channel?.members?.some?.((m:GuildMember)=>!m.user.bot)??false;}
function premiumBitrateCap(guild:Guild){const tier=Number((guild as any).premiumTier??0);return tier>=3?384000:tier===2?256000:tier===1?128000:96000;}
export const JOIN_TO_CREATE_CHANNEL_ID='1554170868555448350';
const EMPTY_DELAY_MS=15*60*1000;
async function fixedRule(guildId:string){
  return (await db.query(`INSERT INTO voice_automation_rules(id,guild_id,creator_channel_id,created_by,name_template,number_style,owner_can_manage,delete_delay_seconds) VALUES($1,$2,$3,'0','ßǾM{number}','SUPERSCRIPT',FALSE,900) ON CONFLICT(guild_id,creator_channel_id) DO UPDATE SET enabled=TRUE,owner_can_manage=FALSE,delete_delay_seconds=900 RETURNING *`,[randomUUID(),guildId,JOIN_TO_CREATE_CHANNEL_ID])).rows[0];
}
async function sessionByChannel(guildId:string,channelId:string){return oneOrNone<any>(`SELECT * FROM temp_voice_sessions WHERE guild_id=$1 AND channel_id=$2 AND status='ACTIVE' LIMIT 1`,[guildId,channelId]);}
async function positionRooms(guild:Guild){
  const anchor=await guild.channels.fetch(JOIN_TO_CREATE_CHANNEL_ID);
  if(!anchor?.isVoiceBased())return;
  const sessions=await many<any>(`SELECT channel_id,room_number FROM temp_voice_sessions WHERE guild_id=$1 AND status='ACTIVE' ORDER BY room_number NULLS LAST,created_at`,[guild.id]);
  let position=anchor.rawPosition+1;
  for(const session of sessions){const channel=await guild.channels.fetch(session.channel_id);if(channel?.isVoiceBased()){
    if(channel.parentId!==anchor.parentId)await channel.setParent(anchor.parentId,{lockPermissions:false});
    await channel.setPosition(position++);
  }}
}
async function createTemporaryVoice(guild:Guild,member:GuildMember){
  const lock=`automation:voice:create:${guild.id}`;
  if(!await redis.set(lock,'1','EX',60,'NX'))throw new Error('Voice creation busy. Please rejoin the creator channel.');
  let voice:any=null,sessionId:string|null=null;
  try{
    const creator=await guild.channels.fetch(JOIN_TO_CREATE_CHANNEL_ID);
    if(!creator?.isVoiceBased()||member.voice.channelId!==creator.id)return;
    const rule=await fixedRule(guild.id),roomNumber=await nextRoomNumber(guild.id,rule.id);
    // Audit-log reconciliation recovers a channel if the process stops
    // between Discord creation and the session insert.
    sessionId=randomUUID();
    voice=await guild.channels.create({name:`ßǾM${roomNumberText(roomNumber,'SUPERSCRIPT')}`,type:ChannelType.GuildVoice,parent:creator.parentId,bitrate:creator.bitrate,userLimit:creator.userLimit,permissionOverwrites:creator.permissionOverwrites.cache.map(o=>({id:o.id,type:o.type,allow:o.allow.bitfield,deny:o.deny.bitfield})),reason:`BOM temporary voice ${sessionId}`});
    await db.query(`INSERT INTO temp_voice_sessions(id,guild_id,rule_id,owner_id,channel_id,room_number,status,empty_since) VALUES($1,$2,$3,$4,$5,$6,'ACTIVE',NOW())`,[sessionId,guild.id,rule.id,member.id,voice.id,roomNumber]);
    await positionRooms(guild);
    if(member.voice.channelId===creator.id)await member.voice.setChannel(voice,'Join-to-create temporary room');
    if(voice.members.size)await db.query('UPDATE temp_voice_sessions SET empty_since=NULL WHERE id=$1',[sessionId]);
  }catch(error){
    // Keep persisted channels for reconciliation; never lose their identity.
    if(voice&&!await sessionByChannel(guild.id,voice.id))await voice.delete('Rollback untracked temporary voice');
    throw error;
  }finally{await redis.del(lock);}
}

async function deleteSession(guild:Guild,session:any,reason:string){
  // Recheck occupancy before stopping music or deleting anything.
  const voice=await guild.channels.fetch(session.channel_id);
  if(voice?.isVoiceBased()&&voice.members.size>0)return;
  const musicRoom=await oneOrNone<any>(`SELECT id FROM music_rooms WHERE guild_id=$1 AND voice_channel_id=$2 AND enabled=TRUE LIMIT 1`,[guild.id,session.channel_id]);
  if(musicRoom?.id){
    const workerId=await redis.get(keys.roomWorker(musicRoom.id)).catch(()=>null);
    if(workerId)await publishWorkerCommand(workerId,{type:"LEAVE",roomId:musicRoom.id,guildId:guild.id}).catch(()=>{});
    await redis.del(keys.roomWorker(musicRoom.id)).catch(()=>{});
    if(workerId){const lease=await redis.get(keys.workerLease(workerId)).catch(()=>null);if(lease===musicRoom.id)await redis.del(keys.workerLease(workerId)).catch(()=>{});}
    await db.query(`UPDATE music_rooms SET enabled=FALSE WHERE id=$1`,[musicRoom.id]).catch(()=>{});
  }
  if(voice?.isVoiceBased()&&voice.members.size>0)return;
  if(voice)await voice.delete(reason);
  if(session.waiting_channel_id){const waiting=await guild.channels.fetch(session.waiting_channel_id).catch(()=>null);if(waiting)await waiting.delete(reason).catch(()=>{});}
  if(session.text_channel_id){const text=await guild.channels.fetch(session.text_channel_id).catch(()=>null);if(text)await text.delete(reason).catch(()=>{});}
  await db.query(`UPDATE temp_voice_sessions SET status='DELETED',deleted_at=CURRENT_TIMESTAMP WHERE id=$1`,[session.id]);
  console.log(`[automation:voice] deleted temporary room ${session.channel_id} (${reason})`);
}
async function checkEmpty(guild:Guild,session:any,channel:any){
  if(channel.members.size>0){await db.query(`UPDATE temp_voice_sessions SET empty_since=NULL WHERE id=$1`,[session.id]);return;}
  const row=(await db.query(`UPDATE temp_voice_sessions SET empty_since=COALESCE(empty_since,NOW()) WHERE id=$1 AND status='ACTIVE' RETURNING empty_since`,[session.id])).rows[0];
  if(row&&Date.now()-new Date(row.empty_since).getTime()>=EMPTY_DELAY_MS)await deleteSession(guild,session,'Temporary voice empty for 15 minutes');
}
async function handleVoiceState(guildId:string,oldState:VoiceState,newState:VoiceState){
  if(newState.guild.id!==guildId||oldState.channelId===newState.channelId)return;
  if(newState.channelId===JOIN_TO_CREATE_CHANNEL_ID&&newState.member&&!newState.member.user.bot)await createTemporaryVoice(newState.guild,newState.member).catch(error=>console.error('[automation:voice]',error));
  for(const id of new Set([oldState.channelId,newState.channelId].filter(Boolean) as string[])){
    const session=await sessionByChannel(guildId,id);if(!session)continue;
    const channel=await newState.guild.channels.fetch(id);if(channel?.isVoiceBased())await checkEmpty(newState.guild,session,channel);
  }
}

function messageMatchesRule(message:Message,rule:any){
  if(Boolean(rule.ignore_bots)&&message.author.bot)return false;
  if(Boolean(rule.ignore_webhooks)&&message.webhookId)return false;
  if(Boolean(rule.only_attachments)&&message.attachments.size===0)return false;
  if(Boolean(rule.only_links)&&!/(https?:\/\/\S+)/i.test(message.content||""))return false;
  const roles=message.member?.roles.cache.map(r=>r.id)??[];const allowed=asArray(rule.allowed_role_ids),excluded=asArray(rule.excluded_role_ids);
  if(excluded.some(id=>roles.includes(id)))return false;
  if(allowed.length&&!allowed.some(id=>roles.includes(id)))return false;
  return true;
}
async function handleMessage(guildId:string,message:Message){
  if(message.guildId!==guildId)return;
  const rule=await oneOrNone<any>(`SELECT * FROM channel_automation_rules WHERE guild_id=$1 AND channel_id=$2 AND enabled=TRUE LIMIT 1`,[guildId,message.channelId]);
  if(!rule||!messageMatchesRule(message,rule))return;
  const reactions=asArray(rule.reaction_emojis).slice(0,20);
  for(const emoji of reactions)await message.react(emoji).catch(err=>console.warn(`[automation:reaction] failed ${emoji} in ${message.channelId}`,err?.message??err));
  if(Boolean(rule.auto_thread)&&message.member){
    try{
      if((message as any).hasThread)return;
      const name=safeChannelName(renderTemplate(String(rule.thread_name_template||"{author} — {message}"),message.member,message),false).slice(0,100);
      const archive=[60,1440,4320,10080].includes(Number(rule.auto_archive_minutes))?Number(rule.auto_archive_minutes):1440;
      const thread=await message.startThread({name,autoArchiveDuration:archive as any,reason:"BOM automatic thread rule"});
      if(rule.starter_message)await thread.send({content:String(rule.starter_message).slice(0,2000)}).catch(()=>{});
    }catch(err:any){console.warn(`[automation:thread] failed in ${message.channelId}: ${err?.message??err}`);}
  }
}

async function handleChannelDelete(guildId:string,channel:any){
  if(channel.guildId!==guildId)return;
  const session=await oneOrNone<any>(`SELECT * FROM temp_voice_sessions WHERE guild_id=$1 AND status='ACTIVE' AND (channel_id=$2 OR waiting_channel_id=$2 OR text_channel_id=$2) LIMIT 1`,[guildId,channel.id]);if(!session)return;
  if(session.channel_id===channel.id){
    const guild=channel.guild as Guild;
    if(session.waiting_channel_id){const waiting=await guild.channels.fetch(session.waiting_channel_id).catch(()=>null);if(waiting)await waiting.delete("Main temporary room was removed").catch(()=>{});}
    if(session.text_channel_id){const text=await guild.channels.fetch(session.text_channel_id).catch(()=>null);if(text)await text.delete("Main temporary room was removed").catch(()=>{});}
    await db.query(`UPDATE temp_voice_sessions SET status='DELETED',deleted_at=CURRENT_TIMESTAMP WHERE id=$1`,[session.id]);
    const musicRoom=await oneOrNone<any>(`SELECT id FROM music_rooms WHERE guild_id=$1 AND voice_channel_id=$2 AND enabled=TRUE LIMIT 1`,[guildId,channel.id]);if(musicRoom?.id){const workerId=await redis.get(keys.roomWorker(musicRoom.id)).catch(()=>null);if(workerId)await publishWorkerCommand(workerId,{type:"LEAVE",roomId:musicRoom.id,guildId}).catch(()=>{});await db.query(`UPDATE music_rooms SET enabled=FALSE WHERE id=$1`,[musicRoom.id]).catch(()=>{});}
  }else if(session.waiting_channel_id===channel.id)await db.query(`UPDATE temp_voice_sessions SET waiting_channel_id=NULL WHERE id=$1`,[session.id]);
  else if(session.text_channel_id===channel.id)await db.query(`UPDATE temp_voice_sessions SET text_channel_id=NULL WHERE id=$1`,[session.id]);
}

async function normalizeTemporaryRooms(guild:Guild){
 const anchor=await guild.channels.fetch(JOIN_TO_CREATE_CHANNEL_ID);if(!anchor?.isVoiceBased())return;
 const rule=await fixedRule(guild.id),sessions=await many<any>(`SELECT * FROM temp_voice_sessions WHERE guild_id=$1 AND status='ACTIVE' ORDER BY created_at`,[guild.id]);
 const used=new Set<number>();
 for(const session of sessions){const channel=await guild.channels.fetch(session.channel_id);if(!channel?.isVoiceBased())continue;
  let number=Number(session.room_number);if(!Number.isInteger(number)||number<1||used.has(number)){number=1;while(used.has(number))number++;}used.add(number);
  await db.query('UPDATE temp_voice_sessions SET room_number=$2,rule_id=$3 WHERE id=$1',[session.id,number,rule.id]);
  const name=`ßǾM${roomNumberText(number,'SUPERSCRIPT')}`;if(channel.name!==name)await channel.setName(name,'BOM temporary voice numbering');
  await channel.permissionOverwrites.set(anchor.permissionOverwrites.cache.map(o=>({id:o.id,type:o.type,allow:o.allow.bitfield,deny:o.deny.bitfield})),'Copy join-to-create permissions');
 }
 await db.query('UPDATE voice_automation_rules SET enabled=FALSE WHERE guild_id=$1 AND creator_channel_id<>$2',[guild.id,JOIN_TO_CREATE_CHANNEL_ID]);
 await positionRooms(guild);
}
let reconciling=false;
async function reconcile(client:Client,guildId:string){
  if(reconciling)return;reconciling=true;
  try{
    const guild=await client.guilds.fetch(guildId);await guild.channels.fetch();
    // Audit evidence, rather than a matching name, proves the bot created it.
    const rule=await fixedRule(guildId);
    const logs=await guild.fetchAuditLogs({type:10,limit:100}).catch(()=>null);
    for(const entry of logs?.entries.values()??[]){
      if(entry.executorId!==client.user?.id||!entry.reason?.startsWith('BOM temporary voice ')||!entry.targetId)continue;
      const channel=guild.channels.cache.get(entry.targetId);if(!channel?.isVoiceBased()||await sessionByChannel(guildId,channel.id))continue;
      const digits:Record<string,string>={'⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9'};
      const number=Number(channel.name.slice(3).split('').map(x=>digits[x]??'').join(''))||null;
      await db.query(`INSERT INTO temp_voice_sessions(id,guild_id,rule_id,owner_id,channel_id,room_number,empty_since) VALUES($1,$2,$3,'0',$4,$5,NOW()) ON CONFLICT(channel_id) DO NOTHING`,[randomUUID(),guildId,rule.id,channel.id,number]);
    }
    const anchor=guild.channels.cache.get(JOIN_TO_CREATE_CHANNEL_ID);
    if(anchor?.isVoiceBased())for(const member of anchor.members.values())if(!member.user.bot)await createTemporaryVoice(guild,member).catch(error=>console.warn('[automation:voice] retry failed',error));
    const sessions=await many<any>(`SELECT * FROM temp_voice_sessions WHERE guild_id=$1 AND status='ACTIVE'`,[guildId]);
    for(const session of sessions){const channel=guild.channels.cache.get(session.channel_id);if(!channel){await db.query(`UPDATE temp_voice_sessions SET status='ORPHANED',deleted_at=NOW() WHERE id=$1`,[session.id]);continue;}if(channel.isVoiceBased())await checkEmpty(guild,session,channel);}
  }finally{reconciling=false;}
}
export function startAutomationEngine(client:Client,guildId:string){
  const report=(error:unknown)=>console.error('[automation]',error);
  client.on('voiceStateUpdate',(oldState,newState)=>void handleVoiceState(guildId,oldState,newState).catch(report));
  client.on('messageCreate',message=>void handleMessage(guildId,message).catch(report));
  client.on('channelDelete',channel=>void handleChannelDelete(guildId,channel).catch(report));
  const sweep=()=>void reconcile(client,guildId).catch(report);
  client.once('clientReady',()=>void (async()=>{await reconcile(client,guildId);const guild=await client.guilds.fetch(guildId);await normalizeTemporaryRooms(guild);})().catch(report));
  client.on('channelUpdate',(oldChannel,newChannel)=>{if(newChannel.id===JOIN_TO_CREATE_CHANNEL_ID&&'guild' in newChannel)void normalizeTemporaryRooms(newChannel.guild).catch(report);});
  const timer=setInterval(sweep,30_000);timer.unref();
}
