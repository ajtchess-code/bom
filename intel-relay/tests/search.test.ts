import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {AccountManager} from '../src/accounts/manager.js';
import {AccountStore} from '../src/accounts/store.js';
import {Logger} from '../src/logging/logger.js';
const guildId='123456789012345678',channelId='234567890123456789';
test('server search enforces visible history, excludes context, and never returns credentials',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'intel-search-'));const native=globalThis.fetch;
 try{const manager=new AccountManager(new AccountStore(dir),new Logger('error'));const internal=manager as any;internal.accounts=[{id:'account',token:'private-test-token'}];const member={};const guild={id:guildId,members:{cache:new Map([['self',member]])}};
 internal.running.set('account',{client:{isReady:()=>true,user:{id:'self'},guilds:{cache:new Map([[guildId,guild]])},channels:{fetch:async(id:string)=>({guild,name:'general',permissionsFor:()=>({has:()=>id===channelId})})}}});
 let requested='';globalThis.fetch=async(input:any)=>{requested=String(input);return Response.json({total_results:2,messages:[[{id:'context',hit:false,channel_id:channelId,content:'context'}],[{id:'hit',hit:true,channel_id:channelId,content:'visible',author:{username:'Captain'}}],[{id:'denied',hit:true,channel_id:'345678901234567890',content:'hidden'}]]});};
 const result=await manager.search('account',{guildId,query:'test & words'});assert.equal(result.state,'ready');assert.equal(result.messages.length,1);assert.equal(result.messages[0]?.content,'visible');assert.ok(requested.includes('content=test+%26+words'));assert.ok(!JSON.stringify(result).includes('private-test-token'));
 const limited=await manager.search('account',{guildId,query:'again'});assert.equal(limited.state,'rate_limited');
 await assert.rejects(()=>manager.search('account',{guildId:'456789012345678901',query:'forbidden'}),/Guild not available/);
 internal.searchAfter.clear();globalThis.fetch=async()=>new Response('{}',{status:202});assert.equal((await manager.search('account',{guildId,query:'index'})).state,'indexing');
 internal.searchAfter.clear();globalThis.fetch=async()=>Response.json({retry_after:5},{status:429});const throttle=await manager.search('account',{guildId,query:'slow'});assert.equal(throttle.state,'rate_limited');assert.equal(throttle.retryAfterMs,5000);
 }finally{globalThis.fetch=native;rmSync(dir,{recursive:true,force:true});}
});
