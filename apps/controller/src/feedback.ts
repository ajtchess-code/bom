import {sendBotDm} from './dmDelivery.js';
import {randomUUID} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {
  ActionRowBuilder,ChannelType,Client,EmbedBuilder,
  MessageFlags,ModalBuilder,PermissionFlagsBits,SlashCommandBuilder,TextInputBuilder,TextInputStyle
} from "discord.js";
import {db,many,oneOrNone} from "@bom/db";
import {canDiscordDm} from './notifications.js';

const here=dirname(fileURLToPath(import.meta.url));
const releaseDir=join(here,"../../../data/releases");
const dashboardAdminRoleId=(process.env.DASHBOARD_ADMIN_ROLE_ID??"").trim();
const dashboardBase=(process.env.PUBLIC_DASHBOARD_URL??"").replace(/\/$/,"");
const clean=(v:any,max=5000)=>String(v??'').replace(/\0/g,'').trim().slice(0,max);
const json=(v:any,f:any)=>{if(v==null)return f;if(typeof v==='string')try{return JSON.parse(v);}catch{return f;}return v;};

export const feedbackCommands=[
  new SlashCommandBuilder().setName("feedback").setDescription("Open the BOM bug, suggestion and feedback center"),
  new SlashCommandBuilder().setName("feedback-admin").setDescription("Configure BOM feedback and automated changelog delivery")
    .addSubcommand((sc:any)=>sc.setName("setup").setDescription("Configure Feedback Center Discord channels")
      .addChannelOption((o:any)=>o.setName("feedback_channel").setDescription("Channel for the permanent Feedback Center panel").setRequired(true).addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement))
      .addChannelOption((o:any)=>o.setName("changelog_channel").setDescription("Channel where new release changelogs are posted automatically").setRequired(true).addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement)))
    .addSubcommand((sc:any)=>sc.setName("refresh").setDescription("Refresh the Feedback Center panel and post any pending changelogs"))
];

function isAdmin(interaction:any){
  if(interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild))return true;
  const member=interaction.member;const roles=[...(member?.roles?.cache?.keys?.()??(Array.isArray(member?.roles)?member.roles:[]))].map(String);
  return Boolean(dashboardAdminRoleId&&roles.includes(dashboardAdminRoleId));
}

async function api(path:string,userId:string,init:RequestInit={}){
  const base=(process.env.INTERNAL_API_URL??"http://127.0.0.1:4100").replace(/\/$/,"");
  const h=new Headers(init.headers);h.set("x-internal-token",process.env.INTERNAL_API_TOKEN??"");h.set("x-discord-user-id",userId);if(init.body&&!h.has("content-type"))h.set("content-type","application/json");
  const r=await fetch(`${base}/v1/feedback${path}`,{...init,headers:h,signal:AbortSignal.timeout(15_000)});const text=await r.text();let body:any={};try{body=text?JSON.parse(text):{};}catch{body={error:text}}if(!r.ok)throw new Error(body?.message??body?.error??`Feedback request failed (${r.status})`);return body;
}

function centerComponents(){
  const actions:any[]=[
    {type:2,style:1,label:"Report a Bug",emoji:{name:"🐛"},custom_id:"feedback:new:bug"},
    {type:2,style:1,label:"Suggest Something",emoji:{name:"💡"},custom_id:"feedback:new:suggestion"},
    {type:2,style:2,label:"Leave Feedback",emoji:{name:"💬"},custom_id:"feedback:new:feedback"}
  ];
  const links:any[]=[];if(dashboardBase){links.push({type:2,style:5,label:"Open Feedback Center",url:`${dashboardBase}/dashboard/feedback`});links.push({type:2,style:5,label:"Releases",url:`${dashboardBase}/dashboard/feedback?tab=releases`});}
  return [{type:17,accent_color:0xd8a93a,components:[
    {type:10,content:"### BOM Feedback Center\nReport problems, suggest improvements, leave private feedback, and follow what changes in each release."},
    {type:14,divider:true,spacing:1},{type:1,components:actions},...(links.length?[{type:1,components:links}]:[])
  ]}];
}

