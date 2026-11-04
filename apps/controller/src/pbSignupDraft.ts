/** Keep attendance and timing intact while a captain edits playable ships. */
export function selectDraftShips(draft:any,ships:string[]){
 return {...draft,ships:[...new Set(ships)],preferred:[],status:draft.status??'ATTENDING',lateMinutes:draft.lateMinutes??0};
}
export function detailedSignupBody(draft:any,flareCapabilities:string[],displayName:string){
 if(!Array.isArray(draft?.ships)||!draft.ships.length)throw new Error('Your signup session expired. Press Detailed Signup again.');
 const ships=[...new Set<string>(draft.ships)];
 return {displayName,status:draft.status??'ATTENDING',ships,preferredShips:(draft.preferred??[]).filter((s:string)=>ships.includes(s)),hornCapable:Boolean(draft.hornCapable),hornPreferred:Boolean(draft.hornPreferred&&draft.hornCapable),flareCapabilities:flareCapabilities.filter(x=>['Red Flare','Gold Flare'].includes(x)),lateMinutes:draft.status==='LATE'?draft.lateMinutes??5:0};
}
