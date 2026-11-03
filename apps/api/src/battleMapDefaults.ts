import {readFile} from 'node:fs/promises';
import {db} from '@bom/db';
const root=new URL('../../../',import.meta.url);
let ready:Promise<void>|null=null;
/** Apply the supplied snapshot once; later edits and restarts never reset it. */
export async function ensureBattleMapDefaults(guildId:string){
 if(!ready)ready=(async()=>{
  for(const name of ['041_territory_management.sql','043_territory_multiple_taxes.sql'])await db.query(await readFile(new URL('packages/db/migrations/'+name,root),'utf8'));
  await db.query('INSERT INTO wosb_territory_settings(guild_id) VALUES($1) ON CONFLICT(guild_id) DO NOTHING',[guildId]);
  await db.query(await readFile(new URL('packages/db/migrations/108_battle_map_defaults.sql',root),'utf8'));
 })().catch(e=>{ready=null;throw e;});
 await ready;
}
