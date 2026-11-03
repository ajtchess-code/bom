import {discordRequest} from '@bom/redis';
import { many } from "@bom/db";
import type { MusicPermission } from "@bom/shared";

const botToken=process.env.DISCORD_BOT_TOKEN;
const guildId=process.env.DISCORD_GUILD_ID;
const dashboardAdminRoleId=(process.env.DASHBOARD_ADMIN_ROLE_ID??"").trim();
if(!botToken)throw new Error("DISCORD_BOT_TOKEN is required by API authorization");
if(!guildId)throw new Error("DISCORD_GUILD_ID is required for single-guild mode");
const headers={Authorization:`Bot ${botToken}`};
const ADMINISTRATOR=8n, MANAGE_GUILD=32n;

const accessCacheMs=Math.max(15_000,Number(process.env.DISCORD_ACCESS_CACHE_MS??120_000));
const memberCacheMs=Math.max(15_000,Number(process.env.DISCORD_MEMBER_CACHE_MS??120_000));
const guildRoleCacheMs=Math.max(30_000,Number(process.env.DISCORD_GUILD_ROLE_CACHE_MS??300_000));
const contextCacheMs=Math.max(10_000,Number(process.env.DISCORD_CONTEXT_CACHE_MS??60_000));
const staleGraceMs=Math.max(60_000,Number(process.env.DISCORD_AUTH_STALE_GRACE_MS??900_000));

const accessCache=new Map<string,{expires:number,staleUntil:number,value:any}>();
const memberCache=new Map<string,{expires:number,staleUntil:number,value:Member|null}>();
const accessInflight=new Map<string,Promise<any>>();
const memberInflight=new Map<string,Promise<Member|null>>();
let guildRoleCache:{expires:number;staleUntil:number;guild:any;roles:Role[]}|null=null;
let guildRoleInflight:Promise<{expires:number;staleUntil:number;guild:any;roles:Role[]}>|null=null;
let contextCache:{expires:number,staleUntil:number,value:any}|null=null;
let contextInflight:Promise<any>|null=null;

type Member={roles:string[];nick?:string|null;avatar?:string|null;joined_at?:string;user?:{id:string;username?:string;global_name?:string|null;avatar?:string|null}};
type Role={id:string;permissions:string;position?:number;name?:string;color?:number};

export function configuredGuildId(){return guildId!;}
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

async function discordJson(url:string){
  let r=await discordRequest(url,{headers});
  if(r.status===429){
    let retryMs=750;
    try{const body:any=await r.json();retryMs=Math.max(250,Math.min(2500,Math.ceil(Number(body?.retry_after??0.75)*1000)));}catch{}
    await sleep(retryMs);
    r=await discordRequest(url,{headers});
  }
  if(!r.ok){const err:any=new Error(`Discord authorization lookup failed (${r.status})`);err.status=r.status;throw err;}
  return r.json();
}

async function guildAndRoles(force=false){
  if(force)guildRoleCache=null;
  const now=Date.now();if(guildRoleCache&&guildRoleCache.expires>now)return guildRoleCache;if(guildRoleInflight)return guildRoleInflight;
  guildRoleInflight=(async()=>{try{
    const [guild,roles]=await Promise.all([
      discordJson(`https://discord.com/api/v10/guilds/${guildId}`),
      discordJson(`https://discord.com/api/v10/guilds/${guildId}/roles`) as Promise<Role[]>
    ]);
    const value={expires:Date.now()+guildRoleCacheMs,staleUntil:Date.now()+guildRoleCacheMs+staleGraceMs,guild,roles};guildRoleCache=value;return value;
  }catch(err){if(guildRoleCache&&guildRoleCache.staleUntil>Date.now()){console.warn('[authz] Discord guild/role lookup failed; using stale authorization cache',err);guildRoleCache.expires=Date.now()+30_000;return guildRoleCache;}throw err;}finally{guildRoleInflight=null;}})();
  return guildRoleInflight;
}

async function guildMember(userId:string){
  const now=Date.now(),cached=memberCache.get(userId);if(cached&&cached.expires>now)return cached.value;const pending=memberInflight.get(userId);if(pending)return pending;
  const promise=(async()=>{try{
    let r=await discordRequest(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`,{headers});
    if(r.status===429){let retryMs=750;try{const body:any=await r.json();retryMs=Math.max(250,Math.min(2500,Math.ceil(Number(body?.retry_after??0.75)*1000)));}catch{}await sleep(retryMs);r=await discordRequest(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`,{headers});}
    if(r.status===404){memberCache.set(userId,{expires:Date.now()+30_000,staleUntil:Date.now()+60_000,value:null});return null;}
    if(!r.ok)throw Object.assign(new Error(`Discord member authorization lookup failed (${r.status})`),{status:r.status});
    const value=await r.json() as Member;memberCache.set(userId,{expires:Date.now()+memberCacheMs,staleUntil:Date.now()+memberCacheMs+staleGraceMs,value});return value;
  }catch(err){if(cached&&cached.staleUntil>Date.now()){console.warn(`[authz] Discord member lookup failed for ${userId}; using stale authorization cache`,err);cached.expires=Date.now()+30_000;return cached.value;}throw err;}finally{memberInflight.delete(userId);}})();
  memberInflight.set(userId,promise);return promise;
}

