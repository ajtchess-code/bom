import {randomUUID} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {db,many,oneOrNone} from "@bom/db";

const here=dirname(fileURLToPath(import.meta.url));
const migrationPath=join(here,"../../../packages/db/migrations/013_feedback_center.sql");
const experienceMigrationPath=join(here,"../../../packages/db/migrations/014_dashboard_experience.sql");
const polishMigrationPath=join(here,"../../../packages/db/migrations/015_dashboard_polish.sql");
const releaseDir=join(here,"../../../data/releases");
let ready:Promise<void>|null=null;

const json=(v:any,f:any)=>{if(v==null)return f;if(typeof v==='string')try{return JSON.parse(v);}catch{return f;}return v;};
const clean=(v:any,max=8000)=>String(v??'').replace(/\0/g,'').trim().slice(0,max);
const statusValues=new Set(['NEW','NEEDS_INFO','TRIAGED','CONFIRMED','UNDER_REVIEW','PLANNED','IN_PROGRESS','TESTING','SHIPPED','DUPLICATE','CANNOT_REPRODUCE','DECLINED','CLOSED']);
const priorityValues=new Set(['LOW','NORMAL','HIGH','URGENT']);
const severityValues=new Set(['COSMETIC','LOW','MEDIUM','HIGH','CRITICAL']);
const typeValues=new Set(['BUG','SUGGESTION','FEEDBACK']);
const visibilityValues=new Set(['PUBLIC','STAFF']);

export async function ensureFeedbackCenter(){
  if(!ready)ready=(async()=>{await db.query(await readFile(migrationPath,'utf8'));await db.query(await readFile(experienceMigrationPath,'utf8'));await db.query(await readFile(polishMigrationPath,'utf8'));})();
  return ready;
}

async function importReleaseManifests(guildId:string){
  await ensureFeedbackCenter();
  let names:string[]=[];try{names=(await readdir(releaseDir)).filter((n:string)=>n.endsWith('.json')).sort();}catch{return;}
  for(const name of names){
    try{
      const m=json(await readFile(join(releaseDir,name),'utf8'),{}),version=clean(m.version,80),title=clean(m.title,180);
      if(!version||!title)continue;
      await db.query(`INSERT INTO feedback_releases(id,guild_id,version,title,summary,sections,source,released_at,created_by)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,'MANIFEST',$7,'release-manifest')
        ON CONFLICT(guild_id,version) DO UPDATE SET title=EXCLUDED.title,summary=EXCLUDED.summary,sections=EXCLUDED.sections,source='MANIFEST',released_at=EXCLUDED.released_at,updated_at=CURRENT_TIMESTAMP`,
        [randomUUID(),guildId,version,title,clean(m.summary,6000),JSON.stringify(Array.isArray(m.sections)?m.sections:[]),m.releasedAt?new Date(m.releasedAt):new Date()]);
    }catch(err){console.warn('[feedback] release manifest import failed',name,err);}
  }
}

export async function bootstrapFeedbackCenter(guildId:string){await ensureFeedbackCenter();await importReleaseManifests(guildId);}

function prefix(type:string){return type==='BUG'?'BUG':type==='SUGGESTION'?'IDEA':'FB';}
function publicKey(row:any){return `${prefix(String(row.type))}-${String(row.reference_no??0).padStart(4,'0')}`;}
function view(row:any){return {...row,key:publicKey(row),details:json(row.details,undefined),diagnostics:json(row.diagnostics,undefined),sections:json(row.sections,undefined),supporters:Number(row.supporters??0),affected:Number(row.affected??0),comments:Number(row.comments??0),reports:Number(row.reports??0)};}

