import test from 'node:test';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';
import {readFileSync} from 'node:fs';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const root=new URL('../../',import.meta.url);
const text=p=>readFileSync(new URL(p,root),'utf8');
const source=text('apps/controller/src/banterKnowledge.ts');
const {BANTER_VOICE,gazetteContext}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
test('live and preview share refined voice and retrieval',()=>{
 assert.equal(source,text('apps/api/src/banterKnowledge.ts'));
 for(const p of ['apps/controller/src/banter.ts','apps/api/src/banter.ts']){const s=text(p);assert.ok(s.includes('BANTER_VOICE'));assert.ok(s.includes('await gazetteContext('));stripTypeScriptTypes(s);}
 assert.ok(BANTER_VOICE.includes('schoolyard'));assert.ok(BANTER_VOICE.includes('never guild history'));
});
test('retrieval selects relevant lore, reloads changes, bounds context, and tolerates missing/bad files',async()=>{
 const original=process.cwd(),dir=await mkdtemp(join(tmpdir(),'bom-lore-'));process.chdir(dir);
 const write=async articles=>writeFile('data/banter/gazette-archive.json',JSON.stringify({articles}));
 try{
 assert.equal(await gazetteContext('Laguna'), '');await mkdir('data/banter',{recursive:true});
 await write([{id:'one',title:'Laguna',text:'Sir Litefoot led the Laguna campaign.'},{id:'two',title:'Aruba',text:'An entirely different campaign.'}]);
 const result=await gazetteContext('What happened in Laguna?');assert.ok(result.includes('Sir Litefoot'));assert.ok(!result.includes('different campaign'));assert.ok(result.includes('unverified historical satire'));
 assert.equal(await gazetteContext('electromagnetism'), '');
 await write([{id:'one',title:'Laguna',text:'A corrected Laguna story now includes the fleet.'}]);assert.ok((await gazetteContext('Laguna')).includes('corrected'));
 await write(Array.from({length:10},(_,i)=>({id:String(i),title:'Laguna',text:'Laguna '+i+' '+('x'.repeat(5000))})));assert.ok((await gazetteContext('Laguna')).length<4500);
 await writeFile('data/banter/gazette-archive.json','invalid json');assert.equal(await gazetteContext('Laguna'),'');
 }finally{process.chdir(original);await rm(dir,{recursive:true,force:true});}
});
test('bundled archive has readable text, distinct content IDs, and extraction provenance',()=>{
 const data=JSON.parse(text('data/banter/gazette-archive.json'));assert.equal(data.articles.length,46);assert.equal(new Set(data.articles.map(x=>x.id)).size,46);assert.ok(data.articles.every(x=>x.text.length>=80&&x.extraction&&x.libraryFileId));
});
