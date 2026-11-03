import test from 'node:test';import assert from 'node:assert/strict';import {syncStickyDesk} from '../../apps/controller/src/stickyDesk.ts';import {guildDeskPanels} from '../../apps/controller/src/guildDeskPanels.ts';
const payload=guildDeskPanels({leave_enabled:true},[],'https://example.invalid');
function harness(){
 let n=100,sends=0,edits=0;
 const stored=new Map<string,any>(),ids:any={music:null,desk:null};
 const channel={
  messages:{fetch:async(args:any)=>{
   if(args.message){const message=stored.get(args.message);if(!message)throw {code:10008};return message;}
   return {some:(fn:any)=>[...stored.values()].filter(m=>BigInt(m.id)>BigInt(args.after)).some(fn)};
  }},
  send:async(body:any)=>{
   sends++;
   const message:any={id:String(++n),system:false,flags:{bitfield:32768,has:()=>true},components:structuredClone(body.components),embeds:[],pinned:false,
    edit:async(next:any)=>{edits++;message.components=structuredClone(next.components);},
    delete:async()=>{stored.delete(message.id);}
   };
   stored.set(message.id,message);return message;
  }
 };
 const run=()=>syncStickyDesk(channel,ids,payload,async(kind,id)=>{ids[kind]=id});
 return {stored,channel,ids,run,get sends(){return sends},get edits(){return edits},chat:()=>stored.set(String(++n),{id:String(n),system:false})};
}
test('music precedes desk, unchanged repairs send nothing, and content edits retain message IDs',async()=>{const h=harness();await h.run();assert.equal(h.sends,2);assert.ok(BigInt(h.ids.music)<BigInt(h.ids.desk));const desk=h.ids.desk;await h.run();assert.equal(h.sends,2);assert.equal(h.edits,0);payload.desk.components[0]!.components[0]={type:10,content:'## Updated crew desk'};await h.run();assert.equal(h.edits,1);assert.equal(h.ids.desk,desk)});
test('new chat moves the pair exactly once and removes old messages',async()=>{const h=harness();await h.run();const old=[h.ids.music,h.ids.desk];h.chat();await h.run();assert.equal(h.sends,4);for(const id of old)assert.equal(h.stored.has(id),false);await h.run();assert.equal(h.sends,4);assert.ok(BigInt(h.ids.music)<BigInt(h.ids.desk))});
test('permission failures do not create a replacement panel',async()=>{const h=harness();await h.run();h.channel.messages.fetch=async()=>{throw {code:50013}};await assert.rejects(h.run());assert.equal(h.sends,2)});
test('desk and music payloads are V2 and keep existing interaction IDs',()=>{const panels=guildDeskPanels({leave_enabled:false},[],'https://example.invalid');for(const body of [panels.music,panels.desk]){assert.equal(body.flags,32768);assert.deepEqual(body.allowedMentions,{parse:[]});assert.ok(!('embeds' in body));}const all=JSON.stringify(panels);for(const id of ['console:music:add','console:music:controls','console:music:queue','membership:leave:request','membership:leave:return'])assert.ok(all.includes(id));});
