import {handleEventDonationRequests} from './eventDonationRequests.js';
import {ensureEventTrophyEmojis} from './eventEmojis.js';
import {handleEventDonations} from './eventDonations.js';
import {installDashboardRoleAudit} from './dashboardRoleAudit.js';
import {installEventTool,notifyEventMessage} from './eventTool.js';
import {handlePreferredShips,remindPreferredShips} from './preferredShips.js';
import {musicTrace} from './musicDiagnostics.js';
import {installDmMuteControls} from './dmDelivery.js';
import {sendBotDm} from './dmDelivery.js';
import {installGameHubNotifications} from './gameHubNotifications.js';
import {deliverBattleCancellations} from './pbCancellation.js';
import {selectDraftShips,detailedSignupBody} from './pbSignupDraft.js';
import {installMisfitAssistant} from './misfitAssistant.js';
import {correctionStatement,factualCorrection} from './assistantIntent.js';
import {maintainDeskOrderForChannel,refreshMembershipSurfaces} from './membership.js';
import {applyMisfitBranding} from './misfitBranding.js';
import {ensurePBEmojis} from './pbEmojis.js';
import {legacyPanel,signupPanel,rosterPanel,indexPanel,schedulePanel,schedulePanels,pbRow,pbButton,pbLink,samePBPanel} from './pbPresentation.js';
import {fetchPBMessage,upsertPBMessage,removeLegacyFleetPanels} from './pbMessages.js';
import {ensureBattleArtwork} from './pbArtwork.js';
import {handleLegacyPBControls} from './pbControls.js';
import {editInteractionReply,deferInteractionReply,discordErrorSummary} from './interactionReply.js';
import {installCommunity} from './community.js';
import {installPBInvitations} from './pbInvitations.js';
import {conversationOwner,registerConversationMatcher,rememberConversationReply} from './conversationRouter.js';
import {installSentinelCollector,sentinelAsk,sentinelGatewayIntents,sentinelRecord} from "./sentinel.js";
import {
  Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder,
  MessageFlags, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder
} from "discord.js";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import sharp from "sharp";
import { many, oneOrNone, db, pool } from "@bom/db";
import { redis, keys, enqueue, dequeue, dequeueByRequestId, queueItems, getRoomState, publishWorkerCommand, setRoomState, streamTailId } from "@bom/redis";
import { FILTER_PRESETS, SkipMode, tr, type MusicPermission, type QueueItem, type WorkerEvent } from "@bom/shared";
import type { RoomRow } from "./types.js";
import { allocateWorker, releaseWorker, renewRoomLease, quarantineWorker } from "./allocator.js";
import { publicRoomPanel, privatePanel, simpleEphemeral, modalAdd, liveLyricsPanel, filterPanel } from "./ui.js";
import { classify } from "./requests.js";
import { recommend } from "./recommend.js";
import { startEphemeralJanitor, trackEphemeral, renewEphemeral, renewEphemeralByMessage, expireEphemeralNow, editEphemeral, getEphemeral } from "./ephemeral.js";
import { enrichTrack } from "./metadata.js";
import { audit, checkpointRoom, featureSettings, maybeStationId, metric, recordWorkerHealth, roomFeatureSettings, smartRecommendation } from "./platform.js";
import { startAutomationEngine } from "./automation.js";
import {feedbackCommands,handleFeedbackCommand,handleFeedbackAdminCommand,handleFeedbackInteraction,startFeedbackAutomation} from "./feedback.js";
import {membershipCommands,installMembership,handleMembershipInteraction} from "./membership.js";
import {recruitmentCommands,installRecruitment,handleRecruitmentInteraction} from "./recruitment.js";
import {canDiscordDm} from './notifications.js';
import {banterCommands,installBanter,handleRoast,handleBanterStatus,banterOwnsMention,banterShouldDeferToWiki} from './banter.js';
// A rejected background promise (Discord event handler, timer, cache refresh) must not take
// the whole service down; the supervisor restart would drop every in-flight request.
process.on("unhandledRejection",reason=>{console.error("[controller] unhandled promise rejection",reason);});

const token=process.env.DISCORD_BOT_TOKEN, clientId=process.env.DISCORD_CLIENT_ID, guildId=process.env.DISCORD_GUILD_ID;
if(!token||!clientId||!guildId)throw new Error("DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID and DISCORD_GUILD_ID are required");
const dashboardAdminRoleId=(process.env.DASHBOARD_ADMIN_ROLE_ID??"").trim();
const voiceBitrateTarget=Math.max(8000,Math.min(384000,Number(process.env.VOICE_BITRATE_TARGET??384000)));
const enforceVoiceBitrate=(process.env.ENFORCE_VOICE_CHANNEL_BITRATE??"true").toLowerCase()!=="false";
const client=new Client({intents:sentinelGatewayIntents(),partials:[Partials.Channel,Partials.Message,Partials.Reaction,Partials.User,Partials.GuildMember]});
client.on("error",err=>console.error("[discord] controller client error",err));
client.on("warn",message=>console.warn("[discord] controller warning",message));
// Blocking XREAD calls must never share the general Redis connection.
// A blocked stream read on the shared socket was queueing lease/state commands
// behind it for up to 5 seconds at a time and compounding across controller loops.
const controllerCommandRedis=redis.duplicate();
const workerEventRedis=redis.duplicate();

function diag(tag:string,message:string,details:Record<string,unknown>={}){console.log(`[${tag}] ${message} ${JSON.stringify(details)}`);}
function diagDebug(tag:string,message:string,details:Record<string,unknown>={}){console.debug(`[${tag}] ${message} ${JSON.stringify(details)}`);}
function diagWarn(tag:string,message:string,details:Record<string,unknown>={}){console.warn(`[${tag}] ${message} ${JSON.stringify(details)}`);}
function safeQuery(value:unknown){const raw=String(value??"").replace(/\s+/g," ").trim();if(!raw)return undefined;try{const u=new URL(raw);return `${u.protocol}//${u.host}${u.pathname}`.slice(0,180);}catch{return raw.slice(0,180);}}

installDmMuteControls(client);
installSentinelCollector(client);
installDashboardRoleAudit(client,guildId!);
installEventTool(client,guildId!);
installMembership(client,{afterDeskMove:async(channelId:string)=>{const rooms=await many<RoomRow>('SELECT * FROM music_rooms WHERE guild_id=$1 AND text_channel_id=$2',[guildId,channelId]);for(const room of rooms)await refreshPanel(room,true);}});
installCommunity(client);
installPBInvitations(client,async(interaction,battleId)=>{
 const [detail,prefs,cat,config]=await Promise.all([wosbApi(`/port-battles/${battleId}`,interaction.user.id),wosbApi('/pb-preferences',interaction.user.id),wosbApi('/catalogue',interaction.user.id),wosbApi('/pb-config',interaction.user.id)]);
 const rate=String(detail.battle.rate),profile=prefs?.rates?.[rate]??{},valid=new Set((cat.ships??[]).filter((s:any)=>String(s.rate??s.level)===rate&&(!Array.isArray(config.preferredShipCatalog?.[rate])||config.preferredShipCatalog[rate].includes(s.name))).map((s:any)=>String(s.name))),ships=(profile.ships??[]).filter((s:string)=>valid.has(s)),preferred=(profile.preferred??[]).filter((s:string)=>ships.includes(s));
 if(!ships.length||!preferred.length){await remindPreferredShips(interaction.user,pbDashboardUrl());throw new Error('preferred_ships_missing');}
 await wosbApi(`/port-battles/${battleId}/signup`,interaction.user.id,{method:'POST',body:JSON.stringify({displayName:interaction.member?.displayName??interaction.user.globalName??interaction.user.username,status:'ATTENDING',onlyIfAbsent:true,ships,preferredShips:preferred,hornCapable:Boolean(prefs.horn_capable&&prefs.horn_requirements_ack),hornPreferred:Boolean(prefs.horn_preferred&&prefs.horn_capable&&prefs.horn_requirements_ack)})});
});

installRecruitment(client);
installGameHubNotifications(client,guildId!);
installBanter(client);
installMisfitAssistant(client,wosbApi,()=>syncPortBattleDiscord(true));
const commands=[
  new SlashCommandBuilder().setName("ask").setDescription("Ask Sentinel about recorded server actions").addStringOption(o=>o.setName("question").setDescription("Your audit question").setRequired(true)),
  new SlashCommandBuilder().setName("wiki").setDescription("Ask the World of Sea Battles Wiki or publish a correction")
    .addSubcommand(sc=>sc.setName("ask").setDescription("Ask a World of Sea Battles question").addStringOption(o=>o.setName("question").setDescription("What do you want to know or calculate?").setRequired(true)))
    .addSubcommand(sc=>sc.setName("search").setDescription("Search the Wiki").addStringOption(o=>o.setName("query").setDescription("Ship, item, port, skill, mine, weapon, etc.").setRequired(true)))
    .addSubcommand(sc=>sc.setName("teach").setDescription("Publish a confirmed Wiki correction (Wiki editors only)").addStringOption(o=>o.setName("correction").setDescription("Example: Beam needs 120 wood per unit, not 100").setRequired(true))),
  new SlashCommandBuilder().setName("pb").setDescription("Open active BOM Port Battle signups"),
  new SlashCommandBuilder().setName("pb-admin").setDescription("Configure and refresh Port Battle Discord panels")
    .addSubcommand(sc=>sc.setName("setup").setDescription("Configure the Port Battle signup, roster and schedule channels")
      .addChannelOption(o=>o.setName("signup_channel").setDescription("Channel for player signup cards").setRequired(true).addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement))
      .addChannelOption(o=>o.setName("roster_channel").setDescription("Channel for confirmed roster cards").setRequired(true).addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement))
      .addChannelOption(o=>o.setName("schedule_channel").setDescription("Channel for the central Port Battle schedule").setRequired(true).addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement))
      .addRoleOption(o=>o.setName("manager_role").setDescription("Role allowed to manage Port Battles").setRequired(true))
      .addRoleOption(o=>o.setName("signup_role").setDescription("Optional role allowed to sign up").setRequired(false)))
    .addSubcommand(sc=>sc.setName("refresh").setDescription("Rebuild all active Port Battle Discord panels now")),
  new SlashCommandBuilder().setName("play").setDescription("Play a song in your voice channel")
    .addStringOption(o=>o.setName("song").setDescription("Song name, artist, or a link").setRequired(true)),
  new SlashCommandBuilder().setName("music").setDescription("Music controls for your voice channel")
    .addSubcommand(sc=>sc.setName("controls").setDescription("Open your private music controls"))
    .addSubcommand(sc=>sc.setName("nowplaying").setDescription("Show what's playing"))
    .addSubcommand(sc=>sc.setName("queue").setDescription("Show the queue"))
    .addSubcommand(sc=>sc.setName("skip").setDescription("Skip the current song (or vote to skip)"))
    .addSubcommand(sc=>sc.setName("pause").setDescription("Pause or resume"))
    .addSubcommand(sc=>sc.setName("stop").setDescription("Stop music, clear the queue and disconnect the bot"))
    .addSubcommand(sc=>sc.setName("volume").setDescription("Set the volume").addIntegerOption(o=>o.setName("level").setDescription("0-150 (100 is normal)").setRequired(true).setMinValue(0).setMaxValue(150))),
  new SlashCommandBuilder().setName("music-admin").setDescription("Open music administration"),
  ...feedbackCommands,
  ...membershipCommands,
  ...recruitmentCommands,
  ...banterCommands
].map(x=>x.toJSON());

