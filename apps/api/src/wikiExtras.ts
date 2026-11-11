// Wiki extras: New Player Guide reading progress, port battle port pages and
// "what changed" between game-data releases.
import {readFile,readdir,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {db,many} from '@bom/db';
import {GameWiki} from './gameWiki.js';
import {PREP_REVIEW_PORTS} from './prepReview.js';

type Gate=(req:any,reply:any)=>Promise<any>;
type Opts={guildId:string;requireMember:Gate;requireAdmin:Gate;userId:(req:any)=>string};

const slugOk=(s:string)=>/^[a-z0-9][a-z0-9:-]{0,119}$/.test(s);
const norm=(s:any)=>String(s??'').toLowerCase().replace(/[^a-z0-9]/g,'');

// ---- What changed between game-data releases --------------------------------

/** Tables players care about, with the column that identifies each row. */
const CHANGE_TABLES:[string,string][]=[['ShipsToPlay','Ships'],['Cannons','Guns'],['CannonBalls','Ammunition'],['ShipUpgradesNew','Upgrades'],['ShipDesingElements','Lanterns & designs'],['Crew_Special','Special crew'],['CaptainSkills','Captain skills'],['Resources','Resources'],['GuildBonuses','Guild bonuses']];
const SKIP=/^(row|images?|Icon|Sprite|Prefab|Model|Texture|Sound|.*Desc(ription)?|.*Text|.*Path)$/i;
const keyOf=(r:any,i:number)=>String(r.ID??r.Id??r.Key??r.ShipID??r.CannonID??r.Name??r.EnglishName??`#${i}`);
const nameOf=(r:any,k:string)=>String(r.EnglishName??r.Name??r.ID??k);
const scalar=(v:any)=>v===null||['string','number','boolean'].includes(typeof v);

export function diffRows(oldRows:any[],newRows:any[]){
  const before=new Map(oldRows.map((r,i)=>[keyOf(r,i),r])),after=new Map(newRows.map((r,i)=>[keyOf(r,i),r]));
  const added:any[]=[],removed:any[]=[],changed:any[]=[];
  for(const [k,r] of after){
    const o=before.get(k);
    if(!o){added.push({key:k,name:nameOf(r,k)});continue;}
    const fields:any[]=[];
    for(const f of new Set([...Object.keys(o),...Object.keys(r)])){
      if(SKIP.test(f)||!scalar(o[f]??null)||!scalar(r[f]??null))continue;
      const a=o[f]??null,b=r[f]??null;
      if(String(a)===String(b))continue;
      fields.push({field:f,before:a,after:b});
    }
    if(fields.length)changed.push({key:k,name:nameOf(r,k),fields:fields.slice(0,40)});
  }
  for(const [k,r] of before)if(!after.has(k))removed.push({key:k,name:nameOf(r,k)});
  return {added,removed,changed};
}

async function readJson(path:string){return JSON.parse((await readFile(path,'utf8')).replace(/^﻿/,''));}
async function releaseInfo(directory:string){const c=await readJson(join(directory,'catalog.json')).catch(()=>null);return c?{directory,release:c.release??null,asOf:c.asOf??null}:null;}

/** The active release and the one before it (recorded at install, or the newest other release on disk). */
async function releasePair(){
  const active=await readJson(resolve('data/wiki-active.json')).catch(()=>null);
  const current=await releaseInfo(resolve(process.env.WOSB_WIKI_DIR||active?.directory||'data/wiki-v2'));
  if(!current)return null;
  if(active?.previous?.directory){const p=await releaseInfo(resolve(active.previous.directory));if(p)return {current,previous:p};}
  const store=resolve(process.env.WOSB_WIKI_STORAGE||'data/wiki-releases');
  const dirs=await readdir(store).catch(()=>[] as string[]);
  const others:{info:any;mtime:number}[]=[];
  for(const d of dirs){const dir=join(store,d,'content');if(resolve(dir)===resolve(current.directory))continue;const info=await releaseInfo(dir);if(info)others.push({info,mtime:(await stat(join(dir,'catalog.json'))).mtimeMs});}
  others.sort((a,b)=>b.mtime-a.mtime);
  return {current,previous:others[0]?.info??null};
}

const changeCache=new Map<string,Promise<any>>();
async function buildChanges(current:any,previous:any){
  const a=new GameWiki(previous.directory),b=new GameWiki(current.directory),sections:any[]=[];
  for(const [table,label] of CHANGE_TABLES){
    const [oldRows,newRows]=await Promise.all([a.all(table).catch(()=>null),b.all(table).catch(()=>null)]);
    if(!oldRows||!newRows)continue;
    const d=diffRows(oldRows,newRows);
    if(d.added.length||d.removed.length||d.changed.length)sections.push({table,label,...d});
  }
  return {current:{release:current.release,asOf:current.asOf},previous:{release:previous.release,asOf:previous.asOf},sections};
}

export function registerWikiExtras(app:any,{guildId,requireMember,requireAdmin,userId}:Opts){
  const member=async(req:any,reply:any)=>Boolean((await requireMember(req,reply))?.member);

  // Reading progress.
  app.get('/v1/wiki/portal/progress',async(req:any,reply:any)=>{if(!await member(req,reply))return;const rows=await many<any>('SELECT slug,completed_at FROM wiki_reading_progress WHERE guild_id=$1 AND user_id=$2',[guildId,userId(req)]);return {done:rows.map(r=>r.slug)};});
  app.put('/v1/wiki/portal/progress/:slug',async(req:any,reply:any)=>{if(!await member(req,reply))return;const slug=String(req.params.slug);if(!slugOk(slug))return reply.code(400).send({error:'invalid_slug'});if(req.body?.done===false)await db.query('DELETE FROM wiki_reading_progress WHERE guild_id=$1 AND user_id=$2 AND slug=$3',[guildId,userId(req),slug]);else await db.query('INSERT INTO wiki_reading_progress(guild_id,user_id,slug) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[guildId,userId(req),slug]);return {ok:true};});
  app.get('/v1/wiki/portal/admin/progress',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;const rows=await many<any>(`SELECT p.user_id,p.slug,p.completed_at,COALESCE(m.captain_name,m.display_name,m.username,p.user_id) AS name FROM wiki_reading_progress p LEFT JOIN member_profiles m ON m.guild_id=p.guild_id AND m.user_id=p.user_id WHERE p.guild_id=$1 ORDER BY name,p.completed_at`,[guildId]);const by=new Map<string,any>();for(const r of rows){const m=by.get(r.user_id)??{userId:r.user_id,name:r.name,done:[] as string[],last:null as any};m.done.push(r.slug);if(!m.last||+new Date(r.completed_at)>+new Date(m.last))m.last=r.completed_at;by.set(r.user_id,m);}return {members:[...by.values()]};});

  // Port battle port pages.
  app.get('/v1/wiki/portal/ports',async(req:any,reply:any)=>{if(!await member(req,reply))return;const counts=await many<any>(`SELECT lower(port_name) AS port,count(*)::int AS battles,max(starts_at) AS last FROM pb_battles WHERE guild_id=$1 GROUP BY lower(port_name)`,[guildId]).catch(()=>[]);const by=new Map(counts.map((c:any)=>[norm(c.port),c]));return {ports:PREP_REVIEW_PORTS.map(p=>({...p,mapUrl:p.mapFile?`/prep-review/maps/${p.mapFile}`:null,battles:by.get(norm(p.name))?.battles??0,lastBattle:by.get(norm(p.name))?.last??null}))};});
  app.get('/v1/wiki/portal/ports/:name',async(req:any,reply:any)=>{
    if(!await member(req,reply))return;
    const want=norm(req.params.name),port=PREP_REVIEW_PORTS.find(p=>norm(p.name)===want);
    if(!port)return reply.code(404).send({error:'port_not_found'});
    const [battles,plans]=await Promise.all([
      many<any>(`SELECT b.id,b.port_name,b.rate,b.team_size,b.attacker,b.defender,b.starts_at,b.status,r.result,r.notes FROM pb_battles b LEFT JOIN pb_battle_reviews r ON r.battle_id=b.id WHERE b.guild_id=$1 AND regexp_replace(lower(b.port_name),'[^a-z0-9]','','g')=$2 ORDER BY b.starts_at DESC NULLS LAST LIMIT 30`,[guildId,want]).catch(()=>[]),
      many<any>(`SELECT id,kind,title,updated_at FROM prep_review_sessions WHERE guild_id=$1 AND regexp_replace(lower(port_name),'[^a-z0-9]','','g')=$2 ORDER BY updated_at DESC LIMIT 20`,[guildId,want]).catch(()=>[]),
    ]);
    const record={wins:0,losses:0,draws:0};for(const b of battles){if(b.result==='WIN')record.wins++;else if(b.result==='LOSS')record.losses++;else if(b.result==='DRAW')record.draws++;}
    return {port:{...port,mapUrl:port.mapFile?`/prep-review/maps/${port.mapFile}`:null},battles,plans,record};
  });

  // What changed in the latest game-data update.
  app.get('/v1/game-wiki/changes',async(req:any,reply:any)=>{
    if(!await member(req,reply))return;
    const pair=await releasePair();
    if(!pair?.current)return reply.code(503).send({error:'wiki_not_installed',message:'No game data is installed yet.'});
    if(!pair.previous)return {current:{release:pair.current.release,asOf:pair.current.asOf},previous:null,sections:[]};
    const key=`${pair.previous.directory}|${pair.current.directory}`;
    let job=changeCache.get(key);
    if(!job){job=buildChanges(pair.current,pair.previous);changeCache.set(key,job);job.catch(()=>changeCache.delete(key));}
    return job;
  });
}

