import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import Fastify from 'fastify';
import {z} from 'zod';
import * as shared from '../../packages/shared/dist/index.js';
const root=new URL('../../',import.meta.url),pg=new PGlite();
await pg.exec(`CREATE TABLE community_settings(guild_id text PRIMARY KEY,ask_enabled boolean DEFAULT false);CREATE TABLE membership_settings(guild_id text PRIMARY KEY,leave_officer_role_id text,officer_role_ids jsonb);CREATE TABLE member_leaves(id uuid PRIMARY KEY,guild_id text,user_id text,status text,return_at timestamptz,reason text);CREATE TABLE wosb_territory_settings(guild_id text PRIMARY KEY);CREATE TABLE room_music_settings(room_id uuid PRIMARY KEY);CREATE TABLE pb_discord_settings(guild_id text PRIMARY KEY,guild_catalog jsonb,manager_role_id text);CREATE TABLE member_profiles(guild_id text,user_id text,display_name text);`);
await pg.exec(await readFile(new URL('packages/db/migrations/100_community_operations.sql',root),'utf8'));
const db={query:async(sql,args=[])=>{if(sql.includes('pg_advisory'))return {rows:[],rowCount:1};const r=await pg.query(sql,args);return {rows:r.rows,rowCount:r.affectedRows??r.rows.length};}},many=async(s,a)=>(await db.query(s,a)).rows,oneOrNone=async(s,a)=>(await many(s,a))[0]??null,pool={connect:async()=>({query:db.query,release(){}})};
const guildId='123456789012345678',memberId='223456789012345678';
const member=async(req,reply)=>{if(req.headers.user==='outsider'){reply.code(403).send({error:'Denied'});return null;}return {member:true,pbOnly:req.headers.user==='ally'};};
const admin=async(req,reply)=>{if(req.headers.user!=='officer'){reply.code(403).send({error:'Officer required'});return false;}return true;},userId=req=>req.headers.user==='officer'?'323456789012345678':req.headers.user==='leaveOfficer'?'523456789012345678':req.headers.user==='reviewer'?'623456789012345678':memberId;
let src=stripTypeScriptTypes(await readFile(new URL('apps/api/src/communityOperations.ts',root),'utf8')).replace(/^import .*;\n/gm,'').replace(/export /g,'').replaceAll("new URL('../../../data/pb/guild-defaults.json',import.meta.url)","new URL('data/pb/guild-defaults.json',root)");
const deps={db,many,oneOrNone,pool,readFile,root,randomUUID,discordAccess:async id=>({roles:id==='523456789012345678'?['leave-role']:id==='623456789012345678'?['review-role']:[]}),...shared};
const {registerCommunityOperations}=Function(...Object.keys(deps),src+';return {registerCommunityOperations};')(...Object.values(deps));
const app=Fastify();registerCommunityOperations(app,{guildId,requireMember:member,pbManager:admin,userId,wikiRows:async()=>[{entity_key:'wood',name:'Wood'},{entity_key:'chest',name:'Guild Chest'}]});
let legacy=stripTypeScriptTypes(await readFile(new URL('apps/api/src/community.ts',root),'utf8')).replace(/^import .*;\n/gm,'').replace(/export /g,'');
const registerLegacy=Function('db','oneOrNone','many','z',legacy+';return registerCommunityRoutes;')(db,oneOrNone,many,z);
registerLegacy(app,{guildId,requireAdmin:admin,userId});
test('Ask and guild operations settings register together without a route collision',async()=>{await app.ready();assert.equal(app.hasRoute({method:'GET',url:'/v1/community/settings'}),true);assert.equal(app.hasRoute({method:'GET',url:'/v1/community/operations/settings'}),true);const r=await app.inject({method:'GET',url:'/v1/community/operations/settings',headers:{user:'officer'}});assert.equal(r.statusCode,200,r.body);assert.deepEqual(r.json(),{});const updated=await app.inject({method:'PUT',url:'/v1/community/operations/settings',headers:{user:'officer'},payload:{ledgerRoleId:'423456789012345678'}});assert.equal(updated.statusCode,200,updated.body);const ask=await app.inject({method:'GET',url:'/v1/community/settings',headers:{user:'officer'}});assert.equal(ask.statusCode,200,ask.body);assert.equal(ask.json().ask_enabled,false);const denied=await app.inject({method:'PUT',url:'/v1/community/operations/settings',headers:{user:'ally'},payload:{}});assert.equal(denied.statusCode,403);});
const call=(method,path,payload,user='officer')=>app.inject({method,url:'/v1/community'+path,payload,headers:{user}});
test('outsiders and PB-only allies cannot access guild ledger',async()=>{for(const user of ['outsider','ally'])assert.equal((await call('GET','/ledger',undefined,user)).statusCode,403);assert.equal((await call('POST','/treasury',{kind:'DEPOSIT'},'member')).statusCode,403);});
test('treasury exact integer arithmetic, idempotency, overdraft guard and reversal',async()=>{
 const body={kind:'OPENING',amount:'999999999999999999',reason:'Initial treasury',requestKey:randomUUID()},opened=await call('POST','/treasury',body);assert.equal(opened.statusCode,200,opened.body);assert.equal((await call('POST','/treasury',body)).json().id,opened.json().id);assert.equal((await call('POST','/treasury',{...body,amount:'2'})).statusCode,409);assert.equal((await call('POST','/treasury',{...body,reason:'Changed reason'})).statusCode,409);assert.equal((await call('GET','/ledger')).json().balance,body.amount);
 assert.equal((await call('POST','/treasury',{kind:'WITHDRAWAL',amount:'1000000000000000000',reason:'Too much',requestKey:randomUUID()})).statusCode,400);
 const spent=await call('POST','/treasury',{kind:'WITHDRAWAL',amount:'9',reason:'Supplies',requestKey:randomUUID()});assert.equal(spent.statusCode,200,spent.body);assert.equal((await call('GET','/ledger')).json().balance,'999999999999999990');
 const reverse={kind:'REVERSAL',reversesId:spent.json().id,reason:'Cancelled',requestKey:randomUUID()};assert.equal((await call('POST','/treasury',reverse)).statusCode,200);assert.equal((await call('GET','/ledger')).json().balance,body.amount);assert.equal((await call('POST','/treasury',{...reverse,requestKey:randomUUID()})).statusCode,409);
});
test('donations require known items, whole quantities and officer verification',async()=>{
 const body={fortName:'Thermopylae',items:[{key:'chest',quantity:5}],requestKey:randomUUID()},first=await call('POST','/donations',body,'member');assert.equal(first.statusCode,200,first.body);assert.equal((await call('POST','/donations',body,'member')).json().id,first.json().id);assert.equal((await call('POST','/donations',{...body,note:'Changed details'},'member')).statusCode,409);
 for(const item of [{key:'invented',quantity:1},{key:'wood',quantity:1.5}])assert.equal((await call('POST','/donations',{...body,requestKey:randomUUID(),items:[item]},'member')).statusCode,400);
 assert.equal((await call('POST',`/donations/${first.json().id}/review`,{status:'VERIFIED'},'member')).statusCode,403);assert.equal((await call('POST',`/donations/${first.json().id}/review`,{status:'VERIFIED'})).statusCode,200);assert.equal((await call('POST',`/donations/${first.json().id}/review`,{status:'DECLINED'})).statusCode,409);
});
test('leave jobs check ownership, extended acknowledgement and pending work',async()=>{
 assert.equal((await call('POST','/leaves',{action:'LEAVE',when:'in 60 days'},'member')).statusCode,409);assert.equal((await call('POST','/leaves',{action:'LEAVE',when:'in 3 days',userId:'423456789012345678'},'member')).statusCode,403);
 const r=await call('POST','/leaves',{action:'LEAVE',when:'in 60 days',extendedAcknowledged:true},'member');assert.equal(r.statusCode,200,r.body);assert.equal((await call('POST','/leaves',{action:'RETURN'},'member')).statusCode,409);
});
test('diplomacy saves revisioned history and rejects stale or dangling graphs',async()=>{
 const data={trackedGuilds:['BOM'],alliances:[{id:'crew',name:'Crew',color:'#52b9ae'}],memberships:[{guildTag:'BOM',allianceId:'crew'}],relations:[]};const r=await call('PUT','/diplomacy',{revision:0,data});assert.equal(r.statusCode,200,r.body);assert.equal((await call('PUT','/diplomacy',{revision:0,data})).statusCode,409);assert.equal((await many('SELECT * FROM wosb_diplomacy_events')).length,1);
 assert.throws(()=>shared.validateDiplomacy({...data,relations:[{from:'guild:BOM',to:'guild:missing',status:'ALLIED',directed:false}]},['BOM']));assert.throws(()=>shared.validateDiplomacy({...data,memberships:[{guildTag:'BOM',allianceId:'crew'},{guildTag:'bom',allianceId:'crew'}]},['BOM']));
});
test('today map hides protected and fixed ports and gives clear attack statuses',()=>{
 const now=Date.parse('2026-10-23T15:30:00Z'),base={time_zone:'America/Chicago',game_offset_minutes:60,window_start:'09:00',owner_tag:'BOM'},ports=[{...base,name:'Aruba'},{...base,name:'Thermopylae',protected_until:'2026-10-24T12:00:00Z'},{...base,name:'St. John'},{...base,name:'Nevis',window_start:'22:00'}];assert.deepEqual(shared.todayAttackPorts(ports,now).map(p=>p.name),['Aruba','Nevis']);const summary=shared.territoryMapSummary(ports,now);assert.match(summary,/🟢/);assert.match(summary,/\*\*<t:/);assert.ok(!summary.includes('Taxes:'));assert.ok(!summary.includes('Thermopylae'));
});
test('ranking uses artist, tags and feedback while excluding recent and disliked tracks',()=>{const now=Date.now(),rows=[{author:'A',title:'Rock Party',tags:['rock'],play_count:1},{author:'B',title:'Noise',play_count:20},{author:'A',title:'Recent',last_played:new Date(now).toISOString()}];assert.deepEqual(shared.rankMusicCandidates(rows,{seed:{author:'A',title:'Seed'},profile:'SIMILAR',feedback:[{author:'B',title:'Noise',rating:-1}],moodTerms:['rock'],avoidRecentlyPlayed:true,now}).map(r=>r.title),['Rock Party']);});
test('configured leave and returning-member reviewers have scoped access',async()=>{
 await db.query("INSERT INTO membership_settings(guild_id,leave_officer_role_id) VALUES($1,'leave-role')",[guildId]);await db.query("UPDATE community_operations_settings SET rejoin_role_id='review-role' WHERE guild_id=$1",[guildId]);
 const leave=(await call('GET','/leaves',undefined,'leaveOfficer')).json();assert.equal(leave.canManage,true);assert.equal(leave.canConfigure,false);assert.equal(leave.canReviewRejoins,false);
 assert.equal((await call('GET','/rejoins',undefined,'reviewer')).statusCode,200);assert.equal((await call('GET','/rejoins',undefined,'leaveOfficer')).statusCode,403);assert.equal((await call('GET','/operations/settings',undefined,'reviewer')).statusCode,403);
 assert.equal((await call('POST','/leaves',{userId:'723456789012345678',action:'RETURN'},'leaveOfficer')).statusCode,200);assert.equal((await call('POST','/leaves',{userId:'823456789012345678',action:'RETURN'},'member')).statusCode,403);
});
test.after(async()=>{await app.close();await pg.close();});
