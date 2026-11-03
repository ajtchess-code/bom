/** Advisory only: look at the same three most recent completed battles for everyone. */
export function pbFairness(battles:any[],signups:any[],userIds:string[]){
 const ids=new Set(battles.map(b=>String(b.id)));
 return new Map(userIds.map(id=>{const rows=signups.filter(s=>String(s.user_id)===id&&ids.has(String(s.battle_id)));const missed=rows.filter(s=>!s.confirmed_ship).length,confirmed=rows.filter(s=>s.confirmed_ship).length;return [id,{window:battles.length,signedUp:rows.length,missed,confirmed,warning:battles.length===3&&confirmed===0&&missed>0,repeatedlyLeftOut:missed>=2&&confirmed===0}];}));
}
