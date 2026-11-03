import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const root=new URL('../../',import.meta.url);
const source=await readFile(new URL('apps/controller/src/index.ts',root),'utf8');
const helper=await readFile(new URL('apps/controller/src/pbSignupDraft.ts',root),'utf8');
const draft=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(helper)).toString('base64'));
const functions=source.slice(source.indexOf('async function pbPreferredPrompt'),source.indexOf('type PbDiscordSettings'));
class Builder{setCustomId(){return this}setPlaceholder(){return this}setMinValues(){return this}setMaxValues(){return this}addOptions(){return this}setLabel(){return this}setStyle(){return this}addComponents(){return this}}
function harness(saved){
 let value=saved?JSON.stringify(saved):null;const calls=[];
 const i={user:{id:'captain',username:'Captain'},deferUpdate:async()=>{calls.push('ack')},editReply:async p=>{calls.push(['reply',p])}};
 const redis={get:async()=>{calls.push('get');return value},set:async(k,v)=>{value=v},del:async()=>{value=null}};
 const names=['redis','pbDraftKey','editInteractionReply','StringSelectMenuBuilder','ButtonBuilder','ActionRowBuilder','ButtonStyle','wosbApi','syncPortBattleDiscord','selectDraftShips','detailedSignupBody'];
 const values=[redis,()=>'',(i,p)=>i.editReply(p),Builder,Builder,Builder,{Success:3,Secondary:2},async(path,uid,init)=>{calls.push(['api',JSON.parse(init.body)])},async()=>{},draft.selectDraftShips,draft.detailedSignupBody];
 const f=Function(...names,stripTypeScriptTypes(functions)+';return {pbPreferredPrompt,pbHornPrompt,pbFlarePrompt,pbFinishDetailed};')(...values);
 return {i,f,calls,get saved(){return value&&JSON.parse(value)}};
}
test('editing playable ships preserves late status, minutes and horn preference',async()=>{
 const h=harness({ships:['Old'],status:'LATE',lateMinutes:35,hornPreferred:true});
 await h.f.pbPreferredPrompt(h.i,'battle',['Anson']);
 assert.equal(h.saved.status,'LATE');assert.equal(h.saved.lateMinutes,35);assert.equal(h.saved.hornPreferred,true);assert.deepEqual(h.calls.slice(0,2),['ack','get']);
});
test('editing waitlist ships keeps captain on waitlist',()=>{
 const next=draft.selectDraftShips({status:'WAITLIST'},['Anson','Anson']);assert.equal(next.status,'WAITLIST');assert.deepEqual(next.ships,['Anson']);
});
test('all detailed signup steps acknowledge before Redis or API work',async()=>{
 for(const [name,arg] of [['pbPreferredPrompt',['Anson']],['pbHornPrompt',[]],['pbFlarePrompt',true],['pbFinishDetailed',[]]]){
  const h=harness({ships:['Anson'],status:'LATE',lateMinutes:25});await h.f[name](h.i,'battle',arg);assert.deepEqual(h.calls.slice(0,2),['ack','get'],name);
 }
});
test('expired drafts cannot create empty signups at any step',async()=>{
 for(const [name,arg] of [['pbPreferredPrompt',['Anson']],['pbHornPrompt',[]],['pbFlarePrompt',true],['pbFinishDetailed',[]]]){
  const h=harness(null);await h.f[name](h.i,'battle',arg);assert.ok(!h.calls.some(x=>x[0]==='api'));assert.match(h.calls.at(-1)[1].content,/expired/i);
 }
});
test('final submit preserves late minutes and acknowledged horn preference',async()=>{
 const h=harness({ships:['Anson'],preferred:['Anson'],status:'LATE',lateMinutes:35,hornCapable:true,hornPreferred:true});await h.f.pbFinishDetailed(h.i,'battle',['Red Flare']);
 const body=h.calls.find(x=>x[0]==='api')[1];assert.equal(body.status,'LATE');assert.equal(body.lateMinutes,35);assert.equal(body.hornPreferred,true);assert.deepEqual(body.flareCapabilities,['Red Flare']);assert.equal(h.saved,null);
});
test('invalid empty draft fails before saving',()=>{assert.throws(()=>draft.detailedSignupBody({ships:[]},[],'Captain'),/expired/)});
test('controller TypeScript remains syntactically valid',()=>{assert.ok(stripTypeScriptTypes(source).length>0)});
