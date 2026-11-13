// Admin: add or remove Discord roles for a member from the dashboard.
import {db} from '@bom/db';

const apiBase='https://discord.com/api/v10';
const ADMINISTRATOR=1n<<3n,MANAGE_ROLES=1n<<28n,MANAGE_GUILD=1n<<5n;
const idOk=(s:string)=>/^\d{5,25}$/.test(s);

async function discord(path:string,init:RequestInit&{reason?:string}={}){
  const headers=new Headers({Authorization:`Bot ${process.env.DISCORD_BOT_TOKEN??''}`});
  if(init.body)headers.set('content-type','application/json');
  if(init.reason)headers.set('X-Audit-Log-Reason',encodeURIComponent(init.reason).slice(0,500));
  const r=await fetch(`${apiBase}${path}`,{...init,headers,signal:AbortSignal.timeout(15_000)});
  const text=await r.text();let body:any=null;try{body=text?JSON.parse(text):null;}catch{body=text;}
  if(!r.ok){const e:any=new Error(body?.message??`Discord request failed (${r.status})`);e.status=r.status;throw e;}
  return body;
}

let botId:string|null=null;
async function roleContext(guildId:string){
  botId??=String((await discord('/users/@me')).id);
  const [roles,me]=await Promise.all([discord(`/guilds/${guildId}/roles`),discord(`/guilds/${guildId}/members/${botId}`)]);
  const pos=new Map<string,number>(roles.map((r:any)=>[String(r.id),Number(r.position)]));
  const botTop=Math.max(0,...(me.roles??[]).map((id:string)=>pos.get(String(id))??0));
  const list=roles.filter((r:any)=>String(r.id)!==guildId).sort((a:any,b:any)=>b.position-a.position).map((r:any)=>{
    const perms=BigInt(r.permissions??'0'),powerful=Boolean(perms&(ADMINISTRATOR|MANAGE_ROLES|MANAGE_GUILD));
    const why=r.managed?'Managed by an integration or bot':r.position>=botTop?"Above the bot's highest role":null;
    return {id:String(r.id),name:r.name,color:r.color?`#${Number(r.color).toString(16).padStart(6,'0')}`:null,position:r.position,assignable:!why,why,powerful};
  });
  return {roles:list};
}
const shape=(m:any)=>({id:String(m.user?.id),name:m.nick??m.user?.global_name??m.user?.username,username:m.user?.username,avatar:m.user?.avatar?`https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png?size=64`:null,bot:Boolean(m.user?.bot),roles:(m.roles??[]).map(String)});

export function registerRoleAssignRoutes(app:any,{guildId,requireAdmin,userId}:{guildId:string;requireAdmin:any;userId:(req:any)=>string}){
  const fail=(reply:any,e:any)=>reply.code(e?.status===403?403:e?.status===404?404:502).send({error:'discord_error',message:e?.status===403?"The bot isn't allowed to do that. It needs Manage Roles, and the role must be below the bot's highest role.":String(e?.message??e)});
  app.get('/v1/admin/roles',async(req:any,reply:any)=>{if(!await requireAdmin(req,reply))return;try{return await roleContext(guildId);}catch(e){return fail(reply,e);}});
  app.get('/v1/admin/roles/members',async(req:any,reply:any)=>{
    if(!await requireAdmin(req,reply))return;
    const q=String(req.query?.q??'').trim().slice(0,60);
    try{
      if(idOk(q))return {members:[shape(await discord(`/guilds/${guildId}/members/${q}`))]};
      if(q.length<2)return {members:[]};
      const rows=await discord(`/guilds/${guildId}/members/search?query=${encodeURIComponent(q)}&limit=25`);
      return {members:rows.map(shape)};
    }catch(e:any){if(e?.status===404)return {members:[]};return fail(reply,e);}
  });
  const change=(method:'PUT'|'DELETE')=>async(req:any,reply:any)=>{
    if(!await requireAdmin(req,reply))return;
    const uid=String(req.params.userId),rid=String(req.params.roleId);
    if(!idOk(uid)||!idOk(rid))return reply.code(400).send({error:'invalid_id'});
    try{
      const ctx=await roleContext(guildId),role=ctx.roles.find((r:any)=>r.id===rid);
      if(!role)return reply.code(404).send({error:'role_not_found',message:'That role no longer exists.'});
      if(!role.assignable)return reply.code(403).send({error:'role_not_assignable',message:`The bot can't change “${role.name}”: ${role.why}.`});
      const actor=userId(req);
      await discord(`/guilds/${guildId}/members/${uid}/roles/${rid}`,{method,body:method==='PUT'?'':undefined,reason:`${method==='PUT'?'Added':'Removed'} from the dashboard by ${actor}`});
      await db.query(`INSERT INTO audit_log(guild_id,actor_id,action,details) VALUES($1,$2,$3,$4)`,[guildId,actor,method==='PUT'?'roles.add':'roles.remove',{userId:uid,roleId:rid,roleName:role.name}]).catch(()=>{});
      return {member:shape(await discord(`/guilds/${guildId}/members/${uid}`))};
    }catch(e){return fail(reply,e);}
  };
  app.put('/v1/admin/roles/members/:userId/roles/:roleId',change('PUT'));
  app.delete('/v1/admin/roles/members/:userId/roles/:roleId',change('DELETE'));
}
