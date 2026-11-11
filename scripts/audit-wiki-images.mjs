import {GameWiki} from '../apps/api/src/gameWiki.ts';
import {wikiImageResolver} from '../apps/api/src/wikiImages.ts';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const directory=resolve(process.argv[2]||'data/wiki-v2'),wiki=new GameWiki(directory);
const images=wikiImageResolver(await wiki.all('Images'),JSON.parse(await readFile(resolve(directory,'image-links.json'),'utf8')));
const report=[];
for(const table of ['ShipsToPlay','ShipDesingElements','EnvDesingElements','Resources','ShipUpgradesNew','UnitsInfo','Cannons','CannonBalls','PowderKegs']){
 const records=await wiki.all(table),unresolved=[];let matched=0;
 for(const [row,r] of records.entries()){const found=images(table,r);if(found.length)matched++;else unresolved.push({row,name:r.EnglishName,id:r.ID??r.Name,icon:r.IconName??r.Icon??r.IconTexture,texture:r.Texture});}
 report.push({table,records:records.length,matched,unresolved});
}
await writeFile(resolve(process.argv[3]||'../wiki-image-audit.json'),JSON.stringify(report,null,2));
console.log(report.map(({table,records,matched,unresolved})=>({table,records,matched,unresolved:unresolved.length})));
