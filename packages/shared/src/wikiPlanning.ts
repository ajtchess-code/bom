/** Scenario arithmetic. Unknown combat/model rules deliberately have no fallback. */
export function availableRecipes(recipes:any[],guild=false,location='all'){
  return recipes.filter(r=>(guild||r.AnnotationKey!=='guild')&&(location==='all'||(location==='island'?r.Context==='Personal island workshop':r.Context!=='Personal island workshop')));
}
export function rankedValue(raw:unknown,index:number){
  const parts=String(raw??'').split('|');
  const text=parts.length===1?parts[0]:parts[index];
  if(!text||!/^\d+(?:\.\d+)?$/.test(text))return null;
  return Number(text);
}
export function weaponRange(weapon:any,ammo:any,index=0,percent=0,flat=0){
  const parts=String(weapon.Distance??'').split('|'),text=parts.length===1?parts[0]:parts[index];
  const match=text?.match(/^(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?$/);
  if(!match)return null;
  const swivel=weapon.AmmoType==='FalkonetBall';
  if(swivel&&!ammo)return null;
  const factor=Number(ammo?.DistanceFactor??1);
  if(!Number.isFinite(factor)||factor<=0)return null;
  // Swivel ammunition stores an absolute range, unlike ordinary round shot.
  const low=match[2]?Number(match[1]):0,high=match[2]?Number(match[2]):Number(match[1]);
  const max=(swivel?factor:high*factor)*(1+percent/100)+flat;
  return {min:low*(swivel?1:factor),max:Math.max(0,max)};
}
export function ammoCandidates(weapon:any,ammunition:any[]){
  const kind=String(weapon.Class).split(' ')[0];
  if(/PowderKegMortar/.test(String(weapon.Class))||(kind==='Special'&&weapon.AmmoType!=='FalkonetBall'))return [];
  return ammunition.filter(a=>a.ID!=='removed'&&(weapon.AmmoType==='FalkonetBall'?/^cball_(13|14|16|18)$/.test(a.ID):kind==='Mortar'?/^cball_(6|8)$/.test(a.ID):/^cball_([1-4]|7|s|ny)$/.test(a.ID)));
}
export function nodeScenario(input:{capacity:number;output:number;hired:boolean;captives:boolean;rations:boolean;needsRations:boolean;selfSupply:boolean;farm:boolean;logistician:boolean;storagePercent:number;speedPercent:number;operationsPerHour?:number}){
  const i=input;
  const capacity=i.capacity>=3e38?null:Math.floor(i.capacity*(1+(i.logistician?25:0)/100+i.storagePercent/100));
  let speed=1+(i.hired?.5:0)+i.speedPercent/100;
  if(i.needsRations&&!i.rations)speed=i.selfSupply&&!i.farm?speed*.25:0;
  if(i.captives)speed*=2;
  const perHour=i.operationsPerHour&&i.operationsPerHour>0?i.output*speed*i.operationsPerHour:null;
  return {capacity,speed,perHour,fillHours:capacity!==null&&perHour&&perHour>0?capacity/perHour:null};
}
export function islandBuildingCost(rank:number,alreadyBuilt:number){
  if(!Number.isInteger(alreadyBuilt)||alreadyBuilt<0||alreadyBuilt>8)throw new Error('Invalid building count');
  const base=rank<10?20:rank<20?50:100;
  if(!alreadyBuilt)return {gold:base*10,materials:{} as Record<string,number>};
  const a=base*alreadyBuilt*Math.max(1,alreadyBuilt-3),b=base*Math.max(1,alreadyBuilt-2);
  return {gold:Math.trunc(a/2)*6+Math.trunc(b/3)*100,materials:{'16':Math.trunc(a/4),'20':Math.trunc(a/2),'1':a}};
}
export function islandPopulation(buildings:number[],decor=0){return 50+buildings.reduce((n,id)=>n+(({1:100,2:20,5:20,6:10} as Record<number,number>)[id]??0),0)+decor;}
export function workshopPlan(portCount:number,dangerousCount:number,warehouseCount:number,secretHall:boolean,workforce:boolean,countBoth=true){
  const ports=Math.max(0,Math.floor(portCount)),danger=Math.min(ports,Math.max(0,Math.floor(dangerousCount)));
  const extraDanger=secretHall?danger:0,extraWarehouse=Math.min(ports-extraDanger,Math.max(0,Math.floor(warehouseCount)));
  const workshops=ports+extraDanger+extraWarehouse;
  return {workshops,extraDanger,extraWarehouse,bonus:workforce?(countBoth?workshops:ports)*5:0};
}
export function craftAllowance(baseLimit:number,baseRecovery:number,workshopBonus:number,guildLimit:number,guildRecovery:number,figurines:boolean,shipwrecks:boolean,hired:boolean,otherLimit=0){
  return {limit:Math.trunc((baseLimit+workshopBonus+guildLimit+(figurines?50:0)+otherLimit)*(hired?1.5:1)),recovery:baseRecovery*(hired?1.5:1)+guildRecovery+(shipwrecks?5:0)};
}
export function sampleWeights(weights:number[],random:()=>number=Math.random){
  if(!weights.length||weights.some(w=>!Number.isFinite(w)||w<0)||weights.reduce((a,b)=>a+b,0)<=0)throw new Error('Enter nonnegative weights with a positive total.');
  const total=weights.reduce((a,b)=>a+b,0);let value=random()*total;
  for(let i=0;i<weights.length;i++){value-=weights[i];if(value<0)return i;}
  return weights.length-1;
}
