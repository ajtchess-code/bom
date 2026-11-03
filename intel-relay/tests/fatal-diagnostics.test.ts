import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';

test('fatal exceptions retain the cause and exit without leaking the dashboard password',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'intel-fatal-'));
 const portServer=net.createServer();
 await new Promise<void>(resolve=>portServer.listen(0,'127.0.0.1',resolve));
 const port=(portServer.address() as net.AddressInfo).port;
 await new Promise<void>(resolve=>portServer.close(()=>resolve()));
 const password='private-test-dashboard-password';
 const script=`await import('./src/index.ts'); setTimeout(()=>{throw Object.assign(new Error('test crash '+process.env.DASHBOARD_PASSWORD),{code:'TEST_FATAL'});},20);`;
 try {
 const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',script],{env:{PATH:process.env.PATH!,DATA_DIR:dir,DASHBOARD_PASSWORD:password,DASHBOARD_HOST:'127.0.0.1',DASHBOARD_PORT:String(port),COOKIE_SECURE:'false',LOG_LEVEL:'error'}});
 let output='';child.stdout.on('data',b=>{output+=b});child.stderr.on('data',b=>{output+=b});
 const timer=setTimeout(()=>child.kill('SIGKILL'),10000);
 const code=await new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});clearTimeout(timer);
 assert.equal(code,1,output);assert.match(output,/Fatal uncaught exception/);assert.match(output,/test crash/);assert.match(output,/TEST_FATAL/);assert.match(output,/stack/);assert.ok(!output.includes(password));assert.ok(!output.includes('Unhandled rejection'));
 }finally{rmSync(dir,{recursive:true,force:true})}
});
