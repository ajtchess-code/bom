import {discordDmsMuted,oneOrNone} from '@bom/db';

const guildId=process.env.DISCORD_GUILD_ID??'';
function json(v:any,fallback:any){try{return typeof v==='string'?JSON.parse(v):v??fallback}catch{return fallback}}

/** Central notification preference gate used by controller-owned delivery paths. */
export async function canDiscordDm(userId:string,category:string){
  if(await discordDmsMuted(userId))return false;
  const row=await oneOrNone<any>(`SELECT discord_dm_enabled,categories FROM dashboard_notification_preferences WHERE guild_id=$1 AND user_id=$2`,[guildId,String(userId)]).catch(()=>null);
  if(!row)return true; // preserve existing behavior until a member chooses preferences
  if(row.discord_dm_enabled===false)return false;
  const categories=json(row.categories,{});
  return categories?.[category]!==false;
}
