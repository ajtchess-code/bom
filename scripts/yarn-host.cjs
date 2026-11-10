#!/usr/bin/env node
'use strict';
// Yarn 2+ honors yarnPath before installation. Redirect the egg's unpinned
// `pnpm dlx yarn install` to Classic without depending on node_modules.
const {spawnSync}=require('node:child_process');
const {mkdirSync}=require('node:fs');
const {resolve}=require('node:path');
const win=process.platform==='win32';
const temp=resolve(process.env.BOM_BUILD_TMP_DIR||resolve(__dirname,'../build-tmp'));
try{mkdirSync(temp,{recursive:true});}catch(error){console.error('[host-yarn] Cannot create build temp directory:',error.message);process.exit(1);}
const env={...process.env,TMPDIR:temp,TMP:temp,TEMP:temp,YARN_IGNORE_PATH:'1',COREPACK_ENABLE_DOWNLOAD_PROMPT:'0'};
const candidates=[
 {command:win?'yarn.cmd':'yarn',prefix:[]},
 {command:win?'corepack.cmd':'corepack',prefix:['yarn']},
 {command:win?'npx.cmd':'npx',prefix:['--yes','yarn@1.22.22']},
];
const args=process.argv.slice(2),versionOnly=args.includes('--version')||args.includes('-v');
for(const candidate of candidates){
 const check=spawnSync(candidate.command,[...candidate.prefix,'--version'],{env,encoding:'utf8',shell:win,timeout:120000});
 const version=String(check.stdout||'').trim();
 if(check.status!==0||!/^1\.\d+\.\d+$/.test(version))continue;
 if(!versionOnly)console.log(`[host-yarn] Using Yarn ${version}; temporary files: ${temp}`);
 const forwarded=[...args];
 if(forwarded[0]==='install'&&!forwarded.some(a=>a.startsWith('--production')))forwarded.push('--production=false');
 const child=spawnSync(candidate.command,[...candidate.prefix,...forwarded],{env,stdio:'inherit',shell:win});
 if(child.error)console.error('[host-yarn]',child.error.message);
 if(child.signal)console.error('[host-yarn] Yarn terminated by',child.signal);
 process.exit(child.status??1);
}
console.error('[host-yarn] Yarn Classic unavailable. Tried global yarn, Corepack and npx yarn@1.22.22. No dependencies were deleted.');
process.exit(1);