const stop=new Set('a an the and or but to of for in on at is it this that with from my our your be as can could should would when where how i we you'.split(' '));
function tokens(v:any){return new Set(clean(v,12000).toLowerCase().normalize('NFKD').replace(/\p{M}/gu,'').replace(/[^\p{L}\p{N}]+/gu,' ').split(/\s+/).filter(x=>x.length>2&&!stop.has(x)));}
function similarity(a:any,b:any){const A=tokens(a),B=tokens(b);if(!A.size||!B.size)return 0;let hit=0;for(const x of A)if(B.has(x))hit++;const union=new Set([...A,...B]).size;return union?hit/union:0;}
async function possibleDuplicates(guildId:string,type:string,title:string,description:string,publicOnly=false){
  const rows=await many<any>(`SELECT id,reference_no,type,title,description,category,status,visibility,updated_at FROM feedback_items WHERE guild_id=$1 AND type=$2 AND status NOT IN ('DUPLICATE','CLOSED','DECLINED','SHIPPED') ${publicOnly?"AND visibility='PUBLIC'":''} ORDER BY updated_at DESC LIMIT 120`,[guildId,type]);
  return rows.map((r:any)=>({...view(r),score:Math.max(similarity(title,r.title),similarity(`${title} ${description}`,`${r.title} ${r.description}`))})).filter((r:any)=>r.score>=.28).sort((a:any,b:any)=>b.score-a.score).slice(0,5);
}

async function listItems(guildId:string,where:string,params:any[]){
  const rows=await many<any>(`SELECT i.*,
    (SELECT COUNT(*) FROM feedback_submissions s WHERE s.item_id=i.id)::int reports,
    (SELECT COUNT(*) FROM feedback_reactions r WHERE r.item_id=i.id AND r.kind='SUPPORT')::int supporters,
    (SELECT COUNT(*) FROM feedback_reactions r WHERE r.item_id=i.id AND r.kind='AFFECTED')::int affected,
    (SELECT COUNT(*) FROM feedback_comments c WHERE c.item_id=i.id AND c.internal=FALSE)::int comments
    FROM feedback_items i WHERE i.guild_id=$1 ${where} ORDER BY i.updated_at DESC LIMIT 500`,[guildId,...params]);
  return rows.map(view);
}

async function queueStatusNotifications(guildId:string,item:any,actorId:string){
  const participants=await many<any>(`SELECT DISTINCT user_id FROM (
    SELECT user_id FROM feedback_submissions WHERE item_id=$1
    UNION SELECT user_id FROM feedback_reactions WHERE item_id=$1
    UNION SELECT user_id FROM feedback_comments WHERE item_id=$1 AND internal=FALSE
    UNION SELECT created_by AS user_id FROM feedback_items WHERE id=$1
  ) x WHERE user_id IS NOT NULL AND user_id<>$2`,[item.id,actorId]);
  for(const p of participants)await db.query(`INSERT INTO feedback_notifications(id,guild_id,recipient_id,item_id,kind,payload) VALUES($1,$2,$3,$4,'STATUS_CHANGED',$5::jsonb)`,[randomUUID(),guildId,String(p.user_id),item.id,JSON.stringify({key:publicKey(item),title:item.title,status:item.status})]);
}



