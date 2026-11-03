import {discordDmsMuted} from '@bom/db';
import {sendApiDm} from './dmDelivery.js';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import sharp from 'sharp';
import {db,many,oneOrNone} from '@bom/db';
import {discordAccess,discordContext,hasDashboardAdminAccess} from './authz.js';
import {sentinelRecord} from './sentinel.js';
import {collapseDuplicateLeadingTags,nicknameBase,proposedNickname} from './prefixHygiene.js';

const token=process.env.DISCORD_BOT_TOKEN??'';
const apiBase='https://discord.com/api/v10';
const botHeaders={Authorization:`Bot ${token}`};
const dashboard=(process.env.PUBLIC_DASHBOARD_URL??process.env.DASHBOARD_PUBLIC_URL??'https://dashboard.bandofmisfits.org').replace(/\/$/,'');

function json<T=any>(v:any,fallback:T):T{if(v==null)return fallback;try{return typeof v==='string'?JSON.parse(v):v;}catch{return fallback;}}
function cleanText(v:any,max=120){return String(v??'').trim().replace(/\s+/g,' ').slice(0,max);}
function colorInt(v:any){const s=String(v??'').trim().replace(/^#/,'');if(!/^[0-9a-f]{6}$/i.test(s))return null;return parseInt(s,16);}
function userAvatar(user:any){if(user?.avatar)return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`;return null;}
function escapeDiscord(s:string){return s.replace(/([\\`*_{}\[\]()#+\-.!|>])/g,'\\$1');}

async function discord(path:string,init:RequestInit={}){
  const headers=new Headers(botHeaders);if(init.body&&!headers.has('content-type'))headers.set('content-type','application/json');
  const r=await fetch(`${apiBase}${path}`,{...init,headers,signal:AbortSignal.timeout(15_000)});const text=await r.text();let body:any=null;try{body=text?JSON.parse(text):null;}catch{body=text;}
  if(!r.ok){const err:any=new Error(body?.message??`Discord request failed (${r.status})`);err.status=r.status;err.body=body;throw err;}return body;
}
async function allMembers(guildId:string){const out:any[]=[];let after='0';for(let page=0;page<10;page++){const rows:any[]=await discord(`/guilds/${guildId}/members?limit=1000&after=${after}`);out.push(...rows);if(rows.length<1000)break;after=rows.at(-1)?.user?.id??after;}return out;}
async function dm(userId:string,content:string){try{await sendApiDm(discord,userId,{content,allowed_mentions:{parse:[]}});}catch{/* DM settings are user-controlled */}}
async function settings(guildId:string){await db.query(`INSERT INTO membership_settings(guild_id) VALUES($1) ON CONFLICT DO NOTHING`,[guildId]);return oneOrNone<any>(`SELECT * FROM membership_settings WHERE guild_id=$1`,[guildId]);}
async function reviewer(userId:string,guildId:string){if(await hasDashboardAdminAccess(userId))return true;const s=await settings(guildId),access=await discordAccess(userId);return Boolean(s?.custom_role_approval_role_id&&access.roles.includes(String(s.custom_role_approval_role_id)));}
async function rosterManager(userId:string,guildId:string){if(await hasDashboardAdminAccess(userId))return true;const s=await settings(guildId),access=await discordAccess(userId);return Boolean(s?.profile_reminder_role_id&&access.roles.includes(String(s.profile_reminder_role_id)));}

async function postRoleReview(guildId:string,request:any){const s=await settings(guildId);if(!s?.custom_role_approval_channel_id)return null;const body={content:s?.custom_role_approval_role_id?`<@&${s.custom_role_approval_role_id}>`:undefined,embeds:[{title:'Custom Role Request',color:0xD9AA3C,description:`**Member:** <@${request.user_id}>\n**Role name:** ${escapeDiscord(request.requested_name)}\n**Primary:** #${Number(request.primary_color).toString(16).padStart(6,'0').toUpperCase()}${request.secondary_color!=null?`\n**Secondary:** #${Number(request.secondary_color).toString(16).padStart(6,'0').toUpperCase()}`:''}${request.unicode_emoji?`\n**Icon:** ${request.unicode_emoji}`:''}`,footer:{text:'Band of Misfits · Membership'}}],components:[{type:1,components:[{type:2,style:3,label:'Approve',custom_id:`membership:role:approve:${request.id}`},{type:2,style:4,label:'Decline',custom_id:`membership:role:decline:${request.id}`}]}],allowed_mentions:{users:[request.user_id],roles:s?.custom_role_approval_role_id?[s.custom_role_approval_role_id]:[],parse:[]}};const msg=await discord(`/channels/${s.custom_role_approval_channel_id}/messages`,{method:'POST',body:JSON.stringify(body)});if(msg?.id)await db.query(`UPDATE custom_role_requests SET discord_message_id=$2,updated_at=NOW() WHERE id=$1`,[request.id,msg.id]);return msg?.id??null;}

async function decideCustomRole(guildId:string,requestId:string,reviewerId:string,approved:boolean,note:string|null){
  const req=await oneOrNone<any>(`SELECT * FROM custom_role_requests WHERE guild_id=$1 AND id=$2`,[guildId,requestId]);if(!req)throw Object.assign(new Error('Role request not found.'),{statusCode:404});if(req.status!=='PENDING')throw Object.assign(new Error('This request has already been decided.'),{statusCode:409});
  let roleId:string|null=req.discord_role_id??null;
  if(approved){
    const s=await settings(guildId);if(!s?.custom_roles_enabled)throw new Error('Custom role requests are disabled.');
    const member=await discord(`/guilds/${guildId}/members/${req.user_id}`);if(!member)throw new Error('Member is no longer in the server.');
    const owned=await oneOrNone<any>(`SELECT discord_role_id FROM member_custom_roles WHERE guild_id=$1 AND user_id=$2`,[guildId,req.user_id]),roles:any[]=await discord(`/guilds/${guildId}/roles`);
    const duplicate=roles.find((r:any)=>String(r.name??'').trim().toLowerCase()===String(req.requested_name).trim().toLowerCase()&&String(r.id)!==String(owned?.discord_role_id??''));if(duplicate)throw Object.assign(new Error('Another Discord role already uses that name.'),{statusCode:409});
    const requestedPrimary=Number(req.primary_color)||0,requestedSecondary=req.secondary_color==null?null:Number(req.secondary_color);const reverse=req.gradient_direction==='RIGHT_TO_LEFT'&&requestedSecondary!=null;const first=reverse?requestedSecondary:requestedPrimary,second=reverse?requestedPrimary:requestedSecondary;
    const rolePayload:any={name:req.requested_name,colors:{primary_color:first,secondary_color:second,tertiary_color:null},mentionable:false,hoist:false};if(req.icon_data)rolePayload.icon=req.icon_data;else if(req.unicode_emoji)rolePayload.unicode_emoji=req.unicode_emoji;
    const fallbackPayload:any={name:req.requested_name,color:requestedPrimary,mentionable:false,hoist:false};if(req.icon_data)fallbackPayload.icon=req.icon_data;else if(req.unicode_emoji)fallbackPayload.unicode_emoji=req.unicode_emoji;
    const createRole=async()=>{let created:any;try{created=await discord(`/guilds/${guildId}/roles`,{method:'POST',body:JSON.stringify(rolePayload)});}catch{try{created=await discord(`/guilds/${guildId}/roles`,{method:'POST',body:JSON.stringify(fallbackPayload)});}catch{created=await discord(`/guilds/${guildId}/roles`,{method:'POST',body:JSON.stringify({name:req.requested_name,color:requestedPrimary,mentionable:false,hoist:false})});}}return String(created.id);};
    if(owned?.discord_role_id&&roles.some((r:any)=>String(r.id)===String(owned.discord_role_id))){roleId=String(owned.discord_role_id);try{await discord(`/guilds/${guildId}/roles/${roleId}`,{method:'PATCH',body:JSON.stringify(rolePayload)});}catch{try{await discord(`/guilds/${guildId}/roles/${roleId}`,{method:'PATCH',body:JSON.stringify(fallbackPayload)});}catch{await discord(`/guilds/${guildId}/roles/${roleId}`,{method:'PATCH',body:JSON.stringify({name:req.requested_name,color:requestedPrimary,mentionable:false,hoist:false})});}}}
    else roleId=await createRole();
    if(s?.custom_role_anchor_role_id&&roleId){const anchor=roles.find((r:any)=>String(r.id)===String(s.custom_role_anchor_role_id));if(anchor&&Number(anchor.position)>1)await discord(`/guilds/${guildId}/roles`,{method:'PATCH',body:JSON.stringify([{id:roleId,position:Number(anchor.position)-1}])}).catch(()=>{});}
    if(roleId)await discord(`/guilds/${guildId}/members/${req.user_id}/roles/${roleId}`,{method:'PUT',body:''});
    await db.query(`INSERT INTO member_custom_roles(guild_id,user_id,discord_role_id,last_request_id) VALUES($1,$2,$3,$4) ON CONFLICT(guild_id,user_id) DO UPDATE SET discord_role_id=EXCLUDED.discord_role_id,last_request_id=EXCLUDED.last_request_id,updated_at=NOW()`,[guildId,req.user_id,roleId,requestId]);
  }
  await db.query(`UPDATE custom_role_requests SET status=$2,reviewer_id=$3,reviewer_note=$4,discord_role_id=COALESCE($5,discord_role_id),decided_at=NOW(),updated_at=NOW() WHERE id=$1`,[requestId,approved?'APPROVED':'DECLINED',reviewerId,note,roleId]);
  await sentinelRecord({source:'bom',category:'membership',action:approved?'custom_role.approved':'custom_role.declined',actorId:reviewerId,initiatorId:reviewerId,executorId:'api',targetId:req.user_id,reversible:approved,metadata:{requestId,roleId,roleName:req.requested_name,note}});
  await dm(req.user_id,approved?`Your **${req.requested_name}** custom role request was approved.${dashboard?`\n${dashboard}/dashboard/members`:''}`:`Your custom role request for **${req.requested_name}** was declined.${note?`\nReason: ${note}`:''}`);
  if(req.discord_message_id){const s=await settings(guildId);if(s?.custom_role_approval_channel_id)await discord(`/channels/${s.custom_role_approval_channel_id}/messages/${req.discord_message_id}`,{method:'PATCH',body:JSON.stringify({content:`Custom role request **${approved?'approved':'declined'}** by <@${reviewerId}>.`,components:[],allowed_mentions:{parse:[]}})}).catch(()=>{});}
  return {ok:true,status:approved?'APPROVED':'DECLINED',roleId};
}


const MEDIA_KINDS=['EMOJI','ANIMATED_EMOJI','STICKER','SOUNDBOARD'] as const;
type MediaKind=(typeof MEDIA_KINDS)[number];
async function prepareGuildMedia(kind:MediaKind,mime:string,data:string){
  const raw=Buffer.from(data,'base64');
  if(raw.length===0||raw.length>1024*1024)throw new Error('File must be smaller than 1 MB before processing.');
  const header=raw.subarray(0,12).toString('latin1');
  if(kind==='ANIMATED_EMOJI'){
    if(mime!=='image/gif'||!/^GIF8[79]a/.test(header))throw new Error('Animated emoji requires a valid GIF file.');
    const metadata=await sharp(raw,{animated:true,limitInputPixels:12_000_000}).metadata();
    if(Number(metadata.pages??1)>80)throw new Error('Animated emoji can contain at most 80 frames.');
    const gif=await sharp(raw,{animated:true,limitInputPixels:12_000_000}).resize(128,128,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).gif({effort:5}).toBuffer();
    if(gif.length>256*1024)throw new Error('Converted GIF is too large; use a shorter animation or fewer colors (256 KiB limit).');
    return {bytes:gif,mime:'image/gif'};
  }
  if(kind==='SOUNDBOARD'){
    if(mime!=='audio/mpeg'||(!header.startsWith('ID3')&&!/^\xff[\xfb\xf3\xf2]/.test(header))||raw.length>512*1024)throw new Error('Soundboard clips must be MP3 under 512 KiB (5 seconds max).');
    return {bytes:raw,mime:'audio/mpeg'};
  }
  if(!['image/png','image/jpeg','image/webp'].includes(mime))throw new Error('Upload a PNG, JPEG, or WebP image.');
  const edge=kind==='STICKER'?320:128;
  const image=await sharp(raw,{limitInputPixels:12_000_000}).resize(edge,edge,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png({palette:kind==='EMOJI',compressionLevel:9}).toBuffer();
  if(image.length>(kind==='STICKER'?512:256)*1024)throw new Error('Converted image exceeds Discord size limits.');
  return {bytes:image,mime:'image/png'};
}
async function publishGuildMedia(guildId:string,row:any){
 const bytes:Buffer=Buffer.isBuffer(row.content)?row.content:Buffer.from(row.content?.data??row.content??[]);
 if(row.kind==='EMOJI'||row.kind==='ANIMATED_EMOJI'){
   return discord(`/guilds/${guildId}/emojis`,{method:'POST',body:JSON.stringify({name:row.name,image:`data:${row.mime};base64,${bytes.toString('base64')}`})});
 }
 if(row.kind==='SOUNDBOARD'){
   return discord(`/guilds/${guildId}/soundboard-sounds`,{method:'POST',body:JSON.stringify({name:row.name,sound:`data:${row.mime};base64,${bytes.toString('base64')}`,volume:1})});
 }
 const form=new FormData();form.set('name',String(row.name));form.set('description',String(row.description??'BOM sticker').slice(0,100));form.set('tags',String(row.tags??'🏴‍☠️').trim()||'🏴‍☠️');form.set('file',new Blob([new Uint8Array(bytes) as any],{type:'image/png'}),`${row.name}.png`);
 const res=await fetch(`${apiBase}/guilds/${guildId}/stickers`,{method:'POST',headers:botHeaders,body:form,signal:AbortSignal.timeout(20_000)});
 const text=await res.text();let obj:any={};try{obj=text?JSON.parse(text):{};}catch{obj={message:text};}
 if(!res.ok)throw new Error(obj?.message??`Discord sticker upload failed (${res.status})`);
 return obj;
}

async function knownPrefixes(guildId:string){return many<any>(`SELECT role_id,prefix FROM guild_prefix_rules WHERE guild_id=$1`,[guildId]);}
function baseNickname(name:string,prefixes:any[]){
  return nicknameBase(name,prefixes.map(p=>String(p.prefix??'').trim()));
}
function previousPrefix(previous:any,roles:Set<string>){
  const stored=String(previous?.former_prefix??'').trim();
  const savedRoleIds=json<string[]>(previous?.removed_role_ids,[]);
  return stored&&savedRoleIds.some(id=>roles.has(String(id)))?stored:'';
}
async function returnPrefixMap(guildId:string){
  const rows=await many<any>(`SELECT DISTINCT ON (user_id) user_id,former_prefix,removed_role_ids FROM member_leaves WHERE guild_id=$1 AND status='RETURNED' ORDER BY user_id,returned_at DESC`,[guildId]);
  return new Map<string,any>(rows.map((x:any)=>[String(x.user_id),x]));
}
async function applyPrefixToMember(guildId:string,m:any,rules:any[],rolePositions:Map<string,number>,stripRules:any[]=rules){
  const held=new Set<string>((m.roles??[]).map(String));
  const matches=rules.filter(r=>held.has(String(r.role_id))).sort((a,b)=>(rolePositions.get(String(b.role_id))??0)-(rolePositions.get(String(a.role_id))??0));
  const current=m.nick??m.user?.global_name??m.user?.username??'Member',base=baseNickname(current,stripRules);
  const [away,previous]=await Promise.all([
    oneOrNone<any>(`SELECT 1 FROM member_leaves WHERE guild_id=$1 AND user_id=$2 AND status='AWAY'`,[guildId,String(m.user.id)]),
    oneOrNone<any>(`SELECT former_prefix,removed_role_ids FROM member_leaves WHERE guild_id=$1 AND user_id=$2 AND status='RETURNED' ORDER BY returned_at DESC LIMIT 1`,[guildId,String(m.user.id)])
  ]);
  const tag=away?'[AFK]':(matches[0]?.prefix??previousPrefix(previous,held));
  const next=proposedNickname(current,stripRules.map((r:any)=>String(r.prefix??'')),tag);
  if(next!==current)await discord(`/guilds/${guildId}/members/${m.user.id}`,{method:'PATCH',body:JSON.stringify({nick:next})}).catch(()=>{});
}

export function registerMembershipRoutes(app:any,{guildId,requireMember,requireAdmin,userId}:{guildId:string;requireMember:any;requireAdmin:any;userId:(req:any)=>string}){
  app.get('/v1/membership/summary',async(req:any,reply:any)=>{if(!(await requireMember(req,reply))?.member)return;const uid=userId(req),[profile,prefs,owned,pending,s,leave]=await Promise.all([oneOrNone<any>(`SELECT * FROM member_profiles WHERE guild_id=$1 AND user_id=$2`,[guildId,uid]),oneOrNone<any>(`SELECT * FROM pb_preferred_profiles WHERE guild_id=$1 AND user_id=$2`,[guildId,uid]),oneOrNone<any>(`SELECT * FROM member_custom_roles WHERE guild_id=$1 AND user_id=$2`,[guildId,uid]),many<any>(`SELECT * FROM custom_role_requests WHERE guild_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 10`,[guildId,uid]),settings(guildId),oneOrNone<any>(`SELECT * FROM member_leaves WHERE guild_id=$1 AND user_id=$2 AND status='AWAY' ORDER BY started_at DESC LIMIT 1`,[guildId,uid])]);return {userId:uid,profile,pbProfile:prefs?{...prefs,rates:json(prefs.rates,{}),owned_rates:json(prefs.owned_rates,{})}:{rates:{},owned_rates:{},horn_preferred:false},customRole:owned,requests:pending,leave,canRemind:await rosterManager(uid,guildId),publicSettings:{customRolesEnabled:Boolean(s?.custom_roles_enabled),rosterEnabled:Boolean(s?.roster_enabled),leaveEnabled:Boolean(s?.leave_enabled)}};});

  app.get('/v1/membership/profile',async(req:any,reply:any)=>{if(!(await requireMember(req,reply))?.member)return;const uid=userId(req);return {profile:await oneOrNone<any>(`SELECT * FROM member_profiles WHERE guild_id=$1 AND user_id=$2`,[guildId,uid]),pbProfile:await oneOrNone<any>(`SELECT * FROM pb_preferred_profiles WHERE guild_id=$1 AND user_id=$2`,[guildId,uid])};});
  app.put('/v1/membership/profile',async(req:any,reply:any)=>{const access=await requireMember(req,reply);if(!access?.member)return;const uid=userId(req),b=z.object({captainName:z.string().trim().max(80).nullable().optional(),gameRank:z.number().int().min(15).max(30).nullable().optional(),ownedRates:z.record(z.string(),z.array(z.string().max(100))).optional(),rates:z.record(z.string(),z.any()).optional(),hornPreferred:z.boolean().optional()}).parse(req.body??{});const member=await discord(`/guilds/${guildId}/members/${uid}`);
    await db.query(`INSERT INTO member_profiles(guild_id,user_id,display_name,username,avatar_url,joined_at,updated_by) VALUES($1,$2,$3,$4,$5,$6,$2) ON CONFLICT(guild_id,user_id) DO UPDATE SET display_name=EXCLUDED.display_name,username=EXCLUDED.username,avatar_url=EXCLUDED.avatar_url,joined_at=COALESCE(member_profiles.joined_at,EXCLUDED.joined_at),updated_by=$2,updated_at=NOW()`,[guildId,uid,member.nick??member.user.global_name??member.user.username,member.user.username,userAvatar(member.user),member.joined_at??null]);
    if(b.captainName!==undefined)await db.query(`UPDATE member_profiles SET captain_name=$3,updated_by=$2,updated_at=NOW() WHERE guild_id=$1 AND user_id=$2`,[guildId,uid,b.captainName]);
    if(b.gameRank!==undefined)await db.query(`UPDATE member_profiles SET game_rank=$3,updated_by=$2,updated_at=NOW() WHERE guild_id=$1 AND user_id=$2`,[guildId,uid,b.gameRank]);
    await db.query(`UPDATE member_profiles SET profile_completed_at=CASE WHEN captain_name IS NOT NULL AND captain_name<>'' AND game_rank IS NOT NULL THEN COALESCE(profile_completed_at,NOW()) ELSE NULL END WHERE guild_id=$1 AND user_id=$2`,[guildId,uid]);
    await db.query(`INSERT INTO pb_preferred_profiles(guild_id,user_id,rates,horn_preferred,owned_rates) VALUES($1,$2,COALESCE($3::jsonb,'{}'::jsonb),COALESCE($4,false),COALESCE($5::jsonb,'{}'::jsonb)) ON CONFLICT(guild_id,user_id) DO UPDATE SET rates=CASE WHEN $3::jsonb IS NULL THEN pb_preferred_profiles.rates ELSE $3::jsonb END,horn_preferred=CASE WHEN $4::boolean IS NULL THEN pb_preferred_profiles.horn_preferred ELSE $4::boolean END,owned_rates=CASE WHEN $5::jsonb IS NULL THEN pb_preferred_profiles.owned_rates ELSE $5::jsonb END,updated_at=NOW()`,[guildId,uid,b.rates?JSON.stringify(b.rates):null,b.hornPreferred??null,b.ownedRates?JSON.stringify(b.ownedRates):null]);
    await sentinelRecord({source:'bom',category:'membership',action:'member.profile.updated',actorId:uid,targetId:uid,reversible:true,metadata:{captainNameChanged:b.captainName!==undefined,rankChanged:b.gameRank!==undefined,shipsChanged:Boolean(b.ownedRates||b.rates)}});return {ok:true};});

  app.get('/v1/membership/roster',async(req:any,reply:any)=>{if(!(await requireMember(req,reply))?.member)return;const s=await settings(guildId);if(!s?.roster_enabled)return reply.code(404).send({error:'roster_disabled'});const [members,ctx,profiles,prefs]=await Promise.all([allMembers(guildId),discordContext(),many<any>(`SELECT * FROM member_profiles WHERE guild_id=$1`,[guildId]),many<any>(`SELECT * FROM pb_preferred_profiles WHERE guild_id=$1`,[guildId])]);const pMap=new Map(profiles.map((x:any)=>[String(x.user_id),x])),prefMap=new Map(prefs.map((x:any)=>[String(x.user_id),x])),roleMap=new Map((ctx.roles??[]).map((r:any)=>[String(r.id),r])),officerIds=new Set<string>(json(s?.officer_role_ids,[]).map((x:any)=>String(x)));const eligible=members.filter((m:any)=>!m.user?.bot);const rows=eligible.map((m:any)=>{const uid=String(m.user.id),p=pMap.get(uid) as any,pref=prefMap.get(uid) as any,roles=(m.roles??[]).map((id:string)=>roleMap.get(String(id))).filter(Boolean).sort((a:any,b:any)=>Number(b.position??0)-Number(a.position??0));const rates=json(pref?.rates,{}),owned=json(pref?.owned_rates,{});return {userId:uid,displayName:m.nick??m.user.global_name??m.user.username,username:m.user.username,avatarUrl:userAvatar(m.user),joinedAt:m.joined_at,roles:roles.map((r:any)=>({id:r.id,name:r.name,color:r.color,position:r.position})),highestRole:roles[0]??null,captainName:p?.captain_name??null,gameRank:p?.game_rank??null,profileUpdatedAt:p?.updated_at??null,rates,ownedRates:owned,profileComplete:Boolean(p?.captain_name&&p?.game_rank),isOfficer:(m.roles??[]).some((id:string)=>officerIds.has(String(id)))};}).sort((a:any,b:any)=>Number(b.highestRole?.position??0)-Number(a.highestRole?.position??0)||a.displayName.localeCompare(b.displayName));return {members:rows,total:rows.length,officers:rows.filter((x:any)=>x.isOfficer).length,incomplete:rows.filter((x:any)=>!x.profileComplete).length};});

  app.get('/v1/membership/discord-context',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;return {discord:await discordContext(true)};});
  app.get('/v1/membership/settings',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;const [s,ctx,prefixes,connections]=await Promise.all([settings(guildId),discordContext(),knownPrefixes(guildId),many<any>(`SELECT * FROM role_connections WHERE guild_id=$1 ORDER BY updated_at DESC`,[guildId])]);return {settings:s,discord:ctx,prefixes,connections:connections.map((x:any)=>({...x,destination_role_ids:json(x.destination_role_ids,[])}))};});
  app.put('/v1/membership/settings',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;const b=z.object({welcomeEnabled:z.boolean().optional(),welcomeChannelId:z.string().nullable().optional(),applicationUrl:z.string().url().nullable().optional(),tradeUrl:z.string().url().nullable().optional(),tradeRoleId:z.string().nullable().optional(),diplomacyEnabled:z.boolean().optional(),diplomacyCategoryId:z.string().nullable().optional(),diplomacyRoleId:z.string().nullable().optional(),diplomacyArchiveChannelId:z.string().nullable().optional(),diplomacyVoiceEnabled:z.boolean().optional(),customRolesEnabled:z.boolean().optional(),customRoleApprovalChannelId:z.string().nullable().optional(),customRoleApprovalRoleId:z.string().nullable().optional(),customRoleAnchorRoleId:z.string().nullable().optional(),memberRoleId:z.string().nullable().optional(),allianceRoleId:z.string().regex(/^\d{15,22}$/).nullable().optional(),memberConsoleChannelId:z.string().nullable().optional(),rosterEnabled:z.boolean().optional(),profileReminderRoleId:z.string().nullable().optional(),officerRoleIds:z.array(z.string()).max(20).optional(),leaveEnabled:z.boolean().optional(),leaveOfficerRoleId:z.string().nullable().optional(),leaveReminderChannelId:z.string().nullable().optional(),afkRoleId:z.string().nullable().optional(),bom2MemberRoleId:z.string().nullable().optional(),bom2AfkRoleId:z.string().nullable().optional(),leaveMemberRoleIds:z.array(z.string()).max(12).optional()}).parse(req.body??{});const current=await settings(guildId);
    const roles={
      member:String(b.memberRoleId??current.member_role_id??''),
      afk:String(b.afkRoleId??current.afk_role_id??''),
      second:String(b.bom2MemberRoleId??current.bom2_member_role_id??''),
      secondAfk:String(b.bom2AfkRoleId??current.bom2_afk_role_id??'')
    };
    const configured=Object.values(roles).filter(Boolean);
    if(new Set(configured).size!==configured.length)return reply.code(400).send({error:'BOM and BoM 2 membership/AFK roles must all be distinct.'});
    if(Boolean(roles.second)!==Boolean(roles.secondAfk))return reply.code(400).send({error:'Configure both BoM 2 member and BoM 2 AFK roles, or leave both empty.'});
    const mapping:any={welcomeEnabled:'welcome_enabled',welcomeChannelId:'welcome_channel_id',applicationUrl:'application_url',tradeUrl:'trade_url',tradeRoleId:'trade_role_id',diplomacyEnabled:'diplomacy_enabled',diplomacyCategoryId:'diplomacy_category_id',diplomacyRoleId:'diplomacy_role_id',diplomacyArchiveChannelId:'diplomacy_archive_channel_id',diplomacyVoiceEnabled:'diplomacy_voice_enabled',customRolesEnabled:'custom_roles_enabled',customRoleApprovalChannelId:'custom_role_approval_channel_id',customRoleApprovalRoleId:'custom_role_approval_role_id',customRoleAnchorRoleId:'custom_role_anchor_role_id',memberRoleId:'member_role_id',allianceRoleId:'alliance_role_id',memberConsoleChannelId:'member_console_channel_id',rosterEnabled:'roster_enabled',profileReminderRoleId:'profile_reminder_role_id',officerRoleIds:'officer_role_ids',leaveEnabled:'leave_enabled',leaveOfficerRoleId:'leave_officer_role_id',leaveReminderChannelId:'leave_reminder_channel_id',afkRoleId:'afk_role_id',bom2MemberRoleId:'bom2_member_role_id',bom2AfkRoleId:'bom2_afk_role_id',leaveMemberRoleIds:'leave_member_role_ids'};
    const assignments:string[]=[],values:any[]=[guildId];for(const [key,column] of Object.entries(mapping)){if(!(key in b))continue;let value=(b as any)[key];if(key==='officerRoleIds'||key==='leaveMemberRoleIds')value=JSON.stringify(value??[]);values.push(value);assignments.push(`${column}=$${values.length}${key==='officerRoleIds'||key==='leaveMemberRoleIds'?'::jsonb':''}`);}values.push(userId(req));assignments.push(`updated_by=$${values.length}`,'updated_at=NOW()');if(assignments.length)await db.query(`UPDATE membership_settings SET ${assignments.join(',')} WHERE guild_id=$1`,values);
    await sentinelRecord({source:'bom',category:'membership',action:'membership.settings.updated',actorId:userId(req),metadata:{keys:Object.keys(b)}});return {ok:true};});

  app.get('/v1/membership/custom-roles',async(req:any,reply:any)=>{if(!(await requireMember(req,reply))?.member)return;const admin=await reviewer(userId(req),guildId);return admin?many<any>(`SELECT * FROM custom_role_requests WHERE guild_id=$1 ORDER BY CASE status WHEN 'PENDING' THEN 0 ELSE 1 END,created_at DESC LIMIT 250`,[guildId]):many<any>(`SELECT * FROM custom_role_requests WHERE guild_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 25`,[guildId,userId(req)]);});
  app.post('/v1/membership/custom-roles',async(req:any,reply:any)=>{if(!(await requireMember(req,reply))?.member)return;const s=await settings(guildId);if(!s?.custom_roles_enabled)return reply.code(409).send({error:'custom_roles_disabled'});const b=z.object({name:z.string().trim().min(2).max(80),primaryColor:z.string().regex(/^#?[0-9a-fA-F]{6}$/),secondaryColor:z.string().regex(/^#?[0-9a-fA-F]{6}$/).nullable().optional(),gradientDirection:z.enum(['LEFT_TO_RIGHT','RIGHT_TO_LEFT']).nullable().optional(),unicodeEmoji:z.string().max(40).nullable().optional(),iconData:z.string().max(150000).regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/).nullable().optional()}).parse(req.body??{});if(/@(?:everyone|here)/i.test(b.name))return reply.code(400).send({error:'reserved_role_name'});const uid=userId(req),existing=await oneOrNone<any>(`SELECT id FROM custom_role_requests WHERE guild_id=$1 AND user_id=$2 AND status='PENDING'`,[guildId,uid]);if(existing)return reply.code(409).send({error:'request_already_pending',id:existing.id});const id=randomUUID(),primary=colorInt(b.primaryColor),secondary=b.secondaryColor?colorInt(b.secondaryColor):null;if(primary==null)return reply.code(400).send({error:'invalid_color'});await db.query(`INSERT INTO custom_role_requests(id,guild_id,user_id,requested_name,primary_color,secondary_color,gradient_direction,unicode_emoji,icon_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,guildId,uid,b.name,primary,secondary,b.gradientDirection??null,b.unicodeEmoji??null,b.iconData??null]);const row=await oneOrNone<any>(`SELECT * FROM custom_role_requests WHERE id=$1`,[id]);await postRoleReview(guildId,row).catch(()=>{});await sentinelRecord({source:'bom',category:'membership',action:'custom_role.requested',actorId:uid,targetId:uid,metadata:{requestId:id,roleName:b.name}});return {ok:true,id};});
  app.post('/v1/membership/custom-roles/:id/decision',async(req:any,reply:any)=>{if(!await reviewer(userId(req),guildId))return reply.code(403).send({error:'reviewer_required'});const b=z.object({approved:z.boolean(),note:z.string().max(500).nullable().optional()}).parse(req.body??{});try{return await decideCustomRole(guildId,String(req.params.id),userId(req),b.approved,b.note??null);}catch(e:any){return reply.code(e.statusCode??500).send({error:e.message??'decision_failed'});}});


  // Moderated Discord expression requests. Media is validated before storage and
  // published only after an explicit Admiralty decision.
  app.get('/v1/membership/media-requests',async(req:any,reply:any)=>{
    if(!(await requireMember(req,reply))?.member)return;
    const uid=userId(req),canReview=await reviewer(uid,guildId);
    return canReview?many<any>(`SELECT id,user_id,kind,name,description,tags,status,reviewer_id,reviewer_note,discord_asset_id,created_at FROM guild_media_requests WHERE guild_id=$1 ORDER BY CASE status WHEN 'PENDING' THEN 0 ELSE 1 END, created_at DESC LIMIT 150`,[guildId]):many<any>(`SELECT id,user_id,kind,name,description,tags,status,reviewer_note,discord_asset_id,created_at FROM guild_media_requests WHERE guild_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 60`,[guildId,uid]);
  });
  app.post('/v1/membership/media-requests',{bodyLimit:2_100_000},async(req:any,reply:any)=>{
    if(!(await requireMember(req,reply))?.member)return;
    const b=z.object({kind:z.enum(MEDIA_KINDS),name:z.string().trim().min(2).max(32).regex(/^[a-zA-Z0-9_ -]+$/),description:z.string().max(100).default(''),tags:z.string().max(80).default(''),mime:z.enum(['image/png','image/jpeg','image/webp','image/gif','audio/mpeg']),data:z.string().min(8).max(1_500_000).regex(/^[a-zA-Z0-9+/=]+$/)}).parse(req.body??{});
    const uid=userId(req),pending=await oneOrNone<any>(`SELECT COUNT(*)::int AS count FROM guild_media_requests WHERE guild_id=$1 AND user_id=$2 AND status='PENDING'`,[guildId,uid]);
    if(Number(pending?.count??0)>=3)return reply.code(429).send({error:'Maximum of three pending requests per member.'});
    const requestedName=b.name.trim();
    if(b.kind==='EMOJI'||b.kind==='ANIMATED_EMOJI'){
      if(!/^[a-zA-Z0-9_]{2,32}$/.test(requestedName))return reply.code(400).send({error:'Emoji names must be 2–32 letters, numbers, or underscores.'});
    }else if(b.kind==='STICKER'&&requestedName.length>30){
      return reply.code(400).send({error:'Sticker names must be at most 30 characters.'});
    }
    const converted=await prepareGuildMedia(b.kind,b.mime,b.data);
    const id=randomUUID();await db.query(`INSERT INTO guild_media_requests(id,guild_id,user_id,kind,name,description,tags,mime,content) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,guildId,uid,b.kind,requestedName,b.description,b.tags,converted.mime,converted.bytes]);
    await sentinelRecord({source:'bom',category:'membership',action:'guild_media.requested',actorId:uid,targetId:id,metadata:{kind:b.kind,name:b.name}}).catch(()=>{});
    const mediaSettings=await settings(guildId);if(mediaSettings?.custom_role_approval_channel_id){await discord(`/channels/${mediaSettings.custom_role_approval_channel_id}/messages`,{method:'POST',body:JSON.stringify({content:mediaSettings.custom_role_approval_role_id?`<@&${mediaSettings.custom_role_approval_role_id}>`:undefined,embeds:[{title:'New Guild Media Request',description:`**Member:** <@${uid}>\n**Type:** ${b.kind.replace('_',' ')}\n**Name:** ${b.name}\nReview requests on the Membership & Welcome dashboard.`,color:0xd9aa3c}],allowed_mentions:{parse:[],roles:mediaSettings.custom_role_approval_role_id?[mediaSettings.custom_role_approval_role_id]:[]}})}).catch(()=>{});}
    return {ok:true,id};
  });
  app.get('/v1/membership/media-requests/:id/preview',async(req:any,reply:any)=>{
    if(!(await requireMember(req,reply))?.member)return;
    const uid=userId(req),row=await oneOrNone<any>(`SELECT user_id,mime,content FROM guild_media_requests WHERE guild_id=$1 AND id=$2`,[guildId,String(req.params.id)]);
    if(!row||!row.content)return reply.code(404).send({error:'preview_unavailable'});
    if(String(row.user_id)!==uid&&!await reviewer(uid,guildId))return reply.code(403).send({error:'forbidden'});
    return reply.header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff').type(row.mime).send(row.content);
  });
  app.post('/v1/membership/media-requests/:id/decision',async(req:any,reply:any)=>{
    const moderator=userId(req);if(!await reviewer(moderator,guildId))return reply.code(403).send({error:'reviewer_required'});
    const id=String(req.params.id),b=z.object({approved:z.boolean(),note:z.string().max(500).optional()}).parse(req.body??{});
    // Atomically claim the request before calling Discord, preventing duplicate
    // submissions when two officers approve at the same time.
    const claimed=await db.query(`UPDATE guild_media_requests SET status='PROCESSING',updated_at=NOW() WHERE guild_id=$1 AND id=$2 AND status='PENDING' RETURNING *`,[guildId,id]);
    const row=(claimed.rows??[])[0];
    if(!row)return reply.code(409).send({error:'Request not found or already being reviewed.'});
    let assetId:string|null=null;
    if(b.approved){
      try{const created=await publishGuildMedia(guildId,row);assetId=String(created?.id??'');if(!assetId)throw new Error('Discord did not return an asset ID.');}
      catch(e:any){await db.query(`UPDATE guild_media_requests SET status='PENDING',updated_at=NOW() WHERE guild_id=$1 AND id=$2 AND status='PROCESSING'`,[guildId,id]);return reply.code(502).send({error:`Discord rejected the upload: ${String(e?.message??e)}`});}
    }
    await db.query(`UPDATE guild_media_requests SET status=$3,reviewer_id=$4,reviewer_note=$5,discord_asset_id=$6,content=NULL,updated_at=NOW() WHERE guild_id=$1 AND id=$2 AND status='PROCESSING'`,[guildId,id,b.approved?'APPROVED':'DECLINED',moderator,b.note??null,assetId]);
    await sentinelRecord({source:'bom',category:'membership',action:b.approved?'guild_media.approved':'guild_media.declined',actorId:moderator,targetId:id,metadata:{userId:row.user_id,kind:row.kind,name:row.name,assetId}}).catch(()=>{});
    await dm(String(row.user_id),`Your ${String(row.kind).toLowerCase().replace('_',' ')} request **${row.name}** was ${b.approved?'approved':'declined'}.${b.note?`\nAdmiralty note: ${b.note}`:''}`);
    return {ok:true,status:b.approved?'APPROVED':'DECLINED',assetId};
  });

  // On-demand Admiralty audit: no nickname or roles are changed by scanning.
  app.get('/v1/membership/audit',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;
    const [members,ctx,rules,connections,returns]=await Promise.all([allMembers(guildId),discordContext(true),knownPrefixes(guildId),many<any>(`SELECT source_role_id,destination_role_ids FROM role_connections WHERE guild_id=$1`,[guildId]),returnPrefixMap(guildId)]);
    const positions=new Map<string,number>((ctx.roles??[]).map((r:any)=>[String(r.id),Number(r.position??0)]));
    const awayIds=new Set<string>((await many<any>(`SELECT user_id FROM member_leaves WHERE guild_id=$1 AND status='AWAY'`,[guildId])).map((r:any)=>String(r.user_id)));
    const issues:any[]=[];let scanned=0;
    for(const member of members){if(member.user?.bot)continue;scanned++;
      const owned=new Set<string>(member.roles??[]),matching=rules.filter(x=>owned.has(String(x.role_id))).sort((a,b)=>(positions.get(String(b.role_id))??0)-(positions.get(String(a.role_id))??0));
      const current=String(member.nick??member.user.global_name??member.user.username??'Member');
      const base=baseNickname(current,rules),tag=awayIds.has(String(member.user.id))?'[AFK]':(matching[0]?.prefix??previousPrefix(returns.get(String(member.user.id)),owned)),desired=proposedNickname(current,rules.map((r:any)=>String(r.prefix??'')),tag);
      const missing=[...new Set(connections.filter(c=>owned.has(String(c.source_role_id))).flatMap(c=>json<string[]>(c.destination_role_ids,[])).filter(id=>!owned.has(id)))];
      const reasons:string[]=[];
      if(matching.length>1)reasons.push('Multiple configured guild prefix roles: choose the intended guild role first.');
      if(current!==desired)reasons.push('Incorrect, missing, or repeated nickname prefix.');
      if(missing.length)reasons.push(`${missing.length} missing connected role(s).`);
      if(reasons.length)issues.push({userId:String(member.user.id),current,proposed:desired,reasons,conflict:matching.length>1,matchingPrefixRoles:matching.map(x=>x.role_id),missingRoleIds:missing,missingRoleNames:missing.map(id=>ctx.roles.find((r:any)=>String(r.id)===id)?.name??id)});
    }
    return {scanned,issues:issues.slice(0,600),truncated:issues.length>600,totalIssues:issues.length,generatedAt:new Date().toISOString()};
  });
  app.post('/v1/membership/audit/:userId/apply',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;
    const uid=String(req.params.userId),b=z.object({applyPrefix:z.boolean().default(false),applyConnections:z.boolean().default(false)}).parse(req.body??{});
    if(!b.applyPrefix&&!b.applyConnections)return reply.code(400).send({error:'no_correction_selected'});
    const member=await discord(`/guilds/${guildId}/members/${uid}`);
    if(!member||member.user?.bot)return reply.code(404).send({error:'member_not_found'});
    const [ctx,rules,connections]=await Promise.all([discordContext(true),knownPrefixes(guildId),many<any>(`SELECT source_role_id,destination_role_ids FROM role_connections WHERE guild_id=$1`,[guildId])]);
    const positions=new Map<string,number>((ctx.roles??[]).map((r:any)=>[String(r.id),Number(r.position??0)]));
    const held=new Set<string>(member.roles??[]),matching=rules.filter(x=>held.has(String(x.role_id)));
    if(b.applyPrefix){if(matching.length>1)return reply.code(409).send({error:'multiple_guild_roles_manual_resolution_required'});await applyPrefixToMember(guildId,member,rules,positions);}
    const granted:string[]=[];
    if(b.applyConnections){const required=[...new Set(connections.filter(c=>held.has(String(c.source_role_id))).flatMap(c=>json<string[]>(c.destination_role_ids,[])).filter(id=>!held.has(id)))];
      for(const id of required){await discord(`/guilds/${guildId}/members/${uid}/roles/${id}`,{method:'PUT',body:''});granted.push(id);}}
    await sentinelRecord({source:'bom',category:'membership',action:'membership.audit.correction',actorId:userId(req),targetId:uid,metadata:{prefix:b.applyPrefix,granted}});
    return {ok:true,granted};
  });
  // Admiralty reconciliation queue: the GET endpoint is read-only and never changes Discord.
  // Corrections are explicit per-member operations with a fresh role check at apply time.
  const prefixAuditRows=async()=>{
    const [members,context,rules,connections,returns]=await Promise.all([allMembers(guildId),discordContext(true),knownPrefixes(guildId),many<any>(`SELECT source_role_id,destination_role_ids FROM role_connections WHERE guild_id=$1`,[guildId]),returnPrefixMap(guildId)]);
    const positions=new Map<string,number>((context.roles??[]).map((role:any)=>[String(role.id),Number(role.position??0)]));
    const awayIds=new Set<string>((await many<any>(`SELECT user_id FROM member_leaves WHERE guild_id=$1 AND status='AWAY'`,[guildId])).map((r:any)=>String(r.user_id)));
    return members.filter((m:any)=>!m.user?.bot).map((m:any)=>{
      const roles=new Set<string>((m.roles??[]).map(String));
      const matching=rules.filter((rule:any)=>roles.has(String(rule.role_id))).sort((a:any,b:any)=>(positions.get(String(b.role_id))??0)-(positions.get(String(a.role_id))??0));
      const current=String(m.nick??m.user?.global_name??m.user?.username??'Member');
      const base=baseNickname(current,rules),tag=awayIds.has(String(m.user.id))?'[AFK]':(matching[0]?.prefix??previousPrefix(returns.get(String(m.user.id)),roles));
      const expected=proposedNickname(current,rules.map((r:any)=>String(r.prefix??'')),tag);
      const missingRoleIds=[...new Set<string>(connections.filter((c:any)=>roles.has(String(c.source_role_id))).flatMap((c:any)=>json<string[]>(c.destination_role_ids,[])).map(String).filter((id:string)=>!roles.has(id)))];
      const prefixMismatch=current!==expected,roleConflict=matching.length>1;
      return {userId:String(m.user.id),current,expected,base,displayName:String(m.nick??m.user.global_name??m.user.username??'Member'),username:String(m.user.username??''),avatarUrl:userAvatar(m.user),duplicateTags:collapseDuplicateLeadingTags(current).duplicates,matchedPrefixes:matching.map((x:any)=>x.prefix),roleConflict,prefixMismatch,missingRoleIds,issueCount:Number(prefixMismatch)+missingRoleIds.length+Number(roleConflict)};
    }).filter((row:any)=>row.issueCount>0).sort((a:any,b:any)=>b.issueCount-a.issueCount||a.current.localeCompare(b.current));
  };
  app.get('/v1/membership/prefix-audit',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;const rows=await prefixAuditRows();return {issues:rows,total:rows.length,checkedAt:new Date().toISOString()};});
  app.post('/v1/membership/prefix-audit/:userId/apply',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;
    const uid=String(req.params.userId);if(!/^\d{15,22}$/.test(uid))return reply.code(400).send({error:'invalid_member'});
    const b=z.object({fixPrefix:z.boolean().default(true),fixConnections:z.boolean().default(true)}).parse(req.body??{});
    const [member,rules,context,connections]=await Promise.all([discord(`/guilds/${guildId}/members/${uid}`),knownPrefixes(guildId),discordContext(true),many<any>(`SELECT source_role_id,destination_role_ids FROM role_connections WHERE guild_id=$1`,[guildId])]);
    if(member.user?.bot)return reply.code(409).send({error:'not_a_human_member'});
    const held=new Set<string>((member.roles??[]).map(String));
    const positions=new Map<string,number>((context.roles??[]).map((x:any)=>[String(x.id),Number(x.position??0)]));
    const matches=rules.filter((rule:any)=>held.has(String(rule.role_id))).sort((a:any,b:any)=>(positions.get(String(b.role_id))??0)-(positions.get(String(a.role_id))??0));
    if(b.fixPrefix&&matches.length>1)return reply.code(409).send({error:'conflicting_prefix_roles',message:'Resolve conflicting guild roles manually before changing the nickname.'});
    const [awayRecord,previous]=await Promise.all([oneOrNone<any>(`SELECT 1 FROM member_leaves WHERE guild_id=$1 AND user_id=$2 AND status='AWAY'`,[guildId,uid]),oneOrNone<any>(`SELECT former_prefix,removed_role_ids FROM member_leaves WHERE guild_id=$1 AND user_id=$2 AND status='RETURNED' ORDER BY returned_at DESC LIMIT 1`,[guildId,uid])]);
    let changedNickname=false;const addedRoles:string[]=[];const failures:string[]=[];
    if(b.fixPrefix){const current=String(member.nick??member.user.global_name??member.user.username??'Member'),base=baseNickname(current,rules),tag=awayRecord?'[AFK]':(matches[0]?.prefix??previousPrefix(previous,held)),expected=(tag?`${tag} ${base}`:base).slice(0,32);
      if(current!==expected){await discord(`/guilds/${guildId}/members/${uid}`,{method:'PATCH',body:JSON.stringify({nick:expected})});changedNickname=true;}}
    if(b.fixConnections){const required=[...new Set<string>(connections.filter((x:any)=>held.has(String(x.source_role_id))).flatMap((x:any)=>json<string[]>(x.destination_role_ids,[])).map(String))].filter((id:string)=>!held.has(id));
      const valid=new Set<string>((context.roles??[]).map((x:any)=>String(x.id)));
      for(const roleId of required){if(!valid.has(roleId)){failures.push(`${roleId}: missing role`);continue;}
        try{await discord(`/guilds/${guildId}/members/${uid}/roles/${roleId}`,{method:'PUT',body:''});addedRoles.push(roleId);}catch(e:any){failures.push(`${roleId}: ${String(e.message??e).slice(0,100)}`);}}
    }
    await sentinelRecord({source:'bom',category:'membership',action:'membership.prefix_audit.applied',actorId:userId(req),targetId:uid,metadata:{changedNickname,addedRoles,failures}});
    return {ok:failures.length===0,changedNickname,addedRoles,failures};
  });
  app.get('/v1/membership/prefixes',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;return knownPrefixes(guildId);});
  app.put('/v1/membership/prefixes/:roleId',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;const b=z.object({prefix:z.string().trim().min(3).max(14).regex(/^\[[^\[\]\n]{1,12}\]$/)}).parse(req.body??{}),roleId=String(req.params.roleId),before=await knownPrefixes(guildId);await db.query(`INSERT INTO guild_prefix_rules(guild_id,role_id,prefix,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT(guild_id,role_id) DO UPDATE SET prefix=EXCLUDED.prefix,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,[guildId,roleId,b.prefix,userId(req)]);const [members,ctx,rules]=await Promise.all([allMembers(guildId),discordContext(),knownPrefixes(guildId)]),positions=new Map<string,number>((ctx.roles??[]).map((r:any)=>[String(r.id),Number(r.position??0)])),stripRules=[...before,...rules];for(const m of members.filter((x:any)=>!x.user?.bot))await applyPrefixToMember(guildId,m,rules,positions,stripRules);await sentinelRecord({source:'bom',category:'membership',action:'guild_prefix.saved',actorId:userId(req),targetId:roleId,metadata:{prefix:b.prefix}});return {ok:true};});
  app.delete('/v1/membership/prefixes/:roleId',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;const before=await knownPrefixes(guildId);await db.query(`DELETE FROM guild_prefix_rules WHERE guild_id=$1 AND role_id=$2`,[guildId,String(req.params.roleId)]);const [members,ctx,rules]=await Promise.all([allMembers(guildId),discordContext(),knownPrefixes(guildId)]),positions=new Map<string,number>((ctx.roles??[]).map((r:any)=>[String(r.id),Number(r.position??0)])),stripRules=[...before,...rules];for(const m of members.filter((x:any)=>!x.user?.bot))await applyPrefixToMember(guildId,m,rules,positions,stripRules);await sentinelRecord({source:'bom',category:'membership',action:'guild_prefix.removed',actorId:userId(req),targetId:String(req.params.roleId)});return {ok:true};});

  app.get('/v1/membership/connections',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;return (await many<any>(`SELECT * FROM role_connections WHERE guild_id=$1`,[guildId])).map((x:any)=>({...x,destination_role_ids:json(x.destination_role_ids,[])}));});
  app.put('/v1/membership/connections/:sourceRoleId',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;const b=z.object({destinationRoleIds:z.array(z.string()).max(5)}).parse(req.body??{}),source=String(req.params.sourceRoleId),dest=[...new Set<string>((b.destinationRoleIds??[]) as string[])].filter(x=>x!==source);if(!dest.length){await db.query(`DELETE FROM role_connections WHERE guild_id=$1 AND source_role_id=$2`,[guildId,source]);await sentinelRecord({source:'bom',category:'membership',action:'role_connection.removed',actorId:userId(req),targetId:source});return {ok:true,removed:true};}await db.query(`INSERT INTO role_connections(guild_id,source_role_id,destination_role_ids,updated_by) VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(guild_id,source_role_id) DO UPDATE SET destination_role_ids=EXCLUDED.destination_role_ids,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,[guildId,source,JSON.stringify(dest),userId(req)]);const members=await allMembers(guildId);for(const m of members.filter((x:any)=>!x.user?.bot&&(x.roles??[]).includes(source)))for(const roleId of dest)if(!(m.roles??[]).includes(roleId))await discord(`/guilds/${guildId}/members/${m.user.id}/roles/${roleId}`,{method:'PUT',body:''}).catch(()=>{});await sentinelRecord({source:'bom',category:'membership',action:'role_connection.saved',actorId:userId(req),targetId:source,metadata:{destinationRoleIds:dest}});return {ok:true};});
  app.delete('/v1/membership/connections/:sourceRoleId',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;const source=String(req.params.sourceRoleId);await db.query(`DELETE FROM role_connections WHERE guild_id=$1 AND source_role_id=$2`,[guildId,source]);await sentinelRecord({source:'bom',category:'membership',action:'role_connection.removed',actorId:userId(req),targetId:source});return {ok:true};});

  app.post('/v1/membership/remind',async(req:any,reply:any)=>{if(!await rosterManager(userId(req),guildId))return reply.code(403).send({error:'roster_manager_required'});const b=z.object({userIds:z.array(z.string()).min(1).max(100)}).parse(req.body??{});let sent=0;for(const uid of b.userIds){await dm(uid,`Your Band of Misfits roster profile needs an update. Please review your captain name, rank and ships here:\n${dashboard}/dashboard/members`);await db.query(`UPDATE member_profiles SET last_reminded_at=NOW() WHERE guild_id=$1 AND user_id=$2`,[guildId,uid]);sent++;}await sentinelRecord({source:'bom',category:'membership',action:'member.profile.reminded',actorId:userId(req),metadata:{count:sent,userIds:b.userIds.slice(0,100)}});return {ok:true,sent};});

  // Admiralty-selected member check-ins. DM is initiated only by an explicit bulk action.
  app.get('/v1/membership/checkins',async(req:any,reply:any)=>{
    if(!await requireAdmin(req,reply))return;
    const [members,records,leaves,s,attempts]=await Promise.all([
      allMembers(guildId),
      many<any>(`SELECT DISTINCT ON (user_id) id,user_id,status,sent_at,responded_at,expected_return_at,error_message FROM membership_checkins WHERE guild_id=$1 ORDER BY user_id,sent_at DESC`,[guildId]),
      many<any>(`SELECT user_id,return_at FROM member_leaves WHERE guild_id=$1 AND status='AWAY'`,[guildId]),
      settings(guildId),
      many<any>(`SELECT DISTINCT ON (user_id) user_id,display_name,username,status,reason,attempted_at,batch_id FROM membership_checkin_delivery_attempts WHERE guild_id=$1 ORDER BY user_id,attempted_at DESC,id DESC`,[guildId])
    ]);
    const last=new Map<string,any>(records.map((r:any)=>[String(r.user_id),r]));
    const away=new Map<string,any>(leaves.map((r:any)=>[String(r.user_id),r]));
    const lastAttempt=new Map<string,any>(attempts.map((r:any)=>[String(r.user_id),r]));
    const currentIds=new Set<string>(members.map((m:any)=>String(m.user?.id??'')));
    const departedIds=[...new Set<string>([...lastAttempt.keys(),...last.keys()])].filter(id=>!currentIds.has(id));
    const departed=departedIds.map(id=>{const attempt=lastAttempt.get(id),checkin=last.get(id);return {userId:id,displayName:String(attempt?.display_name??id),username:String(attempt?.username??''),avatarUrl:null,roles:[],roleReview:null,notInGuild:true,lastAttempt:attempt??{status:'NOT_FOUND',reason:'Member has left this Discord server.'},checkin:checkin??null,leave:away.get(id)??null};});
    return {configured:Boolean(s.leave_enabled&&((s.member_role_id&&s.afk_role_id)||(s.bom2_member_role_id&&s.bom2_afk_role_id))),settings:{leaveEnabled:Boolean(s.leave_enabled),memberRoleId:s.member_role_id,afkRoleId:s.afk_role_id,bom2MemberRoleId:s.bom2_member_role_id,bom2AfkRoleId:s.bom2_afk_role_id,leaveMemberRoleIds:json(s.leave_member_role_ids,[])},members:members.filter((m:any)=>m.user&&!m.user.bot).map((m:any)=>({userId:String(m.user.id),displayName:String(m.nick??m.user.global_name??m.user.username??'Member'),username:String(m.user.username??''),avatarUrl:userAvatar(m.user),roles:m.roles??[],roleReview:(()=>{const roles=new Set<string>((m.roles??[]).map(String));const bom=Boolean(s.member_role_id&&roles.has(String(s.member_role_id))),second=Boolean(s.bom2_member_role_id&&roles.has(String(s.bom2_member_role_id)));return bom&&second?'BOTH':!bom&&!second?'NEITHER':null;})(),lastAttempt:lastAttempt.get(String(m.user.id))??null,checkin:last.get(String(m.user.id))??null,leave:away.get(String(m.user.id))??null})).concat(departed),history:await many<any>(`SELECT id,user_id,sent_by,status,sent_at,responded_at,expected_return_at,error_message FROM membership_checkins WHERE guild_id=$1 ORDER BY sent_at DESC LIMIT 250`,[guildId]),attempts:await many<any>(`SELECT id,user_id,batch_id,display_name,username,status,reason,attempted_at FROM membership_checkin_delivery_attempts WHERE guild_id=$1 ORDER BY attempted_at DESC LIMIT 5000`,[guildId])};
  });
  // Officer-only, explicitly-confirmed fix for members with both/neither guild membership role.
  app.post('/v1/membership/checkins/:userId/resolve-role',async(req:any,reply:any)=>{
    if(!await requireAdmin(req,reply))return;
    const uid=String(req.params.userId);
    if(!/^\d{15,22}$/.test(uid))return reply.code(400).send({error:'invalid_user_id'});
    const b=z.object({guild:z.enum(['BOM','BOM2']),confirm:z.literal(true)}).parse(req.body??{});
    const s=await settings(guildId);const target=String(b.guild==='BOM'?s.member_role_id??'':s.bom2_member_role_id??'');
    const other=String(b.guild==='BOM'?s.bom2_member_role_id??'':s.member_role_id??'');
    if(!target||!other||target===other)return reply.code(409).send({error:'Configure two distinct membership roles before resolving conflicts.'});
    const [member,roles]=await Promise.all([discord(`/guilds/${guildId}/members/${uid}`),discord(`/guilds/${guildId}/roles`)]);
    if(!member||member.user?.bot)return reply.code(409).send({error:'Member not found or is a bot.'});
    const activeLeave=await oneOrNone<any>(`SELECT id FROM member_leaves WHERE guild_id=$1 AND user_id=$2 AND status='AWAY' LIMIT 1`,[guildId,uid]);
    if(activeLeave)return reply.code(409).send({error:'Member is currently on leave. Use the return-from-leave workflow instead of assigning an active Member role.'});
    const held=new Set<string>((member.roles??[]).map(String));
    if(held.has(target)&&!held.has(other))return reply.code(409).send({error:'Member already has exactly one configured membership role. No change needed.'});
    const roleById=new Map<string,any>(roles.map((r:any)=>[String(r.id),r]));
    for(const id of [target,...(held.has(other)?[other]:[])]){
      if(!roleById.has(id))return reply.code(409).send({error:`Configured role ${id} does not exist.`});
      if(roleById.get(id)?.managed)return reply.code(409).send({error:`Role ${id} is managed by another integration.`});
    }
    // Use scoped role operations: never replace the member's complete Discord role set.
    const added=!held.has(target),removed=held.has(other);
    try{
      if(added)await discord(`/guilds/${guildId}/members/${uid}/roles/${target}`,{method:'PUT',body:''});
      if(removed)await discord(`/guilds/${guildId}/members/${uid}/roles/${other}`,{method:'DELETE'});
    }catch(e:any){
      // Avoid leaving two membership roles if the second operation failed.
      let rollbackError:string|null=null;
      if(added)try{await discord(`/guilds/${guildId}/members/${uid}/roles/${target}`,{method:'DELETE'});}catch(err:any){rollbackError=String(err?.message??err);}
      await sentinelRecord({source:'bom',category:'membership',action:'checkin.role_review.failed',actorId:userId(req),targetId:uid,metadata:{chosenGuild:b.guild,error:String(e?.message??e),rollbackError}}).catch(()=>{});
      return reply.code(502).send({error:'Discord role update failed.',message:`${String(e?.message??e)}${rollbackError?` Rollback also failed: ${rollbackError}`:''}`});
    }
    const refreshed=await discord(`/guilds/${guildId}/members/${uid}`);
    const current=new Set<string>((refreshed.roles??[]).map(String));
    if(!current.has(target)||current.has(other))return reply.code(502).send({error:'Discord role update could not be verified. Review this member manually before resending.'});
    await sentinelRecord({source:'bom',category:'membership',action:'checkin.role_review.resolved',actorId:userId(req),targetId:uid,metadata:{chosenGuild:b.guild,addedRoleId:added?target:null,removedRoleId:removed?other:null,previousRoles:[...held]}}).catch(()=>{});
    return {ok:true,userId:uid,chosenGuild:b.guild,roleIds:[...current]};
  });
  app.post('/v1/membership/checkins/send',async(req:any,reply:any)=>{
    if(!await requireAdmin(req,reply))return;
    const b=z.object({userIds:z.array(z.string().regex(/^\d{15,22}$/)).min(1).max(25)}).parse(req.body??{});
    const s=await settings(guildId);
    if(!s.leave_enabled||!((s.member_role_id&&s.afk_role_id)||(s.bom2_member_role_id&&s.bom2_afk_role_id)))return reply.code(409).send({error:'Configure Leave and at least one complete BOM/BoM 2 membership-to-AFK role mapping before sending check-ins.'});
    if([s.member_role_id,s.afk_role_id,s.bom2_member_role_id,s.bom2_afk_role_id].filter(Boolean).length!==new Set([s.member_role_id,s.afk_role_id,s.bom2_member_role_id,s.bom2_afk_role_id].filter(Boolean)).size)return reply.code(409).send({error:'Conflicting membership and AFK role IDs. Fix configuration before sending check-ins.'});
    const members=await allMembers(guildId);const eligible=new Map(members.filter((m:any)=>m.user&&!m.user.bot).map((m:any)=>[String(m.user.id),m]));
    const unique=[...new Set<string>(b.userIds.map(String))];const results:any[]=[];const batchId=randomUUID();
    const named=(uid:string)=>{const m=eligible.get(uid);return {userId:uid,displayName:String(m?.nick??m?.user?.global_name??m?.user?.username??uid),username:String(m?.user?.username??'')};};
    for(const uid of unique){
      if(!eligible.has(uid)){results.push({...named(uid),status:'NOT_FOUND',reason:'Member no longer exists in this Discord server.'});continue;}
      const roles=new Set<string>((eligible.get(uid)?.roles??[]).map(String));
      const bom=Boolean(s.member_role_id&&roles.has(String(s.member_role_id)));
      const second=Boolean(s.bom2_member_role_id&&roles.has(String(s.bom2_member_role_id)));
      if((bom&&second)||(!bom&&!second)){results.push({...named(uid),status:'ROLE_REVIEW_REQUIRED',reason:bom&&second?'Both BOM and BoM 2 membership roles are assigned.':'Neither configured BOM nor BoM 2 membership role is assigned.',roleState:bom&&second?'BOTH':'NEITHER'});continue;}
      if((bom&&!s.afk_role_id)||(second&&!s.bom2_afk_role_id)){results.push({...named(uid),status:'AFK_ROLE_NOT_CONFIGURED',reason:`${bom?'BOM':'BoM 2'} AFK role is not configured.`});continue;}
      if(await discordDmsMuted(uid)){results.push({...named(uid),status:'DM_MUTED',reason:'Member has temporarily muted bot DMs.'});continue;}
      const id=randomUUID();
      const inserted=await db.query(`INSERT INTO membership_checkins(id,guild_id,user_id,sent_by) VALUES($1,$2,$3,$4) ON CONFLICT(guild_id,user_id) WHERE status='PENDING' DO NOTHING RETURNING id`,[id,guildId,uid,userId(req)]);
      if(!inserted.rowCount){results.push({...named(uid),status:'ALREADY_PENDING',reason:'A previous check-in is awaiting a response.'});continue;}
      try{
        const {channel,message}=await sendApiDm(discord,uid,{
          embeds:[{title:'BOM Crew Check-In',color:0xD9AA3C,description:'Ahoy! Admiralty is checking whether you plan to keep sailing with Band of Misfits. Please choose below. If you need time away, you can provide your expected return in everyday language. There is no automatic removal for choosing “No Longer Playing”. **If you plan to be AFK for an extended period, apply in-game to the BoM 2nd guild.**',footer:{text:'BOM Membership · Reply only when ready'}}],
          components:[{type:1,components:[
            {type:2,style:3,label:'Still Playing',custom_id:`membership:checkin:continue:${id}`},
            {type:2,style:1,label:'Take Leave',custom_id:`membership:checkin:away:${id}`},
            {type:2,style:2,label:'No Longer Playing',custom_id:`membership:checkin:stopping:${id}`}
          ]}],allowed_mentions:{parse:[]}
        });
        await db.query(`UPDATE membership_checkins SET dm_channel_id=$2,dm_message_id=$3,updated_at=NOW() WHERE id=$1`,[id,String(channel.id),String(message.id)]);
        results.push({...named(uid),status:'SENT'});
      }catch(e:any){const reason=String(e?.message??'Discord DM failed').slice(0,250);await db.query(`UPDATE membership_checkins SET status='DM_FAILED',error_message=$2,updated_at=NOW() WHERE id=$1`,[id,reason]);results.push({...named(uid),status:'DM_FAILED',reason});}
    }
    await db.query(`INSERT INTO membership_checkin_delivery_attempts(id,guild_id,user_id,batch_id,requested_by,display_name,username,status,reason) SELECT r.id::uuid,$1,r.user_id,$2,$3,r.display_name,r.username,r.status,r.reason FROM jsonb_to_recordset($4::jsonb) AS r(id text,user_id text,display_name text,username text,status text,reason text)`,[guildId,batchId,userId(req),JSON.stringify(results.map(r=>({id:randomUUID(),user_id:r.userId,display_name:r.displayName,username:r.username,status:r.status,reason:r.reason??null})))]);
    await sentinelRecord({source:'bom',category:'membership',action:'checkin.sent',actorId:userId(req),metadata:{results:results.map(x=>({userId:x.userId,status:x.status}))}}).catch(()=>{});
    return {batchId,results,sent:results.filter(r=>r.status==='SENT').length,failed:results.filter(r=>r.status==='DM_FAILED').length,pending:results.filter(r=>r.status==='ALREADY_PENDING').length};
  });
  app.post('/v1/membership/checkins/:id/cancel',async(req:any,reply:any)=>{
    if(!await requireAdmin(req,reply))return;
    const row=await db.query(`UPDATE membership_checkins SET status='CANCELLED',responded_at=NOW(),updated_at=NOW() WHERE guild_id=$1 AND id=$2 AND status='PENDING' RETURNING user_id`,[guildId,String(req.params.id)]);
    if(!row.rowCount)return reply.code(409).send({error:'Check-in already answered or unavailable.'});
    await sentinelRecord({source:'bom',category:'membership',action:'checkin.cancelled',actorId:userId(req),targetId:row.rows[0].user_id}).catch(()=>{});
    return {ok:true};
  });

}
