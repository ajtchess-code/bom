import {WebhookClient,type WebhookMessageCreateOptions,type WebhookMessageEditOptions} from 'discord.js';
import type {Logger} from '../logging/logger.js';
function statusFromError(error:any):number|null{return typeof(error?.status??error?.httpStatus)==='number'?(error.status??error.httpStatus):null;}
function retryable(error:any){if(Number(error?.code)===50006)return false;const status=statusFromError(error);return !status||status===408||status===429||status>=500;}
export interface WebhookMessageRef{id:string;}
export interface DestinationPolicy{allowedGuildIds:Set<string>;blockedGuildIds?:Set<string>;}
export class ManagedWebhook{
 public health:{state:string;lastSuccess:string|null;lastAttempt:string|null;error:string|null;channelId?:string;guildId?:string}={state:'untested',lastSuccess:null,lastAttempt:null,error:null};
 private invalidWebhook:unknown=null;
 private readonly client:WebhookClient;
 private readonly url:string;
 private queue:Array<{priority:number;order:number;queuedAt:number;run:()=>Promise<void>}>=[];
 private processing=false;private sequence=0;private destroyed=false;
 public onEvent:((event:string,details:unknown)=>void)|undefined;
 public get disabled(){return this.invalidWebhook!==null;}
 public get pending(){return this.queue.length;}
 public blockSourceGuilds(ids:Iterable<string>){this.destinationPolicy.blockedGuildIds=new Set(ids);}
 public constructor(url:string,private readonly logger:Logger,private readonly label:string,private readonly destinationPolicy:DestinationPolicy={allowedGuildIds:new Set((process.env.DESTINATION_GUILD_IDS??'').split(',').map(s=>s.trim()).filter(Boolean))}){
  this.url=url;this.client=new WebhookClient({url});
 }
 /** This GET uses the destination webhook token, NEVER the source account token. */
 public async verifyDestination():Promise<void>{
  try{
   if(!this.destinationPolicy.allowedGuildIds.size)throw new Error('Destination blocked: configure BOM destination server ID.');
   const response=await fetch(this.url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000)});
   const body=await response.json().catch(()=>({})) as any;
   if(!response.ok){const error=Object.assign(new Error('Destination access unavailable.'),{status:response.status,code:body.code});if(Number(body.code)===10015)this.invalidWebhook=error;throw error;}
   if(!this.destinationPolicy.allowedGuildIds.has(String(body.guild_id))||this.destinationPolicy.blockedGuildIds?.has(String(body.guild_id)))throw new Error('Destination blocked: webhook is not in an approved BOM server.');
   this.health={...this.health,state:this.health.lastSuccess?'ok':'verified',error:null,guildId:String(body.guild_id),channelId:String(body.channel_id)};
  }catch(error:any){const status=statusFromError(error),temporary=status===null&&!String(error?.message??'').startsWith('Destination blocked')||status===429||Boolean(status&&status>=500);this.health={...this.health,state:this.invalidWebhook?'error':temporary?'delayed':'blocked',error:this.invalidWebhook?'Unknown webhook: replace this route’s destination URL.':temporary?'Destination validation temporarily unavailable; delivery is waiting.':status===403?'Destination permission missing: check destination webhook access.':'Destination validation failed. Confirm the webhook belongs to the approved BOM server.'};throw error;}
 }
 public send(options:WebhookMessageCreateOptions,priority=0):Promise<WebhookMessageRef>{const fresh=freshOptions(options);return this.enqueue(()=>this.retry(async()=>{await this.verifyDestination();return this.client.send(fresh())}),priority);}
 public edit(id:string,options:WebhookMessageEditOptions,priority=0):Promise<WebhookMessageRef>{const fresh=freshOptions(options);return this.enqueue(()=>this.retry(async()=>{await this.verifyDestination();return this.client.editMessage(id,fresh())}),priority);}
 public async delete(id:string):Promise<void>{await this.enqueue(()=>this.retry(async()=>{await this.verifyDestination();return this.client.deleteMessage(id)}),1);}
 public destroy(){this.destroyed=true;this.client.destroy();}
 private enqueue<T>(task:()=>Promise<T>,priority=0):Promise<T>{
  return new Promise<T>((resolve,reject)=>{this.queue.push({priority,order:this.sequence++,queuedAt:Date.now(),run:async()=>{if(this.destroyed){reject(new Error('Destination stopped.'));return;}try{resolve(await task())}catch(error){reject(error)}}});void this.drain();});
 }
 private async drain(){if(this.processing)return;this.processing=true;try{while(this.queue.length){this.queue.sort((a,b)=>(b.priority+Math.floor((Date.now()-b.queuedAt)/30000))-(a.priority+Math.floor((Date.now()-a.queuedAt)/30000))||a.order-b.order);await this.queue.shift()!.run();}}finally{this.processing=false;}}
 private async retry<T>(task:()=>Promise<T>,attempts=4):Promise<T>{
  if(this.invalidWebhook)throw this.invalidWebhook;
  let lastError:any;
  for(let attempt=1;attempt<=attempts;attempt++){
   this.health.lastAttempt=new Date().toISOString();
   try{const result=await task();this.health={...this.health,state:'ok',lastSuccess:new Date().toISOString(),error:null};this.onEvent?.('webhook_success',{kind:this.label,attempt});return result;}
   catch(error:any){lastError=error;if(Number(error?.code)===10015){this.invalidWebhook=error;break;}
    this.onEvent?.('webhook_failure',{kind:this.label,attempt,status:statusFromError(error)});
    if(this.health.state==='blocked'||attempt>=attempts||!retryable(error))break;
    const seconds=Number(error?.retry_after??error?.data?.retry_after??0);
    const delayMs=Math.min(60000,Math.max(seconds*1000,1000*2**(attempt-1)));
    this.onEvent?.('webhook_retry',{kind:this.label,attempt,delayMs});
    this.logger.warn('Destination request delayed; retrying.',{kind:this.label,attempt,delayMs,status:statusFromError(error)});
    await new Promise(resolve=>setTimeout(resolve,delayMs));
   }
  }
  if(this.health.state!=='blocked')this.health={...this.health,state:'error',error:Number(lastError?.code)===10015?'Unknown webhook: replace this route’s destination URL.':statusFromError(lastError)===403?'Destination permission missing: check webhook and destination channel access.':'Delivery failed. Check destination access and host connection.'};
  throw lastError;
 }
}

/** discord.js appends uploaded files to options.attachments in place, so a retried or reused payload would list files twice (ATTACHMENT_NOT_FOUND). Give every attempt its own copy. */
function freshOptions<T>(options:T):()=>T{const o:any=options,base=Array.isArray(o.attachments)?[...o.attachments]:o.attachments;return ()=>({...o,...(base!==undefined?{attachments:Array.isArray(base)?[...base]:base}:{})}) as T;}
