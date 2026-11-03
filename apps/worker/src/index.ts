import {getOrJoinVoicePlayer,isCurrentPlayerEvent} from './voiceSession.js';
import { ActivityType, Client, GatewayIntentBits } from "discord.js";
import { Connectors, Shoukaku } from "shoukaku";
import { randomUUID } from "node:crypto";
import { redis, redisSub, keys, publishEvent, enqueue, streamTailId } from "@bom/redis";
import { FILTER_PRESETS, WorkerCommand, type TrackInfo, type QueueItem } from "@bom/shared";
import { resolveSmart, resolverSettingsFromEnv, resolverSettingsFromRow } from "./resolver.js";

function requiredEnv(name:string):string{
  const value=process.env[name];
  if(!value)throw new Error(`${name} is required`);
  return value;
}
const workerId=requiredEnv("WORKER_ID");
const token=requiredEnv("DISCORD_TOKEN");
const guildId=requiredEnv("DISCORD_GUILD_ID");
const lavalinkConfigured=process.env.LAVALINK_URL??"127.0.0.1:2333";
const lavalinkSecondary=(process.env.LAVALINK_SECONDARY_URLS??"").split(",").map(x=>x.trim()).filter(Boolean);
const lavalinkPassword=process.env.LAVALINK_PASSWORD??"youshallnotpass";
const secureEnv=(process.env.LAVALINK_SECURE??"false").toLowerCase()==="true";
const searchPrefix=process.env.LAVALINK_SEARCH_PREFIX??"ytmsearch:";
const voiceJoinSettleMs=Math.max(0,Math.min(500,Number(process.env.VOICE_JOIN_SETTLE_MS??100)));
function parseLavalinkEndpoint(value:string){
  const raw=value.trim();
  if(/^https?:\/\//i.test(raw)){
    const u=new URL(raw);
    return {url:u.host,secure:u.protocol==="https:",restBase:`${u.protocol}//${u.host}`};
  }
  return {url:raw.replace(/\/$/,""),secure:secureEnv,restBase:`${secureEnv?"https":"http"}://${raw.replace(/\/$/,"")}`};
}
const lavalink=parseLavalinkEndpoint(lavalinkConfigured);
const lavalinkUrl=lavalink.url;
const secure=lavalink.secure;
const protocol=secure?"https":"http";
const lavalinkEndpoints=[lavalink,...lavalinkSecondary.map(parseLavalinkEndpoint)];

const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildVoiceStates]});
// Shoukaku 4.3's built-in Discord.js connector still listens for the legacy
// `ready` event. Discord.js now exposes `clientReady`, so override only the
// listener hook while preserving Shoukaku's packet/voice integration.
class DiscordClientReadyConnector extends Connectors.DiscordJS {
  public listen(nodes:any[]):void {
    this.client.once("clientReady",()=>this.ready(nodes));
    this.client.on("raw",(packet:any)=>this.raw(packet));
  }
}
const shoukaku=new Shoukaku(new DiscordClientReadyConnector(client),lavalinkEndpoints.map((x,i)=>({name:i===0?"primary":`backup-${i}`,url:x.url,auth:lavalinkPassword,secure:x.secure})),{resume:true,resumeTimeout:60,reconnectTries:20,reconnectInterval:5,voiceConnectionTimeout:20});
// Keep blocking stream reads off the general-purpose Redis connection so
// heartbeats, leases and playback state are never stuck behind XREAD BLOCK.
const commandRedis=redis.duplicate();

// Lavalink connectivity/health telemetry. These Shoukaku events make it clear in
// Novonode logs whether a worker is merely logged into Discord or is actually
// connected and ready to use the hosted Lavalink node.
shoukaku.on("ready",(name,lavalinkResume,libraryResume)=>{
  nodeReady=true;
  console.log(`[Lavalink] Worker ${workerId}: node ${name} READY (lavalinkResume=${lavalinkResume}, libraryResume=${libraryResume})`);
});
shoukaku.on("error",(name,error)=>{
  recentFailures++;
  console.error(`[Lavalink] Worker ${workerId}: node ${name} ERROR`,error);
});
shoukaku.on("close",(name,code,reason)=>{
  console.warn(`[Lavalink] Worker ${workerId}: node ${name} CLOSED code=${code} reason=${reason||"none"}`);
});
shoukaku.on("disconnect",(name,count)=>{
  nodeReady=false;reconnects++;
  console.warn(`[Lavalink] Worker ${workerId}: node ${name} DISCONNECTED (count=${count})`);
});
shoukaku.on("reconnecting",(name,reconnectsLeft,reconnectInterval)=>{
  console.warn(`[Lavalink] Worker ${workerId}: node ${name} reconnecting; attempts left=${reconnectsLeft}, interval=${reconnectInterval}s`);
});

