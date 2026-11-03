import {test} from 'node:test';import assert from 'node:assert/strict';
import {makeDiscordScheduler} from '../../packages/redis/dist/discordRest.js';
function store(){const values=new Map();return {values,get:async k=>values.get(k)??null,set:async(k,v,...opts)=>{if(opts.includes('NX')&&values.has(k))return null;values.set(k,v);return 'OK'},release:async(k,t)=>{if(values.get(k)===t)values.delete(k)}}}
test('direct REST scheduler serializes requests, retries explicit 429 and keeps tokens out of keys',async()=>{
 const s=store();let calls=0,active=0,max=0;
 const request=makeDiscordScheduler(s,s.release,async()=>{calls++;active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;return calls===1?Response.json({retry_after:0.01},{status:429}):Response.json({ok:true})});
 const init={headers:{authorization:'Bot test-secret'}};const responses=await Promise.all([request('https://discord.com/api/v10/channels/1/messages',init),request('https://discord.com/api/v10/channels/1/messages',init)]);
 assert.equal(max,1);assert.equal(calls,3);assert.ok(responses.every(r=>r.status===200));assert.ok([...s.values.keys()].every(k=>!k.includes('test-secret')));
});
test('direct REST scheduler never blindly retries ambiguous write failures',async()=>{const s=store();let calls=0;const request=makeDiscordScheduler(s,s.release,async()=>{calls++;throw Error('Connection lost')});await assert.rejects(request('https://discord.com/api/v10/channels/1/messages',{method:'POST'}));assert.equal(calls,1);assert.equal([...s.values.keys()].filter(k=>k.endsWith(':lock')).length,0)});
