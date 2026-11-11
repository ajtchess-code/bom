import {db,many} from '@bom/db';
/** Restore the snapshots captured before the retired layout, once per channel.
 * Keep a snapshot of the deployed permissions as well, so both states survive.
 */
export async function restoreChannelPermissions(client:any,guildId:string){
 const guild=await client.guilds.fetch(guildId);
 const backups=await many<any>(`SELECT DISTINCT ON(channel_id) * FROM channel_layout_backups WHERE guild_id=$1 ORDER BY channel_id,created_at ASC`,[guildId]);
 const channels=[],failures:string[]=[];
 await guild.roles.fetch();
 for(const backup of backups){const channel=await guild.channels.fetch(backup.channel_id).catch((error:any)=>{if(error.code===10003)return null;throw error;});if(channel&&'permissionOverwrites' in channel)channels.push({backup,channel});}
 // Restore categories first, then their children, preserving each saved state.
 channels.sort((a,b)=>Number(b.channel.type===4)-Number(a.channel.type===4));
 for(const {backup,channel} of channels){
  const current=channel.permissionOverwrites.cache.map((o:any)=>({id:o.id,type:o.type,allow:o.allow.bitfield.toString(),deny:o.deny.bitfield.toString()}));
  await db.query(`INSERT INTO channel_layout_restores(guild_id,channel_id,layout_key,before_restore) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING`,[guildId,channel.id,backup.layout_key,JSON.stringify(current)]);
  const saved=await db.query(`SELECT status FROM channel_layout_restores WHERE guild_id=$1 AND channel_id=$2`,[guildId,channel.id]);if(saved.rows[0]?.status==='RESTORED')continue;
  const overwrites=typeof backup.overwrites==='string'?JSON.parse(backup.overwrites):backup.overwrites;
  // Skip roles deleted since the snapshot (Discord would reject the whole set), and
  // keep going if one channel fails so the rest are still restored.
  const usable=overwrites.filter((o:any)=>Number(o.type)!==0||guild.roles.cache.has(String(o.id)));
  try{
   await channel.permissionOverwrites.set(usable.map((o:any)=>({...o,allow:BigInt(o.allow),deny:BigInt(o.deny)})),'Restore permissions from before retired BOM layout');
   await db.query(`UPDATE channel_layout_restores SET status='RESTORED',restored_at=now() WHERE guild_id=$1 AND channel_id=$2`,[guildId,channel.id]);
  }catch(error:any){failures.push(`${channel.name??channel.id}: ${error?.message??error}`);}
 }
 if(failures.length)console.error(`[permissions] ${failures.length} channel(s) could not be restored; will retry next restart:`,failures);
}
