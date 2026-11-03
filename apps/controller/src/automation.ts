import { ChannelType, Client, PermissionFlagsBits, type Guild, type GuildMember, type Message, type VoiceState } from "discord.js";
import { randomUUID } from "node:crypto";
import { db, many, oneOrNone } from "@bom/db";
import { redis, keys, publishWorkerCommand } from "@bom/redis";

const asArray=(v:any):string[]=>{if(Array.isArray(v))return v.map(String);if(typeof v==="string")try{const x=JSON.parse(v);return Array.isArray(x)?x.map(String):[];}catch{}return[];};
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const cleanupTimers=new Map<string,NodeJS.Timeout>();

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
  const rows=await many<any>(`SELECT room_number FROM temp_voice_sessions WHERE guild_id=$1 AND rule_id=$2 AND status='ACTIVE' AND room_number IS NOT NULL ORDER BY room_number`,[guildId,ruleId]);
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
function mergedOverwrites(creator:any,guild:Guild,member:GuildMember,rule:any,allowed:string[],denied:string[],waiting=false){
  // Closed-by-default temporary rooms. Waiting rooms are intentionally public
  // to anyone who can access the guild; the private room never inherits the
  // creator's potentially public connection permissions.
  const map=new Map<string,{id:string;type:number;allow:bigint;deny:bigint}>();
  const merge=(id:string,type:number,allow:bigint=0n,deny:bigint=0n)=>{
    const cur=map.get(id)??{id,type,allow:0n,deny:0n};
    cur.allow=(cur.allow|allow)&~deny;cur.deny=(cur.deny|deny)&~allow;map.set(id,cur);
  };
  const access=PermissionFlagsBits.ViewChannel|PermissionFlagsBits.Connect;
  if(waiting){
    merge(guild.roles.everyone.id,0,access,0n);
    merge(member.id,1,access|PermissionFlagsBits.MoveMembers,0n);
  }else{
    merge(guild.roles.everyone.id,0,0n,access);
    for(const roleId of allowed)if(guild.roles.cache.has(roleId))merge(roleId,0,access,0n);
    for(const roleId of denied)if(guild.roles.cache.has(roleId))merge(roleId,0,0n,access);
    const manage=PermissionFlagsBits.ManageChannels|PermissionFlagsBits.MoveMembers|PermissionFlagsBits.MuteMembers|PermissionFlagsBits.DeafenMembers|PermissionFlagsBits.ManageMessages;
    for(const roleId of asArray(rule.manager_role_ids))if(guild.roles.cache.has(roleId))merge(roleId,0,access|manage,0n);
    const ownerAllow=access|PermissionFlagsBits.Speak|(Boolean(rule.owner_can_manage)?manage:0n);
    merge(member.id,1,ownerAllow,0n);
  }
  return [...map.values()];
}
async function positionAboveAnchor(guild:Guild,channel:any,anchorId:any){
  if(!anchorId)return;
  const anchor=await guild.channels.fetch(String(anchorId)).catch(()=>null);
  if(!anchor||String(anchor.id)===String(channel.id)||anchor.parentId!==channel.parentId)return;
  // A fetched GuildBasedChannel may be a thread, which has no sibling position.
  // Only use a sortable guild channel as a positioning anchor.
  if(!('rawPosition' in anchor)||typeof anchor.rawPosition!=='number')return;
  // Discord reorders siblings when a position changes; refresh each time.
  await channel.setPosition(Math.max(0,anchor.rawPosition),{reason:'Keep temporary rooms above the configured anchor'}).catch((err:unknown)=>console.warn('[automation:voice] could not position new room',err));
}

async function ruleForCreator(guildId:string,channelId:string){return oneOrNone<any>(`SELECT * FROM voice_automation_rules WHERE guild_id=$1 AND creator_channel_id=$2 AND enabled=TRUE LIMIT 1`,[guildId,channelId]);}
async function sessionByChannel(guildId:string,channelId:string){return oneOrNone<any>(`SELECT * FROM temp_voice_sessions WHERE guild_id=$1 AND channel_id=$2 AND status='ACTIVE' LIMIT 1`,[guildId,channelId]);}

