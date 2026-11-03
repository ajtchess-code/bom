import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import Fastify from 'fastify';
import {PGlite} from '@electric-sql/pglite';
import * as crypto from 'node:crypto';
const a='123456789012345678',b='234567890123456789',c='345678901234567890',battle=crypto.randomUUID(),battle2=crypto.randomUUID(),old=crypto.randomUUID(),sub=crypto.randomUUID();
async function load(path,mocks,context){const mod=new vm.SourceTextModule(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText,{context});await mod.link(name=>mocks[name]);await mod.evaluate();return mod.namespace;}
test('coordination: authorization, withdrawals, atomic replacement, phase conflicts and audited corrections',async()=>{
 const pg=new PGlite();for(const f of readdirSync('packages/db/migrations').filter(n=>/^\d{3}_.+\.sql$/.test(n)).sort())await pg.exec(readFileSync('packages/db/migrations/'+f,'utf8'));
 const query=async(sql,args=[])=>{const r=await pg.query(sql,args);return {...r,rowCount:r.affectedRows??r.rows.length}};
 const deps={db:{query},many:async(s,a)=>(await query(s,a)).rows,oneOrNone:async(s,a)=>(await query(s,a)).rows[0]??null,pool:{connect:async()=>({query,release(){}})}};
 const context=vm.createContext({console,process,Date});const mock=async values=>{const m=new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v)},{context});await m.link(()=>{});await m.evaluate();return m};
 const api=await load('apps/api/src/battleCoordination.ts',{'@bom/db':await mock(deps),'node:crypto':await mock(crypto)},context);
 const app=Fastify();const history=await load('apps/api/src/rosterHistory.ts',{'@bom/db':await mock(deps),'node:crypto':await mock(crypto)},context);history.registerRosterHistory(app,{guildId:'g',userId:req=>req.headers.uid||a,pbManager:async(req,reply)=>{if(req.headers.manager==='yes')return true;reply.code(403).send({error:'forbidden'});return false}});api.registerBattleCoordination(app,{guildId:'g',requireMember:async()=>({member:true}),userId:req=>req.headers.uid||a,pbManager:async(req,reply)=>{if(req.headers.manager==='yes')return true;reply.code(403).send({error:'forbidden'});return false}});
 const call=(method,path,body,manager=true,uid=a)=>app.inject({method,url:'/v1/wosb/port-battles/'+path,headers:{uid,...(manager?{manager:'yes'}:{})},payload:body});
 try{
 await query(`INSERT INTO pb_battles(id,guild_id,port_key,port_name,team_size,starts_at) VALUES($1,'g','aruba','Aruba',1,'2030-01-01T12:00:00Z'),($2,'g','nevis','Nevis',1,'2030-01-01T12:00:00Z')`,[battle,battle2]);
 await query(`INSERT INTO pb_signups(id,battle_id,guild_id,user_id,display_name,ships,confirmed_ship) VALUES($1,$2,'g',$3,'Alice','["Victory"]','Victory'),($4,$2,'g',$5,'Bob','["St. Pavel"]',NULL),($6,$7,'g',$5,'Bob','["St. Pavel"]',NULL)`,[old,battle,a,sub,b,crypto.randomUUID(),battle2]);
 assert.equal((await call('GET',battle+'/coordination',undefined,false)).statusCode,403);
 assert.equal((await call('POST',battle+'/withdrawal',{reason:'Unavailable'},false,c)).statusCode,409);
 assert.equal((await call('POST',battle+'/withdrawal',{reason:'Unavailable'},false,a)).statusCode,200);
 let r=await call('GET',battle+'/coordination');assert.equal(r.statusCode,200,r.body);const w=r.json().withdrawals[0];
 assert.equal((await call('POST',battle+'/withdrawals/'+w.id+'/replace',{signupId:sub,confirmedShip:'Victory',assignmentVersion:1})).statusCode,409);
 assert.equal((await query('SELECT confirmed_ship FROM pb_signups WHERE id=$1',[old])).rows[0].confirmed_ship,'Victory');
 r=await call('POST',battle+'/withdrawals/'+w.id+'/replace',{signupId:sub,confirmedShip:'St. Pavel',assignmentVersion:1});assert.equal(r.statusCode,200,r.body);
 assert.equal((await query('SELECT COUNT(*)::int n FROM pb_signups WHERE battle_id=$1 AND confirmed_ship IS NOT NULL',[battle])).rows[0].n,1);
 assert.equal((await query('SELECT signup_status FROM pb_signups WHERE id=$1',[old])).rows[0].signup_status,'WAITLIST');
 assert.equal((await query('SELECT COUNT(*)::int n FROM pb_assignment_events WHERE battle_id=$1',[battle])).rows[0].n,2);
 r=await call('POST',battle+'/roster-history/checkpoints',{name:'Approved lineup'});assert.equal(r.statusCode,200,r.body);
 let hist=(await call('GET',battle+'/roster-history')).json(),snapshot=hist.checkpoints[0];
 await query('UPDATE pb_signups SET confirmed_ship=NULL,assignment_version=assignment_version+1 WHERE id=$1',[sub]);
 assert.equal((await call('POST',battle+'/roster-history/restore',{checkpointId:snapshot.id,digest:hist.digest})).statusCode,409);
 hist=(await call('GET',battle+'/roster-history')).json();r=await call('POST',battle+'/roster-history/restore',{checkpointId:snapshot.id,digest:hist.digest});assert.equal(r.statusCode,200,r.body);assert.equal((await query('SELECT confirmed_ship FROM pb_signups WHERE id=$1',[sub])).rows[0].confirmed_ship,'St. Pavel');
 assert.equal((await call('POST',battle+'/roster-history/restore',{checkpointId:snapshot.id,digest:hist.digest})).statusCode,409);
 r=await call('PUT',battle+'/phases/'+b,{startsAt:'2030-01-01T12:00:00Z',endsAt:'2030-01-01T12:20:00Z',transferMinutes:5});assert.equal(r.statusCode,200,r.body);
 assert.equal((await call('PUT',battle2+'/phases/'+b,{startsAt:'2030-01-01T12:24:00Z',endsAt:'2030-01-01T12:40:00Z'})).statusCode,409);
 r=await call('PUT',battle2+'/phases/'+b,{startsAt:'2030-01-01T12:25:00Z',endsAt:'2030-01-01T13:00:00Z'});assert.equal(r.statusCode,200,r.body);
 assert.equal((await call('PUT',battle2+'/phases/'+b,{startsAt:'2030-01-01T12:25:00Z',endsAt:'2030-01-01T13:01:00Z'})).statusCode,409);
 await query(`INSERT INTO pb_attendance_outcomes(battle_id,guild_id,user_id,outcome,recorded_by) VALUES($1,'g',$2,'NO_SHOW',$3)`,[battle,c,a]);await query("UPDATE pb_attendance_outcomes SET outcome='ATTENDED',note='Captain attended without signing up',recorded_by=$3 WHERE battle_id=$1 AND user_id=$2",[battle,c,b]);
 const audit=(await query('SELECT * FROM pb_attendance_audit WHERE user_id=$1 ORDER BY id',[c])).rows;assert.equal(audit.length,2);assert.equal(audit[1].before_state.outcome,'NO_SHOW');assert.equal(audit[1].after_state.outcome,'ATTENDED');assert.equal(audit[1].actor_id,b);
 // The schema and trigger can safely be applied again.
 await pg.exec(readFileSync('packages/db/migrations/113_command_coordination.sql','utf8'));
 }finally{await app.close();await pg.close()}
});
test('search ranks exact names, word prefixes, accents and small spelling mistakes',async()=>{
 const context=vm.createContext({console});const rank=await load('apps/api/src/searchRanking.ts',{},context);
 assert.ok(rank.searchScore('Aruba','Aruba')>rank.searchScore('Aruba','Battle of Aruba'));
 assert.ok(rank.searchScore('san mart','San Martin')>0);
 assert.ok(rank.searchScore('espanol','Español')>0);
 assert.ok(rank.searchScore('victroy','Victory')>0); // adjacent transposition tolerance
 assert.ok(rank.searchScore('victori','Victory')>0);
 assert.equal(rank.searchScore('secret ship','Public guide','No relevant detail'),0);
});
test('global search filters restricted builds before returning results and reports partial-source failures',async()=>{
 const pg=new PGlite();for(const f of readdirSync('packages/db/migrations').filter(n=>/^\d{3}_.+\.sql$/.test(n)).sort())await pg.exec(readFileSync('packages/db/migrations/'+f,'utf8'));
 const query=async(s,args=[])=>(await pg.query(s,args)).rows;
 await query(`INSERT INTO ship_builds(id,guild_id,owner_id,name,ship_key,scope,allowed_role_ids) VALUES($1,'g',$2,'Victory private','Victory','ROLES','["secret"]'),($3,'g',$2,'Victory public','Victory','GUILD','[]'),($4,'g',$5,'Victory personal','Victory','PERSONAL','[]')`,[crypto.randomUUID(),b,crypto.randomUUID(),crypto.randomUUID(),a]);
 const context=vm.createContext({console,Date});const mock=async values=>{const m=new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v)},{context});await m.link(()=>{});await m.evaluate();return m};const ranking=await load('apps/api/src/searchRanking.ts',{},context);
 const api=await load('apps/api/src/globalSearch.ts',{'@bom/db':await mock({many:query}),'./authz.js':await mock({hasDashboardAdminAccess:async()=>false}),'./searchRanking.js':await mock({normalizeSearch:ranking.normalizeSearch,searchScore:ranking.searchScore})},context);
 const app=Fastify();api.registerGlobalSearch(app,{guildId:'g',userId:()=>a,requireMember:async req=>{req._pbMemberAccess={roles:[]};return {member:true}}});
 try{let r=await app.inject({url:'/v1/search?q=victory&kind=build'});assert.equal(r.statusCode,200,r.body);assert.deepEqual(r.json().unavailable,[]);assert.deepEqual(r.json().results.map(x=>x.label).sort(),['Victory personal','Victory public']);r=await app.inject({url:'/v1/search?q=victory'});assert.equal(r.statusCode,200,r.body);assert.deepEqual(r.json().unavailable,[],r.body);assert.equal(r.json().results.some(x=>x.label==='Victory private'),false);}
 finally{await app.close();await pg.close()}
});
test('fair queue rotates requesters and preserves each requester order with PostgreSQL fallback',async()=>{
 const pg=new PGlite();await pg.exec(`CREATE TABLE live_lists(id bigserial PRIMARY KEY,key_name text,value_text text);CREATE TABLE live_kv(key_name text PRIMARY KEY,value_text text,expires_at timestamptz,updated_at timestamptz DEFAULT now());`);
 const query=async(s,a=[])=>{const r=await pg.query(s,a);return {...r,rowCount:r.affectedRows??r.rows.length}};
 const context=vm.createContext({console,process:{env:{}},setInterval,clearInterval,setTimeout,Date});const mock=async values=>{const m=new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v)},{context});await m.link(()=>{});await m.evaluate();return m};
 const events=await import('node:events');const api=await load('packages/redis/src/index.ts',{'@bom/db':await mock({db:{query},pool:{connect:async()=>({query,release(){}})}}),'ioredis':await mock({Redis:class{}}),'node:events':await mock(events),'./discordRest.js':await mock({makeDiscordScheduler:()=>()=>{}})},context);
 try{await api.redis.set('music:room:room:fair-queue','1');for(const [requestId,requesterId] of [['a1','a'],['a2','a'],['b1','b'],['b2','b'],['c1','c']])await api.enqueue({roomId:'room',requestId,requesterId,query:requestId});const actual=[];for(let i=0;i<5;i++)actual.push((await api.dequeue('room')).requestId);assert.deepEqual(actual,['a1','b1','c1','a2','b2']);assert.equal(await api.dequeue('room'),null);
 }finally{await pg.close()}
});
test('fair queue uses equivalent atomic selection in Redis',{skip:!process.env.REDIS_TEST_URL},async()=>{
 const {Redis}=await import('ioredis');const context=vm.createContext({console,process:{env:{REDIS_URL:process.env.REDIS_TEST_URL}},setInterval,clearInterval,setTimeout,Date});const mock=async values=>{const m=new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v)},{context});await m.link(()=>{});await m.evaluate();return m};const events=await import('node:events');
 const api=await load('packages/redis/src/index.ts',{'@bom/db':await mock({db:{},pool:{}}),'ioredis':await mock({Redis}),'node:events':await mock(events),'./discordRest.js':await mock({makeDiscordScheduler:()=>()=>{}})},context);
 await api.redis.del(api.keys.roomQueue('room'),'music:room:room:fair-queue','music:room:room:served');await api.redis.set('music:room:room:fair-queue','1');for(const [requestId,requesterId] of [['a1','a'],['a2','a'],['b1','b'],['b2','b'],['c1','c']])await api.enqueue({roomId:'room',requestId,requesterId,query:requestId});const actual=[];for(let i=0;i<5;i++)actual.push((await api.dequeue('room')).requestId);assert.deepEqual(actual,['a1','b1','c1','a2','b2']);await api.redis.quit();await api.redisSub.quit();
});
