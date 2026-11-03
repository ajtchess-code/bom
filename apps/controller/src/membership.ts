import {samePBPanel} from './pbPresentation.js';
import {redis} from '@bom/redis';
import {installLeaveJobs,safelyEnsureLeaveThread,syncLeaveLifecycle} from './leaveLifecycle.js';
import {installRejoinRecovery} from './rejoinRecovery.js';
import {DESK_DESTINATIONS,deskPayload,musicDeskPayload,battleDiplomacyPayload} from './deskPresentation.js';
import {sendBotDm} from './dmDelivery.js';
import '@bom/shared/dist/mapFonts.js';
import {welcomePanelPosition} from './welcomePosition.js';
import sharp from 'sharp';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {parseLeaveDate} from './leaveDates.js';
import {welcomeGlyphs} from './welcomeGlyphs.js';
import {
  ActionRowBuilder,AttachmentBuilder,ButtonBuilder,ButtonStyle,ChannelType,EmbedBuilder,
  MessageFlags,MessageType,ModalBuilder,PermissionFlagsBits,SlashCommandBuilder,StringSelectMenuBuilder,
  TextInputBuilder,TextInputStyle,UserSelectMenuBuilder
} from 'discord.js';
import {db,many,oneOrNone} from '@bom/db';
import {sentinelRecord} from './sentinel.js';

const guildId=process.env.DISCORD_GUILD_ID??'';
const dashboard=(process.env.PUBLIC_DASHBOARD_URL??process.env.DASHBOARD_PUBLIC_URL??'https://dashboard.bandofmisfits.org').replace(/\/$/,'');
const templatePath=join(process.cwd(),'apps/controller/assets/welcome-template-clean.png');
const logoPath=join(process.cwd(),'apps/controller/assets/bom-logo.png');
const welcomeTimers=new Map<string,NodeJS.Timeout>();
const welcomePinCleanupDone=new Set<string>();
const consoleTimers=new Map<string,NodeJS.Timeout>();
let latestClient:any=null;
let afterDeskMove:((channelId:string)=>Promise<void>)|undefined;
let deskRefreshQueue:Promise<any>=Promise.resolve();
let deskMapCache:any=null;
async function deskBattleMap(detailed=false){
 if(!detailed&&deskMapCache&&Date.now()-deskMapCache.at<20000)return deskMapCache;
 const base=(process.env.INTERNAL_API_URL??'http://127.0.0.1:4100').replace(/\/$/,'');
 const response=await fetch(`${base}/v1/wosb/territory/desk-image${detailed?'?detail=1':''}`,{headers:{'x-internal-token':process.env.INTERNAL_API_TOKEN??''},signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error(`Battle map API ${response.status}`);
 const data:any=await response.json(),image=Buffer.from(data.image,'base64'),allianceImage=Buffer.from(data.allianceImage,'base64');
 if(image.subarray(1,4).toString()!=='PNG'||allianceImage.subarray(1,4).toString()!=='PNG')throw new Error('Map image unavailable');
 const result={at:Date.now(),image,allianceImage,summary:data.summary,hash:createHash('sha256').update(image).update(allianceImage).update(data.summary).digest('hex').slice(0,16),generatedAt:data.generatedAt};
 if(!detailed)deskMapCache=result;return result;
}
let welcomeAssetValidation:Promise<void>|null=null;
let welcomeRefreshQueue:Promise<any>=Promise.resolve(null);
const WELCOME_RENDERER_FILE='welcome-v437.png';
const EXTENDED_LEAVE_NOTICE='For an extended leave, please apply in-game to the **BoM 2nd guild** so your place in the community is retained while you are away.';

export const membershipCommands=[
  new SlashCommandBuilder().setName('profile').setDescription('Open your Band of Misfits roster profile'),
  new SlashCommandBuilder().setName('role-request').setDescription('Open the dashboard to request or update your personal custom role'),
  new SlashCommandBuilder().setName('leave-remove').setDescription('Mark a member as returned from leave').addUserOption(o=>o.setName('member').setDescription('Member to remove from active leave').setRequired(true)),
  new SlashCommandBuilder().setName('membership-admin').setDescription('Manage BOM membership automation')
    .addSubcommand(sc=>sc.setName('refresh-welcome').setDescription('Repair and move the Welcome panel to the bottom of its channel'))
    .addSubcommand(sc=>sc.setName('refresh-console').setDescription('Repair the BOM Control Desk'))
    .addSubcommand(sc=>sc.setName('prefix').setDescription('Set or remove a Guild Prefix rule')
      .addRoleOption(o=>o.setName('role').setDescription('Discord role that receives the prefix').setRequired(true))
      .addStringOption(o=>o.setName('tag').setDescription('Prefix such as [BOM]; omit to remove').setRequired(false)))
    .addSubcommand(sc=>sc.setName('connect').setDescription('Connect one role to up to five automatically assigned roles')
      .addRoleOption(o=>o.setName('source').setDescription('Source role').setRequired(true))
      .addRoleOption(o=>o.setName('first').setDescription('First linked role').setRequired(false))
      .addRoleOption(o=>o.setName('second').setDescription('Second linked role').setRequired(false))
      .addRoleOption(o=>o.setName('third').setDescription('Third linked role').setRequired(false))
      .addRoleOption(o=>o.setName('fourth').setDescription('Fourth linked role').setRequired(false))
      .addRoleOption(o=>o.setName('fifth').setDescription('Fifth linked role').setRequired(false)))
];

function xml(v:string){return v.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':'&quot;',"'":'&apos;'}[c]!));}
function parseJson(v:any,fallback:any){try{return typeof v==='string'?JSON.parse(v):v??fallback;}catch{return fallback;}}
function validUrl(v:any){try{const u=new URL(String(v??''));return /^https?:$/.test(u.protocol)?u.toString():null;}catch{return null;}}
async function settings(){await db.query(`INSERT INTO membership_settings(guild_id) VALUES($1) ON CONFLICT DO NOTHING`,[guildId]);return oneOrNone<any>(`SELECT * FROM membership_settings WHERE guild_id=$1`,[guildId]);}
function isManager(member:any,s:any){return Boolean(member?.permissions?.has?.(PermissionFlagsBits.ManageGuild)||member?.roles?.cache?.has?.(String(s?.custom_role_approval_role_id??''))||member?.roles?.cache?.has?.(String(s?.diplomacy_role_id??'')));}
function dashboardLink(path:string){return dashboard?`${dashboard}${path}`:path;}

async function membershipApi(path:string,userId:string,init:RequestInit={}){const base=(process.env.INTERNAL_API_URL??'http://127.0.0.1:4100').replace(/\/$/,'');const headers=new Headers(init.headers);headers.set('x-internal-token',process.env.INTERNAL_API_TOKEN??'');headers.set('x-discord-user-id',userId);if(init.body&&!headers.has('content-type'))headers.set('content-type','application/json');const r=await fetch(`${base}/v1/membership${path}`,{...init,headers,signal:AbortSignal.timeout(15_000)});const text=await r.text();let body:any={};try{body=text?JSON.parse(text):{};}catch{body={error:text};}if(!r.ok)throw new Error(body?.message??body?.error??`Membership request failed (${r.status})`);return body;}

async function validateWelcomeAssets(){
  if(!welcomeAssetValidation)welcomeAssetValidation=(async()=>{
    const template=sharp(templatePath);
    const meta=await template.metadata();
    if(meta.format!=='png'||Number(meta.width)<1700||Number(meta.height)<500)throw new Error(`Welcome template has unexpected dimensions/format (${meta.width}x${meta.height} ${meta.format??'unknown'}).`);
    if(!meta.hasAlpha)throw new Error('Welcome template must preserve its transparent alpha channel.');
    const stats=await template.stats();
    const alpha=stats.channels[3];
    if(!alpha||alpha.min>=250)throw new Error('Welcome template alpha channel is fully opaque; refusing to publish a potentially broken banner.');
    const logo=await sharp(logoPath).metadata();
    if(!logo.width||!logo.height)throw new Error('BOM logo could not be decoded.');
  })().catch(err=>{welcomeAssetValidation=null;throw err;});
  return welcomeAssetValidation;
}

/** Render display names as vector outlines rather than relying on fonts in
 * Novonode's minimal container image (which can have no Fontconfig config).
 * The letter shapes are static drawings, not an installed or embedded font.
 */
function welcomeTitleShapes(name:string){
  const phrase='Welcome, '+name;
  const glyph=(char:string)=>welcomeGlyphs[char]??welcomeGlyphs['?'];
  const total=[...phrase].reduce((n,char)=>n+Number(glyph(char)?.[0]??920),0);
  const scale=Math.min(72/2048,860/Math.max(total,1));
  let advance=0;
  const shapes=[...phrase].map((char,index)=>{
    const [width,path]=glyph(char)??[920,''];
    const x=advance*scale;
    advance+=width;
    return path?`<path d="${path}" fill="${index<'Welcome, '.length?'#101d36':'#a97320'}" transform="translate(${x.toFixed(2)} 111) scale(${scale.toFixed(6)} -${scale.toFixed(6)})"/>`:'';
  }).join('');
  return Buffer.from(`<svg width="940" height="135" xmlns="http://www.w3.org/2000/svg">${shapes}</svg>`);
}

async function renderWelcomeBanner(member:any|null,s:any){
  await validateWelcomeAssets();
  const raw=String(member?.displayName??s?.welcome_last_joiner_name??'Captain').trim();
  // Preserve supported Latin/extended characters; use the username if the
  // displayed name cannot be drawn by the portable title glyph set.
  const candidate=(raw||'Captain').slice(0,32);
  const fallback=String(member?.user?.username??'Captain').slice(0,32);
  const supported=(v:string)=>[...v].every(c=>Boolean(welcomeGlyphs[c]));
  const display=supported(candidate)?candidate:(supported(fallback)?fallback:'Captain');
  const titleSvg=welcomeTitleShapes(display);
  const composites:any[]=[{input:titleSvg,left:430,top:133}];
  const avatarUrl=member?.displayAvatarURL?.({extension:'png',size:512})??s?.welcome_last_joiner_avatar??null;
  if(avatarUrl){try{
    const r=await fetch(avatarUrl,{signal:AbortSignal.timeout(10000)});
    if(r.ok){
      const buf=Buffer.from(await r.arrayBuffer());
      const circle=Buffer.from('<svg width="288" height="288" xmlns="http://www.w3.org/2000/svg"><circle cx="144" cy="144" r="144" fill="white"/></svg>');
      const avatar=await sharp(buf).resize(288,288,{fit:'cover',position:'centre'}).composite([{input:circle,blend:'dest-in'}]).png().toBuffer();
      // Gold portrait frame in the 1841×547 approved artwork is centered at
      // approximately (1654,317). Do not paint over the frame itself.
      composites.push({input:avatar,left:1510,top:173});
    }
  }catch(err){console.warn('[membership] welcome avatar fetch failed',err);}}
  const output=await sharp(templatePath).composite(composites).png({compressionLevel:8}).toBuffer();
  const meta=await sharp(output).metadata();
  if(meta.width!==1841||meta.height!==547)throw new Error('Welcome renderer returned unexpected image dimensions.');
  return output;
}

async function cleanupLegacyWelcomePinNotices(channel:any,client:any){
  const key=String(channel.id);if(welcomePinCleanupDone.has(key))return;welcomePinCleanupDone.add(key);
  try{
    const recent=await channel.messages.fetch({limit:100});
    const cutoff=Date.now()-7*24*60*60*1000;
    const botId=String(client.user?.id??'');
    const notices=recent.filter((m:any)=>m.type===MessageType.ChannelPinnedMessage&&String(m.author?.id??'')===botId&&Number(m.createdTimestamp??0)>=cutoff);
    for(const notice of notices.values())if(notice.deletable)await notice.delete().catch(()=>{});
  }catch{}
}

function welcomeButtons(s:any,recruitmentEnabled=false){
  const row=new ActionRowBuilder<ButtonBuilder>();const apply=validUrl(s?.application_url);
  if(recruitmentEnabled)row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Primary).setLabel('Apply to BOM').setCustomId('recruitment:apply'));else if(apply)row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Apply to BOM').setURL(apply));else row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel('Apply to BOM').setCustomId('membership:welcome:apply-missing').setDisabled(true));
  row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('Trade with Misfits').setCustomId('membership:welcome:trade').setDisabled(!s?.trade_role_id));
  row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Primary).setLabel('Diplomacy').setCustomId('membership:welcome:diplo').setDisabled(!s?.diplomacy_enabled));
  return row;
}

