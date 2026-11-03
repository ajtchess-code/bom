import {discordRequest} from '@bom/redis';
import {ensureBattleMapDefaults} from './battleMapDefaults.js';
import {supportsPortTension,canonicalPortName,stablePortKey,allianceChartSvg,emptyDiplomacy,todayAttackPorts} from '@bom/shared';
import {mergeGuildCatalogue,guildReference,resolveCatalogueGuild} from '@bom/shared';
import {renderTerritoryMap} from '@bom/shared/dist/territoryImage.js';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {db,many,oneOrNone,pool} from '@bom/db';
import {effectiveProtectionUntil,portWindows,portWindowEnd,updatePortTaxes,portTaxes,territoryMapSummary,territoryProtection,territoryKey,isTraderPort,isFixedPort,portStatus,couldChange,couldChangeWithHistory,zonedParts,zonedInstant} from '@bom/shared';
import sharp from 'sharp';
const root=new URL('../../../',import.meta.url);
const parse=(v:any,f:any)=>{if(typeof v==='string'){try{return JSON.parse(v);}catch{return f;}}return v??f;};
const esc=(v:any)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
let ready:Promise<any>|null=null;
async function ensure(){if(!ready)ready=(async()=>{for(const name of ['041_territory_management.sql','042_territory_edit_links.sql','043_territory_multiple_taxes.sql'])await db.query(await readFile(new URL('packages/db/migrations/'+name,root),'utf8'));})().catch(e=>{ready=null;throw e;});await ready;}
async function discord(path:string,method='GET',body?:any){const r=await discordRequest(`https://discord.com/api/v10/${path}`,{method,headers:{authorization:`Bot ${process.env.DISCORD_BOT_TOKEN}`,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});if(!r.ok&&!(method==='DELETE'&&r.status===404))throw new Error(`Discord ${r.status}`);return r.status===204||r.status===404?{}:r.json();}
/** These routes apply service/token authorization in their own handlers. The API-wide internal token hook still runs. */
export function territoryDelegatedAuth(req:any){
 const path=String(req.url??'').split('?')[0];
 return req.method==='GET'&&path==='/v1/wosb/territory/desk-image'
  ||req.method==='GET'&&path==='/v1/wosb/territory/edit'
  ||req.method==='POST'&&path==='/v1/wosb/territory/edit/close'
  ||req.method==='PUT'&&/^\/v1\/wosb\/territory\/ports\/[a-z0-9]+$/.test(path)&&Boolean(req.headers?.['x-map-edit-token']);
}
export function registerTerritoryRoutes(app:any,opts:any){
 const {guildId,requireMember,pbManager,userId,wikiRows}=opts;
 async function editLink(req:any,reply:any){
  await ensure();const token=String(req.headers['x-map-edit-token']??'');
  if(!/^[a-f0-9]{64}$/.test(token)){reply.code(401).send({error:'Temporary map link is invalid or expired. Request a new link in Discord.'});return null;}
  const link=await oneOrNone<any>('SELECT user_id,expires_at FROM wosb_territory_edit_links WHERE token_hash=$1 AND guild_id=$2 AND expires_at>NOW()',[createHash('sha256').update(token).digest('hex'),guildId]);
  if(!link){reply.code(410).send({error:'Temporary map link expired. Request a new link in Discord.'});return null;}
  req.territoryEditor=link.user_id;return link;
 }
 const editorId=(req:any)=>req.territoryEditor??userId(req);
 app.get('/v1/wosb/territory/ports/:key/dossier',async(req:any,reply:any)=>{
  if(!await pbManager(req,reply))return;await ensure();const key=String(req.params.key),port=await oneOrNone<any>('SELECT * FROM wosb_territories WHERE guild_id=$1 AND port_key=$2',[guildId,key]);if(!port)return reply.code(404).send({error:'port_not_found'});
  const [strategy,events,battles,sessions]=await Promise.all([
   oneOrNone<any>('SELECT * FROM port_strategy_notes WHERE guild_id=$1 AND port_key=$2',[guildId,key]),
   many<any>('SELECT * FROM wosb_territory_events WHERE guild_id=$1 AND port_key=$2 ORDER BY created_at DESC LIMIT 200',[guildId,key]),
   many<any>("SELECT id,port_name,starts_at,status,attacker,defender FROM pb_battles WHERE guild_id=$1 AND lower(port_name)=lower($2) AND status<>'DELETED' ORDER BY starts_at DESC NULLS LAST LIMIT 100",[guildId,port.name]),
   many<any>('SELECT id,kind,title,updated_at FROM prep_review_sessions WHERE guild_id=$1 AND lower(port_name)=lower($2) ORDER BY updated_at DESC LIMIT 100',[guildId,port.name])
  ]);const now=Date.now(),protectedUntil=effectiveProtectionUntil(port);const windows=portWindows(port,now,now+7*86400000).map(w=>({start:Math.max(w.start,now,protectedUntil),end:w.end})).filter(w=>w.start<w.end);return {port,strategy,events,battles,sessions,windows};
 });
 app.put('/v1/wosb/territory/ports/:key/strategy',async(req:any,reply:any)=>{
  if(!await pbManager(req,reply))return;const b=req.body??{},priority=String(b.priority??'NORMAL'),key=String(req.params.key);if(!['LOW','NORMAL','HIGH','CRITICAL'].includes(priority)||!Number.isInteger(b.version)||b.version<0)return reply.code(400).send({error:'invalid_strategy'});
  if(!await oneOrNone('SELECT 1 FROM wosb_territories WHERE guild_id=$1 AND port_key=$2',[guildId,key]))return reply.code(404).send({error:'port_not_found'});
  const result=await db.query(`INSERT INTO port_strategy_notes(guild_id,port_key,priority,notes,updated_by) SELECT $1,$2,$3,$4,$5 WHERE $6::int=0 ON CONFLICT(guild_id,port_key) DO NOTHING RETURNING version`,[guildId,key,priority,String(b.notes??'').slice(0,5000),userId(req),b.version]);
  if(!result.rowCount){const updated=await db.query(`UPDATE port_strategy_notes SET priority=$3,notes=$4,updated_by=$5,version=version+1,updated_at=now() WHERE guild_id=$1 AND port_key=$2 AND version=$6 RETURNING version`,[guildId,key,priority,String(b.notes??'').slice(0,5000),userId(req),b.version]);if(!updated.rowCount)return reply.code(409).send({error:'strategy_changed',message:'Another officer changed this dossier. Reload before saving.'});return {ok:true,version:updated.rows[0].version};}return {ok:true,version:result.rows[0].version};
 });
 app.post('/v1/wosb/territory/edit-links',async(req:any,reply:any)=>{
  if(!(await requireMember(req,reply))?.member)return;await ensure();
  const token=randomBytes(32).toString('hex'),expiresAt=new Date(Date.now()+30*60000).toISOString();
  await db.query('DELETE FROM wosb_territory_edit_links WHERE expires_at<=NOW() OR (guild_id=$1 AND user_id=$2)',[guildId,userId(req)]);
  await db.query('INSERT INTO wosb_territory_edit_links(token_hash,guild_id,user_id,expires_at) VALUES($1,$2,$3,$4)',[createHash('sha256').update(token).digest('hex'),guildId,userId(req),expiresAt]);
  const base=(process.env.PUBLIC_DASHBOARD_URL??process.env.DASHBOARD_PUBLIC_URL??'https://dashboard.bandofmisfits.org').replace(/\/$/,'');
  return {url:`${base}/map-update#${token}`,expiresAt};
 });
 app.get('/v1/wosb/territory/edit',async(req:any,reply:any)=>{const link=await editLink(req,reply);if(!link)return;const data=await bootstrap();return {...data,settings:undefined,expiresAt:link.expires_at,editorId:link.user_id};});
 app.post('/v1/wosb/territory/edit/close',async(req:any,reply:any)=>{if(!await editLink(req,reply))return;await db.query('DELETE FROM wosb_territory_edit_links WHERE token_hash=$1 AND guild_id=$2',[createHash('sha256').update(String(req.headers['x-map-edit-token'])).digest('hex'),guildId]);return {ok:true};});

 async function bootstrap(){await ensure();await ensureBattleMapDefaults(guildId);await db.query('INSERT INTO wosb_territory_settings(guild_id) VALUES($1) ON CONFLICT(guild_id) DO NOTHING',[guildId]);const [records,states,cfg,settings]=await Promise.all([wikiRows(['map_marker']),many<any>('SELECT t.*,n.priority AS strategic_priority FROM wosb_territories t LEFT JOIN port_strategy_notes n ON n.guild_id=t.guild_id AND n.port_key=t.port_key WHERE t.guild_id=$1',[guildId]),oneOrNone<any>('SELECT guild_catalog,game_time_offset_minutes FROM pb_discord_settings WHERE guild_id=$1',[guildId]),oneOrNone<any>('SELECT * FROM wosb_territory_settings WHERE guild_id=$1',[guildId])]);const seen=new Set();const ports=records.map((r:any)=>({entityKey:r.entity_key,name:r.name,...parse(r.data,{})})).filter((r:any)=>['port','city','pirate','bay','trade_port'].includes(String(r.type).toLowerCase())&&r.name&&Number.isFinite(Number(r.lat))&&Number.isFinite(Number(r.lng))).filter((r:any)=>{const key=stablePortKey(r.name);if(seen.has(key))return false;seen.add(key);return true;}).map((p:any)=>({...p,name:canonicalPortName(p.name),port_key:stablePortKey(p.name),...(isFixedPort(p.name)&&!isTraderPort(p.name)?{owner_tag:null}:{}),...(states.find(s=>s.port_key===stablePortKey(p.name))??{}),fixed:isFixedPort(p.name),trader:isTraderPort(p.name)}));return {ports,guilds:mergeGuildCatalogue(parse(await readFile(new URL('data/pb/guild-defaults.json',root),'utf8'),[]),parse(cfg?.guild_catalog,[])),gameTimeOffsetMinutes:Number(cfg?.game_time_offset_minutes??60),settings:settings??{channel_id:'',reviewer_ids:[]}};}
 app.get('/v1/wosb/territory',async(req:any,reply:any)=>{if(!(await requireMember(req,reply))?.member)return;const data=await bootstrap();return {...data,guilds:data.guilds.map((g:any)=>({id:g.id,reference:g.reference,aliases:g.aliases,tag:g.tag,name:g.name,faction:g.faction})),settings:undefined,sync:{lastSuccessfulUpdate:data.settings.last_sync_at??null,error:data.settings.last_sync_error??null}};});
 app.get('/v1/wosb/territory/settings',async(req:any,reply:any)=>{if(!await pbManager(req,reply))return;return (await bootstrap()).settings;});
 app.put('/v1/wosb/territory/settings',async(req:any,reply:any)=>{if(!await pbManager(req,reply))return;await ensure();const channel=String(req.body?.channelId??''),ids=req.body?.reviewerIds??[];if((channel&&!/^\d{15,22}$/.test(channel))||!Array.isArray(ids)||ids.length>20||ids.some(x=>!/^\d{15,22}$/.test(x)))return reply.code(400).send({error:'Valid Discord Channel And Reviewer IDs Required'});await db.query('INSERT INTO wosb_territory_settings(guild_id,channel_id,reviewer_ids) VALUES($1,$2,$3::jsonb) ON CONFLICT(guild_id) DO UPDATE SET channel_id=$2,reviewer_ids=$3::jsonb',[guildId,channel||null,JSON.stringify(ids)]);invalidateDesk();return {ok:true};});
 app.post('/v1/wosb/territory/guilds',async(req:any,reply:any)=>{if(!await pbManager(req,reply))return;const tag=String(req.body?.tag??'').trim();if(!tag||tag.length>20||/[<>\x00-\x1f]/.test(tag))return reply.code(400).send({error:'Enter A Valid Trade Guild Tag'});const data=await bootstrap();if(data.guilds.some((g:any)=>g.tag.toLowerCase()===tag.toLowerCase()))return reply.code(409).send({error:'Guild Already Exists. Set Its Faction In Fleet Configuration.'});await db.query(`INSERT INTO pb_discord_settings(guild_id,guild_catalog) VALUES($1,$2::jsonb) ON CONFLICT(guild_id) DO UPDATE SET guild_catalog=COALESCE(pb_discord_settings.guild_catalog,'[]'::jsonb)||$2::jsonb,updated_at=NOW()`,[guildId,JSON.stringify([{tag,name:tag,faction:'Traders'}])]);invalidateDesk();return {ok:true};});
 app.put('/v1/wosb/territory/ports/:key' ,async(req:any,reply:any)=>{
 if(req.headers['x-map-edit-token']){if(!await editLink(req,reply))return;}else if(!await pbManager(req,reply))return;const data=await bootstrap(),port=data.ports.find((p:any)=>p.port_key===req.params.key);if(!port)return reply.code(404).send({error:'Unknown Port'});
 const b=req.body??{};if(req.territoryEditor&&b.reviewId)return reply.code(403).send({error:'Review completion requires officer access'});const kind=String(b.action??'UPDATE'),tag=String(b.ownerTag??'').trim(),tax=String(b.taxingTag??'').trim();
 if(!['UPDATE','CAPTURE','TAX','LIBERATE'].includes(kind))return reply.code(400).send({error:'Invalid Action'});
 const guilds=data.guilds;const known=(t:string)=>!t||Boolean(resolveCatalogueGuild(guilds,t));if(!known(tag)||!known(tax)||Array.isArray(b.taxes)&&b.taxes.some((t:any)=>!known(String(t.tag??''))))return reply.code(400).send({error:'Choose A Guild From The Catalogue'});
 if(isFixedPort(port.name)&&kind!=='UPDATE')return reply.code(400).send({error:'This Port Cannot Be Captured, Taxed Or Liberated'});
 const trader=(t:string)=>!t||guilds.some((g:any)=>guildReference(g)===t&&/trad/i.test(String(g.faction??g.type??'')));
 if(isTraderPort(port.name)&&(!trader(tag)||tax||b.taxes?.length))return reply.code(400).send({error:'Trader Ports Require A Trade Guild'});
 if(isFixedPort(port.name)&&!isTraderPort(port.name)&&tag!==String(port.owner_tag??''))return reply.code(400).send({error:'Ownership Is Fixed For This Port'});
 if((kind==='CAPTURE'&&!tag)||(kind==='TAX'&&!tax&&!b.taxes?.length))return reply.code(400).send({error:'Select The Capturing Or Taxing Guild'});
 const start=String(b.windowStart??''),end=portWindowEnd(start),time=/^([01]\d|2[0-3]):[0-5]\d$/;if(Boolean(start)!==Boolean(end)||(start&&(!time.test(start)||!time.test(end)||start===end)))return reply.code(400).send({error:'Enter A Valid Attack Window'});
 const zone=String(b.timeZone??port.time_zone??'America/Chicago');try{new Intl.DateTimeFormat('en',{timeZone:zone});}catch{return reply.code(400).send({error:'Invalid Time Zone'});}
 try{territoryProtection(null,b);if(b.taxes!==undefined)updatePortTaxes(null,b);}catch{return reply.code(400).send({error:'Invalid Protection Duration'});}
 const tension=b.tensionBattleAt===undefined?port.tension_battle_at??null:b.tensionBattleAt;
 if(tension!==null&&(!supportsPortTension(port.name)||!Number.isFinite(Date.parse(String(tension)))))return reply.code(400).send({error:'Pending battles are supported only for La Navidad and Everston; enter a valid date'});
 const actor=String(b.actorTag??'');if(kind==='LIBERATE'&&(!actor||!known(actor)))return reply.code(400).send({error:'Choose The Liberating Guild'});
 const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${guildId}:territory:${port.port_key}`]);const current=(await client.query('SELECT * FROM wosb_territories WHERE guild_id=$1 AND port_key=$2 FOR UPDATE',[guildId,port.port_key])).rows[0];if(Number(b.version??0)!==Number(current?.version??0)){await client.query('ROLLBACK');return reply.code(409).send({error:'This Port Changed. Reload Before Saving.'});}
 const now=Date.now(),bans=parse(current?.capture_bans,[]).filter((x:any)=>Date.parse(x.until)>now);if(tag&&tag!==current?.owner_tag&&bans.some((x:any)=>territoryKey(x.tag)===territoryKey(tag))){await client.query('ROLLBACK');return reply.code(409).send({error:'This Guild Is Still Under A Capture Ban'});}
 if(kind==='LIBERATE'&&current?.owner_tag)bans.push({tag:current.owner_tag,until:new Date(now+10*86400000).toISOString()});const owner=kind==='LIBERATE'?null:tag||null;
 let taxes:any[];try{taxes=updatePortTaxes(current,b,now);}catch(error:any){await client.query('ROLLBACK');return reply.code(400).send({error:error.message});}
 const firstTax=taxes[0]?.tag??null;
 // Port-level corrections are separate from the independent per-tax timers.
 const protection=territoryProtection(current,{...b,taxingTag:'',action:'UPDATE'},now),protectedUntil=protection.protected_until,protectedSince=protection.protection_started_at;
 const values=[guildId,port.port_key,port.name,owner,kind==='LIBERATE'?null:firstTax,start||null,end||null,zone,port.game_offset_minutes??data.gameTimeOffsetMinutes,protectedSince,protectedUntil,JSON.stringify(bans),editorId(req),JSON.stringify(taxes),tension];
 const row=(await client.query(`INSERT INTO wosb_territories(guild_id,port_key,name,owner_tag,taxing_tag,window_start,window_end,time_zone,game_offset_minutes,protection_started_at,protected_until,capture_bans,updated_by,taxes,tension_battle_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14::jsonb,$15) ON CONFLICT(guild_id,port_key) DO UPDATE SET owner_tag=$4,taxing_tag=$5,window_start=$6,window_end=$7,time_zone=$8,game_offset_minutes=$9,protection_started_at=$10,protected_until=$11,capture_bans=$12::jsonb,updated_by=$13,taxes=$14::jsonb,tension_battle_at=$15,name=excluded.name,updated_at=NOW(),version=wosb_territories.version+1 RETURNING *`,values)).rows[0];await client.query('INSERT INTO wosb_territory_events(id,guild_id,port_key,actor_id,kind,snapshot) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[randomUUID(),guildId,port.port_key,editorId(req),kind,JSON.stringify({before:current??null,after:row,actorTag:actor})]);if(b.reviewId){const r=await client.query('SELECT * FROM wosb_territory_reviews WHERE id=$1 AND guild_id=$2 AND expires_at>NOW() FOR UPDATE',[b.reviewId,guildId]);if(!r.rows[0]||!parse(r.rows[0].ports,[]).includes(port.port_key))throw new Error('Review Expired Or Port Not In Review');const done=[...new Set([...parse(r.rows[0].completed,[]),port.port_key])];await client.query('UPDATE wosb_territory_reviews SET completed=$1::jsonb WHERE id=$2',[JSON.stringify(done),b.reviewId]);}await client.query('COMMIT');invalidateDesk();return row;
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 });
 app.get('/v1/wosb/territory/ports/:key/history',async(req:any,reply:any)=>{
   if(!await pbManager(req,reply))return;
   const key=String(req.params.key);await ensure();
   return many<any>(`SELECT id,kind,actor_id,created_at,snapshot FROM wosb_territory_events WHERE guild_id=$1 AND port_key=$2 ORDER BY created_at DESC,id DESC LIMIT 30`,[guildId,key]);
 });
 app.post('/v1/wosb/territory/ports/:key/undo',async(req:any,reply:any)=>{
   if(!await pbManager(req,reply))return;await ensure();
   const key=String(req.params.key),expected=Number(req.body?.expectedVersion),eventId=String(req.body?.eventId??'');
   if(!Number.isSafeInteger(expected)||expected<0||!eventId)return reply.code(400).send({error:'expected_version_and_event_required'});
   const tx=await pool.connect();try{
     await tx.query('BEGIN');
     const current=(await tx.query('SELECT * FROM wosb_territories WHERE guild_id=$1 AND port_key=$2 FOR UPDATE',[guildId,key])).rows[0];
     if(Number(current?.version??0)!==expected){await tx.query('ROLLBACK');return reply.code(409).send({error:'territory_changed',message:'Reload the port and review its history before undoing.'});}
     const last=(await tx.query('SELECT id,snapshot FROM wosb_territory_events WHERE guild_id=$1 AND port_key=$2 ORDER BY created_at DESC,id DESC LIMIT 1',[guildId,key])).rows[0];
     if(!last||String(last.id)!==eventId){await tx.query('ROLLBACK');return reply.code(409).send({error:'history_changed',message:'Only the latest change may be undone.'});}
     const snapshot=parse(last.snapshot,{}),before=snapshot.before??null;
     if(before){
       await tx.query(`INSERT INTO wosb_territories(guild_id,port_key,name,owner_tag,taxing_tag,window_start,window_end,time_zone,game_offset_minutes,protection_started_at,protected_until,capture_bans,taxes,updated_by,version)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,1)
       ON CONFLICT(guild_id,port_key) DO UPDATE SET name=$3,owner_tag=$4,taxing_tag=$5,window_start=$6,window_end=$7,time_zone=$8,game_offset_minutes=$9,protection_started_at=$10,protected_until=$11,capture_bans=$12::jsonb,taxes=$13::jsonb,updated_by=$14,version=wosb_territories.version+1,updated_at=NOW()`,
       [guildId,key,before.name,before.owner_tag??null,before.taxing_tag??null,before.window_start??null,before.window_end??null,before.time_zone??'America/Chicago',before.game_offset_minutes??60,before.protection_started_at??null,before.protected_until??null,JSON.stringify(parse(before.capture_bans,[])),JSON.stringify(parse(before.taxes,[])),userId(req)]);
       await tx.query('UPDATE wosb_territories SET tension_battle_at=$3 WHERE guild_id=$1 AND port_key=$2',[guildId,key,before.tension_battle_at??null]);
     }else if(current)await tx.query('DELETE FROM wosb_territories WHERE guild_id=$1 AND port_key=$2',[guildId,key]);
     const after=(await tx.query('SELECT * FROM wosb_territories WHERE guild_id=$1 AND port_key=$2',[guildId,key])).rows[0]??null;
     await tx.query('INSERT INTO wosb_territory_events(id,guild_id,port_key,actor_id,kind,snapshot) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[randomUUID(),guildId,key,userId(req),'UNDO',JSON.stringify({before:current??null,after,undidEventId:last.id})]);
     await tx.query('COMMIT');invalidateDesk();return {ok:true,version:after?.version??0};
   }catch(err){await tx.query('ROLLBACK').catch(()=>{});throw err;}finally{tx.release();}
 });
 app.get('/v1/wosb/territory/reviews/:id',async(req:any,reply:any)=>{if(!await pbManager(req,reply))return;await ensure();const row=await oneOrNone<any>('SELECT * FROM wosb_territory_reviews WHERE id=$1 AND guild_id=$2 AND expires_at>NOW()',[req.params.id,guildId]);return row??reply.code(410).send({error:'Review Link Expired'});});
 // Protected by the API-wide internal-token hook; used by the controller, without a user identity.
 app.get('/v1/wosb/territory/desk-image',async(req:any,reply:any)=>{if(userId(req)&&!(await requireMember(req,reply))?.member)return;return deskResponse(req.query?.detail==='1');});
 app.get('/v1/wosb/territory/image',async(req:any,reply:any)=>{if(!(await requireMember(req,reply))?.member)return;return reply.type('image/png').header('cache-control','no-store').send(await render((await bootstrap()).ports));});
 // Cache costly image renders by input signature, share concurrent requests,
 // and invalidate endpoint data promptly after any dashboard territory edit.
 const render=renderTerritoryMap;
 type DeskImage={key:string;image:Buffer;summary:string;generatedAt:string;expiresAt:number};
 const deskCache=new Map<string,DeskImage>(),deskInFlight=new Map<string,Promise<DeskImage>>();
 let deskRevision=0;
 const invalidateDesk=()=>{deskRevision++;deskCache.clear();deskInFlight.clear();};
 async function cachedDeskImage(ports:any[]){
  const key=createHash('sha256').update(JSON.stringify(ports)).digest('hex'),cached=deskCache.get(key);
  if(cached&&cached.expiresAt>Date.now())return cached;
  if(deskInFlight.has(key))return deskInFlight.get(key)!;
  const revision=deskRevision;
  const work=(async()=>{const image=await render(ports),summary=territoryMapSummary(ports);const result={key,image,summary,generatedAt:new Date().toISOString(),expiresAt:Date.now()+35_000};
   if(revision===deskRevision){deskCache.delete(key);deskCache.set(key,result);while(deskCache.size>4)deskCache.delete(deskCache.keys().next().value!);}return result;
  })();deskInFlight.set(key,work);
  try{return await work;}finally{if(deskInFlight.get(key)===work)deskInFlight.delete(key);}
 }
 let diplomacyImageCache:{key:string;image:Buffer}|null=null;
 async function deskResponse(detailed=false){
  const data=await bootstrap(),now=Date.now();
  const diplomacy=await oneOrNone<any>('SELECT data,updated_at FROM wosb_diplomacy WHERE guild_id=$1',[guildId]);
  const graph=diplomacy?.data??emptyDiplomacy(),key=JSON.stringify([graph,data.guilds.map((g:any)=>({reference:g.reference,tag:g.tag,name:g.name}))]);
  if(diplomacyImageCache?.key!==key)diplomacyImageCache={key,image:await sharp(Buffer.from(allianceChartSvg(graph,data.guilds))).png().toBuffer()};
  const ports=detailed?data.ports:todayAttackPorts(data.ports,now);
  // Rounded image time cuts unnecessary rerenders; timestamps are always regenerated.
  const result=await cachedDeskImage(ports);
  return {image:result.image.toString('base64'),allianceImage:diplomacyImageCache!.image.toString('base64'),summary:territoryMapSummary(ports,now,3500,{guilds:data.guilds,diplomacy:graph,detailed}),generatedAt:result.generatedAt,diplomacyUpdatedAt:diplomacy?.updated_at??null};
 }

 let running=false;
 async function tick(){if(running)return;running=true;let client:any;try{client=await pool.connect();const lock=await client.query('SELECT pg_try_advisory_lock(hashtext($1)) locked',[`${guildId}:territory-worker`]);if(!lock.rows[0]?.locked)return;await ensure();const data=await bootstrap(),settings=data.settings;const desk=await oneOrNone<any>('SELECT member_console_channel_id FROM membership_settings WHERE guild_id=$1',[guildId]);const deskChannel=desk?.member_console_channel_id;const deliveryChannel=deskChannel||settings.channel_id;if(!deliveryChannel)return;const p=zonedParts(Date.now(),'America/Chicago'),day=`${p.year}-${p.month}-${p.day}`,title=`Battle Map - ${day}`;const deskData=await deskResponse(),image=Buffer.from(deskData.image,'base64'),allianceImage=Buffer.from(deskData.allianceImage,'base64'),hash=createHash('sha256').update(image).update(allianceImage).update(deskData.summary).update(day).digest('hex');if(deskChannel&&settings.map_message_id&&settings.channel_id){try{await discord(`channels/${settings.channel_id}/messages/${settings.map_message_id}`,'DELETE');await db.query('UPDATE wosb_territory_settings SET map_message_id=NULL,image_hash=NULL WHERE guild_id=$1',[guildId]);}catch(e){app.log.warn({err:e},'Legacy standalone map cleanup failed');}}if(!deskChannel&&hash!==settings.image_hash){
 const form=new FormData();form.set('payload_json',JSON.stringify({flags:32768,components:[{type:17,accent_color:0xd9aa3c,components:[{type:10,content:'## WoSB Battle Map & Diplomacy'},{type:10,content:deskData.summary},{type:12,items:[{media:{url:'attachment://battle-map.png'},description:'WoSB Battle Map — today'},{media:{url:'attachment://alliance-chart.png'},description:'WoSB Alliance Chart'}]},{type:1,components:[{type:2,style:2,label:'Detailed Battle Map',custom_id:'membership:map:detail'},{type:2,style:2,label:'Update Battle Map',custom_id:'membership:map:update'}]}]}],embeds:[],content:null,attachments:[{id:0,filename:'battle-map.png'},{id:1,filename:'alliance-chart.png'}],allowed_mentions:{parse:[]}}));
 form.set('files[0]',new Blob([new Uint8Array(image)],{type:'image/png'}),'battle-map.png');form.set('files[1]',new Blob([new Uint8Array(allianceImage)],{type:'image/png'}),'alliance-chart.png');
 const path=settings.map_message_id?`channels/${settings.channel_id}/messages/${settings.map_message_id}`:`channels/${settings.channel_id}/messages`;
 const response=await discordRequest(`https://discord.com/api/v10/${path}`,{method:settings.map_message_id?'PATCH':'POST',headers:{authorization:`Bot ${process.env.DISCORD_BOT_TOKEN}`},body:form,signal:AbortSignal.timeout(30000)});
 if(response.status===404&&settings.map_message_id){await db.query('UPDATE wosb_territory_settings SET map_message_id=NULL,image_hash=NULL WHERE guild_id=$1',[guildId]);return;}
 if(!response.ok)throw new Error(`Map Delivery ${response.status}`);const message:any=await response.json();await db.query('UPDATE wosb_territory_settings SET map_message_id=$2,image_hash=$3,last_sync_at=now(),last_sync_error=NULL WHERE guild_id=$1',[guildId,message.id,hash]);
 }

 if(+p.hour===23&&settings.last_review_date!==day){const from=zonedInstant(day,0,'America/Chicago'),to=zonedInstant(day,1440,'America/Chicago');const events=await many<any>('SELECT port_key,snapshot,created_at FROM wosb_territory_events WHERE guild_id=$1 AND created_at>=$2 AND created_at<$3 ORDER BY created_at',[guildId,new Date(from).toISOString(),new Date(to).toISOString()]);const keys=data.ports.filter((p:any)=>couldChangeWithHistory(p,events.filter(e=>e.port_key===p.port_key),from,to)).map((p:any)=>p.port_key);const id=randomUUID();await db.query('INSERT INTO wosb_territory_reviews(id,guild_id,review_date,ports,expires_at) VALUES($1,$2,$3,$4::jsonb,NOW()+INTERVAL \'48 hours\') ON CONFLICT(guild_id,review_date) DO NOTHING',[id,guildId,day,JSON.stringify(keys)]);const review=await oneOrNone<any>('SELECT id FROM wosb_territory_reviews WHERE guild_id=$1 AND review_date=$2',[guildId,day]);const link=`${process.env.PUBLIC_DASHBOARD_URL}/dashboard/port-battles/map-review/${review.id}`;const names=data.ports.filter((p:any)=>keys.includes(p.port_key)).map((p:any)=>p.name);const mentions=parse(settings.reviewer_ids,[]);await discord(`channels/${deliveryChannel}/messages`,'POST',{content:`${mentions.map((id:string)=>`<@${id}>`).join(' ')} Nightly Map Review: ${keys.length} Ports\n${link}`,embeds:[{title:`Map Review - ${day}`,description:(names.join(', ')||'No Ports Could Change Today.').slice(0,4000)}],allowed_mentions:{users:mentions,parse:[]}});await db.query('UPDATE wosb_territory_settings SET last_review_date=$2 WHERE guild_id=$1',[guildId,day]);}
 }catch(e:any){await db.query('UPDATE wosb_territory_settings SET last_sync_error=$2 WHERE guild_id=$1',[guildId,String(e.message??e).slice(0,500)]).catch(()=>{});app.log.error({err:e},'Territory Map Sync Failed');}finally{if(client){await client.query('SELECT pg_advisory_unlock(hashtext($1))',[`${guildId}:territory-worker`]).catch(()=>{});client.release();}running=false;}}
 const timer=setInterval(()=>void tick(),60000);timer.unref();app.addHook('onClose',async()=>clearInterval(timer));
}
