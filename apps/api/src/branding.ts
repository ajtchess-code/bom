import type { FastifyInstance } from "fastify";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { db, many, oneOrNone } from "@bom/db";
import { z } from "zod";

type Guard=(req:any,reply:any)=>Promise<boolean>;
type UserId=(req:any)=>string;
type BrandDefault={workerId:number;colorKey:string;colorHex:string;avatar:string;banner:string;roleIcon:string};

export const BRAND_DEFAULTS:BrandDefault[]=[
  {workerId:1,colorKey:"purple",colorHex:"#9B4DFF",avatar:"worker-1-avatar.png",banner:"worker-1-banner.png",roleIcon:"worker-1-role-icon.png"},
  {workerId:2,colorKey:"red",colorHex:"#ED4245",avatar:"worker-2-avatar.png",banner:"worker-2-banner.png",roleIcon:"worker-2-role-icon.png"},
  {workerId:3,colorKey:"orange",colorHex:"#F47B20",avatar:"worker-3-avatar.png",banner:"worker-3-banner.png",roleIcon:"worker-3-role-icon.png"},
  {workerId:4,colorKey:"yellow",colorHex:"#F1C40F",avatar:"worker-4-avatar.png",banner:"worker-4-banner.png",roleIcon:"worker-4-role-icon.png"},
  {workerId:5,colorKey:"green",colorHex:"#57F287",avatar:"worker-5-avatar.png",banner:"worker-5-banner.png",roleIcon:"worker-5-role-icon.png"},
  {workerId:6,colorKey:"blue",colorHex:"#3498DB",avatar:"worker-6-avatar.png",banner:"worker-6-banner.png",roleIcon:"worker-6-role-icon.png"},
  {workerId:7,colorKey:"white",colorHex:"#F2F3F5",avatar:"worker-7-avatar.png",banner:"worker-7-banner.png",roleIcon:"worker-7-role-icon.png"},
  {workerId:8,colorKey:"black",colorHex:"#232428",avatar:"worker-8-avatar.png",banner:"worker-8-banner.png",roleIcon:"worker-8-role-icon.png"}
];

function firstExisting(paths:(string|undefined)[]){for(const p of paths)if(p&&existsSync(p))return p;return paths.find(Boolean)!;}
const defaultsDir=()=>firstExisting([
  process.env.BRANDING_DEFAULT_DIR,
  path.resolve(process.cwd(),"../dashboard/public/branding/defaults"),
  path.resolve(process.cwd(),"apps/dashboard/public/branding/defaults"),
  "/home/container/apps/dashboard/public/branding/defaults"
]);
const dataDir=()=>process.env.BRANDING_DATA_DIR??firstExisting([
  "/home/container/data/branding",
  path.resolve(process.cwd(),"../../data/branding"),
  path.resolve(process.cwd(),"data/branding")
]);
const def=(id:number)=>BRAND_DEFAULTS.find(x=>x.workerId===id)!;
const token=(id:number)=>process.env[`WORKER_${id}_TOKEN`];
const botHeaders=(t:string)=>({Authorization:`Bot ${t}`,"Content-Type":"application/json"});

function hexToInt(hex:string){return Number.parseInt(hex.replace("#",""),16);}
function fileDataUri(buf:Buffer){return `data:image/png;base64,${buf.toString("base64")}`;}
function decodeDataUri(value:string,max:number){
  const m=value.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/i);
  if(!m)throw Object.assign(new Error("Only PNG image uploads are accepted."),{statusCode:400});
  const buf=Buffer.from(m[1],"base64");
  if(!buf.length||buf.length>max)throw Object.assign(new Error(`Image exceeds the ${Math.floor(max/1024/1024)||1} MB limit.`),{statusCode:413});
  return buf;
}

