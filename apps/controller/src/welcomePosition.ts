/** Fetch channel order from Discord, not the potentially stale message cache. */
export async function welcomePanelPosition(channel:any,messageId:string|null){
 let existing:any=null;
 if(messageId){
  try{existing=await channel.messages.fetch({message:String(messageId),force:true});}
  catch(error:any){if(Number(error?.code)!==10008)throw error;}
 }
 if(!existing)return {existing:null,hasNewer:false};
 const recent=await channel.messages.fetch({limit:25,cache:false});
 const hasNewer=recent.some((message:any)=>!message.system&&BigInt(message.id)>BigInt(existing.id));
 return {existing,hasNewer};
}
