// Targeted regressions for v4.3.5. Run after yarn install: node --test scripts/tests/reliability-435.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const ROOT=path.resolve(__dirname,'../..');
const src=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
function loadRecommend({rows=[],response=null,networkFails=false,lastfmKey=null}={}){
 const cache=new Map();let calls=0;
 const module={exports:{}};
 const js=ts.transpileModule(src('apps/controller/src/recommend.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const fetch=async()=>{calls++;if(networkFails)throw new Error('offline');return{ok:response!==null,json:async()=>response};};
 const redis={get:async k=>cache.get(k)??null,set:async(k,v)=>{cache.set(k,v);return 'OK';}};
 const context={module,exports:module.exports,require:mod=>mod==='@bom/db'?{many:async sql=>sql.includes('track_feedback')?[]:rows}:mod==='@bom/redis'?{redis}:mod==='@bom/shared'?require('../../packages/shared/dist/index.js'):(()=>{throw Error('unexpected module '+mod)})(),fetch,URL,URLSearchParams,AbortSignal,process:{env:lastfmKey?{LASTFM_API_KEY:lastfmKey}:{}},console};
 vm.runInNewContext(js,context,{filename:'recommend.js'});
 return{recommend:module.exports.recommend,numberOfFetches:()=>calls};
}
test('autoplay uses guild listening history before external calls',async()=>{
 const r=loadRecommend({rows:[{author:'Atlas',title:'North Star'}]});
 assert.equal(await r.recommend('guild',{author:'Oceans',title:'Waves'}),'Atlas North Star');
 assert.equal(r.numberOfFetches(),0);
});
test('autoplay cold start without Last.fm chooses a different MusicBrainz recording',async()=>{
 const r=loadRecommend({response:{recordings:[{title:'Waves'},{title:'Tidal'}]}});
 assert.equal(await r.recommend('guild',{author:'Oceans',title:'Waves'}),'Oceans Tidal');
});
test('offline discovery falls back to an artist radio query',async()=>{
 const r=loadRecommend({networkFails:true});
 assert.equal(await r.recommend('guild',{author:'Oceans',title:'Waves'}),'Oceans popular songs radio');
});
test('empty history and missing seed remain safely null',async()=>{
 const r=loadRecommend();assert.equal(await r.recommend('guild'),null);
});
test('MusicBrainz artist lookup is cached between requests',async()=>{
 const r=loadRecommend({response:{recordings:[{title:'Waves'},{title:'Tidal'},{title:'Storm'}]}});
 assert.equal(await r.recommend('guild',{author:'Oceans',title:'Waves'}),'Oceans Tidal');
 assert.equal(await r.recommend('guild',{author:'Oceans',title:'Waves'},[{author:'Oceans',title:'Tidal'}]),'Oceans Storm');
 assert.equal(r.numberOfFetches(),1);
});
test('dashboard autoplay toggle is wired to actual room autoplay flag',()=>{
 assert.match(src('apps/api/src/features.ts'),/autoplayEnabled:z\.boolean\(\)\.optional/);
 assert.match(src('apps/api/src/features.ts'),/UPDATE music_rooms SET autoplay=\$3/);
 assert.match(src('apps/dashboard/components/MusicDashboard.tsx'),/Auto-play next song/);
});
test('PB edits perform revision-checked conditional updates',()=>{
 const s=src('apps/api/src/wosbWorkspace.ts');
 assert.match(s,/AND revision=\$12 AND status IN \('OPEN','CLOSED'\) RETURNING revision/);
 assert.match(s,/error:'stale_battle'/);
 assert.match(src('apps/dashboard/components/PortBattlesDashboard.tsx'),/revision:battle\.revision/);
});
test('PB orphan cleanup does not mistake failed message deletes for success',()=>{
 const s=src('apps/controller/src/index.ts');
 assert.match(s,/await msg\.delete\(\);\s*if\(pbResetCleanupReport\)pbResetCleanupReport\.deleted\+\+/);
 assert.match(s,/notePbCleanupFailure\('surface deletion'/);
});
test('reconciliation is admin-only and preserves live PB records',()=>{
 const s=src('apps/api/src/pbResetRoutes.ts');
 assert.match(s,/app\.post\('\/v1\/wosb\/pb-reconcile'/);
 assert.match(s,/if\(!await requireAdmin\(req,reply\)\)return/);
 assert.match(s,/Live battles will not be cancelled/);
});
test('Battle Map undo requires current version and most recent history event',()=>{
 const s=src('apps/api/src/territory.ts');
 assert.match(s,/error:'territory_changed'/);
 assert.match(s,/error:'history_changed'/);
 assert.match(s,/kind,snapshot\) VALUES\(\$1,\$2,\$3,\$4,\$5,\$6::jsonb\)/);
});
test('map image caching stays short while summaries are generated live',()=>{
 const s=src('apps/api/src/territory.ts');
 assert.match(s,/expiresAt:Date\.now\(\)\+35_000/);
 assert.ok(!s.includes('deskResponseCache'));
 assert.match(s,/territoryMapSummary\(ports,now/);
});
test('changed TypeScript and TSX parse successfully',()=>{
 const files=['apps/controller/src/index.ts','apps/controller/src/recommend.ts','apps/api/src/features.ts','apps/api/src/index.ts','apps/api/src/territory.ts','apps/api/src/wosbWorkspace.ts','apps/api/src/pbResetRoutes.ts','apps/dashboard/components/MusicDashboard.tsx','apps/dashboard/components/PortBattlesDashboard.tsx','apps/dashboard/components/TerritoryMap.tsx','packages/shared/src/territoryImage.ts'];
 for(const f of files){const output=ts.transpileModule(src(f),{fileName:f,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}});const errs=output.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error)??[];assert.equal(errs.length,0,f+': '+errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));}
});