function bugModal(){return new ModalBuilder().setCustomId("feedback:modal:bug").setTitle("Report a Bug").addComponents(
  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("title").setLabel("Short summary").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(180).setPlaceholder("Ship Builder fails when I change hulls")),
  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("area").setLabel("Where did it happen?").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setPlaceholder("Ship Builder, Port Battles, Wiki, Music...")),
  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("actual").setLabel("What happened?").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1800)),
  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("steps").setLabel("How can we reproduce it?").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1200)),
  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("expected").setLabel("What did you expect instead?").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000))
);}
function suggestionModal(){return new ModalBuilder().setCustomId("feedback:modal:suggestion").setTitle("Make a Suggestion").addComponents(
  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("title").setLabel("Suggestion title").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(180)),
  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("area").setLabel("Area").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setPlaceholder("Port Battles, Dashboard, Music...")),
  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("idea").setLabel("What should we add or change?").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(2200)),
  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("why").setLabel("Why would this be useful?").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1200))
);}
function generalModal(){return new ModalBuilder().setCustomId("feedback:modal:feedback").setTitle("Leave Feedback").addComponents(
  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("title").setLabel("Subject").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(180)),
  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("area").setLabel("Area").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100)),
  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("body").setLabel("Feedback").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(3000))
);}

async function submitModal(interaction:any,type:"BUG"|"SUGGESTION"|"FEEDBACK"){
  await interaction.deferReply({flags:MessageFlags.Ephemeral});let title='',category='Other',description='',details:any={};
  if(type==='BUG'){title=interaction.fields.getTextInputValue('title');category=interaction.fields.getTextInputValue('area');const actual=interaction.fields.getTextInputValue('actual'),steps=interaction.fields.getTextInputValue('steps'),expected=interaction.fields.getTextInputValue('expected');description=actual;details={steps,expected};}
  else if(type==='SUGGESTION'){title=interaction.fields.getTextInputValue('title');category=interaction.fields.getTextInputValue('area');description=interaction.fields.getTextInputValue('idea');details={benefit:interaction.fields.getTextInputValue('why')};}
  else{title=interaction.fields.getTextInputValue('title');category=interaction.fields.getTextInputValue('area')||'General';description=interaction.fields.getTextInputValue('body');}
  try{
    const x=await api('/items',interaction.user.id,{method:'POST',body:JSON.stringify({type,title,category,description,details,surface:'discord',private:type==='FEEDBACK'})});
    const dup=Array.isArray(x.possibleDuplicates)&&x.possibleDuplicates.length?`\n\n**Possible related ${type==='BUG'?'reports':'items'}:**\n${x.possibleDuplicates.slice(0,3).map((d:any)=>`• ${d.key} — ${d.title}`).join('\n')}\nStaff can merge these during triage.`:'';
    await interaction.editReply({content:`**${x.item?.key??'Feedback'} created** — ${x.item?.title??title}${dup}${dashboardBase?`\n\n${dashboardBase}/dashboard/feedback`:''}`});
  }catch(err:any){await interaction.editReply({content:`Could not submit feedback: ${clean(err?.message??err,1500)}`});}
}

export async function handleFeedbackCommand(interaction:any){
  await interaction.reply({flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral,components:centerComponents() as any});
}

async function publishPanel(client:Client,guildId:string){
  const s=await oneOrNone<any>(`SELECT * FROM feedback_settings WHERE guild_id=$1`,[guildId]);if(!s?.feedback_channel_id)return null;const guild=client.guilds.cache.get(guildId),channel=guild?.channels.cache.get(String(s.feedback_channel_id))??await guild?.channels.fetch(String(s.feedback_channel_id)).catch(()=>null);if(!channel?.isTextBased()||!("send" in channel))return null;
  const components=centerComponents() as any;
  let message:any=null;if(s.discord_panel_message_id){try{const old=await (channel as any).messages.fetch(String(s.discord_panel_message_id));message=await old.edit({components});}catch{}}
  if(!message)message=await (channel as any).send({components,flags:MessageFlags.IsComponentsV2});
  await db.query(`UPDATE feedback_settings SET discord_panel_message_id=$2,updated_at=CURRENT_TIMESTAMP WHERE guild_id=$1`,[guildId,String(message.id)]);return message;
}

