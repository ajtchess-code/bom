import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { isolatedIntelEnv, parseIntelEnv, validateIntelEnv, validateIntelRuntime, prepareIntelRelay } from '../intel-relay.mjs';

test('root bot secrets and port do not enter relay environment',()=>{
 const host={PATH:'/bin',HOME:'/tmp',DASHBOARD_PORT:'3000',DASHBOARD_PASSWORD:'root-secret',DISCORD_BOT_TOKEN:'root-token',DATABASE_URL:'root-database',TUNNEL_TOKEN:'root-tunnel',NODE_OPTIONS:'--require unwanted'};
 const env=isolatedIntelEnv(host,{DASHBOARD_PASSWORD:'relay-password-long',DASHBOARD_PORT:'8196'},'/host/intel-relay');
 assert.equal(env.DASHBOARD_PORT,'8196');assert.equal(env.DASHBOARD_PASSWORD,'relay-password-long');assert.equal(env.DATA_DIR,'/host/intel-relay/data');
 for(const key of ['DISCORD_BOT_TOKEN','DATABASE_URL','TUNNEL_TOKEN','NODE_OPTIONS'])assert.equal(env[key],undefined);
 assert.equal(host.DASHBOARD_PORT,'3000');assert.equal(env.PUBLIC_ORIGIN,'https://intel.bandofmisfits.org');
});
test('port collisions and insecure public cookie configuration are rejected',()=>{
 const env=isolatedIntelEnv({}, {DASHBOARD_PASSWORD:'test-password-long'},'/host/intel-relay');
 assert.throws(()=>validateIntelEnv(env,[8196]),/conflicts/);
 assert.throws(()=>validateIntelEnv({...env,COOKIE_SECURE:'false'}),/COOKIE_SECURE/);
 assert.throws(()=>validateIntelEnv({...env,DASHBOARD_PORT:'0'}),/Invalid/);
 assert.doesNotThrow(()=>validateIntelEnv(env,[3000,4100,6379]));
});
test('relay env parser preserves quoted hashes and trims comments',()=>{
 assert.deepEqual(parseIntelEnv('DASHBOARD_PASSWORD="password # with spaces"\nDASHBOARD_PORT=8196 # relay\n'),{DASHBOARD_PASSWORD:'password # with spaces',DASHBOARD_PORT:'8196'});
});
test('relay is optional and disabled without configuration',()=>{
 const root=mkdtempSync(join(os.tmpdir(),'intel-host-'));
 try{assert.equal(prepareIntelRelay({root,hostEnv:{INTEL_RELAY_ENABLED:'false'}}),null);assert.equal(prepareIntelRelay({root,hostEnv:{}}),null)}finally{rmSync(root,{recursive:true,force:true})}
});
test('prepare installs/builds only in relay subfolder with isolated environment',()=>{
 const root=mkdtempSync(join(os.tmpdir(),'intel-host-'));const dir=join(root,'intel-relay');mkdirSync(dir);writeFileSync(join(dir,'package.json'),'{}');writeFileSync(join(dir,'package-lock.json'),'{}');writeFileSync(join(dir,'.env'),'DASHBOARD_PASSWORD="test-password-long"\n');
 const calls=[];
 const run=(cmd,args,options)=>{calls.push({cmd,args,options});if(args[0]==='ci')mkdirSync(join(dir,'node_modules'));return {status:0}};
 try{const result=prepareIntelRelay({root,occupiedPorts:[3000,4100],hostEnv:{PATH:'/bin',DISCORD_BOT_TOKEN:'private',DASHBOARD_PORT:'3000'},run});assert.equal(result.cwd,dir);assert.equal(result.env.DASHBOARD_PORT,'8196');assert.equal(calls.length,2);assert.equal(calls[0].args[0],'ci');assert.equal(calls[1].args[1],'build');for(const call of calls){assert.equal(call.options.cwd,dir);assert.equal(call.options.env.DISCORD_BOT_TOKEN,undefined)}assert.equal(result.entry,join(dir,'dist/src/index.js'))}finally{rmSync(root,{recursive:true,force:true})}
});


test('Node 22.21.0 is accepted after a real SQLite JSON and busy-timeout check',()=>{assert.match(validateIntelRuntime('22.21.0','node22'),/22.21.0/);});
test('Node 24 remains accepted and older unsupported runtimes fail clearly',()=>{assert.match(validateIntelRuntime('24.0.0','node24'),/24.0.0/);for(const version of ['20.19.0','22.20.0','23.0.0','invalid'])assert.throws(()=>validateIntelRuntime(version,'node'),/22.21.0/);});
test('supported version still fails closed when built-in SQLite is unavailable',()=>{assert.throws(()=>validateIntelRuntime('22.21.0','node',()=>{throw Error('missing built-in SQLite')}),/SQLite check failed.*missing built-in SQLite/);});
