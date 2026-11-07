import {BANTER_VOICE,gazetteContext,seasonalVoice} from './banterKnowledge.js';
import {MessageFlags,SlashCommandBuilder,PermissionFlagsBits,type Client,type Message,type ChatInputCommandInteraction} from 'discord.js';
import {oneOrNone,db} from '@bom/db';
import {redis,reserveCounters,refundCounters,releaseLease,type CounterLimit} from '@bom/redis';
import {randomUUID} from 'node:crypto';
import {conversationOwner,registerConversationMatcher,rememberConversationReply,referencedConversationOwner} from './conversationRouter.js';
import {openAIResponse,aiGatewayStatus,aiFailureMessage} from './openai.js';

const guildId=process.env.DISCORD_GUILD_ID??'';
const model=process.env.BOM_BANTER_MODEL??process.env.OPENAI_MODEL??'gpt-4.1-mini';
const roastCommand=new SlashCommandBuilder().setName('roast').setDescription('Invite BOM Banter to roast your World of Sea Battles decisions')
  .addStringOption(o=>o.setName('topic').setDescription('What should Banter roast you about?').setRequired(false).setMaxLength(250));
const statusCommand=new SlashCommandBuilder().setName('banter-status').setDescription('Check why BOM Banter is or is not responding in this channel').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
export const banterCommands=[roastCommand,statusCommand];