async function importReleaseManifests(guildId:string){
  let names:string[]=[];try{names=(await readdir(releaseDir)).filter((n:string)=>n.endsWith('.json')).sort();}catch{return;}
  for(const name of names){try{const m=json(await readFile(join(releaseDir,name),'utf8'),{}),version=clean(m.version,80),title=clean(m.title,180);if(!version||!title)continue;await db.query(`INSERT INTO feedback_releases(id,guild_id,version,title,summary,sections,source,released_at,created_by) VALUES($1,$2,$3,$4,$5,$6::jsonb,'MANIFEST',$7,'release-manifest') ON CONFLICT(guild_id,version) DO UPDATE SET title=EXCLUDED.title,summary=EXCLUDED.summary,sections=EXCLUDED.sections,source='MANIFEST',released_at=EXCLUDED.released_at,updated_at=CURRENT_TIMESTAMP`,[randomUUID(),guildId,version,title,clean(m.summary,6000),JSON.stringify(Array.isArray(m.sections)?m.sections:[]),m.releasedAt?new Date(m.releasedAt):new Date()]);}catch(err){console.warn('[feedback-release] manifest import failed',name,err);}}
}

function releaseEmbed(row:any){
  const sections=json(row.sections,[]);const embed=new EmbedBuilder().setColor(0xd8a93a).setTitle(`${row.version} · ${row.title}`).setDescription(clean(row.summary,4000)||'BOM update').setTimestamp(new Date(row.released_at));
  for(const s of sections.slice(0,8)){const items=Array.isArray(s.items)?s.items:[];embed.addFields({name:clean(s.title,250)||'Changes',value:(items.length?items.slice(0,12).map((x:any)=>`• ${clean(x,220)}`).join('\n'):'No additional notes.').slice(0,1024)});}
  if(dashboardBase)embed.setURL(`${dashboardBase}/dashboard/feedback?tab=releases`);embed.setFooter({text:'BOM Command Deck · Automated Changelog'});return embed;
}

export async function publishPendingReleases(client:Client,guildId:string){
  await importReleaseManifests(guildId);const settings=await oneOrNone<any>(`SELECT * FROM feedback_settings WHERE guild_id=$1`,[guildId]);const channelId=String(settings?.changelog_channel_id??process.env.CHANGELOG_CHANNEL_ID??'');if(!channelId||settings?.auto_release_posts===false)return 0;const guild=client.guilds.cache.get(guildId),channel=guild?.channels.cache.get(channelId)??await guild?.channels.fetch(channelId).catch(()=>null);if(!channel?.isTextBased()||!("send" in channel))return 0;
  const pending=await many<any>(`SELECT * FROM feedback_releases WHERE guild_id=$1 AND discord_message_id IS NULL ORDER BY released_at ASC`,[guildId]);let count=0;for(const r of pending){try{const msg=await (channel as any).send({embeds:[releaseEmbed(r)]});await db.query(`UPDATE feedback_releases SET discord_message_id=$3,discord_posted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE guild_id=$1 AND id=$2`,[guildId,r.id,String(msg.id)]);count++;}catch(err){console.warn('[feedback-release] Discord changelog post failed',r.version,err);break;}}return count;
}

