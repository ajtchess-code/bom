import {cloudflaredEnv} from './cloudflared-env.mjs';
import { loadRootEnv } from "./load-env.mjs";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, chmodSync, renameSync, rmSync, statSync } from "node:fs";
import process from "node:process";
import { startLocalRedis } from "./local-redis.mjs";
import { prepareIntelRelay } from "./intel-relay.mjs";

loadRootEnv();
const root=process.cwd();
const required=["DISCORD_GUILD_ID","DISCORD_CLIENT_ID","DISCORD_CLIENT_SECRET","DISCORD_BOT_TOKEN","SESSION_SECRET","INTERNAL_API_TOKEN","PUBLIC_DASHBOARD_URL","LAVALINK_URL","LAVALINK_PASSWORD"];
const databaseUrl=process.env.DATABASE_URL?.trim()??"";
const hasPostgres=/^postgres(?:ql)?:\/\//i.test(databaseUrl)||Boolean(process.env.POSTGRES_HOST&&process.env.POSTGRES_DATABASE&&process.env.POSTGRES_USER);
if(!hasPostgres)required.push("POSTGRES_HOST / POSTGRES_DATABASE / POSTGRES_USER (or DATABASE_URL)");
const missing=required.filter(k=>k.includes(" / ")?!hasPostgres:!process.env[k]);
if(missing.length){console.error(`[startup] Missing required environment: ${missing.join(", ")}`);process.exit(1);}

// Production deployments are overlays, so compiled dist/.next artifacts from an older
// release can survive even when the TypeScript source has changed. Always rebuild
// before migrations/services so runtime JavaScript matches the currently installed
// source and dependencies (notably the PostgreSQL conversion from mysql2 -> pg).
const yarn=process.platform==="win32"?"yarn.cmd":"yarn";
const skipStartupBuild=/^(1|true|yes|on)$/i.test(process.env.SKIP_STARTUP_BUILD??"");
if(!skipStartupBuild){
  console.log("[bootstrap] Building BOM-Bot from current source...");
  const build=spawnSync(yarn,["build"],{cwd:root,env:process.env,stdio:"inherit"});
  if(build.error||build.status!==0){
    console.error(`[BOM-Bot] Fatal startup error: yarn build failed (${build.error?.message??build.status})`);
    process.exit(build.status||1);
  }
}else{
  console.warn("[bootstrap] SKIP_STARTUP_BUILD enabled; existing dist/.next artifacts will be used.");
}

for(const path of ["apps/controller/dist/index.js","apps/worker/dist/index.js","apps/api/dist/index.js","packages/db/dist/migrate.js"]){
  if(!existsSync(path)){console.error(`[startup] ${path} is missing. Run yarn build before starting.`);process.exit(1);}
}
if(!existsSync("apps/dashboard/.next")){console.error("[startup] apps/dashboard/.next is missing. Run yarn build before starting.");process.exit(1);}

const workerCount=Math.max(1,Math.min(8,Number(process.env.WORKER_COUNT??8)));
const dashboardPort=String(process.env.DASHBOARD_PORT??process.env.PORT??3000);
const apiPort=String(process.env.API_PORT??4100);
// Prepare the optional relay before starting live services. npm/build runs synchronously.
// A relay setup error must not prevent the existing bot from starting.
let intelRelay=null;
try { intelRelay=prepareIntelRelay({root,occupiedPorts:[dashboardPort,apiPort,process.env.LOCAL_REDIS_PORT||6379]}); }
catch(error) { console.error(`[intel] Relay not started: ${error.message}`); }
const children=new Map();
let shuttingDown=false;

const localRedis=await startLocalRedis();
if(localRedis){
  children.set("redis",localRedis);
  localRedis.on("exit",(code,signal)=>{
    children.delete("redis");
    if(!shuttingDown){
      console.error(`[startup] Local Redis exited unexpectedly (${code??signal}); restarting the BOM-Bot allocation.`);
      shutdown("local Redis failure",1);
    }
  });
}

