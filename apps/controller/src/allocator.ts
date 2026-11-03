import { redis, keys } from "@bom/redis";

function diag(message:string,details:Record<string,unknown>){console.log(`[worker-lease] ${message} ${JSON.stringify(details)}`);}

type Candidate={workerId:string;score:number;heartbeat:any;lease:string|null;quarantine:string|null};
function scoreHeartbeat(h:any){
  if(!h)return -10_000;
  let score=100;
  score-=Math.min(35,Math.max(0,Number(h.lavalinkPingMs??h.ping??0))/20);
  score-=Math.min(25,Math.max(0,Number(h.eventLoopLagMs??0))/4);
  score-=Math.min(25,Math.max(0,Number(h.recentFailures??0))*6);
  score-=Math.min(15,Math.max(0,Number(h.reconnects??0))*2);
  if(h.nodeReady===false)score-=80;
  return Math.round(score);
}

export async function allocateWorker(roomId:string, preferred?:string|null, traceId?:string):Promise<string>{
  const existing=await redis.get(keys.roomWorker(roomId));
  if(existing){diag("reusing existing worker",{traceId,roomId,workerId:existing});return existing;}
  const count=Math.min(8,Math.max(1,Number(process.env.WORKER_COUNT??8)));
  const reserved=await redis.get(`music:radio:reserved:${process.env.DISCORD_GUILD_ID??''}`).catch(()=>null);
  const ids=Array.from({length:count},(_,i)=>String(i+1)).filter(id=>!reserved|| (preferred==='8'?id==='8':id!=='8'));
  if(reserved&&preferred==='8'&&count<8)throw new Error('BOM Radio requires Music account 8 to be running.');
  const rows:Candidate[]=await Promise.all(ids.map(async workerId=>{
    const [hbRaw,lease,quarantine]=await Promise.all([
      redis.get(keys.workerHeartbeat(workerId)),redis.get(keys.workerLease(workerId)),redis.get(`music:worker:${workerId}:quarantine`)
    ]);
    let heartbeat:any=null;try{heartbeat=hbRaw?JSON.parse(hbRaw):null;}catch{}
    return {workerId,score:scoreHeartbeat(heartbeat)+(preferred===workerId?15:0),heartbeat,lease,quarantine};
  }));
  const candidates=rows.filter(x=>x.heartbeat&&!x.lease&&!x.quarantine).sort((a,b)=>b.score-a.score||Number(a.workerId)-Number(b.workerId));
  for(const c of candidates){
    const ok=await redis.set(keys.workerLease(c.workerId),roomId,"EX",45,"NX");
    if(!ok)continue;
    await redis.set(keys.roomWorker(roomId),c.workerId,"EX",45);
    diag("assigned worker",{traceId,roomId,workerId:c.workerId,healthScore:c.score,preferred:preferred??null});
    return c.workerId;
  }
  console.warn(`[worker-lease] no worker available ${JSON.stringify({traceId,roomId,preferred:preferred??null,candidates:rows.map(x=>({workerId:x.workerId,score:x.score,lease:x.lease,quarantined:Boolean(x.quarantine),online:Boolean(x.heartbeat)}))})}`);
  throw new Error("All music workers are currently busy");
}

export async function quarantineWorker(workerId:string,reason:string,seconds=60){
  await redis.set(`music:worker:${workerId}:quarantine`,reason.slice(0,240),"EX",Math.max(15,seconds));
  diag("worker quarantined",{workerId,reason,seconds});
}
export async function clearWorkerQuarantine(workerId:string){await redis.del(`music:worker:${workerId}:quarantine`);}

export async function renewRoomLease(roomId:string,workerId:string){
  const lease=await redis.get(keys.workerLease(workerId));
  if(lease===roomId){ await redis.expire(keys.workerLease(workerId),45); await redis.set(keys.roomWorker(roomId),workerId,"EX",45); }
}
export async function releaseWorker(roomId:string,workerId?:string){
  const mapped=await redis.get(keys.roomWorker(roomId));
  const id=workerId??mapped;
  let changed=false;
  if(id){
    const lease=await redis.get(keys.workerLease(id));
    if(lease===roomId){await redis.del(keys.workerLease(id));changed=true;}
  }
  if(mapped&&(!id||mapped===id)){await redis.del(keys.roomWorker(roomId));changed=true;}
  if(id&&changed)diag("released worker",{roomId,workerId:id});
}
