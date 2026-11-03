import {replyEditPayload} from './interactionReply.js';
import { randomUUID } from "node:crypto";
import { redis, keys } from "@bom/redis";

const TTL_MS=Math.max(15_000,Number(process.env.EPHEMERAL_IDLE_SECONDS??90)*1000);
export type EphemeralRecord={applicationId:string;token:string;messageId?:string;due:number;created:number;kind?:"private"|"lyrics"|"notice";roomId?:string;locale?:string;userId?:string};

export async function trackEphemeral(applicationId:string,token:string,messageId?:string,recordId?:string,extra:Partial<Pick<EphemeralRecord,"kind"|"roomId"|"locale"|"userId">>={}){
  const id=recordId??randomUUID(); const due=Date.now()+TTL_MS;
  const data:EphemeralRecord={applicationId,token,messageId,due,created:Date.now(),...extra};
  await redis.multi().set(keys.ephemeralData(id),JSON.stringify(data),"PX",16*60_000).zadd(keys.ephemeralDue,due,id).exec();
  if(messageId)await redis.set(keys.ephemeralMessage(messageId),id,"PX",16*60_000);
  return id;
}
export async function renewEphemeral(id:string,freshToken?:string){
  const raw=await redis.get(keys.ephemeralData(id)); if(!raw)return;
  // A component interaction on this exact message gives us a fresh webhook
  // token for the same ephemeral response. Store it so an actively used panel
  // remains deletable even after the token that created it would have expired.
  // Callers must only pass freshToken after verifying the source message ID.
  const data:EphemeralRecord=JSON.parse(raw); if(freshToken)data.token=freshToken; data.due=Date.now()+TTL_MS;
  await redis.multi().set(keys.ephemeralData(id),JSON.stringify(data),"PX",16*60_000).zadd(keys.ephemeralDue,data.due,id).exec();
  if(data.messageId)await redis.set(keys.ephemeralMessage(data.messageId),id,"PX",16*60_000);
}
export async function expireEphemeralNow(id:string){ await redis.zadd(keys.ephemeralDue,Date.now(),id); }

export function startEphemeralJanitor(){
  const run=async()=>{
    const due=await redis.zrangebyscore(keys.ephemeralDue,0,Date.now(),"LIMIT",0,50);
    for(const id of due){
      const claimed=await redis.zrem(keys.ephemeralDue,id); if(!claimed)continue;
      const raw=await redis.get(keys.ephemeralData(id)); if(!raw)continue;
      const d:EphemeralRecord=JSON.parse(raw);
      try{
        const base=`https://discord.com/api/v10/webhooks/${d.applicationId}/${d.token}/messages`;
        let res=d.messageId?await fetch(`${base}/${d.messageId}`,{method:"DELETE"}):await fetch(`${base}/@original`,{method:"DELETE"});
        if(!res.ok && d.messageId) res=await fetch(`${base}/@original`,{method:"DELETE"});
      }catch{}
      if(d.kind==="lyrics"&&d.roomId)await redis.srem(keys.lyricPanels(d.roomId),id).catch(()=>{});
      if(d.kind==="private"&&d.roomId&&d.userId){const k=keys.ephemeralUserRoom(d.userId,d.roomId);if(await redis.get(k)===id)await redis.del(k);}
      if(d.kind==="lyrics"&&d.roomId&&d.userId){const k=keys.ephemeralLyricsUserRoom(d.userId,d.roomId);if(await redis.get(k)===id)await redis.del(k);}
      if(d.messageId){const mk=keys.ephemeralMessage(d.messageId);if(await redis.get(mk)===id)await redis.del(mk);}
      await redis.del(keys.ephemeralData(id));
    }
  };
  const timer=setInterval(()=>void run(),2_000); timer.unref(); void run();
}

export async function editEphemeral(id:string,payload:any){
  const raw=await redis.get(keys.ephemeralData(id));if(!raw)return false;
  const d:EphemeralRecord=JSON.parse(raw);
  try{
    const base=`https://discord.com/api/v10/webhooks/${d.applicationId}/${d.token}/messages`;
    const url=d.messageId?`${base}/${d.messageId}`:`${base}/@original`;
    const body=replyEditPayload({components:payload.components});
    const res=await fetch(url,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    if(!res.ok&&res.status===404){if(d.roomId)await redis.srem(keys.lyricPanels(d.roomId),id).catch(()=>{});await redis.del(keys.ephemeralData(id));}
    return res.ok;
  }catch{return false;}
}

export async function getEphemeral(id:string):Promise<EphemeralRecord|null>{
  const raw=await redis.get(keys.ephemeralData(id));return raw?JSON.parse(raw):null;
}

export async function renewEphemeralByMessage(messageId:string,freshToken:string){
  const id=await redis.get(keys.ephemeralMessage(messageId));if(!id)return null;
  await renewEphemeral(id,freshToken);return id;
}