async function createTemporaryVoice(guild:Guild,member:GuildMember,rule:any){
  const lock=`automation:voice:create:${guild.id}:${member.id}:${rule.id}`;if(!await redis.set(lock,"1","EX",15,"NX"))return;
  const numberStyle=String(rule.number_style||"NONE").toUpperCase();
  const numberLock=numberStyle!=="NONE"?`automation:voice:number:${guild.id}:${rule.id}`:null;
  let numberLockHeld=false;
  try{
  const existing=await oneOrNone<any>(`SELECT * FROM temp_voice_sessions WHERE guild_id=$1 AND owner_id=$2 AND rule_id=$3 AND status='ACTIVE' ORDER BY created_at DESC LIMIT 1`,[guild.id,member.id,rule.id]);
  if(existing){
    const ch=await guild.channels.fetch(existing.channel_id).catch(()=>null);
    if(ch?.isVoiceBased()){await member.voice.setChannel(ch,"Reusing member temporary voice channel").catch(()=>{});return;}
    await db.query(`UPDATE temp_voice_sessions SET status='ORPHANED',deleted_at=CURRENT_TIMESTAMP WHERE id=$1`,[existing.id]);
  }

  const creator=await guild.channels.fetch(rule.creator_channel_id).catch(()=>null);
  if(!creator?.isVoiceBased())return;
  const categoryId=rule.category_id||creator.parentId||null;
  const template=String(rule.name_template||"{displayName}'s Room");
  let roomNumber:number|null=null;
  if(numberLock){
    for(let attempt=0;attempt<40&&!numberLockHeld;attempt++){
      numberLockHeld=Boolean(await redis.set(numberLock,"1","EX",30,"NX"));
      if(!numberLockHeld)await sleep(100);
    }
    if(!numberLockHeld)throw new Error("Temporary voice numbering is busy; please try joining again.");
    roomNumber=await nextRoomNumber(guild.id,String(rule.id));
  }
  let rendered=renderTemplate(template,member,undefined,roomNumber,numberStyle);
  if(roomNumber&&numberStyle!=="NONE"&&!template.includes("{number}"))rendered+=roomNumberText(roomNumber,numberStyle);
  const name=safeChannelName(rendered);
  const allowed=asArray(rule.allowed_role_ids),denied=asArray(rule.denied_role_ids);
  const permissionOverwrites=mergedOverwrites(creator,guild,member,rule,allowed,denied,false);

  const bitrateRequested=Number(rule.bitrate??384000);const bitrate=clamp(bitrateRequested||384000,8000,premiumBitrateCap(guild));
  const voice=await guild.channels.create({
    name,type:ChannelType.GuildVoice,parent:categoryId??undefined,bitrate,userLimit:clamp(Number(rule.user_limit??0),0,99),permissionOverwrites,reason:`Temporary voice channel for ${member.user.tag}`
  });
  await positionAboveAnchor(guild,voice,rule.position_above_channel_id);
  let waiting:any=null;
  if(Boolean(rule.waiting_room)){
    try{
      const waitingOverwrites=mergedOverwrites(creator,guild,member,rule,allowed,denied,true);
      waiting=await guild.channels.create({name:safeChannelName(renderTemplate(String(rule.waiting_name_template||"{displayName}'s Waiting Room"),member,undefined,roomNumber,numberStyle)),type:ChannelType.GuildVoice,parent:categoryId??undefined,bitrate,userLimit:0,permissionOverwrites:waitingOverwrites,reason:`Waiting room for ${member.user.tag}`});
      await positionAboveAnchor(guild,waiting,rule.position_above_channel_id);
    }catch(err){console.warn("[automation:voice] waiting room create failed",err);}
  }
  let linked:any=null;
  if(Boolean(rule.linked_text_channel)){
    try{
      linked=await guild.channels.create({name:textChannelName(renderTemplate(String(rule.text_name_template||"{displayName}-room"),member,undefined,roomNumber,roomNumber?"STANDARD":"NONE")),type:ChannelType.GuildText,parent:categoryId??undefined,permissionOverwrites,reason:`Linked temporary chat for ${member.user.tag}`});
      await linked.send({content:`Temporary chat for <@${member.id}>. This channel is removed when the linked voice room closes.`}).catch(()=>{});
    }catch(err){console.warn("[automation:voice] linked text channel create failed",err);}
  }
  const sessionId=randomUUID();
  try{
    await db.query(`INSERT INTO temp_voice_sessions(id,guild_id,rule_id,owner_id,channel_id,waiting_channel_id,text_channel_id,room_number,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE')`,[sessionId,guild.id,rule.id,member.id,voice.id,waiting?.id??null,linked?.id??null,roomNumber]);
    await member.voice.setChannel(voice,"Join-to-create temporary room");
    console.log(`[automation:voice] created ${voice.id} for ${member.id} from creator ${rule.creator_channel_id}`);
  }catch(err){
    await voice.delete("Rolling back failed temporary voice creation").catch(()=>{});if(waiting)await waiting.delete().catch(()=>{});if(linked)await linked.delete().catch(()=>{});throw err;
  }
  }finally{
    if(numberLock&&numberLockHeld)await redis.del(numberLock).catch(()=>{});
    await redis.del(lock).catch(()=>{});
  }
}

