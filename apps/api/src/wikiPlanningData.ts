import type {GameWiki} from './gameWiki.js';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {recoveredChests} from './wikiRecoveredChests.js';

export function eliteChestGroups(il:string,text:Map<string,string>){
  const chunks=il.split(/\S+ ldc\.r4 /).slice(1);
  if(chunks.length!==9)return [];
  const groups=chunks.map((chunk,index)=>({id:index,weight:Number(chunk.split(/\s/)[0]),labels:[...new Set([...chunk.matchAll(/Common\.Local::get_(\w+) token/g)].map(m=>text.get(m[1])??m[1].replaceAll('_',' ')))]}));
  return groups.every(g=>Number.isFinite(g.weight)&&g.weight>0&&g.labels.length)&&Math.abs(groups.reduce((n,g)=>n+g.weight,0)-100)<.001?groups:[];
}
// The bundle reads 18 tables (English_Text alone is large), so build it once per
// installed release and reuse it for a while instead of on every planner request.
const cache=new Map<string,{at:number;value:Promise<any>}>();
export function wikiPlanningData(wiki:GameWiki,images:(table:string,row:any)=>any[]){
  const hit=cache.get(wiki.directory);
  if(hit&&Date.now()-hit.at<10*60_000)return hit.value;
  const value=buildPlanningData(wiki,images);
  cache.set(wiki.directory,{at:Date.now(),value});
  value.catch(()=>cache.delete(wiki.directory));
  return value;
}
async function buildPlanningData(wiki:GameWiki,images:(table:string,row:any)=>any[]){
  const names=['Resources','Cannons','CannonBalls','ShipsToPlay','ShipsBasics','ShipUpgradesNew','ShipDesingElements','CaptainSkills','GuildBonuses','Benefit_Levels','EnvDesingElements','Crew_Special','English_Text','WorldPorts','Mines_and_Nodes_Map_References','Factory_Levels','Achievements','Game_Enums'];
  const rows=await Promise.all(names.map(n=>wiki.all(n))),tables=Object.fromEntries(names.map((n,i)=>[n,rows[i]]));
  const text=new Map<string,string>(tables.English_Text.map((r:any)=>[r.Key,r.English]));
  const summary=await readFile(resolve(wiki.directory,'Extraction-Summary.json'),'utf8').then(s=>JSON.parse(s.replace(/^\uFEFF/,''))).catch(()=>null);
  const rulesVerified=summary?.CommonSHA256===recoveredChests.large.assemblySha256;
  const recovered=Object.fromEntries(Object.entries(recoveredChests).map(([key,preset])=>[key,{...preset,groups:rulesVerified?preset.groups.map(g=>({...g,labels:g.labelKeys.map(k=>text.get(k)??k.replaceAll('_',' '))})):[]}]));
  const pictured=(table:string)=>tables[table].map((r:any,row:number)=>({...r,row,images:images(table==='Crew_Special'?'UnitsInfo':table,r)}));
  const effects=[...pictured('ShipUpgradesNew').map((r:any)=>({...r,kind:'Upgrade',effect:r.EffectsBoost})),...pictured('ShipDesingElements').filter((r:any)=>r.BonusEffectType).map((r:any)=>({...r,kind:'Decoration',effect:String(r.BonusEffectType).split(' ').map((k:string,i:number)=>`${k} ${String(r.BonusEffectValue).split(' ')[i]}`).join(';')}))].filter(r=>/\b(PArmor|MArmor|PHealth|MHealth)\b/.test(r.effect));
  const chestFile='CodeArchive/Common/0x06002fb9_Common.Game.EliteChestRewards_.cctor.il.txt';
  const bytes=await readFile(resolve(wiki.directory,chestFile)).catch(()=>null);
  const crew=pictured('Crew_Special').map((r:any)=>({...r,EnglishName:text.get(`${r.ID}_name`)??r.ID,EnglishDescription:text.get(`${r.ID}_desc`)??r.EnglishDescription,effectDescription:[r.Effect,r.EffectPerSailor&&`${r.EffectPerSailor} per sailor`,r.EffectPerBoardingUnit&&`${r.EffectPerBoardingUnit} per boarding unit`].filter(Boolean).join('; ').replace(/\b([PMBC])([A-Z][A-Za-z]+)/g,(_,kind,field)=>field.replace(/([a-z])([A-Z])/g,'$1 $2')+(kind==='P'?' (%)':''))}));
  const elite=bytes?eliteChestGroups(bytes.toString('utf8'),text):[];
  return {rulesVerified,weapons:pictured('Cannons'),ammunition:pictured('CannonBalls'),ships:pictured('ShipsToPlay'),hulls:tables.ShipsBasics,effects,resources:pictured('Resources'),skills:tables.CaptainSkills,guild:tables.GuildBonuses,benefits:tables.Benefit_Levels,decorations:pictured('EnvDesingElements'),crew,
    buildings:Array.from({length:8},(_,i)=>({id:i+1,name:text.get(`personal_isle_b${i+1}_name`)??`Building ${i+1}`,description:text.get(`personal_isle_b${i+1}_tt`)??''})),
    ports:tables.WorldPorts,nodes:tables.Mines_and_Nodes_Map_References.map((r:any,row:number)=>({...r,row})),levels:tables.Factory_Levels,
    chest:{presets:{...recovered,elite:{groups:elite,source:chestFile,sourceSha256:bytes?createHash('sha256').update(bytes).digest('hex'):null,kind:'groups'}},groups:elite,limits:'Recovered client baseline weights. First-open guarantees, assurance counters, account eligibility, duplicate checks and server changes are excluded. Normalized baseline percentages are not a promise of live account odds.'},
    acquisition:[text.get('gamewiki_crew_text4'),text.get('gamewiki_crew_text5')].filter(Boolean),
    craftEvidence:tables.CaptainSkills.filter((r:any)=>/Craft|Workshop|PortStorage/.test(r.Effect)),
    collectionBonus:tables.Game_Enums.filter((r:any)=>r.Type==='Common.Game.CollectionAchievementBonus'&&/Craft/i.test(r.Member)),
    consumables:tables.English_Text.filter((r:any)=>/^item_desc\d+$/.test(r.Key)&&/durability|Defense|armor|health/i.test(r.English)).map((r:any)=>({...r,name:text.get(r.Key.replace('desc','name'))??r.Key,temporaryHp:Number(r.English.match(/^Add (\d+) temporary durability/)?.[1]??0)})),
    damageFormulaVerified:false,hitboxesVerified:false,
  };
}