async function ensureRows(guildId:string){
  await db.query(`INSERT INTO guild_settings(guild_id) VALUES($1) ON CONFLICT DO NOTHING`,[guildId]);
  for(const d of BRAND_DEFAULTS){
    await db.query(`INSERT INTO worker_branding(guild_id,worker_id,color_key,color_hex,avatar_source,banner_source) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,[guildId,d.workerId,d.colorKey,d.colorHex,d.avatar,d.banner]);
  }
}

async function rows(guildId:string){await ensureRows(guildId);return many<any>(`SELECT * FROM worker_branding WHERE guild_id=$1 ORDER BY worker_id`,[guildId]);}
async function row(guildId:string,id:number){await ensureRows(guildId);return oneOrNone<any>(`SELECT * FROM worker_branding WHERE guild_id=$1 AND worker_id=$2`,[guildId,id]);}

function currentAssetPath(r:any,kind:"avatar"|"banner"|"roleIcon"){
  const d=def(Number(r.worker_id));
  if(kind==="avatar")return r.custom_avatar_path||path.join(defaultsDir(),d.avatar);
  if(kind==="banner")return r.custom_banner_path||path.join(defaultsDir(),d.banner);
  return r.custom_role_icon_path||path.join(defaultsDir(),d.roleIcon);
}

let discordWriteChain=Promise.resolve();let lastDiscordWriteAt=0;
async function discordJson(url:string,init:RequestInit){
  const method=String(init.method??"GET").toUpperCase(),isWrite=method!=="GET";
  const run=async()=>{
    if(isWrite){const wait=Math.max(0,325-(Date.now()-lastDiscordWriteAt));if(wait)await new Promise(r=>setTimeout(r,wait));lastDiscordWriteAt=Date.now();}
    let res=await fetch(url,init);if(res.status===429){const j:any=await res.clone().json().catch(()=>({}));const delay=Math.min(5000,Math.max(250,Number(j?.retry_after??1)*1000));await new Promise(r=>setTimeout(r,delay));res=await fetch(url,init);}const text=await res.text();let body:any=null;try{body=text?JSON.parse(text):null;}catch{body=text;}
    if(!res.ok)throw Object.assign(new Error(body?.message??`Discord API returned ${res.status}`),{statusCode:res.status,discord:body});return body;
  };
  if(!isWrite)return run();const next=discordWriteChain.then(run,run);discordWriteChain=next.then(()=>{},()=>{});return next;
}

async function ensureWorkerRole(guildId:string,workerId:number,userId:string,r:any,roleIcon:Buffer){
  const controller=process.env.DISCORD_BOT_TOKEN;if(!controller)throw new Error("DISCORD_BOT_TOKEN is not configured");
  const headers=botHeaders(controller);const roleName=`BOM Music Bot ${workerId}`;
  const roles=await discordJson(`https://discord.com/api/v10/guilds/${guildId}/roles`,{headers});
  let role=Array.isArray(roles)?roles.find((x:any)=>String(x.id)===String(r.role_id)&&!x.managed):null;
  if(!role)role=Array.isArray(roles)?roles.find((x:any)=>x.name===roleName&&!x.managed):null;
  const payload={name:roleName,color:hexToInt(r.color_hex),hoist:false,mentionable:false,icon:fileDataUri(roleIcon)};
  if(!role)role=await discordJson(`https://discord.com/api/v10/guilds/${guildId}/roles`,{method:"POST",headers,body:JSON.stringify(payload)});
  else role=await discordJson(`https://discord.com/api/v10/guilds/${guildId}/roles/${role.id}`,{method:"PATCH",headers,body:JSON.stringify(payload)});
  await discordJson(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${role.id}`,{method:"PUT",headers,body:""});
  await db.query(`UPDATE worker_branding SET role_id=$3 WHERE guild_id=$1 AND worker_id=$2`,[guildId,workerId,String(role.id)]);
  return role;
}

async function applyWorker(guildId:string,workerId:number){
  const r=await row(guildId,workerId);if(!r)throw new Error("Branding record not found");
  const t=token(workerId);if(!t)throw Object.assign(new Error(`WORKER_${workerId}_TOKEN is not configured`),{statusCode:409});
  const [avatar,banner,roleIcon]=await Promise.all([
    readFile(currentAssetPath(r,"avatar")),readFile(currentAssetPath(r,"banner")),readFile(currentAssetPath(r,"roleIcon"))
  ]);
  const signature=createHash("sha256").update(avatar).update(banner).update(roleIcon).update(String(r.color_hex)).digest("hex");
  const me=await discordJson("https://discord.com/api/v10/users/@me",{headers:botHeaders(t)});
  await discordJson("https://discord.com/api/v10/users/@me",{method:"PATCH",headers:botHeaders(t),body:JSON.stringify({avatar:fileDataUri(avatar)})});
  let bannerApplied=true,bannerWarning:string|null=null;
  try{await discordJson("https://discord.com/api/v10/users/@me",{method:"PATCH",headers:botHeaders(t),body:JSON.stringify({banner:fileDataUri(banner)})});}
  catch(err:any){bannerApplied=false;bannerWarning=err?.message??String(err);}
  const role=await ensureWorkerRole(guildId,workerId,String(me.id),r,roleIcon);
  await db.query(`UPDATE worker_branding SET applied_signature=$3,last_applied_at=CURRENT_TIMESTAMP WHERE guild_id=$1 AND worker_id=$2`,[guildId,workerId,signature]);
  return {ok:true,workerId,userId:String(me.id),roleId:String(role.id),avatarApplied:true,bannerApplied,bannerWarning,colorHex:r.color_hex,signature};
}

export async function bootstrapBrandingDefaults(guildId:string){
  await ensureRows(guildId);
  const pending=await many<any>(`SELECT * FROM worker_branding WHERE guild_id=$1 AND applied_signature IS NULL ORDER BY worker_id`,[guildId]);
  for(const r of pending){
    const id=Number(r.worker_id);
    try{
      const result=await applyWorker(guildId,id);
      console.log(`[branding] Worker ${id} default/current branding applied${result.bannerApplied?"":" (banner unsupported/rejected)"}.`);
    }catch(err:any){console.warn(`[branding] Worker ${id} automatic branding apply skipped: ${err?.message??String(err)}`);}
    await new Promise(resolve=>setTimeout(resolve,1500));
  }
}

export function registerBrandingRoutes(app:FastifyInstance,{guildId,requireAdmin,userId}:{guildId:string;requireAdmin:Guard;userId:UserId}){
  app.get("/v1/music/branding",async(req:any,reply)=>{
    if(!await requireAdmin(req,reply))return;
    const list=await rows(guildId);
    return list.map((r:any)=>({
      workerId:Number(r.worker_id),colorKey:r.color_key,colorHex:r.color_hex,roleId:r.role_id??null,
      isDefault:!r.custom_avatar_path&&!r.custom_banner_path&&!r.custom_role_icon_path&&String(r.color_hex).toUpperCase()===def(Number(r.worker_id)).colorHex,
      avatarUrl:`/api/internal/music/branding/${r.worker_id}/avatar`,bannerUrl:`/api/internal/music/branding/${r.worker_id}/banner`,
      defaultAvatarUrl:`/branding/defaults/worker-${r.worker_id}-avatar.png`,defaultBannerUrl:`/branding/defaults/worker-${r.worker_id}-banner.png`
    }));
  });

  app.get("/v1/music/branding/:workerId/:kind",async(req:any,reply)=>{
    if(!await requireAdmin(req,reply))return;
    const id=Number(req.params.workerId),kind=String(req.params.kind);if(!Number.isInteger(id)||id<1||id>8||!['avatar','banner','role-icon'].includes(kind))return reply.code(404).send({error:"not_found"});
    const r=await row(guildId,id);if(!r)return reply.code(404).send({error:"not_found"});
    const p=currentAssetPath(r,kind==='role-icon'?'roleIcon':kind as any);if(!existsSync(p))return reply.code(404).send({error:"asset_missing"});
    reply.header("Content-Type","image/png").header("Cache-Control","private, max-age=60");return reply.send(await readFile(p));
  });

  app.put("/v1/music/branding/:workerId",async(req:any,reply)=>{
    if(!await requireAdmin(req,reply))return;
    const id=Number(req.params.workerId);if(!Number.isInteger(id)||id<1||id>8)return reply.code(404).send({error:"not_found"});
    const body=z.object({colorHex:z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),avatarDataUrl:z.string().optional(),bannerDataUrl:z.string().optional(),roleIconDataUrl:z.string().optional()}).parse(req.body??{});
    const dir=path.join(dataDir(),`worker-${id}`);await mkdir(dir,{recursive:true});
    let avatarPath:string|null=null,bannerPath:string|null=null,roleIconPath:string|null=null;
    if(body.avatarDataUrl){avatarPath=path.join(dir,"avatar.png");await writeFile(avatarPath,decodeDataUri(body.avatarDataUrl,8*1024*1024));}
    if(body.bannerDataUrl){bannerPath=path.join(dir,"banner.png");await writeFile(bannerPath,decodeDataUri(body.bannerDataUrl,8*1024*1024));}
    if(body.roleIconDataUrl){roleIconPath=path.join(dir,"role-icon.png");await writeFile(roleIconPath,decodeDataUri(body.roleIconDataUrl,256*1024));}
    await ensureRows(guildId);
    await db.query(`UPDATE worker_branding SET color_hex=COALESCE($3,color_hex),custom_avatar_path=COALESCE($4,custom_avatar_path),custom_banner_path=COALESCE($5,custom_banner_path),custom_role_icon_path=COALESCE($6,custom_role_icon_path),applied_signature=NULL WHERE guild_id=$1 AND worker_id=$2`,[guildId,id,body.colorHex??null,avatarPath,bannerPath,roleIconPath]);
    await db.query(`INSERT INTO audit_log(guild_id,actor_id,action,details) VALUES($1,$2,'branding.update',$3)`,[guildId,userId(req),{workerId:id,colorHex:body.colorHex??null,avatar:Boolean(body.avatarDataUrl),banner:Boolean(body.bannerDataUrl)}]);
    return {ok:true};
  });

  app.post("/v1/music/branding/:workerId/reset",async(req:any,reply)=>{
    if(!await requireAdmin(req,reply))return;
    const id=Number(req.params.workerId),d=def(id);if(!d)return reply.code(404).send({error:"not_found"});
    await rm(path.join(dataDir(),`worker-${id}`),{recursive:true,force:true}).catch(()=>{});
    await ensureRows(guildId);
    await db.query(`UPDATE worker_branding SET color_key=$3,color_hex=$4,avatar_source=$5,banner_source=$6,custom_avatar_path=NULL,custom_banner_path=NULL,custom_role_icon_path=NULL,applied_signature=NULL WHERE guild_id=$1 AND worker_id=$2`,[guildId,id,d.colorKey,d.colorHex,d.avatar,d.banner]);
    await db.query(`INSERT INTO audit_log(guild_id,actor_id,action,details) VALUES($1,$2,'branding.reset',$3)`,[guildId,userId(req),{workerId:id}]);return {ok:true};
  });

  app.post("/v1/music/branding/:workerId/apply",async(req:any,reply)=>{
    if(!await requireAdmin(req,reply))return;
    const id=Number(req.params.workerId);if(!Number.isInteger(id)||id<1||id>8)return reply.code(404).send({error:"not_found"});
    try{const result=await applyWorker(guildId,id);await db.query(`INSERT INTO audit_log(guild_id,actor_id,action,details) VALUES($1,$2,'branding.apply',$3)`,[guildId,userId(req),result]);return result;}
    catch(err:any){return reply.code(Number(err?.statusCode)||502).send({error:"branding_apply_failed",message:err?.message??String(err),discord:err?.discord??null});}
  });

  app.post("/v1/music/branding/apply-defaults",async(req:any,reply)=>{
    if(!await requireAdmin(req,reply))return;
    const results=[];for(const d of BRAND_DEFAULTS){
      await rm(path.join(dataDir(),`worker-${d.workerId}`),{recursive:true,force:true}).catch(()=>{});
      await ensureRows(guildId);await db.query(`UPDATE worker_branding SET color_key=$3,color_hex=$4,avatar_source=$5,banner_source=$6,custom_avatar_path=NULL,custom_banner_path=NULL,custom_role_icon_path=NULL,applied_signature=NULL WHERE guild_id=$1 AND worker_id=$2`,[guildId,d.workerId,d.colorKey,d.colorHex,d.avatar,d.banner]);
      try{results.push(await applyWorker(guildId,d.workerId));}catch(err:any){results.push({ok:false,workerId:d.workerId,message:err?.message??String(err)});}
    }
    await db.query(`INSERT INTO audit_log(guild_id,actor_id,action,details) VALUES($1,$2,'branding.apply_defaults',$3)`,[guildId,userId(req),results]);return {ok:results.every((x:any)=>x.ok),results};
  });
}
