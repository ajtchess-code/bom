import type {FastifyInstance} from 'fastify';
import {randomUUID} from 'node:crypto';
import {redis,releaseLease} from '@bom/redis';
export function contextSystem(req:any,system='wiki'){
 const scope=String(req.headers?.['x-bom-context-scope']??'');
 return /^discord:\d{15,22}$/.test(scope)?`${system}:${scope}`:system;
}
export function installAssistantRequestLocks(app:FastifyInstance,guildId:string){
 app.addHook('preHandler',async(req:any,reply)=>{
  if(!['POST','PUT'].includes(req.method)||!/^\/v1\/(wiki\/(ask|context(?:\/reset)?)|sentinel\/ask)$/.test(req.url.split('?')[0]))return;
  const actor=String(req.headers['x-discord-user-id']??'');if(!actor)return;
  const system=contextSystem(req,req.url.startsWith('/v1/sentinel')?'sentinel':'wiki');
  const key=`assistant:busy:${guildId}:${actor}:${system}`,token=randomUUID();
  if(await redis.set(key,token,'EX',180,'NX')!=='OK')return reply.code(409).send({error:'A question in this conversation is still processing. Please wait for its answer.'});
  req.bomAssistantLease={key,token};
 });
 const release=async(req:any)=>{const lease=req.bomAssistantLease;if(lease){delete req.bomAssistantLease;await releaseLease(lease.key,lease.token).catch(()=>{});}};
 app.addHook('onResponse',release);
 app.addHook('onTimeout',async(req)=>{await release(req);});
 app.addHook('onRequestAbort',release);
 app.addHook('onError',async(req)=>{await release(req);});
}
