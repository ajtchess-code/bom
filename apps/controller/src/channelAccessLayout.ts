// Private category/channel access, applied once on startup (and again only if
// this layout changes). Each channel's previous permission overwrites are saved
// to channel_layout_backups first, so the change can be reversed.
//
// Only the roles listed here keep access; @everyone and every other role or
// member overwrite is removed. Our own bots (this controller and the music
// accounts) keep access so they can still post and play music.
import {createHash} from 'node:crypto';
import {PermissionFlagsBits as P,OverwriteType,ChannelType} from 'discord.js';
import {db} from '@bom/db';
import {redis,keys} from '@bom/redis';

const MEMBERS=['1279444726277341184','1517534973702438972','1546221852102500505'];
const LEADERSHIP=['1279444448861749339','1279444223686475806'];

/** See, chat, react, connect and talk: everything an ordinary member does, nothing administrative. */
const FULL=[P.ViewChannel,P.ReadMessageHistory,P.SendMessages,P.SendMessagesInThreads,P.CreatePublicThreads,P.AddReactions,P.UseExternalEmojis,P.UseExternalStickers,P.AttachFiles,P.EmbedLinks,P.UseApplicationCommands,P.SendVoiceMessages,P.SendPolls,P.Connect,P.Speak,P.Stream,P.UseVAD,P.UseSoundboard,P.UseExternalSounds,P.UseEmbeddedActivities];
/** Look and react only. */
const READ_REACT=[P.ViewChannel,P.ReadMessageHistory,P.AddReactions,P.UseExternalEmojis];
const NO_TALK=[P.SendMessages,P.SendMessagesInThreads,P.CreatePublicThreads,P.CreatePrivateThreads,P.SendVoiceMessages,P.SendPolls,P.Connect,P.Speak,P.Stream];

type Grant={roles:string[];allow:bigint[];deny?:bigint[]};
type Rule={grants:Grant[]};
const fullFor=(roles:string[]):Grant=>({roles,allow:FULL});

/** Categories: the rule applies to the category and every channel in it. */
export const CATEGORY_RULES:Record<string,Rule>={
 '1279470134435516518':{grants:[{roles:MEMBERS,allow:READ_REACT,deny:NO_TALK}]},
 '1546257204674433084':{grants:[fullFor(MEMBERS)]},
 '1279466038504849458':{grants:[fullFor(MEMBERS)]},
 '1546265222392582194':{grants:[fullFor(MEMBERS)]},
};
/** Single channels that override their category. */
export const CHANNEL_RULES:Record<string,Rule>={
 '1535491547557003335':{grants:[fullFor(LEADERSHIP)]},
 '1535491287271346317':{grants:[fullFor(LEADERSHIP)]},
 '1549455887150616586':{grants:[fullFor([...LEADERSHIP,'1546222585899917433','1559240961480204420'])]},
};

const bits=(list:bigint[]=[])=>list.reduce((a,b)=>a|b,0n);
const layoutKey=createHash('sha256').update(JSON.stringify({CATEGORY_RULES,CHANNEL_RULES},(_,v)=>typeof v==='bigint'?v.toString():v)).digest('hex').slice(0,16);

async function ourBotIds(client:any){
 const ids=new Set<string>([String(client.user.id)]);
 for(let i=1;i<=8;i++){try{const hb=JSON.parse(await redis.get(keys.workerHeartbeat(String(i)))??'null');if(hb?.userId)ids.add(String(hb.userId));}catch{}}
 return [...ids];
}

function overwritesFor(guild:any,rule:Rule,bots:string[]){
 const out:any[]=[{id:guild.roles.everyone.id,type:OverwriteType.Role,deny:P.ViewChannel|P.Connect}];
 for(const g of rule.grants)for(const id of g.roles){if(!guild.roles.cache.has(id)){console.warn(`[channel-layout] Role ${id} not found; skipped.`);continue;}out.push({id,type:OverwriteType.Role,allow:bits(g.allow),deny:bits(g.deny)});}
 for(const id of bots)out.push({id,type:OverwriteType.Member,allow:bits(FULL)|P.ManageChannels});
 return out;
}

async function apply(channel:any,overwrites:any[]){
 const previous=channel.permissionOverwrites.cache.map((o:any)=>({id:o.id,type:o.type,allow:o.allow.bitfield.toString(),deny:o.deny.bitfield.toString()}));
 await db.query('INSERT INTO channel_layout_backups(layout_key,guild_id,channel_id,channel_name,overwrites) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(layout_key,channel_id) DO NOTHING',[layoutKey,channel.guildId,channel.id,channel.name,JSON.stringify(previous)]);
 await channel.permissionOverwrites.set(overwrites,'BOM private channel access layout');
}

export async function applyChannelAccessLayout(client:any,guildId:string){
 const done=await db.query('SELECT 1 FROM channel_layout_runs WHERE layout_key=$1 AND guild_id=$2 AND completed_at IS NOT NULL',[layoutKey,guildId]);
 if(done.rowCount)return;
 // Give the music accounts a moment to report in so they keep voice access.
 await new Promise(r=>setTimeout(r,90_000).unref?.());
 const guild=await client.guilds.fetch(guildId);await guild.roles.fetch();await guild.channels.fetch();
 const bots=await ourBotIds(client),errors:string[]=[];let changed=0;
 const run=async(channel:any,rule:Rule)=>{try{await apply(channel,overwritesFor(guild,rule,bots));changed++;}catch(e:any){errors.push(`${channel.name??channel.id}: ${e.message??e}`);}};
 for(const [categoryId,rule] of Object.entries(CATEGORY_RULES)){
  const category=guild.channels.cache.get(categoryId);
  if(!category||category.type!==ChannelType.GuildCategory){errors.push(`Category ${categoryId} not found`);continue;}
  await run(category,rule);
  for(const child of guild.channels.cache.filter((c:any)=>c.parentId===categoryId).values())if(!CHANNEL_RULES[child.id])await run(child,rule);
 }
 for(const [channelId,rule] of Object.entries(CHANNEL_RULES)){const ch=guild.channels.cache.get(channelId);if(!ch){errors.push(`Channel ${channelId} not found`);continue;}await run(ch,rule);}
 await db.query('INSERT INTO channel_layout_runs(layout_key,guild_id,completed_at,changed,errors) VALUES($1,$2,CASE WHEN $4::jsonb=\'[]\'::jsonb THEN now() END,$3,$4::jsonb) ON CONFLICT(layout_key,guild_id) DO UPDATE SET completed_at=EXCLUDED.completed_at,changed=EXCLUDED.changed,errors=EXCLUDED.errors,updated_at=now()',[layoutKey,guildId,changed,JSON.stringify(errors)]);
 if(errors.length)console.warn(`[channel-layout] Applied to ${changed} channels; ${errors.length} problem(s), will retry on next restart:`,errors);
 else console.info(`[channel-layout] Private access applied to ${changed} channels (bots kept: ${bots.length}). Previous permissions saved under layout ${layoutKey}.`);
}
