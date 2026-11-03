import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../../apps/controller/src/index.ts',import.meta.url),'utf8');
const body=source.slice(source.indexOf('async function playNext('),source.indexOf('\nconst brandingColorCache'));
async function run({queue=[],radio=false,preferred}={}){
 const calls=[];const room={id:'room',voice_channel_id:'voice',preferred_worker_id:radio?'8':'1',autoplay:true};
 const context={guildId:'guild',roomById:async()=>room,oneOrNone:async()=>({enabled:radio,voice_channel_id:'voice',stream_url:'station'}),randomUUID:()=> 'id',dequeue:async()=>queue.shift(),dequeueByRequestId:async(_room,id)=>{const i=queue.findIndex(x=>x.requestId===id);return i<0?null:queue.splice(i,1)[0]},checkpointRoom:async()=>{},startItem:async(_,item)=>calls.push(['play',item.query]),getRoomState:async()=>({workerId:'1',track:{title:'Old song'}}),setRoomState:async(_,state)=>calls.push(['state',state]),publishWorkerCommand:async(_,cmd)=>calls.push(['command',cmd.type]),releaseWorker:async()=>calls.push(['release']),refreshPanel:async()=>calls.push(['refresh']),console};
 vm.createContext(context);vm.runInContext(body.replace('roomId:string,preferredRequestId?:string','roomId,preferredRequestId').replaceAll(':QueueItem','').replaceAll('<any>','').replaceAll('guildId!','guildId').replaceAll('err:any','err')+';this.playNext=playNext;',context);
 await context.playNext('room',preferred);return calls;
}
test('empty ordinary queue stops despite legacy autoplay being enabled',async()=>{const calls=await run();assert.equal(calls.some(c=>c[0]==='play'),false);assert.equal(calls.find(c=>c[0]==='state')[1].status,'IDLE');assert.ok(calls.some(c=>c[1]==='LEAVE'));assert.ok(calls.some(c=>c[0]==='release'));});
test('queued requests still advance',async()=>{const calls=await run({queue:[{query:'Next song'}]});assert.deepEqual(calls,[['play','Next song']]);});
test('dedicated radio retains its explicit station behavior',async()=>{assert.deepEqual(await run({radio:true}),[['play','station']]);});

test('skip-to selects the requested track without dropping earlier tracks',async()=>{const queue=[{requestId:'a',query:'First'},{requestId:'b',query:'Selected'}];const calls=await run({queue,preferred:'b'});assert.deepEqual(calls,[['play','Selected']]);assert.equal(queue[0].requestId,'a');});
