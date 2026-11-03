import {rankMusicCandidates} from '@bom/shared';
import { randomUUID } from "node:crypto";
import { db, many, oneOrNone } from "@bom/db";
import { getRoomState, queueItems, redis } from "@bom/redis";
import type { QueueItem, TrackInfo } from "@bom/shared";

export async function featureSettings(guildId:string){
  await db.query(`INSERT INTO music_feature_settings(guild_id) VALUES($1) ON CONFLICT DO NOTHING`,[guildId]);
  return (await oneOrNone<any>(`SELECT * FROM music_feature_settings WHERE guild_id=$1`,[guildId]))!;
}
export async function roomFeatureSettings(guildId:string,roomId:string){
  const [global,room]=await Promise.all([featureSettings(guildId),oneOrNone<any>(`SELECT * FROM room_music_settings WHERE room_id=$1`,[roomId])]);
  return {autoplayProfile:room?.autoplay_profile??global.autoplay_profile,mood:room?.mood??global.default_mood,transitionMode:room?.transition_mode??global.transition_mode,transitionMs:Number(room?.transition_ms??global.transition_ms??0),collaborativeQueue:room?.collaborative_queue??global.collaborative_queue,queueReorderMode:room?.queue_reorder_mode??global.queue_reorder_mode,radioMode:Boolean(global.radio_mode),radioProfile:global.radio_profile,stationIdsEnabled:Boolean(global.station_ids_enabled),avoidRecentlyPlayed:room?.avoid_recently_played!==false,recoverQueue:room?.recover_queue!==false};
}
export async function checkpointRoom(guildId:string,roomId:string){
  const [queue,state]=await Promise.all([queueItems(roomId),getRoomState(roomId)]);
  await db.query(`INSERT INTO queue_snapshots(room_id,guild_id,queue_json,state_json) VALUES($1,$2,$3,$4) ON CONFLICT (room_id) DO UPDATE SET queue_json=EXCLUDED.queue_json,state_json=EXCLUDED.state_json,updated_at=CURRENT_TIMESTAMP`,[roomId,guildId,queue,state]);
}
export async function restoreQueueSnapshot(roomId:string):Promise<QueueItem[]>{
  const row=await oneOrNone<any>(`SELECT queue_json FROM queue_snapshots WHERE room_id=$1`,[roomId]);if(!row?.queue_json)return[];try{return typeof row.queue_json==="string"?JSON.parse(row.queue_json):row.queue_json;}catch{return[];}
}
export async function metric(guildId:string,metricName:string,valueMs:number,details:any={}){try{await db.query(`INSERT INTO music_metrics(guild_id,worker_id,room_id,request_id,trace_id,metric,value_ms,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[guildId,details.workerId??null,details.roomId??null,details.requestId??null,details.traceId??null,metricName,Number(valueMs)||0,details]);}catch{}}
export async function audit(guildId:string,actorId:string,action:string,details:any){try{await db.query(`INSERT INTO audit_log(guild_id,actor_id,action,details) VALUES($1,$2,$3,$4)`,[guildId,actorId||"system",action,details]);}catch{}}

const moods:Record<string,string[]>={ENERGETIC:["energetic","upbeat","anthem"],RELAXED:["relaxing","acoustic","calm"],SAD:["sad","melancholy","ballad"],FOCUSED:["focus","instrumental","ambient"],PARTY:["party","dance","club"],NOSTALGIC:["classic","throwback","nostalgia"],CHILL:["chill","lofi","soft"],HEAVY:["metal","hard rock","heavy"],HAPPY:["happy","feel good","upbeat"],DARK:["dark","gothic","moody"]};
export async function smartRecommendation(guildId:string,profile:string,mood:string|null|undefined,seed?:{title:string;author:string},session:{title:string;author:string}[]=[],options:{avoidRecentlyPlayed?:boolean}={}){
  const played=new Set(session.map(x=>`${x.author}|${x.title}`.toLowerCase()));if(seed)played.add(`${seed.author}|${seed.title}`.toLowerCase());
  const recent=options.avoidRecentlyPlayed===false?[]:await many<any>(`SELECT title,author FROM track_history WHERE guild_id=$1 AND started_at>now()-INTERVAL '6 hours' ORDER BY started_at DESC LIMIT 500`,[guildId]);
  for(const track of recent)played.add(`${track.author}|${track.title}`.toLowerCase());
  const feedback=await many<any>(`SELECT title,author,rating FROM track_feedback WHERE guild_id=$1 ORDER BY updated_at DESC LIMIT 200`,[guildId]);
  const liked=feedback.filter(x=>x.rating>0),disliked=new Set(feedback.filter(x=>x.rating<0).map(x=>`${x.author}|${x.title}`.toLowerCase()));
  const lastfm=process.env.LASTFM_API_KEY;
  const seeds=[...(profile==="FAMILIAR"?liked.slice(0,3):[]),...session.slice(-4).reverse(),...(seed?[seed]:[])];
  if(lastfm&&seeds.length&&profile!=="SAME_ARTIST"){
    for(const s of seeds.slice(0,3))try{const u=new URL("https://ws.audioscrobbler.com/2.0/");u.search=new URLSearchParams({method:"track.getsimilar",artist:s.author,track:s.title,api_key:lastfm,format:"json",limit:"18"}).toString();const r=await fetch(u,{headers:{"User-Agent":"BOMMusic/0.5"},signal:AbortSignal.timeout(2200)});if(!r.ok)continue;const j:any=await r.json();const candidates=(j.similartracks?.track??[]).filter((x:any)=>x?.name&&x?.artist?.name);const c=candidates.find((x:any)=>{const k=`${x.artist.name}|${x.name}`.toLowerCase();return !played.has(k)&&!disliked.has(k);});if(c)return `${c.artist.name} ${c.name}`;}catch{}
  }
  const rows=await many<any>(`WITH h AS (SELECT title,author,COUNT(*)::int play_count,MAX(started_at) last_played,MIN(identifier) identifier FROM track_history WHERE guild_id=$1 GROUP BY title,author ORDER BY MAX(started_at) DESC LIMIT 400) SELECT h.*,(SELECT metadata->'tags' FROM track_metadata_cache m WHERE m.identifier=h.identifier ORDER BY m.fetched_at DESC LIMIT 1) tags FROM h`,[guildId]);
  const ranked=rankMusicCandidates(rows,{seed,session,feedback,moodTerms:mood?moods[mood]??[]:[],profile,avoidRecentlyPlayed:options.avoidRecentlyPlayed!==false});
  const candidates=profile==='SAME_ARTIST'&&seed?ranked.filter(r=>String(r.author).toLowerCase()===seed.author.toLowerCase()):ranked;
  const c=candidates[0];return c?`${c.author} ${c.title}`:null;

}

export async function maybeStationId(guildId:string){
  const settings=await featureSettings(guildId);if(!settings.station_ids_enabled)return null;
  const rows=await many<any>(`SELECT * FROM station_ids WHERE guild_id=$1 AND enabled=TRUE ORDER BY RANDOM() LIMIT 8`,[guildId]);if(!rows.length)return null;
  if(Math.random()>0.12)return null;const total=rows.reduce((a,x)=>a+Number(x.weight||1),0);let n=Math.random()*total;for(const row of rows){n-=Number(row.weight||1);if(n<=0)return row.audio_url;}return rows[0].audio_url;
}

export async function recordWorkerHealth(guildId:string,workerId:string,heartbeat:any,score:number,quarantine:string|null){
  await db.query(`INSERT INTO worker_health_history(guild_id,worker_id,health_score,lavalink_ping_ms,event_loop_lag_ms,reconnects,failures,quarantined_until) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[guildId,workerId,score,heartbeat?.lavalinkPingMs??null,heartbeat?.eventLoopLagMs??null,heartbeat?.reconnects??0,heartbeat?.recentFailures??0,quarantine?new Date(Date.now()+60000):null]).catch(()=>{});
}
