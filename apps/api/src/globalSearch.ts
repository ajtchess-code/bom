import {many} from '@bom/db';
import {hasDashboardAdminAccess} from './authz.js';
import {normalizeSearch,searchScore} from './searchRanking.js';
export function registerGlobalSearch(app:any,{guildId,requireMember,userId}:any){
 app.get('/v1/search',async(req:any,reply:any)=>{
  if(!(await requireMember(req,reply))?.member)return;
  const uid=userId(req),admin=await hasDashboardAdminAccess(uid),raw=String(req.query?.q??'').slice(0,120),kind=String(req.query?.kind??'').toLowerCase();
  const query=normalizeSearch(raw);if(query.length<2)return {results:[],unavailable:[]};
  const like='%'+query.replace(/[%_\\]/g,'')+'%',prefix=query.split(' ').filter(Boolean).map(w=>w+':*').join(' & ');
  const fuzzyLike='%'+query.split(' ').sort((a,b)=>b.length-a.length)[0].slice(0,3)+'%';
  const match=(expr:string,n:number,fuzzy=false)=>`(${expr} ILIKE $${n} OR to_tsvector('simple',${expr}) @@ to_tsquery('simple',$${n+1})${fuzzy?` OR ${expr} ILIKE $${n+2}`:''})`;
  const sources=[
   {kind:'Wiki',run:()=>many<any>(`SELECT slug AS key,title AS label,summary AS detail,'/dashboard/wiki/topic/'||slug AS href FROM wiki_articles WHERE guild_id=$1 AND status='PUBLISHED' AND ${match("coalesce(title,'')||' '||coalesce(summary,'')||' '||coalesce(content,'')",2)} ORDER BY updated_at DESC LIMIT 100`,[guildId,like,prefix])},
   {kind:'Build',run:()=>many<any>(`SELECT id::text AS key,title AS label,ship_name AS detail,'/dashboard/ship-builder?build='||id AS href FROM build_library_entries WHERE guild_id=$1 AND (owner_id=$2 OR scope='GUILD') AND ${match("title||' '||ship_name||' '||description",3,true)} ORDER BY updated_at DESC LIMIT 80`,[guildId,uid,like,prefix,fuzzyLike])},
   {kind:'Battle',run:()=>many<any>(`SELECT id::text AS key,'Battle of '||port_name AS label,status||' · '||coalesce(attacker,'')||' vs '||coalesce(defender,'') AS detail,'/dashboard/port-battles?battle='||id AS href FROM pb_battles WHERE guild_id=$1 AND status<>'DELETED' AND ${match("port_name||' '||coalesce(attacker,'')||' '||coalesce(defender,'')",2)} ORDER BY starts_at DESC NULLS LAST LIMIT 80`,[guildId,like,prefix])},
   {kind:'Member',run:()=>many<any>(`SELECT user_id AS key,coalesce(display_name,username,user_id) AS label,coalesce(captain_name,'') AS detail,'/dashboard/members?member='||user_id AS href FROM member_profiles WHERE guild_id=$1 AND ${match("coalesce(display_name,'')||' '||coalesce(username,'')||' '||coalesce(captain_name,'')||' '||user_id",2,true)} ORDER BY updated_at DESC LIMIT 80`,[guildId,like,prefix,fuzzyLike])},
   {kind:'Feedback',run:()=>many<any>(`SELECT id::text AS key,title AS label,status AS detail,'/dashboard/feedback?item='||id AS href FROM feedback_items WHERE guild_id=$1 AND (visibility='PUBLIC' OR created_by=$2 OR $3::boolean) AND ${match("title",4)} ORDER BY updated_at DESC LIMIT 80`,[guildId,uid,admin,like,prefix])},
   {kind:'Ship',run:()=>many<any>(`SELECT entity_key AS key,name AS label,'Ship reference' AS detail,'/dashboard/ships?ship='||entity_key AS href FROM wiki_records WHERE active=TRUE AND kind='ship' ORDER BY name LIMIT 500`,[])},
   {kind:'Port',run:()=>many<any>(`SELECT entity_key AS key,name AS label,kind AS detail,'/dashboard/map?marker='||entity_key AS href FROM wiki_records WHERE active=TRUE AND kind IN ('map_marker','trade_port','port_battle_port') ORDER BY name LIMIT 1000`,[])}
  ].filter(s=>!kind||s.kind.toLowerCase()===kind);
  const settled=await Promise.allSettled(sources.map(s=>s.run())),results:any[]=[],unavailable:string[]=[];
  settled.forEach((x,i)=>{if(x.status==='rejected'){unavailable.push(sources[i].kind);req.log.warn({err:x.reason,source:sources[i].kind},'Search source unavailable');return;}for(const row of x.value){const score=searchScore(query,row.label,row.detail);if(score>0||sources[i].kind==='Wiki')results.push({...row,kind:sources[i].kind,score:score||1});}});
  results.sort((a,b)=>b.score-a.score||a.label.localeCompare(b.label));return {results:results.slice(0,50),unavailable};
 });
}
