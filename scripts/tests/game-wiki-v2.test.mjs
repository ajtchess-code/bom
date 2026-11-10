import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,readFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import Fastify from 'fastify';
import {GameWiki,craftingPlan,registerGameWiki} from '../../apps/api/src/gameWiki.ts';
import {extractCheckedZip,validateManifest} from '../wiki-release.mjs';
import {gameWikiShipFact,gameWikiSources,searchGameWiki} from '../../packages/shared/src/gameWikiKnowledge.ts';

const recipe=(id,output,quantity=1)=>({RecipeID:id,OutputID:output,OutputType:'resource',OutputQuantity:quantity,CraftHours:1,InputGold:0,EnglishName:id});
test('crafting combines shared intermediate demand before whole-batch rounding',()=>{
  const recipes=[recipe('final',9),recipe('left',2),recipe('right',3),recipe('shared',4,10)];
  const inputs=[{RecipeID:'final',ResourceID:2,Quantity:1},{RecipeID:'final',ResourceID:3,Quantity:1},{RecipeID:'left',ResourceID:4,Quantity:4},{RecipeID:'right',ResourceID:4,Quantity:4},{RecipeID:'shared',ResourceID:1,Quantity:5,EnglishName:'Raw'}];
  const result=craftingPlan(recipes,inputs,'final',1);
  assert.equal(result.steps.find(s=>s.recipeId==='shared').batches,1);
  assert.equal(result.steps.find(s=>s.recipeId==='shared').leftover,2);
  assert.equal(result.rawMaterials[0].quantity,5);
});
test('alternative recipes require a choice; the chosen route is honored',()=>{
  const recipes=[recipe('final',9),recipe('one',2),recipe('two',2)];
  const inputs=[{RecipeID:'final',ResourceID:2,Quantity:1}];
  assert.equal(craftingPlan(recipes,inputs,'final',1).choicesRequired.length,1);
  assert.ok(craftingPlan(recipes,inputs,'final',1,{'2':'two'}).steps.some(s=>s.recipeId==='two'));
  assert.throws(()=>craftingPlan(recipes,inputs,'final',1,{'2':'wrong'}),/Invalid recipe choice/);
});
test('cycles and invalid requested quantities fail explicitly',()=>{
  assert.throws(()=>craftingPlan([recipe('a',1),recipe('b',2)],[{RecipeID:'a',ResourceID:2,Quantity:1},{RecipeID:'b',ResourceID:1,Quantity:1}],'a',1),/cycle/);
  for(const n of [0,-1,NaN,Infinity,1e10])assert.throws(()=>craftingPlan([recipe('a',1)],[],'a',n),/Quantity/);
});
test('indexed pages remain correct across source parts and Unicode records',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'wiki-index-'));
  try{
    await mkdir(join(dir,'indexes'));await mkdir(join(dir,'tables','Test'),{recursive:true});
    await writeFile(join(dir,'catalog.json'),JSON.stringify({tables:[{name:'Test',rows:101}]}));
    await writeFile(join(dir,'tables','Test','part-001.jsonl'),Array.from({length:100},(_,ID)=>JSON.stringify({ID,EnglishName:'船 '+ID})).join('\n')+'\n');
    await writeFile(join(dir,'tables','Test','part-002.jsonl'),JSON.stringify({ID:100,EnglishName:'船 100'})+'\n');
    await writeFile(join(dir,'indexes','Test.json'),JSON.stringify([{file:'part-001.jsonl',offset:0},{file:'part-002.jsonl',offset:0}]));
    const wiki=new GameWiki(dir);assert.equal((await wiki.page('Test',0)).length,100);assert.equal((await wiki.page('Test',1))[0].EnglishName,'船 100');
    await assert.rejects(()=>wiki.page('../secret',0),/Unknown wiki collection/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('every wiki route enforces member or admin access before reading files',async()=>{
  const app=Fastify();registerGameWiki(app,{requireMember:async(_req,reply)=>{reply.code(403).send({error:'forbidden'});return false;},requireAdmin:async(_req,reply)=>{reply.code(403).send({error:'admin_required'});return false;}});
  for(const url of ['/v1/game-wiki/catalog','/v1/game-wiki/table/Resources','/v1/game-wiki/record/Resources/0','/v1/game-wiki/asset?path=Images/test.png','/v1/game-wiki/search?q=wood','/v1/game-wiki/download/Resources'])assert.equal((await app.inject({url})).statusCode,403,url);
  for(const url of ['/v1/game-wiki/craft','/v1/game-wiki/install/start','/v1/game-wiki/install/next'])assert.equal((await app.inject({method:'POST',url,payload:{}})).statusCode,403,url);
  await app.close();
});
test('release manifests reject duplicate parts and oversized uploads',()=>{
  const part={file:'wiki-part-001.zip',bytes:123,sha256:'a'.repeat(64),files:1};
  const manifest={format:'wosb-wiki-release-v1',release:'wiki-test',parts:[part]};
  assert.equal(validateManifest(manifest),manifest);
  assert.throws(()=>validateManifest({...manifest,parts:[part,part]}),/Invalid/);
  assert.throws(()=>validateManifest({...manifest,parts:[{...part,bytes:50_000_000}]}),/Invalid/);
});
test('ZIP parser rejects traversal before writing files',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'wiki-zip-'));
  try{
    // A stored zero-byte entry is enough to exercise path validation.
    const name=Buffer.from('../escape'),local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22);
    local.writeUInt32LE(0x04034b50);local.writeUInt16LE(name.length,26);
    central.writeUInt32LE(0x02014b50);central.writeUInt16LE(name.length,28);
    end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+name.length,12);end.writeUInt32LE(local.length+name.length,16);
    await assert.rejects(()=>extractCheckedZip(Buffer.concat([local,name,central,name,end]),dir),/Unsafe ZIP/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('compiled release retains every manifest table, all images, and indexed evidence tail',{skip:!process.env.WIKI_DATA_TEST},async()=>{
  const dir=resolve('data/wiki-v2'),wiki=new GameWiki(dir),catalog=await wiki.catalog();
  const manifest=JSON.parse(await readFile(join(dir,'AI-MANIFEST.json'),'utf8'));
  for(const t of manifest.Tables){assert.equal(catalog.tables.find(x=>x.name===t.Table)?.rows,t.Rows,t.Table);if(t.Rows){const final=await wiki.page(t.Table,Math.floor((t.Rows-1)/100));assert.ok(final[(t.Rows-1)%100],t.Table);}}
  assert.equal(catalog.images,3829);
  const lanterns=(await wiki.all('ShipDesingElements')).filter(r=>/lantern/i.test(r.EnglishName));assert.equal(lanterns.length,9);
  assert.equal((await wiki.record('ShipsToPlay',1)).images.length,2);
  assert.equal((await wiki.record('Crew_Special',0)).name,'Midshipman');
  const result=craftingPlan(await wiki.all('Crafting_Recipes'),await wiki.all('Recipe_Ingredients'),'CRAFT001',300);assert.equal(result.steps[0].batches,2);
});
test('Discord facts use the current client and refuse multi-ship shortcuts',{skip:!process.env.WIKI_DATA_TEST},async()=>{
  process.env.WOSB_WIKI_DIR=resolve('data/wiki-v2');
  assert.match((await gameWikiShipFact('What is Pickle speed?')).answer,/8\.4/);
  assert.equal(await gameWikiShipFact('Which has more armor, Pickle or Sloop?'),null);
  assert.equal(await gameWikiShipFact('What is Pickle speed with upgrades?'),null);
  assert.ok((await gameWikiSources('What is the Golden Lantern bonus?')).some(s=>s.title.startsWith('Golden Lantern')));
  assert.ok((await searchGameWiki('midshipman')).some(r=>r.kind==='Crew_Special'));
});
