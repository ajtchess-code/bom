import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {db,oneOrNone} from './index.js';
function secret(){const raw=process.env.CREDENTIAL_ENCRYPTION_KEY?.trim()||process.env.INTERNAL_API_TOKEN?.trim();if(!raw||raw.length<32)throw new Error('credential_encryption_not_configured');return createHash('sha256').update('bom:credentials:v1:'+raw).digest();}
export async function getOpenAIKey():Promise<string|null>{
 const row=await oneOrNone<any>(`SELECT ciphertext FROM service_credentials WHERE service='openai'`);
 if(!row)return process.env.OPENAI_API_KEY?.trim()||null;
 const [iv,tag,data]=row.ciphertext.split('.');const cipher=createDecipheriv('aes-256-gcm',secret(),Buffer.from(iv,'base64'));cipher.setAuthTag(Buffer.from(tag,'base64'));return Buffer.concat([cipher.update(Buffer.from(data,'base64')),cipher.final()]).toString('utf8');
}
export async function openAICredentialStatus(){const row=await oneOrNone<any>(`SELECT updated_at FROM service_credentials WHERE service='openai'`);let storageAvailable=true;try{secret()}catch{storageAvailable=false}return {configured:Boolean(row||process.env.OPENAI_API_KEY?.trim()),source:row?'dashboard':process.env.OPENAI_API_KEY?.trim()?'environment':'none',updatedAt:row?.updated_at??null,storageAvailable};}
export async function saveOpenAIKey(value:string,actor:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',secret(),iv);const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);const ciphertext=[iv,cipher.getAuthTag(),data].map(b=>b.toString('base64')).join('.');await db.query(`INSERT INTO service_credentials(service,ciphertext,updated_by) VALUES('openai',$1,$2) ON CONFLICT(service) DO UPDATE SET ciphertext=EXCLUDED.ciphertext,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,[ciphertext,actor]);}
export async function removeOpenAIKey(){await db.query(`DELETE FROM service_credentials WHERE service='openai'`);}
