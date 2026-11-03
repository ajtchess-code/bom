import {NextRequest} from 'next/server';
import {mapEditProxy} from '@/lib/mapEditProxy';
async function route(req:NextRequest,ctx:{params:Promise<{path:string[]}>}){return mapEditProxy(req,(await ctx.params).path);}
export const PUT=route;export const POST=route;
