import {makeDiscordScheduler} from './discordRest.js';
import { Redis } from "ioredis";
import { EventEmitter } from "node:events";
import { db, pool } from "@bom/db";
import type { QueueItem, RoomRuntimeState, WorkerCommand, WorkerEvent } from "@bom/shared";

const redisUrl=process.env.REDIS_URL?.trim();
export const stateBackend=redisUrl?"redis":"postgres-fallback";
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

class PostgresMulti{
  private ops:Array<()=>Promise<any>>=[];
  constructor(private client:PostgresRedisCompat){}
  set(key:string,value:string,...opts:any[]){this.ops.push(()=>this.client.set(key,value,...opts));return this;}
  incr(key:string){this.ops.push(()=>this.client.incr(key));return this;}
  expire(key:string,seconds:number){this.ops.push(()=>this.client.expire(key,seconds));return this;}
  zadd(key:string,score:number,member:string){this.ops.push(()=>this.client.zadd(key,score,member));return this;}
  async exec(){const out=[];for(const op of this.ops){try{out.push([null,await op()]);}catch(e){out.push([e,null]);}}return out;}
}

class PostgresRedisCompat extends EventEmitter{
  private channels=new Set<string>();
  private pubCursor=new Map<string,number>();
  private pollTimer?:NodeJS.Timeout;
  private polling=false;
  multi(){return new PostgresMulti(this);}
  async get(key:string){
    await db.query(`DELETE FROM live_kv WHERE key_name=$1 AND expires_at IS NOT NULL AND expires_at<=CURRENT_TIMESTAMP`,[key]);
    const rows=await db.query<any>(`SELECT value_text FROM live_kv WHERE key_name=$1 AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP) LIMIT 1`,[key]);
    return rows.rows[0]?.value_text??null;
  }
  async set(key:string,value:string,...opts:any[]){
    let ttlMs:null|number=null,nx=false;
    for(let i=0;i<opts.length;i++){
      const o=String(opts[i]).toUpperCase();
      if(o==="EX")ttlMs=Number(opts[++i])*1000;
      else if(o==="PX")ttlMs=Number(opts[++i]);
      else if(o==="NX")nx=true;
    }
    const expires=ttlMs===null?null:new Date(Date.now()+ttlMs);
    if(nx){
      await db.query(`DELETE FROM live_kv WHERE key_name=$1 AND expires_at IS NOT NULL AND expires_at<=CURRENT_TIMESTAMP`,[key]);
      const r=await db.query(`INSERT INTO live_kv(key_name,value_text,expires_at) VALUES($1,$2,$3) ON CONFLICT (key_name) DO NOTHING`,[key,String(value),expires]);
      return r.rowCount?"OK":null;
    }
    await db.query(`INSERT INTO live_kv(key_name,value_text,expires_at) VALUES($1,$2,$3) ON CONFLICT (key_name) DO UPDATE SET value_text=EXCLUDED.value_text,expires_at=EXCLUDED.expires_at,updated_at=CURRENT_TIMESTAMP`,[key,String(value),expires]);
    return "OK";
  }
  async incr(key:string){
    const r=await db.query<any>(`INSERT INTO live_kv(key_name,value_text) VALUES($1,'1') ON CONFLICT(key_name) DO UPDATE SET value_text=((CASE WHEN live_kv.expires_at<=NOW() THEN 0 ELSE live_kv.value_text::bigint END)+1)::text,expires_at=CASE WHEN live_kv.expires_at<=NOW() THEN NULL ELSE live_kv.expires_at END RETURNING value_text`,[key]);return Number(r.rows[0].value_text);
  }
  async exists(key:string){return await this.get(key)===null?0:1;}
  async ttl(key:string){const r=await db.query<any>(`SELECT CASE WHEN expires_at IS NULL THEN -1 ELSE GREATEST(-2,CEIL(EXTRACT(EPOCH FROM expires_at-NOW()))) END AS ttl FROM live_kv WHERE key_name=$1 AND (expires_at IS NULL OR expires_at>NOW())`,[key]);return Number(r.rows[0]?.ttl??-2);}
  async expire(key:string,seconds:number){
    const expires=new Date(Date.now()+seconds*1000);
    const a=await db.query(`UPDATE live_kv SET expires_at=$1 WHERE key_name=$2`,[expires,key]);
    const b=await db.query(`UPDATE live_sets SET expires_at=$1 WHERE key_name=$2`,[expires,key]);
    return (a.rowCount||b.rowCount)?1:0;
  }
  async del(...keys:string[]){
    if(!keys.length)return 0;let n=0;
    for(const key of keys){for(const table of ["live_kv","live_lists","live_sets","live_sorted_sets"]){const r=await db.query(`DELETE FROM ${table} WHERE key_name=$1`,[key]);n+=r.rowCount;}}
    return n;
  }
  async rpush(key:string,...values:string[]){
    for(const v of values)await db.query(`INSERT INTO live_lists(key_name,value_text) VALUES($1,$2)`,[key,v]);
    const rows=await db.query<any>(`SELECT COUNT(*) n FROM live_lists WHERE key_name=$1`,[key]);return Number(rows.rows[0]?.n??0);
  }
  async lpop(key:string){
    const c=await pool.connect();
    try{
      await c.query("BEGIN");
      const found=await c.query(`SELECT id,value_text FROM live_lists WHERE key_name=$1 ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`,[key]);
      if(!found.rows.length){await c.query("COMMIT");return null;}
      await c.query(`DELETE FROM live_lists WHERE id=$1`,[found.rows[0].id]);
      await c.query("COMMIT");return found.rows[0].value_text;
    }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e;}finally{c.release();}
  }
  async lrange(key:string,start:number,end:number){
    const countRows=await db.query<any>(`SELECT COUNT(*) n FROM live_lists WHERE key_name=$1`,[key]);const n=Number(countRows.rows[0]?.n??0);
    const s=start<0?Math.max(0,n+start):start;const e=end<0?n+end:end;const limit=Math.max(0,e-s+1);if(!limit)return[];
    const rows=await db.query<any>(`SELECT value_text FROM live_lists WHERE key_name=$1 ORDER BY id LIMIT $2 OFFSET $3`,[key,limit,s]);return rows.rows.map((r:any)=>r.value_text);
  }
  async sadd(key:string,...members:string[]){
    await db.query(`DELETE FROM live_sets WHERE key_name=$1 AND expires_at IS NOT NULL AND expires_at<=CURRENT_TIMESTAMP`,[key]);let n=0;
    for(const m of members){const r=await db.query(`INSERT INTO live_sets(key_name,member) VALUES($1,$2) ON CONFLICT (key_name,member) DO NOTHING`,[key,m]);n+=r.rowCount;}return n;
  }
  async scard(key:string){
    await db.query(`DELETE FROM live_sets WHERE key_name=$1 AND expires_at IS NOT NULL AND expires_at<=CURRENT_TIMESTAMP`,[key]);
    const rows=await db.query<any>(`SELECT COUNT(*) n FROM live_sets WHERE key_name=$1`,[key]);return Number(rows.rows[0]?.n??0);
  }
  async smembers(key:string){
    await db.query(`DELETE FROM live_sets WHERE key_name=$1 AND expires_at IS NOT NULL AND expires_at<=CURRENT_TIMESTAMP`,[key]);
    const rows=await db.query<any>(`SELECT member FROM live_sets WHERE key_name=$1 ORDER BY member`,[key]);return rows.rows.map((r:any)=>String(r.member));
  }
  async srem(key:string,...members:string[]){let n=0;for(const m of members){const r=await db.query(`DELETE FROM live_sets WHERE key_name=$1 AND member=$2`,[key,m]);n+=r.rowCount;}return n;}
  async zadd(key:string,score:number,member:string){
    await db.query(`INSERT INTO live_sorted_sets(key_name,member,score) VALUES($1,$2,$3) ON CONFLICT (key_name,member) DO UPDATE SET score=EXCLUDED.score`,[key,member,score]);return 1;
  }
  async zrangebyscore(key:string,min:number|string,max:number|string,...args:any[]){
    let offset=0,limit=1000;const li=args.findIndex(x=>String(x).toUpperCase()==="LIMIT");if(li>=0){offset=Number(args[li+1]);limit=Number(args[li+2]);}
    const lo=min==="-inf"?-Number.MAX_VALUE:Number(min),hi=max==="+inf"?Number.MAX_VALUE:Number(max);
    const rows=await db.query<any>(`SELECT member FROM live_sorted_sets WHERE key_name=$1 AND score BETWEEN $2 AND $3 ORDER BY score LIMIT $4 OFFSET $5`,[key,lo,hi,limit,offset]);return rows.rows.map((r:any)=>r.member);
  }
  async zrem(key:string,...members:string[]){let n=0;for(const m of members){const r=await db.query(`DELETE FROM live_sorted_sets WHERE key_name=$1 AND member=$2`,[key,m]);n+=r.rowCount;}return n;}
  async xadd(stream:string,...args:any[]){
    const pi=args.lastIndexOf("payload");const payload=pi>=0?String(args[pi+1]):String(args.at(-1)??"");
    const r=await db.query<any>(`INSERT INTO live_streams(stream_name,payload) VALUES($1,$2) RETURNING seq`,[stream,payload]);
    const seq=r.rows[0]?.seq;
    const mi=args.findIndex(x=>String(x).toUpperCase()==="MAXLEN");if(mi>=0){const max=Number(args[mi+2]??0);if(max>0)await db.query(`DELETE FROM live_streams WHERE stream_name=$1 AND seq < (SELECT GREATEST(COALESCE(MAX(seq),0)-$2,0) FROM live_streams WHERE stream_name=$1)`,[stream,max]).catch(()=>{});}
    return `${seq}-0`;
  }
  async xread(...args:any[]){
    const bi=args.findIndex(x=>String(x).toUpperCase()==="BLOCK"),ci=args.findIndex(x=>String(x).toUpperCase()==="COUNT"),si=args.findIndex(x=>String(x).toUpperCase()==="STREAMS");
    const block=bi>=0?Number(args[bi+1]):0,count=ci>=0?Number(args[ci+1]):10,stream=String(args[si+1]),last=String(args[si+2]??"0-0");
    const after=Number(last.split("-")[0]||0),deadline=Date.now()+block;
    do{
      const rows=await db.query<any>(`SELECT seq,payload FROM live_streams WHERE stream_name=$1 AND seq>$2 ORDER BY seq LIMIT $3`,[stream,after,count]);
      if(rows.rows.length)return [[stream,rows.rows.map((r:any)=>[`${r.seq}-0`,["payload",r.payload]])]];
      if(!block)break;await sleep(200);
    }while(Date.now()<deadline);
    return null;
  }
  async publish(channel:string,message:string){await this.xadd(`__pub__:${channel}`,"MAXLEN","~",1000,"*","payload",message);return 1;}
  duplicate(){return redisUrl?new Redis(redisUrl,{maxRetriesPerRequest:null}) as any:new PostgresRedisCompat() as any;}
  async subscribe(...channels:string[]){
    for(const channel of channels){this.channels.add(channel);const rows=await db.query<any>(`SELECT COALESCE(MAX(seq),0) n FROM live_streams WHERE stream_name=$1`,[`__pub__:${channel}`]);this.pubCursor.set(channel,Number(rows.rows[0]?.n??0));}
    if(!this.pollTimer){this.pollTimer=setInterval(()=>void this.pollPubSub(),300);this.pollTimer.unref();}
    return this.channels.size;
  }
  private async pollPubSub(){
    if(this.polling)return;this.polling=true;
    try{
      for(const channel of this.channels){
        const last=this.pubCursor.get(channel)??0;const rows=await db.query<any>(`SELECT seq,payload FROM live_streams WHERE stream_name=$1 AND seq>$2 ORDER BY seq LIMIT 100`,[`__pub__:${channel}`,last]);
        for(const row of rows.rows){this.pubCursor.set(channel,Number(row.seq));this.emit("message",channel,row.payload);}
      }
    }catch(error){console.warn("[live-state] pub/sub poll failed; retrying",error);}
    finally{this.polling=false;}
  }
  async quit(){if(this.pollTimer)clearInterval(this.pollTimer);this.channels.clear();return "OK";}
}

