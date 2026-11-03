import test from 'node:test';
import assert from 'node:assert/strict';
import {VoiceReporter} from '../src/voice/voiceReporter.js';
import {readableVoiceText} from '../src/voice/voiceCard.js';
function fixture(old=false){
 const values=new Map<string,string>(old?[['voice_status_message_id','old'],['voice_status_snapshot','[]']]:[]);
 const calls:any[]=[];
 const hook={disabled:false,send:async(p:any)=>{calls.push(['send',p]);return{id:'new'}},edit:async(id:string,p:any)=>{calls.push(['edit',id,p]);return{id}},delete:async(id:string)=>{calls.push(['delete',id])}};
 const reporter=new VoiceReporter({guilds:{cache:new Map()}} as any,{voiceGuildIds:new Set(['1'])} as any,{getSetting:(k:string)=>values.get(k)??null,setSetting:(k:string,v:string)=>values.set(k,v),deleteSetting:(k:string)=>values.delete(k)} as any,hook as any,{info(){},warn(){},error(){}} as any,'FAT Relay');
 return{reporter,values,calls};
}
test('empty voice stays visible under the route label and unchanged sync does not repost',async()=>{const f=fixture();await f.reporter.sync();assert.equal(f.calls[0][1].username,'FAT Relay');assert.equal(f.calls[0][1].embeds[0].title,'No One In Voice');await f.reporter.sync();assert.equal(f.calls.length,1);await f.reporter.sync(true);assert.equal(f.calls[1][0],'edit');});
test('existing legacy post recreated once for new identity',async()=>{const f=fixture(true);await f.reporter.sync();assert.equal(f.calls[0][0],'delete');assert.equal(f.calls[1][0],'send');await f.reporter.sync();assert.equal(f.calls.length,2)});
test('last participant leaving clears old image on the same message',async()=>{const f=fixture();await f.reporter.sync();f.values.set('voice_status_snapshot','occupied');await f.reporter.sync();const edit=f.calls[1];assert.equal(edit[0],'edit');assert.deepEqual(edit[2].attachments,[]);assert.equal(edit[2].embeds[0].title,'No One In Voice');});
test('decorative mathematical headings normalize to font-supported text',()=>{assert.equal(readableVoiceText('𝗙𝗟𝗘𝗘𝗧 / 𝙑𝙤𝙞𝙘𝙚'),'FLEET / Voice')});
