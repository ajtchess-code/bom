import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {db,oneOrNone} from '@bom/db';

/**
 * The main controller's seasonal persona. Change this block (and its artwork
 * folder) for the next season; music workers keep their own branding.
 */
export const MISFIT_PERSONA={
 name:'Thankful Misfit',
 /** Older persona names: an existing role with one of these names is renamed rather than duplicated. */
 previousNames:['Evil Misfit'],
 season:'Thanksgiving',
 assetDir:'branding/thanksgiving',
 avatar:'thankful-misfit-avatar.png',
 banner:'thankful-misfit-banner.png',
 roleIcon:'thankful-misfit-role-icon.png',
 roleColor:0xd9741f,
 /** Server icon: animated when the server's boost level allows it, otherwise the still logo. */
 serverIconAnimated:'server-icon.gif',
 serverIcon:'server-icon.png',
};

const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
function assets(){
 const rel=join('assets',MISFIT_PERSONA.assetDir),candidates=[resolve(process.cwd(),'apps/controller',rel),resolve(process.cwd(),rel),resolve(process.cwd(),'../../apps/controller',rel)];
 return candidates.find(p=>existsSync(join(p,MISFIT_PERSONA.avatar)))??candidates[0];
}

export async function applyMisfitBranding(client:any,guildId:string){
 const P=MISFIT_PERSONA,dir=assets(),reason=`${P.season} bot persona`;
 const warn=(part:string,e:any)=>console.warn(`[misfit-branding] ${part} deferred:`,e.message??e);
 if(client.user.username!==P.name)await client.user.setUsername(P.name).catch((e:any)=>warn('Username',e));
 const guild=await client.guilds.fetch(guildId),me=await guild.members.fetchMe();
 if(me.nickname!==P.name)await me.setNickname(P.name,reason).catch((e:any)=>warn('Nickname',e));
 const state=await oneOrNone<any>('SELECT * FROM bot_branding_state WHERE guild_id=$1',[guildId]);
 try{const avatar=await readFile(join(dir,P.avatar)),hash=digest(avatar);if(state?.avatar_sha!==hash||!client.user.avatar){await client.user.setAvatar(avatar);await db.query('INSERT INTO bot_branding_state(guild_id,avatar_sha) VALUES($1,$2) ON CONFLICT(guild_id) DO UPDATE SET avatar_sha=$2',[guildId,hash]);}}catch(e){warn('Avatar',e);}
 try{const banner=await readFile(join(dir,P.banner)),hash=digest(banner);if(state?.banner_sha!==hash||!client.user.banner){await client.user.setBanner(banner);await db.query('UPDATE bot_branding_state SET banner_sha=$2 WHERE guild_id=$1',[guildId,hash]);}}catch(e){warn('Banner',e);}
 // Server picture. Needs the bot's Manage Server permission.
 try{
  const animated=guild.features.includes('ANIMATED_ICON'),icon=await readFile(join(dir,animated?P.serverIconAnimated:P.serverIcon)),hash=digest(icon);
  if(state?.guild_icon_sha!==hash){await guild.setIcon(icon,`${P.season} server picture`);await db.query('UPDATE bot_branding_state SET guild_icon_sha=$2 WHERE guild_id=$1',[guildId,hash]);console.info(`[misfit-branding] Server picture set to the ${P.season} ${animated?'animated':'still'} logo.`);}
 }catch(e){warn('Server picture',e);}
 try{
  await guild.roles.fetch();
  const names=[P.name,...P.previousNames];
  let role=process.env.MISFIT_ROLE_ID?guild.roles.cache.get(process.env.MISFIT_ROLE_ID):guild.roles.cache.find((r:any)=>!r.managed&&names.includes(r.name));
  if(!role)role=await guild.roles.create({name:P.name,color:P.roleColor,permissions:[],reason});
  else if(role.name!==P.name||role.color!==P.roleColor)await role.edit({name:P.name,color:P.roleColor,reason});
  if(!me.roles.cache.has(role.id))await me.roles.add(role.id,reason);
  if(guild.features.includes('ROLE_ICONS')){const icon=await readFile(join(dir,P.roleIcon)),hash=digest(icon);if(state?.role_icon_sha!==hash||!role.icon){await role.edit({icon,reason});await db.query('UPDATE bot_branding_state SET role_icon_sha=$2 WHERE guild_id=$1',[guildId,hash]);}}
  else console.info('[misfit-branding] Server role icons are unavailable; the role icon is ready for when they are.');
 }catch(e){warn('Role',e);}
}