async function deliverNotifications(client:Client,guildId:string){
  const rows=await many<any>(`SELECT * FROM feedback_notifications WHERE guild_id=$1 AND delivered_at IS NULL ORDER BY created_at LIMIT 50`,[guildId]);for(const row of rows){const p=json(row.payload,{});try{if(!await canDiscordDm(String(row.recipient_id),'feedback')){await db.query(`UPDATE feedback_notifications SET delivered_at=CURRENT_TIMESTAMP,delivery_error='suppressed_by_preference' WHERE id=$1`,[row.id]);continue;}const user=client.users.cache.get(String(row.recipient_id))??await client.users.fetch(String(row.recipient_id));await sendBotDm(user,`**${p.key??'BOM feedback'} updated**\n${p.title??''}\nStatus: **${String(p.status??'Updated').replaceAll('_',' ')}**${dashboardBase?`\n${dashboardBase}/dashboard/feedback`:''}`);await db.query(`UPDATE feedback_notifications SET delivered_at=CURRENT_TIMESTAMP WHERE id=$1`,[row.id]);}catch(err:any){await db.query(`UPDATE feedback_notifications SET delivered_at=CURRENT_TIMESTAMP,delivery_error=$2 WHERE id=$1`,[row.id,clean(err?.message??err,1000)]);}}
}

export function startFeedbackAutomation(client:Client,guildId:string){
  void publishPendingReleases(client,guildId).catch(err=>console.warn('[feedback-release] startup publish failed',err));
  const releaseTimer=setInterval(()=>void publishPendingReleases(client,guildId).catch(err=>console.warn('[feedback-release] publish sweep failed',err)),60_000);releaseTimer.unref?.();
  const notificationTimer=setInterval(()=>void deliverNotifications(client,guildId).catch(err=>console.warn('[feedback] notification sweep failed',err)),30_000);notificationTimer.unref?.();
}

export async function handleFeedbackAdminCommand(interaction:any,client:Client,guildId:string){
  if(!isAdmin(interaction))return void await interaction.reply({content:'You need the configured dashboard administrator role or Manage Server.',flags:MessageFlags.Ephemeral});const sub=interaction.options.getSubcommand();await interaction.deferReply({flags:MessageFlags.Ephemeral});
  if(sub==='setup'){const feedback=interaction.options.getChannel('feedback_channel',true),changelog=interaction.options.getChannel('changelog_channel',true);await db.query(`INSERT INTO feedback_settings(guild_id,feedback_channel_id,changelog_channel_id,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT(guild_id) DO UPDATE SET feedback_channel_id=EXCLUDED.feedback_channel_id,changelog_channel_id=EXCLUDED.changelog_channel_id,updated_by=EXCLUDED.updated_by,updated_at=CURRENT_TIMESTAMP`,[guildId,feedback.id,changelog.id,interaction.user.id]);await publishPanel(client,guildId);const posted=await publishPendingReleases(client,guildId);return void await interaction.editReply({content:`Feedback Center configured. Permanent panel: <#${feedback.id}> · automated changelog: <#${changelog.id}>.${posted?` Posted ${posted} pending release${posted===1?'':'s'}.`:''}`});}
  if(sub==='refresh'){await publishPanel(client,guildId);const posted=await publishPendingReleases(client,guildId);return void await interaction.editReply({content:`Feedback Center refreshed.${posted?` Posted ${posted} pending release${posted===1?'':'s'}.`:' No pending releases needed posting.'}`});}
}

export async function handleFeedbackInteraction(interaction:any){
  if(interaction.isButton?.()&&interaction.customId?.startsWith('feedback:new:')){const kind=interaction.customId.split(':').at(-1);if(kind==='bug')await interaction.showModal(bugModal());else if(kind==='suggestion')await interaction.showModal(suggestionModal());else if(kind==='feedback')await interaction.showModal(generalModal());return true;}
  if(interaction.isModalSubmit?.()&&interaction.customId?.startsWith('feedback:modal:')){const kind=interaction.customId.split(':').at(-1);if(kind==='bug')await submitModal(interaction,'BUG');else if(kind==='suggestion')await submitModal(interaction,'SUGGESTION');else if(kind==='feedback')await submitModal(interaction,'FEEDBACK');return true;}
  return false;
}
