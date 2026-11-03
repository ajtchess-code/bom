import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {stripTypeScriptTypes} from 'node:module';
const root=new URL('../../',import.meta.url);
const code=await readFile(new URL('apps/controller/src/welcomePosition.ts',root),'utf8');
const {welcomePanelPosition}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(code)).toString('base64'));
const source=await readFile(new URL('apps/controller/src/membership.ts',root),'utf8');
const body=source.slice(source.indexOf('async function refreshWelcomePanelNow'),source.indexOf('export function refreshWelcomePanel'));
function harness({newer=false,bot=false,forceError=null,missing=false,dbError=false}={}){
 const calls=[];let storedId='100';let replacement=null;const existing={id:'100',pinned:false,edit:async()=>{calls.push('edit');return existing},delete:async()=>calls.push('delete old')};
 const recent=[{id:'100'},...(newer?[{id:'101',author:{bot}}]:[])];
 const channel={isTextBased:()=>true,isDMBased:()=>false,messages:{fetch:async options=>{if(forceError)throw forceError;if(options.message){assert.equal(options.force,true);if(missing&&!replacement)throw {code:10008};return options.message==='102'?replacement:existing}return {some:f=>recent.some(f)}}},send:async()=>{calls.push('send');replacement={id:'102',delete:async()=>calls.push('delete new'),edit:async()=>{calls.push('edit');return replacement}};recent.push({id:'102'});return replacement}};
 const client={guilds:{cache:{get:()=>({channels:{fetch:async()=>channel}})}}};
 const names=['settings','guildId','cleanupLegacyWelcomePinNotices','welcomePanelPosition','renderWelcomeBanner','AttachmentBuilder','WELCOME_RENDERER_FILE','oneOrNone','welcomeButtons','MessageFlags','db'];
 const values=[async()=>({welcome_enabled:true,welcome_channel_id:'channel',welcome_panel_message_id:storedId}),'guild',async()=>{},welcomePanelPosition,async()=>{calls.push('render');return Buffer.alloc(0)},class{},'welcome-v420.png',async()=>null,()=>({toJSON:()=>({})}),{IsComponentsV2:32768},{query:async()=>{calls.push('save');if(dbError)throw Error('database offline');storedId='102'}}];
 const run=Function(...names,stripTypeScriptTypes(body)+';return refreshWelcomePanelNow;')(...values);
 return {calls,run:force=>run(client,null,force)};
}
test('repeated routine sweeps leave an already-last welcome untouched',async()=>{const h=harness();for(let n=0;n<10;n++)await h.run(false);assert.deepEqual(h.calls,[])});
test('manual content refresh edits the same message when already last',async()=>{const h=harness();await h.run(true);assert.deepEqual(h.calls,['render','edit'])});
test('a newer human or bot message moves welcome once',async()=>{for(const bot of [false,true]){const h=harness({newer:true,bot});await h.run(false);assert.deepEqual(h.calls,['render','send','save','delete old']);await h.run(false);await h.run(false);assert.deepEqual(h.calls,['render','send','save','delete old'])}});
test('missing welcome is recreated',async()=>{const h=harness({missing:true});await h.run(false);assert.deepEqual(h.calls,['render','send','save'])});
test('permission and network failures do not produce duplicate panels',async()=>{for(const forceError of [{code:50013},Error('network offline')]){const h=harness({forceError});await assert.rejects(h.run(false));assert.deepEqual(h.calls,[])}});
test('failed persistence removes the unsaved replacement',async()=>{const h=harness({newer:true,dbError:true});await assert.rejects(h.run(false));assert.deepEqual(h.calls,['render','send','save','delete new'])});
test('general surface refresh uses a position check instead of forced welcome repost',()=>{const section=source.slice(source.indexOf('export async function refreshMembershipSurfaces'),source.indexOf('/** Uses the same AFK'));assert.ok(section.includes('refreshWelcomePanel(client,null,false)'))});
test('membership controller syntax is valid',()=>{assert.ok(stripTypeScriptTypes(source).length>0)});
