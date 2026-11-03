import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {db,oneOrNone} from '@bom/db';
const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
function assets(){const candidates=[resolve(process.cwd(),'apps/dashboard/public/event-guide/branding'),resolve(process.cwd(),'../dashboard/public/event-guide/branding'),resolve(process.cwd(),'../../apps/dashboard/public/event-guide/branding')];return candidates.find(p=>existsSync(join(p,'evil-misfit-avatar.png')))??candidates[0];}
/** Only the main controller becomes Evil Misfit; music workers keep their branding. */
export async function applyMisfitBranding(client:any,guildId:string){
 const warn=(part:string,e:any)=>console.warn(`[evil-misfit] ${part} deferred:`,e.message??e);
 if(client.user.username!=='Evil Misfit')await client.user.setUsername('Evil Misfit').catch((e:any)=>warn('Username',e));
 const guild=await client.guilds.fetch(guildId),me=await guild.members.fetchMe();if(me.nickname!=='Evil Misfit')await me.setNickname('Evil Misfit','Halloween bot persona').catch((e:any)=>warn('Nickname',e));
 const state=await oneOrNone<any>('SELECT * FROM bot_branding_state WHERE guild_id=$1',[guildId]);let avatar:Buffer;
 try{avatar=await readFile(join(assets(),'evil-misfit-avatar.png'));const hash=digest(avatar);if(state?.avatar_sha!==hash||!client.user.avatar){await client.user.setAvatar(avatar);await db.query('INSERT INTO bot_branding_state(guild_id,avatar_sha) VALUES($1,$2) ON CONFLICT(guild_id) DO UPDATE SET avatar_sha=$2',[guildId,hash]);}}catch(e){warn('Avatar',e);}
 try{const banner=await readFile(join(assets(),'evil-misfit-banner.png')),hash=digest(banner);if(state?.banner_sha!==hash||!client.user.banner){await client.user.setBanner(banner);await db.query('UPDATE bot_branding_state SET banner_sha=$2 WHERE guild_id=$1',[guildId,hash]);}}catch(e){warn('Banner',e);}
 try{await guild.roles.fetch();let role=process.env.MISFIT_ROLE_ID?guild.roles.cache.get(process.env.MISFIT_ROLE_ID):guild.roles.cache.find((r:any)=>!r.managed&&r.name==='Evil Misfit');if(!role){role=await guild.roles.create({name:'Evil Misfit',color:0xa35bce,permissions:[],reason:'Halloween bot role'});}if(!me.roles.cache.has(role.id))await me.roles.add(role.id,'Halloween bot role');if(guild.features.includes('ROLE_ICONS')){const icon=await readFile(join(assets(),'evil-misfit-role-icon.png')),hash=digest(icon);if(state?.role_icon_sha!==hash||!role.icon){await role.edit({icon,reason:'Halloween bot role icon'});await db.query('UPDATE bot_branding_state SET role_icon_sha=$2 WHERE guild_id=$1',[guildId,hash]);}}else console.info('[evil-misfit] Server role icons are unavailable; the supplied icon remains ready for use.');}catch(e){warn('Role icon',e);}
}
