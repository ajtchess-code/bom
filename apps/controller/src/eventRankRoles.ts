import {pool} from '@bom/db';
/** Retire only the role IDs created and tracked by the event rank system. */
export async function processEventRankRoles(client:any,guildId:string){
 const tx=await pool.connect();let locked=false;
 try{
  locked=Boolean((await tx.query('SELECT pg_try_advisory_lock(hashtext($1)) locked',[guildId+':event-rank-roles'])).rows[0].locked);if(!locked)return;
  await tx.query("UPDATE guild_event_rank_settings SET enabled=false,updated_at=now() WHERE guild_id=$1",[guildId]);
  const rows=(await tx.query('SELECT role_id FROM guild_event_rank_roles WHERE guild_id=$1',[guildId])).rows;
  const guild=await client.guilds.fetch(guildId);await guild.roles.fetch();
  for(const row of rows){const role=guild.roles.cache.get(row.role_id);if(role){if(role.managed||role.permissions.bitfield!==0n||!role.editable)throw Error(`Cannot safely delete event rank role ${row.role_id}`);await role.delete('Retire Halloween ranking roles');}await tx.query('DELETE FROM guild_event_rank_roles WHERE guild_id=$1 AND role_id=$2',[guildId,row.role_id]);}
 }catch(e:any){console.warn('[event] rank-role retirement delayed',e.message);}finally{if(locked)await tx.query('SELECT pg_advisory_unlock(hashtext($1))',[guildId+':event-rank-roles']).catch(()=>{});tx.release();}
}
