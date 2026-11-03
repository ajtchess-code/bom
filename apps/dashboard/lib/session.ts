import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export type Session={id:string;username:string;globalName?:string|null;avatar?:string|null};
function sessionKey(){
  const secret=process.env.SESSION_SECRET;
  if(!secret)throw new Error("SESSION_SECRET is required");
  return new TextEncoder().encode(secret);
}
export async function signSession(s:Session){return new SignJWT(s as any).setProtectedHeader({alg:"HS256"}).setSubject(s.id).setIssuedAt().setExpirationTime("7d").sign(sessionKey());}
export async function decodeSession(token:string):Promise<Session|null>{try{const {payload}=await jwtVerify(token,sessionKey());return {id:String(payload.sub),username:String(payload.username),globalName:(payload.globalName as string|null)??null,avatar:(payload.avatar as string|null)??null};}catch{return null;}}
export async function getSession(){const c=await cookies();const token=c.get("bom_session")?.value;return token?decodeSession(token):null;}
