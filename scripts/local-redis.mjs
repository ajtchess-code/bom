import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import process from "node:process";

const HOME = process.env.HOME && process.env.HOME.startsWith("/home/container") ? "/home/container" : process.cwd();
const vendorRoot = process.env.LOCAL_REDIS_VENDOR_DIR || join(HOME, "vendor", "redis");
const packageDir = join(vendorRoot, "packages");
const redisRoot = join(vendorRoot, "root");
const configDir = process.env.LOCAL_REDIS_CONFIG_DIR || join(HOME, "config");
const dataDir = process.env.LOCAL_REDIS_DATA_DIR || join(HOME, "data", "redis");
const passwordFile = process.env.LOCAL_REDIS_PASSWORD_FILE || join(configDir, "redis-password.txt");
const configFile = process.env.LOCAL_REDIS_CONFIG_FILE || join(configDir, "redis.conf");
const redisServer = join(redisRoot, "usr", "bin", "redis-server");
const redisCli = join(redisRoot, "usr", "bin", "redis-cli");
const port = Math.max(1, Math.min(65535, Number(process.env.LOCAL_REDIS_PORT || 6379)));
const maxMemoryMb = Math.max(64, Number(process.env.LOCAL_REDIS_MAXMEMORY_MB || 256));

function enabled(){
  const raw=(process.env.LOCAL_REDIS_ENABLED ?? "true").trim().toLowerCase();
  return !["0","false","no","off"].includes(raw);
}

function ensureDirs(){
  for(const dir of [vendorRoot, packageDir, redisRoot, configDir, dataDir]) mkdirSync(dir,{recursive:true});
}

function commandText(cmd,args=[]){
  return execFileSync(cmd,args,{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
}

function detectPackage(){
  const alpine=readFileSync("/etc/alpine-release","utf8").trim();
  const match=alpine.match(/^(\d+)\.(\d+)/);
  if(!match) throw new Error(`Unable to determine Alpine repository branch from ${alpine}`);
  const branch=`v${match[1]}.${match[2]}`;
  const arch=commandText("apk",["--print-arch"]);
  const packageName=commandText("apk",["search","-x","redis"]).split(/\r?\n/).find(Boolean);
  const pkgMatch=packageName?.match(/^redis-(.+)$/);
  if(!pkgMatch) throw new Error(`Alpine repository did not return an exact Redis package (got ${packageName || "nothing"})`);
  const version=pkgMatch[1];
  return { alpine, branch, arch, packageName, version };
}

function installRedis(){
  if(existsSync(redisServer) && existsSync(redisCli)){
    console.log("[redis] Local Redis binaries already installed.");
    return;
  }
  const pkg=detectPackage();
  const apkName=`redis-${pkg.version}.apk`;
  const apkFile=join(packageDir,apkName);
  const url=`https://dl-cdn.alpinelinux.org/alpine/${pkg.branch}/community/${pkg.arch}/${apkName}`;
  console.log(`[redis] Installing official Alpine ${pkg.packageName} for Alpine ${pkg.alpine}/${pkg.arch}...`);
  if(!existsSync(apkFile)){
    execFileSync("curl",["-fL","--retry","3","--connect-timeout","15","-o",apkFile,url],{stdio:"inherit"});
    console.log(`[redis] Downloaded ${(statSync(apkFile).size/1024/1024).toFixed(2)} MB.`);
  }
  execFileSync("tar",["-xzf",apkFile,"-C",redisRoot],{stdio:"inherit"});
  if(!existsSync(redisServer)||!existsSync(redisCli)) throw new Error("Redis APK extracted, but redis-server/redis-cli were not found.");
  chmodSync(redisServer,0o755);chmodSync(redisCli,0o755);
  const ldd=commandText("ldd",[redisServer]);
  if(/not found/i.test(ldd)) throw new Error(`Redis has unresolved shared libraries:\n${ldd}`);
  console.log(`[redis] ${commandText(redisServer,["--version"])}`);
}

function getPassword(){
  if(existsSync(passwordFile)){
    const current=readFileSync(passwordFile,"utf8").trim();
    if(current) return current;
  }
  const password=randomBytes(32).toString("hex");
  mkdirSync(dirname(passwordFile),{recursive:true});
  writeFileSync(passwordFile,`${password}\n`,{mode:0o600});
  console.log(`[redis] Generated local password at ${passwordFile}`);
  return password;
}

function writeConfig(password){
  const config=`# BOM-Bot local Redis - generated automatically\n`+
`bind 127.0.0.1\nprotected-mode yes\nport ${port}\n`+
`daemonize no\nsupervised no\nrequirepass ${password}\n`+
`timeout 0\ntcp-keepalive 60\ndir ${dataDir}\n`+
`appendonly yes\nappendfsync everysec\n`+
`save 900 1\nsave 300 10\nsave 60 10000\n`+
`stop-writes-on-bgsave-error yes\n`+
`maxmemory ${maxMemoryMb}mb\nmaxmemory-policy noeviction\n`+
`databases 1\nloglevel notice\n`;
  writeFileSync(configFile,config,{mode:0o600});
}

function pingWithEnv(password){
  try{
    const out=execFileSync(redisCli,["-h","127.0.0.1","-p",String(port),"ping"],{encoding:"utf8",stdio:["ignore","pipe","pipe"],env:{...process.env,REDISCLI_AUTH:password}}).trim();
    return out==="PONG";
  }catch{return false;}
}

async function waitForRedis(password,child){
  const deadline=Date.now()+10000;
  while(Date.now()<deadline){
    if(child.exitCode!==null) throw new Error(`Local Redis exited during startup with code ${child.exitCode}`);
    if(pingWithEnv(password)) return;
    await new Promise(r=>setTimeout(r,250));
  }
  throw new Error("Local Redis did not answer PING within 10 seconds.");
}

export async function startLocalRedis(){
  if(process.env.REDIS_URL?.trim()){
    console.log("[redis] REDIS_URL is set; using configured Redis and skipping local bootstrap.");
    return null;
  }
  if(!enabled()){
    console.log("[redis] Local Redis disabled; BOM-Bot will use its PostgreSQL live-state fallback.");
    return null;
  }
  ensureDirs();
  installRedis();
  const password=getPassword();
  writeConfig(password);
  console.log(`[redis] Starting local Redis on 127.0.0.1:${port}...`);
  const child=spawn(redisServer,[configFile],{cwd:process.cwd(),env:process.env,stdio:"inherit"});
  child.once("error",err=>console.error(`[redis] Process error: ${err.message}`));
  await waitForRedis(password,child);
  process.env.REDIS_URL=`redis://default:${password}@127.0.0.1:${port}/0`;
  console.log(`[redis] Local Redis healthy (PONG); REDIS_URL injected for BOM-Bot child services.`);
  return child;
}
