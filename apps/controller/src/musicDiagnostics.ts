import {redis} from '@bom/redis';
export async function musicTrace(roomId:string,stage:string,detail:any={}){
 const key=`music:room:${roomId}:timeline`;
 await redis.multi().lpush(key,JSON.stringify({stage,at:new Date().toISOString(),...detail})).ltrim(key,0,79).expire(key,604800).exec().catch(()=>{});
}
