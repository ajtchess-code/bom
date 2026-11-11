import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export async function GET(){return new Response(await readFile(resolve(process.cwd(),'../apps/dashboard/public/wosb/map/world-map.png')),{headers:{'content-type':'image/png'}});}
