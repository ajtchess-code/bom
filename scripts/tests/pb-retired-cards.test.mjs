import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../../apps/controller/src/index.ts',import.meta.url),'utf8');
const text=stripTypeScriptTypes(source.slice(source.indexOf('let pbLastOrphanScanAt=0;'),source.indexOf('const pbCleanedRosterChannels=')));
const functionWith=(ctx)=>Function(...Object.keys(ctx),text+';return removeObsoletePbDiscordCards;')(...Object.values(ctx));
test('cancelled, finished, deleted signup and roster cards are deleted and pointers cleared',async()=>{
 const deleted=[],cleared=[];
 const records=['CANCELLED','FINISHED','DELETED'].map((status,i)=>({id:'b'+i,status,discord_signup_message_id:'s'+i,discord_roster_message_id:'r'+i}));
 const signup={id:'signup',messages:{fetch:async()=>new Map()}},roster={id:'roster'};
 const run=functionWith({many:async()=>records,guildId:'guild',db:{query:async(sql,values)=>cleared.push(values[0])},pbTextChannel:async()=>null,pbFetchMessage:async(_ch,id)=>({id,pinned:false,delete:async()=>deleted.push(id)}),client:{user:{id:'bot'}},discordErrorSummary:String});
 await run(signup,roster,[{id:'active'}]);
 assert.deepEqual(deleted.sort(),['r0','r1','r2','s0','s1','s2']);
 assert.deepEqual(cleared.sort(),['b0','b1','b2']);
});
test('orphan scan deletes only bot-owned signup cards no longer active',async()=>{
 const deleted=[],orphan='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',active='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
 const build=(id,author='bot')=>({id,author:{id:author},components:[{components:[{customId:`pb:late:${id}`}]}],delete:async()=>deleted.push(id)});
 const messages=new Map([[orphan,build(orphan)],[active,build(active)],['thirdparty',build('cccccccc-cccc-cccc-cccc-cccccccccccc','other')]]);
 const run=functionWith({many:async()=>[],guildId:'guild',db:{query:async()=>{}},pbTextChannel:async()=>null,pbFetchMessage:async()=>null,client:{user:{id:'bot'}},discordErrorSummary:String});
 await run({id:'signup',messages:{fetch:async()=>messages}},{id:'roster'},[{id:active}]);
 assert.deepEqual(deleted,[orphan]);
});
