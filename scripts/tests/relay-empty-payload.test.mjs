import test from 'node:test';
import assert from 'node:assert/strict';
import {createOptionsForPart,editOptionsForPart} from '../../intel-relay/src/relay/payloadBuilder.ts';
const empty={chunks:[''],username:'Captain',embeds:[],files:[]};
test('empty relay creates and edits use an honest nonempty placeholder',()=>{
 assert.match(createOptionsForPart(empty,0).content,/no relayable text/);
 assert.match(editOptionsForPart(empty,0).content,/no relayable text/);
});
test('file-only and embed-only relays keep their original appearance',()=>{
 assert.equal(createOptionsForPart({...empty,embeds:[{title:'A report'}]},0).content,'');
 assert.equal(createOptionsForPart({...empty,files:[{attachment:Buffer.from('report'),name:'report.txt'}]},0).content,'');
});
