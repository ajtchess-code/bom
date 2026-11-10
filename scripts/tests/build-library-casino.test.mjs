import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import Fastify from 'fastify';
import sharp from 'sharp';
import {z} from 'zod';
const root=new URL('../../',import.meta.url),pg=new PGlite();
const source=async path=>stripTypeScriptTypes(await readFile(new URL(path,root),'utf8')).replace(/^import .*;\n/gm,'').replace(/export /g,'');
const rules=Function('z',(await source('apps/api/src/casinoRules.ts'))+';return {coinAmount,exchangeRate,exchangeCoins,wagerLeg,battleDay,settleLegs,legResult};')(z);
let tail=Promise.resolve();
const pool={async connect(){let release;const next=new Promise(r=>release=r),previous=tail;tail=next;await previous;return {query:(s,a)=>pg.query(s,a),release};}};
const db={query:async(s,a)=>{if(!a){await pg.exec(s);return {rows:[],rowCount:0};}const r=await pg.query(s,a);return {...r,rowCount:r.affectedRows??r.rows.length};}};
const many=async(s,a)=>(await db.query(s,a)).rows,oneOrNone=async(s,a)=>(await many(s,a))[0];
// PGlite returns affectedRows; match pg's rowCount contract.
const baseConnect=pool.connect.bind(pool);pool.connect=async()=>{const c=await baseConnect();return {...c,query:async(s,a)=>{const r=await c.query(s,a);return {...r,rowCount:r.affectedRows??r.rows.length};}};};
const guildId='guild',admin='admin',alice='alice',bob='bob';
const requireMember=async(req,reply)=>req.headers.user==='outsider'?{member:true,allianceOnly:true}:{member:true};
const requireAdmin=async(req,reply)=>{if(req.headers.user===admin)return true;reply.code(403).send({error:'admin only'});return false;};
const dependencies={pool,db,many,oneOrNone,readFile,URL,sharp,z,randomUUID,createHash,randomInt:()=>0,...rules};
let casinoSrc=await source('apps/api/src/casino.ts');casinoSrc=casinoSrc.replace('import.meta.url',JSON.stringify(new URL('apps/api/src/casino.ts',root).href));
const {registerCasino}=Function(...Object.keys(dependencies),casinoSrc+';return {registerCasino};')(...Object.values(dependencies));
const handleError=(error,req,reply)=>reply.code(error instanceof z.ZodError?400:error.statusCode??500).send({error:error.message});
const app=Fastify();app.setErrorHandler(handleError);registerCasino(app,{guildId,requireMember,requireAdmin,userId:req=>req.headers.user,isAdmin:async uid=>uid===admin,ports:['Nevis','Cursed City']});
const call=(method,path,payload,user=alice)=>app.inject({method,url:'/v1/casino'+path,payload,headers:{user}});
const png='data:image/png;base64,'+(await sharp({create:{width:4,height:4,channels:3,background:'#123456'}}).png().toBuffer()).toString('base64');
const key=()=>randomUUID();
async function fund(user,amount){await db.query('INSERT INTO casino_accounts VALUES($1,$2,$3) ON CONFLICT(guild_id,account) DO UPDATE SET balance=casino_accounts.balance+EXCLUDED.balance',[guildId,'USER:'+user,amount]);}
async function bal(account){return BigInt((await oneOrNone('SELECT balance::text FROM casino_accounts WHERE guild_id=$1 AND account=$2',[guildId,account]))?.balance??0);}
let battle,wager,reqId;
test('casino denies allied access and approvals require admin',async()=>{assert.equal((await call('GET','',undefined,'outsider')).statusCode,403);assert.equal((await call('PUT','/admin/rates',{item:'Wood',coinsPerUnit:'10'})).statusCode,403);});
test('deposit proof remains pending without rates and is credited exactly once after review',async()=>{
 const requestKey=key(),a=await call('POST','/requests',{item:'Wood',quantity:'10',screenshot:png,requestKey});assert.equal(a.statusCode,200,a.body);reqId=a.json().id;
 const duplicate=await call('POST','/requests',{item:'Wood',quantity:'10',screenshot:png,requestKey});assert.equal(duplicate.json().id,reqId);
 assert.equal((await call('GET',`/requests/${reqId}/image`,undefined,bob)).statusCode,404);
 const missing=await call('POST',`/admin/requests/${reqId}/review`,{approve:true,note:'Verified'},admin);assert.equal(missing.statusCode,400,missing.body);assert.equal(await bal('USER:alice'),0n);
 assert.equal((await call('PUT','/admin/rates',{item:'Wood',coinsPerUnit:'10'},admin)).statusCode,200);
 assert.equal((await call('POST',`/admin/requests/${reqId}/review`,{approve:true,note:'Verified fort receipt'},admin)).statusCode,200);
 assert.equal(await bal('USER:alice'),100n);assert.equal((await call('POST',`/admin/requests/${reqId}/review`,{approve:true,note:'Again'},admin)).statusCode,409);assert.equal(await bal('USER:alice'),100n);
});
test('coinflip reserve, exact payouts, idempotency, large amounts and concurrent insufficient balances',async()=>{
 const p={stake:'10',choice:'HEADS',requestKey:key()};assert.equal((await call('POST','/flip',p)).statusCode,409);
 await fund(admin,'10000');assert.equal((await call('POST','/admin/fund-house',{amount:'10000'},admin)).statusCode,200);
 const r=await call('POST','/flip',p);assert.equal(r.statusCode,200,r.body);assert.equal(r.json().payout,'20');assert.equal(await bal('USER:alice'),110n);const retry=await call('POST','/flip',p);assert.equal(retry.json().id,r.json().id);assert.equal(await bal('USER:alice'),110n);
 await fund('large','9007199254740993');const lose=await call('POST','/flip',{stake:'9007199254740993',choice:'TAILS',requestKey:key()},'large');assert.equal(lose.statusCode,409); // reserve cannot cover it
 const both=await Promise.all([call('POST','/flip',{stake:'100',choice:'TAILS',requestKey:key()}),call('POST','/flip',{stake:'100',choice:'TAILS',requestKey:key()})]);assert.deepEqual(both.map(r=>r.statusCode).sort(),[200,409]);assert.equal(await bal('USER:alice'),10n);
});
test('unmatched offers refund completely, self-taking fails, and concurrent takes debit once',async()=>{
 await fund(alice,'1000');await fund(bob,'1000');await fund('charlie','1000');
 const r=await call('POST','/battles',{port:'Nevis',attackers:'BOM',defenders:'CBS',startsAt:new Date(Date.now()+3600000).toISOString()});assert.equal(r.statusCode,200,r.body);battle=r.json().id;
 let offer=await call('POST','/wagers',{stake:'100',legs:[{battleId:battle,kind:'OUTCOME',outcome:'ATTACKER'}],requestKey:key()});assert.equal(offer.statusCode,200,offer.body);let id=offer.json().id;const before=await bal('USER:alice');assert.equal((await call('POST',`/wagers/${id}/accept`,{})).statusCode,400);assert.equal((await call('POST',`/wagers/${id}/cancel`,{})).statusCode,200);assert.equal(await bal('USER:alice'),before+100n);
 offer=await call('POST','/wagers',{stake:'100',legs:[{battleId:battle,kind:'OUTCOME',outcome:'ATTACKER'}],requestKey:key()});wager=offer.json().id;
 const accepted=await Promise.all([call('POST',`/wagers/${wager}/accept`,{},bob),call('POST',`/wagers/${wager}/accept`,{},'charlie')]);assert.deepEqual(accepted.map(r=>r.statusCode).sort(),[200,409]);assert.equal(await bal('ESCROW'),200n);
});
test('verified settlement pays the winner once and collects 2% of profit only',async()=>{
 await db.query("UPDATE casino_battles SET starts_at=now()-interval '1 minute' WHERE id=$1",[battle]);const before=await bal('USER:alice'),house=await bal('HOUSE');const r=await call('POST',`/admin/battles/${battle}/result`,{outcome:'ATTACKER',evidence:'Verified battle report'},admin);assert.equal(r.statusCode,200,r.body);assert.equal(await bal('USER:alice'),before+198n);assert.equal(await bal('HOUSE'),house+2n);assert.equal(await bal('ESCROW'),0n);assert.equal((await call('POST',`/admin/battles/${battle}/result`,{outcome:'ATTACKER',evidence:'Again'},admin)).statusCode,409);
});
test('expiry returns unmatched escrow with no fee; invalid and cross-day multi-bets fail',async()=>{
 const b=(await call('POST','/battles',{port:'Cursed City',attackers:'BOM',defenders:'CBS',startsAt:new Date(Date.now()+7200000).toISOString()})).json().id;
 const offer=await call('POST','/wagers',{stake:'50',legs:[{battleId:b,kind:'KILLS',player:'Captain',comparison:'AT_LEAST',value:4}],requestKey:key()});assert.equal(offer.statusCode,200,offer.body);const before=await bal('USER:alice');await db.query("UPDATE casino_wagers SET closes_at=now()-interval '1 minute' WHERE id=$1",[offer.json().id]);await call('GET','');assert.equal(await bal('USER:alice'),before+50n);
 const next=(await call('POST','/battles',{port:'Nevis',attackers:'BOM',defenders:'CBS',startsAt:new Date(Date.now()+172800000).toISOString()})).json().id;
 assert.equal((await call('POST','/wagers',{stake:'1',legs:[{battleId:b,kind:'OUTCOME',outcome:'DRAW'},{battleId:next,kind:'OUTCOME',outcome:'ATTACKER'}],requestKey:key()})).statusCode,400);
 assert.equal((await call('POST','/wagers',{stake:'1',legs:[{battleId:b,kind:'TOP',player:'Captain',value:0}],requestKey:key()})).statusCode,400);
});
test('fractional exchange rates use exact arithmetic and round down only after multiplying',()=>{assert.equal(rules.exchangeCoins('10','0.50000000'),5n);assert.equal(rules.exchangeCoins('1000','0.00100000'),1n);assert.equal(rules.exchangeCoins('9007199254740993','1.00000000'),9007199254740993n);});
test('custom stats, exact / top / bottom ranking, missing evidence and multi-bet logic',()=>{
 const id=key(),b={id,status:'FINAL',outcome:'DRAW',results:{totalPlayers:20,players:[{player:'Captain',kills:4,deaths:2,damageDealt:9000,damageTaken:12000,rank:17}]}};
 const leg=(kind,value,comparison='AT_LEAST')=>({battleId:id,kind,player:'Captain',value,comparison});
 assert.equal(rules.legResult(leg('KILLS',4,'EXACT'),b),true);assert.equal(rules.legResult(leg('DEATHS',3,'AT_MOST'),b),true);assert.equal(rules.legResult(leg('DAMAGE_DEALT',10000),b),false);assert.equal(rules.legResult(leg('DAMAGE_TAKEN',12000),b),true);assert.equal(rules.legResult(leg('RANK',17),b),true);assert.equal(rules.legResult(leg('TOP',5),b),false);assert.equal(rules.legResult(leg('BOTTOM',5),b),true);
 assert.equal(rules.settleLegs([leg('KILLS',4),leg('BOTTOM',5)],[b]),'CREATOR');assert.equal(rules.settleLegs([leg('KILLS',4),leg('TOP',5)],[b]),'TAKER');assert.equal(rules.settleLegs([{...leg('KILLS',4),player:'Missing'}],[b]),'VOID');assert.equal(rules.settleLegs([leg('KILLS',4)],[{...b,status:'OPEN'}]),null);assert.equal(rules.battleDay('2026-11-11T02:00:00Z'),'2026-11-10');
});
let buildApp,privateFolder,publicFolder,buildId;
test('build library: nested folder access, private images, destination changes and stale edits',async()=>{
 let src=(await source('apps/api/src/buildLibrary.ts')).replace('import.meta.url',JSON.stringify(new URL('apps/api/src/buildLibrary.ts',root).href));const deps={db,many,oneOrNone,readFile,URL,sharp,z,randomUUID};const register=Function(...Object.keys(deps),src+';return registerBuildLibrary;')(...Object.values(deps));buildApp=Fastify();buildApp.setErrorHandler(handleError);register(buildApp,{guildId,requireMember,userId:req=>req.headers.user,catalogue:async()=>({ships:[{id:'ship',name:'Victory',rate:1}]})});const callB=(method,path,payload,user=alice)=>buildApp.inject({method,url:'/v1/wosb/build-library'+path,payload,headers:{user}});
 privateFolder=(await callB('POST','/folders',{scope:'PERSONAL',name:'Mine'})).json().id;publicFolder=(await callB('POST','/folders',{scope:'GUILD',name:'Fleet'})).json().id;
 assert.equal((await callB('POST','/folders',{scope:'PERSONAL',name:'Steal',folderId:privateFolder},bob)).statusCode,400);assert.equal((await callB('POST','/folders',{scope:'GUILD',name:'Leak',folderId:privateFolder})).statusCode,400);
 const sub=(await callB('POST','/folders',{scope:'PERSONAL',name:'PvP',folderId:privateFolder})).json().id;const b={scope:'PERSONAL',folderId:sub,shipKey:'ship',title:'Fleet build',description:'Screenshot',screenshot:png};const created=await callB('POST','',b);assert.equal(created.statusCode,200,created.body);buildId=created.json().id;assert.equal((await callB('GET',`/${buildId}/image`,undefined,bob)).statusCode,404);assert.equal((await callB('GET','',undefined,bob)).json().builds.length,0);
 assert.equal((await callB('DELETE','/folders/'+sub)).statusCode,409);assert.equal((await callB('PUT','/'+buildId,{...b,scope:'GUILD',folderId:publicFolder,revision:1})).statusCode,200);assert.equal((await callB('GET',`/${buildId}/image`,undefined,bob)).statusCode,200);assert.equal((await callB('PUT','/'+buildId,{...b,revision:1})).statusCode,409);assert.equal((await callB('DELETE','/'+buildId,undefined,bob)).statusCode,404);assert.equal((await callB('DELETE','/folders/'+sub)).statusCode,200);
});
test.after(async()=>{await app.close();await buildApp?.close();await pg.close();});