export const redis:any=redisUrl?new Redis(redisUrl,{maxRetriesPerRequest:null}):new PostgresRedisCompat();
export const redisSub:any=redisUrl?new Redis(redisUrl,{maxRetriesPerRequest:null}):new PostgresRedisCompat();

export async function streamTailId(stream:string):Promise<string>{
  if(redisUrl){
    const rows=await redis.xrevrange(stream,"+","-","COUNT",1);
    return rows?.[0]?.[0]??"0-0";
  }
  const rows=await db.query<any>(`SELECT COALESCE(MAX(seq),0) n FROM live_streams WHERE stream_name=$1`,[stream]);
  return `${Number(rows.rows[0]?.n??0)}-0`;
}

export const keys={
  roomState:(roomId:string)=>`music:room:${roomId}:state`,
  roomQueue:(roomId:string)=>`music:room:${roomId}:queue`,
  roomSessionHistory:(roomId:string)=>`music:room:${roomId}:session-history`,
  roomWorker:(roomId:string)=>`music:room:${roomId}:worker`,
  workerHeartbeat:(workerId:string)=>`music:worker:${workerId}:heartbeat`,
  workerLease:(workerId:string)=>`music:worker:${workerId}:lease`,
  workerCommands:(workerId:string)=>`music:worker:${workerId}:commands`,
  votes:(roomId:string)=>`music:room:${roomId}:skip:votes`,
  ephemeralDue:"music:ephemeral:due",
  ephemeralData:(id:string)=>`music:ephemeral:${id}`,
  ephemeralMessage:(messageId:string)=>`music:ephemeral:message:${messageId}`,
  ephemeralUserRoom:(userId:string,roomId:string)=>`music:ephemeral:user:${userId}:room:${roomId}`,
  ephemeralLyricsUserRoom:(userId:string,roomId:string)=>`music:ephemeral:lyrics:user:${userId}:room:${roomId}`,
  lyricPanels:(roomId:string)=>`music:room:${roomId}:lyric-panels`,
  events:"music:events",
  controllerCommands:"music:controller:commands"
};