async function syncCommands(){ const rest=new REST({version:"10"}).setToken(token!); await rest.put(Routes.applicationGuildCommands(clientId!,guildId!),{body:commands}); }
async function wikiApi(path:string,userId:string,init:RequestInit={}){
  const base=(process.env.INTERNAL_API_URL??"http://127.0.0.1:4100").replace(/\/$/,"");
  const headers=new Headers(init.headers);headers.set("x-internal-token",process.env.INTERNAL_API_TOKEN??"");headers.set("x-discord-user-id",userId);if(init.body&&!headers.has("content-type"))headers.set("content-type","application/json");
  const r=await fetch(`${base}/v1/wiki${path}`,{...init,headers,signal:AbortSignal.timeout(120_000)});const text=await r.text();let body:any={};try{body=text?JSON.parse(text):{};}catch{body={error:text||`HTTP ${r.status}`};}if(!r.ok)throw Object.assign(new Error(body?.message??body?.error??`Wiki request failed (${r.status})`),{status:r.status,body});return body;
}
function wikiScenarioTable(data:any){const rows=data?.scenarioTable;if(!Array.isArray(rows)||!rows.length)return "";const f=(v:any)=>Number(v).toLocaleString(undefined,{maximumFractionDigits:2});return `\n\n**Nearby sale prices**\n${rows.slice(0,4).map((r:any)=>`• ${f(r.salePrice)} → ${f(r.afterTax)} after tax → **${f(r.profitPerUnit)}** profit/unit${Number(data?.quantity??1)!==1?` · ${f(r.totalProfit)} total`:""}`).join("\n")}`;}
const wikiPassiveCooldown=new Map<string,number>();
let wikiConversationSettingsCache:{expires:number;enabled:boolean;channels:string[];cooldown:number}|null=null;
function wikiAnswerTitle(intent:string){const x=String(intent??'');if(x==='economics.profit')return 'Trade calculation';if(x.startsWith('history.'))return 'What changed';if(x==='compare')return 'Comparison';if(x==='reverse_lookup')return 'Wiki lookup';if(x==='constraint_search')return 'Filtered results';if(x.startsWith('builder.'))return 'Build guidance';if(x.startsWith('transport.'))return 'Transport information';if(x.startsWith('ship.'))return 'Ship information';if(x.startsWith('weapon.'))return 'Weapon information';return 'BOM Wiki';}
function wikiCompactTable(data:any){const rows=data?.scenarioTable;if(Array.isArray(rows)&&rows.length){const f=(v:any)=>Number(v).toLocaleString(undefined,{maximumFractionDigits:2});return `**Nearby sale prices**\n${rows.slice(0,4).map((r:any)=>`• ${f(r.salePrice)} → **${f(r.profitPerUnit)}** profit/unit${Number(data?.quantity??1)!==1?` · ${f(r.totalProfit)} total`:''}`).join('\n')}`;}const cmp=data?.comparison;if(Array.isArray(cmp?.entities)&&Array.isArray(cmp?.fields)&&cmp.entities.length>1){const lines=cmp.fields.slice(0,8).map((f:any)=>{const vals=cmp.entities.map((e:any)=>`${e.name}: ${String(e.values?.[f.path]??'—')}`).join(' · ');return `• **${f.label??f.path}** — ${vals}`;});return lines.length?`**Comparison**\n${lines.join('\n')}`:'';}const changes=data?.changes;if(Array.isArray(changes)&&changes.length)return `**Recorded changes**\n${changes.slice(0,8).map((c:any)=>`• **${c.label??c.field}**: ${String(c.old??'—')} → ${String(c.new??'—')}`).join('\n')}`;return '';}
function wikiComponents(x:any,question?:string){const body:any[]=[{type:10,content:`### ${wikiAnswerTitle(x?.intent)}`}];if(question)body.push({type:10,content:`-# ${String(question).slice(0,300)}`});body.push({type:10,content:String(x?.answer??'I could not produce an answer.').slice(0,3900)});const sourceNames=[...new Set((Array.isArray(x?.sources)?x.sources:[]).map((source:any)=>String(source?.name??'').trim()).filter(Boolean))];if(sourceNames.length&&x?.confidence==='confirmed')body.push({type:10,content:`-# Sources: ${sourceNames.slice(0,3).join(' · ')}`});const table=wikiCompactTable(x?.data);if(table){body.push({type:14,divider:true,spacing:1});body.push({type:10,content:table.slice(0,3900)});}if(Array.isArray(x?.suggestions)&&x.suggestions.length){body.push({type:14,divider:true,spacing:1});body.push({type:10,content:`**Useful follow-ups**\n${x.suggestions.slice(0,4).map((v:string)=>`• ${v}`).join('\n')}`});}const actions:any[]=[];if(x?.answerId){actions.push({type:2,style:2,label:'Suggest correction',custom_id:`wiki:correct:${x.answerId}`});actions.push({type:2,style:2,label:'Share',custom_id:`wiki:share:${x.answerId}`});}const dash=(process.env.PUBLIC_DASHBOARD_URL??'').replace(/\/$/,'');if(dash)actions.push({type:2,style:5,label:'Open Wiki',url:`${dash}/dashboard/wiki`});if(actions.length)body.push({type:1,components:actions.slice(0,5)});return [{type:17,accent_color:x?.confidence==='unknown'?0x6B7280:0xD6A83A,components:body}] as any;}
function wikiCorrectionModal(answerId:string){const input=new TextInputBuilder().setCustomId('suggestion').setLabel('What should the Wiki say instead?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(2000).setPlaceholder('Example: The current value is 145, not 150.');const row=new ActionRowBuilder<TextInputBuilder>().addComponents(input);return new ModalBuilder().setCustomId(`wiki:correctmodal:${answerId}`).setTitle('Suggest a Wiki correction').addComponents(row);}
function findWikiAnswerId(message:any){try{const raw=(message.components??[]).map((x:any)=>typeof x?.toJSON==='function'?x.toJSON():x);let found:string|null=null;const walk=(v:any)=>{if(found||v==null)return;if(Array.isArray(v)){for(const x of v)walk(x);return;}if(typeof v!=='object')return;const id=String(v.custom_id??v.customId??'');const m=id.match(/^wiki:(?:correct|share):([0-9a-f-]{20,40})$/i);if(m){found=m[1];return;}for(const x of Object.values(v))walk(x);};walk(raw);return found;}catch{return null;}}
function isCasualWikiAck(text:string){return /^(?:thanks?|thank you|ty|thx|got it|cool|nice|ok(?:ay)?|perfect|awesome)[!. ]*$/i.test(text.trim());}
function looksLikeWikiCorrection(text:string){const q=text.trim();if(q.length<3||isCasualWikiAck(q))return false;if(/\b(?:wrong|incorrect|correction|not right|outdated|old info|update this|wiki is wrong)\b/i.test(q))return true;if(/[?]/.test(q))return false;if(/\b(?:actually|should be|isn't|is not)\b/i.test(q)||/^(?:no|nah|not quite)\b/i.test(q))return true;return /\b(?:is|are|costs?|requires?|needs?|uses?|gives?|has|have|changed to|was changed to|now has|now is)\b/i.test(q)&&/\d|%|gold|wood|iron|ship|cannon|mortar|lantern|crew|rate|range|reload|speed|armor|hold|discount/i.test(q);}
async function wikiConversationSettings(){if(wikiConversationSettingsCache&&wikiConversationSettingsCache.expires>Date.now())return wikiConversationSettingsCache;try{const row=await oneOrNone<any>(`SELECT passive_qa_enabled,passive_qa_channel_ids,passive_reply_cooldown_seconds FROM wiki_settings WHERE guild_id=$1`,[guildId]);let ids:any=row?.passive_qa_channel_ids??[];if(typeof ids==='string')try{ids=JSON.parse(ids);}catch{ids=[];}wikiConversationSettingsCache={expires:Date.now()+15_000,enabled:Boolean(row?.passive_qa_enabled),channels:Array.isArray(ids)?ids.map(String):[],cooldown:Math.max(5,Number(row?.passive_reply_cooldown_seconds??20))};return wikiConversationSettingsCache;}catch{return {expires:Date.now()+5_000,enabled:false,channels:[] as string[],cooldown:20};}}
function wikiQuestionCandidate(text:string){const q=text.trim();return q.length>=4&&q.length<=1800&&(/[?]/.test(q)||/^(?:who|what|when|where|why|how|which|can|does|do|did|is|are|should|show|list|compare|calculate|tell me)\b/i.test(q));}
async function queueWikiCorrection(message:any,answerId:string,suggestion:string,surface='discord-reply'){const x=await wikiApi('/feedback',String(message.author.id),{method:'POST',body:JSON.stringify({answerId,suggestion,surface,sourceMessageId:String(message.id),sourceChannelId:String(message.channelId)})});await message.reply({content:x?.message??'Thanks — I queued that correction for moderator review. The Wiki has not changed yet.',allowedMentions:{repliedUser:false,parse:[]}});}
/** A @no explanation is feedback about intent, not a brand-new game topic.
 * Discord role mentions arrive as <@&id>; the plain @no form also works.
 * Try a revised, source-backed lookup before demanding a message link. */
function wikiNoExplanation(raw:string,message:any){const id=raw.match(/<@&(\d{15,22})>/)?.[1];return correctionStatement(raw,id?message.guild?.roles?.cache?.get(id)?.name:undefined);}
let askChannelCache:{until:number;channel:string|null}|null=null;
registerConversationMatcher('wiki',250,async message=>{
 if(message.guildId!==guildId)return false;
 const raw=String(message.content??'').trim(),botId=client.user?.id??'';
 const mention=Boolean(botId&&(message.mentions?.users?.has?.(botId)||raw.includes(`<@${botId}>`)||raw.includes(`<@!${botId}>`)));
 if(wikiNoExplanation(raw,message))return true;
 if(!askChannelCache||askChannelCache.until<Date.now()){const c=await oneOrNone<any>('SELECT ask_enabled,ask_channel_id FROM community_settings WHERE guild_id=$1',[guildId]);askChannelCache={until:Date.now()+15000,channel:c?.ask_enabled?c.ask_channel_id:null};}
 if(askChannelCache.channel===message.channelId)return false;
 if(mention&&/\b(?:custom roles?|guild rules?|server rules?|trade rules?|trade access|apply to bom|join bom|request a role)\b/i.test(raw))return false;
 if(mention&&(banterShouldDeferToWiki(raw,botId)||!await banterOwnsMention(message)))return true;
 if(mention)return false;
 const s=await wikiConversationSettings();return s.enabled&&s.channels.includes(String(message.channelId))&&wikiQuestionCandidate(raw);
});
async function maybeWikiConversationReply(message:any){
 if(message.author?.bot||message.guildId!==guildId||await conversationOwner(message)!=='wiki')return;
 const raw=String(message.content??'').trim();if(!raw)return;
 let answerId:string|null=null;
 if(message.reference?.messageId){
   const referenced=message.channel?.messages?.cache?.get?.(message.reference.messageId)??await message.channel?.messages?.fetch?.(message.reference.messageId).catch(()=>null);
   if(referenced?.author?.id===client.user?.id)answerId=findWikiAnswerId(referenced);
 }
 const noExplanation=wikiNoExplanation(raw,message);
 if(noExplanation){
   try{
     if(factualCorrection(noExplanation)){
       const payload={statement:noExplanation,answerId,askAnswerMessageId:message.reference?.messageId,sourceMessageId:message.id,sourceChannelId:message.channelId};
       let x:any;try{x=await wikiApi('/teach',message.author.id,{method:'POST',body:JSON.stringify(payload)});}catch(e:any){if(e.status!==403)throw e;x=await wikiApi('/feedback',message.author.id,{method:'POST',body:JSON.stringify({...payload,suggestion:noExplanation,surface:'discord-no-correction'})});}
       const label=x.patch?`${String(x.patch.entityKey).replace(/^\w+:/,'').replaceAll('_',' ')} · ${x.patch.fieldPath} = ${JSON.stringify(x.patch.value)}`:'';
       const sent=await message.reply({content:x.status==='applied'?`Updated the Wiki: **${label}**. Future answers will use this correction.`:x.message,allowedMentions:{parse:[],repliedUser:false}});await rememberConversationReply(sent.id,'wiki');return;
     }
     // Intent feedback retries lookup without changing facts.
     const corrected=await wikiApi('/ask',String(message.author.id),{method:'POST',headers:{'x-bom-context-scope':`discord:${message.channelId}`},body:JSON.stringify({question:noExplanation,surface:'discord-clarification'})});
     if(corrected?.confidence==='confirmed'){
       await message.reply({flags:MessageFlags.IsComponentsV2|MessageFlags.SuppressNotifications,components:wikiComponents(corrected,noExplanation),allowedMentions:{repliedUser:false,parse:[]}});
       return;
     }
     if(answerId){await queueWikiCorrection(message,answerId,noExplanation,'discord-intent-feedback');return;}
     await message.reply({content:'I understand that you are clarifying the question, not supplying a new fact. Please reply directly to the specific Wiki answer or name the ship and statistic you want.',allowedMentions:{repliedUser:false,parse:[]}});
   }catch(e){console.warn('[wiki] clarification lookup failed',e);await message.reply({content:'I could not check that clarification just now. Please try again.',allowedMentions:{repliedUser:false,parse:[]}}).catch(()=>{});}
   return;
 }
 if(answerId&&looksLikeWikiCorrection(raw)){
   try{await queueWikiCorrection(message,answerId,raw);return;}catch(e){console.warn('[wiki] reply correction queue failed',e);return;}
 }
 if(answerId&&isCasualWikiAck(raw))return;
 const botId=client.user?.id??'';
 const mentioned=Boolean(botId&&(message.mentions?.users?.has?.(botId)||new RegExp(`<@!?${botId}>`).test(raw)));
 const replyFollowup=Boolean(answerId);
 let settings={enabled:false,channels:[] as string[],cooldown:20},proactive=false;
 if(!mentioned&&!replyFollowup){settings=await wikiConversationSettings();proactive=settings.enabled&&settings.channels.includes(String(message.channelId));}
 if(!mentioned&&!replyFollowup&&!proactive)return;
 if(!mentioned&&!replyFollowup&&!wikiQuestionCandidate(raw))return;
 const channel:any=message.channel;if(!mentioned&&!replyFollowup&&channel?.isVoiceBased?.())return;
 let q=raw;if(mentioned&&botId)q=q.replace(new RegExp(`<@!?${botId}>`,'g'),'').trim();if(!q)return;
 const key=String(message.channelId),last=wikiPassiveCooldown.get(key)??0;
 if(proactive&&!mentioned&&!replyFollowup&&Date.now()-last<settings.cooldown*1000)return;
 if(proactive&&!mentioned&&!replyFollowup)wikiPassiveCooldown.set(key,Date.now());
 try{
   const x=await wikiApi('/ask',String(message.author.id),{method:'POST',headers:{'x-bom-context-scope':`discord:${message.channelId}`},body:JSON.stringify({question:q,surface:mentioned?'discord-mention':replyFollowup?'discord-reply':'discord-passive'})});
   if(proactive&&!mentioned&&!replyFollowup&&x?.confidence!=='confirmed')return;
   wikiPassiveCooldown.set(key,Date.now());
   const sent=await message.reply({flags:MessageFlags.IsComponentsV2|MessageFlags.SuppressNotifications,components:wikiComponents(x,q),allowedMentions:{repliedUser:false,parse:[]}});await rememberConversationReply(sent.id,'wiki').catch(()=>{});
 }catch(e){
   if(mentioned||replyFollowup)await message.reply({content:'I could not reach the Wiki just now. Please try again in a moment.',allowedMentions:{repliedUser:false,parse:[]}}).catch(()=>{});
   else console.warn('[wiki] passive answer failed',e);
 }
}
async function handleWiki(interaction:any){
  const sub=interaction.options.getSubcommand();
  if(sub==="teach"){
    if(!hasDashboardAdmin(interaction))return void await ephem(interaction,simpleEphemeral("Permission denied","Only Wiki editors can publish direct corrections. Members can suggest corrections from Wiki answers."));
    const correction=interaction.options.getString("correction",true);await deferInteractionReply(interaction,{flags:MessageFlags.Ephemeral});
    try{const x=await wikiApi("/teach",interaction.user.id,{method:"POST",body:JSON.stringify({statement:correction})});const msg=x.status==="applied"?`Wiki correction published for **${String(x.patch.entityKey).replace(/^\w+:/,'').replaceAll('_',' ')}**. Future answers will use the confirmed value.`:x.message;return void await editInteractionReply(interaction,{content:msg,allowedMentions:{parse:[]}});}catch(err:any){console.warn('[wiki] correction publish failed',err);return void await editInteractionReply(interaction,{content:`I couldn't publish that Wiki correction just now. Please try again, or review it from Wiki Studio.`,allowedMentions:{parse:[]}});}
  }
  await deferInteractionReply(interaction,{flags:sub==="ask"?MessageFlags.IsComponentsV2:sub==="search"?MessageFlags.Ephemeral:undefined});
  try{
    if(sub==="ask"){const q=interaction.options.getString("question",true);const x=await wikiApi("/ask",interaction.user.id,{method:"POST",headers:{"x-bom-context-scope":`discord:${interaction.channelId}`},body:JSON.stringify({question:q,surface:"discord-slash"})});return void await editInteractionReply(interaction,{components:wikiComponents(x,q),allowedMentions:{parse:[]}});}
    if(sub==="search"){const q=interaction.options.getString("query",true);const x=await wikiApi(`/search?q=${encodeURIComponent(q)}`,interaction.user.id);const lines=(x.results??[]).slice(0,20).map((r:any)=>`• **${r.name}** — ${String(r.kind).replaceAll("_"," ")}`);return void await editInteractionReply(interaction,{content:lines.length?lines.join("\n"):"No matching Wiki entries found.",allowedMentions:{parse:[]}});}
  }catch(err:any){return void await editInteractionReply(interaction,{content:`Wiki request failed: ${String(err?.message??err).slice(0,1700)}`,allowedMentions:{parse:[]}});}
}

async function wosbApi(path:string,userId:string,init:RequestInit={}){
  const base=(process.env.INTERNAL_API_URL??"http://127.0.0.1:4100").replace(/\/$/,"");
  const headers=new Headers(init.headers);headers.set("x-internal-token",process.env.INTERNAL_API_TOKEN??"");headers.set("x-discord-user-id",userId);if(init.body&&!headers.has("content-type"))headers.set("content-type","application/json");
  const r=await fetch(`${base}/v1/wosb${path}`,{...init,headers,signal:AbortSignal.timeout(15_000)});const text=await r.text();let body:any={};try{body=text?JSON.parse(text):{};}catch{body={error:text||`HTTP ${r.status}`};}if(!r.ok)throw Object.assign(new Error(body?.message??body?.error??`WoSB request failed (${r.status})`),{status:r.status,body});return body;
}
const pbDraftKey=(battleId:string,userId:string)=>`pb:signup-draft:${guildId}:${battleId}:${userId}`;
function ordinalRate(r:any){const n=Number(r);return n?`${n}${n===1?'st':n===2?'nd':n===3?'rd':'th'} Rate`:'Rate TBD';}
function pbDate(v:any){if(!v)return 'Time to be set';const d=new Date(v);return `<t:${Math.floor(d.getTime()/1000)}:F> · <t:${Math.floor(d.getTime()/1000)}:R>`;}
// A link-button row into the dashboard, or nothing when no public URL is set.
function dashboardLinkRow(label:string,path:string):any[]{const base=(process.env.PUBLIC_DASHBOARD_URL??'').replace(/\/$/,'');return base?[{type:1,components:[{type:2,style:5,label,url:base+path}]}]:[];}
function pbComponents(detail:any,userId:string){
 const b=detail?.battle??{},signups=Array.isArray(detail?.signups)?detail.signups:[];
 return signupPanel(b,signups,{...pbLegacyOptions(),banner:pbStaticArt('signup'),rows:pbSignupRows(b)}).components as any;
}
async function firstOpenBattle(userId:string){const battles=await wosbApi('/port-battles',userId);const active=(Array.isArray(battles)?battles:[]).filter((b:any)=>b.status==='OPEN').sort((a:any,b:any)=>(Date.parse(a.starts_at||'2999-01-01')-Date.parse(b.starts_at||'2999-01-01')));if(!active.length)return null;return wosbApi(`/port-battles/${active[0].id}`,userId);}
async function handlePb(interaction:any){await deferInteractionReply(interaction,{flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});try{const detail=await firstOpenBattle(interaction.user.id);if(!detail)return void await editInteractionReply(interaction,{components:[{type:17,accent_color:0x6B7280,components:[{type:10,content:'### Port Battles'},{type:10,content:'There are no open Port Battle signups right now.'}]},...dashboardLinkRow('See all battles','/dashboard/port-battles')] as any});return void await editInteractionReply(interaction,{components:[...pbComponents(detail,interaction.user.id),...dashboardLinkRow('Open in dashboard',`/dashboard/port-battles?battle=${detail?.battle?.id??''}`)]});}catch(err:any){return void await editInteractionReply(interaction,{components:[{type:17,accent_color:0x9F4A3E,components:[{type:10,content:'### Port Battles unavailable'},{type:10,content:String(err?.message??err).slice(0,1800)}]}] as any});}}
async function pbQuick(interaction:any,battleId:string,status:'ATTENDING'|'LATE'|'WAITLIST',lateMinutes=0){const [detail,prefs]=await Promise.all([wosbApi(`/port-battles/${battleId}`,interaction.user.id),wosbApi('/pb-preferences',interaction.user.id).catch(()=>({rates:{},horn_preferred:false}))]),self=(detail.signups??[]).find((x:any)=>String(x.user_id)===String(interaction.user.id)),profile=prefs?.rates?.[String(detail?.battle?.rate)]??{},ships=self?.ships?.length?self.ships:(profile.ships??[]),preferred=self?.preferred_ships?.length?self.preferred_ships:(profile.preferred??[]);await wosbApi(`/port-battles/${battleId}/signup`,interaction.user.id,{method:'POST',body:JSON.stringify({displayName:interaction.member?.displayName??interaction.user.globalName??interaction.user.username,status,ships,preferredShips:preferred,hornCapable:self?.horn_capable??Boolean(prefs?.horn_capable&&prefs?.horn_requirements_ack),hornPreferred:self?.horn_preferred??Boolean(prefs?.horn_preferred&&prefs?.horn_capable&&prefs?.horn_requirements_ack),flareCapabilities:self?.flare_capabilities??[],lateMinutes})});const detailAfter=await wosbApi(`/port-battles/${battleId}`,interaction.user.id);void syncPortBattleDiscord(true).catch(error=>console.warn('[port-battle] signup refresh failed',error));return detailAfter;}
function pbLateModal(battleId:string){const input=new TextInputBuilder().setCustomId('minutes').setLabel('How many minutes late?').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(1).setMaxLength(4).setPlaceholder('15');return new ModalBuilder().setCustomId(`pb:latemodal:${battleId}`).setTitle('Running Late').addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));}
async function pbDetailed(interaction:any,battleId:string){await deferInteractionReply(interaction,{flags:MessageFlags.Ephemeral});const [detail,cat,prefs]=await Promise.all([wosbApi(`/port-battles/${battleId}`,interaction.user.id),wosbApi('/catalogue',interaction.user.id),wosbApi('/pb-preferences',interaction.user.id).catch(()=>({rates:{}}))]);const b=detail.battle,ships=(cat.ships??[]).filter((s:any)=>Number(s.rate??s.level)===Number(b.rate)).map((s:any)=>String(s.name)).sort().slice(0,25),self=(detail.signups??[]).find((x:any)=>String(x.user_id)===String(interaction.user.id)),profile=prefs?.rates?.[String(b.rate)]??{},selected=(self?.ships?.length?self.ships:(profile.ships??[])).filter((x:string)=>ships.includes(x)),preferred=self?.preferred_ships?.length?self.preferred_ships:(profile.preferred??[]).filter((x:string)=>selected.includes(x));if(!ships.length)return void await editInteractionReply(interaction,{content:'No ship catalogue is configured for this battle rate yet.'});await redis.set(pbDraftKey(battleId,interaction.user.id),JSON.stringify({ships:selected,preferred,status:self?.signup_status??'ATTENDING',lateMinutes:self?.late_minutes??0,hornPreferred:self?.horn_preferred??false}),'EX',900);const menu=new StringSelectMenuBuilder().setCustomId(`pb:ships:${battleId}`).setPlaceholder('Select all ships you can play').setMinValues(1).setMaxValues(ships.length).addOptions(ships.map((name:string)=>({label:name,value:name,default:selected.includes(name)})));return void await editInteractionReply(interaction,{content:`**Battle of ${b.port_name} — Detailed Signup**\nSelect every ship you can play. Saved Preferred Ships are preselected when available.`,components:[new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)]});}
async function pbPreferredPrompt(interaction:any,battleId:string,ships:string[]){await interaction.deferUpdate();const raw=await redis.get(pbDraftKey(battleId,interaction.user.id));if(!raw)return void await editInteractionReply(interaction,{content:'Your signup session expired. Press Detailed Signup again.',components:[]});await redis.set(pbDraftKey(battleId,interaction.user.id),JSON.stringify(selectDraftShips(JSON.parse(raw),ships)),'EX',900);const menu=new StringSelectMenuBuilder().setCustomId(`pb:preferred:${battleId}`).setPlaceholder('Preferred ships — choose up to two').setMinValues(1).setMaxValues(Math.min(2,ships.length)).addOptions(ships.map(name=>({label:name,value:name})));const skip=new ButtonBuilder().setCustomId(`pb:nopref:${battleId}`).setLabel('No preferred ships').setStyle(ButtonStyle.Secondary);return editInteractionReply(interaction,{content:'Now mark up to **two preferred ships**, or choose **No preferred ships**.',components:[new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),new ActionRowBuilder<ButtonBuilder>().addComponents(skip)]});}
async function pbHornPrompt(interaction:any,battleId:string,preferred:string[]){await interaction.deferUpdate();const raw=await redis.get(pbDraftKey(battleId,interaction.user.id));if(!raw)return void await editInteractionReply(interaction,{content:'Your signup session expired. Press Detailed Signup again.',components:[]});const draft=JSON.parse(raw);draft.preferred=preferred;await redis.set(pbDraftKey(battleId,interaction.user.id),JSON.stringify(draft),'EX',900);const yes=new ButtonBuilder().setCustomId(`pb:hornyes:${battleId}`).setLabel('I can play Horn').setStyle(ButtonStyle.Success),no=new ButtonBuilder().setCustomId(`pb:hornno:${battleId}`).setLabel('I cannot play Horn').setStyle(ButtonStyle.Secondary);return editInteractionReply(interaction,{content:'Last step: **Can you play Horn?**',components:[new ActionRowBuilder<ButtonBuilder>().addComponents(yes,no)]});}
async function pbFlarePrompt(interaction:any,battleId:string,hornCapable:boolean){
 await interaction.deferUpdate();const raw=await redis.get(pbDraftKey(battleId,interaction.user.id));if(!raw)return void await editInteractionReply(interaction,{content:'Your signup session expired. Press Detailed Signup again.',components:[]});const draft=JSON.parse(raw);draft.hornCapable=hornCapable;await redis.set(pbDraftKey(battleId,interaction.user.id),JSON.stringify(draft),'EX',900);
 const select=new StringSelectMenuBuilder().setCustomId(`pb:flares:${battleId}`).setPlaceholder('Flare duties you can handle').setMinValues(1).setMaxValues(3).addOptions(['Red Flare','Gold Flare','Blue Flare'].map(v=>({label:v,value:v})));
 const skip=new ButtonBuilder().setCustomId(`pb:noflares:${battleId}`).setLabel('No flare duties').setStyle(ButtonStyle.Secondary);
 return void await editInteractionReply(interaction,{content:'**Signal Flare Duties:** Select every color you can handle, or choose No flare duties. Admiralty makes the final assignment.',components:[new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),new ActionRowBuilder<ButtonBuilder>().addComponents(skip)]});
}
async function pbFinishDetailed(interaction:any,battleId:string,flareCapabilities:string[]){
 await interaction.deferUpdate();const raw=await redis.get(pbDraftKey(battleId,interaction.user.id));if(!raw)return void await editInteractionReply(interaction,{content:'This detailed signup expired. Press **Detailed Signup** again.',components:[]});const draft=JSON.parse(raw),flares=flareCapabilities.filter(x=>['Red Flare','Gold Flare','Blue Flare'].includes(x));
 await wosbApi(`/port-battles/${battleId}/signup`,interaction.user.id,{method:'POST',body:JSON.stringify(detailedSignupBody(draft,flares,interaction.member?.displayName??interaction.user.globalName??interaction.user.username))});
 await redis.del(pbDraftKey(battleId,interaction.user.id));void syncPortBattleDiscord(true).catch(error=>console.warn('[port-battle] detailed signup refresh failed',error));return void await editInteractionReply(interaction,{content:`Signup saved for **${(draft.ships??[]).join(', ')}**${(draft.preferred??[]).length?` · Preferred: ${(draft.preferred??[]).join(', ')}`:''} · Horn: **${draft.hornCapable?'Yes':'No'}** · Flares: **${flares.join(', ')||'None'}**.`,components:[]});
}