function spawnService(name,command,args,extraEnv={},options={}){
  const launch=()=>{
    if(shuttingDown)return;
    const child=spawn(command,args,{cwd:options.cwd||root,env:options.env??{...process.env,...extraEnv},stdio:"inherit"});
    children.set(name,child);
    console.log(`[startup] ${name} started (pid ${child.pid})`);
    let spawnFailed=false;
    child.once("error",err=>{
      spawnFailed=true;children.delete(name);
      console.error(`[startup] ${name} failed to spawn: ${err.message}`);
    });
    child.on("exit",(code,signal)=>{
      children.delete(name);
      if(shuttingDown||spawnFailed)return;
      console.error(`[startup] ${name} exited (${code??signal}); restarting in 2s`);
      setTimeout(launch,2000).unref();
    });
  };
  launch();
}

async function migrate(){
  await new Promise((resolve,reject)=>{
    const c=spawn(process.execPath,["packages/db/dist/migrate.js"],{cwd:root,env:process.env,stdio:"inherit"});
    c.once("exit",code=>code===0?resolve():reject(new Error(`migration failed with code ${code}`)));
  });
}

function boolEnv(name, fallback=false){
  const raw=process.env[name];
  if(raw==null||raw==="")return fallback;
  return /^(1|true|yes|on)$/i.test(raw);
}

function parseLavalinkRaw(raw){
  const trimmed=raw.trim();
  if(/^https?:\/\//i.test(trimmed)){
    const u=new URL(trimmed);
    return {host:u.hostname,port:u.port?Number(u.port):null,secure:u.protocol==="https:",explicitScheme:true,explicitPort:Boolean(u.port)};
  }
  const ipv6=trimmed.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if(ipv6)return {host:ipv6[1],port:ipv6[2]?Number(ipv6[2]):null,secure:boolEnv("LAVALINK_SECURE",false),explicitScheme:false,explicitPort:Boolean(ipv6[2])};
  const lastColon=trimmed.lastIndexOf(":");
  if(lastColon>0&&/^\d+$/.test(trimmed.slice(lastColon+1))){
    return {host:trimmed.slice(0,lastColon),port:Number(trimmed.slice(lastColon+1)),secure:boolEnv("LAVALINK_SECURE",false),explicitScheme:false,explicitPort:true};
  }
  return {host:trimmed,port:null,secure:boolEnv("LAVALINK_SECURE",false),explicitScheme:false,explicitPort:false};
}

async function probeLavalink(candidate){
  const protocol=candidate.secure?"https":"http";
  const base=`${protocol}://${candidate.host}:${candidate.port}`;
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),6500);
  try{
    const response=await fetch(`${base}/v4/info`,{headers:{Authorization:process.env.LAVALINK_PASSWORD},signal:ctrl.signal});
    const text=await response.text();
    let info=null;
    try{info=text?JSON.parse(text):null;}catch{}
    const looksLikeLavalink=Boolean(info&&typeof info==="object"&&(info.version||info.sourceManagers||info.filters||info.plugins));
    return {candidate,base,status:response.status,ok:response.ok&&looksLikeLavalink,reachable:true,looksLikeLavalink,info,body:text.slice(0,160)};
  }catch(error){
    return {candidate,base,status:null,ok:false,reachable:false,looksLikeLavalink:false,error:error?.name==="AbortError"?"timeout":(error?.message??String(error))};
  }finally{clearTimeout(timer);}
}

