export const dynamic='force-dynamic';
export async function GET(){
 try{const r=await fetch(new URL('/health',process.env.INTERNAL_API_URL??'http://127.0.0.1:4100'),{cache:'no-store',signal:AbortSignal.timeout(3000)});const body=await r.json();return Response.json({ok:r.ok&&body.ok===true},{status:r.ok&&body.ok===true?200:503});}
 catch{return Response.json({ok:false},{status:503});}
}
