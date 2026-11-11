import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {ammoCandidates,availableRecipes,craftAllowance,islandBuildingCost,islandPopulation,nodeScenario,sampleWeights,weaponRange,workshopPlan} from '../../packages/shared/src/wikiPlanning.ts';
import {GameWiki,craftingPlan} from '../../apps/api/src/gameWiki.ts';
import {wikiPlanningData} from '../../apps/api/src/wikiPlanningData.ts';

test('node subscriptions, skills and captives combine in source order, with ration failure distinct from Self-Supply',()=>{
 const base={capacity:1000,output:40,hired:true,captives:true,rations:true,needsRations:true,selfSupply:false,farm:false,logistician:true,storagePercent:30,speedPercent:25,operationsPerHour:2};
 const r=nodeScenario(base);assert.equal(r.capacity,1550);assert.equal(r.speed,3.5);assert.equal(r.perHour,280);assert.equal(r.fillHours,1550/280);
 assert.equal(nodeScenario({...base,rations:false}).speed,0);
 assert.equal(nodeScenario({...base,rations:false,selfSupply:true}).speed,.875);
 assert.equal(nodeScenario({...base,rations:false,selfSupply:true,farm:true}).speed,0);
 assert.equal(nodeScenario({...base,capacity:3.402823466e38}).capacity,null);
 assert.equal(nodeScenario({...base,operationsPerHour:undefined}).fillHours,null);
});
test('11 warehouses supplement dangerous-water free ports without exceeding two workshops per port',()=>{
 assert.deepEqual(workshopPlan(42,12,11,true,true),{workshops:65,extraDanger:12,extraWarehouse:11,bonus:325});
 assert.equal(workshopPlan(42,40,11,true,true).workshops,84);
 assert.equal(workshopPlan(42,12,11,true,true,false).bonus,210);
 assert.equal(workshopPlan(42,12,11,false,true).workshops,53);
});
test('island build prices retain integer division and are independent of building identity',()=>{
 assert.deepEqual(islandBuildingCost(9,0),{gold:200,materials:{}});
 assert.equal(islandBuildingCost(10,0).gold,500);
 assert.deepEqual(islandBuildingCost(20,1),{gold:3600,materials:{'16':25,'20':50,'1':100}});
 assert.equal(islandBuildingCost(20,5).gold,13000);
 assert.equal(islandPopulation([1,3,4,5,6],25),205);
 assert.throws(()=>islandBuildingCost(20,-1));
});
test('range planning keeps mortar dead zones and does not turn swivel absolute range into a multiplier',()=>{
 assert.deepEqual(weaponRange({Distance:'70-145',Class:'Mortar'},{DistanceFactor:.9}),{min:63,max:130.5});
 assert.deepEqual(weaponRange({Distance:'1',Class:'Special',AmmoType:'FalkonetBall'},{DistanceFactor:145}),{min:0,max:145});
 assert.equal(weaponRange({Distance:'1',Class:'Special',AmmoType:'FalkonetBall'},null),null);assert.deepEqual(ammoCandidates({Class:'Special EightShot'},[]),[]);assert.deepEqual(weaponRange({Distance:'130',Class:'Special EightShot'},null),{min:0,max:130});
 assert.equal(weaponRange({Distance:'70-145|80-160',Class:'Mortar'},{DistanceFactor:1},6),null);
 const ammo=['cball_1','cball_6','cball_7','cball_8','cball_s','cball_13','removed'].map(ID=>({ID}));
 assert.deepEqual(ammoCandidates({Class:'Mortar'},ammo).map(a=>a.ID),['cball_6','cball_8']);
 assert.deepEqual(ammoCandidates({Class:'LiteCannon'},ammo).map(a=>a.ID),['cball_1','cball_7','cball_s']);
});
test('guild and island recipe availability filters actual dependency options, not just dropdown labels',()=>{
 const recipes=[{RecipeID:'regular',OutputType:'resource',OutputID:4,OutputQuantity:10,Context:'Workshop'},{RecipeID:'guild',OutputType:'resource',OutputID:4,OutputQuantity:5000,Context:'Workshop',AnnotationKey:'guild'},{RecipeID:'island',OutputType:'resource',OutputID:4,OutputQuantity:1,Context:'Personal island workshop'}];
 const regular=availableRecipes(recipes,false,'port');assert.deepEqual(regular.map(r=>r.RecipeID),['regular']);
 assert.deepEqual(availableRecipes(recipes,true,'island').map(r=>r.RecipeID),['island']);
 assert.throws(()=>craftingPlan(regular,[],'guild',1));
});
test('subscription applies to the whole limit but only base regeneration',()=>{assert.deepEqual(craftAllowance(1000,50,325,300,30,true,true,true),{limit:2512,recovery:110});});

test('weighted simulation rejects empty/invalid odds and preserves zero-probability outcomes',()=>{
 assert.throws(()=>sampleWeights([]));assert.throws(()=>sampleWeights([0,0]));assert.throws(()=>sampleWeights([-1,2]));
 assert.equal(sampleWeights([0,1,9],()=>0),1);assert.equal(sampleWeights([0,1,9],()=>.11),2);
});
test('planner data resolves all crew names and exposes only extracted Elite baseline categories',{skip:!existsSync(resolve('data/wiki-v2/catalog.json'))},async()=>{
 const d=await wikiPlanningData(new GameWiki(resolve('data/wiki-v2')),()=>[]);
 assert.equal(d.crew.length,51);assert.equal(d.crew[0].EnglishName,'Midshipman');assert.ok(d.crew.every(c=>c.EnglishName!=='Special'));
 assert.equal(d.rulesVerified,true);assert.equal(d.chest.presets.large.groups.length,41);assert.equal(d.chest.presets.incan.groups.length,5);assert.ok(Math.abs(d.chest.presets.incan.groups[0].weight-.1)<.000001);assert.equal(d.chest.groups.length,9);assert.equal(d.chest.groups.reduce((n,g)=>n+g.weight,0),100);
 assert.equal(d.ports.length,42);assert.ok(d.nodes.some(n=>n.SceneTable==='World_j'));
 assert.equal(d.buildings[0].name,'Dock');assert.ok(d.consumables.some(c=>c.temporaryHp===150));
});