export async function publishWorkerCommand(workerId:string, command:WorkerCommand){await redis.xadd(keys.workerCommands(workerId),"MAXLEN","~",1000,"*","payload",JSON.stringify(command));}
export async function publishEvent(event:WorkerEvent){const p=JSON.stringify(event);await redis.xadd(keys.events,"MAXLEN","~",5000,"*","payload",p);await redis.publish("music:live",p);}
export async function setRoomState(roomId:string,state:RoomRuntimeState){await redis.set(keys.roomState(roomId),JSON.stringify(state));await redis.publish(`music:room:${roomId}:live`,JSON.stringify(state));}
export async function getRoomState(roomId:string):Promise<RoomRuntimeState>{const raw=await redis.get(keys.roomState(roomId));return raw?JSON.parse(raw):{status:"IDLE",updatedAt:Date.now()};}
export async function enqueue(item:QueueItem){await redis.rpush(keys.roomQueue(item.roomId),JSON.stringify(item));}
export async function dequeue(roomId:string):Promise<QueueItem|null>{
 let fairMode=await redis.get(`music:room:${roomId}:fair-queue`);
 if(fairMode===null){const row=await db.query<any>('SELECT fair_queue FROM room_music_settings WHERE room_id=$1',[roomId]);fairMode=row.rows[0]?.fair_queue?'1':'0';await redis.set(`music:room:${roomId}:fair-queue`,fairMode,'EX',60);}
 if(fairMode!=='1'){const raw=await redis.lpop(keys.roomQueue(roomId));return raw?JSON.parse(raw):null;}
 const queueKey=keys.roomQueue(roomId),servedKey=`music:room:${roomId}:served`;
 if(stateBackend==='redis'){
  const raw=await redis.eval(`local items=redis.call('LRANGE',KEYS[1],0,-1) if #items==0 then return false end local served=cjson.decode(redis.call('GET',KEYS[2]) or '[]') local best=1 local score=999999 for i,raw in ipairs(items) do local item=cjson.decode(raw) local owner=tostring(item.requesterId or '') local rank=0 for j,id in ipairs(served) do if id==owner then rank=j break end end if rank<score then best=i score=rank end end local chosen=cjson.decode(items[best]) local owner=tostring(chosen.requesterId or '') local next={} for _,id in ipairs(served) do if id~=owner then table.insert(next,id) end end table.insert(next,owner) if #next>200 then table.remove(next,1) end redis.call('SET',KEYS[2],cjson.encode(next),'EX',86400) redis.call('LREM',KEYS[1],1,items[best]) return items[best]`,2,queueKey,servedKey);
  return raw?JSON.parse(String(raw)):null;
 }
 const tx=await pool.connect();try{await tx.query('BEGIN');await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[queueKey]);
  const items=(await tx.query('SELECT id,value_text FROM live_lists WHERE key_name=$1 ORDER BY id FOR UPDATE',[queueKey])).rows;
  if(!items.length){await tx.query('COMMIT');return null;}
  const stored=(await tx.query('SELECT value_text FROM live_kv WHERE key_name=$1 AND (expires_at IS NULL OR expires_at>now())',[servedKey])).rows[0];const served:string[]=stored?JSON.parse(stored.value_text):[];
  let best=items[0],rank=Infinity;for(const row of items){const item=JSON.parse(row.value_text),score=served.indexOf(String(item.requesterId??''));if(score<rank){best=row;rank=score;}}
  const chosen=JSON.parse(best.value_text),owner=String(chosen.requesterId??''),next=[...served.filter(x=>x!==owner),owner].slice(-200);
  await tx.query('DELETE FROM live_lists WHERE id=$1',[best.id]);await tx.query(`INSERT INTO live_kv(key_name,value_text,expires_at) VALUES($1,$2,now()+INTERVAL '1 day') ON CONFLICT(key_name) DO UPDATE SET value_text=EXCLUDED.value_text,expires_at=EXCLUDED.expires_at`,[servedKey,JSON.stringify(next)]);await tx.query('COMMIT');return chosen;
 }catch(e){await tx.query('ROLLBACK').catch(()=>{});throw e;}finally{tx.release();}
}
/** Atomically remove the selected queued request without disturbing other tracks. */
export async function dequeueByRequestId(roomId:string,requestId:string):Promise<QueueItem|null>{
 const queueKey=keys.roomQueue(roomId);
 if(stateBackend==='redis'){
  const raw=await redis.eval(`local items=redis.call('LRANGE',KEYS[1],0,-1) for _,raw in ipairs(items) do local ok,item=pcall(cjson.decode,raw) if ok and item.requestId==ARGV[1] then if redis.call('LREM',KEYS[1],1,raw)==1 then return raw end end end return false`,1,queueKey,requestId);return raw?JSON.parse(String(raw)):null;
 }
 const tx=await pool.connect();try{await tx.query('BEGIN');await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[queueKey]);const row=(await tx.query(`SELECT id,value_text FROM live_lists WHERE key_name=$1 AND value_text::jsonb->>'requestId'=$2 ORDER BY id FOR UPDATE LIMIT 1`,[queueKey,requestId])).rows[0];if(row)await tx.query('DELETE FROM live_lists WHERE id=$1',[row.id]);await tx.query('COMMIT');return row?JSON.parse(row.value_text):null;}catch(e){await tx.query('ROLLBACK').catch(()=>{});throw e;}finally{tx.release();}
}
export async function queueItems(roomId:string):Promise<QueueItem[]>{return (await redis.lrange(keys.roomQueue(roomId),0,-1)).map((x:string)=>JSON.parse(x));}


