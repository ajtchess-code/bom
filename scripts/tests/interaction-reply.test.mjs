import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ContainerBuilder,TextDisplayBuilder,MessageFlags} from 'discord.js';
import {replyEditPayload,editInteractionReply,deferInteractionReply,discordErrorSummary} from '../../apps/controller/dist/interactionReply.js';
const V2=MessageFlags.IsComponentsV2;
test('V2 edits explicitly set the Discord flag and clear legacy fields without mutating input',()=>{
 const payload={components:[{type:17,accent_color:14067770,components:[{type:10,content:'Port Battle Signup'}]}]};const body=replyEditPayload(payload);assert.equal(body.flags&V2,V2);assert.equal(body.content,null);assert.deepEqual(body.embeds,[]);assert.equal(body.components[0].type,17);assert.equal(payload.flags,undefined);assert.equal(payload.content,undefined);
 const builder=new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('Private Music Controls'));assert.equal(replyEditPayload({components:[builder]}).flags&V2,V2);
});
test('legacy replies stay legacy; V2 fallback text is rendered as a TextDisplay',()=>{
 const old={content:'Saved',components:[{type:1,components:[]}]};assert.equal(replyEditPayload(old),old);assert.equal(replyEditPayload('Saved'),'Saved');const body=replyEditPayload({content:'Request unavailable',flags:V2|MessageFlags.SuppressEmbeds|MessageFlags.Ephemeral});assert.equal(body.flags,V2|MessageFlags.SuppressEmbeds);assert.deepEqual(body.components,[{type:10,content:'Request unavailable'}]);
});
test('deferred V2 and component-update replies keep their V2 flag; failures remain catchable',async()=>{
 let sent,deferredOptions;const i={deferReply:async options=>{deferredOptions=options},editReply:async p=>{sent=p;return {id:'response'}}};await deferInteractionReply(i,{flags:V2|MessageFlags.Ephemeral});assert.equal(deferredOptions.flags,MessageFlags.Ephemeral);await editInteractionReply(i,'Temporary error');assert.equal(sent.flags&V2,V2);assert.equal(sent.components[0].content,'Temporary error');const c={message:{flags:{has:flag=>flag===V2}},editReply:i.editReply};await editInteractionReply(c,{components:[{type:1,components:[]}]});assert.equal(sent.flags&V2,V2);i.editReply=async()=>{throw Object.assign(new Error('Invalid Form Body'),{code:50035})};await assert.rejects(()=>editInteractionReply(i,{components:[{type:17,components:[]}]}),{code:50035});
});
test('controller awaits returned interaction work and retired Wiki module has no removed DB imports',async()=>{
 const code=await readFile(new URL('../../apps/controller/src/index.ts',import.meta.url),'utf8');assert.doesNotMatch(code,/return void (?!await\b)/);assert.doesNotMatch(code,/interaction\.editReply\(/);for(const workspace of ['controller','api']){const legacy=await readFile(new URL(`../../apps/${workspace}/src/knowledge.ts`,import.meta.url),'utf8');assert.doesNotMatch(legacy,/import\s.*from\s*["']@bom\/db/);}const summary=discordErrorSummary({message:'Failed https://discord.com/api/webhooks/secret',requestBody:{token:'secret'},url:'secret',code:50035});assert.ok(!JSON.stringify(summary).includes('secret'));assert.equal(summary.code,50035);
});
