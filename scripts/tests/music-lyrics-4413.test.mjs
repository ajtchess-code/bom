import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../../apps/worker/src/index.ts',import.meta.url),'utf8');
const a=src.indexOf('if(cmd.type==="LYRICS"){'),b=src.indexOf('\n  }',a)+4;
const branch=src.slice(a,b).replaceAll('err:any','err');
function setup(fetchLyrics){
 const events=[],warnings=[];const context={runtime:{roomId:'room'},workerId:'1',lyricsPending:false,lyricsRetryAfter:0,fetchLyrics,publishEvent:async e=>events.push(e),Date,console:{warn:(...args)=>warnings.push(args)}};
 vm.createContext(context);vm.runInContext('this.handleLyrics=async function(cmd){'+branch+'}',context);
 return{context,events,warnings,run:()=>context.handleLyrics({type:'LYRICS',roomId:'room',guildId:'guild'})};
}
test('provider 500 returns unavailable metadata without a playback error and cools down',async()=>{let calls=0;const x=setup(async()=>{calls++;throw Error('Lyrics request failed (500)')});await x.run();await x.run();assert.equal(calls,1);assert.equal(x.warnings.length,1);assert.equal(x.events[0].type,'LYRICS');assert.equal(x.events[0].lyrics,null);assert.equal(x.context.lyricsPending,false);});
test('concurrent lyrics requests share one provider attempt',async()=>{let finish;const x=setup(()=>new Promise(r=>finish=r));const first=x.run();await x.run();finish({lines:[]});await first;assert.equal(x.events.length,1);});
test('old track lyrics are discarded after playback changes',async()=>{let finish;const x=setup(()=>new Promise(r=>finish=r));const first=x.run();x.context.runtime={roomId:'room'};finish({lines:[]});await first;assert.equal(x.events.length,0);});
