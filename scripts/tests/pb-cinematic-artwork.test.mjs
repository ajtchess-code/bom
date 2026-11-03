import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {ensureBattleArtwork,artworkFaction} from '../../apps/controller/dist/pbArtwork.js';
test('faction aliases choose the saved faction artwork',()=>{for(const [input,expected] of [['Antilia','antilia'],['Español','espaniol'],['Espaniol','espaniol'],['Kai & Severia','kai-severia'],['Pirates','pirates']])assert.equal(artworkFaction(input),expected);});
test('cinematic renderer resolves guild faction overrides, reversal, cache and Unicode',async()=>{
 const guilds=[{tag:'BOM',faction:'Pirates'},{tag:'TEST',faction:'Antilia'}];
 const battle={port_name:'Aruba',attacker:'BOM',defender:'TEST'};
 const first=await ensureBattleArtwork(battle,guilds,'https://example.invalid');assert.ok(first);
 assert.equal(await ensureBattleArtwork(battle,guilds,'https://example.invalid'),first);
 const changed=await ensureBattleArtwork(battle,[guilds[0],{tag:'TEST',faction:'Español'}],'https://example.invalid');assert.ok(changed);assert.notEqual(first,changed);
 const reverse=await ensureBattleArtwork({...battle,attacker:'TEST',defender:'BOM'},guilds,'https://example.invalid');assert.ok(reverse);assert.notEqual(reverse,first);
 for(const faction of ['Kai & Severia','Pirates'])assert.ok(await ensureBattleArtwork({...battle,port_name:'Long Port Name & <Harbour>',defender:'海神殿'},[{tag:'海神殿',faction}],'https://example.invalid'));
 const image=await readFile(new URL('../../data/pb-art/'+first.split('/').at(-1),import.meta.url));const meta=await sharp(image).metadata();assert.equal(meta.width,2048);assert.equal(meta.height,800);
 assert.equal(await ensureBattleArtwork(battle,guilds,''),null);
});
