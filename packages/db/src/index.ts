import { Pool } from "pg";

function postgresUri(){
  const direct=process.env.DATABASE_URL?.trim();
  if(direct?.startsWith("postgres://")||direct?.startsWith("postgresql://")) return direct;
  const host=process.env.POSTGRES_HOST, database=process.env.POSTGRES_DATABASE, user=process.env.POSTGRES_USER;
  if(!host||!database||!user) throw new Error("DATABASE_URL=postgresql://... or POSTGRES_HOST/POSTGRES_DATABASE/POSTGRES_USER are required");
  const port=Number(process.env.POSTGRES_PORT??5432);
  const password=process.env.POSTGRES_PASSWORD??"";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
}

const sslEnabled=(process.env.POSTGRES_SSL??"false").toLowerCase()==="true";
const rejectUnauthorized=(process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED??"true").toLowerCase()!=="false";

export const pool=new Pool({
  connectionString:postgresUri(),
  max:Number(process.env.POSTGRES_POOL_SIZE??12),
  idleTimeoutMillis:Number(process.env.POSTGRES_IDLE_TIMEOUT_MS??30_000),
  connectionTimeoutMillis:Number(process.env.POSTGRES_CONNECT_TIMEOUT_MS??10_000),
  application_name:"bom-bot",
  ssl:sslEnabled?{rejectUnauthorized}:undefined
});

pool.on("connect",client=>{ void client.query("SET TIME ZONE 'UTC'").catch(()=>{}); });
pool.on("error",err=>console.error("[postgres] idle client error",err));

function encodeValue(v:any){
  if(v===undefined)return null;
  if(v && typeof v==="object" && !(v instanceof Date) && !Buffer.isBuffer(v)) return JSON.stringify(v);
  return v;
}

export type QueryResult<T=any>={rows:T[];rowCount:number;insertId?:number|string};
export const db={
  async query<T=any>(sql:string, values:any[]=[]):Promise<QueryResult<T>>{
    const r=await pool.query(sql,values.map(encodeValue));
    const first:any=r.rows?.[0];
    const insertId=first?.id??first?.seq;
    return {rows:(r.rows??[]) as T[],rowCount:r.rowCount??0,insertId};
  },
  async end(){await pool.end();}
};

export async function oneOrNone<T=any>(text:string, values:any[]=[]):Promise<T|null>{
  const r=await db.query<T>(text,values); return r.rows[0]??null;
}
export async function many<T=any>(text:string, values:any[]=[]):Promise<T[]>{
  const r=await db.query<T>(text,values); return r.rows;
}

export type AuditRange={from?:Date;to?:Date;label?:string};
/** Shared role history query for Discord and dashboard: count the full result before paging. */
export async function queryRoleHistory(args:{guildId:string;memberId:string;roleId?:string;direction?:'added'|'removed';range:AuditRange;limit?:number}){
  const params:any[]=[args.guildId,args.memberId],where=[`guild_id=$1`,`target_id=$2`,`action='member.roles.changed'`];
  if(args.direction){params.push(args.direction);const field=`metadata->$${params.length}`;if(args.roleId){params.push(args.roleId);where.push(`${field} ? $${params.length}`);}else where.push(`jsonb_array_length(CASE WHEN jsonb_typeof(${field})='array' THEN ${field} ELSE '[]'::jsonb END)>0`);}
  else if(args.roleId){params.push(args.roleId);where.push(`(metadata->'added' ? $${params.length} OR metadata->'removed' ? $${params.length})`);}
  if(args.range.from){params.push(args.range.from);where.push(`occurred_at >= $${params.length}`);}
  if(args.range.to){params.push(args.range.to);where.push(`occurred_at < $${params.length}`);}
  const filter=where.join(' AND '),count=await oneOrNone<any>(`SELECT COUNT(DISTINCT COALESCE(caused_by_event_id,id))::int n FROM sentinel_events WHERE ${filter}`,params);
  const limit=Math.min(100,Math.max(0,args.limit??50));
  const rows=limit?await many<any>(`SELECT * FROM (SELECT DISTINCT ON(COALESCE(caused_by_event_id,id)) * FROM sentinel_events WHERE ${filter} ORDER BY COALESCE(caused_by_event_id,id),(initiator_id IS NOT NULL OR actor_id IS NOT NULL) DESC,occurred_at DESC) x ORDER BY occurred_at DESC LIMIT ${limit}`,params):[];
  return {rows,count:Number(count?.n??0)};
}

// Compatibility for community and credential administration modules.
export {getOpenAIKey,openAICredentialStatus,saveOpenAIKey,removeOpenAIKey} from './credentials.js';

export {finishApplication,finalApplicationStates,cancelPortBattle} from './recruitmentLifecycle.js';

/** Global per-user mute, shared by API and controller. Never fail open. */
export async function discordDmsMuted(userId:string):Promise<boolean>{
  const row=await oneOrNone<{muted:boolean}>(
    'SELECT muted_until > CURRENT_TIMESTAMP AS muted FROM bot_dm_mutes WHERE user_id=$1',[String(userId)]);
  return row?.muted===true;
}
export async function muteDiscordDms(userId:string,hours:number):Promise<Date>{
  if(![1,3,12,24].includes(hours))throw new Error('Invalid DM mute duration');
  const row=await oneOrNone<{muted_until:string}>(`INSERT INTO bot_dm_mutes(user_id,muted_until)
    VALUES($1,CURRENT_TIMESTAMP+($2::int * INTERVAL '1 hour'))
    ON CONFLICT(user_id) DO UPDATE SET muted_until=EXCLUDED.muted_until,updated_at=CURRENT_TIMESTAMP
    RETURNING muted_until`,[String(userId),hours]);
  if(!row)throw new Error('Unable to save DM mute');
  return new Date(row.muted_until);
}

/** Records delivery metadata only; message contents and credentials are never stored here. */
export async function recordDmDelivery(userId:string,source:string,status:'SENT'|'MUTED'|'BLOCKED'|'FAILED',messageId?:string,errorCode?:string){
 try{await db.query('INSERT INTO dm_delivery_history(guild_id,user_id,source,status,message_id,error_code) VALUES($1,$2,$3,$4,$5,$6)',[process.env.DISCORD_GUILD_ID??'',userId,source,status,messageId??null,errorCode?.slice(0,80)??null]);}catch(error){console.warn('[dm-delivery] metadata recording failed',error);}
}