async function refreshWelcomePanelNow(client:any,member:any|null=null,force=false){
  const s=await settings();if(!s?.welcome_enabled||!s?.welcome_channel_id)return null;const guild=client.guilds.cache.get(guildId);if(!guild)return null;const channel=await guild.channels.fetch(String(s.welcome_channel_id)).catch(()=>null);if(!channel||!channel.isTextBased()||channel.isDMBased?.())return null;await cleanupLegacyWelcomePinNotices(channel,client);
  const {existing,hasNewer}=await welcomePanelPosition(channel,s.welcome_panel_message_id);
  if(existing?.pinned)await existing.unpin('Welcome panel uses soft-sticky placement').catch(()=>{});
  // Routine sweeps do not regenerate artwork or repost an already-last panel.
  if(existing&&!hasNewer&&!force)return existing;
  let joiner=member;if(!joiner&&s.welcome_last_joiner_id)joiner=await guild.members.fetch(String(s.welcome_last_joiner_id)).catch(()=>null);
  const banner=await renderWelcomeBanner(joiner,s),file=new AttachmentBuilder(banner,{name:WELCOME_RENDERER_FILE});
  const recruitment=await oneOrNone<any>(`SELECT enabled FROM recruitment_settings WHERE guild_id=$1`,[guildId]).catch(()=>null);
  const container:any={type:17,accent_color:0xD9AA3C,components:[{type:12,items:[{media:{url:`attachment://${WELCOME_RENDERER_FILE}`},description:`Welcome ${String(joiner?.displayName??s?.welcome_last_joiner_name??'Captain')} to Band of Misfits`}]} ,welcomeButtons(s,Boolean(recruitment?.enabled)).toJSON()]};
  const payload={flags:MessageFlags.IsComponentsV2,components:[container],files:[file],allowedMentions:{parse:[]}};
  // Settings/manual refreshes edit in place if channel order has not changed.
  if(existing&&!hasNewer)return existing.edit({...payload,content:null,embeds:[],attachments:[]});
  const msg=await channel.send(payload);
  try{await db.query(`UPDATE membership_settings SET welcome_panel_message_id=$2 WHERE guild_id=$1`,[guildId,msg.id]);}
  catch(error){await msg.delete().catch(()=>{});throw error;}
  if(existing)await existing.delete().catch(()=>{});
  return msg;
}
export function refreshWelcomePanel(client:any,member:any|null=null,force=false){
  // Serialize repairs/reposts so the 30-second repair sweep and the message-create
  // debounce cannot race each other into publishing duplicate Welcome panels.
  const run=welcomeRefreshQueue.then(()=>refreshWelcomePanelNow(client,member,force),()=>refreshWelcomePanelNow(client,member,force));
  welcomeRefreshQueue=run.catch(()=>null);
  return run;
}
function scheduleWelcomeMove(client:any,delay=4500){const old=welcomeTimers.get(guildId);if(old)clearTimeout(old);const t=setTimeout(()=>void refreshWelcomePanel(client,null,false).catch(e=>console.warn('[membership] welcome refresh failed',e)),delay);t.unref?.();welcomeTimers.set(guildId,t);}

async function activeLeaves(){return many<any>(`SELECT * FROM member_leaves WHERE guild_id=$1 AND status='AWAY' ORDER BY return_at ASC LIMIT 1000`,[guildId]);}
function refreshMemberConsole(client:any,force=false){const task=deskRefreshQueue.catch(()=>{}).then(()=>refreshMemberConsoleNow(client,force));deskRefreshQueue=task;return task;}
async function deskMessage(channel:any,id:any){if(!id)return null;try{return await channel.messages.fetch({message:String(id),force:true});}catch(e:any){if(Number(e?.code)===10008)return null;throw e;}}
async function refreshMemberConsoleNow(client:any,force=false){
 const s=await settings();if(!s?.member_console_channel_id)return null;const guild=client.guilds.cache.get(guildId);if(!guild)return null;
 const channel=await guild.channels.fetch(String(s.member_console_channel_id));if(!channel?.isTextBased()||channel.isDMBased?.())return null;
 const old=[await deskMessage(channel,s.music_desk_message_id),await deskMessage(channel,s.battle_map_message_id),await deskMessage(channel,s.member_console_message_id)];
 const rooms=await many<any>('SELECT controller_message_id FROM music_rooms WHERE guild_id=$1 AND text_channel_id=$2',[guildId,String(channel.id)]);
 const managedIds=new Set([...old.filter(Boolean).map(m=>String(m.id)),...rooms.map(r=>String(r.controller_message_id))]);
 let move=old.some(m=>!m||!m.flags?.has?.(32768));
 if(old[2]){const newer=await channel.messages.fetch({after:String(old[2].id),limit:100,cache:false});if(newer.some((m:any)=>!m.system&&!managedIds.has(String(m.id))))move=true;
  // A newly started player must be above the persistent desk group.
  if(rooms.some(r=>/^\d+$/.test(String(r.controller_message_id))&&BigInt(r.controller_message_id)>BigInt(old[2].id)))move=true;
 }
 if(old.every(Boolean)&&!(BigInt(old[0].id)<BigInt(old[1].id)&&BigInt(old[1].id)<BigInt(old[2].id)))move=true;
 let map;try{map=await deskBattleMap();}catch(e){await db.query('UPDATE wosb_territory_settings SET last_sync_error=$2 WHERE guild_id=$1',[guildId,String((e as any)?.message??e).slice(0,500)]).catch(()=>{});console.warn('[desk] retaining existing surfaces after map failure',e);if(old.some(Boolean))return old[2];throw e;}
 const names=[`battle-map-${map.hash}.png`,`alliance-chart-${map.hash}.png`];
 const bodies:any[]=[musicDeskPayload(dashboard),{...battleDiplomacyPayload(map.summary,names[0],names[1],dashboard),files:[new AttachmentBuilder(map.image,{name:names[0]}),new AttachmentBuilder(map.allianceImage,{name:names[1]})]},deskPayload(dashboard,Boolean(s.leave_enabled))];
 const columns=['music_desk_message_id','battle_map_message_id','member_console_message_id'];
 // Keep only verified missing messages replaceable. Permission/network failures propagate.
 const made:any[]=[];
 for(let i=0;i<bodies.length;i++){
  const body=bodies[i],existing=old[i];
  if(existing?.pinned)await existing.unpin('Control Desk uses unpinned bottom placement');
  if(!move&&existing){const wire=existing.components?.map((c:any)=>c.toJSON?.()??c)??[];
   if(!samePBPanel(existing,body)||i===1&&!existing.attachments?.some((a:any)=>a.name===names[0]))await existing.edit({...body,content:null,embeds:[],...(i===1?{attachments:[]}: {})});made.push(existing);continue;}
  const message=await channel.send(body);
  try{await db.query(`UPDATE membership_settings SET ${columns[i]}=$2,updated_at=now() WHERE guild_id=$1`,[guildId,message.id]);}catch(e){await message.delete().catch(()=>{});throw e;}
  made.push(message);
  if(existing&&String(existing.id)!==String(message.id))await existing.delete();
 }
 await db.query('UPDATE wosb_territory_settings SET last_sync_at=now(),last_sync_error=NULL WHERE guild_id=$1',[guildId]);
 return made[2];
}
function scheduleConsoleMove(client:any,delay=1700){const old=consoleTimers.get(guildId);if(old)clearTimeout(old);const t=setTimeout(()=>void refreshMemberConsole(client,false).catch(e=>console.warn('[membership] control desk refresh failed',e)),delay);t.unref?.();consoleTimers.set(guildId,t);}