async function deleteSession(guild:Guild,session:any,reason:string){
  const timer=cleanupTimers.get(session.channel_id);if(timer){clearTimeout(timer);cleanupTimers.delete(session.channel_id);}
  // A music worker is a bot and intentionally does not keep a temporary room
  // alive.  Before deleting the voice channel, gracefully release any music
  // session bound to it so Lavalink/worker state cannot linger after Discord
  // removes the channel.
  const musicRoom=await oneOrNone<any>(`SELECT id FROM music_rooms WHERE guild_id=$1 AND voice_channel_id=$2 AND enabled=TRUE LIMIT 1`,[guild.id,session.channel_id]);
  if(musicRoom?.id){
    const workerId=await redis.get(keys.roomWorker(musicRoom.id)).catch(()=>null);
    if(workerId)await publishWorkerCommand(workerId,{type:"LEAVE",roomId:musicRoom.id,guildId:guild.id}).catch(()=>{});
    await redis.del(keys.roomWorker(musicRoom.id)).catch(()=>{});
    if(workerId){const lease=await redis.get(keys.workerLease(workerId)).catch(()=>null);if(lease===musicRoom.id)await redis.del(keys.workerLease(workerId)).catch(()=>{});}
    await db.query(`UPDATE music_rooms SET enabled=FALSE WHERE id=$1`,[musicRoom.id]).catch(()=>{});
  }
  const voice=await guild.channels.fetch(session.channel_id).catch(()=>null);
  if(voice&&hasHumanMembers(voice))return;
  if(voice)await voice.delete(reason).catch(()=>{});
  if(session.waiting_channel_id){const waiting=await guild.channels.fetch(session.waiting_channel_id).catch(()=>null);if(waiting)await waiting.delete(reason).catch(()=>{});}
  if(session.text_channel_id){const text=await guild.channels.fetch(session.text_channel_id).catch(()=>null);if(text)await text.delete(reason).catch(()=>{});}
  await db.query(`UPDATE temp_voice_sessions SET status='DELETED',deleted_at=CURRENT_TIMESTAMP WHERE id=$1`,[session.id]);
  console.log(`[automation:voice] deleted temporary room ${session.channel_id} (${reason})`);
}
async function scheduleDelete(guild:Guild,session:any,delaySeconds:number){
  const existing=cleanupTimers.get(session.channel_id);if(existing)clearTimeout(existing);
  await db.query(`UPDATE temp_voice_sessions SET empty_since=CURRENT_TIMESTAMP WHERE id=$1`,[session.id]).catch(()=>{});
  const timer=setTimeout(()=>void deleteSession(guild,session,"Temporary voice channel became empty"),clamp(delaySeconds,0,3600)*1000);timer.unref?.();cleanupTimers.set(session.channel_id,timer);
}
async function maybeTransferOwnership(guild:Guild,session:any,channel:any){
  if(channel.members.has(session.owner_id))return session;
  const next=channel.members.find((m:GuildMember)=>!m.user.bot);if(!next)return session;
  const rule=await oneOrNone<any>(`SELECT * FROM voice_automation_rules WHERE id=$1`,[session.rule_id]);
  if(Boolean(rule?.owner_can_manage)){
    await channel.permissionOverwrites.edit(next.id,{ViewChannel:true,Connect:true,Speak:true,ManageChannels:true,MoveMembers:true}).catch(()=>{});
    await channel.permissionOverwrites.edit(session.owner_id,{ManageChannels:null,MoveMembers:null}).catch(()=>{});
  }
  await db.query(`UPDATE temp_voice_sessions SET owner_id=$2 WHERE id=$1`,[session.id,next.id]);session.owner_id=next.id;return session;
}

