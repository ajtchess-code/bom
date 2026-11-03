/** Source sessions are observation-only. No messages, reactions, typing, joins, or settings writes. */
export function assertSourceRead(method:string):void {
 if(method.toUpperCase()!=='GET')throw new Error('SOURCE_READ_ONLY: source-side writes are prohibited.');
}
export function installSourceReadOnly(client:any):void {
 // The library echoes saved status/custom activity during READY and settings updates.
 // Suppress that automatic outbound presence operation locally, before it reaches
 // the gateway guard. Keep direct gateway mutations blocked below.
 if(client.presence && typeof client.presence.set==='function'){
  const presence=client.presence;
  Object.defineProperty(presence,'set',{configurable:false,writable:false,value:()=>presence});
 }
 const rest=client.rest;
 if(!rest||typeof rest.request!=='function')throw new Error('SOURCE_READ_ONLY: cannot install request guard.');
 const request=rest.request.bind(rest);
 Object.defineProperty(rest,'request',{configurable:false,writable:false,value:(method:string,...args:any[])=>{assertSourceRead(method);return request(method,...args);}});
 // Guard the underlying transport as well, including library-internal requests.
 if(typeof rest.fetch==='function'){
  const transport=rest.fetch.bind(rest);
  Object.defineProperty(rest,'fetch',{configurable:false,writable:false,value:(url:any,options:any={})=>{assertSourceRead(options.method??url?.method??'GET');return transport(url,options);}});
 }
 if(client.ws?.broadcast){
  const broadcast=client.ws.broadcast.bind(client.ws);
  Object.defineProperty(client.ws,'broadcast',{configurable:false,writable:false,value:(packet:any)=>{
   if(![1,2,6,8,14,37].includes(packet?.op))throw new Error('SOURCE_READ_ONLY: gateway mutations are prohibited.');
   return broadcast(packet);
  }});
 }
}
