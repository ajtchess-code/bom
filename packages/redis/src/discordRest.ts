import {createHash,randomUUID} from 'node:crypto';
type Store={get:(key:string)=>Promise<string|null>;set:(key:string,value:string,...options:any[])=>Promise<any>};
/** Coordinates direct Discord REST requests across processes. discord.js keeps its own REST manager. */
export function makeDiscordScheduler(store:Store,release:(key:string,token:string)=>Promise<void>,fetcher:typeof fetch=fetch){
 return async function discordRequest(input:string|URL,init:RequestInit={}):Promise<Response>{
  const url=new URL(String(input));if(url.hostname!=='discord.com'||!url.pathname.startsWith('/api/'))return fetcher(input,init);
  const headers=new Headers(init.headers),identity=createHash('sha256').update(headers.get('authorization')??'anonymous').digest('hex').slice(0,20);
  const route=url.pathname.replace(/\/messages\/\d+/g,'/messages/:message').replace(/\/members\/\d+/g,'/members/:member');
  const base=`discord:rest:${identity}`,routeKey=`${base}:${init.method??'GET'}:${route}`,globalKey=base+':global',deadline=Date.now()+30000;
  const wait=async(ms:number)=>{if(Date.now()+ms>deadline)throw Object.assign(new Error('Discord request is waiting for a rate-limit window. Retry this operation shortly.'),{statusCode:503});await new Promise(resolve=>setTimeout(resolve,Math.max(10,ms)));};
  for(let attempt=0;attempt<3;attempt++){
   const bucket=await store.get(routeKey+':bucket'),cooldownKey=bucket?`${base}:bucket:${bucket}`:routeKey+':cooldown';
   const token=randomUUID(),lockKey=(bucket?`${base}:bucket:${bucket}`:routeKey)+':lock';
   while(!await store.set(lockKey,token,'EX',60,'NX'))await wait(75);
   let response:Response;let retryMs=0;
   try{
    const until=Math.max(Number(await store.get(globalKey)??0),Number(await store.get(cooldownKey)??0));if(until>Date.now())await wait(until-Date.now());
    response=await fetcher(input,{...init,signal:init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
    const bucketId=response.headers.get('x-ratelimit-bucket');if(bucketId)await store.set(routeKey+':bucket',bucketId,'EX',3600);
    const reset=Number(response.headers.get('x-ratelimit-reset-after'))*1000;
    if(response.headers.get('x-ratelimit-remaining')==='0'&&reset>0)await store.set(bucketId?`${base}:bucket:${bucketId}`:cooldownKey,String(Date.now()+reset),'PX',Math.ceil(reset)+1000);
    if(response.status!==429)return response;
    const body:any=await response.clone().json().catch(()=>({}));retryMs=Math.max(100,Math.ceil(Number(body.retry_after??response.headers.get('retry-after')??1)*1000));
    if(!Number.isFinite(retryMs))retryMs=1000;const key=body.global?globalKey:bucketId?`${base}:bucket:${bucketId}`:cooldownKey;
    await store.set(key,String(Date.now()+retryMs),'PX',retryMs+1000);
   }finally{await release(lockKey,token);}
   if(attempt===2||Date.now()+retryMs>deadline)return response!;
   await wait(retryMs);
  }
  throw new Error('Discord request could not complete');
 };
}