async function normalizeLavalink(){
  const parsed=parseLavalinkRaw(process.env.LAVALINK_URL);
  const configuredPort=process.env.LAVALINK_PORT?Number(process.env.LAVALINK_PORT):null;
  let candidates=[];
  if(parsed.port){
    candidates=[{host:parsed.host,port:parsed.port,secure:parsed.secure,label:"configured"}];
  }else if(configuredPort){
    candidates=[{host:parsed.host,port:configuredPort,secure:parsed.secure,label:"configured LAVALINK_PORT"}];
  }else{
    const preferred=parsed.secure
      ? [{host:parsed.host,port:443,secure:true,label:"TLS 443"},{host:parsed.host,port:2333,secure:false,label:"HTTP 2333"}]
      : [{host:parsed.host,port:2333,secure:false,label:"HTTP 2333"},{host:parsed.host,port:443,secure:true,label:"TLS 443"}];
    candidates=preferred;
    console.log(`[startup] Lavalink URL ${process.env.LAVALINK_URL} has no port; probing HTTP :2333 and HTTPS :443 before workers start.`);
  }
  const results=await Promise.all(candidates.map(probeLavalink));
  for(const result of results){
    if(result.ok){
      const c=result.candidate;
      process.env.LAVALINK_URL=`${c.host}:${c.port}`;
      process.env.LAVALINK_SECURE=c.secure?"true":"false";
      process.env.LAVALINK_PORT=String(c.port);
      const version=result.info?.version?.semver||result.info?.version?.version||result.info?.version||"unknown";
      const plugins=Array.isArray(result.info?.plugins)?result.info.plugins.map(p=>p?.name).filter(Boolean).join(", "):"";
      console.log(`[startup] Lavalink verified at ${result.base} (HTTP ${result.status}, version=${typeof version==="object"?JSON.stringify(version):version}${plugins?`, plugins=${plugins}`:""}).`);
      return true;
    }
  }
  for(const result of results){
    if(result.reachable){
      console.warn(`[startup] Lavalink endpoint responded at ${result.base} with HTTP ${result.status}, but did not return authenticated Lavalink v4 info.${result.status===401||result.status===403?" Check LAVALINK_PASSWORD.":""}`);
    }else{
      console.warn(`[startup] Lavalink probe failed at ${result.base}: ${result.error}`);
    }
  }
  const c=candidates[0];
  process.env.LAVALINK_URL=`${c.host}:${c.port}`;
  process.env.LAVALINK_SECURE=c.secure?"true":"false";
  process.env.LAVALINK_PORT=String(c.port);
  console.warn(`[startup] No Lavalink candidate verified. Workers will start against ${c.secure?"https":"http"}://${c.host}:${c.port} and keep Shoukaku's reconnect loop active.`);
  return false;
}

async function ensureCloudflared(path){
  const verify=()=>{
    if(!existsSync(path))return {ok:false,reason:"missing"};
    try{chmodSync(path,0o755);}catch{}
    const result=spawnSync(path,["--version"],{cwd:root,env:process.env,encoding:"utf8",timeout:10000});
    if(!result.error&&result.status===0)return {ok:true,version:(result.stdout||result.stderr||"").trim()};
    return {ok:false,reason:result.error?.code||`exit ${result.status}`,detail:(result.stderr||result.stdout||"").trim()};
  };
  let check=verify();
  if(check.ok){console.log(`[startup] cloudflared verified: ${check.version}`);return true;}
  console.warn(`[startup] cloudflared at ${path} is not executable (${check.reason}${check.detail?`: ${check.detail}`:""}); replacing it with Cloudflare's official Linux amd64 binary.`);
  const temp=`${path}.download`;
  try{rmSync(temp,{force:true});}catch{}
  const curl=spawnSync("curl",["-fL","--retry","3","--connect-timeout","20","-o",temp,"https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"],{cwd:root,stdio:"inherit",timeout:180000});
  if(curl.error||curl.status!==0){console.error(`[startup] Unable to download cloudflared (${curl.error?.message??`exit ${curl.status}`}).`);return false;}
  try{
    chmodSync(temp,0o755);
    if(existsSync(path)){
      try{renameSync(path,`${path}.invalid-${Date.now()}`);}catch{rmSync(path,{force:true});}
    }
    renameSync(temp,path);
  }catch(error){console.error(`[startup] Unable to install downloaded cloudflared: ${error?.message??error}`);return false;}
  check=verify();
  if(!check.ok){console.error(`[startup] Downloaded cloudflared still failed verification (${check.reason}).`);return false;}
  console.log(`[startup] cloudflared installed and verified: ${check.version}`);
  return true;
}

