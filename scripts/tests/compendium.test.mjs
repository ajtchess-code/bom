// Sea Battle Compendium hosting: ZIP parts, verification, activation, path safety and the BOM chrome.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

/** Minimal ZIP writer (deflate) for the test fixtures. */
function zip(files){
  const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
  const crc=b=>{let c=0xffffffff;for(const x of b)c=crcTable[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
  const locals=[],central=[];let offset=0;
  for(const [name,text] of Object.entries(files)){
    const body=Buffer.from(text),comp=deflateRawSync(body),n=Buffer.from(name);
    const lh=Buffer.alloc(30);lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(20,4);lh.writeUInt16LE(8,8);lh.writeUInt32LE(crc(body),14);lh.writeUInt32LE(comp.length,18);lh.writeUInt32LE(body.length,22);lh.writeUInt16LE(n.length,26);
    const ch=Buffer.alloc(46);ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);ch.writeUInt16LE(8,10);ch.writeUInt32LE(crc(body),16);ch.writeUInt32LE(comp.length,20);ch.writeUInt32LE(body.length,24);ch.writeUInt16LE(n.length,28);ch.writeUInt32LE(offset,42);
    locals.push(lh,n,comp);central.push(ch,n);offset+=30+n.length+comp.length;
  }
  const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(central.length/2,8);end.writeUInt16LE(central.length/2,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,cd,end]);
}
const sha=b=>createHash('sha256').update(b).digest('hex');

test('a Compendium release uploads in parts, verifies and goes live',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'compendium-'));const cwd=process.cwd();process.chdir(dir);
  try{
    process.env.COMPENDIUM_UPLOAD_TOKEN='test-token-0123456789abcdef';
    const C=await import('../../apps/dashboard/lib/compendium.ts');
    assert.equal(await C.verifyUploadToken('Bearer test-token-0123456789abcdef'),true);
    assert.equal(await C.verifyUploadToken('Bearer wrong-token-0123456789abcdef'),false);
    const a=zip({'index.html':'<html><head><title>Main page</title></head><body><div id="side"></div><main><p>Hello sailors.</p></main></body></html>'});
    const b=zip({'ship/bellona.html':'<html><body>Bellona</body></html>','assets/hit-data.js':'window.HIT_DATA={};'});
    const up=await C.beginUpload({release:'r1',parts:[{index:0,size:a.length,sha256:sha(a)},{index:1,size:b.length,sha256:sha(b)}]});
    await assert.rejects(()=>C.receivePart(up.id,0,b),/damaged/);
    await C.receivePart(up.id,0,a);
    await assert.rejects(()=>C.finishUpload(up.id),/missing/);
    await C.receivePart(up.id,1,b);
    const live=await C.finishUpload(up.id);
    assert.equal(live.release,'r1');assert.equal(live.files,3);
    assert.equal((await C.activeRelease()).release,'r1');
    assert.equal(C.safeJoin(live.directory,['..','secret']),null);
    assert.ok(C.safeJoin(live.directory,['ship','bellona.html']).endsWith('bellona.html'));
    const html=C.decorate(await readFile(join(live.directory,'index.html'),'utf8'),{adClient:'ca-pub-1234567890',adSlots:{top:'1',bottom:''},donateUrl:'https://paypal.me/x',loginUrl:'/',discordUrl:''},'/');
    assert.match(html,/adsbygoogle\.js\?client=ca-pub-1234567890/);assert.match(html,/Donate with PayPal/);assert.match(html,/og:description" content="Hello sailors\./);
    const full=C.decorate('<html><head></head><body><canvas></canvas></body></html>',{adClient:'',adSlots:{top:'',bottom:''},donateUrl:'x',loginUrl:'/',discordUrl:''},'/');
    assert.doesNotMatch(full,/bomBar/,'full-screen tools keep their own layout');
    const bad=zip({'../evil.txt':'x'});
    await assert.rejects(()=>C.extractZip(bad,join(dir,'x')),/Unsafe path/);
  }finally{process.chdir(cwd);await rm(dir,{recursive:true,force:true});delete process.env.COMPENDIUM_UPLOAD_TOKEN;}
});
