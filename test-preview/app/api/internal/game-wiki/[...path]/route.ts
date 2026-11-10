import {NextRequest} from 'next/server';
async function proxy(req:NextRequest,ctx:{params:Promise<{path:string[]}>}){
  const {path}=await ctx.params;const url=`http://127.0.0.1:4127/v1/game-wiki/${path.join('/')}${new URL(req.url).search}`;
  const up=await fetch(url,{method:req.method,body:req.method==='GET'?undefined:await req.text(),headers:{'content-type':'application/json'}});
  const headers=new Headers(up.headers);headers.delete('content-length');headers.delete('content-encoding');return new Response(up.body,{status:up.status,headers});
}
export const GET=proxy;
export const POST=proxy;
