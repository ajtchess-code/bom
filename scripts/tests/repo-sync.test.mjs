// Launch-time GitHub sync: archive unpacking, protected paths, apply/rollback bookkeeping.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {createReadStream,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createGunzip} from 'node:zlib';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {extractTarGz,_internal} from '../repo-sync.mjs';

test('protected paths are never written by a sync',()=>{
  for(const p of ['.env','.env.production','node_modules/x/index.js','data/compendium/releases/a/index.html','data/compendium-active.json','data/wiki-active.json','cloudflared'])
    assert.equal(_internal.isProtected(p),true,p);
  for(const p of ['.env.example','apps/controller/src/index.ts','data/wiki/articles.json','scripts/bootstrap.mjs','package.json'])
    assert.equal(_internal.isProtected(p),false,p);
});

test('a GitHub-style tarball unpacks without its top folder, long names included',{skip:spawnSync('tar',['--version']).status!==0},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'repo-sync-'));
  try{
    const src=join(dir,'bom-0123abc');const deep='apps/dashboard/app/'+'very-long-folder-name-'.repeat(6)+'/route.ts';
    await mkdir(join(src,'scripts'),{recursive:true});await mkdir(join(src,deep,'..'),{recursive:true});
    await writeFile(join(src,'package.json'),'{"name":"bom"}');await writeFile(join(src,'scripts','bootstrap.mjs'),'// boot');await writeFile(join(src,deep),'export {}');
    assert.equal(spawnSync('tar',['-czf',join(dir,'a.tgz'),'-C',dir,'bom-0123abc']).status,0);
    const out=join(dir,'out');
    const files=await extractTarGz(createReadStream(join(dir,'a.tgz')).pipe(createGunzip()),out);
    assert.deepEqual(files.sort(),[deep,'package.json','scripts/bootstrap.mjs'].sort());
    assert.equal(await readFile(join(out,deep),'utf8'),'export {}');
    assert.equal(existsSync(join(out,'bom-0123abc')),false);
  }finally{await rm(dir,{recursive:true,force:true});}
});
