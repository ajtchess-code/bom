import {redis} from '@bom/redis';
import {sendApiDm} from './dmDelivery.js';
export async function preferredShipGuidance(userId:string,rate?:number){
 const key=`pb:ship-guidance:${userId}:${rate??'all'}`;if(!await redis.set(key,'1','EX',21600,'NX'))return;
 try{
 const base=(process.env.PUBLIC_DASHBOARD_URL??'').replace(/\/$/,'');
 const discord=async(path:string,init:RequestInit={})=>{const r=await fetch('https://discord.com/api/v10'+path,{...init,headers:{authorization:`Bot ${process.env.DISCORD_BOT_TOKEN}`,'content-type':'application/json'},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error(`Discord ${r.status}`);return r.json();};
 await sendApiDm(discord,userId,{embeds:[{title:rate?`Preferred Ships · Rate ${rate}`:'Preferred Ships Manager',description:rate?`Set playable ships and favourites for Rate ${rate}. Other rates remain unchanged.`:'Choose a rate to edit your saved ships in Discord.',color:0xD6A83A}],components:[{type:1,components:[{type:2,style:2,label:rate?`Manage Rate ${rate}`:'Manage Preferred Ships',custom_id:rate?`pbprefs:forrate:${rate}`:'pbprefs:open'}]}]});
 }catch{await redis.del(key);}
}