function leaveModal(title='Leave of Absence',preset=''){return new ModalBuilder().setCustomId('membership:leave:modal').setTitle(title).addComponents(
  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('when').setLabel('Expected return (e.g. in 14 days)').setStyle(TextInputStyle.Short).setMaxLength(40).setRequired(true).setPlaceholder('in 14 days / August 6th / 16 August').setValue(preset)),
  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason (optional)').setStyle(TextInputStyle.Paragraph).setMaxLength(500).setRequired(false).setPlaceholder('Away from game / work trip / vacation…'))
);}
async function leaveRecord(userId:string){return oneOrNone<any>(`SELECT * FROM member_leaves WHERE guild_id=$1 AND user_id=$2 AND status='AWAY' ORDER BY started_at DESC LIMIT 1`,[guildId,userId]);}
/** Remove any old BOM/BoM2/AFK tags, including adjacent duplicated tags. */
function stripGuildTags(value:string,configured:string[]=[]){
  let base=String(value??'').trim();
  const tags=[...new Set(['[BOM]','[BoM 2]','[AFK]',...configured])].filter(Boolean).sort((a,b)=>b.length-a.length);
  for(let i=0;i<16;i++){
    const tag=tags.find(x=>base.toLowerCase().startsWith(x.toLowerCase()));
    if(!tag)break;
    base=base.slice(tag.length).trimStart();
  }
  return base||'Member';
}
async function memberForLeave(userId:string){
  const guild=latestClient?.guilds.cache.get(guildId);if(!guild)throw new Error('BOM Discord guild is unavailable.');
  const member=await guild.members.fetch(userId).catch(()=>null);
  if(!member||member.user?.bot)throw new Error('The member is no longer in Discord.');
  if(!member.manageable)throw new Error('The bot cannot manage this member nickname (role hierarchy/owner).');
  return member;
}
async function withLeaveLock<T>(userId:string,work:()=>Promise<T>):Promise<T>{
 const key=`leave:mutation:${guildId}:${userId}`,token=randomUUID();
 if(await redis.set(key,token,'EX',120,'NX')!=='OK')throw Error('A leave update is already processing. Check your leave status before retrying.');
 try{return await work();}finally{await redis.eval("if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",1,key,token).catch(()=>{});}
}
async function startAfk(userId:string,until:Date,reason:string|null,actorId:string,checkinId:string|null=null){return withLeaveLock(userId,()=>startAfkUnlocked(userId,until,reason,actorId,checkinId));}
async function startAfkUnlocked(userId:string,until:Date,reason:string|null,actorId:string,checkinId:string|null=null){
  const s=await settings();
  if(!s?.leave_enabled)throw new Error('Leave is disabled.');
  const bomMemberId=String(s?.member_role_id??''),bomAfkId=String(s?.afk_role_id??'');
  const bom2MemberId=String(s?.bom2_member_role_id??''),bom2AfkId=String(s?.bom2_afk_role_id??'');
  const member=await memberForLeave(userId);
  const existing=await leaveRecord(userId);
  // Updating an active leave must work even if a member has already lost the
  // original membership role or Admiralty has since changed its role mapping.
  if(existing?.role_transition_state==='APPLIED'){
    await db.query(`UPDATE member_leaves SET return_at=$3,reason=$4,reminded=FALSE,reminder_message_id=NULL,updated_at=NOW() WHERE guild_id=$1 AND id=$2`,[guildId,existing.id,until,reason]);
    return {id:existing.id,updated:true};
  }
  const bom=Boolean(bomMemberId&&member.roles.cache.has(bomMemberId));
  const bom2=Boolean(bom2MemberId&&member.roles.cache.has(bom2MemberId));
  if(bom&&bom2)throw new Error('Member holds both BOM and BoM 2 membership roles. Admiralty must resolve the overlap before assigning an AFK role.');
  // Already-away members can update their return date using their recorded guild.
  const previousRoles=new Set<string>((parseJson(existing?.removed_role_ids,[]) as unknown[]).map(String));
  const group=bom2?'BOM2':bom?'BOM':previousRoles.has(bom2MemberId)&&bom2MemberId?'BOM2':previousRoles.has(bomMemberId)&&bomMemberId?'BOM':null;
  if(!group)throw new Error('Member has no configured BOM or BoM 2 membership role. Configure the correct guild role before starting leave.');
  const memberId=group==='BOM2'?bom2MemberId:bomMemberId;
  const afkId=group==='BOM2'?bom2AfkId:bomAfkId;
  if(!memberId||!afkId||memberId===afkId)throw new Error(`Configure separate ${group==='BOM2'?'BoM 2':'BOM'} membership and AFK roles in Membership Admin first.`);
  if([bomMemberId,bom2MemberId].filter(Boolean).includes(afkId)||[bomAfkId,bom2AfkId].filter(Boolean).includes(memberId))throw new Error('A guild membership role cannot also be an AFK role.');
  const memberRole=await member.guild.roles.fetch(memberId).catch(()=>null),afkRole=await member.guild.roles.fetch(afkId).catch(()=>null);
  if(!memberRole||!afkRole||!memberRole.editable||!afkRole.editable)throw new Error('The configured membership/AFK roles do not exist or are higher than the bot role.');
  const eligible=[...new Set<string>([memberId,...(parseJson(s.leave_member_role_ids,[]) as unknown[]).map(String)])]
    .filter(x=>x&&x!==bomAfkId&&x!==bom2AfkId);
  const removedRoleIds=eligible.filter(id=>member.roles.cache.has(id));
  const removableRoles:any[]=[];
  for(const rid of removedRoleIds){const role=await member.guild.roles.fetch(rid).catch(()=>null);if(!role||!role.editable)throw new Error(`Cannot remove guild membership role ${rid}. Check role hierarchy.`);removableRoles.push(role);}
  if(!removedRoleIds.length&&!await leaveRecord(userId))throw new Error('You have no configured BOM membership role. Ask Admiralty to verify your guild role first.');
  const rules=await many<any>(`SELECT prefix FROM guild_prefix_rules WHERE guild_id=$1`,[guildId]);
  const oldNick=String(member.nickname??member.user.globalName??member.user.username??'Member');
  const possibleTags=[...new Set(['[BoM 2]','[BOM]',...rules.map((r:any)=>String(r.prefix??''))])];
  const formerPrefix=possibleTags.sort((a,b)=>b.length-a.length).find(tag=>oldNick.toLowerCase().startsWith(tag.toLowerCase()))??null;
  const base=stripGuildTags(oldNick,rules.map((r:any)=>String(r.prefix??'')));
  const hadMemberRole=member.roles.cache.has(memberId),hadAfkRole=member.roles.cache.has(afkId);
  const id=existing?String(existing.id):randomUUID();
  if(existing){await db.query(`UPDATE member_leaves SET return_at=$2,reason=$3,had_member_role=$4,former_nickname=$5,former_prefix=$6,role_transition_state='PENDING',checkin_id=COALESCE($7,checkin_id),removed_role_ids=$8::jsonb,assigned_afk_role_id=$9,membership_group=$10,reminded=FALSE,reminder_message_id=NULL,updated_at=NOW() WHERE id=$1`,[id,until,reason,hadMemberRole,oldNick,formerPrefix,checkinId,JSON.stringify(removedRoleIds),afkId,group]);}
  else await db.query(`INSERT INTO member_leaves(id,guild_id,user_id,return_at,reason,had_member_role,former_nickname,former_prefix,role_transition_state,checkin_id,removed_role_ids,assigned_afk_role_id,membership_group) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'PENDING',$9,$10::jsonb,$11,$12)`,[id,guildId,userId,until,reason,hadMemberRole,oldNick,formerPrefix,checkinId,JSON.stringify(removedRoleIds),afkId,group]);
  try{
    if(!hadAfkRole)await member.roles.add(afkRole,'BOM member elected to take leave');
    for(const role of removableRoles)await member.roles.remove(role,'BOM member elected to take leave');
    await member.setNickname(`[AFK] ${base}`.slice(0,32),'BOM leave / AFK prefix');
    await db.query(`UPDATE member_leaves SET role_transition_state='APPLIED',updated_at=NOW() WHERE id=$1`,[id]);
    await sentinelRecord({source:'bom',category:'membership',action:'leave.afk_applied',actorId,targetId:userId,metadata:{leaveId:id,returnAt:until.toISOString(),removedRoleIds,checkinId,group,afkRoleId:afkId}}).catch(()=>{});
    if(latestClient)await refreshMemberConsole(latestClient,true).catch(()=>{});
    return {id,updated:Boolean(existing)};
  }catch(error){
    // Best-effort rollback; leave state must never report AWAY after a failed transition.
    for(const role of removableRoles)await member.roles.add(role,'BOM AFK transition rollback').catch(()=>{});
    if(!hadAfkRole)await member.roles.remove(afkRole,'BOM AFK transition rollback').catch(()=>{});
    await member.setNickname(oldNick.slice(0,32),'BOM AFK transition rollback').catch(()=>{});
    await db.query(`UPDATE member_leaves SET status=$2,role_transition_state='FAILED',updated_at=NOW() WHERE id=$1`,[id,existing?'AWAY':'CANCELLED']);
    throw error;
  }
}
async function markReturned(guild:any,userId:string,actorId:string){return withLeaveLock(userId,()=>markReturnedUnlocked(guild,userId,actorId));}
async function markReturnedUnlocked(guild:any,userId:string,actorId:string){
  const row=await leaveRecord(userId);if(!row)throw new Error('This member has no active leave.');
  const member=await memberForLeave(userId),s=await settings();
  const memberRoleId=String(s?.member_role_id??'');
  const afkId=String(row.assigned_afk_role_id??s?.afk_role_id??'');
  const afkRole=afkId?await member.guild.roles.fetch(afkId).catch(()=>null):null;
  if(row.role_transition_state==='APPLIED'){
    const roleIds=[...new Set<string>(parseJson(row.removed_role_ids,row.had_member_role?[memberRoleId]:[]).map(String))].filter(Boolean);
    const roles:any[]=[];
    for(const rid of roleIds){const role=await member.guild.roles.fetch(rid).catch(()=>null);if(!role||!role.editable)throw new Error(`Original membership role ${rid} is missing or above the bot. An officer must repair it.`);roles.push(role);}
    if(!afkRole&&member.roles.cache.has(afkId))throw new Error('Original AFK role cannot be resolved. Contact Admiralty.');
    for(const role of roles)if(!member.roles.cache.has(role.id))await member.roles.add(role,'BOM return from leave');
    if(member.roles.cache.has(afkId))await member.roles.remove(afkRole,'BOM return from leave');
  }
  await db.query(`UPDATE member_leaves SET status='RETURNED',returned_at=NOW(),returned_by=$3,role_transition_state='RESTORED',updated_at=NOW() WHERE guild_id=$1 AND id=$2`,[guildId,row.id,actorId]);
  // Let existing prefix rules determine the current correct guild tag; use the saved tag
  // when a previous BOM/BoM 2 prefix has no matching configured rule.
  await reconcileMember(member,row.former_prefix?[String(row.former_prefix)]:[]);
  if(row.former_prefix&&!String(member.nickname??'').startsWith('[')){
    const nick=`${row.former_prefix} ${stripGuildTags(String(member.nickname??row.former_nickname??member.user.username))}`.slice(0,32);
    await member.setNickname(nick,'Restore previous BOM guild prefix').catch(()=>{});
  }
  const thread=row.thread_id?await guild.channels.fetch(String(row.thread_id)).catch(()=>null):null;
  if(thread?.isTextBased?.()){if(thread.archived)await thread.setArchived(false);await thread.send({content:`<@${userId}> has returned.`,allowedMentions:{parse:[]}});await thread.setArchived(true);}
  await sentinelRecord({source:'bom',category:'membership',action:'leave.returned',actorId,targetId:userId,channelId:row.thread_id??null,metadata:{leaveId:row.id}}).catch(()=>{});
  if(latestClient)await refreshMemberConsole(latestClient,true).catch(()=>{});
  return row;
}
async function finishLeave(interaction:any,target:Date,reason:string|null,checkinId:string|null=null){
 const result=await startAfk(interaction.user.id,target,reason,interaction.user.id,checkinId);
 if(checkinId)await db.query("UPDATE membership_checkins SET status='AWAY',expected_return_at=$2,response_note=$3,responded_at=now(),updated_at=now() WHERE id=$1 AND user_id=$4 AND status='PENDING'",[checkinId,target,reason,interaction.user.id]);
 await safelyEnsureLeaveThread(interaction.client,result.id);
 const extended=target.getTime()-Date.now()>30*86400000;
 const content=`You're marked [AFK] until **<t:${Math.floor(target.getTime()/1000)}:F>**.${extended?' For leave longer than 30 days, leave the active in-game guild and apply to **BoM**.':''} You can return or extend your leave from the Control Desk or dashboard.`;
 await interaction.editReply({content,components:[]});
 await sendBotDm(interaction.user,{content,components:[new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('I Have Returned').setCustomId('membership:leave:dm-return'))]}).catch(()=>{});
}
async function saveLeave(interaction:any){
 const s=await settings();if(!s?.leave_enabled)throw new Error('Leave requests are not configured.');
 const target=parseLeaveDate(interaction.fields.getTextInputValue('when'));
 const reason=interaction.fields.getTextInputValue('reason').trim()||null;
 await interaction.deferReply({flags:MessageFlags.Ephemeral});
 if(target.getTime()-Date.now()>30*86400000){const key=randomUUID();await redis.set('leave:confirm:'+key,JSON.stringify({userId:interaction.user.id,when:target.toISOString(),reason}),'EX',900);await interaction.editReply({content:'For leave longer than 30 days, please leave the active in-game guild and apply to **BoM**. Confirm to save this leave.',components:[{type:1,components:[{type:2,style:3,label:'I understand — save leave',custom_id:'membership:leave:confirm:'+key},{type:2,style:2,label:'Cancel',custom_id:'membership:leave:cancel:'+key}]}]});return;}
 await finishLeave(interaction,target,reason);
}
async function leaveReminderSweep(client:any){await syncLeaveLifecycle(client);}
async function showLeaveList(i:any,filter:string,page=0){
 const now=Date.now();let rows=await activeLeaves();
 if(filter==='week')rows=rows.filter(r=>new Date(r.return_at).getTime()>=now&&new Date(r.return_at).getTime()<=now+7*86400000);
 if(filter==='overdue')rows=rows.filter(r=>new Date(r.return_at).getTime()<now);
 if(filter==='mine')rows=rows.filter(r=>r.user_id===i.user.id);
 const pages=Math.max(1,Math.ceil(rows.length/15));page=Math.max(0,Math.min(pages-1,page));
 const body={embeds:[{title:'Leave of Absence',color:0xd9aa3c,description:rows.slice(page*15,page*15+15).map(r=>`<@${r.user_id}> — **<t:${Math.floor(new Date(r.return_at).getTime()/1000)}:D>** · **<t:${Math.floor(new Date(r.return_at).getTime()/1000)}:R>**`).join('\n')||'No members in this view.',footer:{text:`${rows.length} members · Page ${page+1}/${pages}`}}],components:pages>1?[{type:1,components:[{type:2,style:2,label:'Previous',custom_id:`membership:leave:list:${filter}:${page-1}`,disabled:page===0},{type:2,style:2,label:'Next',custom_id:`membership:leave:list:${filter}:${page+1}`,disabled:page===pages-1}]}]:[],allowedMentions:{parse:[]}};
 if(i.isButton?.())await i.update(body);else await i.reply({...body,flags:MessageFlags.Ephemeral});
}

