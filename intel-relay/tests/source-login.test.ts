import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import {createDiscordClient} from '../src/bot/client.js';
const require=createRequire(import.meta.url);
const ready=require(path.join(path.dirname(require.resolve('discord.js-selfbot-v13')),'client/websocket/handlers/READY.js'));

test('real library READY and settings updates complete without broadcasting presence',async()=>{
 const client=createDiscordClient();let packets=0,readyChecks=0;
 // Any packet reaching the actual shard transport fails this offline test.
 (client.ws as any).shards.set(0,{send:()=>{packets++;throw new Error('unexpected network packet')}});
 try{
  for(const settings of [{status:'idle'},{status:'online',custom_status:{text:'Saved activity'}},{status:'dnd',custom_status:null}]){
   ready(client,{d:{user:{id:'123456789012345678',username:'Offline',discriminator:'0',avatar:null},private_channels:[],guilds:[],notes:{},relationships:[],user_settings:settings,user_guild_settings:[]}}, {id:0,checkReady:()=>readyChecks++});
   await new Promise(resolve=>setImmediate(resolve));
  }
  assert.equal(readyChecks,3);assert.equal(packets,0);
  assert.equal(client.user!.setPresence({status:'online'}),(client as any).presence);
  assert.equal(packets,0);
  for(const op of [3,4])assert.throws(()=>client.ws.broadcast({op,d:{}} as any),/SOURCE_READ_ONLY/);
  for(const method of ['POST','PATCH','PUT','DELETE'])assert.throws(()=>(client.rest as any).request(method as any,'/channels/123/messages' as any),/SOURCE_READ_ONLY/);
  assert.equal(packets,0);
 }finally{(client.ws as any).shards.clear();client.destroy();}
});