function findTunnelToken(){
  const envToken=process.env.CLOUDFLARE_TUNNEL_TOKEN?.trim();
  if(envToken)return {token:envToken,source:"CLOUDFLARE_TUNNEL_TOKEN"};
  const configured=process.env.CLOUDFLARE_TUNNEL_TOKEN_FILE;
  const candidates=[configured,`${root}/cloudflare-token.txt`,`${root}/cloudflare-token`,`${root}/cloudflare-token.txt.txt`].filter(Boolean);
  for(const file of [...new Set(candidates)]){
    if(!existsSync(file))continue;
    try{
      const raw=readFileSync(file,"utf8").trim();
      console.log(`[startup] Cloudflare token candidate ${file} exists (${statSync(file).size} bytes).`);
      const match=raw.match(/eyJ[A-Za-z0-9._=-]+/);
      const token=(match?.[0]||raw).trim();
      if(token)return {token,source:file};
    }catch(error){console.warn(`[startup] Unable to read Cloudflare token candidate ${file}: ${error?.message??error}`);}
  }
  return null;
}

await migrate();
await normalizeLavalink();
spawnService("api",process.execPath,["apps/api/dist/index.js"],{API_PORT:apiPort});
spawnService("controller",process.execPath,["apps/controller/dist/index.js"]);

let launchedWorkers=0;
for(let i=1;i<=workerCount;i++){
  const token=process.env[`WORKER_${i}_TOKEN`];
  if(!token){console.warn(`[startup] WORKER_${i}_TOKEN is empty; worker ${i} disabled`);continue;}
  launchedWorkers++;
  spawnService(`worker-${i}`,process.execPath,["apps/worker/dist/index.js"],{WORKER_ID:String(i),DISCORD_TOKEN:token});
}
if(!launchedWorkers)console.warn("[startup] No music workers are configured; dashboard/controller will run but audio cannot start.");

spawnService("dashboard",yarn,["workspace","@bom/dashboard","start"],{PORT:dashboardPort,INTERNAL_API_URL:`http://127.0.0.1:${apiPort}`});

if(intelRelay){
  spawnService("intel-relay",process.execPath,[intelRelay.entry],{}, {cwd:intelRelay.cwd,env:intelRelay.env});
  console.log(`[intel] Dashboard configured for ${intelRelay.env.PUBLIC_ORIGIN} -> http://${intelRelay.env.DASHBOARD_HOST}:${intelRelay.env.DASHBOARD_PORT}`);
}

const cloudflaredPath=process.env.CLOUDFLARED_PATH||`${root}/cloudflared`;
const tunnel=findTunnelToken();
if(tunnel){
  console.log(`[startup] Cloudflare tunnel token loaded from ${tunnel.source}.`);
  if(await ensureCloudflared(cloudflaredPath)){
    spawnService("cloudflared",cloudflaredPath,["tunnel","--no-autoupdate","--protocol",process.env.TUNNEL_TRANSPORT_PROTOCOL||"auto","run"],{}, {env:cloudflaredEnv(process.env,tunnel.token)});
  }else console.warn("[startup] Cloudflare Tunnel was not started because cloudflared could not be installed/verified.");
}else if(existsSync(cloudflaredPath)){
  console.warn(`[startup] cloudflared exists at ${cloudflaredPath}, but no tunnel token was found.`);
}else{
  console.warn("[startup] Cloudflare Tunnel not configured (no token found). Dashboard remains available on local port only.");
}

console.log(`[startup] BOM-Bot online: dashboard=:${dashboardPort}, api=127.0.0.1:${apiPort}, workers=${launchedWorkers}/${workerCount}, live-state=${process.env.REDIS_URL?"Redis":"PostgreSQL fallback"}`);

function shutdown(signal,exitCode=0){
  if(shuttingDown)return;shuttingDown=true;console.log(`[startup] ${signal}; stopping services...`);
  for(const child of children.values())child.kill("SIGTERM");
  process.exitCode=exitCode;
  // The relay drains attachment/webhook jobs on SIGTERM; allow its own 90s limit.
  const grace=intelRelay?95000:5000;
  setTimeout(()=>{for(const child of children.values())child.kill("SIGKILL");process.exit(exitCode);},grace).unref();
  const drained=setInterval(()=>{if(children.size===0){clearInterval(drained);process.exit(exitCode);}},100);
  drained.unref();
}
process.on("SIGTERM",()=>shutdown("SIGTERM",0));
process.on("SIGINT",()=>shutdown("SIGINT",0));
