const key=(r:any)=>`${r.author}|${r.title}`.toLowerCase().trim();
export function rankMusicCandidates(rows:any[],opts:{seed?:{title:string;author:string};session?:any[];feedback?:any[];moodTerms?:string[];profile?:string;avoidRecentlyPlayed?:boolean;now?:number}={}){
 const played=new Set((opts.session??[]).map(key));if(opts.seed)played.add(key(opts.seed));const scores=new Map<string,number>();for(const f of opts.feedback??[])scores.set(key(f),(scores.get(key(f))??0)+Number(f.rating??0));
 const now=opts.now??Date.now(),profile=opts.profile??'SIMILAR';
 return rows.filter(r=>!played.has(key(r))&&(scores.get(key(r))??0)>=0&&(!opts.avoidRecentlyPlayed||!r.last_played||now-new Date(r.last_played).getTime()>6*3600000)).map(r=>{
  const author=String(r.author??'').toLowerCase(),seed=String(opts.seed?.author??'').toLowerCase(),same=Boolean(seed&&author===seed),feedback=scores.get(key(r))??0,count=Number(r.play_count??1);
  const tags=Array.isArray(r.tags)?r.tags:[],haystack=[r.title,r.author,...tags].join(' ').toLowerCase();const mood=(opts.moodTerms??[]).reduce((n,t)=>n+(haystack.includes(t.toLowerCase())?1:0),0);
  let score=(same?profile==='SAME_ARTIST'?120:32:0)+feedback*18+mood*15;
  if(profile!=='SAME_ARTIST')score-=(opts.session??[]).slice(-5).filter(x=>String(x.author??'').toLowerCase()===author).length*25;
  if(profile==='FAMILIAR'||profile==='BOM_RADIO')score+=Math.min(30,count*3);
  if(profile==='DISCOVERY'||profile==='DEEP_CUTS')score+=40/Math.max(1,count);
  if(profile==='PARTY')score+=mood*10+feedback*8;
  return {...r,recommendationScore:score};
 }).sort((a,b)=>b.recommendationScore-a.recommendationScore||String(a.last_played??'').localeCompare(String(b.last_played??''))||key(a).localeCompare(key(b)));
}
