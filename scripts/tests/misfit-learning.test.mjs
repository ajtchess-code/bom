import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile,readdir} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {randomUUID} from 'node:crypto';import Fastify from 'fastify';import {PGlite} from '@electric-sql/pglite';
const root=new URL('../../',import.meta.url),pg=new PGlite();
const query=async(sql,args=[])=>{if(sql.startsWith('SELECT pg_advisory_xact_lock'))return {rows:[]};if(!args.length&&sql.includes(';')){await pg.exec(sql);return {rows:[],rowCount:0};}const r=await pg.query(sql,args);return {rows:r.rows,rowCount:r.affectedRows??r.rows.length};};
const dbExports={db:{query},many:async(...a)=>(await query(...a)).rows,oneOrNone:async(...a)=>(await query(...a)).rows[0]??null,pool:{connect:async()=>({query,release(){}})}};
const ctx=vm.createContext({console,process,Buffer,URL,AbortSignal,fetch,setTimeout,clearTimeout,setInterval,clearInterval,structuredClone});const cache=new Map();
async function load(file){if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(await readFile(file,'utf8'),{context:ctx,identifier:file,initializeImportMeta(meta){meta.url='file://'+file}});cache.set(file,m);await m.link(async(spec,parent)=>{let obj;if(spec==='@bom/db')obj=dbExports;else if(spec==='@bom/redis')obj={redis:{},releaseLease:async()=>{}};else if(spec==='./openai.js')obj={openAIEnabled:()=>false,openAIResponse:async()=>null};else if(spec.startsWith('.'))return load(fileURLToPath(new URL(spec,'file://'+parent.identifier)));else obj=await import(spec);return new vm.SyntheticModule(Object.keys(obj),function(){for(const [k,v]of Object.entries(obj))this.setExport(k,v)},{context:ctx});});return m;}
let roles=[];const guild='guild',actor='123456789012345';let app;
await test('trusted correction role can teach; normal members cannot publish',async()=>{
 for(const f of (await readdir(new URL('packages/db/migrations/',root))).filter(f=>f.endsWith('.sql')).sort())await pg.exec(await readFile(new URL('packages/db/migrations/'+f,root),'utf8'));
 await query("INSERT INTO community_settings(guild_id,correction_role_id) VALUES($1,'editor')",[guild]);
 await query("INSERT INTO wiki_sources(source_id,name,source_kind) VALUES('test','Verified test source','manual')");
 await query(`INSERT INTO wiki_records(id,source_id,record_key,entity_key,kind,name,data,qualifiers) VALUES($1,'test','anson','ship:anson','ship','Anson','{"stats":{"hold":18500}}','{"current":true}')`,[randomUUID()]);
 const mod=await load(fileURLToPath(new URL('apps/api/dist/wiki.js',root)));await mod.evaluate();app=Fastify();app.setErrorHandler((e,req,reply)=>reply.code(e.statusCode??500).send({message:e.message}));mod.namespace.registerWikiRoutes(app,{guildId:guild,userId:()=>actor,requireMember:async()=>({member:true,roles}),requireAdmin:async(req,reply)=>{reply.code(403).send({error:'admin_required'});return false;}});
 assert.equal((await app.inject({method:'POST',url:'/v1/wiki/teach',payload:{statement:'Anson can carry 20,000 cargo'}})).statusCode,403);
 roles=['editor'];
 const reply=await app.inject({method:'POST',url:'/v1/wiki/teach',payload:{statement:'Anson can carry 20,000 cargo',sourceMessageId:'223456789012345',sourceChannelId:'323456789012345'}});assert.equal(reply.statusCode,200,reply.body);assert.equal(reply.json().patch.value,20000);
});
await test('corrections persist, duplicates do not add active overrides, and the Wiki reads the saved value',async()=>{
 const repeat=await app.inject({method:'POST',url:'/v1/wiki/teach',payload:{statement:'Anson can carry 20,000 cargo',sourceMessageId:'223456789012345'}});assert.equal(repeat.statusCode,200,repeat.body);
 assert.equal(Number((await query('SELECT COUNT(*) n FROM wiki_overrides WHERE revoked_at IS NULL')).rows[0].n),1);
 const article=await app.inject('/v1/wiki/article/ship%3Aanson');assert.equal(article.statusCode,200,article.body);assert.ok(article.body.includes('20000'),article.body);
 const ambiguous=await app.inject({method:'POST',url:'/v1/wiki/teach',payload:{statement:'Anson carries 22000 with upgrades'}});assert.equal(ambiguous.json().status,'clarification');
 assert.equal(Number((await query('SELECT value FROM wiki_overrides WHERE revoked_at IS NULL')).rows[0].value),20000);
 const invalid=await app.inject({method:'POST',url:'/v1/wiki/teach',payload:{entityKey:'ship:anson',fieldPath:'stats.hold',value:-1}});assert.equal(invalid.statusCode,400,invalid.body);
});
if(app)await app.close();await pg.close();
