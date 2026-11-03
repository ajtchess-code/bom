import {samePBPanel} from './pbPresentation.js';
/** Keep a two-message V2 surface in order, editing content without reposting it. */
export async function syncStickyDesk(channel:any,ids:{desk:string|null;music:string|null},payload:{desk:any;music:any},persist:(kind:'desk'|'music',id:string)=>Promise<void>){
 const fetchMessage=async(id:string|null)=>{if(!id)return null;try{return await channel.messages.fetch({message:String(id),force:true});}catch(e:any){if(Number(e.code)===10008)return null;throw e;}};
 const [desk,music]=await Promise.all([fetchMessage(ids.desk),fetchMessage(ids.music)]);
 let move=!desk||!music||!desk.flags?.has?.(32768)||!music.flags?.has?.(32768);
 if(desk&&music){if(BigInt(music.id)>BigInt(desk.id))move=true;const newer=await channel.messages.fetch({after:String(desk.id),limit:100});if(newer.some((m:any)=>!m.system&&m.id!==desk.id&&m.id!==music.id))move=true;}
 if(!move){for(const [message,body] of [[music,payload.music],[desk,payload.desk]]){if(!samePBPanel(message,body))await message.edit({...body,content:null,embeds:[]});if(message.pinned)await message.unpin('Control Desk uses event-driven positioning').catch(()=>{});}return desk;}
 const newMusic=await channel.send(payload.music);await persist('music',newMusic.id);
 const newDesk=await channel.send(payload.desk);await persist('desk',newDesk.id);
 for(const old of [music,desk])if(old){if(old.pinned)await old.unpin('Repositioning Misfit panels').catch(()=>{});await old.delete();}return newDesk;
}