function roleRequestModal(){return new ModalBuilder().setCustomId('membership:role:modal').setTitle('Request a Custom Role').addComponents(
  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Role name').setStyle(TextInputStyle.Short).setMaxLength(80).setRequired(true).setPlaceholder('Litefootz Crew')),
  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('primary').setLabel('Primary color (hex)').setStyle(TextInputStyle.Short).setMaxLength(7).setRequired(true).setPlaceholder('#D9AA3C')),
  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('secondary').setLabel('Second color for gradient (optional)').setStyle(TextInputStyle.Short).setMaxLength(7).setRequired(false).setPlaceholder('#6D4AFF')),
  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Role emoji/icon (optional)').setStyle(TextInputStyle.Short).setMaxLength(40).setRequired(false).setPlaceholder('☠'))
);}
function diplomacyTopic(){return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId('membership:diplo:topic').setPlaceholder('What would you like to discuss?').addOptions(['Alliance','Trade','Merger','Other'].map(x=>({label:x,value:x}))));}
function diplomacyModal(topic:string){return new ModalBuilder().setCustomId(`membership:diplo:modal:${topic}`).setTitle('Diplomacy Request').addComponents(
  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('captain').setLabel('Your in-game / captain name').setStyle(TextInputStyle.Short).setMaxLength(80).setRequired(true)),
  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('guild').setLabel('Guild you represent').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true)),
  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('authority').setLabel('Do you have authority to negotiate?').setStyle(TextInputStyle.Short).setMaxLength(80).setRequired(true)),
  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('summary').setLabel('What would you like to discuss?').setStyle(TextInputStyle.Paragraph).setMaxLength(900).setRequired(true))
);}