async function verifyLavalinkRest(){
  try{
    const signal=AbortSignal.timeout(10000);
    const versionResponse=await fetch(`${lavalink.restBase}/version`,{headers:{Authorization:lavalinkPassword},signal});
    const version=(await versionResponse.text()).trim();
    const infoResponse=await fetch(`${lavalink.restBase}/v4/info`,{headers:{Authorization:lavalinkPassword},signal});
    if(!infoResponse.ok)throw new Error(`GET /v4/info returned HTTP ${infoResponse.status}`);
    const info:any=await infoResponse.json();
    const pluginNames=Array.isArray(info?.plugins)?info.plugins.map((p:any)=>p?.name).filter(Boolean):[];
    console.log(`[Lavalink] Worker ${workerId}: REST health OK at ${lavalink.restBase} (version=${version||info?.version?.semver||"unknown"}, plugins=${pluginNames.length?pluginNames.join(", "):"none reported"})`);
  }catch(err:any){
    console.error(`[Lavalink] Worker ${workerId}: REST health FAILED at ${lavalink.restBase}: ${err?.message??err}`);
  }
}

type Runtime={roomId:string;guildId:string;requesterId:string;requestId:string;traceId?:string;player:any;track?:TrackInfo;transitionMode?:string;transitionMs?:number;transitionTimer?:NodeJS.Timeout;fallbackTracks?:any[];fallbackAttempts?:number;origin?:string;surface?:string;originalQuery?:string;voiceChannelId?:string;baseVolume?:number;ducked?:boolean};
let runtime:Runtime|null=null;
let connectedVoiceChannelId:string|null=null;
let reconnects=0,recentFailures=0,nodeReady=false,lastNodePing=0;
let lastHeartbeatPayload="";
let eventLoopLagMs=0;let eventLoopExpected=Date.now()+1000;
setInterval(()=>{const now=Date.now();eventLoopLagMs=Math.max(0,now-eventLoopExpected);eventLoopExpected=now+1000;},1000).unref();
const ignoredEndPlayers=new WeakSet<object>();
const skippedEndPlayers=new WeakSet<object>();

function diag(tag:string,message:string,details:Record<string,unknown>={}){console.log(`[${tag}] ${message} ${JSON.stringify({workerId,...details})}`);}
function diagWarn(tag:string,message:string,details:Record<string,unknown>={}){console.warn(`[${tag}] ${message} ${JSON.stringify({workerId,...details})}`);}
function safeQuery(value:unknown){const raw=String(value??"").replace(/\s+/g," ").trim();if(!raw)return undefined;try{const u=new URL(raw);return `${u.protocol}//${u.host}${u.pathname}`.slice(0,180);}catch{return raw.slice(0,180);}}

