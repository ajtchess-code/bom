import {redis} from '@bom/redis';
import {sendApiDm} from './dmDelivery.js';
export async function preferredShipGuidance(userId:string){
 const key=`pb:ship-guidance:${userId}`;if(!await redis.set(key,'1','EX',21600,'NX'))return;
 try{
 const base=(process.env.PUBLIC_DASHBOARD_URL??'').replace(/\/$/,'');
 const discord=async(path:string,init:RequestInit={})=>{const r=await fetch('https://discord.com/api/v10'+path,{...init,headers:{authorization:`Bot ${process.env.DISCORD_BOT_TOKEN}`,'content-type':'application/json'},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error(`Discord ${r.status}`);return r.json();};
 await sendApiDm(discord,userId,{content:'Please save your playable and preferred ships for this battle rate. In the dashboard, open Members → My Profile & Ships, choose the battle rate, select ships you can sail and your favourites, then save. You can also set them here in Discord.',components:[{type:1,components:[{type:2,style:2,label:'Set Preferred Ships',custom_id:'pbprefs:open'},...(base?[{type:2,style:5,label:'My Profile & Ships',url:base+'/dashboard/members?view=profile'}]:[])]}]});
 }catch{await redis.del(key);}
}
