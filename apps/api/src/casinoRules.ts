import {z} from 'zod';
export const coinAmount=z.string().regex(/^[1-9][0-9]{0,69}$/,'Enter a positive whole number of coins.');
export const exchangeRate=z.string().regex(/^(?:0|[1-9][0-9]{0,61})(?:\.[0-9]{1,8})?$/,'Use a positive rate with up to eight decimal places.').refine(v=>BigInt(v.replace('.',''))>0n,'Rate must be positive.');
export function exchangeCoins(quantity:string,rate:string):bigint{const [whole,fraction='']=rate.split('.');return BigInt(quantity)*(BigInt(whole)*100000000n+BigInt(fraction.padEnd(8,'0')))/100000000n;}
export const wagerLeg=z.object({battleId:z.string().uuid(),kind:z.enum(['OUTCOME','KILLS','DEATHS','DAMAGE_DEALT','DAMAGE_TAKEN','RANK','TOP','BOTTOM']),outcome:z.enum(['ATTACKER','DEFENDER','DRAW']).optional(),player:z.string().trim().min(1).max(100).optional(),comparison:z.enum(['EXACT','AT_LEAST','AT_MOST']).default('AT_LEAST'),value:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional()}).superRefine((leg,ctx)=>{if(leg.kind==='OUTCOME'){if(!leg.outcome)ctx.addIssue({code:'custom',message:'Select the battle outcome.'});}else if(!leg.player||leg.value===undefined||( ['RANK','TOP','BOTTOM'].includes(leg.kind)&&leg.value<1))ctx.addIssue({code:'custom',message:'Select a player and a valid statistic or ranking.'});});
export type WagerLeg=z.infer<typeof wagerLeg>;
export function legResult(leg:WagerLeg,battle:any):boolean|null{
 if(battle.status==='VOID')return null;
 if(battle.status!=='FINAL')throw Error('Battle result is not final.');
 if(leg.kind==='OUTCOME')return battle.outcome===leg.outcome;
 const results=typeof battle.results==='string'?JSON.parse(battle.results):battle.results;
 const row=results?.players?.find((p:any)=>String(p.player).trim().toLowerCase()===leg.player!.trim().toLowerCase());
 if(!row)return null; // Missing player evidence voids a bet rather than guessing.
 const field={KILLS:'kills',DEATHS:'deaths',DAMAGE_DEALT:'damageDealt',DAMAGE_TAKEN:'damageTaken',RANK:'rank',TOP:'rank',BOTTOM:'rank'}[leg.kind];
 const actual=row[field];if(!Number.isSafeInteger(actual)||actual<0)return null;
 if(leg.kind==='RANK')return actual===leg.value;
 if(leg.kind==='TOP')return actual>=1&&actual<=leg.value!;
 if(leg.kind==='BOTTOM'){if(!Number.isSafeInteger(results.totalPlayers)||actual<1||actual>results.totalPlayers||leg.value!>results.totalPlayers)return null;return actual>results.totalPlayers-leg.value!;}
 return leg.comparison==='EXACT'?actual===leg.value:leg.comparison==='AT_MOST'?actual<=leg.value!:actual>=leg.value!;
}
export const battleDay=(value:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
export function settleLegs(legs:WagerLeg[],battles:any[]):'CREATOR'|'TAKER'|'VOID'|null{
 if(battles.some(b=>!['FINAL','VOID'].includes(b.status)))return null;
 const results=legs.map(leg=>legResult(leg,battles.find(b=>b.id===leg.battleId)));
 return results.includes(null)?'VOID':results.every(Boolean)?'CREATOR':'TAKER';
}
