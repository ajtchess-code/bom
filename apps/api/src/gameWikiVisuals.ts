import type {GameWiki} from './gameWiki.js';
import {readFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {wikiPosition,routeLength} from '@bom/shared';
import {wikiBattleMaps} from './wikiBattleMaps.js';
const costFile='CodeArchive/Common/0x06002373_Common.Game.WosbCrafting_.cctor.il.txt';
const nameFile='CodeArchive/Common/0x06002349_Common.Game.NpcShipHelper_.cctor.il.txt';
export const nodeCostSchedule=[{index:0,gold:500,materials:{}},{index:1,gold:3000,materials:{}},{index:2,gold:9000,materials:{}},{index:3,gold:0,materials:{'29':20,'16':20,'5':1000}}];
export function extractNpcNames(il:string){
  const pools:{sourceField:string;names:string[]}[]=[];let names:string[]=[];
  for(const line of il.split(/\r?\n/)){
    const quoted=line.trim().match(/^\S+ call (['"])(.*)\1$/);if(quoted)names.push(quoted[2]);
    const field=line.match(/stsfld Common\.Game\.NpcShipHelper::.*token\((0x[0-9A-Fa-f]+)\)/);
    if(field&&names.length){pools.push({sourceField:field[1],names});names=[];}
  }
  return pools;
}
export async function wikiVisualData(wiki:GameWiki,section:string,images:(table:string,row:any)=>any[]){
  const all=(name:string)=>wiki.all(name);
  if(section==='coverage'){
    const inventory=await all('Images'),groups=[];const missingFiles:string[]=[];
    for(let start=0;start<inventory.length;start+=64){await Promise.all(inventory.slice(start,start+64).map(async i=>{try{await stat(resolve(wiki.directory,i.PNGPath));}catch(e:any){if(e.code==='ENOENT')missingFiles.push(i.PNGPath);else throw e;}}));}
    for(const table of ['ShipsToPlay','ShipDesingElements','EnvDesingElements','Resources','ShipUpgradesNew','UnitsInfo','Cannons','CannonBalls','PowderKegs']){
      const rows=await all(table),unresolved:any[]=[],inferred:any[]=[];let resolved=0;
      rows.forEach((row,index)=>{const found=images(table,row);if(found.length){resolved++;if(found.every((i:any)=>/candidate|inferred/i.test(i.Relationship)))inferred.push({row:index,name:row.EnglishName});}else unresolved.push({row:index,name:row.EnglishName});});
      groups.push({table,rows:rows.length,resolved,unresolved,inferred});
    }
    const extractionIssues=await all('Extraction_Issues');
    const issueGroups=Array.from(new Set(extractionIssues.map(i=>String(i.Detail)))).map(detail=>({detail,count:extractionIssues.filter(i=>String(i.Detail)===detail).length}));
    return {groups,imageFiles:inventory.length,missingFiles,issueGroups,knownGaps:[
      'Some ship construction material quantities still require gun-port model parsing.',
      'NPC name pools are available, but their assignment to particular hulls is unverified.',
      'The complete weapon/ammunition damage pipeline is not verified; armor alone cannot predict HP damage.',
      'Live market listings, stock, ownership, active spawns and player/event bonuses are outside this static export.',
      'Map models are not fully interpreted; plotted objects do not establish coastline geometry or current battle spawns.',
      '34 sail image links use texture-prefix candidates and remain explicitly inferred.'
    ],scope:'Image references and actual files on this host. This does not establish that the original game/client extraction is complete.'};
  }
  if(section==='nodes'){
    const [levels,resources,bytes]=await Promise.all([all('Factory_Levels'),all('Resources'),readFile(resolve(wiki.directory,costFile)).catch(()=>null)]);
    const verified=Boolean(bytes&&createHash('sha256').update(bytes).digest('hex')==='84fd57e54be3f9a15405b9d066d2bf03d3438f0fed0c74f5f0e83a71eeb1eb0e');
    return {levels,resources:resources.map(r=>({...r,images:images('Resources',r)})),costs:verified?nodeCostSchedule:[],costVerified:verified,costSource:costFile,costNotes:'Base client schedule: initialization uses index 0; LevelUpCost uses its level argument directly. Transition labels assume that argument is the current level. Special island/estate entries are excluded. Live discounts and alternate build methods are separate.'};
  }
  if(section==='atlas'){
    const [routes,ports,objects]=await Promise.all([all('TradingRoutesInfo'),all('WorldPorts'),all('Map_Objects')]);
    const placed=objects.map((o,row)=>({...o,row,position:wikiPosition(o.RawPosition)})).filter((o:any)=>o.SceneTable==='World_j'&&o.position);
    return {routes:routes.map((r,row)=>{const points=(r.Value??[]).map(wikiPosition);if(points.some((p:any)=>!p))throw new Error(`Invalid coordinates in route ${row+1}`);return {row,id:r.SourceRecord??row+1,points,length:routeLength(points)};}),ports:ports.map((p,row)=>{const location=placed.find((o:any)=>String(o.Parameters).split(/[,\s]+/).includes(p.PortName));return {...p,row,position:location?.position??null};}),objects:placed.map((o:any)=>({row:o.row,position:o.position,path:o.Path,parameters:o.Parameters})),battleMaps:wikiBattleMaps};
  }
  if(section==='wind')return {profiles:await all('WindRoses'),hulls:await all('ShipsBasics'),ships:await all('ShipsToPlay')};
  if(section==='npcs'){
    const [ships,types,text,poolText]=await Promise.all([all('ShipsToPlay'),all('NPC_Types'),all('English_Text'),readFile(resolve(wiki.directory,nameFile),'utf8').catch(()=>null)]);
    return {ships:ships.map((s,row)=>({...s,row,images:images('ShipsToPlay',s)})).filter((s:any)=>s.CanBeUsedForNpc===true),types:types.filter(t=>t.Type==='Common.Resources.NpcType'),categoryNames:text.filter(t=>String(t.Key).startsWith('npc_')),namePools:poolText?extractNpcNames(poolText):[],nameSource:nameFile};
  }
  if(section==='combat')return {weapons:await all('Cannons'),ammunition:await all('CannonBalls'),ships:await all('ShipsToPlay'),damageFormulaVerified:false};
  throw Object.assign(new Error('Unknown wiki tool'),{statusCode:404});
}
