/** Pure transformations of recorded client fields; no live-state assumptions. */
export type WikiPoint={x:number;y:number};
export function wikiPosition(value:unknown):WikiPoint|null {
  const parts=String(value??'').trim().split(/\s+/).map(Number);
  return parts.length>=2&&parts.every(Number.isFinite)?{x:parts[0],y:parts[1]}:null;
}
export function routeLength(points:WikiPoint[]){return points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,p.y-points[i].y),0);}
export function angle360(n:number){return ((n%360)+360)%360;}
export function windSector(profile:any,heading:number,windToward:number){
  const angle=angle360(heading-windToward),contains=(s:any)=>s&&angle>=Number(s.Start)&&angle<=Number(s.End);
  return {angle,green:contains(profile.GreenRight)?'right':contains(profile.GreenLeft)?'left':null,downwind:Math.min(angle,360-angle)<=Number(profile.FordewindFineEdge)};
}
export function effectiveArmor(base:number,percent:number,flat:number){
  if(![base,percent,flat].every(Number.isFinite)||base<0||percent< -100||flat<0)throw new Error('Enter valid armor values; percent must be at least -100 and flat armor nonnegative.');
  return base*(1+percent/100)+flat;
}
export function nodeUpgradePlan(levels:any[],from:number,to:number,schedule:any[]){
  const available=[...new Set(levels.map(r=>Number(r.Level)))].sort((a,b)=>a-b);
  if(available.join(',')!=='1,2,3,4')throw new Error('This special node does not have a verified four-level upgrade path.');
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to>4||to<=from)throw new Error('Target level must be higher than the current level.');
  let gold=0;const materials:Record<string,number>={},steps:any[]=[];
  for(let current=from;current<to;current++){
    const cost=schedule.find(r=>r.index===current);if(!cost)throw new Error('A cost step is not verified.');
    gold+=cost.gold;for(const [id,amount] of Object.entries(cost.materials??{}))materials[id]=(materials[id]??0)+Number(amount);
    steps.push({from:current,to:current+1,...cost});
  }
  return {gold,materials,steps,current:levels.find(r=>r.Level===from)??null,target:levels.find(r=>r.Level===to)};
}
export function nodeCapacity(value:unknown){const n=Number(value);return value==null||!Number.isFinite(n)?'Not supplied':n>=3e38?'Float-max sentinel — finite gameplay limit unverified':n.toLocaleString();}
