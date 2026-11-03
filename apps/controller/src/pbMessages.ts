import {createHash} from 'node:crypto';
import {samePBPanel} from './pbPresentation.js';
/** Stable Discord component IDs let us recover a send whose DB write was interrupted. */
export function pbMessageMarker(key:string){return createHash('sha256').update(key).digest().readUInt32BE(0)%2147483647||1;}
export async function fetchPBMessage(channel:any,id:string|null){
 if(!id)return null;
 try{return await channel.messages.fetch({message:String(id),force:true});}
 catch(error:any){if(Number(error?.code)===10008)return null;throw error;}
}
export async function upsertPBMessage(channel:any,id:string|null,payload:any,key?:string,botId?:string){
 const marker=key?pbMessageMarker(key):null;
 if(marker)payload={...payload,components:payload.components.map((c:any,n:number)=>n?c:{...c,id:marker})};
 let existing=await fetchPBMessage(channel,id);
 if(!existing&&marker){
  let before: string|undefined;
  for(let page=0;page<5;page++){
   const messages=await channel.messages.fetch({limit:100,...(before?{before}:{})});
   existing=messages.find((m:any)=>(!botId||String(m.author?.id)===botId)&&(m.components??[]).some((c:any)=>Number((c.toJSON?.()??c).id)===marker));
   if(existing||messages.size<100)break;before=messages.last()?.id;
  }
 }
 if(existing){try{if(!samePBPanel(existing,payload)||(marker&&Number((existing.components?.[0]?.toJSON?.()??existing.components?.[0])?.id)!==marker))await existing.edit(payload.flags===32768?{...payload,content:null,embeds:[]}:payload);return existing;}catch(error:any){if(Number(error?.code)!==10008)throw error;}}
 return channel.send(payload);
}

/** Remove only this bot's obsolete aggregate panels, never member messages or battle rosters. */
export async function removeLegacyFleetPanels(channel:any,botId:string){
 let before:string|undefined;
 for(let page=0;page<5;page++){
  const messages=await channel.messages.fetch({limit:100,...(before?{before}:{})});
  for(const m of messages.values()){
   if(String(m.author?.id)!==botId)continue;
   const walk=(nodes:any[]):string[]=>nodes.flatMap(c=>[String(c.content??''),...walk(c.components??[])]);
   const titles=[m.content,...(m.embeds??[]).map((e:any)=>e.title),...walk((m.components??[]).map((c:any)=>c.toJSON?.()??c))];
   if(titles.some(t=>/^\s*(?:#{1,3}\s*)?(?:\*\*)?Confirmed Fleets(?:\*\*)?\s*(?:\n|$)/i.test(String(t??''))))await m.delete();
  }
  if(messages.size<100)break;before=messages.last()?.id;
 }
}
