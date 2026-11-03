import {randomUUID} from 'node:crypto';
import {db,many} from '@bom/db';
/** Queue only Clash notices. Existing dispatcher applies module and DM preferences. */
export async function queueClashToolReminders(guildId:string,now=Date.now()){
 const documents=await many<any>("SELECT * FROM clash_tool_documents WHERE guild_id=$1 AND kind IN('PRACTICE','CLAN_GAMES','TRANSFER') AND visibility<>'PRIVATE'",[guildId]);
 for(const doc of documents){const p=doc.payload??{},when=Date.parse(doc.kind==='PRACTICE'?p.startsAt:doc.kind==='CLAN_GAMES'?p.endsAt:p.when);if(!Number.isFinite(when)||when<now||when>now+3600000||['COMPLETE','CANCELLED','IN_GAME_COMPLETE'].includes(p.status))continue;
  const members=await many<any>('SELECT DISTINCT user_id FROM clash_tool_enrollments WHERE document_id=$1'+(doc.kind==='CLAN_GAMES'?' AND progress<$2':''),doc.kind==='CLAN_GAMES'?[doc.id,p.memberTarget]:[doc.id]);const recipients=new Set<string>(members.map(m=>m.user_id));recipients.add(doc.owner_id);
  for(const uid of recipients)await notice(uid,`tool:${doc.id}:${when}`,doc.title,`${doc.kind==='CLAN_GAMES'?'Contribution deadline':'Planned start'}: ${new Date(when).toISOString()}. Check the Clash workshop for details.`);
 }
 const imports=await many<any>('SELECT * FROM clash_village_imports WHERE guild_id=$1',[guildId]);
 for(const village of imports){const v=village.normalized;for(const e of v.entries??[]){if(!e.timerSeconds)continue;const finish=Date.parse(v.exportedAt)+e.timerSeconds*1000;if(finish<now||finish>now+3600000)continue;await notice(village.owner_id,`import:${village.account_id}:${e.key}:${finish}`,'Estimated upgrade completion',`${village.account_id}: ${e.name} imported timer estimates completion at ${new Date(finish).toISOString()}. This is a snapshot estimate; confirm in game and import again.`);}}
 async function notice(uid:string,key:string,title:string,body:string){await db.query("INSERT INTO game_hub_notices(id,guild_id,module,user_id,dedupe_key,title,body) VALUES($1,$2,'clash',$3,$4,$5,$6) ON CONFLICT DO NOTHING",[randomUUID(),guildId,uid,key,title,body]);}
}