export type CounterLimit={key:string;limit:number;ttlSeconds:number};
/** Ordered advisory locks protect absent and existing keys across processes. */
async function counterTransaction<T>(keys:string[],run:(client:any)=>Promise<T>):Promise<T>{
  const client=await pool.connect();
  try{await client.query('BEGIN');
    for(const key of [...new Set(keys)].sort())await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
    const result=await run(client);await client.query('COMMIT');return result;
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}
export async function reserveCounters(limits:CounterLimit[]):Promise<boolean>{
  if(!limits.length)return true;
  if(limits.some(x=>!Number.isFinite(x.limit)||x.limit<1))return false;
  if(stateBackend==='redis'){
    return Number(await redis.eval(`for i=1,#KEYS do if tonumber(redis.call('GET',KEYS[i]) or '0')>=tonumber(ARGV[i]) then return 0 end end for i=1,#KEYS do local n=redis.call('INCR',KEYS[i]) if n==1 then redis.call('EXPIRE',KEYS[i],ARGV[#KEYS+i]) end end return 1`,limits.length,...limits.map(x=>x.key),...limits.map(x=>x.limit),...limits.map(x=>x.ttlSeconds)))===1;
  }
  return counterTransaction(limits.map(x=>x.key),async client=>{
    const values:number[]=[];
    for(const item of limits){const r=await client.query(`SELECT value_text FROM live_kv WHERE key_name=$1 AND (expires_at IS NULL OR expires_at>NOW())`,[item.key]);values.push(Number(r.rows[0]?.value_text??0));}
    if(limits.some((x,i)=>values[i]>=x.limit))return false;
    for(const [i,item] of limits.entries())await client.query(`INSERT INTO live_kv(key_name,value_text,expires_at) VALUES($1,$2,NOW()+($3::int*interval '1 second')) ON CONFLICT(key_name) DO UPDATE SET value_text=EXCLUDED.value_text,expires_at=CASE WHEN live_kv.expires_at>NOW() THEN live_kv.expires_at ELSE EXCLUDED.expires_at END`,[item.key,String(values[i]+1),item.ttlSeconds]);
    return true;
  });
}
/** Refund a reservation that did not produce a delivered response. */
export async function refundCounters(keys:string[]):Promise<void>{
  if(stateBackend==='redis'){await redis.eval(`for i=1,#KEYS do local n=tonumber(redis.call('GET',KEYS[i]) or '0') if n>0 then redis.call('DECR',KEYS[i]) end end return 1`,keys.length,...keys);return;}
  await counterTransaction(keys,async client=>{for(const key of keys)await client.query(`UPDATE live_kv SET value_text=GREATEST(0,value_text::bigint-1)::text WHERE key_name=$1 AND (expires_at IS NULL OR expires_at>NOW())`,[key]);});
}
export async function releaseLease(key:string,token:string):Promise<void>{
  if(stateBackend==='redis'){await redis.eval(`if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0`,1,key,token);return;}
  await db.query('DELETE FROM live_kv WHERE key_name=$1 AND value_text=$2',[key,token]);
}

export const discordRequest=makeDiscordScheduler(redis,releaseLease);
