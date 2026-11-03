import {NextRequest} from 'next/server';
import {internalFetch} from '@/lib/api';
import {getSession} from '@/lib/session';
export async function GET(req:NextRequest,{params}:{params:Promise<{path?:string[]}>}){
 if(!await getSession())return Response.json({error:'unauthenticated'},{status:401});
 const access=await internalFetch('/v1/games/minecraft/map-access');if(!access.ok)return Response.json({error:'map_access_required'},{status:access.status});
 const origin=process.env.BOM_MINECRAFT_BLUEMAP_ORIGIN;if(!origin)return Response.json({error:'map_not_configured'},{status:503});
 const {path=[]}=await params;if(path.some(x=>!x||x==='.'||x==='..'||/[\\\x00-\x1f?#%:]/.test(x)))return Response.json({error:'invalid_path'},{status:400});
 const base=new URL(origin);if(!['http:','https:'].includes(base.protocol)||base.username||base.password)return Response.json({error:'invalid_map_configuration'},{status:503});
 const target=new URL(path.map(encodeURIComponent).join('/')||'index.html',base.href.replace(/\/?$/,'/'));target.search=new URL(req.url).search;
 try{const up=await fetch(target,{headers:process.env.BOM_MINECRAFT_MAP_AUTH?{Authorization:process.env.BOM_MINECRAFT_MAP_AUTH}:{},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});
 const h=new Headers({'content-type':up.headers.get('content-type')??'application/octet-stream','cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'self'"});return new Response(up.body,{status:up.status,headers:h});}catch{return Response.json({error:'map_upstream_unavailable'},{status:503});}
}
