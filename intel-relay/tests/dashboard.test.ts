import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AccountStore } from '../src/accounts/store.js';
import { DashboardServer } from '../src/dashboard/server.js';
import type { AccountManager } from '../src/accounts/manager.js';
import type { AddressInfo } from 'node:net';
test('account credentials are encrypted at rest and decrypt after restart',()=>{const dir=mkdtempSync(path.join(os.tmpdir(),'relay-store-'));try{const store=new AccountStore(dir);store.save([{id:'test',name:'Sample',token:'secret-user-token-example',webhook:'secret-webhook',voiceWebhook:'',channels:[],excludedChannels:[],voiceGuilds:[],ignoreBots:false,enabled:false}]);assert.ok(!readFileSync(path.join(dir,'accounts.enc')).includes(Buffer.from('secret-user-token-example')));assert.equal(new AccountStore(dir).load()[0]?.token,'secret-user-token-example')}finally{rmSync(dir,{recursive:true,force:true})}});
test('dashboard protects account API, rejects cross-origin changes and supports login/logout',async()=>{const manager={list:()=>[{id:'test',hasToken:true,status:'stopped'}]};const server=new DashboardServer(manager as unknown as AccountManager,'test-password-long-enough',false,path.resolve('src/dashboard/index.html'));await server.start('127.0.0.1',0);const base='http://127.0.0.1:'+(server.address() as AddressInfo).port;try{assert.equal((await fetch(base+'/api/accounts')).status,401);const health=await(await fetch(base+'/healthz')).json();assert.deepEqual(health,{ok:true});const wrong=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json',origin:'https://other.invalid'},body:JSON.stringify({password:'test-password-long-enough'})});assert.equal(wrong.status,403);const login=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify({password:'test-password-long-enough'})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')!.split(';')[0]!;assert.match(login.headers.get('set-cookie')!,/HttpOnly/);const accounts=await fetch(base+'/api/accounts',{headers:{cookie}});assert.equal(accounts.status,200);assert.ok(!(await accounts.text()).includes('secret-user-token'));const html=await fetch(base);assert.match(await html.text(),/BOM Intel/);assert.ok(html.headers.get('content-security-policy')?.includes('nonce-'));await fetch(base+'/api/logout',{method:'POST',headers:{cookie,origin:base,'content-type':'application/json'},body:'{}'});assert.equal((await fetch(base+'/api/accounts',{headers:{cookie}})).status,401)}finally{await server.stop()}});

test('real account manager supports credential-preserving updates and removal while stopped', async () => {
  const { AccountManager } = await import('../src/accounts/manager.js');
  const { Logger } = await import('../src/logging/logger.js');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'relay-manager-'));
  const manager = new AccountManager(new AccountStore(dir), new Logger('error'));
  const server = new DashboardServer(manager, 'offline-dashboard-test-password', false, path.resolve('src/dashboard/index.html'));
  await server.start('127.0.0.1', 0);
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  try {
    const login = await fetch(base + '/api/login', { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ password: 'offline-dashboard-test-password' }) });
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    const headers = { cookie, origin: base, 'content-type': 'application/json' };
    const created = await fetch(base + '/api/accounts', { method: 'POST', headers, body: JSON.stringify({ name: 'Offline account', token: 'offline-placeholder-token-only', webhook: 'https://discord.com/api/webhooks/123456789012345678/placeholder', enabled: false }) });
    assert.equal(created.status, 200);
    const { id } = await created.json() as { id: string };
    const update = await fetch(base + '/api/accounts/' + id, { method: 'PUT', headers, body: JSON.stringify({ token: '', webhook: '', channels: ['123456789012345679'] }) });
    assert.equal(update.status, 200);
    const list = await (await fetch(base + '/api/accounts', { headers })).json() as Record<string, unknown>[];
    assert.equal(list[0]?.status, 'stopped');
    assert.ok(!('token' in list[0]!) && !('webhook' in list[0]!));
    assert.equal(new AccountStore(dir).load()[0]?.token, 'offline-placeholder-token-only');
    assert.deepEqual(new AccountStore(dir).load()[0]?.channels, ['123456789012345679']);
    assert.equal((await fetch(base + '/api/accounts/' + id, { method: 'DELETE', headers, body: '{}' })).status, 200);
    assert.deepEqual(new AccountStore(dir).load(), []);
  } finally { await server.stop(); await manager.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('Cloudflare public origin is accepted with internal Host and secure session cookie',async()=>{
 const server=new DashboardServer({list:()=>[]} as unknown as AccountManager,'cloudflare-test-password',true,path.resolve('src/dashboard/index.html'),'https://intel.bandofmisfits.org');
 await server.start('127.0.0.1',0); const base='http://127.0.0.1:'+(server.address() as AddressInfo).port;
 try {
  const login=await fetch(base+'/api/login',{method:'POST',headers:{origin:'https://intel.bandofmisfits.org','content-type':'application/json'},body:JSON.stringify({password:'cloudflare-test-password'})});
  assert.equal(login.status,200);assert.match(login.headers.get('set-cookie')!,/; Secure/);
  const bad=await fetch(base+'/api/login',{method:'POST',headers:{origin:'https://dashboard.bandofmisfits.org','content-type':'application/json'},body:JSON.stringify({password:'cloudflare-test-password'})});
  assert.equal(bad.status,403);
 } finally {await server.stop()}
});

test('sub-relays preserve credentials, stay under one account, and validate source servers',async()=>{const {AccountManager}=await import('../src/accounts/manager.js');const {Logger}=await import('../src/logging/logger.js');const dir=mkdtempSync(path.join(os.tmpdir(),'relay-sub-'));const store=new AccountStore(dir),manager=new AccountManager(store,new Logger('error'));const hook='https://discord.com/api/webhooks/123456789012345678/primary_secret',subHook='https://discord.com/api/webhooks/223456789012345678/sub_secret',voice='https://discord.com/api/webhooks/323456789012345678/voice_secret';try{const id=await manager.save(null,{name:'Primary',token:'offline-user-token-placeholder',guildId:'123456789012345678',webhook:hook,enabled:false,subRelays:[{name:'Second server',guildId:'223456789012345678',webhook:subHook,voiceWebhook:voice,channels:['423456789012345678']}]});const first=manager.list()[0]!;assert.equal(first.subRelays.length,1);assert.ok(!JSON.stringify(first).includes('sub_secret'));assert.ok(!JSON.stringify(first).includes('voice_secret'));await manager.save(id,{subRelays:[{...first.subRelays[0],name:'Renamed',webhook:'',voiceWebhook:''}]});const restored=store.load()[0]!;assert.equal(restored.token,'offline-user-token-placeholder');assert.equal(restored.subRelays?.[0]?.webhook,subHook);assert.equal(restored.subRelays?.[0]?.voiceWebhook,voice);await assert.rejects(manager.save(id,{subRelays:[{...first.subRelays[0],guildId:'123456789012345678',webhook:''}]}));await manager.save(id,{subRelays:[]});assert.equal(manager.list()[0]!.subRelays.length,0);assert.equal(store.load()[0]!.webhook,hook);}finally{await manager.close();rmSync(dir,{recursive:true,force:true});}});

 test('authenticated search endpoint forwards query and keeps session protection',async()=>{
  let request:unknown;
  const manager={search:async(id:string,args:unknown)=>{request={id,args};return {state:'ready',messages:[],total:0}}};
  const server=new DashboardServer(manager as unknown as AccountManager,'search-dashboard-password',false,path.resolve('src/dashboard/index.html'));
  await server.start('127.0.0.1',0);const base='http://127.0.0.1:'+(server.address() as AddressInfo).port;
  try{const route=base+'/api/accounts/abcdef/search';assert.equal((await fetch(route)).status,401);
   const login=await fetch(base+'/api/login',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({password:'search-dashboard-password'})});
   const cookie=login.headers.get('set-cookie')!.split(';')[0]!;
   const response=await fetch(route,{method:'POST',headers:{cookie,origin:base,'content-type':'application/json'},body:JSON.stringify({guildId:'123456789012345678',query:'test'})});
   assert.equal(response.status,200);assert.deepEqual(request,{id:'abcdef',args:{guildId:'123456789012345678',query:'test'}});
   assert.equal((await fetch(route,{method:'POST',headers:{cookie,origin:'https://other.invalid','content-type':'application/json'},body:'{}'})).status,403);
  }finally{await server.stop()}
 });
