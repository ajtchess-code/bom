'use strict';
// Novonode Startup File: startup-next-fix.cjs
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
process.chdir(__dirname);
const target = '16.4.2';
function meets(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v || '');
  if (!m) return false;
  const a = m.slice(1).map(Number), b = [16, 4, 2];
  for (let i=0;i<3;i++) if(a[i]!==b[i]) return a[i]>b[i];
  return true;
}
function manifests(dir) {
  if (!fs.existsSync(dir)) return [];
  const results=[];
  for(const e of fs.readdirSync(dir,{withFileTypes:true})) {
    if (!e.isDirectory() || e.name.startsWith('.') || e.name==='node_modules') continue;
    const folder=path.join(dir,e.name), manifest=path.join(folder,'package.json');
    if(fs.existsSync(manifest)) results.push(manifest);
    else results.push(...manifests(folder));
  }
  return results;
}
function run(cmd,args) {
  const r=spawnSync(cmd,args,{stdio:'inherit',cwd:__dirname,env:{...process.env,CI:'1'}});
  if(r.error) throw r.error;
  if(r.signal || r.status!==0) throw new Error(`${cmd} failed: ${r.signal || r.status}`);
}
try {
  console.log('[startup-next-fix] Checking ROOT AND DASHBOARD Next.js versions.');
  if(!fs.existsSync('index.js')) throw new Error('Upload beside index.js in the bot root.');
  const files=['package.json',...manifests('apps'),...manifests('packages')];
  const checks=[];
  let changed=false;
  for(const file of files) {
    const pkg=JSON.parse(fs.readFileSync(file,'utf8'));
    let edit=false, hasNext=false;
    for(const section of ['dependencies','devDependencies','optionalDependencies','resolutions']) {
      if(pkg[section]?.next) {
        hasNext=true;
        if(!meets(pkg[section].next)) {
          console.log(`[startup-next-fix] ${file}: ${pkg[section].next} -> ${target}`);
          pkg[section].next=target; edit=true;
        }
      }
    }
    if(hasNext) checks.push(file);
    if(edit) {
      if(!fs.existsSync(file+'.before-next-upgrade')) fs.copyFileSync(file,file+'.before-next-upgrade');
      fs.writeFileSync(file,JSON.stringify(pkg,null,2)+'\n'); changed=true;
    }
  }
  if(!checks.length) throw new Error('No Next.js dependency found; wrong project directory.');
  function installed(file) {
    try{return createRequire(path.resolve(file))('next/package.json').version;}catch{return null;}
  }
  if(changed || checks.some(file=>!meets(installed(file)))) {
    console.log('[startup-next-fix] Installing updated workspace dependencies.');
    run(process.platform==='win32'?'yarn.cmd':'yarn',['install','--non-interactive']);
    process.env.FORCE_BUILD='1';
  }
  for(const file of checks) {
    const version=installed(file);
    console.log(`[startup-next-fix] ${file} resolves Next.js ${version || 'MISSING'}`);
    if(!meets(version)) throw new Error(`Next.js is still outdated for ${file}; startup stopped.`);
  }
  console.log('[startup-next-fix] Starting existing index.js (bootstrap handles rebuilding).');
  require(path.join(__dirname,'index.js'));
} catch(error) {
  console.error('[startup-next-fix]',error.stack || error.message);
  process.exitCode=1;
}