async function handleVoiceState(guildId:string,oldState:VoiceState,newState:VoiceState){
  if(newState.guild.id!==guildId)return;
  if(newState.channelId&&newState.channelId!==oldState.channelId&&newState.member&&!newState.member.user.bot){
    const rule=await ruleForCreator(guildId,newState.channelId);if(rule)await createTemporaryVoice(newState.guild,newState.member,rule).catch(err=>console.error("[automation:voice] create failed",err));
  }
  const affected=new Set([oldState.channelId,newState.channelId].filter(Boolean) as string[]);
  for(const channelId of affected){
    const session=await sessionByChannel(guildId,channelId);if(!session)continue;
    const channel=await newState.guild.channels.fetch(channelId).catch(()=>null) as any;
    if(!channel){await db.query(`UPDATE temp_voice_sessions SET status='ORPHANED',deleted_at=CURRENT_TIMESTAMP WHERE id=$1`,[session.id]);continue;}
    if(hasHumanMembers(channel)){
      const t=cleanupTimers.get(channelId);if(t){clearTimeout(t);cleanupTimers.delete(channelId);}await db.query(`UPDATE temp_voice_sessions SET empty_since=NULL WHERE id=$1`,[session.id]).catch(()=>{});await maybeTransferOwnership(newState.guild,session,channel);
    }else{
      const rule=await oneOrNone<any>(`SELECT delete_delay_seconds FROM voice_automation_rules WHERE id=$1`,[session.rule_id]);await scheduleDelete(newState.guild,session,Number(rule?.delete_delay_seconds??10));
    }
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

async function reconcile(client:Client,guildId:string){
  const guild=client.guilds.cache.get(guildId)??await client.guilds.fetch(guildId).catch(()=>null);if(!guild)return;
  const sessions=await many<any>(`SELECT s.*,r.delete_delay_seconds FROM temp_voice_sessions s JOIN voice_automation_rules r ON r.id=s.rule_id WHERE s.guild_id=$1 AND s.status='ACTIVE'`,[guildId]);
  for(const session of sessions){
    const channel=await guild.channels.fetch(session.channel_id).catch(()=>null) as any;
    if(!channel){await db.query(`UPDATE temp_voice_sessions SET status='ORPHANED',deleted_at=CURRENT_TIMESTAMP WHERE id=$1`,[session.id]);continue;}
    if(!hasHumanMembers(channel))await scheduleDelete(guild,session,Number(session.delete_delay_seconds??10));
  }
  console.log(`[automation] reconciled ${sessions.length} temporary voice session(s)`);
}

export function startAutomationEngine(client:Client,guildId:string){
  client.on("voiceStateUpdate",(oldState,newState)=>void handleVoiceState(guildId,oldState,newState));
  client.on("messageCreate",message=>void handleMessage(guildId,message));
  client.on("channelDelete",channel=>void handleChannelDelete(guildId,channel));
  client.once("clientReady",()=>void reconcile(client,guildId));
}
