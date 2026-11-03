import {NextRequest} from 'next/server';
export async function POST(req:NextRequest){
 if(Number(req.headers.get('content-length')??0)>550000)return Response.json({error:'request_too_large'},{status:413});
 const body=await req.text();if(body.length>550000)return Response.json({error:'request_too_large'},{status:413});
 try{const upstream=await fetch((process.env.INTERNAL_API_URL??'http://127.0.0.1:4100')+'/v1/games/minecraft/bridge',{method:'POST',headers:{'content-type':'application/json','x-internal-token':process.env.INTERNAL_API_TOKEN??''},body,cache:'no-store',signal:AbortSignal.timeout(20000)});return new Response(upstream.body,{status:upstream.status,headers:{'content-type':'application/json','cache-control':'no-store'}});}catch{return Response.json({error:'bridge_unavailable'},{status:503});}
}
