import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
const root=new URL('../../',import.meta.url);
const code=path=>stripTypeScriptTypes(readFileSync(new URL(path,root),'utf8'));
async function module(path,deps={}){
 const m=new vm.SourceTextModule(code(path));
 await m.link(async name=>{
  const exports=deps[name];if(!exports)throw Error(`Missing mock ${name}`);
  return new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v);});
 });await m.evaluate();return m.namespace;
}
const controls=await module('packages/shared/src/dmControls.ts');
test('button preserves content, embeds, files and existing buttons',()=>{
 const body={content:'hello',files:['map.png'],embeds:[{title:'Battle'}],components:[{type:1,components:[{type:2,custom_id:'signup',style:1,label:'Sign up'}]}]};
 const result=controls.withDmMute(body,'123');assert.equal(result.components.length,2);assert.deepEqual(result.files,body.files);assert.equal(result.components[0].components[0].custom_id,'signup');assert.equal(result.components[1].components[0].custom_id,'bom:dm-mute:open:123');assert.equal(body.components.length,1);
 assert.equal(controls.withDmMute(result,'123').components.length,2);
});
test('full legacy row layout retains controls and adds mute where possible',()=>{
 const rows=Array.from({length:5},()=>({type:1,components:[{type:2,style:1,custom_id:'existing'}]}));
 const result=controls.withDmMute({components:rows},'123');assert.equal(result.components.length,5);assert.equal(result.components[0].components.length,2);assert.equal(rows[0].components.length,1);
});
let muted=false,dbFailed=false,saved=[];
const db={recordDmDelivery:async()=>{},discordDmsMuted:async()=>{if(dbFailed)throw Error('DB unavailable');return muted;},muteDiscordDms:async(user,hours)=>{saved.push([user,hours]);muted=true;return new Date('2026-10-24T00:00:00Z');}};
const delivery=await module('apps/controller/src/dmDelivery.ts',{'@bom/db':db,'@bom/shared':controls});
test('controller suppresses muted DMs and fails closed on DB failure',async()=>{
 let sent=0;const user={id:'123',send:async p=>{sent++;return p;}};
 muted=false;const result=await delivery.sendBotDm(user,'hello');assert.equal(result.components[0].components[0].label,'Mute DMs');
 muted=true;await assert.rejects(delivery.sendBotDm(user,'blocked'),/suppressed_by_dm_mute/);assert.equal(sent,1);
 dbFailed=true;await assert.rejects(delivery.sendBotDm(user,'blocked'),/DB unavailable/);dbFailed=false;
});
test('DM routing offers exactly the four durations and authenticates recipient',async()=>{
 let handle;delivery.installDmMuteControls({on:(event,fn)=>{handle=fn;}});
 let response;const base={isButton:()=>true,guildId:null,user:{id:'123'},reply:async p=>{response=p;},deferUpdate:async()=>{},editReply:async p=>{response=p;}};
 await handle({...base,customId:'bom:dm-mute:open:123'});assert.deepEqual(Array.from(response.components[0].components,c=>c.label),['1 hour','3 hours','12 hours','24 hours']);
 saved=[];for(const hours of [1,3,12,24])await handle({...base,customId:`bom:dm-mute:${hours}:123`});assert.deepEqual(saved,[['123',1],['123',3],['123',12],['123',24]]);assert.deepEqual(response.components,[]);
 await handle({...base,customId:'bom:dm-mute:24:456'});assert.equal(saved.length,4);
 await handle({...base,customId:'bom:dm-mute:2:123'});assert.equal(saved.length,4);
});
const api=await module('apps/api/src/dmDelivery.ts',{'@bom/db':db,'@bom/shared':controls});
test('API suppresses muted recipients and decorates permitted REST sends',async()=>{
 let calls=[];const discord=async(path,init)=>{calls.push([path,JSON.parse(init.body)]);return {id:'channel'};};
 muted=true;await assert.rejects(api.sendApiDm(discord,'123',{content:'blocked'}));assert.equal(calls.length,0);
 muted=false;await api.sendApiDm(discord,'123',{content:'hello'});assert.equal(calls.length,2);assert.equal(calls[1][1].components[0].components[0].label,'Mute DMs');
 calls=[];const racing=async(...args)=>{const result=await discord(...args);muted=true;return result;};muted=false;await assert.rejects(api.sendApiDm(racing,'123',{}));assert.equal(calls.length,1);
});
test('mute reads expiry from database on every call and validates writes',async()=>{
 let now=1000,until=0,queries=[];
 const source=code('packages/db/src/index.ts').split('/** Global per-user mute')[1];
 const m=new vm.SourceTextModule('const oneOrNone=globalThis.__query;\n/** Global per-user mute'+source);
 globalThis.__query=async(sql,args)=>{queries.push([sql,args]);if(sql.startsWith('SELECT'))return until?{muted:until>now}:null;until=now+args[1]*3600000;return {muted_until:new Date(until)};};
 await m.link(()=>{});await m.evaluate();delete globalThis.__query;
 assert.equal(await m.namespace.discordDmsMuted('123'),false);await m.namespace.muteDiscordDms('123',3);assert.equal(await m.namespace.discordDmsMuted('123'),true);now=until;assert.equal(await m.namespace.discordDmsMuted('123'),false);await assert.rejects(m.namespace.muteDiscordDms('123',2));assert.ok(queries.every(([sql])=>sql.includes('$1')));
});