function normalizeQuery(q:string){
  if(/^https?:\/\//i.test(q)||/^[a-z]+(?:search|rec):/i.test(q))return q;
  return `${searchPrefix}${q}`;
}
function toInfo(t:any):TrackInfo{
  const i=t.info??{};
  return {encoded:t.encoded,identifier:String(i.identifier??"unknown"),title:String(i.title??"Unknown title"),author:String(i.author??"Unknown artist"),length:Number(i.length??0),uri:i.uri??null,artworkUrl:i.artworkUrl??null,isrc:i.isrc??null,sourceName:String(i.sourceName??"unknown"),isStream:Boolean(i.isStream)};
}
function tracksFromResult(result:any):any[]{
  if(!result)return[];
  if(result.loadType==="track")return result.data?[result.data]:[];
  if(result.loadType==="search")return Array.isArray(result.data)?result.data:[];
  if(result.loadType==="playlist")return result.data?.tracks??[];
  return[];
}
async function setPresence(track?:TrackInfo){
  if(!client.user)return;
  if(track)client.user.setPresence({status:"online",activities:[{name:track.title.slice(0,120),type:ActivityType.Playing}]});
  else client.user.setPresence({status:"idle",activities:[{name:"waiting for music",type:ActivityType.Listening}]});
}

async function failRuntime(message:string){
  const r=runtime;
  if(!r)return;
  diagWarn("playback-error","failing active runtime",{traceId:r.traceId,requestId:r.requestId,roomId:r.roomId,message});
  runtime=null;
  if(r.transitionTimer)clearTimeout(r.transitionTimer);
  ignoredEndPlayers.add(r.player);
  await publishEvent({type:"ERROR",workerId,roomId:r.roomId,guildId:r.guildId,requestId:r.requestId,traceId:r.traceId,message,fatal:true}).catch(()=>{});
  await r.player.stopTrack?.().catch(()=>{});
  await shoukaku.leaveVoiceChannel(r.guildId).catch(()=>{});
  connectedVoiceChannelId=null;
  const lease=await redis.get(keys.workerLease(workerId)).catch(()=>null);
  if(lease===r.roomId)await redis.del(keys.workerLease(workerId)).catch(()=>{});
  const mapped=await redis.get(keys.roomWorker(r.roomId)).catch(()=>null);
  if(mapped===workerId)await redis.del(keys.roomWorker(r.roomId)).catch(()=>{});
  await setPresence().catch(()=>{});
}

async function play(cmd:Extract<WorkerCommand,{type:"PLAY"}>){
  const startedAt=Date.now();
  try{
    diag("worker-command","PLAY received",{traceId:cmd.traceId,requestId:cmd.requestId,roomId:cmd.roomId,voiceChannelId:cmd.voiceChannelId,requesterId:cmd.requesterId,query:safeQuery(cmd.query),encoded:Boolean(cmd.encoded)});
    if(cmd.guildId!==guildId)throw new Error("Rejected playback command for a guild other than DISCORD_GUILD_ID");
    if(runtime&&runtime.roomId!==cmd.roomId)await failRuntime("Worker was reassigned while a previous room was still active");
    const shardId=client.guilds.cache.get(guildId)?.shardId??0;
    const nodes=[...(shoukaku as any).nodes?.values?.()??[]];
    const node:any=nodes.find((n:any)=>n?.state===1||n?.state==="CONNECTED"||n?.sessionId)??(shoukaku as any).nodes?.get?.("primary")??nodes[0];
    if(!node)throw new Error("Lavalink node is not ready");

    // Voice negotiation and Lavalink search are independent. Doing them in
    // parallel removes an entire network round-trip from cold-start playback.
    diag("voice","joining Discord voice channel",{traceId:cmd.traceId,requestId:cmd.requestId,roomId:cmd.roomId,voiceChannelId:cmd.voiceChannelId,shardId,selfDeaf:true});
    let resolvePromise:Promise<{selected:any;remainder:any[]}>;
    if(cmd.encoded){
      resolvePromise=Promise.resolve({selected:{encoded:cmd.encoded,info:cmd.trackInfo??{identifier:"encoded",title:cmd.query,author:"Playlist",length:0,sourceName:"playlist",isStream:false}},remainder:[]});
      diag("resolve","using pre-resolved track",{traceId:cmd.traceId,requestId:cmd.requestId,roomId:cmd.roomId});
    }else{
      const normalized=normalizeQuery(cmd.query);
      diag("resolve","resolving request through smart multi-source resolver",{traceId:cmd.traceId,requestId:cmd.requestId,roomId:cmd.roomId,query:safeQuery(normalized)});
      resolvePromise=(async()=>{
        let resolverSettings=resolverSettingsFromEnv();try{const raw=await redis.get(`music:resolver:settings:${guildId}`);if(raw)resolverSettings=resolverSettingsFromRow(JSON.parse(raw),resolverSettings);}catch{}
        const result=await resolveSmart(node,cmd.query,resolverSettings);
        const resolveMs=Date.now()-startedAt;
        diag("resolve","smart resolution complete",{traceId:cmd.traceId,requestId:cmd.requestId,roomId:cmd.roomId,provider:result.resolution.provider,score:result.resolution.score,attempts:result.resolution.attempts,fallbacks:result.fallbacks.length,resolveMs});
        void publishEvent({type:"METRIC",workerId,roomId:cmd.roomId,guildId:cmd.guildId,requestId:cmd.requestId,traceId:cmd.traceId,metric:"lavalink_resolve_ms",valueMs:resolveMs,details:{provider:result.resolution.provider,score:result.resolution.score,attempts:result.resolution.attempts,fallbacks:result.fallbacks.length}}).catch(()=>{});
        return result as any;
      })();
    }
    const coldJoin=connectedVoiceChannelId!==cmd.voiceChannelId;
    const joinPromise=getOrJoinVoicePlayer(shoukaku,{guildId,channelId:cmd.voiceChannelId,shardId,deaf:true},player=>ignoredEndPlayers.add(player));
    // Wait for both branches to settle before cleanup, so a late voice join
    // cannot recreate an orphan after a failed source resolution.
    const [joined,searched]=await Promise.allSettled([joinPromise,resolvePromise]);
    if(joined.status==='rejected')throw joined.reason;
    if(searched.status==='rejected')throw searched.reason;
    const player=joined.value,resolved=searched.value;
    connectedVoiceChannelId=cmd.voiceChannelId;
    // Discord/Lavalink can report the voice connection ready a fraction before
    // the first UDP/Opus frames are completely stable. A tiny cold-join settle
    // avoids the audible first-second cut-out without penalizing queued tracks.
    if(coldJoin&&voiceJoinSettleMs>0)await new Promise(r=>setTimeout(r,voiceJoinSettleMs));
    diag("voice","joined Discord voice channel",{traceId:cmd.traceId,requestId:cmd.requestId,roomId:cmd.roomId,voiceChannelId:cmd.voiceChannelId,joinAndResolveMs:Date.now()-startedAt,coldJoin,settleMs:coldJoin?voiceJoinSettleMs:0});
    const workerVoice=client.guilds.cache.get(guildId)?.members.me?.voice;
    diag("voice","Discord worker voice state",{traceId:cmd.traceId,requestId:cmd.requestId,roomId:cmd.roomId,channelId:workerVoice?.channelId??null,selfMute:Boolean(workerVoice?.selfMute),serverMute:Boolean(workerVoice?.serverMute),selfDeaf:Boolean(workerVoice?.selfDeaf),serverDeaf:Boolean(workerVoice?.serverDeaf),suppress:Boolean(workerVoice?.suppress)});
    const resolvedOrigin=(resolved as any).resolution?.strategy==="direct-playlist"?"PLAYLIST":(cmd as any).origin;
    runtime={roomId:cmd.roomId,guildId,requesterId:cmd.requesterId,requestId:cmd.requestId,traceId:cmd.traceId,player,transitionMode:cmd.transitionMode,transitionMs:cmd.transitionMs,fallbackTracks:(resolved as any).fallbacks??[],fallbackAttempts:0,origin:resolvedOrigin,surface:(cmd as any).surface,originalQuery:(cmd as any).originalQuery??cmd.query,voiceChannelId:cmd.voiceChannelId,baseVolume:100,ducked:false};
    wirePlayer(player);
    const selected=resolved.selected;
    if(resolved.remainder.length){
      void (async()=>{
        for(const t of resolved.remainder){
          const inf=toInfo(t);
          const item:QueueItem={requestId:randomUUID(),roomId:cmd.roomId,guildId:cmd.guildId,voiceChannelId:cmd.voiceChannelId,query:`${inf.author} ${inf.title}`,display:`${inf.author} — ${inf.title}`,encoded:t.encoded,trackInfo:inf,requesterId:cmd.requesterId,requestedAt:Date.now(),traceId:cmd.traceId,source:"PLAYLIST",surface:(cmd as any).surface??"DISCORD",originalQuery:(cmd as any).originalQuery??cmd.query};
          await enqueue(item);
        }
        diag("music-queue","playlist remainder queued",{traceId:cmd.traceId,requestId:cmd.requestId,roomId:cmd.roomId,queued:resolved.remainder.length});
      })().catch(err=>diagWarn("music-queue","playlist remainder queue failed",{traceId:cmd.traceId,requestId:cmd.requestId,roomId:cmd.roomId,error:err?.message??String(err)}));
    }
    const info=toInfo(selected);
    (info as any).resolution=(resolved as any).resolution;
    runtime.track=info;
    diag("playback","sending track to Lavalink player",{traceId:cmd.traceId,requestId:cmd.requestId,roomId:cmd.roomId,title:info.title,author:info.author,source:info.sourceName,lengthMs:info.length,elapsedMs:Date.now()-startedAt});
    const transitionMs=Math.max(0,Number(cmd.transitionMs??0));
    const fadeIn=Boolean(cmd.transitionMode&&cmd.transitionMode!=="OFF"&&cmd.transitionMode!=="GAPLESS"&&transitionMs>0);
    // Shoukaku/Lavalink volume must be asserted after playTrack.  Setting it only
    // before the player update can be lost when Lavalink replaces the current
    // track/player state, which presents in Discord as a speaking bot with
    // effectively silent audio.  Pre-mute only when a fade-in is requested,
    // then always establish the intended volume after the track is loaded.
    if(fadeIn)try{await player.setGlobalVolume?.(0);}catch{}
    await player.playTrack({track:{encoded:selected.encoded,userData:{roomId:cmd.roomId,requesterId:cmd.requesterId,requestId:cmd.requestId,traceId:cmd.traceId}}});
    // A reused Lavalink player can retain paused/volume state from the previous
    // session. Explicitly unpause and assert volume after replacing the track.
    // This is intentionally on the critical path because Discord can show the
    // worker as speaking even when stale player state makes the track inaudible.
    try{await player.setPaused?.(false);}catch(err:any){diagWarn("audio-state","unable to force player unpaused",{traceId:cmd.traceId,requestId:cmd.requestId,roomId:cmd.roomId,message:err?.message??String(err)});}
    const initialVolume=fadeIn?0:Number(runtime?.baseVolume??100);
    try{await player.setGlobalVolume?.(initialVolume);diag("audio-volume","Lavalink volume asserted after track load",{traceId:cmd.traceId,requestId:cmd.requestId,roomId:cmd.roomId,targetVolume:initialVolume,reportedVolume:Number(player.volume??initialVolume),fadeIn,paused:Boolean(player.paused)});}catch(err:any){diagWarn("audio-volume","volume assertion failed",{traceId:cmd.traceId,requestId:cmd.requestId,roomId:cmd.roomId,message:err?.message??String(err)});}
    if(!fadeIn){
      const requestId=cmd.requestId;
      const timer=setTimeout(()=>{void (async()=>{if(runtime?.requestId!==requestId)return;try{await player.setPaused?.(false);await player.setGlobalVolume?.(Number(runtime?.baseVolume??100));diag("audio-state","post-start audio state verified",{traceId:cmd.traceId,requestId,roomId:cmd.roomId,targetVolume:Number(runtime?.baseVolume??100),reportedVolume:Number(player.volume??runtime?.baseVolume??100),paused:Boolean(player.paused)});}catch(err:any){diagWarn("audio-state","post-start verification failed",{traceId:cmd.traceId,requestId,roomId:cmd.roomId,message:err?.message??String(err)});}})();},350);timer.unref?.();
    }
    if(cmd.startPositionMs&&cmd.startPositionMs>0)await player.seekTo(cmd.startPositionMs).catch(()=>{});
    if(fadeIn){
      const steps=8,step=Math.max(25,Math.floor(transitionMs/steps));
      void (async()=>{for(let i=1;i<=steps&&runtime?.requestId===cmd.requestId;i++){await new Promise(r=>setTimeout(r,step));try{const target=Math.round(i/steps*Number(runtime?.baseVolume??100));await player.setGlobalVolume?.(target);if(i===steps)diag("audio-volume","fade-in reached target volume",{traceId:cmd.traceId,requestId:cmd.requestId,roomId:cmd.roomId,targetVolume:target,reportedVolume:Number(player.volume??target)});}catch{}}})();
      if(!info.isStream&&info.length>transitionMs+500){
        const remaining=Math.max(500,info.length-Number(cmd.startPositionMs??0)-transitionMs);
        const timer=setTimeout(()=>{void (async()=>{const steps=8,step=Math.max(25,Math.floor(transitionMs/steps));for(let i=steps-1;i>=0&&runtime?.requestId===cmd.requestId;i--){try{await player.setGlobalVolume?.(Math.round(i/steps*100));}catch{};await new Promise(r=>setTimeout(r,step));}})();},remaining);
        timer.unref?.();if(runtime?.requestId===cmd.requestId)runtime.transitionTimer=timer;
      }
    }
    void setPresence(info);
    await publishEvent({type:"TRACK_START",workerId,roomId:cmd.roomId,guildId:cmd.guildId,requesterId:cmd.requesterId,requestId:cmd.requestId,traceId:cmd.traceId,track:info,origin:runtime.origin as any,surface:runtime.surface as any,originalQuery:runtime.originalQuery});
    const totalWorkerMs=Date.now()-startedAt;
    diag("playback","TRACK_START published",{traceId:cmd.traceId,requestId:cmd.requestId,roomId:cmd.roomId,title:info.title,author:info.author,totalWorkerMs});
    void publishEvent({type:"METRIC",workerId,roomId:cmd.roomId,guildId:cmd.guildId,requestId:cmd.requestId,traceId:cmd.traceId,metric:"worker_track_start_ms",valueMs:totalWorkerMs,details:{title:info.title,source:info.sourceName}}).catch(()=>{});
  }catch(err:any){
    const message=err?.message??String(err);
    diagWarn("playback-error","PLAY failed",{traceId:cmd.traceId,requestId:cmd.requestId,roomId:cmd.roomId,voiceChannelId:cmd.voiceChannelId,message});
    void publishEvent({type:"METRIC",workerId,roomId:cmd.roomId,guildId:cmd.guildId,requestId:cmd.requestId,traceId:cmd.traceId,metric:"worker_play_failure",valueMs:Date.now()-startedAt,details:{message}}).catch(()=>{});
    if(runtime?.roomId===cmd.roomId) await failRuntime(message);
    else {
      await shoukaku.leaveVoiceChannel(guildId).catch(()=>{});
      connectedVoiceChannelId=null;
      const lease=await redis.get(keys.workerLease(workerId)).catch(()=>null);if(lease===cmd.roomId)await redis.del(keys.workerLease(workerId)).catch(()=>{});
      const mapped=await redis.get(keys.roomWorker(cmd.roomId)).catch(()=>null);if(mapped===workerId)await redis.del(keys.roomWorker(cmd.roomId)).catch(()=>{});
      await publishEvent({type:"ERROR",workerId,roomId:cmd.roomId,guildId:cmd.guildId,requestId:cmd.requestId,traceId:cmd.traceId,message,fatal:true});
      await setPresence().catch(()=>{});
    }
  }
}

async function attemptRuntimeFallback(reason:string){
  const r=runtime;if(!r?.fallbackTracks?.length)return false;
  const next=r.fallbackTracks.shift();if(!next)return false;
  try{
    r.fallbackAttempts=(r.fallbackAttempts??0)+1;const previous=r.track;const nextInfo=toInfo(next);r.track=nextInfo;
    diagWarn("playback-fallback","switching to resolver fallback",{traceId:r.traceId,requestId:r.requestId,roomId:r.roomId,reason,attempt:r.fallbackAttempts,title:nextInfo.title,author:nextInfo.author,source:nextInfo.sourceName});
    await r.player.playTrack({track:{encoded:next.encoded,userData:{roomId:r.roomId,requesterId:r.requesterId,requestId:r.requestId,traceId:r.traceId,fallback:true}}});
    const restoredVolume=r.ducked?Math.max(0,Math.round(Number(r.baseVolume??100)*.35)):Number(r.baseVolume??100);
    try{await r.player.setGlobalVolume?.(restoredVolume);diag("audio-volume","volume restored after source fallback",{traceId:r.traceId,requestId:r.requestId,roomId:r.roomId,targetVolume:restoredVolume,reportedVolume:Number(r.player.volume??restoredVolume)});}catch{}
    await setPresence(nextInfo);
    await publishEvent({type:"TRACK_FALLBACK",workerId,roomId:r.roomId,guildId:r.guildId,requesterId:r.requesterId,requestId:r.requestId,traceId:r.traceId,previousTrack:previous,track:nextInfo,reason,origin:r.origin as any,surface:r.surface as any,originalQuery:r.originalQuery});
    return true;
  }catch(err:any){diagWarn("playback-fallback","fallback candidate failed",{roomId:r.roomId,message:err?.message??String(err)});return attemptRuntimeFallback(reason);}
}

const wired=new WeakSet<object>();
function wirePlayer(player:any){
  if(wired.has(player))return; wired.add(player);
  player.on?.("end",async(e:any)=>{ if(ignoredEndPlayers.has(player)){ignoredEndPlayers.delete(player);return;} if(!isCurrentPlayerEvent(runtime,player,e)||String(e?.reason??'').toUpperCase()==='REPLACED')return; const r=runtime!;if(r.transitionTimer)clearTimeout(r.transitionTimer); const skipped=skippedEndPlayers.has(player);if(skipped)skippedEndPlayers.delete(player); runtime=null; const reason=skipped?"SKIPPED":(e?.reason??"FINISHED");diag("playback","player ended track",{traceId:r.traceId,requestId:r.requestId,roomId:r.roomId,reason}); await setPresence(); await publishEvent({type:"TRACK_END",workerId,roomId:r.roomId,guildId:r.guildId,requestId:r.requestId,traceId:r.traceId,reason}); });
  player.on?.("exception",async(e:any)=>{ if(runtime&&isCurrentPlayerEvent(runtime,player,e)){const message=e?.exception?.message??"Playback exception";diagWarn("playback-error","Lavalink player exception",{traceId:runtime.traceId,requestId:runtime.requestId,roomId:runtime.roomId,message});if(!await attemptRuntimeFallback(message))await failRuntime(message);} });
  player.on?.("stuck",async(e:any)=>{ if(runtime&&isCurrentPlayerEvent(runtime,player,e)){diagWarn("playback-error","Lavalink player stuck",{traceId:runtime.traceId,requestId:runtime.requestId,roomId:runtime.roomId});if(!await attemptRuntimeFallback("Playback became stuck"))await failRuntime("Playback became stuck");} });
  player.on?.("update",async(e:any)=>{ if(runtime&&isCurrentPlayerEvent(runtime,player,e))await publishEvent({type:"PLAYER_UPDATE",workerId,roomId:runtime.roomId,guildId:runtime.guildId,position:Number(e?.state?.position??player.position??0),ping:Number(e?.state?.ping??0)}); });
}

let lyricsRetryAfter=0;
let lyricsPending=false;
async function fetchLyrics(){
  if(!runtime)return;
  const node:any=runtime.player.node; const sessionId=node.sessionId??node.session?.id;
  if(!sessionId)throw new Error("Lavalink session is not ready for lyrics");
  const url=`${protocol}://${lavalinkUrl}/v4/sessions/${encodeURIComponent(sessionId)}/players/${runtime.guildId}/track/lyrics`;
  const r=await fetch(url,{headers:{Authorization:lavalinkPassword},signal:AbortSignal.timeout(8000)});
  if(r.status===204)return null;
  if(!r.ok)throw new Error(`Lyrics request failed (${r.status})`);
  return r.json();
}

async function handle(raw:string){
  const parsed=WorkerCommand.safeParse(JSON.parse(raw)); if(!parsed.success){console.error(`[worker-command] invalid payload worker=${workerId}`,parsed.error);return;} const cmd=parsed.data;
  if(cmd.type==="PLAY")return play(cmd);
  diag("worker-command","control received",{type:cmd.type,roomId:cmd.roomId});
  if(cmd.type==="LEAVE"){
    if(runtime&&runtime.guildId===guildId){ignoredEndPlayers.add(runtime.player);const r=runtime;runtime=null;if(r.transitionTimer)clearTimeout(r.transitionTimer);await r.player.stopTrack?.().catch(()=>{});}
    await shoukaku.leaveVoiceChannel(guildId).catch(()=>{});connectedVoiceChannelId=null;await setPresence();return;
  }
  if(cmd.guildId!==guildId||!runtime||runtime.guildId!==guildId)return;
  const active=runtime;
  if(cmd.type==="PAUSE"){ await active.player.setPaused?.(true).catch?.(()=>{}); if(!active.player.setPaused)await active.player.update({paused:true}); await publishEvent({type:"STATE",workerId,roomId:active.roomId,guildId:active.guildId,status:"PAUSED"}); return; }
  if(cmd.type==="RESUME"){ await active.player.setPaused?.(false).catch?.(()=>{}); if(!active.player.setPaused)await active.player.update({paused:false}); await publishEvent({type:"STATE",workerId,roomId:active.roomId,guildId:active.guildId,status:"PLAYING"}); return; }
  if(cmd.type==="SKIP"){ if(cmd.expectedRequestId && active.requestId!==cmd.expectedRequestId)return; skippedEndPlayers.add(active.player); await active.player.stopTrack(); return; }
  if(cmd.type==="STOP"){ ignoredEndPlayers.add(active.player); runtime=null; if(active.transitionTimer)clearTimeout(active.transitionTimer); await active.player.stopTrack?.().catch(()=>{}); await shoukaku.leaveVoiceChannel(guildId).catch(()=>{}); connectedVoiceChannelId=null; await setPresence(); await publishEvent({type:"TRACK_END",workerId,roomId:active.roomId,guildId:active.guildId,requestId:active.requestId,traceId:active.traceId,reason:"STOPPED"}); return; }
  if(cmd.type==="SEEK"){ await active.player.seekTo(cmd.positionMs); return; }
  if(cmd.type==="FILTER"){
    const preset=(FILTER_PRESETS as any)[cmd.preset]??{};
    await active.player.setFilters(preset);
    return;
  }
  if(cmd.type==="VOLUME"){active.baseVolume=cmd.volume;const applied=active.ducked?Math.max(0,Math.round(cmd.volume*.35)):cmd.volume;try{await active.player.setGlobalVolume?.(applied);diag("audio-volume","manual volume applied",{roomId:active.roomId,targetVolume:applied,reportedVolume:Number(active.player.volume??applied),ducked:Boolean(active.ducked)});}catch{}return;}
  if(cmd.type==="LYRICS"){
    const target=runtime;
    if(!target||target.roomId!==cmd.roomId||lyricsPending||Date.now()<lyricsRetryAfter)return;
    lyricsPending=true;
    try{
      const lyrics=await fetchLyrics();
      if(runtime===target)await publishEvent({type:"LYRICS",workerId,roomId:cmd.roomId,guildId:cmd.guildId,lyrics:lyrics??null});
    }catch(err:any){
      // Optional metadata failure must never poison playback state.
      lyricsRetryAfter=Date.now()+300_000;
      console.warn("[lyrics] provider unavailable; retrying after 5 minutes",{workerId,roomId:cmd.roomId,message:err?.message??"Lyrics unavailable"});
      if(runtime===target)await publishEvent({type:"LYRICS",workerId,roomId:cmd.roomId,guildId:cmd.guildId,lyrics:null});
    }finally{lyricsPending=false;}
    return;
  }
}

const voiceActivityChannel=process.env.VOICE_ACTIVITY_REDIS_CHANNEL??"music:voice-activity";
async function applyVoiceActivity(message:string){
  if(!runtime)return;let event:any;try{event=JSON.parse(message);}catch{return;}if(String(event.guildId??guildId)!==guildId||String(event.voiceChannelId??"")!==String(runtime.voiceChannelId??""))return;
  let settings:any=null;try{const raw=await redis.get(`music:resolver:settings:${guildId}`);settings=raw?JSON.parse(raw):null;}catch{}if(!settings?.voice_ducking_enabled||String(settings.voice_ducking_provider??"NONE")==="NONE")return;
  const active=Boolean(event.active??(Number(event.activeSpeakers??0)>0)),percent=Math.max(5,Math.min(90,Number(settings.voice_ducking_percent??35))),base=Number(runtime.baseVolume??100),target=active?Math.round(base*percent/100):base;if(runtime.ducked===active)return;runtime.ducked=active;try{await runtime.player.setGlobalVolume?.(target);}catch{}diag("voice-ducking",active?"ducked for voice activity":"restored after voice activity",{roomId:runtime.roomId,voiceChannelId:runtime.voiceChannelId,targetVolume:target,provider:settings.voice_ducking_provider});
}

async function commandLoop(){
  const stream=keys.workerCommands(workerId); let last=await streamTailId(stream);
  for(;;){
    try{
      const res=await commandRedis.xread("BLOCK",5000,"COUNT",20,"STREAMS",stream,last) as any; if(!res)continue;
      for(const [,items] of res)for(const [id,fields] of items){ last=id; const i=fields.indexOf("payload"); if(i>=0)await handle(fields[i+1]); }
    }catch(err){ console.error("worker command loop",err); await new Promise(r=>setTimeout(r,1500)); }
  }
}

setInterval(async()=>{
  const playerPing=Number((runtime?.player as any)?.ping??0);if(Number.isFinite(playerPing)&&playerPing>=0)lastNodePing=playerPing;
  const signature=JSON.stringify({workerId,userId:client.user?.id??null,tag:client.user?.tag??null,roomId:runtime?.roomId??null,nodeReady,lavalinkPingMs:lastNodePing,eventLoopLagMs,reconnects,recentFailures});
  const payload=JSON.stringify({...JSON.parse(signature),at:Date.now()});
  // Avoid redundant persistence churn while still refreshing the TTL often enough for health scoring.
  if(signature!==lastHeartbeatPayload||runtime){await redis.set(keys.workerHeartbeat(workerId),payload,"EX",30);lastHeartbeatPayload=signature;}
  else await redis.expire(keys.workerHeartbeat(workerId),30);
  if(runtime){
    const lease=await redis.get(keys.workerLease(workerId));
    if(lease===runtime.roomId)await redis.expire(keys.workerLease(workerId),45);
    else if(!lease)await redis.set(keys.workerLease(workerId),runtime.roomId,"EX",45,"NX");
    await redis.set(keys.roomWorker(runtime.roomId),workerId,"EX",45);
  }
  if(recentFailures>0)recentFailures=Math.max(0,recentFailures-1);
},10_000).unref();

client.once("clientReady",async()=>{
  console.log(`Worker ${workerId} logged in as ${client.user?.tag}`);
  console.log(`[Lavalink] Worker ${workerId}: configured endpoint ${lavalink.restBase}; running authenticated REST preflight...`);
  void verifyLavalinkRest();
  for(const g of client.guilds.cache.values())if(g.id!==guildId)await g.leave().catch(()=>{});
  if(!client.guilds.cache.has(guildId))console.warn(`Worker ${workerId} is not currently in configured guild ${guildId}`);
  const primaryGuild=client.guilds.cache.get(guildId);
  if(primaryGuild){try{const me=await primaryGuild.members.fetchMe();if(me.nickname!=='BOM Music Bot')await me.setNickname('BOM Music Bot','Consistent BOM Music identity');}catch(err){console.warn('[music] Could not update server nickname for this bot',err);}}
  // A fresh process has no live player. Clear only this worker's own stale
  // lease/mapping from a previous process so the controller can recover the
  // room immediately instead of waiting for lease expiry.
  const staleRoom=await redis.get(keys.workerLease(workerId)).catch(()=>null);
  if(staleRoom){
    const mapped=await redis.get(keys.roomWorker(staleRoom)).catch(()=>null);
    if(mapped===workerId)await redis.del(keys.roomWorker(staleRoom)).catch(()=>{});
    await redis.del(keys.workerLease(workerId)).catch(()=>{});
  }
  await setPresence();
  await redis.set(keys.workerHeartbeat(workerId),JSON.stringify({workerId,userId:client.user!.id,tag:client.user?.tag??null,roomId:null,at:Date.now()}),"EX",20);
  await publishEvent({type:"READY",workerId,userId:client.user!.id,username:client.user!.username});
  await redisSub.subscribe(voiceActivityChannel).catch(()=>{});redisSub.on("message",(channel:string,message:string)=>{if(channel===voiceActivityChannel)void applyVoiceActivity(message);});
  void commandLoop();
});
client.on("guildCreate",g=>{if(g.id!==guildId)void g.leave().catch(()=>{});});
await client.login(token);
