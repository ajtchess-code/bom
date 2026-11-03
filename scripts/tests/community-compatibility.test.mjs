import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as crypto from 'node:crypto';
const root=new URL('../../',import.meta.url);
function synthetic(obj){return new vm.SyntheticModule(Object.keys(obj),function(){for(const [k,v] of Object.entries(obj))this.setExport(k,v);});}
const source=p=>readFileSync(new URL(p,root),'utf8');
const mod=p=>new vm.SourceTextModule(stripTypeScriptTypes(source(p)),{identifier:p});
test('DB exports restore legacy encrypted credential operations',async()=>{
 let row=null;
 class Pool{on(){} async query(sql,args=[]){if(sql.startsWith('INSERT'))row={ciphertext:args[0]};if(sql.startsWith('DELETE'))row=null;return {rows:row?[row]:[],rowCount:row?1:0};}}
 const index=mod('packages/db/src/index.ts'),credentials=mod('packages/db/src/credentials.ts');
 process.env.DATABASE_URL='postgresql://test:test@localhost/test';
 const oldToken=process.env.INTERNAL_API_TOKEN,oldKey=process.env.OPENAI_API_KEY;
 process.env.INTERNAL_API_TOKEN='offline-stable-test-secret-at-least-32';process.env.OPENAI_API_KEY='offline-environment-key';
 try{await index.link((spec)=>spec==='pg'?synthetic({Pool}):spec==='./credentials.js'?credentials:spec==='./recruitmentLifecycle.js'?synthetic({finalApplicationStates:[],finishApplication:async()=>null,cancelPortBattle:async()=>null}):spec==='./index.js'?index:synthetic(crypto));await index.evaluate();const api=index.namespace;
 assert.equal(await api.getOpenAIKey(),'offline-environment-key');await api.saveOpenAIKey('offline-secret-key','test');assert.ok(!row.ciphertext.includes('offline-secret-key'));assert.equal(await api.getOpenAIKey(),'offline-secret-key');assert.ok(!JSON.stringify(await api.openAICredentialStatus()).includes('offline-secret-key'));row.ciphertext=row.ciphertext.slice(0,-4)+'AAAA';await assert.rejects(api.getOpenAIKey());await api.removeOpenAIKey();assert.equal(await api.getOpenAIKey(),'offline-environment-key');
 }finally{if(oldToken===undefined)delete process.env.INTERNAL_API_TOKEN;else process.env.INTERNAL_API_TOKEN=oldToken;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;delete process.env.DATABASE_URL;}
});
test('community module links and uses Wiki gateway without an OpenAI key gate',async()=>{
 const m=mod('apps/controller/src/community.ts');
 await m.link(async spec=>{if(spec==='./dmDelivery.js')return synthetic({sendBotDm:async()=>({ok:true}),installDmMuteControls:()=>{}});if(spec==='@bom/db')return synthetic({db:{},many:()=>[],oneOrNone:()=>null,pool:{}});if(spec==='@bom/shared')return synthetic({applyWikiOverrides:()=>{},wikiGuideText:()=>''});if(spec==='./conversationRouter.js')return synthetic({conversationOwner:async()=> 'community',registerConversationMatcher:()=>{},rememberConversationReply:async()=>{}});if(spec==='./askShipFacts.js')return synthetic({shipFactFromRecords:()=>null,isAskRetry:()=>false});if(spec==='./membership.js')return synthetic({refreshWelcomePanel:()=>{}});if(spec==='discord.js')return synthetic({PermissionFlagsBits:{}});if(spec==='./openai.js')return synthetic({openAIResponse:()=>null,openAIEnabled:()=>true});return synthetic(await import(spec));});await m.evaluate();assert.equal(typeof m.namespace.installCommunity,'function');
 const s=source('apps/controller/src/community.ts');assert.ok(!s.includes('getOpenAIKey'));assert.ok(s.includes("openAIEnabled('OPENAI_WIKI_ENABLED')"));assert.equal((s.match(/openAIResponse\(\{feature:'wiki'/g)||[]).length,2);
});
test('Ask still uses database evidence when the optional article definition file is missing',async()=>{
 const m=mod('apps/controller/src/community.ts');let sent='';
 await m.link(async spec=>{if(spec==='./dmDelivery.js')return synthetic({sendBotDm:async()=>({ok:true}),installDmMuteControls:()=>{}});
  if(spec==='@bom/db')return synthetic({db:{query:async()=>({rows:[]})},many:async()=>[],oneOrNone:async sql=>sql.includes('community_settings')?{ask_enabled:true,ask_channel_id:'ask'}:sql.includes('membership_settings')?{custom_roles_enabled:true}:null,pool:{}});
  if(spec==='@bom/shared')return synthetic({applyWikiOverrides:rows=>rows,wikiGuideText:()=>''});
  if(spec==='./conversationRouter.js')return synthetic({conversationOwner:async()=> 'community',registerConversationMatcher:()=>{},rememberConversationReply:async()=>{}});
  if(spec==='./askShipFacts.js')return synthetic({shipFactFromRecords:()=>null,isAskRetry:()=>false});
  if(spec==='./membership.js')return synthetic({refreshWelcomePanel:()=>{}});
  if(spec==='discord.js')return synthetic({PermissionFlagsBits:{}});
  if(spec==='node:fs/promises')return synthetic({readFile:async path=>{if(String(path).endsWith('articles.json'))throw new Error('ENOENT');return '';}});
  if(spec==='./openai.js')return synthetic({openAIEnabled:()=>true,openAIResponse:async()=>({text:JSON.stringify({supported:true,answer:'Open Members → Custom Role to submit your role request.',sourceIds:['guide:wiki:custom-roles']})})});
  return synthetic(await import(spec));
 });await m.evaluate();await m.namespace.handleQuestion({channelId:'ask',content:'How do I request a custom role?',author:{id:'captain'},mentions:{roles:{has:()=>false}},channel:{sendTyping:async()=>{}},reply:async body=>{sent=body.content;return{id:'reply'}}});assert.match(sent,/Custom Role/);assert.ok(!sent.includes('sufficiently supported'));
});
