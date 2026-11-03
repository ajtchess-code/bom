import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import RedisMock from 'ioredis-mock';
const root=fileURLToPath(new URL('../../',import.meta.url));
const pg=new PGlite();
let turn=Promise.resolve();
const query=async(sql,values=[])=>{
 // PGlite is a single PostgreSQL session; advisory locks are exercised by real PostgreSQL in deployment.
 const r=await pg.query(sql,values.map(v=>v instanceof Date?v.toISOString():v));return {rows:r.rows,rowCount:r.affectedRows??r.rows.length};
};
const db={query};
const dbExports={db,oneOrNone:async(...a)=>(await query(...a)).rows[0]??null,many:async(...a)=>(await query(...a)).rows,pool:{async connect(){let unlock;const current=turn;turn=new Promise(r=>unlock=r);await current;return {query,release:()=>unlock()};}}};
const ctx=vm.createContext({console,process:{env:{DISCORD_GUILD_ID:'123456789012345',INTERNAL_API_TOKEN:'test'}},setTimeout,clearTimeout,setInterval,clearInterval,AbortSignal,fetch,URL,Date,performance});
async function load(path,overrides={},append=''){
 const cache=new Map();
 async function create(file){if(cache.has(file))return cache.get(file);const source=await readFile(file,'utf8');const mod=new vm.SourceTextModule(source+(file===path?append:''),{context:ctx,identifier:file});cache.set(file,mod);await mod.link(async(spec,parent)=>{
   if(overrides[spec]){const obj=overrides[spec];return new vm.SyntheticModule(Object.keys(obj),function(){for(const [k,v]of Object.entries(obj))this.setExport(k,v)},{context:ctx});}
   if(spec.startsWith('.'))return create(fileURLToPath(new URL(spec,'file://'+parent.identifier)));
   const obj=await import(spec);return new vm.SyntheticModule(Object.keys(obj),function(){for(const [k,v]of Object.entries(obj))this.setExport(k,v)},{context:ctx});
 });return mod;}
 const mod=await create(path);await mod.evaluate();return mod.namespace;
}
let state,roles;
await test('all bundled migrations apply, including upgrade over existing settings',async()=>{
 const files=(await readdir(root+'packages/db/migrations')).filter(x=>x.endsWith('.sql')).sort();
 for(const f of files){if(f.startsWith('032'))await query(`INSERT INTO bom_banter_settings(guild_id) VALUES('existing')`);await pg.exec(await readFile(root+'packages/db/migrations/'+f,'utf8'));}
 assert.ok(files.includes('033_sentinel_schema_repair.sql'));assert.ok(files.includes('030_ask_rules_roles.sql'));assert.ok(files.includes('031_invitations_credentials.sql'));assert.equal(new Set(files).size,files.length);
 const old=(await query(`SELECT * FROM bom_banter_settings WHERE guild_id='existing'`)).rows[0];assert.equal(old.channel_cooldown_minutes,45);assert.equal(old.minimum_participants,1);
 await query(`UPDATE bom_banter_settings SET spontaneity=100,channel_cooldown_minutes=0,spontaneous_user_cooldown_seconds=0,daily_spontaneous_limit=1000,daily_total_limit=1000 WHERE guild_id='existing'`);
 await pg.exec(await readFile(root+'packages/db/migrations/032_banter_frequency.sql','utf8'));
 state=await load(root+'packages/redis/dist/index.js',{'@bom/db':dbExports});
 const src=await readFile(root+'packages/db/dist/index.js','utf8');
 const start=src.indexOf('export async function queryRoleHistory');
 const mod=new vm.SourceTextModule(`const {oneOrNone,many}=globalThis.testDB;\n`+src.slice(start).replace(/^export \{.*credentials.*$/m,''),{context:ctx});ctx.testDB=dbExports;await mod.link(()=>{});await mod.evaluate();roles=mod.namespace;
});
await test('PostgreSQL budgets reserve atomically across concurrent requests and refund unused replies',async()=>{
 const limits=[{key:'test:cap:total',limit:5,ttlSeconds:100},{key:'test:cap:ambient',limit:3,ttlSeconds:100}];
 const outcomes=await Promise.all(Array.from({length:30},()=>state.reserveCounters(limits)));
 assert.equal(outcomes.filter(Boolean).length,3);assert.equal(await state.redis.get(limits[0].key),'3');
 await state.refundCounters(limits.map(x=>x.key));assert.equal(await state.redis.get(limits[0].key),'2');assert.equal(await state.reserveCounters(limits),true);
 await state.releaseLease('test:no-key','token');
 await state.redis.set('test:lease','new-token','EX',30);await state.releaseLease('test:lease','stale-token');assert.equal(await state.redis.get('test:lease'),'new-token');await state.releaseLease('test:lease','new-token');assert.equal(await state.redis.get('test:lease'),null);
});
await test('expired PostgreSQL counters reset and legacy multi increment works',async()=>{
 await query(`INSERT INTO live_kv(key_name,value_text,expires_at) VALUES('test:expired','999',NOW()-interval '1 second')`);
 assert.equal(await state.reserveCounters([{key:'test:expired',limit:2,ttlSeconds:100}]),true);assert.equal(await state.redis.get('test:expired'),'1');
 const result=await state.redis.multi().incr('test:multi').expire('test:multi',60).exec();assert.equal(result[0][1],1);assert.ok(await state.redis.ttl('test:multi')>0);
});
await test('Redis Lua budgets and lease ownership match PostgreSQL behavior',async()=>{
 ctx.process.env.REDIS_URL='redis://127.0.0.1:6379';const memory=await load(root+'packages/redis/dist/index.js',{'@bom/db':dbExports,ioredis:{Redis:RedisMock}});delete ctx.process.env.REDIS_URL;
 const limits=[{key:'redis:cap',limit:2,ttlSeconds:30}];assert.equal(await memory.reserveCounters(limits),true);assert.equal(await memory.reserveCounters(limits),true);assert.equal(await memory.reserveCounters(limits),false);
 await memory.refundCounters(['redis:cap']);assert.equal(await memory.redis.get('redis:cap'),'1');await memory.redis.set('lease','second');await memory.releaseLease('lease','first');assert.equal(await memory.redis.get('lease'),'second');await memory.releaseLease('lease','second');assert.equal(await memory.redis.get('lease'),null);memory.redis.disconnect();memory.redisSub.disconnect();
});
await test('role query counts more than 50 events, respects direction and time, and deduplicates evidence',async()=>{
 const now=Date.now();
 for(let i=0;i<75;i++)await query(`INSERT INTO sentinel_events(id,guild_id,source,category,action,target_id,occurred_at,metadata) VALUES($1,'guild','discord','role','member.roles.changed','member',$2,$3::jsonb)`,[randomUUID(),new Date(now-i*1000),JSON.stringify({added:['role'],removed:[]})]);
 await query(`INSERT INTO sentinel_events(id,guild_id,source,category,action,target_id,occurred_at,metadata) VALUES('00000000-0000-4000-8000-000000000001','guild','discord','role','member.roles.changed','member',NOW(),' {"added":[],"removed":["role"]}'::jsonb)`);
 await query(`INSERT INTO sentinel_events(id,guild_id,source,category,action,target_id,occurred_at,metadata,caused_by_event_id) SELECT $1,guild_id,'discord_audit',category,action,target_id,occurred_at,metadata,id FROM sentinel_events WHERE guild_id='guild' AND id<>'00000000-0000-4000-8000-000000000001' ORDER BY occurred_at DESC LIMIT 1`,[randomUUID()]);
 const all=await roles.queryRoleHistory({guildId:'guild',memberId:'member',range:{},limit:5});assert.equal(all.count,76);assert.equal(all.rows.length,5);
 const added=await roles.queryRoleHistory({guildId:'guild',memberId:'member',roleId:'role',direction:'added',range:{},limit:0});assert.equal(added.count,75);
 const recent=await roles.queryRoleHistory({guildId:'guild',memberId:'member',direction:'added',range:{from:new Date(now-2000)},limit:5});assert.equal(recent.count,3);
 const none=await roles.queryRoleHistory({guildId:'guild',memberId:'member',direction:'removed',range:{to:new Date(now-100000)},limit:5});assert.equal(none.count,0);
});
await test('one cached routing decision wins simultaneous listeners and replies stay with their system',async()=>{
 const router=await load(root+'apps/controller/dist/conversationRouter.js',{'@bom/redis':state});let checks=0;
 router.registerConversationMatcher('wiki',50,async m=>{checks++;return m.content.includes('cargo')});router.registerConversationMatcher('banter',10,async()=>true);
 const msg={content:'what cargo?',client:{user:{id:'bot'}},author:{bot:false}};assert.deepEqual(await Promise.all([router.conversationOwner(msg),router.conversationOwner(msg)]),['wiki','wiki']);assert.equal(checks,1);
 const botReply={id:'old',author:{id:'bot'},components:[]};const reply={...msg,content:'hello',reference:{messageId:'old'},channel:{messages:{cache:new Map([['old',botReply]])}}};assert.equal(await router.conversationOwner(reply),'none');
 await router.rememberConversationReply('old','banter');assert.equal(await router.conversationOwner({...reply}),'banter');
 botReply.components=[{custom_id:'wiki:share:abc'}];await state.redis.del('conversation:reply:old');assert.equal(await router.conversationOwner({...reply}),'wiki');
});
await test('Banter factual routing, exclusions, failed cooldown refunds, and early acknowledgement',async()=>{
 let generated='A sharp pirate comeback.',calls=[];
 const banter=await load(root+'apps/controller/dist/banter.js',{'@bom/db':dbExports,'@bom/redis':state,'./conversationRouter.js':{conversationOwner:async()=> 'banter',registerConversationMatcher(){},rememberConversationReply:async()=>{},referencedConversationOwner:async()=> 'none'},'./openai.js':{openAIResponse:async()=>generated?{text:generated}:null,aiGatewayStatus:async()=>null,aiFailureMessage:()=> 'Test provider unavailable.'}},'\nexport {replyToMessage,contextFor,candidate};');
 assert.equal(banter.banterShouldDeferToWiki('<@123> what is the best build for Victory?','123'),true);assert.equal(banter.banterShouldDeferToWiki('<@123> roast my terrible sailing','123'),false);
 assert.equal(banter.candidate('We really enjoyed that session together.'),true);
 const settings={enabled:true,spontaneous_enabled:true,roast_enabled:true,aggression:7,spontaneity:100,channel_cooldown_minutes:0,spontaneous_user_cooldown_seconds:0,minimum_participants:1,daily_spontaneous_limit:100,daily_total_limit:300,context_messages:3,spontaneous_channels:[],excluded_channels:[],excluded_role_ids:['muted'],custom_instructions:''};
 const mk=(id,roles,content)=>({id,content,author:{id,bot:false,username:id},member:{displayName:id,roles:{cache:new Map(roles.map(r=>[r,{}]))}},createdTimestamp:Date.now()});const m=mk('trigger',[],'The fleet is doing quite well today.');m.channelId='test-channel';m.client={user:{id:'bot'}};m.channel={messages:{fetch:async()=>new Map([['trigger',m],['excluded',mk('excluded',['muted'],'SHOULD_NOT_BE_SENT')]])}};m.inGuild=()=>true;m.reply=async()=>({id:'sent'});
 assert.equal((await banter.contextFor(m,3,settings)).includes('SHOULD_NOT_BE_SENT'),false);
 generated=null;await banter.replyToMessage(m,'spontaneous',{...settings,channel_cooldown_minutes:1,spontaneous_user_cooldown_seconds:30});assert.equal(await state.redis.get('banter:member:123456789012345:trigger:ambient'),null);assert.equal(await state.redis.get('banter:channel:123456789012345:test-channel:spontaneous'),null);
 const interaction={commandName:'banter-status',memberPermissions:{has:()=>true},channelId:'test',deferReply:async()=>calls.push('defer'),editReply:async()=>calls.push('edit')};await banter.handleBanterStatus(interaction);assert.deepEqual(calls,['defer','edit']);
});
await test('AI gateway works on PostgreSQL fallback and explains exhausted budgets',async()=>{
 ctx.process.env.GROQ_API_KEY='synthetic';let requests=0;ctx.fetch=async()=>{requests++;return {ok:true,headers:{get:()=>null},json:async()=>({choices:[{message:{content:'BOM OK'}}]})}};
 const gateway=await load(root+'apps/api/dist/aiGateway.js',{'@bom/db':dbExports,'@bom/redis':state});
 const output=await gateway.generateAi({feature:'banter',input:'synthetic test',sensitivity:'public'});assert.equal(output.text,'BOM OK');assert.equal(requests,1);
 assert.equal((await gateway.aiStatus()).rateLimiterBackend,'postgres-fallback');
 const date=new Date().toISOString().slice(0,10);await state.redis.set(`ai:day:feature:123456789012345:banter:${date}`,'999','EX',30);assert.equal((await gateway.aiAvailability('banter')).reason,'daily_budget_exhausted');
});

await test('assistant scopes isolate Discord channels and concurrent requests get a retryable response',async()=>{
 const {default:Fastify}=await import('fastify');
 const helpers=await load(root+'apps/api/dist/assistantContext.js',{'@bom/redis':state});
 assert.equal(helpers.contextSystem({headers:{'x-bom-context-scope':'discord:123456789012345'}}),'wiki:discord:123456789012345');
 assert.equal(helpers.contextSystem({headers:{'x-bom-context-scope':'unsafe'}}),'wiki');
 const app=Fastify();helpers.installAssistantRequestLocks(app,'test-guild');let finish,started;const ready=new Promise(r=>started=r);
 app.post('/v1/wiki/ask',async()=>{started();await new Promise(r=>finish=r);return {ok:true};});
 const headers={'x-discord-user-id':'actor'};const first=app.inject({method:'POST',url:'/v1/wiki/ask',headers,payload:{question:'one'}});await ready;
 const second=await app.inject({method:'POST',url:'/v1/wiki/ask',headers,payload:{question:'two'}});assert.equal(second.statusCode,409);finish();assert.equal((await first).statusCode,200);assert.equal(await state.redis.get('assistant:busy:test-guild:actor:wiki'),null);await app.close();
});
await test('Banter concurrent channels cannot exceed its delivered-response budget',async()=>{
 const fakeAi={openAIResponse:async()=>({text:'Synthetic pirate joke.'}),aiGatewayStatus:async()=>null,aiFailureMessage:()=>''};
 const banter=await load(root+'apps/controller/dist/banter.js',{'@bom/db':dbExports,'@bom/redis':state,'./conversationRouter.js':{conversationOwner:async()=> 'banter',registerConversationMatcher(){},rememberConversationReply:async()=>{},referencedConversationOwner:async()=> 'none'},'./openai.js':fakeAi},'\nexport {replyToMessage};');
 const date=new Date().toISOString().slice(0,10);await state.redis.del(`banter:123456789012345:${date}:total`,`banter:123456789012345:${date}:spontaneous`);
 const settings={daily_total_limit:3,daily_spontaneous_limit:3,channel_cooldown_minutes:0,spontaneous_user_cooldown_seconds:0,context_messages:3,aggression:5,custom_instructions:''};let delivered=0;
 await Promise.all(Array.from({length:15},(_,i)=>banter.replyToMessage({channelId:'concurrent-'+i,author:{id:'user-'+i,username:'test'},client:{user:{id:'bot'}},content:'A synthetic eligible test message.',channel:{},inGuild:()=>false,reply:async()=>{delivered++;return {id:'sent-'+i};}},'spontaneous',settings)));
 assert.equal(delivered,3);assert.equal(await state.redis.get(`banter:123456789012345:${date}:total`),'3');
});
await test('Banter settings API accepts Frequent preset limits and saves them',async()=>{
 const {default:Fastify}=await import('fastify');
 const api=await load(root+'apps/api/dist/banter.js',{'@bom/db':dbExports,'@bom/redis':state,'./authz.js':{discordContext:async()=>({roles:[],textChannels:[]})},'./aiGateway.js':{generateAi:async()=>null,providerConfigured:()=>true,aiFeatureAvailable:()=>true,getAiRoute:async()=>({daily_limit:300,minute_limit:20}),aiAvailability:async()=>({available:true,reason:'ready'})}});
 const app=Fastify();api.registerBanterRoutes(app,{guildId:'api-test',requireAdmin:async()=>true,userId:()=> 'admin'});
 const payload={enabled:true,spontaneous_enabled:true,roast_enabled:true,aggression:9,spontaneity:100,channel_cooldown_minutes:0,spontaneous_user_cooldown_seconds:10,minimum_participants:1,daily_spontaneous_limit:250,daily_total_limit:300,context_messages:12,spontaneous_channels:[],excluded_channels:[],excluded_role_ids:[],custom_instructions:''};
 const response=await app.inject({method:'PUT',url:'/v1/banter/settings',payload});assert.equal(response.statusCode,200,response.body);
 const row=await dbExports.oneOrNone(`SELECT * FROM bom_banter_settings WHERE guild_id='api-test'`);assert.equal(row.spontaneity,100);assert.equal(row.channel_cooldown_minutes,0);assert.equal(row.spontaneous_user_cooldown_seconds,10);
 const invalid=await app.inject({method:'PUT',url:'/v1/banter/settings',payload:{...payload,spontaneity:101}});assert.equal(invalid.statusCode,400);await app.close();
});
await test('/roast acknowledges before I/O and failed generation releases its cooldown and reservation',async()=>{
 const events=[];
 const banter=await load(root+'apps/controller/dist/banter.js',{'@bom/db':dbExports,'@bom/redis':state,'./conversationRouter.js':{conversationOwner:async()=> 'banter',registerConversationMatcher(){},rememberConversationReply:async()=>{},referencedConversationOwner:async()=> 'none'},'./openai.js':{openAIResponse:async()=>null,aiGatewayStatus:async()=>null,aiFailureMessage:()=>''}});
 const interaction={commandName:'roast',guildId:'123456789012345',user:{id:'roaster'},channelId:'roast-test',member:{roles:[]},options:{getString:()=> 'My awful ship'},deferReply:async()=>events.push('defer'),editReply:async()=>events.push('edit')};
 const date=new Date().toISOString().slice(0,10),key=`banter:123456789012345:${date}:total`,before=Number(await state.redis.get(key)??0);
 await banter.handleRoast(interaction);assert.equal(events[0],'defer');assert.equal(await state.redis.get('banter:roast:123456789012345:roaster'),null);assert.equal(Number(await state.redis.get(key)??0),before);
});
await test('self-service leave only removes the actor from an open battle and records the previous state',async()=>{
 const source=await readFile(root+'apps/api/src/wosbWorkspace.ts','utf8'),sql=source.match(/db\.query\(`(WITH removed AS [^`]+)`/)[1];
 const battle='11111111-1111-4111-8111-111111111111',signup='22222222-2222-4222-8222-222222222222',event='33333333-3333-4333-8333-333333333333';
 await query("INSERT INTO pb_battles(id,guild_id,port_key,port_name,team_size,status) VALUES($1,'leave-guild','aruba','Aruba',10,'OPEN')",[battle]);await query("INSERT INTO pb_signups(id,battle_id,guild_id,user_id,display_name) VALUES($1,$2,'leave-guild','owner','Owner')",[signup,battle]);
 assert.equal((await query(sql,[battle,'leave-guild','other',event])).rowCount,0);assert.equal((await query(sql,[battle,'other-guild','owner',event])).rowCount,0);
 await query("UPDATE pb_battles SET status='CLOSED' WHERE id=$1",[battle]);assert.equal((await query(sql,[battle,'leave-guild','owner',event])).rowCount,0);
 await query("UPDATE pb_battles SET status='OPEN' WHERE id=$1",[battle]);assert.equal((await query(sql,[battle,'leave-guild','owner',event])).rowCount,1);assert.equal((await query('SELECT * FROM pb_signups WHERE id=$1',[signup])).rows.length,0);assert.equal((await query('SELECT before_state FROM pb_assignment_events WHERE id=$1',[event])).rows[0].before_state.display_name,'Owner');
});

await pg.close();
