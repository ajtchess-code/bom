import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {db,oneOrNone} from '@bom/db';
import {redis} from '@bom/redis';
import {lookup,reverse} from 'node:dns/promises';

type Dependencies={guildId:string;requireMember:(req:any,reply:any)=>Promise<any>;requireAdmin:(req:any,reply:any)=>Promise<boolean>;userId:(req:any)=>string};
const inRange=(v:any,len=80)=>String(v??'').trim().slice(0,len);
const podcastUrl=(value:any)=>{try{const url=new URL(String(value));return ['https:','http:'].includes(url.protocol)?url.toString():null;}catch{return null;}};
const safeStation=(s:any)=>({id:String(s.stationuuid??''),name:inRange(s.name,160),country:inRange(s.country,80),countryCode:inRange(s.countrycode,3),state:inRange(s.state,100),language:inRange(s.language,100),tags:inRange(s.tags,180),favicon:podcastUrl(s.favicon),streamUrl:podcastUrl(s.url_resolved)||podcastUrl(s.url),votes:Number(s.votes??0),clickcount:Number(s.clickcount??0),codec:inRange(s.codec,40),bitrate:Number(s.bitrate??0)});
let radioServers:string[]=['https://de1.api.radio-browser.info','https://nl1.api.radio-browser.info','https://fi1.api.radio-browser.info'];
let serverRefresh=0;
async function serverList(){
  if(Date.now()-serverRefresh<60*60*1000)return radioServers;
  serverRefresh=Date.now();
  try{
    const ips=await lookup('all.api.radio-browser.info',{all:true});
    const hostnames=(await Promise.all(ips.slice(0,8).map(async ip=>reverse(ip.address).catch(()=>[])))).flat().filter(x=>/^([a-z0-9-]+\.)*api\.radio-browser\.info$/i.test(x));
    if(hostnames.length)radioServers=[...new Set([...hostnames.map(x=>`https://${x}`),...radioServers])].slice(0,12);
  }catch{}
  return radioServers;
}
export function registerMusicDiscoveryRoutes(app:FastifyInstance,{guildId,requireMember,requireAdmin,userId}:Dependencies){
  app.get('/v1/music/radio/search',async(req:any,reply:any)=>{
    if(!await requireMember(req,reply))return;
    const q=z.object({q:z.string().max(100).optional(),country:z.string().max(3).optional(),state:z.string().max(90).optional(),genre:z.string().max(90).optional(),language:z.string().max(90).optional(),city:z.string().max(90).optional(),offset:z.coerce.number().int().min(0).max(5000).default(0)}).parse(req.query??{});
    const params=new URLSearchParams({hidebroken:'true',limit:'60',offset:String(q.offset),order:'votes',reverse:'true'});
    if(q.country)params.set('countrycode',q.country.toUpperCase());if(q.state)params.set('state',q.state);if(q.genre)params.set('tag',q.genre);if(q.language)params.set('language',q.language);if(q.q||q.city)params.set('name',q.q||q.city||'');
    let last:unknown;
    for(const server of await serverList())try{
      const r=await fetch(`${server}/json/stations/search?${params}`,{headers:{'User-Agent':'BOM-Radio/1.0'},signal:AbortSignal.timeout(7000)});
      if(!r.ok)throw new Error(`Radio service returned ${r.status}`);
      const results=await r.json();return {stations:Array.isArray(results)?results.slice(0,60).map(safeStation):[],source:'Radio Browser',cityFilterNote:q.city?'City is matched against station names; geographic city metadata is not consistently available.':null};
    }catch(err){last=err;}
    return reply.code(503).send({error:'radio_directory_unavailable',detail:String(last).slice(0,200)});
  });
  app.get('/v1/music/podcasts/search',async(req:any,reply:any)=>{
    if(!await requireMember(req,reply))return;
    const q=z.object({q:z.string().min(2).max(140),country:z.string().length(2).optional(),offset:z.coerce.number().int().min(0).max(1000).default(0)}).parse(req.query??{});
    const params=new URLSearchParams({media:'podcast',entity:'podcast',term:q.q,limit:'60',country:q.country??'US'});
    const r=await fetch(`https://itunes.apple.com/search?${params}`,{signal:AbortSignal.timeout(9500),headers:{'User-Agent':'BOM-Music/1.0'}});
    if(!r.ok)return reply.code(503).send({error:'podcast_directory_unavailable'});
    const data:any=await r.json();return {podcasts:(data.results??[]).slice(0,60).map((p:any)=>({id:Number(p.collectionId??0),title:inRange(p.collectionName,180),author:inRange(p.artistName,150),genres:p.genres??[],country:inRange(p.country,2),artwork:podcastUrl(p.artworkUrl600??p.artworkUrl100),episodeCount:Number(p.trackCount??0)}))};
  });
  app.get('/v1/music/podcasts/episodes',async(req:any,reply:any)=>{
    if(!await requireMember(req,reply))return;
    const id=z.coerce.number().int().positive().parse(req.query?.id);
    const params=new URLSearchParams({id:String(id),entity:'podcastEpisode',limit:'50'});
    const r=await fetch(`https://itunes.apple.com/lookup?${params}`,{signal:AbortSignal.timeout(9500)});
    if(!r.ok)return reply.code(503).send({error:'podcast_directory_unavailable'});
    const data:any=await r.json();return {episodes:(data.results??[]).filter((p:any)=>p.wrapperType==='podcastEpisode'||p.kind==='podcast-episode').slice(0,50).map((p:any)=>({id:Number(p.trackId),title:inRange(p.trackName,180),date:p.releaseDate??null,durationMs:Number(p.trackTimeMillis??0),artwork:podcastUrl(p.artworkUrl600??p.artworkUrl160),audioUrl:podcastUrl(p.episodeUrl),description:inRange(p.description,700)}))};
  });
  app.get('/v1/admin/bom-radio',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;const settings=await oneOrNone<any>(`SELECT guild_id,voice_channel_id,stream_url,enabled,updated_at FROM bom_radio_settings WHERE guild_id=$1`,[guildId]);return settings??{voice_channel_id:null,stream_url:null,enabled:false};});
  app.put('/v1/admin/bom-radio',async(req:any,reply:any)=>{
    if(!await requireAdmin(req,reply))return;
    const b=z.object({voiceChannelId:z.string().regex(/^\d{16,22}$/).nullable(),streamUrl:z.string().url().max(2048).nullable(),enabled:z.boolean()}).parse(req.body);
    const url=b.streamUrl?podcastUrl(b.streamUrl):null;
    if(b.enabled&&(!b.voiceChannelId||!url))return reply.code(400).send({error:'voice_channel_and_stream_required'});
    // Prevent localhost/private origin access from provider-supplied station URLs.
    if(url&&/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|169\.254\.)/i.test(new URL(url).hostname))return reply.code(400).send({error:'private_stream_host_denied'});
    await db.query(`INSERT INTO bom_radio_settings(guild_id,voice_channel_id,stream_url,enabled,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(guild_id) DO UPDATE SET voice_channel_id=EXCLUDED.voice_channel_id,stream_url=EXCLUDED.stream_url,enabled=EXCLUDED.enabled,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,[guildId,b.voiceChannelId,url,b.enabled,userId(req)]);
    if(!b.enabled)await redis.del(`music:radio:reserved:${guildId}`).catch(()=>{});
    return {ok:true};
  });
}
