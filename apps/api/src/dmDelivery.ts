import {recordDmDelivery,discordDmsMuted} from '@bom/db';
import {withDmMute} from '@bom/shared';
export async function sendApiDm(discord:(path:string,init?:RequestInit)=>Promise<any>,userId:string,payload:any) {
  const muted=async()=>{if(await discordDmsMuted(userId)){await recordDmDelivery(userId,'api','MUTED');throw new Error('suppressed_by_dm_mute');}};
  await muted();
  try{
   const channel=await discord('/users/@me/channels',{method:'POST',body:JSON.stringify({recipient_id:userId})});
   if(!channel?.id)throw new Error('dm_channel_unavailable');
   await muted();
   const message=await discord(`/channels/${channel.id}/messages`,{method:'POST',body:JSON.stringify(withDmMute(payload,userId))});
   await recordDmDelivery(userId,'api','SENT',String(message.id));return {channel,message};
  }catch(e:any){if(e.message!=='suppressed_by_dm_mute')await recordDmDelivery(userId,'api',Number(e.code)===50007?'BLOCKED':'FAILED',undefined,String(e.code??'delivery_error'));throw e;}

}
