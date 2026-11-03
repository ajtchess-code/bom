import {createHmac,timingSafeEqual} from 'node:crypto';
export type GameModule='minecraft'|'clash';
export const gameModules:GameModule[]=['minecraft','clash'];
export function clanTag(value:string){const tag=value.toUpperCase().replace(/\s/g,'').replace(/^#/,'');if(!/^[0289PYLQGRJCUV]{3,15}$/.test(tag))throw Object.assign(new Error('Enter a valid Clash tag, including #.'),{statusCode:400});return '#'+tag;}
export function verifyBridge(envelope:string,signature:string,secret:string,now=Date.now()){
 if(secret.length<32)throw Object.assign(new Error('Minecraft bridge secret is not configured (minimum 32 characters).'),{statusCode:503});
 if(!/^[a-f0-9]{64}$/i.test(signature))throw Object.assign(new Error('Invalid bridge signature'),{statusCode:401});
 const expected=createHmac('sha256',secret).update(envelope).digest();
 if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))throw Object.assign(new Error('Invalid bridge signature'),{statusCode:401});
 const body=JSON.parse(envelope);if(!Number.isFinite(body.timestamp)||Math.abs(now-body.timestamp)>90_000||!/^[-a-zA-Z0-9]{16,100}$/.test(body.nonce??''))throw Object.assign(new Error('Expired or invalid bridge envelope'),{statusCode:401});return body;
}
export function mapResourcePath(parts:string[]){
 if(parts.some(x=>!x||x==='.'||x==='..'||/[\\\x00-\x1f?#%:]/.test(x)))throw Object.assign(new Error('Invalid map path'),{statusCode:400});
 return parts.map(encodeURIComponent).join('/');
}
export function freshState(snapshot:any,seconds=120){if(!snapshot?.fetched_at)return 'unknown';return snapshot.error||Date.now()-new Date(snapshot.fetched_at).getTime()>seconds*1000?'stale':'live';}
export const recordKinds={minecraft:['announcement','guide','project','gallery','maintenance','event','preferences'],clash:['announcement','guide','availability','lineup','bonus','warning','event','upgrade','event','preferences']} as const;
export const officerKinds=new Set(['announcement','guide','maintenance','lineup','bonus','warning','event']);
