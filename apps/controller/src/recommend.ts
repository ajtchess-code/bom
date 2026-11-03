import {rankMusicCandidates} from '@bom/shared';
import { many } from "@bom/db";
import {redis} from '@bom/redis';

type Seed={title:string;author:string};
const sig=(x:Seed)=>`${x.author}|${x.title}`.toLowerCase();

export async function recommend(guildId:string, seed?:Seed, session:Seed[]=[],options:{avoidRecentlyPlayed?:boolean}={}):Promise<string|null>{
  const key=process.env.LASTFM_API_KEY;const played=new Set(session.map(sig));if(seed)played.add(sig(seed));
  const recent=options.avoidRecentlyPlayed===false?[]:await many<any>(`SELECT title,author FROM track_history WHERE guild_id=$1 AND started_at>now()-INTERVAL '6 hours' ORDER BY started_at DESC LIMIT 500`,[guildId]);
  for(const track of recent)played.add(`${track.author}|${track.title}`.toLowerCase());
  const feedback=await many<any>('SELECT title,author,rating FROM track_feedback WHERE guild_id=$1 ORDER BY updated_at DESC LIMIT 500',[guildId]);const totals=new Map<string,number>();for(const f of feedback)totals.set(sig(f),(totals.get(sig(f))??0)+Number(f.rating));for(const [track,rating] of totals)if(rating<0)played.add(track);
  const seeds=[...session.slice(-4).reverse(),...(seed?[seed]:[])].filter((x,i,a)=>a.findIndex(y=>sig(y)===sig(x))===i);
  if(key&&seeds.length){
    for(const s of seeds.slice(0,3))try{
      const u=new URL("https://ws.audioscrobbler.com/2.0/");
      u.search=new URLSearchParams({method:"track.getsimilar",artist:s.author,track:s.title,api_key:key,format:"json",limit:"12"}).toString();
      const r=await fetch(u,{headers:{"User-Agent":"BOMMusic/1.0"},signal:AbortSignal.timeout(2200)});if(!r.ok)continue;const j:any=await r.json();
      const c=(j.similartracks?.track??[]).find((x:any)=>x?.name&&x?.artist?.name&&!played.has(sig({author:x.artist.name,title:x.name})));
      if(c)return `${c.artist.name} ${c.name}`;
    }catch{}
  }
  const rows=await many<any>(`SELECT title,author,COUNT(*)::int play_count,MAX(started_at) last_played FROM track_history WHERE guild_id=$1 GROUP BY title,author ORDER BY MAX(started_at) DESC LIMIT 200`,[guildId]);
  const c=rankMusicCandidates(rows,{seed,session,feedback,profile:'SIMILAR',avoidRecentlyPlayed:options.avoidRecentlyPlayed!==false})[0];if(c)return `${c.author} ${c.title}`;
  // Autoplay cold start: never require a Last.fm key or a populated guild history.
  // Try a public recording lookup, then a generic artist radio search supported by Lavalink.
  if(seed?.author&&seed.author.toLowerCase()!=='unknown'){
    try{
      const u=new URL('https://musicbrainz.org/ws/2/recording');
      u.search=new URLSearchParams({query:`artist:"${seed.author.replace(/["\\]/g,' ').slice(0,80)}"`,fmt:'json',limit:'25'}).toString();
      const cacheKey=`music:artist-discovery:${encodeURIComponent(seed.author.toLowerCase())}`;
      const cached=await redis.get(cacheKey).catch(()=>null);
      let recordings:any[]=cached?JSON.parse(cached):[];
      if(!recordings.length){const r=await fetch(u,{headers:{'User-Agent':'BOMMusic/1.0 (Discord guild jukebox)','Accept':'application/json'},signal:AbortSignal.timeout(2800)});
        if(r.ok){const data:any=await r.json();recordings=(data.recordings??[]).filter((x:any)=>x.title).slice(0,25);await redis.set(cacheKey,JSON.stringify(recordings),'EX',7200).catch(()=>{});}}
      const next=recordings.find((x:any)=>x.title&&!played.has(sig({author:seed.author,title:String(x.title)}))&&String(x.title).toLowerCase()!==seed.title.toLowerCase());if(next)return `${seed.author} ${next.title}`;
    }catch{}
    return `${seed.author} popular songs radio`;
  }
  return null;
}
