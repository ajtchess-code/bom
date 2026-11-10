import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {db,many,oneOrNone} from '@bom/db';
import sharp from 'sharp';
import {z} from 'zod';

const uuid=z.string().uuid();
const destination=z.object({scope:z.enum(['PERSONAL','GUILD']),folderId:uuid.nullable().default(null)});
const buildSchema=destination.extend({shipKey:z.string().min(1).max(200),title:z.string().trim().min(1).max(120),description:z.string().trim().max(4000).default(''),screenshot:z.string().max(12_000_000).optional(),revision:z.number().int().positive().optional()});
export function registerBuildLibrary(app:any,{guildId,requireMember,userId,catalogue}:any){
 let ready:Promise<any>|null=null;
 const ensure=()=>ready??=(readFile(new URL('../../../packages/db/migrations/120_build_library.sql',import.meta.url),'utf8').then(sql=>db.query(sql)).catch(error=>{ready=null;throw error;}));
 async function access(req:any,reply:any){const a=await requireMember(req,reply);if(!a?.member)return false;if(a.pbOnly||a.allianceOnly){reply.code(403).send({error:'guild_members_only'});return false;}await ensure();return true;}
 const visible=(row:any,uid:string)=>row&&(row.scope==='GUILD'||row.owner_id===uid);
 async function folder(b:any,uid:string){if(!b.folderId)return true;const row=await oneOrNone<any>('SELECT * FROM build_library_folders WHERE guild_id=$1 AND id=$2',[guildId,b.folderId]);return visible(row,uid)&&row.scope===b.scope&&(b.scope==='GUILD'||row.owner_id===uid);}
 const metadata='id,guild_id,owner_id,scope,folder_id,ship_key,ship_name,rate,title,description,revision,created_at,updated_at';
 // PB roster dropdown compatibility; only guild-shared builds can be assigned.
 app.get('/v1/wosb/builds',async(req:any,reply:any)=>{const a=await requireMember(req,reply);if(!a?.member)return;if(a.pbOnly||a.allianceOnly)return [];await ensure();return many(`SELECT id,title AS name,title,ship_key,ship_name,rate,TRUE AS is_pb_build,scope FROM build_library_entries WHERE guild_id=$1 AND scope='GUILD' ORDER BY title`,[guildId]);});
 app.get('/v1/wosb/build-library',async(req:any,reply:any)=>{if(!await access(req,reply))return;const uid=userId(req);const [folders,builds]=await Promise.all([many(`SELECT * FROM build_library_folders WHERE guild_id=$1 AND (scope='GUILD' OR owner_id=$2) ORDER BY name`,[guildId,uid]),many(`SELECT ${metadata} FROM build_library_entries WHERE guild_id=$1 AND (scope='GUILD' OR owner_id=$2) ORDER BY updated_at DESC`,[guildId,uid])]);return {folders,builds};});
 app.get('/v1/wosb/build-library/:id/image',async(req:any,reply:any)=>{if(!await access(req,reply))return;const id=uuid.parse(req.params.id),row=await oneOrNone<any>(`SELECT scope,owner_id,screenshot FROM build_library_entries WHERE guild_id=$1 AND id=$2`,[guildId,id]);if(!visible(row,userId(req)))return reply.code(404).send({error:'build_not_found'});return reply.header('cache-control','private, no-store').type('image/webp').send(row.screenshot);});
 app.post('/v1/wosb/build-library/folders',async(req:any,reply:any)=>{if(!await access(req,reply))return;const b=destination.extend({name:z.string().trim().min(1).max(80)}).parse(req.body),uid=userId(req);if(!await folder(b,uid))return reply.code(400).send({error:'invalid_parent_folder'});const id=randomUUID();await db.query(`INSERT INTO build_library_folders(id,guild_id,owner_id,scope,name,parent_id) VALUES($1,$2,$3,$4,$5,$6)`,[id,guildId,uid,b.scope,b.name,b.folderId]);return {ok:true,id};});
 app.put('/v1/wosb/build-library/folders/:id',async(req:any,reply:any)=>{if(!await access(req,reply))return;const id=uuid.parse(req.params.id),b=z.object({name:z.string().trim().min(1).max(80)}).parse(req.body);const result=await db.query('UPDATE build_library_folders SET name=$4 WHERE guild_id=$1 AND id=$2 AND owner_id=$3',[guildId,id,userId(req),b.name]);return result.rowCount?{ok:true}:reply.code(404).send({error:'folder_not_owned'});});
 app.delete('/v1/wosb/build-library/folders/:id',async(req:any,reply:any)=>{if(!await access(req,reply))return;try{const result=await db.query('DELETE FROM build_library_folders WHERE guild_id=$1 AND id=$2 AND owner_id=$3',[guildId,uuid.parse(req.params.id),userId(req)]);return result.rowCount?{ok:true}:reply.code(404).send({error:'folder_not_owned'});}catch(error:any){if(error.code==='23503')return reply.code(409).send({error:'Move builds and remove subfolders first.'});throw error;}});
 async function save(req:any,reply:any,editing:boolean){
  if(!await access(req,reply))return;const uid=userId(req),b=buildSchema.parse(req.body),id=editing?uuid.parse(req.params.id):randomUUID();
  const old=editing?await oneOrNone<any>('SELECT owner_id,revision FROM build_library_entries WHERE guild_id=$1 AND id=$2',[guildId,id]):null;
  if(editing&&old?.owner_id!==uid)return reply.code(404).send({error:'build_not_owned'});
  if(!await folder(b,uid))return reply.code(400).send({error:'invalid_destination_folder'});
  const cat=await catalogue(),ship=cat.ships.find((s:any)=>s.id===b.shipKey);if(!ship)return reply.code(400).send({error:'Choose a ship from the catalogue.'});
  let screenshot:Buffer|null=null;
  if(b.screenshot){const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(b.screenshot);if(!match)return reply.code(400).send({error:'Upload a PNG, JPEG or WebP screenshot.'});const bytes=Buffer.from(match[2],'base64');if(bytes.length>8*1024*1024)return reply.code(400).send({error:'Screenshot must be under 8 MB.'});try{screenshot=await sharp(bytes,{limitInputPixels:40_000_000}).rotate().resize({width:2560,height:2560,fit:'inside',withoutEnlargement:true}).webp({quality:90}).toBuffer();}catch{return reply.code(400).send({error:'Invalid screenshot image.'});}}
  if(!editing&&!screenshot)return reply.code(400).send({error:'Upload a build screenshot.'});
  if(editing){if(!b.revision)return reply.code(400).send({error:'Build revision required.'});const r=await db.query(`UPDATE build_library_entries SET scope=$4,folder_id=$5,ship_key=$6,ship_name=$7,rate=$8,title=$9,description=$10,screenshot=COALESCE($11,screenshot),revision=revision+1,updated_at=now() WHERE guild_id=$1 AND id=$2 AND owner_id=$3 AND revision=$12`,[guildId,id,uid,b.scope,b.folderId,ship.id,ship.name,Number(ship.rate??ship.level),b.title,b.description,screenshot,b.revision]);if(!r.rowCount)return reply.code(409).send({error:'Build changed. Reload before saving.'});}
  else await db.query(`INSERT INTO build_library_entries(id,guild_id,owner_id,scope,folder_id,ship_key,ship_name,rate,title,description,screenshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[id,guildId,uid,b.scope,b.folderId,ship.id,ship.name,Number(ship.rate??ship.level),b.title,b.description,screenshot]);
  return {ok:true,id};
 }
 app.post('/v1/wosb/build-library',{bodyLimit:12_100_000},(req:any,reply:any)=>save(req,reply,false));
 app.put('/v1/wosb/build-library/:id',{bodyLimit:12_100_000},(req:any,reply:any)=>save(req,reply,true));
 app.delete('/v1/wosb/build-library/:id',async(req:any,reply:any)=>{if(!await access(req,reply))return;const r=await db.query('DELETE FROM build_library_entries WHERE guild_id=$1 AND id=$2 AND owner_id=$3',[guildId,uuid.parse(req.params.id),userId(req)]);return r.rowCount?{ok:true}:reply.code(404).send({error:'build_not_owned'});});
}