async function openDiplomacy(interaction:any,topic:string){const s=await settings();if(!s?.diplomacy_enabled||!s?.diplomacy_category_id||!s?.diplomacy_role_id)throw new Error('Diplomacy is not configured yet.');const guild=interaction.guild,role=await guild.roles.fetch(String(s.diplomacy_role_id)),category=await guild.channels.fetch(String(s.diplomacy_category_id));if(!role||!category)throw new Error('Diplomacy configuration needs an administrator to repair it.');const captain=interaction.fields.getTextInputValue('captain').trim(),represented=interaction.fields.getTextInputValue('guild').trim(),authority=interaction.fields.getTextInputValue('authority').trim(),summary=interaction.fields.getTextInputValue('summary').trim(),id=randomUUID();const slug=(captain||interaction.user.username).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,45)||'diplomacy';
  await interaction.deferReply({flags:MessageFlags.Ephemeral});const overwrites=[{id:guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},{id:guild.members.me.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.ReadMessageHistory]},{id:interaction.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]},{id:role.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}];const text=await guild.channels.create({name:`diplo-${slug}`,type:ChannelType.GuildText,parent:category.id,permissionOverwrites:overwrites,reason:`BOM diplomacy request ${id}`});let voice:any=null;if(s.diplomacy_voice_enabled)voice=await guild.channels.create({name:`Diplomacy · ${captain}`.slice(0,100),type:ChannelType.GuildVoice,parent:category.id,permissionOverwrites:[{id:guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect]},{id:guild.members.me.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect,PermissionFlagsBits.ManageChannels]},{id:interaction.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect]},{id:role.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect]}],reason:`BOM diplomacy request ${id}`});await db.query(`INSERT INTO diplomacy_requests(id,guild_id,owner_id,captain_name,represented_guild,topic,authority,summary,text_channel_id,voice_channel_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,guildId,interaction.user.id,captain,represented,topic,authority,summary,text.id,voice?.id??null]);
  const embed=new EmbedBuilder().setColor(0xD9AA3C).setTitle(`Diplomacy · ${topic}`).setDescription(`**Requester:** ${interaction.user}\n**Captain:** ${captain}\n**Guild:** ${represented}\n**Authority:** ${authority}\n\n${summary}`).setFooter({text:`Request ${id.slice(0,8)}`});const participantRow=new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(new UserSelectMenuBuilder().setCustomId(`membership:diplo:participants:${id}`).setPlaceholder('Request additional participants').setMinValues(1).setMaxValues(5));const actions=new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`membership:diplo:close:${id}`).setLabel('Close Diplomacy Request').setStyle(ButtonStyle.Danger));await text.send({content:`${role}`,embeds:[embed],components:[participantRow,actions],allowedMentions:{roles:[role.id],users:[]}});await sentinelRecord({source:'bom',category:'membership',action:'diplomacy.opened',actorId:interaction.user.id,targetId:id,channelId:text.id,metadata:{topic,representedGuild:represented,voiceChannelId:voice?.id??null}});await interaction.editReply({content:`Your private diplomacy room is ready: ${text}${voice?` · ${voice}`:''}`});}

async function closeDiplomacy(interaction:any,id:string){const s=await settings();if(!isManager(interaction.member,s))throw new Error('Only diplomacy staff or server managers can close this request.');const record=await oneOrNone<any>(`SELECT * FROM diplomacy_requests WHERE guild_id=$1 AND id=$2`,[guildId,id]);if(!record||record.status!=='OPEN')throw new Error('This diplomacy request is already closed.');await interaction.deferReply({flags:MessageFlags.Ephemeral});const channel=interaction.channel;let transcript='';if(channel?.isTextBased()){const messages=await channel.messages.fetch({limit:100}).catch(()=>null);if(messages){transcript=[...messages.values()].sort((a:any,b:any)=>a.createdTimestamp-b.createdTimestamp).map((m:any)=>`[${new Date(m.createdTimestamp).toISOString()}] ${m.author?.tag??m.author?.username??'Unknown'}: ${m.cleanContent||m.content||'[embed/attachment]'}`).join('\n').slice(0,250000);}}
  await db.query(`UPDATE diplomacy_requests SET status='CLOSED',closed_at=NOW(),closed_by=$3,transcript=$4 WHERE guild_id=$1 AND id=$2`,[guildId,id,interaction.user.id,transcript]);if(s?.diplomacy_archive_channel_id){const archive=await interaction.guild.channels.fetch(String(s.diplomacy_archive_channel_id)).catch(()=>null);if(archive?.isTextBased()){const file=transcript?new AttachmentBuilder(Buffer.from(transcript,'utf8'),{name:`diplomacy-${id.slice(0,8)}.txt`}):undefined;await archive.send({content:`Diplomacy request **${id.slice(0,8)}** closed by ${interaction.user}.`,files:file?[file]:[],allowedMentions:{parse:[]}}).catch(()=>{});}}
  await sentinelRecord({source:'bom',category:'membership',action:'diplomacy.closed',actorId:interaction.user.id,targetId:id,channelId:record.text_channel_id,metadata:{voiceChannelId:record.voice_channel_id}});await interaction.editReply('Diplomacy request archived. The temporary rooms will close now.');const voice=record.voice_channel_id?await interaction.guild.channels.fetch(String(record.voice_channel_id)).catch(()=>null):null;if(voice)setTimeout(()=>void voice.delete('Diplomacy request closed').catch(()=>{}),1200);if(channel)setTimeout(()=>void channel.delete('Diplomacy request closed').catch(()=>{}),1800);}

async function reconcileMember(member:any,extraPrefixes:string[]=[]){
  if(!member||member.user?.bot||member.guild.id!==guildId)return;
  const [connections,prefixes,away,lastReturned]=await Promise.all([
    many<any>(`SELECT source_role_id,destination_role_ids FROM role_connections WHERE guild_id=$1`,[guildId]),
    many<any>(`SELECT role_id,prefix FROM guild_prefix_rules WHERE guild_id=$1`,[guildId]),
    oneOrNone<any>(`SELECT 1 FROM member_leaves WHERE guild_id=$1 AND user_id=$2 AND status='AWAY'`,[guildId,member.id]),
    oneOrNone<any>(`SELECT former_prefix,removed_role_ids FROM member_leaves WHERE guild_id=$1 AND user_id=$2 AND status='RETURNED' ORDER BY returned_at DESC LIMIT 1`,[guildId,member.id])
  ]);
  if(!away){for(const c of connections){if(!member.roles.cache.has(String(c.source_role_id)))continue;for(const rid of parseJson(c.destination_role_ids,[])){const role=member.guild.roles.cache.get(String(rid));if(role&&role.editable&&!member.roles.cache.has(role.id))await member.roles.add(role,'BOM connected role automation').catch(()=>{});}}}
  if(member.manageable){
    const matching=prefixes.filter((p:any)=>member.roles.cache.has(String(p.role_id))).map((p:any)=>({...p,position:member.guild.roles.cache.get(String(p.role_id))?.position??0})).sort((a:any,b:any)=>b.position-a.position);
    const base=stripGuildTags(String(member.nickname??member.user.globalName??member.user.username),[...extraPrefixes,...prefixes.map((p:any)=>String(p.prefix??''))]);
    const savedIds=parseJson(lastReturned?.removed_role_ids,[]) as string[];
    const savedPrefix=savedIds.some((id:string)=>member.roles.cache.has(String(id)))?String(lastReturned?.former_prefix??''):'';
    const tag=matching[0]?.prefix??savedPrefix;
    const next=(away?`[AFK] ${base}`:(tag?`${tag} ${base}`:base)).slice(0,32);
    if(next!==member.displayName)await member.setNickname(next,'BOM Guild Prefix automation').catch(()=>{});
  }
}

export function installMembership(client:any,options:{afterDeskMove?:(channelId:string)=>Promise<void>}={}){latestClient=client;installLeaveJobs(client,{start:startAfk,returned:markReturned});installRejoinRecovery(client);afterDeskMove=options.afterDeskMove;
  // DM interactions have no guildId and are intentionally not processed by the
  // usual guild-only router. Install an isolated, tightly scoped handler here,
  // avoiding any changes to Port Battle / other index.ts routing.
  client.on('interactionCreate',async(interaction:any)=>{
    if(interaction.guildId||!(interaction.isButton?.()||interaction.isModalSubmit?.()))return;
    const customId=String(interaction.customId??'');
    if(!customId.startsWith('membership:checkin:')&&customId!=='membership:leave:dm-return'&&!/^membership:leave:(confirm|cancel):/.test(customId))return;
    try{await handleMembershipInteraction(interaction);}
    catch(e:any){console.warn('[membership] DM check-in failed',String(e?.message??e));
      const response={content:`Unable to process that response: ${String(e?.message??e).slice(0,180)}. Try again or contact Admiralty.`};
      if(interaction.deferred||interaction.replied)await interaction.editReply(response).catch(()=>{});
      else await interaction.reply(response).catch(()=>{});
    }
  });
  client.on('guildMemberAdd',async(member:any)=>{if(member.guild.id!==guildId||member.user.bot)return;try{await settings();await db.query(`INSERT INTO member_profiles(guild_id,user_id,display_name,username,avatar_url,joined_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(guild_id,user_id) DO UPDATE SET display_name=EXCLUDED.display_name,username=EXCLUDED.username,avatar_url=EXCLUDED.avatar_url,joined_at=COALESCE(member_profiles.joined_at,EXCLUDED.joined_at),updated_at=NOW()`,[guildId,member.id,member.displayName,member.user.username,member.displayAvatarURL({extension:'png',size:256}),member.joinedAt??new Date()]);await db.query(`UPDATE membership_settings SET welcome_last_joiner_id=$2,welcome_last_joiner_name=$3,welcome_last_joiner_avatar=$4,updated_at=NOW() WHERE guild_id=$1`,[guildId,member.id,member.displayName,member.displayAvatarURL({extension:'png',size:512})]);const s=await settings();if(s?.welcome_enabled&&s?.welcome_channel_id){const channel=await member.guild.channels.fetch(String(s.welcome_channel_id)).catch(()=>null);if(channel?.isTextBased())await channel.send({content:`Welcome ${member}! The Welcome panel below has the fastest routes to apply, trade, or contact diplomacy.`,allowedMentions:{users:[member.id]}}).catch(()=>{});await refreshWelcomePanel(client,member,true);}await reconcileMember(member);}catch(e){console.warn('[membership] join workflow failed',e);}});
  client.on('guildMemberUpdate',async(_before:any,after:any)=>{try{await reconcileMember(after);}catch(e){console.warn('[membership] member automation failed',e);}});
  client.on('messageCreate',async(message:any)=>{if(message.guildId!==guildId||message.system)return;const s=await settings().catch(()=>null);if(s?.welcome_enabled&&String(message.channelId)===String(s.welcome_channel_id)&&String(message.id)!==String(s.welcome_panel_message_id))scheduleWelcomeMove(client);if(!message.author?.bot&&s?.member_console_channel_id&&String(message.channelId)===String(s.member_console_channel_id)&&String(message.id)!==String(s.member_console_message_id))scheduleConsoleMove(client);});
  let sweepRunning=false;const sweep=setInterval(async()=>{if(sweepRunning)return;sweepRunning=true;try{const s=await settings();if(s?.welcome_enabled)await refreshWelcomePanel(client,null,false);if(s?.member_console_channel_id)await refreshMemberConsole(client,false);await leaveReminderSweep(client);}catch(e){console.warn('[membership] membership surface repair failed',e);}finally{sweepRunning=false;}},30_000);sweep.unref();setTimeout(()=>{void refreshWelcomePanel(client,null,false).catch(()=>{});void refreshMemberConsole(client,false).catch(()=>{});},3500);const startupReconcile=async(attempt=0):Promise<void>=>{
    try{
      const guild=client.guilds.cache.get(guildId);if(!guild)return;
      const members=await guild.members.fetch();
      for(const member of members.values())await reconcileMember(member);
    }catch(e:any){
      if(e?.name==='GatewayRateLimitError'&&attempt<3){
        // Gateway RATE_LIMITED retry_after is expressed in seconds.
        const waitMs=Math.max(30_000,Number(e.data?.retry_after)*1000||30_000)+2000;
        console.warn('[membership] startup reconciliation deferred by gateway',{retryInMs:waitMs,attempt:attempt+1});
        const timer=setTimeout(()=>void startupReconcile(attempt+1),waitMs);timer.unref();
      }else console.warn('[membership] startup member reconciliation failed',e);
    }
  };
  const startupTimer=setTimeout(()=>void startupReconcile(),30_000);startupTimer.unref();
}

export async function handleMembershipInteraction(interaction:any){
  if(interaction.isButton?.()&&interaction.customId==='membership:map:detail'){
   await interaction.deferReply({flags:MessageFlags.Ephemeral});const map=await deskBattleMap(true);
   await interaction.editReply({embeds:[{title:'Detailed Battle Map · All Ports',color:0xd9aa3c,description:map.summary,image:{url:'attachment://detailed-battle-map.png'}}],files:[new AttachmentBuilder(map.image,{name:'detailed-battle-map.png'})]});return true;
  }
  if(interaction.isStringSelectMenu?.()&&interaction.customId==='membership:leave:choose'){const v=interaction.values[0];await interaction.showModal(leaveModal('Leave of Absence',['3','7','14','30'].includes(v)?'in '+v+' days':''));return true;}
  if(interaction.isStringSelectMenu?.()&&interaction.customId==='membership:leave:view'){await showLeaveList(interaction,interaction.values[0]);return true;}
  if(interaction.isButton?.()&&interaction.customId.startsWith('membership:leave:list:')){const p=interaction.customId.split(':');await showLeaveList(interaction,p[3],Number(p[4]));return true;}
  if(interaction.isStringSelectMenu?.()&&interaction.customId==='membership:navigate'){
   const destination=DESK_DESTINATIONS.find(d=>d.value===interaction.values[0]);
   if(!destination){await interaction.reply({content:'Choose a tool from the current Control Desk.',flags:MessageFlags.Ephemeral});return true;}
   await interaction.reply({content:`Open ${destination.label}:`,components:[{type:1,components:[{type:2,style:5,label:destination.label,url:dashboardLink(destination.path)}]}],flags:MessageFlags.Ephemeral});return true;
  }
  if(interaction.isStringSelectMenu?.()&&interaction.customId==='membership:services'){
   const value=interaction.values[0],path=value==='role'?'/dashboard/members?view=role':`/dashboard/members?view=media&type=${encodeURIComponent(value)}`;
   await interaction.reply({content:'Open your request on the dashboard:',components:[{type:1,components:[{type:2,style:5,label:'Open Request',url:dashboardLink(path)}]}],flags:MessageFlags.Ephemeral});return true;
  }
  if(interaction.isButton?.()&&interaction.customId==='membership:donation'){
   await interaction.reply({content:'Record the resources, items, or chests you deposited in the fort. An officer will verify the donation.',components:[{type:1,components:[{type:2,style:5,label:'Submit Donation',url:dashboardLink('/dashboard/guild-ledger?new=donation')}]}],flags:MessageFlags.Ephemeral});return true;
  }
  if(interaction.isButton?.()&&/^membership:leave:(confirm|cancel):/.test(interaction.customId)){
   const [, ,action,key]=interaction.customId.split(':'),raw=await redis.get('leave:confirm:'+key);if(!raw){await interaction.reply({content:'This confirmation expired. Request leave again from the Control Desk.',flags:MessageFlags.Ephemeral});return true;}
   const pending=JSON.parse(raw);if(pending.userId!==interaction.user.id)throw Error('This leave belongs to another member');
   await interaction.deferUpdate();await redis.del('leave:confirm:'+key);if(action==='cancel')await interaction.editReply({content:'Leave request cancelled.',components:[]});else await finishLeave(interaction,new Date(pending.when),pending.reason,pending.checkinId??null);return true;
  }

  if(interaction.isButton?.()&&interaction.customId==='membership:map:update'){
    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    if(interaction.guildId!==guildId){await interaction.editReply('Use this button in the BOM server.');return true;}
    const base=(process.env.INTERNAL_API_URL??'http://127.0.0.1:4100').replace(/\/$/,'');
    const r=await fetch(`${base}/v1/wosb/territory/edit-links`,{method:'POST',headers:{'x-internal-token':process.env.INTERNAL_API_TOKEN??'','x-discord-user-id':interaction.user.id},signal:AbortSignal.timeout(15000)});
    const data:any=await r.json();
    if(!r.ok)throw new Error(data.error??'Could not create a map editing link.');
    await interaction.editReply({content:`Your map editing page is ready. Expires <t:${Math.floor(Date.parse(data.expiresAt)/1000)}:R>. Updates are recorded under your Discord account.`,components:[new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Open Map Editor').setURL(data.url))]});
    return true;
  }

  if(interaction.isButton?.()&&interaction.customId==='membership:leave:dm-return'){
    await interaction.deferReply();
    try{const guild=latestClient?.guilds.cache.get(guildId);if(!guild)throw new Error('BOM server is unavailable.');await markReturned(guild,interaction.user.id,interaction.user.id);await interaction.editReply('Welcome back! Your AFK role was removed and your previous Member role and guild prefix were restored.');}
    catch(e:any){await interaction.editReply(`Unable to restore your membership automatically: ${String(e?.message??e).slice(0,200)}. Please contact Admiralty.`);}
    return true;
  }
  // Check-in buttons are DM interactions: interaction.guildId is intentionally null.
  if((interaction.isButton?.()||interaction.isModalSubmit?.())&&String(interaction.customId??'').startsWith('membership:checkin:')){
    const parts=String(interaction.customId).split(':'),action=parts[2],id=parts[3];
    if(!/^[a-f0-9-]{36}$/i.test(id??''))throw new Error('Invalid check-in identifier.');
    const row=await oneOrNone<any>(`SELECT * FROM membership_checkins WHERE guild_id=$1 AND id=$2`,[guildId,id]);
    if(!row||String(row.user_id)!==String(interaction.user.id)){await interaction.reply({content:'This check-in does not belong to you.'});return true;}
    if(row.status!=='PENDING'){await interaction.reply({content:'This check-in has already been answered or cancelled.'});return true;}
    if(action==='away'&&interaction.isButton?.()){
      const modal=new ModalBuilder().setCustomId(`membership:checkin:submit:${id}`).setTitle('BOM Leave of Absence').addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('when').setLabel('When will you return?').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60).setPlaceholder('in 14 days, August 6th, 16 August…')),
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Optional note to Admiralty').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500))
      );await interaction.showModal(modal);return true;
    }
    if(action==='submit'&&interaction.isModalSubmit?.()){
      const dateText=interaction.fields.getTextInputValue('when').trim(),returnAt=parseLeaveDate(dateText);
      const note=interaction.fields.getTextInputValue('reason')?.trim()||null;
      await interaction.deferReply();
      if(returnAt.getTime()-Date.now()>30*86400000){const key=randomUUID();await redis.set('leave:confirm:'+key,JSON.stringify({userId:row.user_id,when:returnAt.toISOString(),reason:note,checkinId:id}),'EX',900);await interaction.editReply({content:'For leave longer than 30 days, please leave the active in-game guild and apply to **BoM**. Confirm to save your leave.',components:[{type:1,components:[{type:2,style:3,label:'I understand — save leave',custom_id:'membership:leave:confirm:'+key},{type:2,style:2,label:'Cancel',custom_id:'membership:leave:cancel:'+key}]}]});return true;}
      try{
        const leave=await startAfk(row.user_id,returnAt,note,row.user_id,id);await safelyEnsureLeaveThread(interaction.client,leave.id);
        await db.query(`UPDATE membership_checkins SET status='AWAY',expected_return_at=$2,return_text=$3,response_note=$4,responded_at=NOW(),updated_at=NOW() WHERE id=$1 AND status='PENDING'`,[id,returnAt,dateText,note]);
        await interaction.editReply({content:`Leave confirmed. You're now **[AFK]** until <t:${Math.floor(returnAt.getTime()/1000)}:D>. Press **I'm Back** here when you return to restore your original guild membership role.\n\n${EXTENDED_LEAVE_NOTICE}`,components:[new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel("I'm Back").setCustomId('membership:leave:dm-return'))]});
      }catch(e:any){await interaction.editReply(`I couldn't apply the AFK roles. No successful leave transition was recorded. Please contact an officer. (${String(e?.message??e).slice(0,200)})`);}
      return true;
    }
    if(['continue','stopping'].includes(action)&&interaction.isButton?.()){
      const status=action==='continue'?'CONTINUING':'NOT_CONTINUING';
      const updated=await db.query(`UPDATE membership_checkins SET status=$2,responded_at=NOW(),updated_at=NOW() WHERE id=$1 AND status='PENDING' RETURNING id`,[id,status]);
      if(!updated.rowCount){await interaction.reply({content:'This check-in has already been answered.'});return true;}
      await sentinelRecord({source:'bom',category:'membership',action:`checkin.${status.toLowerCase()}`,actorId:row.user_id,targetId:row.user_id,metadata:{checkinId:id}}).catch(()=>{});
      await interaction.reply({content:status==='CONTINUING'?"Great! Thanks for confirming you're continuing to play with BOM.":"Thanks for letting Admiralty know. An officer will follow up; this does not remove you from Discord automatically."});
      return true;
    }
    return true;
  }
  if(interaction.isChatInputCommand?.()){
    if(interaction.commandName==='profile'){await interaction.reply({content:`Open **My Profile & Ships**: ${dashboardLink('/dashboard/members?view=profile')}`,flags:MessageFlags.Ephemeral});return true;}
    if(interaction.commandName==='role-request'){await interaction.reply({content:`Open the **Discord Role Request** page: ${dashboardLink('/dashboard/members?view=role')}`,flags:MessageFlags.Ephemeral});return true;}
    if(interaction.commandName==='leave-remove'){const s=await settings();const target=interaction.options.getUser('member',true);const allowed=Boolean(interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild)||s?.leave_officer_role_id&&interaction.member?.roles?.cache?.has?.(String(s.leave_officer_role_id)));if(!allowed){await interaction.reply({content:'Only configured leave officers or server managers can remove a member from leave.',flags:MessageFlags.Ephemeral});return true;}await interaction.deferReply({flags:MessageFlags.Ephemeral});await markReturned(interaction.guild,target.id,interaction.user.id);await interaction.editReply(`${target.username} is no longer marked away.`);return true;}
    if(interaction.commandName==='membership-admin'){
      if(!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild)){await interaction.reply({content:'Manage Server is required.',flags:MessageFlags.Ephemeral});return true;}const sub=interaction.options.getSubcommand();if(sub==='refresh-welcome'){await interaction.deferReply({flags:MessageFlags.Ephemeral});await refreshWelcomePanel(interaction.client,null,true);await interaction.editReply('Welcome panel refreshed. It only moves when a newer message is below it.');return true;}if(sub==='refresh-console'){await interaction.deferReply({flags:MessageFlags.Ephemeral});await refreshMemberConsole(interaction.client,true);await interaction.editReply('BOM Control Desk refreshed and moved to the bottom.');return true;}
      if(sub==='prefix'){const role=interaction.options.getRole('role',true),tag=interaction.options.getString('tag',false)?.trim()??null;if(tag&&!/^\[[^\[\]\n]{1,12}\]$/.test(tag)){await interaction.reply({content:'Use a bracketed prefix such as `[BOM]`, up to 12 characters inside.',flags:MessageFlags.Ephemeral});return true;}const previous=await oneOrNone<any>(`SELECT prefix FROM guild_prefix_rules WHERE guild_id=$1 AND role_id=$2`,[guildId,role.id]);if(tag)await db.query(`INSERT INTO guild_prefix_rules(guild_id,role_id,prefix,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT(guild_id,role_id) DO UPDATE SET prefix=EXCLUDED.prefix,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,[guildId,role.id,tag,interaction.user.id]);else await db.query(`DELETE FROM guild_prefix_rules WHERE guild_id=$1 AND role_id=$2`,[guildId,role.id]);await interaction.deferReply({flags:MessageFlags.Ephemeral});for(const m of role.members.values())await reconcileMember(m,previous?.prefix?[String(previous.prefix)]:[]);await sentinelRecord({source:'bom',category:'membership',action:tag?'guild_prefix.saved':'guild_prefix.removed',actorId:interaction.user.id,targetId:role.id,metadata:{prefix:tag}});await interaction.editReply(tag?`${role} now uses **${tag}**.`:`Guild Prefix removed from ${role}.`);return true;}
      if(sub==='connect'){const source=interaction.options.getRole('source',true),dest=['first','second','third','fourth','fifth'].map(x=>interaction.options.getRole(x,false)).filter(Boolean);const ids=[...new Set(dest.map((r:any)=>String(r.id)))].filter(id=>id!==String(source.id));if(ids.length)await db.query(`INSERT INTO role_connections(guild_id,source_role_id,destination_role_ids,updated_by) VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(guild_id,source_role_id) DO UPDATE SET destination_role_ids=EXCLUDED.destination_role_ids,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,[guildId,source.id,JSON.stringify(ids),interaction.user.id]);else await db.query(`DELETE FROM role_connections WHERE guild_id=$1 AND source_role_id=$2`,[guildId,source.id]);await interaction.deferReply({flags:MessageFlags.Ephemeral});for(const m of source.members.values())await reconcileMember(m);await sentinelRecord({source:'bom',category:'membership',action:ids.length?'role_connection.saved':'role_connection.removed',actorId:interaction.user.id,targetId:source.id,metadata:{destinationRoleIds:ids}});await interaction.editReply(ids.length?`${source} now grants ${dest.join(', ')}.`:`Role connection removed from ${source}. Existing linked roles are left in place.`);return true;}
    }
  }
  if(interaction.isButton?.()&&interaction.customId==='membership:welcome:trade'){const s=await settings();const roleId=String(s?.trade_role_id??'');if(!roleId)throw new Error('The Trade role is not configured.');const member=interaction.member;if(member?.roles?.cache?.has?.(roleId)){await interaction.reply({content:'You already have the Trade role.',flags:MessageFlags.Ephemeral});return true;}const role=interaction.guild?.roles?.cache?.get?.(roleId)??await interaction.guild?.roles?.fetch?.(roleId).catch(()=>null);if(!role)throw new Error('The configured Trade role no longer exists.');await member?.roles?.add?.(role,'Trade with Misfits access requested from Welcome panel');await sentinelRecord({source:'bom',category:'membership',action:'trade_role.granted',actorId:interaction.user.id,targetId:roleId,metadata:{source:'welcome_panel'}}).catch(()=>{});await interaction.reply({content:`Trade access granted: ${role}.`,flags:MessageFlags.Ephemeral,allowedMentions:{roles:[]}});return true;}
  if(interaction.isButton?.()&&interaction.customId==='membership:welcome:diplo'){await interaction.reply({content:'What kind of diplomacy would you like to discuss?',components:[diplomacyTopic()],flags:MessageFlags.Ephemeral});return true;}
  if(interaction.isStringSelectMenu?.()&&interaction.customId==='membership:diplo:topic'){await interaction.showModal(diplomacyModal(interaction.values[0]??'Other'));return true;}
  if(interaction.isModalSubmit?.()&&interaction.customId.startsWith('membership:diplo:modal:')){await openDiplomacy(interaction,interaction.customId.split(':').at(-1)??'Other');return true;}
  if(interaction.isButton?.()&&interaction.customId==='membership:leave:request'){await interaction.showModal(leaveModal((await leaveRecord(interaction.user.id))?'Update Leave':'Leave of Absence'));return true;}
  if(interaction.isButton?.()&&interaction.customId==='membership:leave:extend'){await interaction.showModal(leaveModal('Extend Leave'));return true;}
  if(interaction.isModalSubmit?.()&&interaction.customId==='membership:leave:modal'){await saveLeave(interaction);return true;}
  if(interaction.isButton?.()&&interaction.customId==='membership:leave:return'){await interaction.deferReply({flags:MessageFlags.Ephemeral});await markReturned(interaction.guild,interaction.user.id,interaction.user.id);await interaction.editReply('Welcome back! You are no longer listed as away.');return true;}
  if(interaction.isButton?.()&&interaction.customId.startsWith('membership:leave:archive:')){const s=await settings();const allowed=Boolean(interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageThreads)||interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild)||s?.leave_officer_role_id&&interaction.member?.roles?.cache?.has?.(String(s.leave_officer_role_id)));if(!allowed)throw new Error('Only configured leave officers or server managers can archive this leave thread.');await interaction.reply({content:'Archiving this leave thread.',flags:MessageFlags.Ephemeral});await interaction.channel?.setArchived?.(true,'Leave discussion completed').catch(()=>{});return true;}
  if(interaction.isModalSubmit?.()&&interaction.customId==='membership:role:modal'){const body={name:interaction.fields.getTextInputValue('name').trim(),primaryColor:interaction.fields.getTextInputValue('primary').trim(),secondaryColor:interaction.fields.getTextInputValue('secondary').trim()||null,unicodeEmoji:interaction.fields.getTextInputValue('emoji').trim()||null,gradientDirection:'LEFT_TO_RIGHT'};await interaction.deferReply({flags:MessageFlags.Ephemeral});const x=await membershipApi('/custom-roles',interaction.user.id,{method:'POST',body:JSON.stringify(body)});await interaction.editReply(`Custom role request submitted. Staff will review it shortly. Request **${String(x.id).slice(0,8)}**.`);return true;}
  if(interaction.isButton?.()&&interaction.customId==='membership:role:request'){await interaction.showModal(roleRequestModal());return true;}
  if(interaction.isButton?.()&&interaction.customId.startsWith('membership:role:')){const [,scope,action,id]=interaction.customId.split(':');if(scope==='role'&&['approve','decline'].includes(action)&&id){await interaction.deferReply({flags:MessageFlags.Ephemeral});const x=await membershipApi(`/custom-roles/${id}/decision`,interaction.user.id,{method:'POST',body:JSON.stringify({approved:action==='approve'})});await interaction.editReply(`Role request ${String(x.status).toLowerCase()}.`);return true;}}
  if(interaction.isUserSelectMenu?.()&&interaction.customId.startsWith('membership:diplo:participants:')){const id=interaction.customId.split(':').at(-1)!;const req=await oneOrNone<any>(`SELECT * FROM diplomacy_requests WHERE guild_id=$1 AND id=$2`,[guildId,id]);if(!req||req.status!=='OPEN')throw new Error('This diplomacy request is closed.');if(String(req.owner_id)!==String(interaction.user.id))throw new Error('Only the requester can propose additional participants.');const ids=[...interaction.values].filter((x:string)=>x!==interaction.user.id);for(const uid of ids)await db.query(`INSERT INTO diplomacy_participants(request_id,user_id,requested_by) VALUES($1,$2,$3) ON CONFLICT(request_id,user_id) DO UPDATE SET status='PENDING',requested_by=EXCLUDED.requested_by,decided_by=NULL,decided_at=NULL`,[id,uid,interaction.user.id]);const s=await settings(),role=s?.diplomacy_role_id?interaction.guild.roles.cache.get(String(s.diplomacy_role_id)):null;await interaction.reply({content:`${role??'Diplomacy staff'} · ${interaction.user} requests access for ${ids.map((x:string)=>`<@${x}>`).join(', ')}.`,components:[new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`membership:diplo:participants-approve:${id}`).setLabel('Approve Participants').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`membership:diplo:participants-decline:${id}`).setLabel('Decline').setStyle(ButtonStyle.Danger))],allowedMentions:{roles:role?[role.id]:[],users:ids},});return true;}
  if(interaction.isButton?.()&&/^membership:diplo:participants-(approve|decline):/.test(interaction.customId)){const parts=interaction.customId.split(':'),action=parts[2],id=parts[3],s=await settings();if(!isManager(interaction.member,s))throw new Error('Only diplomacy staff or server managers can decide participant requests.');const req=await oneOrNone<any>(`SELECT * FROM diplomacy_requests WHERE guild_id=$1 AND id=$2`,[guildId,id]);if(!req)throw new Error('Diplomacy request not found.');const rows=await many<any>(`SELECT * FROM diplomacy_participants WHERE request_id=$1 AND status='PENDING'`,[id]);if(action==='participants-approve'){const voice=req.voice_channel_id?await interaction.guild.channels.fetch(String(req.voice_channel_id)).catch(()=>null):null;for(const p of rows){const m=await interaction.guild.members.fetch(String(p.user_id)).catch(()=>null);if(!m)continue;await interaction.channel.permissionOverwrites.edit(m,{ViewChannel:true,SendMessages:true,ReadMessageHistory:true});if(voice)await voice.permissionOverwrites.edit(m,{ViewChannel:true,Connect:true});}}await db.query(`UPDATE diplomacy_participants SET status=$2,decided_by=$3,decided_at=NOW() WHERE request_id=$1 AND status='PENDING'`,[id,action==='participants-approve'?'APPROVED':'DECLINED',interaction.user.id]);await sentinelRecord({source:'bom',category:'membership',action:action==='participants-approve'?'diplomacy.participants_approved':'diplomacy.participants_declined',actorId:interaction.user.id,targetId:id,channelId:interaction.channelId,metadata:{participantIds:rows.map((x:any)=>String(x.user_id))}});await interaction.update({content:`Additional participants ${action==='participants-approve'?'approved':'declined'} by ${interaction.user}.`,components:[],allowedMentions:{parse:[]}});return true;}
  if(interaction.isButton?.()&&interaction.customId.startsWith('membership:diplo:close:')){await closeDiplomacy(interaction,interaction.customId.split(':').at(-1)!);return true;}
  return false;
}