type Trigger='mention'|'reply'|'spontaneous'|'roast';
type BanterSettings={enabled:boolean;spontaneous_enabled:boolean;roast_enabled:boolean;aggression:number;spontaneity:number;channel_cooldown_minutes:number;spontaneous_user_cooldown_seconds:number;minimum_participants:number;daily_spontaneous_limit:number;daily_total_limit:number;context_messages:number;spontaneous_channels:string[];excluded_channels:string[];excluded_role_ids:string[];custom_instructions:string};
const DEFAULTS:BanterSettings={enabled:true,spontaneous_enabled:false,roast_enabled:true,aggression:9,spontaneity:20,channel_cooldown_minutes:3,spontaneous_user_cooldown_seconds:30,minimum_participants:1,daily_spontaneous_limit:100,daily_total_limit:300,context_messages:12,spontaneous_channels:[],excluded_channels:[],excluded_role_ids:[],custom_instructions:''};
let cache:{until:number;value:BanterSettings}|null=null;
let apiCoolingDownUntil=0;
const debugEnabled=()=>['true','yes','1','on'].includes(String(process.env.BOM_BANTER_DEBUG??'').toLowerCase());
function diag(reason:string,details:Record<string,unknown>={}){if(debugEnabled())console.info(`[banter:trace] ${reason} ${JSON.stringify(details)}`);}
const botReference=(raw:string,botId:string)=>new RegExp(`<@!?${botId}>`,'g').test(raw);
/** Reference lookups and ship statistics belong to the source-backed Wiki, not a fictional personality. */
export function banterShouldDeferToWiki(raw:string,botId:string){
  const text=String(raw).replace(new RegExp(`<@!?${botId}>`,'g'),'').trim();
  if(/^wiki(?:\b|[:;,])/i.test(text))return true;
  if(/\b(?:build|make|construct)\b.*\b(?:nuclear bomb|atomic bomb|explosive|weapon of mass destruction)\b/i.test(text))return false;
  if(/\b(?:custom roles?|guild rules?|request a role|apply to bom|leave of absence)\b/i.test(text))return true;
  const isQuestion=/(?:\?|\b(?:what is|what's|how much|how many|how long|which|calculate|compare|show me|tell me)\b|^(?:what|which|how|can|does|do|is|are)\b)/i.test(text);
  if(!isQuestion)return false;
  return /\b(?:builds?|fittings?|unlock|quests?|skills?|ports?|trade|profit|tax|cargo|hold|weight|capacity|durability|armou?r|ship stats?|statistics|crew|speed|maneuverability|cannon|gun|range|blueprint|crafting|recipe|resources?|sell price|buy price|cost|nutrition)\b/i.test(text);
}
const jsonIds=(v:unknown)=>{try{const arr=typeof v==='string'?JSON.parse(v):v;return Array.isArray(arr)?arr.map(String):[];}catch{return [];}};
async function settings():Promise<BanterSettings>{
  if(cache&&cache.until>Date.now())return cache.value;
  const row=await oneOrNone<any>('SELECT * FROM bom_banter_settings WHERE guild_id=$1',[guildId]);
  const value=row?{...DEFAULTS,...row,spontaneous_channels:jsonIds(row.spontaneous_channels),excluded_channels:jsonIds(row.excluded_channels),excluded_role_ids:jsonIds(row.excluded_role_ids)}:DEFAULTS;
  cache={until:Date.now()+20_000,value};return value;
}
function prompt(s:BanterSettings,kind:Trigger):string{
  return `${BANTER_VOICE}${seasonalVoice()} Intensity: ${s.aggression}/10. ${kind==='roast'?'The requester volunteers to be roasted; be incisive rather than abusive.':''} ${kind==='spontaneous'?'Interrupt only when relevant; if there is no worthwhile observation return exactly SKIP.':''} Additional administrator style preferences: ${s.custom_instructions.slice(0,1200)}`;
}
function cleanOutput(raw:string){
  const x=String(raw).trim().replace(/<@!?\d+>|<@&\d+>|@everyone|@here/gi,'captain').slice(0,550);
  if(!x||/^SKIP\b/i.test(x))return null;
  return x;
}
const dateTag=()=>new Date().toISOString().slice(0,10);
const dayKey=(kind:'total'|'spontaneous')=>`banter:${guildId}:${dateTag()}:${kind}`;
async function counted(kind:Trigger,channelId:string,userId:string){
  await db.query(`INSERT INTO bom_banter_activity(guild_id,channel_id,user_id,trigger_kind) VALUES($1,$2,$3,$4)`,[guildId,channelId,userId,kind]).catch(()=>{});
}
function roleExcluded(roleIds:string[],s:BanterSettings){return roleIds.some(r=>s.excluded_role_ids.includes(r));}
function channelExcluded(channelId:string,s:BanterSettings){return s.excluded_channels.includes(channelId);}
function candidate(text:string){
  const t=text.trim();
  if(t.length<9||t.length>600||t.startsWith('/')||t.includes('```'))return false;
  // Short questions used to be rejected before any keyword test. Include
  // conversational questions as possible opportunities, but never auto-reply
  // to all of them: the opt-in chance and cooldown still apply.
  if(/[?]$/.test(t)||/^(?:why|how|what|who|where|when|which|can|could|should|does|do|did|is|are)\b/i.test(t))return true;
  if(t.length<20)return false;
  if(t.split(/\s+/).length>=4&&/[a-zA-Z]/.test(t)&&!/^https?:\/\//i.test(t))return true;
  return /\b(port battle|aruba|lost|lose|sunk|died|wrecked|ship|build|pvp|fleet|cannon|broadside|captain|loot|gold|money|expensive|noob|won|best|skill|rate|battle|sail|flag|misfits|bom|idiot|stupid|damn|fuck|oops)\b/i.test(t);
}
async function contextFor(message:Message,limit:number,s:BanterSettings){
  if(!('messages' in message.channel))return `Captain: ${message.content.slice(0,1300)}`;
  const recent=await message.channel.messages.fetch({limit:Math.min(20,Math.max(3,limit))}).catch(()=>null);
  const messages=(recent?[...recent.values()]:[]).filter(m=>!m.author.bot&&!roleExcluded(m.member?[...m.member.roles.cache.keys()]:[],s)&&m.content&&m.createdTimestamp>Date.now()-12*60_000).sort((a,b)=>a.createdTimestamp-b.createdTimestamp).slice(-limit);
  const lines=messages.map(m=>`${(m.member?.displayName??m.author.username).slice(0,45)}: ${m.content.replace(/<@!?\d+>/g,'@captain').slice(0,400)}`);
  if(!messages.some(m=>m.id===message.id))lines.push(`${(message.member?.displayName??message.author.username).slice(0,45)}: ${message.content.replace(/<@!?\d+>/g,'@captain').slice(0,400)}`);
  if(message.reference?.messageId){
    const referenced=await message.channel.messages.fetch(message.reference.messageId).catch(()=>null);
    if(await referencedConversationOwner(message)==='banter'&&referenced?.content)lines.unshift(`BOM Banter (previous reply): ${referenced.content.slice(0,250)}`);
  }
  const previous=await Promise.all((recent?[...recent.values()]:[]).filter(m=>m.author.id===message.client.user?.id&&m.content).slice(0,4).map(async m=>await redis.get(`conversation:reply:${m.id}`)==='banter'?m.content.slice(0,250):null));
  const avoid=previous.filter(Boolean).join(' | ');if(avoid)lines.push(`Avoid repeating these recent Banter lines: ${avoid}`);
  return lines.slice(-Math.max(3,limit+1)).join('\n')+`\nReply to this message from ${(message.member?.displayName??message.author.username).slice(0,45)}: ${message.content.slice(0,600)}`;
}

async function generate(settings:BanterSettings,kind:Trigger,input:string,sensitivity:'public'|'private'='private'){
  if(Date.now()<apiCoolingDownUntil)return null;
  const knowledge=await gazetteContext(input);
  const res=await openAIResponse({feature:'banter',sensitivity,model,instructions:prompt(settings,kind),input:input+knowledge,maxOutputTokens:320,timeoutMs:11_000});
  if(!res){apiCoolingDownUntil=Date.now()+15_000;return null;}
  return cleanOutput(res.text);
}
function dailyReservations(s:BanterSettings,kind:Trigger):CounterLimit[]{
  const limits=[{key:dayKey('total'),limit:s.daily_total_limit,ttlSeconds:172800}];
  if(kind==='spontaneous')limits.push({key:dayKey('spontaneous'),limit:s.daily_spontaneous_limit,ttlSeconds:172800});
  return limits;
}
async function replyToMessage(message:Message,kind:Trigger,s:BanterSettings){
  const channelId=message.channelId,userId=message.author.id,token=randomUUID();
  const lock=`banter:busy:${guildId}:${channelId}`,perUser=`banter:member:${guildId}:${userId}:${kind==='spontaneous'?'ambient':'direct'}`,channelCooldown=`banter:channel:${guildId}:${channelId}:spontaneous`;
  const limits=dailyReservations(s,kind);let reserved=false,delivered=false,userClaim=false,channelClaim=false;
  if(await redis.set(lock,token,'EX',120,'NX')!=='OK'){diag('channel_busy',{kind,channelId});return;}
  try{
    const seconds=kind==='spontaneous'?s.spontaneous_user_cooldown_seconds:8;
    if(seconds>0){userClaim=await redis.set(perUser,token,'EX',seconds,'NX')==='OK';if(!userClaim)return;}
    if(kind==='spontaneous'&&s.channel_cooldown_minutes>0){channelClaim=await redis.set(channelCooldown,token,'EX',s.channel_cooldown_minutes*60,'NX')==='OK';if(!channelClaim)return;}
    reserved=await reserveCounters(limits);
    if(!reserved){if(kind!=='spontaneous')await message.reply({content:'Banter has reached its daily reply limit.',allowedMentions:{parse:[],repliedUser:false}}).catch(()=>{});return;}
    const history=await contextFor(message,s.context_messages,s);
    const isPublic=Boolean(message.inGuild()&&(message.channel as any).permissionsFor?.(message.guild?.roles.everyone)?.has?.(PermissionFlagsBits.ViewChannel));
    const output=await generate(s,kind,history,isPublic?'public':'private');
    if(!output){diag('ai_unavailable_or_skipped',{kind,channelId});if(kind!=='spontaneous')await message.reply({content:`Banter cannot generate a reply right now. ${aiFailureMessage('banter')}`,allowedMentions:{parse:[],repliedUser:false}}).catch(()=>{});return;}
    const sent=await message.reply({content:output,allowedMentions:{parse:[],repliedUser:false}});delivered=true;
    await rememberConversationReply(sent.id,'banter').catch(()=>{});await counted(kind,channelId,userId);
    diag('reply_sent',{kind,channelId});
  }catch(error){console.warn('[banter] could not reply',error);}
  finally{
    if(!delivered){if(reserved)await refundCounters(limits.map(x=>x.key)).catch(()=>{});if(userClaim)await releaseLease(perUser,token).catch(()=>{});if(channelClaim)await releaseLease(channelCooldown,token).catch(()=>{});}
    await releaseLease(lock,token).catch(()=>{});
  }
}
export function installBanter(client:Client){
  registerConversationMatcher('banter',10,async message=>{const s=await settings();return message.guildId===guildId&&s.enabled&&!channelExcluded(message.channelId,s)&&!roleExcluded(message.member?[...message.member.roles.cache.keys()]:[],s);});
  console.info('[banter] v4.3.0 listener installed (use /banter-status to diagnose triggers)');
  client.on('messageCreate',async message=>{
    if(!message.inGuild()||message.guildId!==guildId||message.author.bot)return;
    if(!message.content.trim()){
      // An empty content value for a visible guild message can indicate the
      // Message Content privileged intent isn't authorized for the bot.
      if(message.mentions?.has?.(client.user?.id??''))diag('empty_message_content',{channelId:message.channelId});
      return;
    }
    try{
      if(await conversationOwner(message)!=='banter')return;
      const s=await settings();
      if(!s.enabled){diag('disabled',{channelId:message.channelId});return;}
      if(channelExcluded(message.channelId,s)){diag('excluded_channel',{channelId:message.channelId});return;}
      if(roleExcluded(message.member?[...message.member.roles.cache.keys()]:[],s)){diag('excluded_role',{channelId:message.channelId});return;}
      const botId=client.user?.id;if(!botId)return;
      let referenced:Message|null=null;
      if(message.reference?.messageId){
        referenced=await message.channel.messages.fetch(message.reference.messageId).catch(()=>null);
        if(referenced?.author.id===botId&&await referencedConversationOwner(message)!=='banter'){diag('wiki_reply',{channelId:message.channelId});return;}
      }
      const mentioned=Boolean(message.mentions.has(botId)||botReference(message.content,botId));
      if(mentioned&&banterShouldDeferToWiki(message.content,botId)){diag('routed_to_wiki',{channelId:message.channelId});return;}
      const direct:Trigger|null=mentioned?'mention':referenced?.author.id===botId&&await referencedConversationOwner(message)==='banter'?'reply':null;
      if(direct){diag('direct_trigger',{kind:direct,channelId:message.channelId});await replyToMessage(message,direct,s);return;}
      if(!s.spontaneous_enabled){diag('spontaneous_disabled',{channelId:message.channelId});return;}
      if(!s.spontaneous_channels.includes(message.channelId)){diag('spontaneous_channel_not_selected',{channelId:message.channelId});return;}
      if(s.spontaneity<=0||!candidate(message.content)){diag('not_a_candidate',{channelId:message.channelId});return;}
      if(Math.random()*100>=s.spontaneity){diag('chance_not_selected',{channelId:message.channelId});return;}
      // Ensure there's an ongoing multi-person discussion rather than replying
      // to the first message in an otherwise silent channel.
      const recent='messages' in message.channel?await message.channel.messages.fetch({limit:8}).catch(()=>null):null;
      const participants=new Set((recent?[...recent.values()]:[]).filter(m=>!m.author.bot&&!roleExcluded(m.member?[...m.member.roles.cache.keys()]:[],s)&&m.createdTimestamp>Date.now()-8*60_000).map(m=>m.author.id));
      if(participants.size<s.minimum_participants){diag('not_enough_participants',{channelId:message.channelId,count:participants.size});return;}
      await replyToMessage(message,'spontaneous',s);
    }catch(err){console.warn('[banter] listener failed',err);}
  });
}
export async function handleRoast(interaction:ChatInputCommandInteraction){
  if(interaction.commandName!=='roast')return false;
  if(interaction.guildId!==guildId)return true;
  await interaction.deferReply();
  const key=`banter:roast:${guildId}:${interaction.user.id}`,token=randomUUID();let claimed=false,reserved=false,delivered=false;let limits:CounterLimit[]=[];
  try{
    const s=await settings();
    const rawRoles=(interaction.member as any)?.roles;
    const roleIds:string[]=Array.isArray(rawRoles)?rawRoles.map(String):[...(rawRoles?.cache?.keys?.()??[])];
    if(!s.enabled||!s.roast_enabled||channelExcluded(interaction.channelId,s)||roleExcluded(roleIds,s)){await interaction.editReply('Banter Roast Mode is disabled here.');return true;}
    claimed=await redis.set(key,token,'EX',120,'NX')==='OK';
    if(!claimed){await interaction.editReply('You got roasted recently. Give the wreckage a minute to cool.');return true;}
    limits=dailyReservations(s,'roast');reserved=await reserveCounters(limits);
    if(!reserved){await interaction.editReply('The roast budget is exhausted for today.');return true;}
    const topic=interaction.options.getString('topic')?.trim()||'My terrible decisions as a captain.';
    const text=await generate(s,'roast',`The person voluntarily requested a roast about themselves. Their chosen topic: ${topic}`);
    if(!text){await interaction.editReply(`The insult department is temporarily offline. ${aiFailureMessage('banter')}`);return true;}
    const sent=await interaction.editReply({content:text,allowedMentions:{parse:[]}});delivered=true;
    await rememberConversationReply(sent.id,'banter').catch(()=>{});await counted('roast',interaction.channelId,interaction.user.id);
  }catch(error){console.warn('[banter] roast failed',error);await interaction.editReply('The roast cannon jammed. Please try again.').catch(()=>{});}
  finally{if(!delivered){if(claimed)await releaseLease(key,token).catch(()=>{});if(reserved)await refundCounters(limits.map(x=>x.key)).catch(()=>{});}}
  return true;
}

/** Give Admiralty a concrete reason why Banter is silent without logging message contents. */
export async function handleBanterStatus(interaction:ChatInputCommandInteraction){
  if(interaction.commandName!=='banter-status')return false;
  if(!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)){
    await interaction.reply({content:'Only server managers can check Banter diagnostics.',flags:MessageFlags.Ephemeral});return true;
  }
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  try{
    const s=await settings();
    const total=Number(await redis.get(dayKey('total'))??0);
    const spontaneous=Number(await redis.get(dayKey('spontaneous'))??0);
    const issues:string[]=[];
    if(!s.enabled)issues.push('Banter is disabled in Administration → BOM Banter.');
    const gateway=await aiGatewayStatus();
    if(!gateway)issues.push('AI Gateway API is unreachable.');
    const banterRoute=gateway?.routes?.find?.((x:any)=>x.feature==='banter');
    if(gateway?.availability&&!gateway.availability.available)issues.push(`Banter route: ${gateway.availability.reason}.`);
    if(banterRoute&&!banterRoute.enabled)issues.push('Banter AI route is disabled.');
    if(gateway?.rateLimiterAvailable===false)issues.push('AI rate limiter is unavailable.');
    if(gateway&&!Object.values(gateway.providers??{}).some((x:any)=>x?.configured))issues.push('No AI API provider key configured.');
    if(apiCoolingDownUntil>Date.now())issues.push(`AI call backoff active for ${Math.ceil((apiCoolingDownUntil-Date.now())/1000)} more seconds.`);
    if(channelExcluded(interaction.channelId,s))issues.push('This channel is excluded.');
    if(!s.spontaneous_enabled)issues.push('Spontaneous replies are OFF. Enable them in Administration → BOM Banter.');
    if(!s.spontaneous_channels.includes(interaction.channelId))issues.push('This channel is not in the spontaneous channel list.');
    if(!s.spontaneity)issues.push('Spontaneous chance is 0%.');
    if(total>=s.daily_total_limit)issues.push('Daily total reply limit reached.');
    if(spontaneous>=s.daily_spontaneous_limit)issues.push('Daily spontaneous reply limit reached.');
    const text=[
      '**BOM Banter diagnostics**',
      `Banter: **${s.enabled?'ON':'OFF'}** · AI gateway: **${gateway?'reachable':'unreachable'}** · Groq: **${gateway?.providers?.groq?.configured?'configured':'not configured'}** · Gemini: **${gateway?.providers?.gemini?.configured?'configured':'not configured'}**`,
      `Mention/reply mode: **${s.enabled&&!channelExcluded(interaction.channelId,s)?'eligible':'restricted'}**`,
      `Spontaneous mode: **${s.spontaneous_enabled?'ON':'OFF'}** · This channel: **${s.spontaneous_channels.includes(interaction.channelId)?'selected':'not selected'}**`,
      `Participants: **${s.minimum_participants}** · Member cooldown: **${s.spontaneous_user_cooldown_seconds}s**\nChance: **${s.spontaneity}%** · Channel cooldown: **${s.channel_cooldown_minutes} min** · Today's replies: **${total}/${s.daily_total_limit}** (spontaneous ${spontaneous}/${s.daily_spontaneous_limit})`,
      issues.length?`**Things to check:**\n${issues.map(x=>`• ${x}`).join('\n')}`:'**Basic configuration looks ready.** If it remains silent, test /roast and check the controller logs for `[ai-gateway]` and `[banter]`.',
      'Game-stat questions addressed to the bot go to the source-backed Wiki. Normal chat questions only trigger spontaneous Banter in approved channels, by chance. If mentions are never detected, check Discord Message Content intent and bot channel permissions.'
    ].join('\n');
    await interaction.editReply({content:text.slice(0,1900)});
  }catch(err){console.warn('[banter] status failed',err);await interaction.editReply({content:'Banter diagnostics could not read their settings or live state. Check the controller log.'}).catch(()=>{});}
  return true;
}

/** Let the Wiki own source-backed factual requests and explicit Wiki commands. */
export async function banterOwnsMention(message:Message){
  if(!message.inGuild()||message.guildId!==guildId||!message.content)return false;
  if(banterShouldDeferToWiki(message.content,String(message.client.user?.id??'')))return false;
  const s=await settings();
  return s.enabled&&!channelExcluded(message.channelId,s)&&!roleExcluded(message.member?[...message.member.roles.cache.keys()]:[],s);
}
