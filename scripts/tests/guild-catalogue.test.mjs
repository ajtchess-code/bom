import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const root=new URL('../../',import.meta.url);
const src=stripTypeScriptTypes(await readFile(new URL('packages/shared/src/guildCatalogue.ts',root),'utf8')).replace(/export /g,'');
const {mergeGuildCatalogue,resolveCatalogueGuild}=Function(src+';return {mergeGuildCatalogue,resolveCatalogueGuild}')();
const defaults=JSON.parse(await readFile(new URL('data/pb/guild-defaults.json',root)));
test('duplicate tags and exact case remain separate',()=>{
 assert.equal(defaults.filter(g=>g.tag==='BR').length,2);
 assert.equal(resolveCatalogueGuild(defaults,'BR').name,'Armada');
 assert.equal(resolveCatalogueGuild(defaults,'BR · TRADE BR').name,'TRADE BR');
 assert.notEqual(resolveCatalogueGuild(defaults,'HME').id,resolveCatalogueGuild(defaults,'HMe').id);
 assert.equal(mergeGuildCatalogue(defaults,[{tag:'BR',managerIds:['123']}]).filter(g=>g.tag==='BR').length,2);
});
test('migration preserves permissions, custom guilds, uncertain names; reruns safely',async()=>{
 const pg=new PGlite();await pg.exec('CREATE TABLE pb_discord_settings(guild_id text primary key,guild_catalog jsonb,updated_at timestamptz)');
 const original=[{tag:'BR',name:'Armada',allied:true,managerIds:['123'],logoUrl:'https://example.com/logo'},{tag:'§WG',name:'old',memberIds:['456']},{tag:'FAT',name:'Custom verified name'},{tag:'CUSTOM',name:'Keep me'}];
 await pg.query('INSERT INTO pb_discord_settings VALUES($1,$2,now())',['test',JSON.stringify(original)]);
 const sql=await readFile(new URL('packages/db/migrations/044_guild_screenshot_refresh.sql',root),'utf8');await pg.exec(sql);
 const get=async()=>(await pg.query('SELECT guild_catalog FROM pb_discord_settings')).rows[0].guild_catalog;
 const rows=await get();assert.equal(rows.filter(g=>g.tag==='BR').length,2);assert.equal(rows.find(g=>g.tag==='BR'&&!g.reference).allied,true);assert.deepEqual(rows.find(g=>g.tag==='SWG').memberIds,['456']);assert.equal(rows.find(g=>g.tag==='FAT').name,'Custom verified name');assert.ok(rows.find(g=>g.tag==='CUSTOM'));assert.equal(rows.find(g=>g.reference==='BR · TRADE BR').allied,false);
 await pg.exec(sql);assert.deepEqual(await get(),rows);assert.deepEqual((await pg.query('SELECT guild_catalog FROM pb_guild_catalogue_backups')).rows[0].guild_catalog,original);await pg.close();
});
