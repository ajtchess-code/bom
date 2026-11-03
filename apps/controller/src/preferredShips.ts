import {randomUUID} from 'node:crypto';
import {redis} from '@bom/redis';
import {sendBotDm} from './dmDelivery.js';
const row=(components:any[])=>({type:1,components});
const button=(label:string,id:string)=>({type:2,style:2,label,custom_id:id});
export async function remindPreferredShips(user:any,base:string){
 const key=`pb:ship-guidance:${user.id}`;
 if(!await redis.set(key,'1','EX',21600,'NX'))return;
 try{await sendBotDm(user,{content:'Before signing up for port battles, please save the ships you can sail and your preferred ships for each battle rate. Open the dashboard → Members → My Profile & Ships, select the rate, choose playable ships and favourites, then save. You can also use the Discord setup below.',components:[row([button('Set Preferred Ships','pbprefs:open'),...(base?[{type:2,style:5,label:'My Profile & Ships',url:base+'/dashboard/members?view=profile'}]:[])])]});}catch{await redis.del(key);}
}
export async function handlePreferredShips(i:any,api:(path:string,uid:string,init?:RequestInit)=>Promise<any>){
 if(!String(i.customId??'').startsWith('pbprefs:'))return false;
 const [,action,arg,token]=i.customId.split(':'),key=`pb:profile-draft:${i.user.id}`;
 await i.deferReply(i.guildId?{flags:64}:{});
 if(action==='open'){await i.editReply({content:'Choose a battle rate. Changes update your saved profile for future signups.',components:[row([{type:3,custom_id:'pbprefs:rate',placeholder:'Battle rate',options:Array.from({length:7},(_,n)=>({label:`Rate ${n+1}`,value:String(n+1)}))}])]});return true;}
 let d:any;
 if(action==='rate'){
 const rate=i.values[0],[prefs,cat,config]=await Promise.all([api('/pb-preferences',i.user.id),api('/catalogue',i.user.id),api('/pb-config',i.user.id)]);
 const names=[...new Set<string>((cat.ships??[]).filter((s:any)=>String(s.rate??s.level)===rate&&(!Array.isArray(config.preferredShipCatalog?.[rate])||config.preferredShipCatalog[rate].includes(s.name))).map((s:any)=>String(s.name)))].sort();
 d={token:randomUUID(),rate,names,ships:(prefs.rates?.[rate]?.ships??[]).filter((s:string)=>names.includes(s)),preferred:(prefs.rates?.[rate]?.preferred??[]).filter((s:string)=>names.includes(s)),page:0};
 }else{const raw=await redis.get(key);if(!raw){await i.editReply({content:'This setup expired. Open Set Preferred Ships again.',components:[row([button('Start Again','pbprefs:open')])]});return true;}d=JSON.parse(raw);if((action==='page'?token:arg)!==d.token){await i.editReply({content:'This menu was replaced by a newer setup. Open Set Preferred Ships again.',components:[row([button('Start Again','pbprefs:open')])]});return true;}}
 const pageNames=d.names.slice(d.page*25,d.page*25+25);
 if(action==='ships'){d.ships=[...d.ships.filter((s:string)=>!pageNames.includes(s)),...i.values];d.preferred=d.preferred.filter((s:string)=>d.ships.includes(s));}
 if(action==='preferred')d.preferred=[...d.preferred.filter((s:string)=>!pageNames.includes(s)),...i.values];
 if(action==='page')d.page=Math.max(0,Math.min(Math.ceil(d.names.length/25)-1,Number(arg)||0));
 if(action==='save'){
 if(!d.ships.length||!d.preferred.length){await i.editReply({content:'Select playable ships and at least one preferred ship before saving.',components:[row([button('Continue Setup',`pbprefs:resume:${d.token}`)])]});return true;}
 await api(`/pb-preferences/rates/${d.rate}`,i.user.id,{method:'PUT',body:JSON.stringify({ships:d.ships,preferred:d.preferred})});await redis.del(key);await i.editReply({content:`Rate ${d.rate} saved. Playable: ${d.ships.join(', ')}. Preferred: ${d.preferred.join(', ')}. Other rates and Horn settings were preserved. Return to the battle to sign up.`,components:[row([button('Choose Another Rate','pbprefs:open')])]});return true;
 }
 d.token=randomUUID();
 await redis.set(key,JSON.stringify(d),'EX',900);
 const names=d.names.slice(d.page*25,d.page*25+25),playable=names.filter((s:string)=>d.ships.includes(s)),components:any[]=[];
 if(names.length)components.push(row([{type:3,custom_id:`pbprefs:ships:${d.token}`,placeholder:'Ships you can sail on this page',min_values:0,max_values:names.length,options:names.map((s:string)=>({label:s.slice(0,100),value:s,default:d.ships.includes(s)}))}]));
 if(playable.length)components.push(row([{type:3,custom_id:`pbprefs:preferred:${d.token}`,placeholder:'Preferred ships on this page',min_values:0,max_values:playable.length,options:playable.map((s:string)=>({label:s.slice(0,100),value:s,default:d.preferred.includes(s)}))}]));
 components.push(row([...(d.page>0?[button('Previous',`pbprefs:page:${d.page-1}:${d.token}`)]:[]),...(d.page+1<Math.ceil(d.names.length/25)?[button('Next',`pbprefs:page:${d.page+1}:${d.token}`)]:[]),button('Save Profile',`pbprefs:save:${d.token}`),button('Choose Rate','pbprefs:open')]));
 await i.editReply({content:`**Rate ${d.rate} — page ${d.page+1}/${Math.max(1,Math.ceil(d.names.length/25))}**\nChoose playable ships first, then favourites. Selections on other pages are retained. Changes are saved only with Save Profile.`,components});return true;
}