/** Compatibility with controller entrypoint revisions that call these helpers. */
export async function maintainDeskOrderForChannel(...args:any[]):Promise<void>{
 const client=args.find(x=>x?.guilds&&x?.channels)??latestClient;
 if(client)scheduleConsoleMove(client,1000);
}

export async function refreshMembershipSurfaces(...args:any[]):Promise<void>{
  const client=args.find(x=>x?.guilds?.cache)||latestClient;
  if(!client)return;
  await refreshWelcomePanel(client,null,false);
  await refreshMemberConsole(client,true);
}
/** Uses the same AFK transition as the Control Desk. No direct AI role mutations. */
export async function submitConversationalLeave(...args:any[]):Promise<any>{
  const obj=args.find(x=>x&&typeof x==='object'&&!('guilds' in x)&&('userId' in x||'when' in x||'returnAt' in x));
  const ids=args.filter(x=>typeof x==='string'&&/^\d{15,22}$/.test(x));
  if(!obj&&ids.length!==1)throw new Error('Specify one unambiguous member ID for leave changes.');
  const uid=String(obj?.userId??obj?.memberId??ids[0]??'');
  const dateInput=obj?.returnAt??obj?.when??obj?.date??args.find(x=>x instanceof Date||typeof x==='string'&&/(?:days?|weeks?|months?|tomorrow|\d{4}|january|february|march|april|may|june|july|august|september|october|november|december)/i.test(x));
  if(!/^\d{15,22}$/.test(uid)||!dateInput)throw new Error('A Discord member ID and expected return date are required.');
  const until=dateInput instanceof Date?dateInput:parseLeaveDate(String(dateInput));
  if(!Number.isFinite(until.getTime())||until.getTime()<=Date.now())throw new Error('Expected return must be a future date.');
  if(until.getTime()-Date.now()>30*86400000&&!obj?.extendedAcknowledged)throw Error('For leave longer than 30 days, confirm the in-game BoM transfer guidance through the Control Desk or dashboard.');
  const result=await startAfk(uid,until,String(obj?.reason??'').trim()||null,uid);
  await safelyEnsureLeaveThread(latestClient,result.id);
  return {ok:true,...result,returnAt:until.toISOString(),notice:EXTENDED_LEAVE_NOTICE};
}
export async function returnFromConversationalLeave(...args:any[]):Promise<any>{
  const obj=args.find(x=>x&&typeof x==='object'&&('userId' in x||'memberId' in x));
  const ids=args.filter(x=>typeof x==='string'&&/^\d{15,22}$/.test(x));
  if(!obj&&ids.length!==1)throw new Error('Specify one unambiguous member ID for leave changes.');
  const uid=String(obj?.userId??obj?.memberId??ids[0]??'');
  if(!/^\d{15,22}$/.test(uid))throw new Error('A Discord member ID is required to end leave.');
  const guild=latestClient?.guilds.cache.get(guildId);
  if(!guild)throw new Error('BOM Discord guild is unavailable.');
  const row=await markReturned(guild,uid,uid);
  return {ok:true,leaveId:row.id};
}