function humanKind(v:any){return String(v??'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());}
function dashboardLabelFromPath(path:string){
  const cleanPath=String(path??'').split('?')[0];
  const names:Record<string,string>={
    '/dashboard':'Dashboard','/dashboard/music':'Music','/dashboard/port-battles':'Port Battles','/dashboard/ship-builder':'Build Library','/dashboard/ships':'Ships','/dashboard/map':'Map','/dashboard/wiki':'Wiki','/dashboard/prep-review':'Prep & Review','/dashboard/feedback':'Feedback','/dashboard/sentinel':'Sentinel','/dashboard/admin':'Administration'
  };
  if(names[cleanPath])return names[cleanPath];
  const last=decodeURIComponent(cleanPath.split('/').filter(Boolean).at(-1)??'Dashboard').replace(/[-_]+/g,' ');
  return last.replace(/\b\w/g,c=>c.toUpperCase());
}

async function dashboardExperience(guildId:string,uid:string){
  await ensureFeedbackCenter();
  const [prefRow,favorites,recents,reads,feedbackNotes,releases,pbs]=await Promise.all([
    oneOrNone<any>(`SELECT preferences FROM dashboard_user_preferences WHERE guild_id=$1 AND user_id=$2`,[guildId,uid]),
    many<any>(`SELECT kind,item_key,label,href,metadata,created_at FROM dashboard_favorites WHERE guild_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 50`,[guildId,uid]),
    many<any>(`SELECT kind,item_key,label,href,metadata,view_count,last_viewed_at FROM dashboard_recents WHERE guild_id=$1 AND user_id=$2 ORDER BY last_viewed_at DESC LIMIT 30`,[guildId,uid]),
    many<any>(`SELECT notification_key FROM dashboard_notification_reads WHERE guild_id=$1 AND user_id=$2`,[guildId,uid]),
    many<any>(`SELECT n.id,n.item_id,n.kind,n.payload,n.created_at,i.reference_no,i.type,i.title FROM feedback_notifications n LEFT JOIN feedback_items i ON i.id=n.item_id WHERE n.guild_id=$1 AND n.recipient_id=$2 ORDER BY n.created_at DESC LIMIT 40`,[guildId,uid]),
    many<any>(`SELECT id,version,title,summary,released_at FROM feedback_releases WHERE guild_id=$1 ORDER BY released_at DESC LIMIT 6`,[guildId]),
    many<any>(`SELECT b.id,b.port_name,b.starts_at,b.status,s.assignment_version,s.confirmed_ship,s.signup_status,s.horn_duty,s.formation,s.commander_duty FROM pb_battles b JOIN pb_signups s ON s.battle_id=b.id WHERE b.guild_id=$1 AND s.user_id=$2 AND b.status IN ('OPEN','CLOSED') AND (b.starts_at IS NULL OR b.starts_at>CURRENT_TIMESTAMP-INTERVAL '3 hours') ORDER BY b.starts_at NULLS LAST LIMIT 8`,[guildId,uid])
  ]);
  const read=new Set(reads.map((r:any)=>String(r.notification_key)));
  const notes:any[]=[];
  for(const n of feedbackNotes){const p=json(n.payload,{}),key=`feedback:${n.id}`;notes.push({key,kind:'feedback',category:'Feedback',severity:'info',actionLabel:'View feedback',title:p.title??n.title??'Feedback update',body:p.status?`Status changed to ${String(p.status).replaceAll('_',' ').toLowerCase()}.`:'Your feedback has an update.',href:'/dashboard/feedback',createdAt:n.created_at,read:read.has(key)});}
  for(const r of releases){const key=`release:${r.id}`;notes.push({key,kind:'release',category:'Updates',severity:'info',actionLabel:'Read release notes',title:`${r.version} · ${r.title}`,body:r.summary||'A new BOM update is available.',href:'/dashboard/feedback?tab=releases',createdAt:r.released_at,read:read.has(key)});}
  for(const b of pbs){const key=`pb:${b.id}:${b.assignment_version}`;const duty=[b.confirmed_ship,b.formation,b.horn_duty,b.commander_duty].filter(Boolean).join(' · ');notes.push({key,kind:'battle',category:'Port Battles',severity:duty?'attention':'info',actionLabel:duty?'Review assignment':'Open battle',title:`Battle of ${b.port_name}`,body:duty?`Your assignment: ${duty}`:`You are signed up as ${String(b.signup_status??'ATTENDING').toLowerCase()}.`,href:'/dashboard/port-battles',createdAt:b.starts_at??new Date(),read:read.has(key)});}
  notes.sort((a,b)=>+new Date(b.createdAt)-+new Date(a.createdAt));
  return {preferences:json(prefRow?.preferences,{}),favorites:favorites.map((x:any)=>({...x,metadata:json(x.metadata,{})})),recents:recents.map((x:any)=>({...x,metadata:json(x.metadata,{})})),notifications:notes.slice(0,50),unread:notes.filter(n=>!n.read).length};
}

export function registerFeedbackRoutes(app:any,opts:{guildId:string;requireMember:(req:any,reply:any)=>Promise<any>;requireAdmin:(req:any,reply:any)=>Promise<any>;userId:(req:any)=>string;isAdmin:(userId:string)=>Promise<boolean>}){
  const {guildId,requireMember,requireAdmin,userId,isAdmin}=opts;

  app.get('/v1/feedback/experience',async(req:any,reply:any)=>{if(!(await requireMember(req,reply))?.member)return;return dashboardExperience(guildId,userId(req));});

  app.put('/v1/feedback/experience/preferences',async(req:any,reply:any)=>{if(!(await requireMember(req,reply))?.member)return;await ensureFeedbackCenter();const uid=userId(req),preferences=req.body?.preferences&&typeof req.body.preferences==='object'?req.body.preferences:{};await db.query(`INSERT INTO dashboard_user_preferences(guild_id,user_id,preferences,updated_at) VALUES($1,$2,$3::jsonb,CURRENT_TIMESTAMP) ON CONFLICT(guild_id,user_id) DO UPDATE SET preferences=EXCLUDED.preferences,updated_at=CURRENT_TIMESTAMP`,[guildId,uid,JSON.stringify(preferences)]);return {ok:true,preferences};});

  app.post('/v1/feedback/experience/recent',async(req:any,reply:any)=>{if(!(await requireMember(req,reply))?.member)return;await ensureFeedbackCenter();const uid=userId(req),b=req.body??{},href=clean(b.href,800);if(!href.startsWith('/dashboard'))return reply.code(400).send({error:'invalid_href'});const kind=clean(b.kind,40)||'page',itemKey=clean(b.key,300)||href,label=clean(b.label,180)||dashboardLabelFromPath(href),metadata=b.metadata&&typeof b.metadata==='object'?b.metadata:{};await db.query(`INSERT INTO dashboard_recents(guild_id,user_id,kind,item_key,label,href,metadata,view_count,last_viewed_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,1,CURRENT_TIMESTAMP) ON CONFLICT(guild_id,user_id,kind,item_key) DO UPDATE SET label=EXCLUDED.label,href=EXCLUDED.href,metadata=EXCLUDED.metadata,view_count=dashboard_recents.view_count+1,last_viewed_at=CURRENT_TIMESTAMP`,[guildId,uid,kind,itemKey,label,href,JSON.stringify(metadata)]);return {ok:true};});

  app.post('/v1/feedback/experience/favorite',async(req:any,reply:any)=>{if(!(await requireMember(req,reply))?.member)return;await ensureFeedbackCenter();const uid=userId(req),b=req.body??{},href=clean(b.href,800),kind=clean(b.kind,40)||'page',itemKey=clean(b.key,300)||href,label=clean(b.label,180)||dashboardLabelFromPath(href),metadata=b.metadata&&typeof b.metadata==='object'?b.metadata:{};if(!href.startsWith('/dashboard'))return reply.code(400).send({error:'invalid_href'});const existing=await oneOrNone<any>(`SELECT 1 FROM dashboard_favorites WHERE guild_id=$1 AND user_id=$2 AND kind=$3 AND item_key=$4`,[guildId,uid,kind,itemKey]);const active=b.active===undefined?!existing:Boolean(b.active);if(active)await db.query(`INSERT INTO dashboard_favorites(guild_id,user_id,kind,item_key,label,href,metadata) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(guild_id,user_id,kind,item_key) DO UPDATE SET label=EXCLUDED.label,href=EXCLUDED.href,metadata=EXCLUDED.metadata`,[guildId,uid,kind,itemKey,label,href,JSON.stringify(metadata)]);else await db.query(`DELETE FROM dashboard_favorites WHERE guild_id=$1 AND user_id=$2 AND kind=$3 AND item_key=$4`,[guildId,uid,kind,itemKey]);return {ok:true,active};});

  app.post('/v1/feedback/experience/notifications/read',async(req:any,reply:any)=>{if(!(await requireMember(req,reply))?.member)return;await ensureFeedbackCenter();const uid=userId(req),keys=Array.isArray(req.body?.keys)?req.body.keys.map((x:any)=>clean(x,300)).filter(Boolean):[];if(req.body?.all===true){const experience=await dashboardExperience(guildId,uid);for(const n of experience.notifications)keys.push(n.key);}for(const key of [...new Set(keys)])await db.query(`INSERT INTO dashboard_notification_reads(guild_id,user_id,notification_key,read_at) VALUES($1,$2,$3,CURRENT_TIMESTAMP) ON CONFLICT(guild_id,user_id,notification_key) DO UPDATE SET read_at=CURRENT_TIMESTAMP`,[guildId,uid,key]);return {ok:true};});


  app.post('/v1/feedback/experience/performance',async(req:any,reply:any)=>{
    if(!(await requireMember(req,reply))?.member)return;
    await ensureFeedbackCenter();
    const uid=userId(req),b=req.body??{},metric=clean(b.metric,24).toUpperCase(),route=clean(b.route,400),value=Number(b.value),rating=clean(b.rating,24)||null;
    if(!['NAVIGATION','LCP','CLS','INP'].includes(metric)||!route.startsWith('/dashboard')||!Number.isFinite(value)||value<0)return reply.code(400).send({error:'invalid_performance_sample'});
    const metadata=b.metadata&&typeof b.metadata==='object'?b.metadata:{};
    await db.query(`INSERT INTO dashboard_performance_samples(id,guild_id,user_id,route,metric,value,rating,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,[randomUUID(),guildId,uid,route,metric,value,rating,JSON.stringify(metadata)]);
    return {ok:true};
  });

  app.get('/v1/feedback/search',async(req:any,reply:any)=>{
    const response=await app.inject({method:'GET',url:'/v1/search?q='+encodeURIComponent(String(req.query?.q??'')),headers:{'x-internal-token':req.headers['x-internal-token'],'x-discord-user-id':userId(req)}});
    return reply.code(response.statusCode).type('application/json').send(response.body);
  });

  app.get('/v1/feedback/bootstrap',async(req:any,reply:any)=>{
    const access=await requireMember(req,reply);if(!access?.member)return;await ensureFeedbackCenter();const uid=userId(req),admin=await isAdmin(uid);
    const [items,mine,releases,settings,counts]=await Promise.all([
      listItems(guildId,admin?'':`AND i.visibility='PUBLIC'`,[]),
      listItems(guildId,`AND (i.created_by=$2 OR EXISTS(SELECT 1 FROM feedback_submissions s WHERE s.item_id=i.id AND s.user_id=$2))`,[uid]),
      many<any>(`SELECT * FROM feedback_releases WHERE guild_id=$1 ORDER BY released_at DESC LIMIT 100`,[guildId]),
      oneOrNone<any>(`SELECT * FROM feedback_settings WHERE guild_id=$1`,[guildId]),
      many<any>(`SELECT type,status,COUNT(*)::int count FROM feedback_items WHERE guild_id=$1 GROUP BY type,status`,[guildId])
    ]);
    return {admin,items,mine,releases:releases.map(view),settings:settings??{guild_id:guildId,enabled:true,auto_release_posts:true,comments_enabled:true,reactions_enabled:true},counts};
  });

  app.get('/v1/feedback/items/:id',async(req:any,reply:any)=>{
    if(!(await requireMember(req,reply))?.member)return;await ensureFeedbackCenter();const uid=userId(req),admin=await isAdmin(uid),id=String(req.params.id);
    const row=await oneOrNone<any>(`SELECT i.*,(SELECT COUNT(*) FROM feedback_submissions s WHERE s.item_id=i.id)::int reports,(SELECT COUNT(*) FROM feedback_reactions r WHERE r.item_id=i.id AND r.kind='SUPPORT')::int supporters,(SELECT COUNT(*) FROM feedback_reactions r WHERE r.item_id=i.id AND r.kind='AFFECTED')::int affected,(SELECT COUNT(*) FROM feedback_comments c WHERE c.item_id=i.id AND c.internal=FALSE)::int comments FROM feedback_items i WHERE i.guild_id=$1 AND i.id=$2`,[guildId,id]);
    if(!row)return reply.code(404).send({error:'feedback_not_found'});if(!admin&&row.visibility!=='PUBLIC'&&row.created_by!==uid){const own=await oneOrNone<any>(`SELECT 1 FROM feedback_submissions WHERE item_id=$1 AND user_id=$2 LIMIT 1`,[id,uid]);if(!own)return reply.code(403).send({error:'forbidden'});}
    const [comments,history,myReactions,submissions]=await Promise.all([
      many<any>(`SELECT * FROM feedback_comments WHERE item_id=$1 ${admin?'':`AND internal=FALSE`} ORDER BY created_at`,[id]),
      many<any>(`SELECT * FROM feedback_status_history WHERE item_id=$1 ORDER BY created_at DESC`,[id]),
      many<any>(`SELECT kind FROM feedback_reactions WHERE item_id=$1 AND user_id=$2`,[id,uid]),
      admin?many<any>(`SELECT * FROM feedback_submissions WHERE item_id=$1 ORDER BY created_at DESC`,[id]):many<any>(`SELECT * FROM feedback_submissions WHERE item_id=$1 AND user_id=$2 ORDER BY created_at DESC`,[id,uid])
    ]);
    const duplicates=(await possibleDuplicates(guildId,row.type,row.title,row.description,!admin)).filter((x:any)=>x.id!==id);
    return {item:view(row),comments,history,myReactions:myReactions.map((x:any)=>x.kind),submissions:submissions.map((x:any)=>view(x)),possibleDuplicates:duplicates};
  });

  app.post('/v1/feedback/items',async(req:any,reply:any)=>{
    if(!(await requireMember(req,reply))?.member)return;await ensureFeedbackCenter();const uid=userId(req),b=req.body??{},type=String(b.type??'').toUpperCase();
    if(!typeValues.has(type))return reply.code(400).send({error:'invalid_type'});const title=clean(b.title,180),description=clean(b.description,12000);if(title.length<4||description.length<8)return reply.code(400).send({error:'title_and_description_required'});
    const settings=await oneOrNone<any>(`SELECT * FROM feedback_settings WHERE guild_id=$1`,[guildId]);if(settings?.enabled===false)return reply.code(409).send({error:'feedback_disabled'});if(type==='BUG'&&settings?.bug_reports_enabled===false)return reply.code(409).send({error:'bug_reports_disabled'});if(type==='SUGGESTION'&&settings?.suggestions_enabled===false)return reply.code(409).send({error:'suggestions_disabled'});if(type==='FEEDBACK'&&settings?.general_feedback_enabled===false)return reply.code(409).send({error:'general_feedback_disabled'});
    const id=randomUUID(),category=clean(b.category,100)||'Other',visibility=(type==='FEEDBACK'||b.private===true)?'STAFF':'PUBLIC',severity=type==='BUG'&&severityValues.has(String(b.severity??'MEDIUM').toUpperCase())?String(b.severity??'MEDIUM').toUpperCase():null;
    await db.query(`INSERT INTO feedback_items(id,guild_id,type,title,description,category,status,visibility,severity,priority,created_by) VALUES($1,$2,$3,$4,$5,$6,'NEW',$7,$8,'NORMAL',$9)`,[id,guildId,type,title,description,category,visibility,severity,uid]);
    await db.query(`INSERT INTO feedback_submissions(id,item_id,guild_id,user_id,surface,details,diagnostics,source_url) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)`,[randomUUID(),id,guildId,uid,clean(b.surface,40)||'dashboard',JSON.stringify(b.details??{}),JSON.stringify(b.diagnostics??{}),clean(b.sourceUrl,1000)||null]);
    const row=await oneOrNone<any>(`SELECT * FROM feedback_items WHERE id=$1`,[id]);const matches=await possibleDuplicates(guildId,type,title,description,true);return reply.code(201).send({ok:true,item:view(row),possibleDuplicates:matches.filter((x:any)=>x.id!==id)});
  });

  app.post('/v1/feedback/items/:id/reaction',async(req:any,reply:any)=>{
    if(!(await requireMember(req,reply))?.member)return;await ensureFeedbackCenter();const uid=userId(req),id=String(req.params.id),item=await oneOrNone<any>(`SELECT * FROM feedback_items WHERE guild_id=$1 AND id=$2`,[guildId,id]);if(!item)return reply.code(404).send({error:'feedback_not_found'});if(item.visibility!=='PUBLIC'&&item.created_by!==uid)return reply.code(403).send({error:'forbidden'});const kind=item.type==='BUG'?'AFFECTED':'SUPPORT';const existing=await oneOrNone<any>(`SELECT 1 FROM feedback_reactions WHERE item_id=$1 AND user_id=$2 AND kind=$3`,[id,uid,kind]);if(existing)await db.query(`DELETE FROM feedback_reactions WHERE item_id=$1 AND user_id=$2 AND kind=$3`,[id,uid,kind]);else await db.query(`INSERT INTO feedback_reactions(item_id,guild_id,user_id,kind) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[id,guildId,uid,kind]);await db.query(`UPDATE feedback_items SET updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[id]);return {ok:true,active:!existing,kind};
  });

  app.post('/v1/feedback/items/:id/comments',async(req:any,reply:any)=>{
    if(!(await requireMember(req,reply))?.member)return;await ensureFeedbackCenter();const uid=userId(req),id=String(req.params.id),body=clean(req.body?.body,5000);if(body.length<1)return reply.code(400).send({error:'comment_required'});const admin=await isAdmin(uid),internal=Boolean(req.body?.internal)&&admin,item=await oneOrNone<any>(`SELECT * FROM feedback_items WHERE guild_id=$1 AND id=$2`,[guildId,id]);if(!item)return reply.code(404).send({error:'feedback_not_found'});if(!admin&&item.visibility!=='PUBLIC'&&item.created_by!==uid)return reply.code(403).send({error:'forbidden'});await db.query(`INSERT INTO feedback_comments(id,item_id,guild_id,user_id,body,internal) VALUES($1,$2,$3,$4,$5,$6)`,[randomUUID(),id,guildId,uid,body,internal]);await db.query(`UPDATE feedback_items SET updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[id]);return {ok:true};
  });

  app.patch('/v1/feedback/items/:id',async(req:any,reply:any)=>{
    if(!await requireAdmin(req,reply))return;await ensureFeedbackCenter();const actor=userId(req),id=String(req.params.id),old=await oneOrNone<any>(`SELECT * FROM feedback_items WHERE guild_id=$1 AND id=$2`,[guildId,id]);if(!old)return reply.code(404).send({error:'feedback_not_found'});const b=req.body??{};
    const status=statusValues.has(String(b.status??old.status).toUpperCase())?String(b.status??old.status).toUpperCase():old.status,priority=priorityValues.has(String(b.priority??old.priority).toUpperCase())?String(b.priority??old.priority).toUpperCase():old.priority,severity=b.severity===null?null:(severityValues.has(String(b.severity??old.severity??'').toUpperCase())?String(b.severity??old.severity).toUpperCase():old.severity),visibility=visibilityValues.has(String(b.visibility??old.visibility).toUpperCase())?String(b.visibility??old.visibility).toUpperCase():old.visibility,assigned=b.assignedTo===undefined?old.assigned_to:(clean(b.assignedTo,80)||null);
    await db.query(`UPDATE feedback_items SET status=$3,priority=$4,severity=$5,visibility=$6,assigned_to=$7,updated_at=CURRENT_TIMESTAMP,closed_at=CASE WHEN $3 IN ('SHIPPED','DECLINED','CLOSED','DUPLICATE') THEN COALESCE(closed_at,CURRENT_TIMESTAMP) ELSE NULL END WHERE guild_id=$1 AND id=$2`,[guildId,id,status,priority,severity,visibility,assigned]);
    if(status!==old.status){await db.query(`INSERT INTO feedback_status_history(id,item_id,guild_id,actor_id,old_status,new_status,note) VALUES($1,$2,$3,$4,$5,$6,$7)`,[randomUUID(),id,guildId,actor,old.status,status,clean(b.note,1000)||null]);const now={...old,status};await queueStatusNotifications(guildId,now,actor);}
    return {ok:true};
  });

  app.post('/v1/feedback/items/:id/merge',async(req:any,reply:any)=>{
    if(!await requireAdmin(req,reply))return;await ensureFeedbackCenter();const sourceId=String(req.params.id),targetId=String(req.body?.targetId??''),actor=userId(req);if(!targetId||targetId===sourceId)return reply.code(400).send({error:'invalid_target'});const [source,target]=await Promise.all([oneOrNone<any>(`SELECT * FROM feedback_items WHERE guild_id=$1 AND id=$2`,[guildId,sourceId]),oneOrNone<any>(`SELECT * FROM feedback_items WHERE guild_id=$1 AND id=$2`,[guildId,targetId])]);if(!source||!target)return reply.code(404).send({error:'feedback_not_found'});if(source.type!==target.type)return reply.code(409).send({error:'type_mismatch'});
    await db.query(`INSERT INTO feedback_reactions(item_id,guild_id,user_id,kind,created_at) SELECT $2,guild_id,user_id,kind,created_at FROM feedback_reactions WHERE item_id=$1 ON CONFLICT DO NOTHING`,[sourceId,targetId]);await db.query(`DELETE FROM feedback_reactions WHERE item_id=$1`,[sourceId]);await db.query(`UPDATE feedback_submissions SET item_id=$2 WHERE item_id=$1`,[sourceId,targetId]);await db.query(`UPDATE feedback_comments SET item_id=$2 WHERE item_id=$1`,[sourceId,targetId]);await db.query(`UPDATE feedback_items SET status='DUPLICATE',duplicate_of=$2,updated_at=CURRENT_TIMESTAMP,closed_at=CURRENT_TIMESTAMP WHERE id=$1`,[sourceId,targetId]);await db.query(`UPDATE feedback_items SET updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[targetId]);await db.query(`INSERT INTO feedback_status_history(id,item_id,guild_id,actor_id,old_status,new_status,note) VALUES($1,$2,$3,$4,$5,'DUPLICATE',$6)`,[randomUUID(),sourceId,guildId,actor,source.status,`Merged into ${publicKey(target)}`]);return {ok:true,target:view(target)};
  });

  app.get('/v1/feedback/releases',async(req:any,reply:any)=>{if(!(await requireMember(req,reply))?.member)return;await ensureFeedbackCenter();return (await many<any>(`SELECT * FROM feedback_releases WHERE guild_id=$1 ORDER BY released_at DESC`,[guildId])).map(view);});
  app.post('/v1/feedback/releases',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;await ensureFeedbackCenter();const b=req.body??{},version=clean(b.version,80),title=clean(b.title,180);if(!version||!title)return reply.code(400).send({error:'version_and_title_required'});const id=randomUUID();await db.query(`INSERT INTO feedback_releases(id,guild_id,version,title,summary,sections,source,released_at,created_by) VALUES($1,$2,$3,$4,$5,$6::jsonb,'MANUAL',$7,$8) ON CONFLICT(guild_id,version) DO UPDATE SET title=EXCLUDED.title,summary=EXCLUDED.summary,sections=EXCLUDED.sections,released_at=EXCLUDED.released_at,updated_at=CURRENT_TIMESTAMP`,[id,guildId,version,title,clean(b.summary,6000),JSON.stringify(Array.isArray(b.sections)?b.sections:[]),b.releasedAt?new Date(b.releasedAt):new Date(),userId(req)]);return {ok:true};});

  app.get('/v1/feedback/settings',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;await ensureFeedbackCenter();return await oneOrNone<any>(`SELECT * FROM feedback_settings WHERE guild_id=$1`,[guildId])??{guild_id:guildId,enabled:true,auto_release_posts:true};});
  app.put('/v1/feedback/settings',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;await ensureFeedbackCenter();const b=req.body??{};await db.query(`INSERT INTO feedback_settings(guild_id,feedback_channel_id,changelog_channel_id,enabled,bug_reports_enabled,suggestions_enabled,general_feedback_enabled,comments_enabled,reactions_enabled,auto_release_posts,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(guild_id) DO UPDATE SET feedback_channel_id=COALESCE(EXCLUDED.feedback_channel_id,feedback_settings.feedback_channel_id),changelog_channel_id=COALESCE(EXCLUDED.changelog_channel_id,feedback_settings.changelog_channel_id),enabled=EXCLUDED.enabled,bug_reports_enabled=EXCLUDED.bug_reports_enabled,suggestions_enabled=EXCLUDED.suggestions_enabled,general_feedback_enabled=EXCLUDED.general_feedback_enabled,comments_enabled=EXCLUDED.comments_enabled,reactions_enabled=EXCLUDED.reactions_enabled,auto_release_posts=EXCLUDED.auto_release_posts,updated_by=EXCLUDED.updated_by,updated_at=CURRENT_TIMESTAMP`,[guildId,clean(b.feedbackChannelId,80)||null,clean(b.changelogChannelId,80)||null,b.enabled!==false,b.bugReportsEnabled!==false,b.suggestionsEnabled!==false,b.generalFeedbackEnabled!==false,b.commentsEnabled!==false,b.reactionsEnabled!==false,b.autoReleasePosts!==false,userId(req)]);return {ok:true};});
}
