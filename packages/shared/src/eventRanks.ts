export const HALLOWEEN_RANK_STYLES=[
 {rank:1,name:'Infernal Gold',primary:'#F5BC54',secondary:'#B347EF'},
 {rank:2,name:'Moonlit Platinum',primary:'#DAE1F0',secondary:'#9163DD'},
 {rank:3,name:'Cursed Bronze',primary:'#C8814B',secondary:'#5B2C81'},
 {rank:4,name:'Amethyst',primary:'#B98BFA',secondary:'#6B3FA0'},
 {rank:5,name:'Blood Moon',primary:'#F36E79',secondary:'#792E63'},
 {rank:6,name:'Pumpkin Ember',primary:'#F2A14B',secondary:'#8B4660'},
 {rank:7,name:'Spectral Emerald',primary:'#69CB9B',secondary:'#315674'},
 {rank:8,name:'Ghostwater Sapphire',primary:'#79BFFA',secondary:'#6544AA'},
 {rank:9,name:'Phantom Steel',primary:'#C3CDD8',secondary:'#5C6A82'}
];
export function eventRankPlan(board:string,rows:{user_id:string;completed_count?:number;total?:number|string}[]){return rows.filter(r=>board==='PROGRESS'?Number(r.completed_count)>0:Number(r.total)>0).slice(0,9).map((r,n)=>({userId:r.user_id,rank:n+1}));}
