import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export async function GET(_req:Request,ctx:{params:Promise<{filename:string}>}){const {filename}=await ctx.params;if(!/^[a-z0-9-]+\.png$/.test(filename))return new Response('Invalid path',{status:400});try{return new Response(await readFile(resolve(process.cwd(),'../apps/dashboard/public/prep-review/maps',filename)),{headers:{'content-type':'image/png'}});}catch{return new Response('Not found',{status:404});}}