export async function discordAccess(userId:string){
  const now=Date.now(),cached=accessCache.get(userId);if(cached&&cached.expires>now)return cached.value;const pending=accessInflight.get(userId);if(pending)return pending;
  const promise=(async()=>{try{
    const [{guild,roles},member]=await Promise.all([guildAndRoles(),guildMember(userId)]);
    if(!member){const value={member:false,owner:false,manageGuild:false,roles:[] as string[],guild:null};accessCache.set(userId,{expires:Date.now()+30_000,staleUntil:Date.now()+60_000,value});return value;}
    const roleSet=new Set(member.roles);roleSet.add(guildId!);let bits=0n;for(const role of roles)if(roleSet.has(role.id))bits|=BigInt(role.permissions);
    const owner=guild.owner_id===userId;const value={member:true,owner,manageGuild:owner||Boolean(bits&ADMINISTRATOR)||Boolean(bits&MANAGE_GUILD),roles:[...roleSet],guild:{id:guild.id,name:guild.name,icon:guild.icon,ownerId:guild.owner_id,premiumTier:guild.premium_tier??0}};
    accessCache.set(userId,{expires:Date.now()+accessCacheMs,staleUntil:Date.now()+accessCacheMs+staleGraceMs,value});return value;
  }catch(err){if(cached&&cached.staleUntil>Date.now()){console.warn(`[authz] Discord access refresh failed for ${userId}; using stale access`,err);cached.expires=Date.now()+30_000;return cached.value;}throw err;}finally{accessInflight.delete(userId);}})();
  accessInflight.set(userId,promise);return promise;
}


export async function discordMemberProfile(userId:string){
  const member=await guildMember(userId);
  if(!member)return null;
  const user=member.user??{id:userId};
  return {
    id:String(user.id??userId),
    username:String(user.username??""),
    globalName:user.global_name??null,
    nick:member.nick??null,
    avatar:member.avatar??null,
    userAvatar:user.avatar??null,
    roles:(member.roles??[]).map(String),
    joinedAt:member.joined_at??null
  };
}

export async function hasDashboardAdminAccess(userId:string){
  const access=await discordAccess(userId);
  if(!access.member)return false;
  if(access.manageGuild)return true;
  return Boolean(dashboardAdminRoleId&&access.roles.includes(dashboardAdminRoleId));
}

export function dashboardAdminRole(){return dashboardAdminRoleId||null;}

export async function hasMusicPermission(userId:string,permission:MusicPermission){
  const access=await discordAccess(userId);if(!access.member)return false;if(access.manageGuild)return true;
  const rows=await many<{role_id:string;permission:string;allowed:boolean}>(`SELECT role_id,permission,allowed FROM music_permission_rules WHERE guild_id=$1 AND permission=$2`,[guildId,permission]);
  let allowed=permission==="USE_MUSIC"&&rows.length===0;
  for(const rule of rows)if(access.roles.includes(String(rule.role_id))){if(!rule.allowed)return false;allowed=true;}
  return allowed;
}

export async function discordContext(force=false){
  if(force)contextCache=null;
  const now=Date.now();if(contextCache&&contextCache.expires>now)return contextCache.value;if(contextInflight)return contextInflight;
  contextInflight=(async()=>{try{
    const [channels,gr]=await Promise.all([
      discordJson(`https://discord.com/api/v10/guilds/${guildId}/channels`) as Promise<any[]>,
      guildAndRoles(force)
    ]);
    const roles:any[]=gr.roles;
    const bot:any=await discordJson('https://discord.com/api/v10/users/@me');
    const botMember=await guildMember(String(bot.id)),botRoles=roles.filter(r=>r.id===guildId||botMember?.roles.includes(r.id));
    let botBits=0n;for(const role of botRoles)botBits|=BigInt(role.permissions??0);
    const value={
      botRolePosition:Math.max(0,...botRoles.map(r=>Number(r.position??0))),
      botCanManageRoles:Boolean(botBits&8n)||Boolean(botBits&268435456n),
      guildId,
      textChannels:channels.filter(c=>c.type===0||c.type===5).map(c=>({id:c.id,name:c.name,parentId:c.parent_id??null,type:c.type})),
      categories:channels.filter(c=>c.type===4).map(c=>({id:c.id,name:c.name,position:c.position??0})).sort((a,b)=>a.position-b.position),
      voiceChannels:channels.filter(c=>c.type===2||c.type===13).map(c=>({id:c.id,name:c.name,parentId:c.parent_id??null,type:c.type,bitrate:c.bitrate??null,userLimit:c.user_limit??0})),
      roles:roles.filter(r=>r.id!==guildId).sort((a,b)=>Number(b.position??0)-Number(a.position??0)).map(r=>({id:r.id,name:r.name,color:r.color,position:r.position}))
    };
    contextCache={expires:Date.now()+contextCacheMs,staleUntil:Date.now()+contextCacheMs+staleGraceMs,value};return value;
  }catch(err){if(contextCache&&contextCache.staleUntil>Date.now()){console.warn('[authz] Discord context lookup failed; using stale context cache',err);contextCache.expires=Date.now()+30_000;return contextCache.value;}throw err;}finally{contextInflight=null;}})();
  return contextInflight;
}