type PbDiscordSettings={guild_catalog?:any;schedule_message_ids?:any;duty_emojis?:any;guild_id:string;signup_channel_id:string|null;roster_channel_id:string|null;schedule_channel_id:string|null;manager_role_id:string|null;signup_role_id:string|null;schedule_message_id:string|null;signup_landing_message_id:string|null;signup_index_message_id:string|null;roster_landing_message_id:string|null;roster_index_message_id:string|null;enabled:boolean};
const PB_GOLD=0xD6A83A;
function pbDashboardUrl(){return (process.env.PUBLIC_DASHBOARD_URL??'').replace(/\/$/,'');}
async function pbSettings(){return oneOrNone<PbDiscordSettings>(`SELECT * FROM pb_discord_settings WHERE guild_id=$1`,[guildId]);}
async function handlePbAdmin(interaction:any){
  if(!hasDashboardAdmin(interaction)&&!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild))return void await interaction.reply({flags:MessageFlags.Ephemeral,content:'You need Manage Server or the dashboard administrator role to configure Port Battles.'});
  const sub=interaction.options.getSubcommand();
  await deferInteractionReply(interaction,{flags:MessageFlags.Ephemeral});
  if(sub==='setup'){
    const signup=interaction.options.getChannel('signup_channel',true),roster=interaction.options.getChannel('roster_channel',true),schedule=interaction.options.getChannel('schedule_channel',true),manager=interaction.options.getRole('manager_role',true),signupRole=interaction.options.getRole('signup_role',false);
    await db.query(`INSERT INTO pb_discord_settings(guild_id,signup_channel_id,roster_channel_id,schedule_channel_id,manager_role_id,signup_role_id,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(guild_id) DO UPDATE SET signup_channel_id=EXCLUDED.signup_channel_id,roster_channel_id=EXCLUDED.roster_channel_id,schedule_channel_id=EXCLUDED.schedule_channel_id,manager_role_id=EXCLUDED.manager_role_id,signup_role_id=EXCLUDED.signup_role_id,enabled=TRUE,updated_by=EXCLUDED.updated_by,updated_at=CURRENT_TIMESTAMP`,[guildId,signup.id,roster.id,schedule.id,manager.id,signupRole?.id??null,interaction.user.id]);
    await syncPortBattleDiscord(true);
    return void await editInteractionReply(interaction,`Port Battles configured. Signup: <#${signup.id}> · Roster: <#${roster.id}> · Schedule: <#${schedule.id}> · Managers: <@&${manager.id}>${signupRole?` · Signup role: <@&${signupRole.id}>`:''}.`);
  }
  await syncPortBattleDiscord(true);
  return void await editInteractionReply(interaction,'Port Battle schedule, signup cards and rosters refreshed.');
}
function pbStaticArt(kind:'signup'|'schedule'|'officers'='signup'){const base=pbDashboardUrl();if(!base)return null;const file=kind==='schedule'?'pb-schedule-banner.png':kind==='officers'?'pb-officers-banner.png':'pb-signups-banner.png';return `${base}/wosb/pb/${file}`;}
function pbMessageUrl(channelId:string,messageId:string){return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;}
async function pbTextChannel(id:string|null){if(!id)return null;const ch=await client.channels.fetch(id).catch(()=>null);return ch?.isTextBased()&&'messages' in ch?ch as any:null;}
const pbFetchMessage=fetchPBMessage;
async function pbUpsertMessage(channel:any,messageId:string|null,payload:any,key?:string){return upsertPBMessage(channel,messageId,payload,key,client.user?.id);}
async function pbSurfaceMessage(channel:any,messageId:string|null,payload:any,{pin=false,bottom=false,label='BOM Port Battle panel'}={}){let existing=await pbFetchMessage(channel,messageId);if(existing&&bottom&&existing.pinned)await existing.unpin('Soft-sticky navigation').catch(()=>{});if(existing&&bottom){const newer=await channel.messages.fetch({after:String(existing.id),limit:25}).catch(()=>null);const shouldMove=newer?.some?.((m:any)=>!m.system&&String(m.id)!==String(existing.id));if(shouldMove){if(existing.pinned)await existing.unpin(`Repositioning ${label}`).catch(()=>{});try{await existing.delete();existing=null;}catch(err:any){if(Number(err?.code)===10008)existing=null;else throw err;}}}if(existing){try{if(!samePBPanel(existing,payload))await existing.edit(payload.flags===32768?{...payload,content:null,embeds:[]}:payload);if(existing.pinned)await existing.unpin('BOM panels use bottom placement').catch(()=>{});return existing;}catch(err:any){if(Number(err?.code)!==10008)throw err;existing=null;}}const msg=await channel.send(payload);return msg;}
async function pbDeleteSurface(channel:any,messageId:string|null){
 if(!messageId)return;
 if(!channel)throw new Error(`Cannot delete PB message ${messageId}: channel unavailable`);
 const msg=await pbFetchMessage(channel,messageId);
 if(!msg)return; // Discord 10008 or message already removed.
 try{
  if(msg.pinned)await msg.unpin('Removing obsolete BOM Port Battle panel').catch((err:any)=>diagWarn('port-battle','unable to unpin before deletion',{messageId,error:String(err)}));
  await msg.delete();
  if(pbResetCleanupReport)pbResetCleanupReport.deleted++;
 }catch(err:any){if(Number(err?.code)===10008)return;notePbCleanupFailure('surface deletion',messageId,err);throw err;}
}
// Retired records retain their message IDs so we can remove old Discord cards.
// We only clear pointers after both channels were successfully cleaned.
let pbLastOrphanScanAt=0;
let pbResetCleanupReport:{deleted:number;errors:string[]}|null=null;
function notePbCleanupFailure(stage:string,messageId:string,error:any){
 const detail=`${stage}: ${messageId}: ${JSON.stringify(discordErrorSummary(error))}`.slice(0,280);
 if(pbResetCleanupReport)pbResetCleanupReport.errors.push(detail);
 console.warn('[port-battle] cleanup failed',{stage,messageId,error:discordErrorSummary(error)});
}
async function removeObsoletePbDiscordCards(signupChannel:any,rosterChannel:any,active:any[]){
 let retiredDeleted=0,orphanDeleted=0;
 const inactive=await many<any>(`SELECT id,status,discord_signup_message_id,discord_signup_channel_id,discord_roster_message_id,discord_roster_channel_id FROM pb_battles WHERE guild_id=$1 AND status NOT IN ('OPEN','CLOSED') AND (discord_signup_message_id IS NOT NULL OR discord_roster_message_id IS NOT NULL) ORDER BY updated_at DESC LIMIT 300`,[guildId]);
 for(const battle of inactive){
  let clean=true;
  for(const [id,channelId,fallback] of [[battle.discord_signup_message_id,battle.discord_signup_channel_id,signupChannel],[battle.discord_roster_message_id,battle.discord_roster_channel_id,rosterChannel]] as const){
   if(!id)continue;
   const ch=channelId&&String(channelId)!==String(fallback.id)?await pbTextChannel(String(channelId)):fallback;
   if(!ch){clean=false;continue;}
   try{const msg=await pbFetchMessage(ch,String(id));if(msg){if(msg.pinned)await msg.unpin('Removing cancelled/finished Port Battle').catch(()=>{});await msg.delete();retiredDeleted++;if(pbResetCleanupReport)pbResetCleanupReport.deleted++;}}
   catch(err){clean=false;notePbCleanupFailure('retired battle '+battle.id,String(id),err);}
  }
  if(clean)await db.query(`UPDATE pb_battles SET discord_signup_message_id=NULL,discord_roster_message_id=NULL,discord_signup_channel_id=NULL,discord_roster_channel_id=NULL,last_discord_sync_at=CURRENT_TIMESTAMP WHERE id=$1 AND status NOT IN ('OPEN','CLOSED')`,[battle.id]);
 }
 // Clean older duplicate V2 signup cards whose message IDs are no longer stored.
 // Inspect the bot's own interactive signup cards only; never delete unrelated
 // messages or cards belonging to another bot.
 if(retiredDeleted)console.info('[port-battle] removed retired signup/roster panels',{count:retiredDeleted,records:inactive.length});
 if(Date.now()-pbLastOrphanScanAt<300_000)return;
 pbLastOrphanScanAt=Date.now();
 const activeIds=new Set(active.map(x=>String(x.id)));
 try{
  const recent=await signupChannel.messages.fetch({limit:100});
  for(const msg of recent.values()){
   if(String(msg.author?.id)!==String(client.user?.id))continue;
   const identifiers:string[]=[];
   const walk=(items:any[])=>{for(const item of items??[]){const id=String(item?.customId??item?.custom_id??item?.data?.custom_id??'');const match=/^pb:(?:auto|attending|late|waitlist|detailed|leave|mine):([0-9a-f-]{36})$/i.exec(id);if(match)identifiers.push(match[1]);walk(item?.components??item?.data?.components??[]);}};
   walk(msg.components??[]);
   if(!identifiers.length||identifiers.some(id=>activeIds.has(id)))continue;
   try{await msg.delete();orphanDeleted++;if(pbResetCleanupReport)pbResetCleanupReport.deleted++;}catch(err){notePbCleanupFailure('orphan signup card',String(msg.id),err);}
  }
 }catch(err){console.warn('[port-battle] orphan card scan failed',discordErrorSummary(err));}
 if(orphanDeleted)console.info('[port-battle] removed orphan signup panels',{count:orphanDeleted});
}
// Emergency reset can also find cards from hard-deleted DB records, including
// the older ComponentsV2 roster panels which have no signup buttons.
// Scan recent messages in the configured PB channels only and never delete
// a message posted by another bot, nor any tracked live index or schedule panel.
async function scanEmergencyPbPanels(){
 const settings=await pbSettings();
 if(!settings)return;
 let scheduleIds:any=settings.schedule_message_ids??[];
 if(typeof scheduleIds==='string'){try{scheduleIds=JSON.parse(scheduleIds);}catch{scheduleIds=[];}}
 const protectedIds=new Set<string>([
  settings.signup_index_message_id,settings.roster_index_message_id,
  settings.signup_landing_message_id,settings.roster_landing_message_id,
  settings.schedule_message_id,...(Array.isArray(scheduleIds)?scheduleIds:[])
 ].filter(Boolean).map(String));
 const currentlyActive=await many<any>(`SELECT id,port_name FROM pb_battles WHERE guild_id=$1 AND status IN('OPEN','CLOSED')`,[guildId]);
 const activeIds=new Set(currentlyActive.map((b:any)=>String(b.id)));
 const activePortNames=new Set(currentlyActive.map((b:any)=>String(b.port_name).trim().toLowerCase()));
 for(const [channelId,kind] of [[settings.signup_channel_id,'signup'],[settings.roster_channel_id,'roster'],[settings.schedule_channel_id,'schedule']] as const){
  if(!channelId)continue;
  const channel=await pbTextChannel(String(channelId));
  if(!channel){notePbCleanupFailure('channel unavailable',String(channelId),'No message access');continue;}
  let before:string|undefined;
  try{
   for(let page=0;page<20;page++){
    const batch=await channel.messages.fetch(before?{limit:100,before}:{limit:100});
    if(!batch?.size)break;
    for(const msg of batch.values()){
     if(String(msg.author?.id)!==String(client.user?.id)||protectedIds.has(String(msg.id)))continue;
     const raw=JSON.stringify({content:msg.content,embeds:msg.embeds?.map((e:any)=>e.toJSON?.()??e),components:msg.components?.map((c:any)=>c.toJSON?.()??c)});
     const ids=[...raw.matchAll(/pb:(?:auto|attending|late|waitlist|detailed|leave|mine|panel):(?:signup:|roster:)?([0-9a-f-]{36})/ig)].map(m=>m[1]);
     if(ids.some(id=>activeIds.has(id)))continue;
     const battleTitle=/##\s*Battle of\s+([^\\"\n]+?)(?:\s+—\s+(?:Signups|Cancelled)|\\n|\")/i.exec(raw);
     const heading=String(battleTitle?.[1]??'').trim().toLowerCase();
     if(heading&&activePortNames.has(heading))continue;
     // A missing DB battle may have left orphan V2 cards. Only remove cards
     // with unmistakable PB signatures in the configured PB channels.
     const isBattleCard=kind!=='schedule'&&(ids.length>0||
       (raw.includes('## Battle of ')&&(/Signups|ROSTER|Waitlist|Roster preserved|Cancelled/i.test(raw))));
     const isOldSchedule=kind==='schedule'&&(/## Port Battle Schedule|Port Battle Schedule & Signups/.test(raw));
     if(!isBattleCard&&!isOldSchedule)continue;
     try{if(msg.pinned)await msg.unpin('Removing obsolete fleet panel').catch(()=>{});await msg.delete();if(pbResetCleanupReport)pbResetCleanupReport.deleted++;}
     catch(err){notePbCleanupFailure('stale '+kind+' panel',String(msg.id),err);}
    }
    before=String(batch.last()?.id??'');
    if(page===19&&batch.size===100)notePbCleanupFailure('scan truncated',String(channelId),new Error('The 2,000-message safety limit was reached; older cards may remain.'));
    if(batch.size<100||!before)break;
   }
  }catch(error){notePbCleanupFailure('scan '+kind,String(channelId),error);}
 }
}

async function processPbEmergencyReset(){
 if(!client.isReady())return false;
 // Recover a job left RUNNING by a process crash.
 await db.query(`UPDATE pb_reset_jobs SET status='QUEUED',updated_at=NOW() WHERE guild_id=$1 AND status='RUNNING' AND updated_at<NOW()-INTERVAL '4 minutes'`,[guildId]);
 const job=await oneOrNone<any>(`UPDATE pb_reset_jobs SET status='RUNNING',updated_at=NOW() WHERE id=(SELECT id FROM pb_reset_jobs WHERE guild_id=$1 AND status='QUEUED' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`,[guildId]);
 if(!job)return false;
 pbResetCleanupReport={deleted:0,errors:[]};
 try{
  pbLastOrphanScanAt=0;
  await syncPortBattleDiscord(true); // Remove stored cards, update empty indexes.
  await scanEmergencyPbPanels(); // Handle orphaned cards from hard-deleted records.
  await syncPortBattleDiscord(true); // Return indexes to bottom if messages were removed.
  const report=pbResetCleanupReport;
  const status=report?.errors.length?'PARTIAL':'COMPLETED';
  await db.query(`UPDATE pb_reset_jobs SET status=$2,removed_discord_messages=$3,cleanup_errors=$4::jsonb,updated_at=NOW(),completed_at=NOW() WHERE id=$1`,[job.id,status,report?.deleted??0,JSON.stringify(report?.errors??[])]);
  console.info('[port-battle] emergency reset completed',{jobId:job.id,affectedBattles:Array.isArray(job.affected_battles)?job.affected_battles.length:0,removedMessages:report?.deleted??0,status,errors:report?.errors.length??0});
 }catch(error){
  const report=pbResetCleanupReport;
  const message=String(error instanceof Error?error.message:error).slice(0,280);
  await db.query(`UPDATE pb_reset_jobs SET status='PARTIAL',removed_discord_messages=$2,cleanup_errors=$3::jsonb,updated_at=NOW(),completed_at=NOW() WHERE id=$1`,[job.id,report?.deleted??0,JSON.stringify([...(report?.errors??[]),message])]).catch(()=>{});
  console.warn('[port-battle] emergency reset partially completed',{jobId:job.id,error:message});
 }finally{pbResetCleanupReport=null;}
 return true;
}
const pbCleanedRosterChannels=new Set<string>();
let pbSyncPromise:Promise<void>|null=null;
let pbResyncRequested=false;
function pbLegacyOptions(page=0){const base=pbDashboardUrl();return {base,guildId:guildId!,page,thumbnail:base?`${base}/wosb/pb/bom-logo.png`:null};}
function pbSignupRows(b:any){if(b.status!=='OPEN')return [];return [pbRow(pbButton('1-Click Signup',`pb:auto:${b.id}`,3)),pbRow(pbButton('Running Late',`pb:late:${b.id}`,1),pbButton('Waitlist',`pb:waitlist:${b.id}`),pbButton('Detailed Signup',`pb:detailed:${b.id}`)),pbRow(pbButton('Leave / Clear My Ships',`pb:leave:${b.id}`,4),pbButton('View My Signup',`pb:mine:${b.id}`))];}
async function pbManagerAllowed(i:any){if(hasDashboardAdmin(i))return true;const cfg=await pbSettings();const roles=Array.isArray(i.member?.roles)?i.member.roles:[...(i.member?.roles?.cache?.keys?.()??[])];return Boolean(cfg?.manager_role_id&&roles.includes(String(cfg.manager_role_id)));}
async function pbPanelForUser(kind:string,id:string,page:number,uid:string){const o=pbLegacyOptions(page);if(['signup','roster'].includes(kind)){const detail=await wosbApi(`/port-battles/${id}`,uid),cfg=await pbSettings(),guilds=typeof cfg?.guild_catalog==='string'?JSON.parse(cfg.guild_catalog):cfg?.guild_catalog??[];const art=await ensureBattleArtwork(detail.battle,guilds,o.base);detail.signups=await pbLiveNames(detail.signups??[]);return kind==='signup'?signupPanel(detail.battle,detail.signups,{...o,banner:art,rows:pbSignupRows(detail.battle)}):rosterPanel(detail.battle,detail.signups,{...o,banner:art});}const all=await wosbApi('/port-battles',uid),active=(Array.isArray(all)?all:[]).filter((b:any)=>['OPEN','CLOSED'].includes(b.status));return kind==='schedule'?schedulePanel(active,{...o,banner:pbStaticArt('schedule')}):indexPanel(active,{...o,banner:kind==='index'?pbStaticArt('signup'):null},kind==='rosterindex'?'roster':'signup');}
// Display current guild identity and membership rather than stale signup snapshots.
const pbMemberLookupAt=new Map<string,number>();
async function pbLiveNames(signups:any[]){
 const guild=client.guilds.cache.get(guildId!);if(!guild)return signups;
 const cfg=await oneOrNone<any>('SELECT member_role_id,bom2_member_role_id FROM membership_settings WHERE guild_id=$1',[guildId]).catch(()=>null);
 const ids=[...new Set(signups.map((s:any)=>String(s.user_id??'')).filter((id:string)=>/^\d{15,22}$/.test(id)&&!guild.members.cache.has(id)&&Date.now()-(pbMemberLookupAt.get(id)??0)>300000))].slice(0,25);
 if(ids.length){for(const id of ids)pbMemberLookupAt.set(id,Date.now());await guild.members.fetch({user:ids,time:5000}).catch(()=>null);}
 return signups.map((row:any)=>{const member=row.user_id?guild.members.cache.get(String(row.user_id)):null;if(!member)return row;const bom=cfg?.member_role_id&&member.roles.cache.has(String(cfg.member_role_id)),bom2=cfg?.bom2_member_role_id&&member.roles.cache.has(String(cfg.bom2_member_role_id));let name=member.displayName;if(bom||bom2){name=name.replace(/^(?:\s*\[(?:bom(?:\s*2)?)\]\s*)+/i,'').trim();name=`[${bom?'BOM':'BoM 2'}] ${name}`;}return {...row,display_name:name};});
}
async function syncPortBattleDiscordInner(force=false){
 if(!client.isReady())return;const settings=await pbSettings().catch(()=>null);if(!settings?.enabled||!settings.signup_channel_id||!settings.roster_channel_id||!settings.schedule_channel_id)return;
 const [signupChannel,rosterChannel,scheduleChannel]=await Promise.all([pbTextChannel(settings.signup_channel_id),pbTextChannel(settings.roster_channel_id),pbTextChannel(settings.schedule_channel_id)]);if(!signupChannel||!rosterChannel||!scheduleChannel)return;
 if(!pbCleanedRosterChannels.has(rosterChannel.id)){await removeLegacyFleetPanels(rosterChannel,client.user!.id);pbCleanedRosterChannels.add(rosterChannel.id);}
 // Only live battles receive signup/roster cards. Recent cancellations and finished
 // battles must NEVER get republished by the periodic Discord sweep.
 const battles=await many<any>(`SELECT * FROM pb_battles WHERE guild_id=$1 AND status IN ('OPEN','CLOSED') ORDER BY COALESCE(starts_at,'infinity'::timestamptz),created_at`,[guildId]);
 await removeObsoletePbDiscordCards(signupChannel,rosterChannel,battles);
 // The original Python layout has one bottom index, not an extra pinned signup introduction.
 if(settings.signup_landing_message_id){await pbDeleteSurface(signupChannel,settings.signup_landing_message_id);await db.query('UPDATE pb_discord_settings SET signup_landing_message_id=NULL WHERE guild_id=$1',[guildId]);}
 const active:any[]=[],guilds=typeof settings.guild_catalog==='string'?JSON.parse(settings.guild_catalog):settings.guild_catalog??[],o={...pbLegacyOptions(),guilds,dutyEmojis:await ensurePBEmojis(client,guildId!,settings)};
 for(const b of battles){try{const stillLive=await oneOrNone<any>(`SELECT status FROM pb_battles WHERE guild_id=$1 AND id=$2`,[guildId,b.id]);if(!['OPEN','CLOSED'].includes(String(stillLive?.status)))continue;const signups=await pbLiveNames(await many<any>('SELECT * FROM pb_signups WHERE battle_id=$1 ORDER BY created_at',[b.id]));const art=await ensureBattleArtwork(b,guilds,o.base);
  const sm=await pbUpsertMessage(signupChannel,b.discord_signup_message_id,signupPanel(b,signups,{...o,banner:art,rows:pbSignupRows(b)}),`signup:${b.id}`);
  await db.query('UPDATE pb_battles SET discord_signup_channel_id=$2,discord_signup_message_id=$3 WHERE id=$1',[b.id,signupChannel.id,sm.id]);
  const rm=await pbUpsertMessage(rosterChannel,b.discord_roster_message_id,rosterPanel(b,signups,{...o,banner:art}),`roster:${b.id}`);
  await db.query(`UPDATE pb_battles SET discord_channel_id=$2,discord_signup_channel_id=$2,discord_signup_message_id=$3,discord_roster_channel_id=$4,discord_roster_message_id=$5,last_discord_sync_at=CURRENT_TIMESTAMP WHERE id=$1`,[b.id,signupChannel.id,sm.id,rosterChannel.id,rm.id]);Object.assign(b,{discord_signup_message_id:sm.id,discord_signup_channel_id:signupChannel.id,discord_roster_message_id:rm.id,discord_roster_channel_id:rosterChannel.id,confirmed_count:signups.filter(s=>s.confirmed_ship).length});
  }catch(error){console.warn('[port-battle] battle panel refresh failed',{battleId:b.id,port:b.port_name,error:discordErrorSummary(error)});}
  if(['OPEN','CLOSED'].includes(b.status))active.push(b);
 }
 const signupIndex=await pbSurfaceMessage(signupChannel,settings.signup_index_message_id,indexPanel(active,{...o,banner:pbStaticArt('signup')}),{bottom:true,label:'Active Port Battle Signups'});if(signupIndex.id!==settings.signup_index_message_id)await db.query('UPDATE pb_discord_settings SET signup_index_message_id=$2 WHERE guild_id=$1',[guildId,signupIndex.id]);
 const rosterIndex=await pbSurfaceMessage(rosterChannel,settings.roster_index_message_id,indexPanel(active,o,'roster'),{bottom:true,label:'Rosters Index'});if(rosterIndex.id!==settings.roster_index_message_id)await db.query('UPDATE pb_discord_settings SET roster_index_message_id=$2 WHERE guild_id=$1',[guildId,rosterIndex.id]);
 if(settings.roster_landing_message_id){await pbDeleteSurface(rosterChannel,settings.roster_landing_message_id);await db.query('UPDATE pb_discord_settings SET roster_landing_message_id=NULL WHERE guild_id=$1',[guildId]);}
 const pages=schedulePanels(active,{...o,banner:pbStaticArt('schedule'),thumbnail:null});let stored:any=settings.schedule_message_ids??[];if(typeof stored==='string')stored=JSON.parse(stored);if(!Array.isArray(stored))stored=[];if(!stored.length&&settings.schedule_message_id)stored=[settings.schedule_message_id];const ids:string[]=[];
 for(let page=0;page<pages.length;page++){const message=await pbUpsertMessage(scheduleChannel,stored[page]??null,pages[page],`schedule:${guildId}:${page}`);ids.push(message.id);await db.query('UPDATE pb_discord_settings SET schedule_message_id=$2,schedule_message_ids=$3::jsonb WHERE guild_id=$1',[guildId,ids[0],JSON.stringify([...ids,...stored.slice(page+1)])]);}
 for(const id of stored.slice(pages.length))await pbDeleteSurface(scheduleChannel,id);await db.query('UPDATE pb_discord_settings SET schedule_message_ids=$2::jsonb WHERE guild_id=$1',[guildId,JSON.stringify(ids)]);
 if(force)diag('port-battle','Legacy-style V2 panels refreshed',{battles:battles.length,active:active.length,signupIndex:signupIndex.id});
}
async function syncPortBattleDiscord(force=false){if(pbSyncPromise){if(force)pbResyncRequested=true;return pbSyncPromise;}pbSyncPromise=(async()=>{do{pbResyncRequested=false;const lock=await pool.connect();try{const held=await lock.query('SELECT pg_try_advisory_lock(hashtext($1)) AS held',[`pb-discord:${guildId}`]);if(held.rows[0]?.held){try{await syncPortBattleDiscordInner(force);}finally{await lock.query('SELECT pg_advisory_unlock(hashtext($1))',[`pb-discord:${guildId}`]);}}}finally{lock.release();}}while(pbResyncRequested);})().finally(()=>{pbSyncPromise=null;});return pbSyncPromise;}
async function deliverPortBattleAssignmentDms(){if(!client.isReady())return;const rows=await many<any>(`SELECT e.id,e.after_state,e.notification_error,s.user_id,s.display_name,b.port_name,b.starts_at FROM pb_assignment_events e JOIN pb_signups s ON s.id=e.signup_id JOIN pb_battles b ON b.id=e.battle_id WHERE e.guild_id=$1 AND b.status IN('OPEN','CLOSED') AND e.notified_at IS NULL AND s.user_id IS NOT NULL ORDER BY e.created_at LIMIT 25`,[guildId]);for(const row of rows){let error:string|null=null;try{if(!await canDiscordDm(String(row.user_id),'battles')){await db.query(`UPDATE pb_assignment_events SET notified_at=CURRENT_TIMESTAMP,notification_error='suppressed_by_preference' WHERE id=$1`,[row.id]);continue;}const state=typeof row.after_state==='string'?JSON.parse(row.after_state):row.after_state??{},user=await client.users.fetch(String(row.user_id));const bits=[state.confirmed_ship,state.horn_duty,state.flare_duty,state.formation,state.commander_duty].filter(Boolean);await sendBotDm(user,`**Port Battle assignment updated — ${row.port_name}**\n${bits.length?bits.join(' · '):'You are currently unassigned.'}\n${pbDate(row.starts_at)}${pbDashboardUrl()?`\n${pbDashboardUrl()}/dashboard/port-battles`:''}`);}catch(err:any){error=String(err?.message??err).slice(0,500);}await db.query(`UPDATE pb_assignment_events SET notified_at=CURRENT_TIMESTAMP,notification_error=$2 WHERE id=$1`,[row.id,error]);}}
async function deliverPortBattleReminders(){await deliverBattleCancellations(client,guildId!).catch(e=>console.warn('[pb-cancel]',e));if(!client.isReady())return;const rows=await many<any>(`SELECT s.id signup_id,s.user_id,s.display_name,s.confirmed_ship,b.id battle_id,b.port_name,b.starts_at FROM pb_signups s JOIN pb_battles b ON b.id=s.battle_id WHERE b.guild_id=$1 AND b.status IN ('OPEN','CLOSED') AND s.user_id IS NOT NULL AND s.confirmed_ship IS NOT NULL AND b.starts_at>CURRENT_TIMESTAMP AND b.starts_at<=CURRENT_TIMESTAMP+INTERVAL '60 minutes'`,[guildId]);for(const row of rows){const mins=(new Date(row.starts_at).getTime()-Date.now())/60000;const threshold=mins>30?60:mins>15?30:15;const claimed=await oneOrNone<any>(`INSERT INTO pb_reminder_deliveries(battle_id,signup_id,user_id,minutes_before) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING battle_id`,[row.battle_id,row.signup_id,row.user_id,threshold]);if(!claimed)continue;let error:string|null=null;try{if(!await canDiscordDm(String(row.user_id),'battles')){await db.query(`UPDATE pb_reminder_deliveries SET delivery_error='suppressed_by_preference' WHERE battle_id=$1 AND signup_id=$2 AND minutes_before=$3`,[row.battle_id,row.signup_id,threshold]);continue;}if(!(await oneOrNone<any>("SELECT id FROM pb_battles WHERE id=$1 AND status IN('OPEN','CLOSED')",[row.battle_id])))continue;const user=await client.users.fetch(String(row.user_id));await sendBotDm(user,`**Battle of ${row.port_name} — ${threshold}-minute reminder**\nYou are confirmed in **${row.confirmed_ship}**.\n${pbDate(row.starts_at)}${pbDashboardUrl()?`\n${pbDashboardUrl()}/dashboard/port-battles`:''}`);}catch(err:any){error=String(err?.message??err).slice(0,500);}if(error)await db.query(`UPDATE pb_reminder_deliveries SET delivery_error=$4 WHERE battle_id=$1 AND signup_id=$2 AND minutes_before=$3`,[row.battle_id,row.signup_id,threshold,error]);}}
function xmlEscape(v:any){return String(v??'').replace(/[&<>"']/g,(c:string)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]??c));}
function tacticalSvg(shapes:any[]){const body=(Array.isArray(shapes)?shapes:[]).map((s:any)=>{const pts=(Array.isArray(s.points)?s.points:[]).filter((p:any)=>Array.isArray(p)&&p.length>=2);if(!pts.length)return'';const color=s.color==='rainbow'?'#e1bf43':/^#[0-9a-f]{6}$/i.test(String(s.color))?String(s.color):'#53b96e',width=Math.max(2,Math.min(16,Number(s.width)||5)),label=xmlEscape(s.label??''),mid=pts[Math.floor(pts.length/2)]??pts[0];if(s.tool==='dots')return pts.map((p:any)=>`<circle cx="${p[0]}" cy="${p[1]}" r="${Math.max(4,width)}" fill="${color}"/>`).join('')+(label?`<text x="${mid[0]}" y="${mid[1]-12}" fill="${color}" stroke="#080909" stroke-width="5" paint-order="stroke" font-size="22" font-weight="700">${label}</text>`:'');if(s.tool==='ship'){const p=pts[0];return `<g transform="translate(${p[0]} ${p[1]})"><path d="M -20 13 L 0 -21 L 20 13 L 0 8 Z" fill="${color}" stroke="#080909" stroke-width="3"/><line x1="0" y1="-14" x2="0" y2="17" stroke="${color}" stroke-width="3"/></g>${label?`<text x="${p[0]+25}" y="${p[1]+6}" fill="${color}" stroke="#080909" stroke-width="5" paint-order="stroke" font-size="21" font-weight="700">${label}</text>`:''}`;}const points=pts.map((p:any)=>`${p[0]},${p[1]}`).join(' ');let arrow='';if(s.tool==='arrow'&&pts.length>1){const last=pts.at(-1),prev=pts.at(-2),a=Math.atan2(last[1]-prev[1],last[0]-prev[0]),len=18+width*2,tri=[[last[0],last[1]],[last[0]-len*Math.cos(a-.45),last[1]-len*Math.sin(a-.45)],[last[0]-len*Math.cos(a+.45),last[1]-len*Math.sin(a+.45)]];arrow=`<polygon points="${tri.map((p:any)=>p.join(',')).join(' ')}" fill="${color}"/>`;}return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>${arrow}${label?`<text x="${mid[0]}" y="${mid[1]-12}" fill="${color}" stroke="#080909" stroke-width="5" paint-order="stroke" font-size="22" font-weight="700">${label}</text>`:''}`;}).join('');return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">${body}</svg>`);}
async function tacticalMapBuffer(mapKey:string|null,drawing:any[]){let image:any;try{if(mapKey)image=sharp(join(process.cwd(),'apps/dashboard/public/prep-review/maps',mapKey)).resize(1200,900,{fit:'contain',background:'#121615'});else throw new Error('no map');await image.metadata();}catch{image=sharp({create:{width:1200,height:900,channels:4,background:{r:18,g:22,b:21,alpha:1}}});}return image.composite([{input:tacticalSvg(drawing),top:0,left:0}]).png().toBuffer();}
async function deliverTacticalBriefs(){if(!client.isReady())return;const jobs=await many<any>(`SELECT d.*,b.port_name,b.starts_at,t.title,t.instructions,t.map_key,t.drawing FROM pb_tactical_dispatches d JOIN pb_battles b ON b.id=d.battle_id JOIN pb_tactical_briefs t ON t.id=d.brief_id WHERE d.guild_id=$1 AND b.status IN('OPEN','CLOSED') AND d.status='QUEUED' ORDER BY d.created_at LIMIT 5`,[guildId]);for(const job of jobs){const claimed=await oneOrNone<any>(`UPDATE pb_tactical_dispatches SET status='RUNNING',started_at=CURRENT_TIMESTAMP WHERE id=$1 AND status='QUEUED' RETURNING id`,[job.id]);if(!claimed)continue;let delivered=0,failed=0;const errors:any[]=[];try{const rows=await many<any>(`SELECT * FROM pb_signups WHERE battle_id=$1 AND confirmed_ship IS NOT NULL AND user_id IS NOT NULL`,[job.battle_id]),recipients=rows.filter((x:any)=>job.role_key==='ALL'||x.formation===job.role_key||x.horn_duty===job.role_key||x.flare_duty===job.role_key||x.commander_duty===job.role_key),drawing=typeof job.drawing==='string'?JSON.parse(job.drawing||'[]'):job.drawing??[],map=await tacticalMapBuffer(job.map_key,drawing);for(const r of recipients){try{if(!await canDiscordDm(String(r.user_id),'battles'))continue;if(!(await oneOrNone<any>("SELECT id FROM pb_battles WHERE id=$1 AND status IN('OPEN','CLOSED')",[job.battle_id])))break;const user=await client.users.fetch(String(r.user_id));await sendBotDm(user,{content:`**${job.title}**\nBattle of **${job.port_name}** · ${job.role_key}\n${pbDate(job.starts_at)}${job.instructions?`\n\n${String(job.instructions).slice(0,3500)}`:''}`,files:[{attachment:map,name:`${String(job.port_name).replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-${String(job.role_key).replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-plan.png`}],allowedMentions:{parse:[]}});delivered++;}catch(err:any){failed++;errors.push({userId:String(r.user_id),error:String(err?.message??err).slice(0,180)});}}await db.query(`UPDATE pb_tactical_dispatches SET status='COMPLETED',delivered_count=$2,failed_count=$3,result=$4::jsonb,finished_at=CURRENT_TIMESTAMP WHERE id=$1`,[job.id,delivered,failed,JSON.stringify({recipients:recipients.length,errors})]);}catch(err:any){await db.query(`UPDATE pb_tactical_dispatches SET status='FAILED',result=$2::jsonb,finished_at=CURRENT_TIMESTAMP WHERE id=$1`,[job.id,JSON.stringify({error:String(err?.message??err).slice(0,500)})]);}}}
async function portBattleSweep(){try{await processPbEmergencyReset();const reconcileKey=`pb:reconcile:requested:${guildId}`;const requested=await redis.get(reconcileKey).catch(()=>null);if(requested)await redis.del(reconcileKey).catch(()=>{});if(requested)pbLastOrphanScanAt=0;try{await syncPortBattleDiscord(Boolean(requested));if(requested)await redis.set(`pb:reconcile:last:${guildId}`,JSON.stringify({status:'DONE',at:new Date().toISOString()}),'EX',86400);}catch(err){if(requested)await redis.set(`pb:reconcile:last:${guildId}`,JSON.stringify({status:'FAILED',at:new Date().toISOString(),error:String(err).slice(0,200)}),'EX',86400);throw err;}await deliverPortBattleAssignmentDms();await deliverPortBattleReminders();await deliverTacticalBriefs();}catch(err){console.warn('[port-battle] Discord synchronization failed',err);}}

async function roomById(id:string){ return oneOrNone<RoomRow>(`SELECT * FROM music_rooms WHERE guild_id=$1 AND id=$2 AND enabled=TRUE`,[guildId,id]); }
async function ensureGuild(){ await db.query(`INSERT INTO guild_settings(guild_id) VALUES($1) ON CONFLICT DO NOTHING`,[guildId]); }
const userVoiceKey=(userId:string)=>`music:user-voice:${userId}`;
const voiceChannelKey=(channelId:string)=>`music:voice-channel:${channelId}`;
const voiceRoomKey=(channelId:string)=>`music:voice-room:${channelId}`;
async function cacheVoiceChannel(channel:any){
  if(!channel?.id)return;
  await redis.set(voiceChannelKey(String(channel.id)),JSON.stringify({id:String(channel.id),name:channel.name??"Voice channel",bitrate:Number(channel.bitrate??0)||null,type:channel.type??2,updatedAt:Date.now()}),"EX",6*3600);
}
async function roomByVoice(voiceChannelId:string){return oneOrNone<RoomRow>(`SELECT * FROM music_rooms WHERE guild_id=$1 AND voice_channel_id=$2 AND enabled=TRUE LIMIT 1`,[guildId,voiceChannelId]);}
async function ensureVoiceRoom(voiceChannelId:string):Promise<RoomRow>{
  const existing=await roomByVoice(voiceChannelId);if(existing){await redis.set(voiceRoomKey(voiceChannelId),existing.id,"EX",24*3600);diagDebug("music-session","reusing voice session",{roomId:existing.id,voiceChannelId});return existing;}
  await ensureGuild();
  const guild=client.guilds.cache.get(guildId!);const channel=guild?.channels.cache.get(voiceChannelId)??await guild?.channels.fetch(voiceChannelId).catch(()=>null);
  if(!channel?.isVoiceBased())throw new Error("Join a Discord voice channel before using music.");
  await cacheVoiceChannel(channel);
  const settings=await oneOrNone<{autoplay_default:boolean}>(`SELECT autoplay_default FROM guild_settings WHERE guild_id=$1`,[guildId]);
  const id=randomUUID();
  try{
    await db.query(`INSERT INTO music_rooms(id,guild_id,name,text_channel_id,voice_channel_id,autoplay,delete_requests,default_filter,enabled) VALUES($1,$2,$3,$4,$5,$6,TRUE,'flat',TRUE)`,[id,guildId,channel.name,voiceChannelId,voiceChannelId,false]);
  }catch(err:any){if(err?.code!=="ER_DUP_ENTRY")throw err;}
  const room=await roomByVoice(voiceChannelId);if(!room)throw new Error("Unable to establish a music session for this voice channel");
  await redis.set(voiceRoomKey(voiceChannelId),room.id,"EX",24*3600);
  diag("music-session","created voice session",{roomId:room.id,voiceChannelId,voiceChannelName:channel.name});return room;
}
async function guildLocale(){const s=await oneOrNone<{default_language:string}>(`SELECT default_language FROM guild_settings WHERE guild_id=$1`,[guildId]);return s?.default_language??"en-US";}
async function userLocale(userId:string,room?:RoomRow|null){const p=await oneOrNone<{language:string|null}>(`SELECT language FROM user_music_preferences WHERE guild_id=$1 AND user_id=$2`,[guildId,userId]);return p?.language??room?.language??await guildLocale();}
async function beginListening(historyId:string,room:RoomRow,userId:string){
  const open=await oneOrNone(`SELECT id FROM listening_events WHERE history_id=$1 AND user_id=$2 AND left_at IS NULL LIMIT 1`,[historyId,userId]);if(open)return;
  await db.query(`INSERT INTO listening_events(id,history_id,guild_id,room_id,user_id) VALUES($1,$2,$3,$4,$5)`,[randomUUID(),historyId,guildId,room.id,userId]);
}
async function endListening(historyId:string,userId?:string){
  if(userId)await db.query(`UPDATE listening_events SET left_at=CURRENT_TIMESTAMP,listened_ms=GREATEST(0,FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP-joined_at))*1000))::BIGINT WHERE history_id=$1 AND user_id=$2 AND left_at IS NULL`,[historyId,userId]);
  else await db.query(`UPDATE listening_events SET left_at=CURRENT_TIMESTAMP,listened_ms=GREATEST(0,FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP-joined_at))*1000))::BIGINT WHERE history_id=$1 AND left_at IS NULL`,[historyId]);
}
async function snapshotListeners(room:RoomRow,historyId:string){
  const guild=client.guilds.cache.get(guildId!);const ch=guild?.channels.cache.get(room.voice_channel_id);if(!ch?.isVoiceBased())return;
  for(const member of ch.members.values())if(!member.user.bot)await beginListening(historyId,room,member.id);
}

async function claimRequestWindow(roomId:string,userId:string){
  return Boolean(await redis.set(`music:request:${roomId}:${userId}`,"1","EX",2,"NX"));
}
async function ensureVoiceQuality(channelId:string){
  if(!enforceVoiceBitrate)return;
  const guild=client.guilds.cache.get(guildId!);if(!guild)return;
  const tier=Number(guild.premiumTier??0);
  const cap=tier>=3?384000:tier===2?256000:tier===1?128000:96000;
  const target=Math.min(voiceBitrateTarget,cap);
  const channel=guild.channels.cache.get(channelId)??await guild.channels.fetch(channelId).catch(()=>null);
  if(!channel||!("bitrate" in channel)||!("setBitrate" in channel))return;
  if(Number((channel as any).bitrate)===target){void cacheVoiceChannel(channel);diagDebug("voice-quality","bitrate already at target",{voiceChannelId:channelId,targetBps:target});return;}
  try{await (channel as any).setBitrate(target,"BOM-Bot music quality target");void cacheVoiceChannel(channel);diag("voice-quality","updated voice bitrate",{voiceChannelId:channelId,targetBps:target});}
  catch(err:any){diagWarn("voice-quality","unable to update voice bitrate",{voiceChannelId:channelId,targetBps:target,error:err?.message??String(err)});}
}

async function submit(room:RoomRow, query:string, requesterId:string, traceId?:string,opts:{origin?:QueueItem["source"];surface?:QueueItem["surface"]}={}){
  const trace=traceId??randomUUID();
  const normalized=classify(query).query;
  const item:QueueItem={requestId:randomUUID(),roomId:room.id,guildId:guildId!,voiceChannelId:room.voice_channel_id,query:normalized,originalQuery:query,requesterId,requestedAt:Date.now(),traceId:trace,source:opts.origin??"USER",surface:opts.surface??"DISCORD"};
  const state=await getRoomState(room.id);
  diag("music-route","request resolved to voice channel",{traceId:trace,requestId:item.requestId,requesterId,roomId:room.id,voiceChannelId:room.voice_channel_id,state:state.status,workerId:state.workerId??null,query:safeQuery(item.query)});
  if(state.status==="IDLE"||state.status==="ERROR"||!state.workerId){
    // A recovered queue may still have pending requests even though its worker is idle.
    // Drain those first instead of silently skipping them when a new request arrives.
    if((await queueItems(room.id)).length){await enqueue(item);await checkpointRoom(guildId!,room.id);await playNext(room.id);}
    else{await redis.del(keys.roomSessionHistory(room.id));diag("music-queue","starting request immediately",{traceId:trace,requestId:item.requestId,roomId:room.id});await startItem(room,item);}
  }else{
    await enqueue(item);await checkpointRoom(guildId!,room.id);
    diag("music-queue","queued behind active playback",{traceId:trace,requestId:item.requestId,roomId:room.id,workerId:state.workerId});
  }
  await audit(guildId!,requesterId,"music.queue",{roomId:room.id,requestId:item.requestId,query:safeQuery(item.query)});
  await refreshPanel(room);
}
async function startItem(room:RoomRow,item:QueueItem){
  await musicTrace(room.id,'PLAY_REQUESTED',{requestId:item.requestId,origin:item.source});
  const startedAt=Date.now();
  diag("worker-lease","requesting worker",{traceId:item.traceId,requestId:item.requestId,roomId:room.id,voiceChannelId:room.voice_channel_id,preferredWorkerId:room.preferred_worker_id??null});
  let workerId:string;
  try{workerId=await allocateWorker(room.id,room.preferred_worker_id,item.traceId);}
  catch(err:any){diagWarn("worker-lease","allocation failed",{traceId:item.traceId,requestId:item.requestId,roomId:room.id,error:err?.message??String(err),elapsedMs:Date.now()-startedAt});throw err;}
  const leasedAt=Date.now(),settings=await roomFeatureSettings(guildId!,room.id);
  await setRoomState(room.id,{status:"BUFFERING",workerId,track:item.trackInfo,position:item.startPositionMs??0,updatedAt:leasedAt,requesterId:item.requesterId,requestId:item.requestId,origin:item.source,surface:item.surface,originalQuery:item.originalQuery??item.query});
  await publishWorkerCommand(workerId,{type:"PLAY",roomId:room.id,guildId:guildId!,voiceChannelId:room.voice_channel_id,query:item.query,encoded:item.encoded,trackInfo:item.trackInfo,requesterId:item.requesterId,requestId:item.requestId,traceId:item.traceId,startPositionMs:item.startPositionMs,transitionMode:settings.transitionMode,transitionMs:settings.transitionMs,origin:item.source,surface:item.surface,originalQuery:item.originalQuery??item.query});
  const dispatchMs=Date.now()-startedAt;void metric(guildId!,"controller_dispatch_ms",dispatchMs,{traceId:item.traceId,requestId:item.requestId,workerId,roomId:room.id,leaseMs:leasedAt-startedAt});
  diag("voice-route","PLAY dispatched to worker",{traceId:item.traceId,requestId:item.requestId,workerId,roomId:room.id,voiceChannelId:room.voice_channel_id,query:safeQuery(item.query),leaseMs:leasedAt-startedAt,dispatchMs});
}
async function playNext(roomId:string,preferredRequestId?:string){
  const room=await roomById(roomId); if(!room)return;
  if(String(room.preferred_worker_id??'')==='8'){
    const conf=await oneOrNone<any>(`SELECT stream_url,voice_channel_id,enabled FROM bom_radio_settings WHERE guild_id=$1`,[guildId]);
    if(conf?.enabled&&String(conf.voice_channel_id)===String(room.voice_channel_id)&&conf.stream_url){
      // Do not enqueue duplicate streams; restart the live station on completion.
      const item:QueueItem={requestId:randomUUID(),roomId:room.id,guildId:guildId!,voiceChannelId:room.voice_channel_id,query:String(conf.stream_url),requesterId:'BOM Radio',requestedAt:Date.now(),traceId:`radio-restart:${randomUUID()}`,source:'RADIO',surface:'SYSTEM',originalQuery:String(conf.stream_url)};
      try{await startItem(room,item);return;}catch(err){console.warn('[bom-radio] station restart deferred',err);}
    }
  }
  const next=(preferredRequestId?await dequeueByRequestId(roomId,preferredRequestId):null)??await dequeue(roomId);
  if(next){await checkpointRoom(guildId!,roomId);try{await startItem(room,next);}catch(err:any){await enqueue(next);await checkpointRoom(guildId!,roomId);await setRoomState(roomId,{status:"ERROR",error:err?.message??"No worker is available",updatedAt:Date.now()});await refreshPanel(room);}return;}
  // An exhausted user queue is terminal. Only the dedicated station above
  // may restart itself; legacy autoplay/radio settings must not refill it.
  const old=await getRoomState(roomId);
  await setRoomState(roomId,{status:"IDLE",updatedAt:Date.now()}); if(old.workerId)await publishWorkerCommand(old.workerId,{type:"LEAVE",roomId,guildId:guildId!}).catch(()=>{}); await releaseWorker(roomId,old.workerId); await refreshPanel(room);
}

const brandingColorCache=new Map<string,{value:number;expires:number}>();
async function workerAccent(workerId?:string){
  if(!workerId)return 0xD6A83A;const cached=brandingColorCache.get(workerId);if(cached&&cached.expires>Date.now())return cached.value;
  const defaults:Record<string,string>={"1":"#9B4DFF","2":"#ED4245","3":"#F47B20","4":"#F1C40F","5":"#57F287","6":"#3498DB","7":"#F2F3F5","8":"#232428"};
  const row=await oneOrNone<any>(`SELECT color_hex FROM worker_branding WHERE guild_id=$1 AND worker_id=$2`,[guildId,Number(workerId)]).catch(()=>null);const hex=String(row?.color_hex??defaults[workerId]??"#D6A83A").replace(/^#/,"");const value=/^[0-9a-f]{6}$/i.test(hex)?parseInt(hex,16):0xD6A83A;brandingColorCache.set(workerId,{value,expires:Date.now()+300_000});return value;
}
function currentLyricLine(lyrics:any,position:number){const lines=Array.isArray(lyrics?.lines)?lyrics.lines:[];let current="";for(const l of lines){const t=Number(l?.timestamp??l?.time??0);if(t<=position)current=String(l?.line??l?.text??"");else break;}return current||null;}
const roomPanelQueues=new Map<string,Promise<void>>();
function refreshPanel(room:RoomRow,repost=false){const previous=roomPanelQueues.get(room.id)??Promise.resolve();const run=previous.catch(()=>{}).then(async()=>{const current=await roomById(room.id);if(current)await refreshPanelNow(current,repost);});roomPanelQueues.set(room.id,run);void run.finally(()=>{if(roomPanelQueues.get(room.id)===run)roomPanelQueues.delete(room.id);}).catch(()=>{});return run;}
async function refreshPanelNow(room:RoomRow,repost=false){
  try{
    const deskSettings=await oneOrNone<any>('SELECT member_console_channel_id FROM membership_settings WHERE guild_id=$1',[guildId]);
    if(deskSettings?.member_console_channel_id&&room.text_channel_id===room.voice_channel_id){await db.query('UPDATE music_rooms SET text_channel_id=$2 WHERE id=$1',[room.id,deskSettings.member_console_channel_id]);room.text_channel_id=deskSettings.member_console_channel_id;}
    const channel=await client.channels.fetch(room.text_channel_id);if(!channel?.isTextBased()||!channel.isSendable()||!("messages" in channel))return;
    const [state,queue,metadataRaw,lyricsRaw]=await Promise.all([getRoomState(room.id),queueItems(room.id),redis.get(`music:room:${room.id}:metadata`),redis.get(`music:room:${room.id}:lyrics`)]);const locale=room.language??await guildLocale();const metadata=metadataRaw?JSON.parse(metadataRaw):null,lyrics=lyricsRaw?JSON.parse(lyricsRaw):null;
    if(!state.track||['IDLE','STOPPED'].includes(String(state.status))){
      if(room.controller_message_id){const old=await channel.messages.fetch(room.controller_message_id).catch((e:any)=>{if(Number(e.code)!==10008)throw e;return null;});if(old)await old.delete();await db.query('UPDATE music_rooms SET controller_message_id=NULL WHERE id=$1',[room.id]);room.controller_message_id=null;}
      return;
    }
    const visualizerUrl=state.track?`${process.env.PUBLIC_DASHBOARD_URL??"https://dashboard.bandofmisfits.org"}/music/visualizers/worker-${String(state.workerId??"1")}.gif?v=1`:undefined;
    const opts={visualizerUrl,accentColor:await workerAccent(state.workerId),requesterId:state.requesterId,next:queue[0]??null,currentLyric:currentLyricLine(lyrics,Number(state.position??0)),mediaEnabled:true};
    const payload=publicRoomPanel(room,state,queue.length,metadata,locale,opts);
    const fallback=publicRoomPanel(room,state,queue.length,metadata,locale,{...opts,visualizerUrl:undefined,mediaEnabled:false});
    const editExisting=async()=>{if(!room.controller_message_id||repost)return false;let m:any;try{m=await channel.messages.fetch(room.controller_message_id);}catch(err:any){if(Number(err.code)===10008)return false;throw err;}if(samePBPanel(m,payload))return true;try{await m.edit({...payload,content:null,embeds:[]});}catch(err:any){if(Number(err.code)!==50035)throw err;diagWarn("discord-player","media render rejected; using text-safe fallback",{roomId:room.id,error:err.message});await m.edit({...fallback,content:null,embeds:[]});}return true;};
    if(await editExisting())return;
    if(room.controller_message_id&&repost){try{const old=await channel.messages.fetch(room.controller_message_id);if(old.pinned)await old.unpin("Repositioning BOM-Bot music player").catch(()=>{});await old.delete();}catch{}}
    let m:any;try{m=await channel.send(payload);}catch(err){diagWarn("discord-player","initial media render rejected; using text-safe fallback",{roomId:room.id,error:(err as any)?.message??String(err)});m=await channel.send(fallback);}await db.query(`UPDATE music_rooms SET controller_message_id=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[room.id,m.id]);room.controller_message_id=m.id;void maintainDeskOrderForChannel(client,room.text_channel_id).catch(()=>{});
  }catch(err){console.error("player refresh failed",err);}
}
async function deleteTrackAnnouncement(room:RoomRow){
  const id=await redis.get(`music:room:${room.id}:announcement`);if(!id)return;try{const channel=await client.channels.fetch(room.text_channel_id);if(channel?.isTextBased()&&"messages" in channel){const m=await channel.messages.fetch(id).catch(()=>null);if(m)await m.delete().catch(()=>{});}}catch{}await redis.del(`music:room:${room.id}:announcement`);
}
async function postTrackAnnouncement(room:RoomRow,_track:any,_requesterId:string,_metadata:any=null,_positionMs=0){await deleteTrackAnnouncement(room);await refreshPanel(room);}
async function refreshTrackAnnouncement(room:RoomRow,_track:any,_requesterId:string,_metadata:any,_positionMs=0){await refreshPanel(room);}


function unknownInteraction(err:any){return err?.code===10062||err?.rawError?.code===10062;}
async function safeDeferUpdate(interaction:any){
  if(interaction.deferred||interaction.replied)return true;
  try{await interaction.deferUpdate();return true;}
  catch(err:any){
    if(unknownInteraction(err)){diagWarn("interaction","interaction expired before acknowledgement",{customId:interaction.customId??null,userId:interaction.user?.id??null});return false;}
    throw err;
  }
}
async function sendEphemeral(interaction:any,payload:any){
  try{
    if(interaction.isMessageComponent?.()){
      if(!await safeDeferUpdate(interaction))return null;
      const message=await interaction.followUp(payload);
      return {messageId:message?.id as string|undefined,token:interaction.token as string};
    }
    if(interaction.deferred&&!interaction.replied){
      const message=await editInteractionReply(interaction,payload);
      return {messageId:message?.id as string|undefined,token:interaction.token as string};
    }
    if(interaction.replied){
      const message=await interaction.followUp(payload);
      return {messageId:message?.id as string|undefined,token:interaction.token as string};
    }
    const resp=await interaction.reply({...payload,withResponse:true});
    return {messageId:resp?.resource?.message?.id as string|undefined,token:interaction.token as string};
  }catch(err:any){
    if(unknownInteraction(err)){diagWarn("interaction","expired interaction ignored instead of crashing controller",{customId:interaction.customId??null,userId:interaction.user?.id??null});return null;}
    throw err;
  }
}
async function ephem(interaction:any,payload:any){
  const sent=await sendEphemeral(interaction,payload);
  if(!sent)return;
  await trackEphemeral(clientId!,sent.token,sent.messageId,undefined,{kind:"notice",userId:interaction.user?.id});
}

async function openPrivate(interaction:any, room:RoomRow, note?:string){
  const mapKey=keys.ephemeralUserRoom(interaction.user.id,room.id); const previous=await redis.get(mapKey); if(previous)await expireEphemeralNow(previous);
  const state=await getRoomState(room.id); const locale=await userLocale(interaction.user.id,room); const sent=await sendEphemeral(interaction,privatePanel(room,state,note,locale));
  if(!sent)return;
  const id=await trackEphemeral(clientId!,sent.token,sent.messageId,undefined,{kind:"private",roomId:room.id,locale,userId:interaction.user.id});
  await redis.set(mapKey,id,"PX",16*60_000);
}
async function renewPrivate(interaction:any,roomId:string){
  const id=await redis.get(keys.ephemeralUserRoom(interaction.user.id,roomId)); if(!id)return null;
  const rec=await getEphemeral(id); if(!rec)return null;
  if(interaction.message?.id&&rec.messageId===interaction.message.id){await renewEphemeral(id,interaction.token);return id;}
  // Modal submissions do not expose the source message. The button that opened
  // the modal already refreshed the source token, so only renew its deadline.
  if(interaction.isModalSubmit?.()){await renewEphemeral(id);return id;}
  return null;
}

async function chooseRoomForUser(interaction:any):Promise<RoomRow|null>{
  if(interaction.guildId!==guildId)return null;
  const voice=interaction.member?.voice?.channelId;
  if(!voice)return null;
  return ensureVoiceRoom(String(voice));
}

async function rolePermission(roles:string[],manageGuild:boolean,permission:MusicPermission){
  if(manageGuild)return true;
  const rules=await many<{role_id:string;allowed:boolean}>(`SELECT role_id,allowed FROM music_permission_rules WHERE guild_id=$1 AND permission=$2`,[guildId,permission]);
  let allowed=permission==="USE_MUSIC" && rules.length===0;
  for(const rule of rules)if(roles.includes(String(rule.role_id))){if(!rule.allowed)return false;allowed=true;}
  return allowed;
}
async function hasMusicPermission(interaction:any,permission:MusicPermission){
  if(!interaction.guildId)return false;
  const member=interaction.member;const roles=[...(member?.roles?.cache?.keys?.()??(Array.isArray(member?.roles)?member.roles:[]))].map(String);
  return rolePermission(roles,!!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild),permission);
}
function hasDashboardAdmin(interaction:any){
  if(interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild))return true;
  const member=interaction.member;const roles=[...(member?.roles?.cache?.keys?.()??(Array.isArray(member?.roles)?member.roles:[]))].map(String);
  return Boolean(dashboardAdminRoleId&&roles.includes(dashboardAdminRoleId));
}
async function messageMusicPermission(message:any,permission:MusicPermission){
  if(!message.guildId||!message.member)return false;
  const roles=[...message.member.roles.cache.keys()].map(String);
  return rolePermission(roles,message.member.permissions.has(PermissionFlagsBits.ManageGuild),permission);
}
async function userMusicPermission(userId:string,permission:MusicPermission){
  const guild=client.guilds.cache.get(guildId!);if(!guild)return false;const member=guild.members.cache.get(userId)??await guild.members.fetch(userId).catch(()=>null);if(!member)return false;
  return rolePermission([...member.roles.cache.keys()].map(String),member.permissions.has(PermissionFlagsBits.ManageGuild),permission);
}
// Pause/stop/volume: DJs and music managers always; anyone else when they are
// the only person listening (no one to annoy).
async function canControlRoom(room:RoomRow,userId:string){
  if(await userMusicPermission(userId,"MANAGE_MUSIC")||await userMusicPermission(userId,"DJ"))return true;
  const vc=client.guilds.cache.get(guildId!)?.channels.cache.get(room.voice_channel_id);
  const humans=vc?.isVoiceBased()?[...vc.members.values()].filter(m=>!m.user.bot):[];
  return humans.length<=1&&humans.some(m=>m.id===userId);
}
function queueText(q:QueueItem[]){
  if(!q.length)return "The queue is empty.";
  const lines=q.slice(0,15).map((x,i)=>`${i+1}. ${(x.display??x.trackInfo?.title??x.originalQuery??x.query).slice(0,90)}${x.requesterId&&/^\d+$/.test(x.requesterId)?` · <@${x.requesterId}>`:""}`);
  return lines.join("\n")+(q.length>15?`\n…and ${q.length-15} more`:"");
}
async function handleMusicCommand(interaction:any){
  const sub=interaction.commandName==="play"?"play":interaction.options.getSubcommand(false)??"controls";
  const room=await chooseRoomForUser(interaction);
  if(!room)return void await ephem(interaction,simpleEphemeral("Music","Join a voice channel first, then try again. A free music bot will join you."));
  if(!await hasMusicPermission(interaction,"USE_MUSIC"))return void await ephem(interaction,simpleEphemeral("Permission denied","You don't have permission to use music in this server."));
  if(sub==="controls")return void await openPrivate(interaction,room);
  const state=await getRoomState(room.id),uid=interaction.user.id;
  if(sub==="play"){
    const query=String(interaction.options.getString("song",true)).trim();
    if(!query)return void await ephem(interaction,simpleEphemeral("Music","Tell me what to play."));
    if(!await claimRequestWindow(room.id,uid))return void await ephem(interaction,simpleEphemeral("Slow down","Wait a moment before adding another song."));
    await deferInteractionReply(interaction,{flags:MessageFlags.Ephemeral});
    try{
      const busy=Boolean(state.workerId)&&!["IDLE","ERROR"].includes(String(state.status));
      await submit(room,query,uid,undefined,{surface:"DISCORD"});
      const pos=busy?(await queueItems(room.id)).length:0;
      return void await editInteractionReply(interaction,{content:busy?`Added **${query.slice(0,100)}** to the queue (position ${pos}).`:`Starting **${query.slice(0,100)}** in ${room.name}.`});
    }catch(err:any){return void await editInteractionReply(interaction,{content:`Couldn't play that: ${String(err?.message??err).slice(0,300)}`});}
  }
  if(sub==="nowplaying"){
    const q=await queueItems(room.id);
    return void await ephem(interaction,{...publicRoomPanel(room,state,q.length,null,"en-US",{next:q[0]}),flags:MessageFlags.Ephemeral|MessageFlags.IsComponentsV2});
  }
  if(sub==="queue")return void await ephem(interaction,simpleEphemeral(`${room.name} · Queue`,queueText(await queueItems(room.id))));
  if(!state.workerId)return void await ephem(interaction,simpleEphemeral("Music","Nothing is playing in your voice channel."));
  if(sub==="skip")return void await ephem(interaction,simpleEphemeral("Skip",await requestSkip(room,state,uid)));
  if(!await canControlRoom(room,uid))return void await ephem(interaction,simpleEphemeral("Not allowed","Only a DJ can do that while others are listening."));
  if(sub==="pause"){
    const resume=state.status==="PAUSED";
    await publishWorkerCommand(state.workerId,{type:resume?"RESUME":"PAUSE",roomId:room.id,guildId:guildId!});
    return void await ephem(interaction,simpleEphemeral("Music",resume?"Resumed.":"Paused."));
  }
  if(sub==="stop"){
    await publishWorkerCommand(state.workerId,{type:"STOP",roomId:room.id,guildId:guildId!});
    return void await ephem(interaction,simpleEphemeral("Music","Stopped and cleared the queue."));
  }
  if(sub==="volume"){
    const level=Math.max(0,Math.min(150,Number(interaction.options.getInteger("level",true))));
    await publishWorkerCommand(state.workerId,{type:"VOLUME",roomId:room.id,guildId:guildId!,volume:level});
    return void await ephem(interaction,simpleEphemeral("Volume",`Volume set to ${level}.`));
  }
}
async function requestSkip(room:RoomRow,state:any,userId:string){
  if(!state.workerId)return "Nothing is playing.";
  const guild=client.guilds.cache.get(guildId!),vc=guild?.channels.cache.get(room.voice_channel_id);const members=vc?.isVoiceBased()?[...vc.members.values()].filter(m=>!m.user.bot):[];
  if(await userMusicPermission(userId,"FORCE_SKIP")){await publishWorkerCommand(state.workerId,{type:"SKIP",roomId:room.id,guildId:guildId!});return "Track skipped by an authorized DJ.";}
  if(!await userMusicPermission(userId,"USE_MUSIC"))return "You do not have permission to control music in this server.";
  const guildSkip=room.skip_mode?null:await oneOrNone<{skip_mode:string}>(`SELECT skip_mode FROM guild_settings WHERE guild_id=$1`,[guildId]);
  const mode=SkipMode.catch("MAJORITY").parse(room.skip_mode??guildSkip?.skip_mode??"MAJORITY");
  if(mode==="NO_SKIP")return "Skipping is disabled for this room.";
  if(mode==="DJ_REQUESTER"){
    if(state.requesterId===userId||await userMusicPermission(userId,"DJ")){await publishWorkerCommand(state.workerId,{type:"SKIP",roomId:room.id,guildId:guildId!});return "Track skipped.";}
    return "Only the requester or a DJ can skip in this mode.";
  }
  if(!members.some((m:any)=>m.id===userId))return "Only listeners in the configured voice channel can vote.";
  await redis.sadd(keys.votes(room.id),userId);await redis.expire(keys.votes(room.id),600);const votes=await redis.scard(keys.votes(room.id));const n=Math.max(1,members.length);
  const needed=mode==="UNANIMOUS"?n:mode==="SUPERMAJORITY"?Math.ceil(n*2/3):Math.floor(n/2)+1;
  if(votes>=needed){await redis.del(keys.votes(room.id));await publishWorkerCommand(state.workerId,{type:"SKIP",roomId:room.id,guildId:guildId!});return `${votes}/${needed} votes. Skipping.`;}
  return `${votes}/${needed} votes received.`;
}

async function openLyrics(interaction:any,room:RoomRow,state:any,locale:string){
  if(!state.workerId)return ephem(interaction,simpleEphemeral(tr(locale,"lyrics"),tr(locale,"nothingPlaying")));
  const mapKey=keys.ephemeralLyricsUserRoom(interaction.user.id,room.id); const previous=await redis.get(mapKey); if(previous)await expireEphemeralNow(previous);
  const raw=await redis.get(`music:room:${room.id}:lyrics`); const lyrics=raw?JSON.parse(raw):null;
  if(!lyrics)await publishWorkerCommand(state.workerId,{type:"LYRICS",roomId:room.id,guildId:guildId!});
  const sent=await sendEphemeral(interaction,liveLyricsPanel(room,state,lyrics,locale));
  if(!sent)return;
  const id=await trackEphemeral(clientId!,sent.token,sent.messageId,undefined,{kind:"lyrics",roomId:room.id,locale,userId:interaction.user.id});
  await redis.sadd(keys.lyricPanels(room.id),id);await redis.expire(keys.lyricPanels(room.id),16*60);
  await redis.set(mapKey,id,"PX",16*60_000);
}
async function refreshLyricsPanels(roomId:string){
  const ids:string[]=await redis.smembers(keys.lyricPanels(roomId));if(!ids.length)return;
  const room=await roomById(roomId);if(!room)return;const state=await getRoomState(roomId);const raw=await redis.get(`music:room:${roomId}:lyrics`);const lyrics=raw?JSON.parse(raw):null;
  for(const id of ids){const rec=await getEphemeral(id);if(!rec){await redis.srem(keys.lyricPanels(roomId),id);continue;}await editEphemeral(id,liveLyricsPanel(room,state,lyrics,rec.locale??room.language??"en-US"));}
}

client.on("clientReady",async()=>{
  console.log(`Controller logged in as ${client.user?.tag}`); await syncCommands(); startEphemeralJanitor(); startFeedbackAutomation(client,guildId!);
  await ensureGuild();
  void ensureEventTrophyEmojis(client,guildId!);
  void applyMisfitBranding(client,guildId!).catch(error=>console.warn('[evil-misfit] Branding deferred',error));
  for(const g of client.guilds.cache.values())if(g.id!==guildId)await g.leave().catch(()=>{});
  const guild=client.guilds.cache.get(guildId!);
  const voiceQualityChannels=new Set<string>();
  if(guild){
    for(const state of guild.voiceStates.cache.values()){
      if(state.channelId&&state.member&&!state.member.user.bot){
        await redis.set(userVoiceKey(state.id),state.channelId);
        if(state.channel)await cacheVoiceChannel(state.channel);
        voiceQualityChannels.add(state.channelId);
      }
    }
  }
  // Restart safety: release stale workers and make sessions idle, but preserve
  // queued requests. Playback only resumes when someone explicitly requests music.
  // Do not automatically rejoin Discord voice during controller startup.
  for(const room of await many<RoomRow>(`SELECT * FROM music_rooms WHERE guild_id=$1 AND enabled=TRUE`,[guildId])){
    await deleteTrackAnnouncement(room);
    const state=await getRoomState(room.id);
    if(state.historyId){
      await endListening(state.historyId).catch(()=>{});
      await db.query(`UPDATE track_history SET ended_at=COALESCE(ended_at,CURRENT_TIMESTAMP),end_reason=COALESCE(end_reason,'BOT_RESTART') WHERE id=$1`,[state.historyId]).catch(()=>{});
    }
    // Existing Redis queue is authoritative; restore the snapshot only when empty.
    const pending=await queueItems(room.id);
    if(!pending.length){const snapshot=await oneOrNone<any>(`SELECT queue_json FROM queue_snapshots WHERE room_id=$1`,[room.id]).catch(()=>null);
      let queued:any[]=snapshot?.queue_json??[];if(typeof queued==='string')try{queued=JSON.parse(queued);}catch{queued=[];}
      if(Array.isArray(queued)&&queued.length){for(const item of queued.filter((q:any)=>q?.requestId&&q?.query).slice(0,100))await enqueue(item).catch(()=>{});}}
    await redis.del(keys.votes(room.id),`music:room:${room.id}:lyrics`,`music:room:${room.id}:metadata`,keys.roomWorker(room.id)).catch(()=>{});
    if(state.workerId){
      await publishWorkerCommand(state.workerId,{type:"LEAVE",roomId:room.id,guildId:guildId!}).catch(()=>{});
      await releaseWorker(room.id,state.workerId).catch(()=>{});
    }
    await setRoomState(room.id,{status:"IDLE",updatedAt:Date.now()});
    void refreshPanel(room);
  }
  for(const channelId of voiceQualityChannels)void ensureVoiceQuality(channelId);
});

client.on("guildCreate",g=>{if(g.id!==guildId)void g.leave().catch(()=>{});else void ensureGuild();});

let pbIndexMoveTimer:NodeJS.Timeout|undefined;
client.on('messageCreate',async message=>{notifyEventMessage(client,message);if(message.guildId!==guildId||message.system||message.author.id===client.user?.id)return;try{const cfg=await pbSettings();if(!cfg?.enabled||![cfg.signup_channel_id,cfg.roster_channel_id].includes(message.channelId))return;if(pbIndexMoveTimer)clearTimeout(pbIndexMoveTimer);pbIndexMoveTimer=setTimeout(()=>void syncPortBattleDiscord(true).catch(e=>console.warn('[port-battle] index move failed',e)),1800);}catch(e){console.warn('[port-battle] index message hook failed',e);}});
async function requestPBRepairAfterDeletion(message:any){
 if(message.guildId!==guildId||pbSyncPromise)return;
 const id=String(message.id),cfg=await pbSettings();if(!cfg)return;
 const battle=await oneOrNone<any>("SELECT id FROM pb_battles WHERE guild_id=$1 AND status IN('OPEN','CLOSED') AND (discord_signup_message_id=$2 OR discord_roster_message_id=$2)",[guildId,id]);
 let schedules:any=cfg.schedule_message_ids??[];if(typeof schedules==='string')try{schedules=JSON.parse(schedules);}catch{schedules=[];}
 const index=[cfg.signup_index_message_id,cfg.roster_index_message_id,cfg.schedule_message_id,...schedules].includes(id);
 if(!battle&&!index)return;
 if(pbIndexMoveTimer)clearTimeout(pbIndexMoveTimer);pbIndexMoveTimer=setTimeout(()=>void syncPortBattleDiscord(true).catch(e=>console.warn('[pb] deleted panel repair failed',e)),1700);
}
client.on('messageDelete',message=>{void requestPBRepairAfterDeletion(message).catch(console.error);});
client.on('messageDeleteBulk',messages=>{for(const message of messages.values())void requestPBRepairAfterDeletion(message).catch(console.error);});
client.on("messageCreate",async message=>{try{await maybeWikiConversationReply(message);}catch(err){console.warn("[wiki] conversation listener failed",err);}});

client.on("messageCreate",async message=>{
  if(message.author.bot||message.guildId!==guildId||!message.member)return;
  // Requests typed directly into a Discord voice channel's built-in chat are
  // automatically attached to that voice session. We intentionally do not
  // treat ordinary server chat as music queries.
  const voiceChannelId=message.member.voice.channelId;
  if(!voiceChannelId)return;
  const deskSettings=await oneOrNone<any>('SELECT member_console_channel_id FROM membership_settings WHERE guild_id=$1',[guildId]);
  if(String(message.channelId)!==String(voiceChannelId)&&String(message.channelId)!==String(deskSettings?.member_console_channel_id??''))return;
  if(!await messageMusicPermission(message,"USE_MUSIC"))return;
  const content=message.content.trim();if(!content&&!message.attachments.size)return;
  // People chat in voice-channel text too. Only treat a message as a request when
  // it is a link, an audio attachment, or starts with "play" (e.g. "play daft punk").
  const firstAttachment=message.attachments.first();
  const prefixed=/^[!/]?(?:play|p)\s+(.+)$/i.exec(content)?.[1]?.trim();
  const link=/^https?:\/\/\S+$/i.test(content)?content:undefined;
  const query=firstAttachment?.url??prefixed??link;if(!query)return;
  try{
    const room=await ensureVoiceRoom(String(voiceChannelId));
    if(!await claimRequestWindow(room.id,message.author.id))return;
    await submit(room,query,message.author.id);
    if(room.delete_requests&&message.deletable)setTimeout(()=>void message.delete().catch(()=>{}),2500);
  }catch(err:any){await message.reply({content:`Could not queue that request: ${err.message}`,allowedMentions:{repliedUser:false}}).then(m=>setTimeout(()=>void m.delete().catch(()=>{}),8000));}
});

// When everyone leaves a voice channel, stop its music after two minutes so the
// bot isn't playing to nobody and is free for another channel.
const emptyRoomTimers=new Map<string,NodeJS.Timeout>();
const humansIn=(channelId:string)=>{const vc=client.guilds.cache.get(guildId!)?.channels.cache.get(channelId);return vc?.isVoiceBased()?[...vc.members.values()].filter(m=>!m.user.bot).length:0;};
function cancelEmptyRoomStop(channelId:string){const t=emptyRoomTimers.get(channelId);if(t){clearTimeout(t);emptyRoomTimers.delete(channelId);}}
async function scheduleEmptyRoomStop(channelId:string){
  if(humansIn(channelId)>0||emptyRoomTimers.has(channelId))return;
  const room=await roomByVoice(channelId);if(!room)return;
  if(!(await getRoomState(room.id)).workerId)return;
  const t=setTimeout(()=>{emptyRoomTimers.delete(channelId);void (async()=>{
    if(humansIn(channelId)>0)return;
    const state=await getRoomState(room.id);if(!state.workerId)return;
    diag("music-session","voice channel empty; stopping music",{roomId:room.id,voiceChannelId:channelId});
    await publishWorkerCommand(state.workerId,{type:"STOP",roomId:room.id,guildId:guildId!});
  })().catch(err=>console.warn("[music] empty-room stop failed",err));},120_000);
  t.unref?.();emptyRoomTimers.set(channelId,t);
}
client.on("voiceStateUpdate",async(oldState,newState)=>{
  try{
    if(oldState.member?.user.bot||newState.member?.user.bot)return;const userId=newState.id;if(newState.guild.id!==guildId)return;
    if(newState.channelId){
      await redis.set(userVoiceKey(userId),newState.channelId);
      if(newState.channel)await cacheVoiceChannel(newState.channel);
      // Configure the channel before the user presses Play. Editing bitrate while
      // a worker is joining can briefly renegotiate voice and sound like a mic cut-out.
      if(oldState.channelId!==newState.channelId)void ensureVoiceQuality(newState.channelId);
    }else await redis.del(userVoiceKey(userId));
    if(oldState.channelId!==newState.channelId)diagDebug("voice-state",newState.channelId?"member joined or moved voice channel":"member left voice",{userId,fromChannelId:oldState.channelId??null,toChannelId:newState.channelId??null});
    if(oldState.channelId&&oldState.channelId!==newState.channelId){const room=await roomByVoice(oldState.channelId);if(room){const state=await getRoomState(room.id);if(state.historyId)await endListening(state.historyId,userId);}}
    if(oldState.channelId&&oldState.channelId!==newState.channelId)void scheduleEmptyRoomStop(oldState.channelId);
    if(newState.channelId&&oldState.channelId!==newState.channelId)cancelEmptyRoomStop(newState.channelId);
    if(newState.channelId&&oldState.channelId!==newState.channelId){const room=await roomByVoice(newState.channelId);if(room){const state=await getRoomState(room.id);if(state.historyId&&state.status!=="IDLE")await beginListening(state.historyId,room,userId);}}
  }catch(err){console.warn("voice listener tracking failed",err);}
});

client.on("interactionCreate",async interaction=>{
  try{
    if(await handlePreferredShips(interaction,wosbApi))return;
    if(interaction.guildId!==guildId)return;
    if(await handleEventDonationRequests(interaction))return;
    if(await handleEventDonations(interaction,redis))return;
    if(interaction.isChatInputCommand()){
      if(interaction.commandName==="roast")return void await handleRoast(interaction);
      if(interaction.commandName==="banter-status")return void await handleBanterStatus(interaction);
      if(interaction.commandName==="ask")return void await sentinelAsk(interaction);
      if(interaction.commandName==="wiki")return void await handleWiki(interaction);
      if(interaction.commandName==="pb")return void await handlePb(interaction);
      if(interaction.commandName==="pb-admin")return void await handlePbAdmin(interaction);
      if(interaction.commandName==="feedback")return void await handleFeedbackCommand(interaction);
      if(interaction.commandName==="feedback-admin")return void await handleFeedbackAdminCommand(interaction,client,guildId!);
      if(await handleMembershipInteraction(interaction))return;
      if(await handleRecruitmentInteraction(interaction))return;
      if(interaction.commandName==="music"||interaction.commandName==="play")return void await handleMusicCommand(interaction);
      if(interaction.commandName==="music-admin"){
        await ensureGuild();
        if(!hasDashboardAdmin(interaction))return void await ephem(interaction,simpleEphemeral("Permission denied","You need the configured dashboard administrator role or Manage Server."));
        return void await ephem(interaction,simpleEphemeral("Music Administration",`Open the dashboard administration page to manage permissions, defaults and integrations.\n${process.env.PUBLIC_DASHBOARD_URL?`${process.env.PUBLIC_DASHBOARD_URL}/dashboard/admin`:"Dashboard URL is not configured."}`));
      }
    }
    if(await handleLegacyPBControls(interaction,{guildId:guildId!,base:pbDashboardUrl(),api:wosbApi,manager:pbManagerAllowed,refresh:async()=>{if(await redis.set(`pb:panel-refresh:${guildId}`,'1','EX',10,'NX')==='OK')await syncPortBattleDiscord(true);},panel:pbPanelForUser,officerRole:async()=>String((await pbSettings())?.manager_role_id??'')||null}))return;
    if(await handleFeedbackInteraction(interaction))return;
    if(await handleMembershipInteraction(interaction))return;
    if(await handleRecruitmentInteraction(interaction))return;
        if(interaction.isModalSubmit()&&interaction.customId.startsWith("pb:latemodal:")){const battleId=interaction.customId.split(":").at(-1)!;const value=interaction.fields.getTextInputValue("minutes").trim();const minutes=Number(value);await deferInteractionReply(interaction,{flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});if(!Number.isInteger(minutes)||minutes<5||minutes>60)return void await editInteractionReply(interaction,{content:'Enter a whole number from 5 to 60 minutes.'});const detail=await pbQuick(interaction,battleId,'LATE',minutes);return void await editInteractionReply(interaction,{components:pbComponents(detail,interaction.user.id)});}
    if(interaction.isStringSelectMenu()&&interaction.customId.startsWith("pb:ships:")){const battleId=interaction.customId.split(":").at(-1)!;return void await pbPreferredPrompt(interaction,battleId,[...interaction.values]);}
    if(interaction.isStringSelectMenu()&&interaction.customId.startsWith("pb:preferred:")){const battleId=interaction.customId.split(":").at(-1)!;return void await pbHornPrompt(interaction,battleId,[...interaction.values]);}
    if(interaction.isStringSelectMenu()&&interaction.customId.startsWith('pb:flares:')){const battleId=interaction.customId.split(':').at(-1)!;return void await pbFinishDetailed(interaction,battleId,[...interaction.values]);}
    if(interaction.isButton()&&interaction.customId.startsWith("pb:")){
      const [,action,battleId]=interaction.customId.split(":");if(!battleId)return;
      if(action==='late')return void await interaction.showModal(pbLateModal(battleId));
      if(action==='detailed')return void await pbDetailed(interaction,battleId);
      if(action==='nopref')return void await pbHornPrompt(interaction,battleId,[]);
      if(action==='hornyes'||action==='hornno')return void await pbFlarePrompt(interaction,battleId,action==='hornyes');
      if(action==='noflares')return void await pbFinishDetailed(interaction,battleId,[]);
      if(action==='attending'||action==='waitlist'){await deferInteractionReply(interaction,{flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});const detail=await pbQuick(interaction,battleId,action==='waitlist'?'WAITLIST':'ATTENDING');return void await editInteractionReply(interaction,{components:pbComponents(detail,interaction.user.id)});}
    }
    if(interaction.isModalSubmit()&&interaction.customId.startsWith("wiki:correctmodal:")){const answerId=interaction.customId.split(":").at(-1)!;const suggestion=interaction.fields.getTextInputValue("suggestion").trim();await deferInteractionReply(interaction,{flags:MessageFlags.Ephemeral});try{const x=await wikiApi("/feedback",interaction.user.id,{method:"POST",body:JSON.stringify({answerId,suggestion,surface:"discord-modal",sourceMessageId:String(interaction.message?.id??""),sourceChannelId:String(interaction.channelId??"")})});return void await editInteractionReply(interaction,{content:x.message??"Thanks — that correction is queued for moderator review."});}catch(err:any){console.warn("[wiki] correction queue failed",err);return void await editInteractionReply(interaction,{content:"I couldn’t queue that Wiki correction just now. Please try again in a moment."});}}
    if(interaction.isButton()&&interaction.customId.startsWith("wiki:correct:")){const answerId=interaction.customId.split(":").at(-1)!;return void await interaction.showModal(wikiCorrectionModal(answerId));}
    if(interaction.isButton()&&interaction.customId.startsWith("wiki:share:")){const answerId=interaction.customId.split(":").at(-1)!;await deferInteractionReply(interaction,{flags:MessageFlags.Ephemeral});try{const x=await wikiApi(`/answers/${answerId}/share`,interaction.user.id,{method:"POST",body:JSON.stringify({hours:168})});const base=(process.env.PUBLIC_DASHBOARD_URL??"").replace(/\/$/,"");return void await editInteractionReply(interaction,{content:base?`${base}${x.url}`:`Shared answer created: ${x.url}`});}catch(err:any){return void await editInteractionReply(interaction,{content:`Could not create a share link: ${String(err?.message??err).slice(0,1500)}`});}}
    if(interaction.isModalSubmit()&&interaction.customId.startsWith("music:addmodal:")){
      const roomId=interaction.customId.split(":").at(-1)!; const room=await roomById(roomId); if(!room)return;
      const query=interaction.fields.getTextInputValue("query"); if(!await hasMusicPermission(interaction,"USE_MUSIC"))return void await ephem(interaction,simpleEphemeral("Permission denied","You do not have permission to request music in this server.")); await renewPrivate(interaction,roomId);
      if(!await claimRequestWindow(room.id,interaction.user.id))return void await ephem(interaction,simpleEphemeral("Slow down","Please wait a moment before sending another request."));
      await submit(room,query,interaction.user.id);
      const locale=await userLocale(interaction.user.id,room); return void await ephem(interaction,simpleEphemeral(tr(locale,"queue"),`**${query.slice(0,120)}** → ${room.name}`));
    }
    if(interaction.isStringSelectMenu()&&interaction.customId.startsWith("music:language:")){
      const roomId=interaction.customId.split(":").at(-1)!;if(!await safeDeferUpdate(interaction))return;const room=await roomById(roomId);if(!room)return;const locale=interaction.values[0]??"en-US";
      await db.query(`INSERT INTO user_music_preferences(guild_id,user_id,language) VALUES($1,$2,$3) ON CONFLICT (guild_id,user_id) DO UPDATE SET language=EXCLUDED.language`,[guildId,interaction.user.id,locale]);
      await renewPrivate(interaction,roomId);const state=await getRoomState(roomId);return void await editInteractionReply(interaction,{components:privatePanel(room,state,undefined,locale).components});
    }
    if(interaction.isStringSelectMenu()&&/^music:filter[12]:/.test(interaction.customId)){
      const roomId=interaction.customId.split(":").at(-1)!;if(!await safeDeferUpdate(interaction))return;const room=await roomById(roomId);if(!room)return;const locale=await userLocale(interaction.user.id,room);const preset=interaction.values[0]??"";
      if(interaction.message?.id)await renewEphemeralByMessage(interaction.message.id,interaction.token);
      if(!Object.prototype.hasOwnProperty.call(FILTER_PRESETS,preset))return void await editInteractionReply(interaction,{components:filterPanel(room,locale,"That filter preset is no longer available.").components});
      if(!await hasMusicPermission(interaction,"MANAGE_FILTERS")&&!await hasMusicPermission(interaction,"DJ"))return void await editInteractionReply(interaction,{components:filterPanel(room,locale,"You need a DJ or filter-management role to change audio filters.").components});
      const state=await getRoomState(roomId);if(!state.workerId)return void await editInteractionReply(interaction,{components:filterPanel(room,locale,"Start playback before applying a filter.").components});
      await publishWorkerCommand(state.workerId,{type:"FILTER",roomId,guildId:guildId!,preset});
      return void await editInteractionReply(interaction,{components:filterPanel(room,locale,`Applied **${preset.replaceAll("_"," ")}**.`).components});
    }
    if(interaction.isStringSelectMenu()&&interaction.customId==='console:music:menu'){
      await deferInteractionReply(interaction,{flags:MessageFlags.Ephemeral});
      const room=await chooseRoomForUser(interaction);if(!room)return void await editInteractionReply(interaction,{content:'Join a voice channel first.'});
      if(!await hasMusicPermission(interaction,'USE_MUSIC'))return void await editInteractionReply(interaction,{content:'You do not have permission to use music.'});
      const action=interaction.values[0],state=await getRoomState(room.id);
      if(action==='filters')return void await editInteractionReply(interaction,filterPanel(room,'en-US'));
      if(action==='lyrics')return void await openLyrics(interaction,room,state,'en-US');
      if(action==='recommend'){const q=await recommend(guildId!,state.track?{title:state.track.title,author:state.track.author}:undefined);return void await editInteractionReply(interaction,{content:q??'No recommendation is available yet.'});}
      if(action==='skip'){const result=await requestSkip(room,state,interaction.user.id);return void await editInteractionReply(interaction,{content:result});}
      if(!await hasMusicPermission(interaction,'MANAGE_MUSIC')&&!await hasMusicPermission(interaction,'DJ'))return void await editInteractionReply(interaction,{content:'A DJ or music management role is required.'});
      if(action==='autoplay'){await db.query('UPDATE music_rooms SET autoplay=NOT autoplay WHERE id=$1',[room.id]);return void await editInteractionReply(interaction,{content:`Autoplay ${room.autoplay?'disabled':'enabled'}.`});}
      if(!state.workerId)return void await editInteractionReply(interaction,{content:'No music is playing in your voice channel.'});
      if(action==='pause')await publishWorkerCommand(state.workerId,{type:state.status==='PAUSED'?'RESUME':'PAUSE',roomId:room.id,guildId:guildId!});
      if(action==='stop')await publishWorkerCommand(state.workerId,{type:'STOP',roomId:room.id,guildId:guildId!});
      return void await editInteractionReply(interaction,{content:action==='stop'?'Playback stopped.':'Playback updated.'});
    }
    if(interaction.isButton()&&interaction.customId.startsWith("console:music:")){
      const action=interaction.customId.split(":").at(-1);const room=await chooseRoomForUser(interaction);
      if(!room)return void await ephem(interaction,simpleEphemeral("BOM Music","Join a Discord voice channel first. The Control Desk will route you to the music bot serving that room."));
      if(!await hasMusicPermission(interaction,"USE_MUSIC"))return void await ephem(interaction,simpleEphemeral("Permission denied","You do not have permission to use music controls in this server."));
      if(action==="add"){try{await interaction.showModal(modalAdd(room.id,"en-US"));}catch(err:any){if(unknownInteraction(err)){diagWarn("interaction","control-desk music request expired",{roomId:room.id,userId:interaction.user?.id??null});return;}throw err;}return;}
      if(action==="controls")return void await openPrivate(interaction,room);
      if(action==="queue"){await deferInteractionReply(interaction,{flags:MessageFlags.Ephemeral});const q=await queueItems(room.id);const lines=q.slice(0,20).map((x,i)=>`${i+1}. ${(x.display??x.query).slice(0,90)}`);return void await editInteractionReply(interaction,{content:lines.length?`**${room.name} · Queue**\n${lines.join("\n")}`:`**${room.name} · Queue**\nThe queue is empty.`});}
    }
    if(!interaction.isButton())return;
    const [scope,action,roomId]=interaction.customId.split(":"); if(scope!=="music"||!roomId)return;
    // Discord component interactions must be acknowledged in ~3 seconds. The
    // previous handler did DB/Redis work before deferUpdate(), so a slow Redis
    // stream socket could expire the interaction and crash the controller.
    // Modals are the one exception: show them immediately as the acknowledgement.
    if(action==="add"){
      try{await interaction.showModal(modalAdd(roomId,"en-US"));}catch(err:any){if(unknownInteraction(err)){diagWarn("interaction","add-music interaction expired",{roomId,userId:interaction.user?.id??null});return;}throw err;}
      return;
    }
    if(!await safeDeferUpdate(interaction))return;
    const room=await roomById(roomId); if(!room)return;
    const locale=await userLocale(interaction.user.id,room);
    await renewPrivate(interaction,roomId);
    const state=await getRoomState(roomId);
    if(action==="controls")return void await openPrivate(interaction,room);
    if(action==="close"){ const id=await redis.get(keys.ephemeralUserRoom(interaction.user.id,roomId)); if(id)await expireEphemeralNow(id); await redis.del(keys.ephemeralUserRoom(interaction.user.id,roomId)); return; }
    if(action==="queue"){ const q=await queueItems(roomId); const lines=q.slice(0,20).map((x,i)=>`${i+1}. ${(x.display??x.query).slice(0,90)}`); return void await ephem(interaction,simpleEphemeral("Queue",lines.length?lines.join("\n"):"The queue is empty.")); }
    if(action==="lyrics")return void await openLyrics(interaction,room,state,locale);
    if(action==="lyricsrefresh"){ const id=await redis.get(keys.ephemeralLyricsUserRoom(interaction.user.id,roomId));if(id){const rec=await getEphemeral(id);if(rec?.messageId===interaction.message?.id)await renewEphemeral(id,interaction.token);}await refreshLyricsPanels(roomId);return; }
    if(action==="lyricsclose"){ const id=await redis.get(keys.ephemeralLyricsUserRoom(interaction.user.id,roomId));if(id)await expireEphemeralNow(id);await redis.del(keys.ephemeralLyricsUserRoom(interaction.user.id,roomId));return; }
    if(action==="filters")return void await ephem(interaction,filterPanel(room,locale));
    if(action==="recommend"){ const q=await recommend(guildId!,state.track?{title:state.track.title,author:state.track.author}:undefined); return void await ephem(interaction,simpleEphemeral(tr(locale,"recommendations"),q??"I don't have enough listening history yet.")); }
    if(action==="pause"&&state.workerId){
      if(!await canControlRoom(room,interaction.user.id))return void await ephem(interaction,simpleEphemeral("Not allowed","Only a DJ can pause while others are listening."));
      await publishWorkerCommand(state.workerId,{type:state.status==="PAUSED"?"RESUME":"PAUSE",roomId,guildId:guildId!}); return;
    }
    if(action==="stop"){
      if(!state.workerId)return void await ephem(interaction,simpleEphemeral("Music","Nothing is playing."));
      if(!await canControlRoom(room,interaction.user.id))return void await ephem(interaction,simpleEphemeral("Not allowed","Only a DJ can stop the music while others are listening."));
      await publishWorkerCommand(state.workerId,{type:"STOP",roomId,guildId:guildId!});
      return void await ephem(interaction,simpleEphemeral("Music","Stopped and cleared the queue."));
    }
    if(action==="skip"&&state.workerId){const result=await requestSkip(room,state,interaction.user.id);return void await ephem(interaction,simpleEphemeral(tr(locale,"voteSkip"),result));}
    if(action==="more")return void await ephem(interaction,simpleEphemeral("More controls",`Dashboard: ${process.env.PUBLIC_DASHBOARD_URL??"not configured"}`));
  }catch(err:any){
    console.error("[interaction-error] Discord interaction failed",{
      interactionId:interaction.id??null,
      interactionType:interaction.type,
      commandName:interaction.isChatInputCommand()?interaction.commandName:undefined,
      customId:(interaction.isButton()||interaction.isStringSelectMenu())?interaction.customId:undefined,
      userId:interaction.user?.id??null,
      guildId:interaction.guildId??null,
      channelId:interaction.channelId??null,
      replied:interaction.isRepliable()?interaction.replied:false,
      deferred:interaction.isRepliable()?interaction.deferred:false,
      error:err
    });
    if('customId' in interaction&&String(interaction.customId??'').startsWith('pb:')&&interaction.isRepliable()){const payload={content:`Port Battle action failed: ${String(err?.message??'Please try again.').slice(0,1000)}`,allowedMentions:{parse:[]}};if(interaction.deferred||interaction.replied)await editInteractionReply(interaction,payload).catch(()=>{});else await interaction.reply({...payload,flags:MessageFlags.Ephemeral}).catch(()=>{});return;}
    await sentinelRecord({source:"controller",category:"interaction",action:"discord.interaction.failed",actorId:interaction.user?.id??null,executorId:client.user?.id??"bom",targetId:interaction.id??null,channelId:interaction.channelId??null,severity:"error",outcome:"failed",metadata:{interactionType:interaction.type,commandName:interaction.isChatInputCommand()?interaction.commandName:undefined,customId:(interaction.isButton()||interaction.isStringSelectMenu())?interaction.customId:undefined,error:err?.message??String(err)}}).catch(()=>{});
    if(interaction.isRepliable()){
      const music=String((interaction as any).customId??'').startsWith('music:')||String((interaction as any).customId??'').startsWith('console:music:');
      const payload={content:`${music?'Music':'Guild service'}: ${String(err?.message??'Something went wrong. Please try again.').slice(0,1500)}`,allowedMentions:{parse:[]}};
      if(interaction.deferred||interaction.replied)await editInteractionReply(interaction,payload).catch(()=>{});else await interaction.reply({...payload,flags:MessageFlags.Ephemeral}).catch(()=>{});
    }
  }
});


async function controllerCommandLoop(){
  let last=await streamTailId(keys.controllerCommands);
  for(;;){
    try{
      const res=await controllerCommandRedis.xread("BLOCK",5000,"COUNT",25,"STREAMS",keys.controllerCommands,last) as any; if(!res)continue;
      for(const [,items] of res)for(const [id,fields] of items){
        last=id; const i=fields.indexOf("payload"); if(i<0)continue;
        const c=JSON.parse(fields[i+1]);
        if(c.type==='REFRESH_MEMBERSHIP'){if(c.guildId===guildId)await refreshMembershipSurfaces(client,c.old);continue;}
        const traceId=String(c.actionId??c.traceId??randomUUID());
        if(c.actionId){const once=await redis.set(`music:action:${c.actionId}:processed`,"1","EX",300,"NX");if(!once){diag("music-action","duplicate command ignored",{traceId,type:c.type,roomId:c.roomId??null});continue;}}
        diag("music-action","controller received action",{traceId,streamId:id,type:c.type,roomId:c.roomId??null,requesterId:c.requesterId??null,query:c.type==="QUEUE"?safeQuery(c.query):undefined});
        await sentinelRecord({source:"dashboard",category:"music",action:`music.command.${String(c.type).toLowerCase()}`,actorId:String(c.requesterId??"system"),initiatorId:String(c.requesterId??"system"),executorId:client.user?.id??"bom",targetId:c.roomId?String(c.roomId):null,correlationId:traceId,metadata:{streamId:id,type:c.type,roomId:c.roomId??null,index:c.index??null,positionMs:c.positionMs??null,preset:c.preset??null,volume:c.volume??null,query:c.type==="QUEUE"?safeQuery(c.query):undefined}});
        const room=await roomById(String(c.roomId)); if(!room){diagWarn("music-action","room/session not found",{traceId,roomId:c.roomId??null,type:c.type});continue;}
        if(c.type==="REFRESH_ROOM"){await refreshPanel(room);continue;}
        if(c.type==="QUEUE"&&typeof c.query==="string")await submit(room,c.query,String(c.requesterId??"dashboard"),traceId,{origin:"USER",surface:"DASHBOARD"});
        else if(c.type==="QUEUE_CLEAR"){await redis.del(keys.roomQueue(room.id));await checkpointRoom(guildId!,room.id);await audit(guildId!,String(c.requesterId??"system"),"queue.clear",{roomId:room.id});await refreshPanel(room);}
        else if(c.type==="QUEUE_REMOVE"&&Number.isInteger(c.index)){const items=await queueItems(room.id);if(c.index>=0&&c.index<items.length){const [removed]=items.splice(c.index,1);await redis.del(keys.roomQueue(room.id));for(const item of items)await enqueue(item);await checkpointRoom(guildId!,room.id);await audit(guildId!,String(c.requesterId??"system"),"queue.remove",{roomId:room.id,index:c.index,requestId:removed?.requestId});await refreshPanel(room);}}
        else {
          const state=await getRoomState(room.id); if(!state.workerId){diagWarn("music-action","control ignored because room has no active worker",{traceId,type:c.type,roomId:room.id,status:state.status});continue;}
          if(c.type==="VOTE_SKIP"){await requestSkip(room,state,String(c.requesterId??""));continue;}
          if(c.type==="SKIP_TO"){
            if(!state.requestId||state.requestId!==c.currentRequestId||!(await queueItems(room.id)).some((item:any)=>item.requestId===c.requestId)){diagWarn("music-action","skip-to ignored because playback or queue changed",{roomId:room.id});continue;}
            const saved=await redis.set(`music:room:${room.id}:skip-to`,JSON.stringify({current:state.requestId,target:c.requestId}),"EX",30,"NX");if(!saved){diagWarn("music-action","skip-to already pending",{roomId:room.id});continue;}
            await publishWorkerCommand(state.workerId,{type:"SKIP",roomId:room.id,guildId:guildId!,expectedRequestId:state.requestId});continue;
          }
          if(c.type==="PAUSE")await publishWorkerCommand(state.workerId,{type:"PAUSE",roomId:room.id,guildId:guildId!});
          if(c.type==="RESUME")await publishWorkerCommand(state.workerId,{type:"RESUME",roomId:room.id,guildId:guildId!});
          if(c.type==="SKIP")await publishWorkerCommand(state.workerId,{type:"SKIP",roomId:room.id,guildId:guildId!});
          if(c.type==="STOP")await publishWorkerCommand(state.workerId,{type:"STOP",roomId:room.id,guildId:guildId!});
          if(c.type==="SEEK"&&Number.isFinite(c.positionMs))await publishWorkerCommand(state.workerId,{type:"SEEK",roomId:room.id,guildId:guildId!,positionMs:Number(c.positionMs)});
          if(c.type==="FILTER"&&typeof c.preset==="string"){await publishWorkerCommand(state.workerId,{type:"FILTER",roomId:room.id,guildId:guildId!,preset:c.preset});await db.query(`INSERT INTO room_music_settings(room_id,saved_filter) VALUES($1,$2) ON CONFLICT (room_id) DO UPDATE SET saved_filter=EXCLUDED.saved_filter`,[room.id,c.preset]);}
          if(c.type==="VOLUME"&&Number.isFinite(c.volume))await publishWorkerCommand(state.workerId,{type:"VOLUME",roomId:room.id,guildId:guildId!,volume:Number(c.volume)});
        }
      }
    }catch(err){ console.error("[controller-command-error] stream processing failed",{stream:keys.controllerCommands,lastStreamId:last,error:err}); await new Promise(r=>setTimeout(r,1200)); }
  }
}

async function recoverFailedRoom(roomId:string,workerId:string,reason:string){
  await sentinelRecord({source:"controller",category:"music",action:"music.room.recovery_started",executorId:client.user?.id??"bom",targetId:roomId,severity:"warning",metadata:{roomId,workerId,reason}});
  const lock=`music:room:${roomId}:recovery-lock`; if(!await redis.set(lock,"1","EX",15,"NX"))return;
  try{
    const state=await getRoomState(roomId);
    if(state.workerId&&state.workerId!==workerId)return;
    const room=await roomById(roomId);
    if(room)await deleteTrackAnnouncement(room);
    if(state.historyId){
      await endListening(state.historyId);
      await db.query(`UPDATE track_history SET ended_at=COALESCE(ended_at,CURRENT_TIMESTAMP),end_reason=COALESCE(end_reason,$2) WHERE id=$1`,[state.historyId,reason.slice(0,64)]);
    }
    await redis.del(keys.votes(roomId));
    await releaseWorker(roomId,workerId);
    await quarantineWorker(workerId,reason,reason.includes("restarted")?25:60).catch(()=>{});
    await setRoomState(roomId,{...state,status:"ERROR",workerId:undefined,error:reason,updatedAt:Date.now()});
    if(room){
      const restartLike=/restarted|heartbeat|lease|stopped reporting/i.test(reason);
      if(restartLike){
        const recoverySettings=await roomFeatureSettings(guildId!,room.id);
        if(!recoverySettings.recoverQueue){await musicTrace(roomId,'RECOVERY_PAUSED',{detail:'Automatic recovery is disabled; request music to resume saved queue'});await setRoomState(roomId,{status:"IDLE",updatedAt:Date.now()});await refreshPanel(room);return;}
        // Requeue one interrupted active track after surviving queued requests.
        // Never replay it more than once per request ID, even across restarts.
        const replayKey=`music:recovery-once:${state.requestId??'none'}`;
        if(state.requestId&&state.track&&await redis.set(replayKey,'1','EX',86400,'NX')){
          const query=String(state.originalQuery??`${state.track.author} ${state.track.title}`).trim();
          if(query){const replay:QueueItem={requestId:state.requestId,roomId,guildId:guildId!,voiceChannelId:room.voice_channel_id,query,requesterId:state.requesterId??'recovery',requestedAt:Date.now(),traceId:`recover:${state.requestId}`,source:'USER',surface:'SYSTEM',originalQuery:query};
            await enqueue(replay);await checkpointRoom(guildId!,roomId);}
        }
        // Preserve user queue and snapshot across a transient worker failure.
        // Retry queued work through the normal worker-health recovery loop.
        await redis.del(keys.votes(roomId),`music:room:${roomId}:lyrics`,`music:room:${roomId}:metadata`).catch(()=>{});
        await setRoomState(roomId,{status:"ERROR",error:`Worker reconnect: ${reason}`,updatedAt:Date.now()});
        await refreshPanel(room);
        return;
      }
      const next=await dequeue(roomId);
      if(next){try{await startItem(room,next);}catch(err:any){await enqueue(next);await setRoomState(roomId,{...state,status:"ERROR",workerId:undefined,error:`${reason}; retry waiting: ${err?.message??"no worker available"}`,updatedAt:Date.now()});await refreshPanel(room);}}
      else if(state.origin==='AUTOPLAY'&&state.track&&state.requestId&&await redis.set(`music:autoplay:retry-once:${state.requestId}`,'1','EX',3600,'NX')){
        diagWarn('autoplay','worker error, trying another recommendation',{roomId,requestId:state.requestId});
        await playNext(roomId);
      }else await refreshPanel(room);
    }
  }finally{await redis.del(lock).catch(()=>{});}
}

async function workerHealthSweep(){
  try{
    const rooms=await many<RoomRow>(`SELECT * FROM music_rooms WHERE guild_id=$1 AND enabled=TRUE`,[guildId]);
    for(const room of rooms){
      const state=await getRoomState(room.id);
      if(state.status==="IDLE")continue;
      if(!state.workerId){
        if(state.status==="ERROR"){
          const retryLock=`music:room:${room.id}:retry-lock`;
          if(await redis.set(retryLock,"1","EX",8,"NX")){
            const next=await dequeue(room.id);if(next){try{await startItem(room,next);}catch{await enqueue(next);}}
          }
        }
        continue;
      }
      const age=Date.now()-Number(state.updatedAt??0);
      const [heartbeat,lease,mapped,quarantine]=await Promise.all([redis.get(keys.workerHeartbeat(state.workerId)),redis.get(keys.workerLease(state.workerId)),redis.get(keys.roomWorker(room.id)),redis.get(`music:worker:${state.workerId}:quarantine`)]);
      let hb:any=null;try{hb=heartbeat?JSON.parse(heartbeat):null;}catch{}const healthScore=hb?Math.max(0,100-Math.min(35,Number(hb.lavalinkPingMs??0)/20)-Math.min(25,Number(hb.eventLoopLagMs??0)/4)-Math.min(30,Number(hb.recentFailures??0)*7)):0;void recordWorkerHealth(guildId!,state.workerId,hb,Math.round(healthScore),quarantine);
      const ownershipBroken=!heartbeat||lease!==room.id||mapped!==state.workerId;
      const playerSilent=(state.status==="PLAYING"||state.status==="PAUSED")&&age>75_000;
      if((ownershipBroken&&age>20_000)||playerSilent)await recoverFailedRoom(room.id,state.workerId,playerSilent?"Worker stopped reporting player updates":"Worker heartbeat or room lease expired");
    }
  }catch(err){console.warn("worker health sweep failed",err);}
}

async function beginHistory(e:any,fallbackReason:string|null=null){
  const h=await db.query(`INSERT INTO track_history(guild_id,room_id,requester_id,identifier,title,author,source_name,uri,artwork_url,isrc,duration_ms) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,[guildId,e.roomId,e.requesterId,e.track.identifier,e.track.title,e.track.author,e.track.sourceName,e.track.uri??null,e.track.artworkUrl??null,e.track.isrc??null,e.track.length]);
  const historyId=String(h.insertId??"");const r=e.track?.resolution??{};
  if(historyId)await db.query(`INSERT INTO track_provenance(history_id,guild_id,origin,surface,requested_query,resolver_strategy,resolver_provider,resolver_score,resolution_attempts,fallback_reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,[historyId,guildId,e.origin??"USER",e.surface??"SYSTEM",e.originalQuery??null,r.strategy??null,r.provider??null,r.score??null,r.attempts??null,fallbackReason]);
  return historyId;
}

async function eventLoop(){
  const cursorKey=`music:events:controller-cursor:${guildId}`;
  let last=await redis.get(cursorKey)??await streamTailId(keys.events);
  for(;;){
    try{
      const res=await workerEventRedis.xread("BLOCK",5000,"COUNT",25,"STREAMS",keys.events,last) as any;
      if(!res)continue;
      for(const [,items] of res)for(const [id,fields] of items){
        last=id; const idx=fields.indexOf("payload"); if(idx<0)continue;
        try{const e=JSON.parse(fields[idx+1]) as WorkerEvent;await onWorkerEvent(e);}catch(err){console.error('worker event handling failed',{eventId:id,error:err});}
        await redis.set(cursorKey,id).catch(()=>{});
      }
    }catch(err){console.error("[worker-event-error] worker event stream processing failed",{stream:keys.events,lastStreamId:last,error:err});await new Promise(r=>setTimeout(r,1200));}
  }
}
async function onWorkerEvent(e:WorkerEvent){
  if('roomId' in e&&e.roomId&&e.type!=='PLAYER_UPDATE'){
    if(e.type==='METRIC'&&e.metric==='lavalink_resolve_ms')await musicTrace(e.roomId,'RESOLVE',{durationMs:e.valueMs,requestId:e.requestId});
    else if(['TRACK_START','TRACK_END','TRACK_FALLBACK','ERROR','STATE'].includes(e.type))await musicTrace(e.roomId,e.type,{requestId:(e as any).requestId,detail:(e as any).message??(e as any).reason??null});
  }

  if(e.type!=="PLAYER_UPDATE"&&e.type!=="METRIC")await sentinelRecord({source:"worker",category:"music",action:`worker.${String(e.type).toLowerCase()}`,executorId:String((e as any).workerId??"worker"),targetId:String((e as any).requestId??(e as any).roomId??"" )||null,channelId:null,correlationId:(e as any).traceId??null,severity:e.type==="ERROR"?"error":"info",outcome:e.type==="ERROR"?"failed":"observed",metadata:e as any});
  if(e.type==="METRIC"){await metric(guildId!,e.metric,e.valueMs,{workerId:e.workerId,roomId:e.roomId,requestId:e.requestId,traceId:e.traceId,...(e.details??{})});return;}
  if(e.type==="READY"){
    // A restarted worker must never resurrect playback. If stale ownership
    // survived long enough to be observed, clear it instead of recovering it.
    const rooms=await many<RoomRow>(`SELECT * FROM music_rooms WHERE guild_id=$1 AND enabled=TRUE`,[guildId]);
    for(const room of rooms){
      const state=await getRoomState(room.id);
      if(state.workerId===e.workerId){
        await redis.del(keys.roomWorker(room.id),keys.workerLease(e.workerId)).catch(()=>{});
        await setRoomState(room.id,{status:"IDLE",updatedAt:Date.now()});
        void refreshPanel(room);
      }
    }
    return;
  }
  if(e.type==="TRACK_START"){
    diag("playback","TRACK_START received",{traceId:e.traceId,requestId:e.requestId,workerId:e.workerId,roomId:e.roomId,title:e.track.title,author:e.track.author,source:e.track.sourceName});
    const pending=await getRoomState(e.roomId);
    if((pending.workerId&&pending.workerId!==e.workerId)||(pending.requestId&&pending.requestId!==e.requestId)){
      await publishWorkerCommand(e.workerId,{type:"STOP",roomId:e.roomId,guildId:guildId!}).catch(()=>{}); return;
    }
    const historyId=await beginHistory(e);
    await setRoomState(e.roomId,{status:"PLAYING",workerId:e.workerId,track:e.track,position:0,requesterId:e.requesterId,requestId:e.requestId,historyId,origin:e.origin,surface:e.surface,originalQuery:e.originalQuery,updatedAt:Date.now()});
    await redis.rpush(keys.roomSessionHistory(e.roomId),JSON.stringify({title:e.track.title,author:e.track.author}));
    await redis.del(keys.votes(e.roomId),`music:room:${e.roomId}:lyrics`,`music:room:${e.roomId}:metadata`);
    const room=await roomById(e.roomId); if(room){await snapshotListeners(room,historyId);await postTrackAnnouncement(room,e.track,e.requesterId);if(room.default_filter&&room.default_filter!=="flat")await publishWorkerCommand(e.workerId,{type:"FILTER",roomId:e.roomId,guildId:guildId!,preset:room.default_filter});}
    if(e.origin==='AUTOPLAY'||e.origin==='RADIO')await redis.set(`music:room:${e.roomId}:autoplay-diagnostics`,JSON.stringify({status:'PLAYING',at:new Date().toISOString(),track:`${e.track.author} — ${e.track.title}`.slice(0,160)}),'EX',86400).catch(()=>{});
    await publishWorkerCommand(e.workerId,{type:"LYRICS",roomId:e.roomId,guildId:guildId!});
    void enrichTrack(e.track).then(async metadata=>{await redis.set(`music:room:${e.roomId}:metadata`,JSON.stringify(metadata),"EX",6*3600);await redis.publish("music:live",JSON.stringify({type:"METADATA",roomId:e.roomId}));const current=await getRoomState(e.roomId);if(current.requestId===e.requestId){const rr=await roomById(e.roomId);if(rr){await refreshPanel(rr);await refreshTrackAnnouncement(rr,e.track,e.requesterId,metadata,Number(current.position??0));}}}).catch(err=>console.warn("metadata enrichment failed",err));
  } else if(e.type==="TRACK_FALLBACK"){
    const previous=await getRoomState(e.roomId);if(previous.workerId&&previous.workerId!==e.workerId)return;
    if(previous.historyId){await endListening(previous.historyId);await db.query(`UPDATE track_history SET ended_at=CURRENT_TIMESTAMP,end_reason='SOURCE_FALLBACK' WHERE id=$1 AND ended_at IS NULL`,[previous.historyId]);}
    const historyId=await beginHistory(e,e.reason);
    await setRoomState(e.roomId,{status:"PLAYING",workerId:e.workerId,track:e.track,position:0,requesterId:e.requesterId,requestId:e.requestId,historyId,origin:e.origin,surface:e.surface,originalQuery:e.originalQuery,error:undefined,updatedAt:Date.now()});
    await redis.del(`music:room:${e.roomId}:lyrics`,`music:room:${e.roomId}:metadata`);const room=await roomById(e.roomId);if(room){await snapshotListeners(room,historyId);await refreshPanel(room);}
    if(e.origin==='AUTOPLAY'||e.origin==='RADIO')await redis.set(`music:room:${e.roomId}:autoplay-diagnostics`,JSON.stringify({status:'PLAYING',at:new Date().toISOString(),track:`${e.track.author} — ${e.track.title}`.slice(0,160)}),'EX',86400).catch(()=>{});
    await publishWorkerCommand(e.workerId,{type:"LYRICS",roomId:e.roomId,guildId:guildId!});
    void enrichTrack(e.track).then(async metadata=>{await redis.set(`music:room:${e.roomId}:metadata`,JSON.stringify(metadata),"EX",6*3600);const rr=await roomById(e.roomId);if(rr)await refreshPanel(rr);}).catch(()=>{});
  } else if(e.type==="PLAYER_UPDATE"){
    const s=await getRoomState(e.roomId); if(s.workerId&&s.workerId!==e.workerId)return;
    await setRoomState(e.roomId,{...s,workerId:e.workerId,position:e.position,updatedAt:Date.now()}); await renewRoomLease(e.roomId,e.workerId); void refreshLyricsPanels(e.roomId);
  } else if(e.type==="STATE"){
    const s=await getRoomState(e.roomId); if(s.workerId&&s.workerId!==e.workerId)return;
    await setRoomState(e.roomId,{...s,workerId:e.workerId,status:e.status,updatedAt:Date.now()}); const room=await roomById(e.roomId); if(room)await refreshPanel(room);
  } else if(e.type==="TRACK_END"){
    const endReason=String(e.reason??"FINISHED");
    if(endReason.toUpperCase()==="REPLACED"){
      const current=await getRoomState(e.roomId);
      const sameOwner=!current.workerId||current.workerId===e.workerId;
      const sameRequest=!e.requestId||!current.requestId||e.requestId===current.requestId;
      if(sameOwner&&sameRequest){diagDebug("playback-fallback","ignored non-terminal TRACK_END reason=replaced",{traceId:e.traceId,requestId:e.requestId,workerId:e.workerId,roomId:e.roomId});return;}
    }
    diag("playback","TRACK_END received",{traceId:e.traceId,requestId:e.requestId,workerId:e.workerId,roomId:e.roomId,reason:endReason});
    const ending=await getRoomState(e.roomId);
    if((ending.workerId&&ending.workerId!==e.workerId)||(e.requestId&&ending.requestId&&e.requestId!==ending.requestId))return;
    const endRoom=await roomById(e.roomId);if(endRoom)await deleteTrackAnnouncement(endRoom);
    if(ending.historyId)await endListening(ending.historyId);
    if(ending.historyId)await db.query(`UPDATE track_history SET ended_at=CURRENT_TIMESTAMP,end_reason=$2 WHERE id=$1 AND ended_at IS NULL`,[ending.historyId,e.reason??"FINISHED"]);
    await redis.del(keys.votes(e.roomId));
    if((e.reason??"").toUpperCase()==="STOPPED"){ const room=await roomById(e.roomId); await redis.del(keys.roomQueue(e.roomId)); await setRoomState(e.roomId,{status:"IDLE",updatedAt:Date.now()}); await releaseWorker(e.roomId,e.workerId); if(room)await refreshPanel(room); }
    else {const key=`music:room:${e.roomId}:skip-to`,raw=await redis.get(key);let target:string|undefined;if(raw){await redis.del(key);try{const pending=JSON.parse(raw);if(e.reason==='SKIPPED'&&pending.current===e.requestId)target=pending.target;}catch{}}await playNext(e.roomId,target);}
  } else if(e.type==="LYRICS"){
    const s=await getRoomState(e.roomId);if(s.workerId&&s.workerId!==e.workerId)return;
    await redis.set(`music:room:${e.roomId}:lyrics`,JSON.stringify(e.lyrics),"EX",3600); await redis.publish(`music:room:${e.roomId}:live`,JSON.stringify({kind:"lyrics"})); void refreshLyricsPanels(e.roomId);
  } else if(e.type==="ERROR"&&e.roomId){
    diagWarn("playback-error","worker reported error",{traceId:e.traceId,requestId:e.requestId,workerId:e.workerId,roomId:e.roomId,fatal:Boolean(e.fatal),message:e.message});
    const s=await getRoomState(e.roomId);
    if((s.workerId&&s.workerId!==e.workerId)||(e.requestId&&s.requestId&&e.requestId!==s.requestId))return;
    const room=await roomById(e.roomId);
    if(e.fatal)await recoverFailedRoom(e.roomId,e.workerId,e.message);
    else{await setRoomState(e.roomId,{...s,error:e.message,updatedAt:Date.now()});if(room)await refreshPanel(room);}
  }
}



function cronFieldMatch(field:string,value:number){if(field==="*")return true;return field.split(",").some(part=>{if(part.includes("/")){const [base,stepRaw]=part.split("/"),step=Math.max(1,Number(stepRaw)||1);return (base==="*"||Number(base)<=value)&&value%step===0;}if(part.includes("-")){const [a,b]=part.split("-").map(Number);return value>=a&&value<=b;}return Number(part)===value;});}
function cronMatches(expr:string,timezone:string,date=new Date()){
  const parts=expr.trim().split(/\s+/);if(parts.length!==5)return false;
  const values=new Intl.DateTimeFormat("en-US",{timeZone:timezone||"UTC",minute:"2-digit",hour:"2-digit",day:"2-digit",month:"2-digit",weekday:"short",hour12:false}).formatToParts(date);
  const get=(t:string)=>values.find(x=>x.type===t)?.value??"0";const dowMap:any={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
  const minute=Number(get("minute")),hour=Number(get("hour"))%24,day=Number(get("day")),month=Number(get("month")),dow=dowMap[get("weekday")]??0;
  return cronFieldMatch(parts[0],minute)&&cronFieldMatch(parts[1],hour)&&cronFieldMatch(parts[2],day)&&cronFieldMatch(parts[3],month)&&cronFieldMatch(parts[4],dow);
}

let bomRadioSweeping=false;
async function dedicatedBomRadioSweep(){
  if(bomRadioSweeping)return;bomRadioSweeping=true;
  try{
    const conf=await oneOrNone<any>(`SELECT voice_channel_id,stream_url,enabled FROM bom_radio_settings WHERE guild_id=$1`,[guildId]);
    if(!conf?.enabled||!conf.voice_channel_id||!conf.stream_url){await redis.del(`music:radio:reserved:${guildId}`).catch(()=>{});return;}
    await redis.set(`music:radio:reserved:${guildId}`,'8','EX',150);
    const guild=client.guilds.cache.get(guildId!);
    const channel=await guild?.channels.fetch(String(conf.voice_channel_id)).catch(()=>null);
    if(!channel?.isVoiceBased())return;
    const room=await ensureVoiceRoom(String(conf.voice_channel_id));
    if(String(room.preferred_worker_id??'')!=='8')await db.query(`UPDATE music_rooms SET preferred_worker_id='8',autoplay=TRUE WHERE id=$1`,[room.id]);
    const state=await getRoomState(room.id);
    if(state.workerId&&['PLAYING','BUFFERING','PAUSED'].includes(String(state.status)))return;
    // Claim one maintenance iteration across restarts/processes.
    const lock=`music:radio:boot:${guildId}`;
    if(!await redis.set(lock,'1','EX',45,'NX'))return;
    try{const refreshed=await roomByVoice(String(conf.voice_channel_id));if(refreshed)await submit(refreshed,String(conf.stream_url),'BOM Radio',`radio:${randomUUID()}`,{origin:'RADIO',surface:'SYSTEM'});}catch(err){console.warn('[bom-radio] could not start station',err);}
  }catch(err){console.warn('[bom-radio] maintenance failed',err);}finally{bomRadioSweeping=false;}
}
async function scheduledRadioSweep(){
  try{const rows=await many<any>(`SELECT * FROM scheduled_radio WHERE guild_id=$1 AND enabled=TRUE`,[guildId]);for(const schedule of rows){if(!schedule.voice_channel_id||!cronMatches(schedule.cron_expr,schedule.timezone,new Date()))continue;const lock=`music:schedule:${schedule.id}:${new Date().toISOString().slice(0,16)}`;if(!await redis.set(lock,"1","EX",120,"NX"))continue;const room=await ensureVoiceRoom(schedule.voice_channel_id);await db.query(`INSERT INTO room_music_settings(room_id,autoplay_profile,mood) VALUES($1,$2,$3) ON CONFLICT (room_id) DO UPDATE SET autoplay_profile=EXCLUDED.autoplay_profile,mood=EXCLUDED.mood`,[room.id,schedule.profile,schedule.mood??null]);const recent=await oneOrNone<any>(`SELECT title,author FROM track_history WHERE guild_id=$1 ORDER BY RANDOM() LIMIT 1`,[guildId]);await musicTrace(room.id,'RECOMMENDATION',{profile:schedule.profile});
    const q=await smartRecommendation(guildId!,schedule.profile,schedule.mood,recent??undefined,[]);if(q)await submit(room,q,"BOM Radio",`schedule:${schedule.id}:${randomUUID()}`,{origin:"SCHEDULE",surface:"SYSTEM"});await db.query(`UPDATE scheduled_radio SET last_started_at=CURRENT_TIMESTAMP WHERE id=$1`,[schedule.id]);await audit(guildId!,schedule.created_by??"system","radio.schedule.start",{scheduleId:schedule.id,roomId:room.id});}}catch(err){console.warn("scheduled radio sweep failed",err);}
}

startAutomationEngine(client,guildId!);
void eventLoop();
void controllerCommandLoop();
const workerWatchdog=setInterval(()=>void workerHealthSweep(),10_000);workerWatchdog.unref();
const radioScheduler=setInterval(()=>void scheduledRadioSweep(),30_000);radioScheduler.unref();void scheduledRadioSweep();
const dedicatedRadioTimer=setInterval(()=>void dedicatedBomRadioSweep(),60_000);dedicatedRadioTimer.unref();setTimeout(()=>void dedicatedBomRadioSweep(),12000).unref();
const portBattleScheduler=setInterval(()=>void portBattleSweep(),10_000);portBattleScheduler.unref();
await client.login(token);
// Real guild voice snapshot comes from the connected bot gateway, never the
// optional and incomplete public Discord server widget JSON.
const publishGuildVoice=async()=>{try{
  const guild=client.guilds.cache.get(String(guildId));if(!guild||!client.isReady())return;
  const channels=new Map<string,{id:string;name:string;position:number;members:any[]}>();
  for(const state of guild.voiceStates.cache.values()){
    const ch=state.channel;if(!ch||!state.member||state.member.user?.bot)continue;
    const id=String(ch.id);let row=channels.get(id);
    if(!row){row={id,name:String(ch.name),position:Number(ch.rawPosition??0),members:[]};channels.set(id,row);}
    const m=state.member;row.members.push({id:String(m.id),username:String(m.displayName??m.user.username),avatar:m.displayAvatarURL({extension:'png',size:128}),channelId:id,status:'online'});
  }
  const voiceChannels=[...channels.values()].sort((a,b)=>a.position-b.position);
  const members=voiceChannels.flatMap(c=>c.members);
  await redis.set(`platform:voice:live:${guildId}`,JSON.stringify({at:Date.now(),members,voiceChannels}), 'EX',45);
}catch(error){console.warn('[voice-presence] snapshot failed',error);}};
client.on('voiceStateUpdate',()=>{void publishGuildVoice();});
const voiceSnapshotTimer=setInterval(()=>void publishGuildVoice(),12_000);voiceSnapshotTimer.unref();
client.once('clientReady',()=>{void publishGuildVoice();});
const platformHeartbeat=async()=>{try{await redis.set(`platform:heartbeat:controller:${guildId}`,JSON.stringify({service:"controller",at:Date.now(),user:client.user?.tag??null,ready:client.isReady()}),"EX",45);}catch{}};
await platformHeartbeat();const platformHeartbeatTimer=setInterval(()=>void platformHeartbeat(),15_000);platformHeartbeatTimer.unref();
setTimeout(()=>void portBattleSweep(),2500);
