import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
const root=new URL('../../',import.meta.url);
const source=path=>readFile(new URL(path,root),'utf8');
test('missing identities fail closed before admin or member checks',async()=>{
 const s=await source('apps/api/src/index.ts');const code=s.slice(s.indexOf('async function requireMember'),s.indexOf('registerBrandingRoutes(app'));
 const ctx=vm.createContext({app:{addHook(){}},guildId:'guild',getAlliedGrant:async()=>null,pbAllyPathAllowed:()=>true,userId:req=>req.id??'',discordAccess:async()=>({member:true}),hasDashboardAdminAccess:async()=>true});
 vm.runInContext(stripTypeScriptTypes(code),ctx);let status;const reply={code(s){status=s;return this;},send(){return this;}};
 assert.equal(await ctx.requireMember({},reply),false);assert.equal(status,401);assert.equal(await ctx.requireAdmin({},reply),false);assert.equal(status,401);assert.equal(await ctx.requireAdmin({id:'admin'},reply),true);
});
test('Community owner wins competing listeners and sticks to answer replies',async()=>{
 const src=await source('apps/controller/src/conversationRouter.ts');const fakeRedis=new Map();const ctx=vm.createContext({});const mod=new vm.SourceTextModule(stripTypeScriptTypes(src),{context:ctx});
 await mod.link(()=>new vm.SyntheticModule(['redis'],function(){this.setExport('redis',{get:async key=>fakeRedis.get(key),set:async(key,value)=>fakeRedis.set(key,value)});},{context:ctx}));await mod.evaluate();const r=mod.namespace;
 r.registerConversationMatcher('community',100,async()=>true);r.registerConversationMatcher('wiki',50,async()=>true);r.registerConversationMatcher('banter',10,async()=>true);
 const message={author:{bot:false},content:'I need a custom role',client:{user:{id:'bot'}}};assert.equal(await r.conversationOwner(message),'community');
 await r.rememberConversationReply('answer','community');assert.equal(await r.referencedConversationOwner({client:{user:{id:'bot'}},reference:{messageId:'answer'},channel:{messages:{cache:new Map([['answer',{id:'answer',author:{id:'bot'}}]])}}}),'community');
});
test('assembled entrypoints wire community, invitations, and provider gateway',async()=>{
 const controller=await source('apps/controller/src/index.ts'),api=await source('apps/api/src/index.ts'),adapter=await source('apps/api/src/openai.ts');
 assert.ok(controller.includes('installCommunity(client)'));assert.ok(controller.includes('installPBInvitations(client,'));assert.ok(api.includes('registerCommunityRoutes(app,'));assert.ok(adapter.includes('generateAi('));
 const community=await source('apps/controller/src/community.ts');assert.ok(community.includes("conversationOwner(message)!=='community'"));
});
test('simultaneous forced panel refreshes coalesce without overlapping writes',async()=>{
 const s=await source('apps/controller/src/index.ts'),start=s.indexOf('async function syncPortBattleDiscord(force='),code=s.slice(start,s.indexOf('\n',start));let calls=0,active=0,max=0;const releases=[];
 const context=vm.createContext({guildId:'test',pool:{connect:async()=>({query:async()=>({rows:[{held:true}]}),release(){}})},syncPortBattleDiscordInner:async()=>{calls++;active++;max=Math.max(max,active);await new Promise(resolve=>releases.push(resolve));active--;}});vm.runInContext('let pbSyncPromise=null;let pbResyncRequested=false;'+code,context);
 const first=context.syncPortBattleDiscord(true),others=Array.from({length:8},()=>context.syncPortBattleDiscord(true));for(let i=0;i<20&&calls<1;i++)await Promise.resolve();assert.equal(calls,1);releases.shift()();for(let i=0;i<40&&calls<2;i++)await Promise.resolve();assert.equal(calls,2);releases.shift()();await Promise.all([first,...others]);assert.equal(max,1);assert.equal(calls,2);
});
test('allied identity receives PB-only access and global API hook blocks unrelated services',async()=>{const s=await source('apps/api/src/index.ts'),code=s.slice(s.indexOf('async function requireMember'),s.indexOf('registerBrandingRoutes(app'));const rules=await readFile(new URL('apps/api/src/pbAllies.ts',root),'utf8');const pathRule=rules.split('\n').find(x=>x.startsWith('export function pbAllyPathAllowed')).replace('export ','');let hook;let grant={tags:['FAT'],managerTags:['FAT']};const ctx=vm.createContext({app:{addHook(_name,fn){hook=fn;}},guildId:'guild',userId:req=>req.uid??'',getAlliedGrant:async()=>grant,discordAccess:async()=>({member:false}),hasDashboardAdminAccess:async()=>false});vm.runInContext(stripTypeScriptTypes(pathRule+'\n'+code),ctx);let status;const reply={code(n){status=n;return this;},send(){return this;}};await hook({uid:'ally',url:'/v1/music/summary',method:'GET'},reply);assert.equal(status,403);const access=await ctx.requireMember({uid:'ally',url:'/v1/access',method:'GET'},reply);assert.equal(access.member,true);assert.equal(access.pbOnly,true);grant=null;const revoked=await ctx.requireMember({uid:'ally',url:'/v1/access',method:'GET'},reply);assert.equal(revoked,null);assert.equal(status,403);});
