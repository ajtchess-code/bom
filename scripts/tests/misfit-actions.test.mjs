import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import Fastify from 'fastify';
import {PGlite} from '@electric-sql/pglite';
import {localAction,normalizeAction,correctionStatement,factualCorrection,battleMatches} from '../../apps/controller/src/assistantIntent.ts';
import {cargoCorrection} from '../../apps/api/src/misfitCorrections.ts';
import {checkedAssignment} from '../../apps/api/src/pbAssignmentValidation.ts';
const records=[{kind:'ship',name:'Anson',entity_key:'ship:anson',aliases:[]},{kind:'ship',name:'Bellona',entity_key:'ship:bellona'}];
test('natural requests preserve member mentions, punctuated ship names and combined duties',()=>{
 const a=localAction('can you sign up <@123456789012345> for the Thermo port battle tonight as St. Pavel, theyll be our primary horn and flank commander');
 assert.equal(a.player,'<@123456789012345>');assert.equal(a.ship,'St. Pavel');assert.equal(a.port,'Thermo');assert.equal(a.day,'today');assert.equal(a.horn,'Primary Horn');assert.equal(a.commander,'Flank Commander');assert.equal(a.confirm,false);
 assert.equal(localAction('can you let the guild know ill be away for five days?').days,5);
 assert.equal(localAction("I'll be away for 2 weeks").days,14);
 assert.equal(normalizeAction({kind:'leave',days:-1},'leave'),null);
 assert.equal(normalizeAction({kind:'pb_signup',confirm:true,replace:true},'sign me up').confirm,false);
 assert.equal(normalizeAction({kind:'shell',url:'anything'},'do it'),null);
});
test('corrections accept only the No role and distinguish retries from factual edits',()=>{
 assert.equal(correctionStatement('<@&123456789012345> Anson holds 20k','Officer'),null);
 assert.equal(correctionStatement('<@&123456789012345> Anson holds 20k','No'),'Anson holds 20k');
 assert.equal(factualCorrection('you do know the answer?'),false);
 for(const text of ['Anson can carry 20,000 cargo','Anson holds 20k','Anson base cargo capacity is 20000'])assert.equal(cargoCorrection(text,records).value,20000);
 assert.ok(cargoCorrection('Anson carries 20000 with upgrades',records).clarification);
 assert.ok(cargoCorrection('Anson and Bellona hold 20000',records).clarification);
 assert.equal(cargoCorrection('it holds 20000',records,'ship:anson').entityKey,'ship:anson');
 assert.ok(cargoCorrection('it holds 20000',records).clarification);
});
test('tonight uses game date, aliases, and an unambiguous battle time',()=>{
 const now=new Date('2026-10-20T19:00:00Z'),b={port_name:'Thermopylae',status:'OPEN',starts_at:'2026-10-20T21:00:00Z'};
 assert.equal(battleMatches(b,{kind:'pb_signup',port:'Thermo',day:'today'},now),false);
 assert.equal(battleMatches(b,{kind:'pb_signup',port:'Thermo',day:'tomorrow',time:'01:00'},now),true);
 assert.equal(battleMatches({...b,status:'FINISHED'},{kind:'pb_signup',port:'Thermo'},now),false);
});
const pg=new PGlite();let queries=[];
const query=async(sql,args=[])=>{queries.push(sql);if(sql.startsWith('SELECT pg_advisory_xact_lock'))return {rows:[]};const r=await pg.query(sql,args);return {rows:r.rows,rowCount:r.affectedRows??r.rows.length};};
const ctx=vm.createContext({console,Date,process:{env:{}}});
const source=stripTypeScriptTypes(await readFile(new URL('../../apps/api/src/misfitBattleActions.ts',import.meta.url),'utf8'));
const mod=new vm.SourceTextModule(source,{context:ctx});
let allowed=true;
await mod.link(async(spec)=>{const obj=spec==='@bom/db'?{pool:{connect:async()=>({query,release(){}})}}:spec==='./authz.js'?{discordAccess:async()=>({member:true,displayName:'Goldfade'})}:spec==='./pbAssignmentValidation.js'?{checkedAssignment}:{randomUUID};return new vm.SyntheticModule(Object.keys(obj),function(){for(const [k,v]of Object.entries(obj))this.setExport(k,v)},{context:ctx});});await mod.evaluate();
const app=Fastify();app.setErrorHandler((e,req,reply)=>reply.code(e.statusCode??500).send({message:e.message}));const guild='guild',actor='123456789012345',player='223456789012345',battle=randomUUID();
mod.namespace.registerMisfitBattleActions(app,{guildId:guild,userId:()=>actor,requireMember:async()=>({member:true,roles:[]}),pbManager:async(req,reply)=>allowed?true:(reply.code(403).send({error:'pb_manager_required'}),false),ensure:async()=>{},catalogue:async()=>({ships:[{name:'St. Pavel',rate:2}]}),signupConfig:async()=>({})});
const post=(body)=>app.inject({method:'POST',url:`/v1/wosb/port-battles/${battle}/assistant-signup`,payload:{playerId:player,ship:'St. Pavel',sourceMessageId:'323456789012345',...body}});
await test('all migrations and role permissions apply to the conversational endpoint',async()=>{
 for(const f of (await readdir(new URL('../../packages/db/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await pg.exec(await readFile(new URL('../../packages/db/migrations/'+f,import.meta.url),'utf8'));
 await query(`INSERT INTO pb_battles(id,guild_id,port_key,port_name,rate,team_size,starts_at) VALUES($1,$2,'thermopylae','Thermopylae',2,10,NOW()+INTERVAL '1 day')`,[battle,guild]);
 allowed=false;assert.equal((await post({})).statusCode,403);allowed=true;
 assert.equal((await query('SELECT COUNT(*) n FROM pb_signups')).rows[0].n,0);
});
await test('unselected ships, duty confirmation, and Horn capability are checked before writes',async()=>{
 assert.match((await post({})).body,/not selected/);
 await query(`INSERT INTO pb_preferred_profiles(guild_id,user_id,rates,horn_capable,horn_requirements_ack) VALUES($1,$2,'{"2":{"ships":["St. Pavel"]}}',FALSE,FALSE)`,[guild,player]);
 assert.equal((await post({hornDuty:'Primary Horn'})).json().error,'confirmation_required');
 assert.match((await post({confirm:true,hornDuty:'Primary Horn'})).body,/Horn requirements/);
 assert.equal((await query('SELECT COUNT(*) n FROM pb_signups')).rows[0].n,0);
});
await test('compound assignment commits once and duplicate delivery returns the saved receipt',async()=>{
 await query('UPDATE pb_preferred_profiles SET horn_capable=TRUE,horn_requirements_ack=TRUE');
 const payload={confirm:true,hornDuty:'Primary Horn',commanderDuty:'Flank Commander'};
 const a=await post(payload);assert.equal(a.statusCode,200,a.body);assert.equal(a.json().confirmed,true);
 const again=await post(payload);assert.equal(again.statusCode,200,again.body);assert.equal(a.json().signupId,again.json().signupId);
 assert.equal(Number((await query('SELECT COUNT(*) n FROM pb_assignment_events')).rows[0].n),1);
 const row=(await query('SELECT * FROM pb_signups')).rows[0];assert.equal(row.horn_duty,'Primary Horn');assert.equal(row.commander_duty,'Flank Commander');
});
await test('occupied duties and closed battles leave the roster unchanged',async()=>{
 const other='423456789012345';await query(`INSERT INTO pb_preferred_profiles(guild_id,user_id,rates,horn_capable,horn_requirements_ack) VALUES($1,$2,'{"2":{"ships":["St. Pavel"]}}',TRUE,TRUE)`,[guild,other]);
 assert.match((await post({playerId:other,sourceMessageId:'523456789012345',confirm:true,hornDuty:'Primary Horn'})).body,/already holds/);
 assert.equal(Number((await query('SELECT COUNT(*) n FROM pb_signups')).rows[0].n),1);
 await query("UPDATE pb_battles SET status='CLOSED'");assert.match((await post({sourceMessageId:'623456789012345'})).body,/no longer open/);
});
await app.close();await pg.close();
await test('explicit actions and corrections outrank Ask even when its listener registered first',async()=>{
 const ctx=vm.createContext({});const m=new vm.SourceTextModule(stripTypeScriptTypes(await readFile(new URL('../../apps/controller/src/conversationRouter.ts',import.meta.url),'utf8')),{context:ctx});
 await m.link(()=>new vm.SyntheticModule(['redis'],function(){this.setExport('redis',{get:async()=>null,set:async()=>{}})},{context:ctx}));await m.evaluate();const r=m.namespace;
 r.registerConversationMatcher('community',100,async()=>true);r.registerConversationMatcher('assistant',200,async message=>message.content==='signup');r.registerConversationMatcher('wiki',250,async message=>message.content==='correction');
 const message=content=>({content,author:{bot:false},client:{user:{id:'bot'}},mentions:{users:{has:()=>false}}});
 assert.equal(await r.conversationOwner(message('signup')),'assistant');assert.equal(await r.conversationOwner(message('correction')),'wiki');assert.equal(await r.conversationOwner(message('question')),'community');
});
