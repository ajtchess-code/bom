import {many,oneOrNone} from '@bom/db';
import {discordContext} from './authz.js';
export function registerConfigDiagnostics(app:any,{guildId,requireAdmin}:any){
 app.get('/v1/config-diagnostics',async(req:any,reply:any)=>{
  if(!await requireAdmin(req,reply))return;const context=await discordContext(true),roles=new Set(context.roles.map((r:any)=>r.id)),channels=new Set([...context.textChannels,...context.voiceChannels,...context.categories].map((c:any)=>c.id)),issues:any[]=[];
  if(context.botCanManageRoles===false)issues.push({module:'Discord',field:'Manage Roles',problem:'The bot cannot manage roles with its current guild permissions'});
  const assignable=new Set(['member_role_id','bom2_member_role_id','afk_role_id','bom2_afk_role_id','trade_role_id','applicant_role_id','trial_role_id','accepted_role_id']);
  roles.add(guildId);
  const tables=['membership_settings','recruitment_settings','pb_discord_settings','guild_settings'] as const;
  for(const table of tables){const row=await oneOrNone<any>(`SELECT * FROM ${table} WHERE guild_id=$1`,[guildId]);if(!row){issues.push({module:table,field:'settings',problem:'Not configured'});continue;}for(const [field,value] of Object.entries(row)){
   if(!value||!(/_role_id$|_role_ids$|_channel_id$|_category_id$/.test(field)))continue;
   let values:any[]=Array.isArray(value)?value:[value];if(typeof value==='string'&&value.startsWith('[')){try{values=JSON.parse(value)}catch{issues.push({module:table,field,problem:'Invalid ID list'});continue;}}
   for(const id of values){if(typeof id!=='string'||!id)continue;const isRole=field.includes('role'),exists=isRole?roles.has(id):channels.has(id);if(!exists)issues.push({module:table,field,id,problem:isRole?'Role no longer exists':'Channel or category no longer exists'});else if(isRole&&assignable.has(field)&&context.botRolePosition!==undefined&&Number(context.roles.find((r:any)=>r.id===id)?.position??0)>=context.botRolePosition)issues.push({module:table,field,id,problem:'Move the bot role above this role so it can assign or remove it'});}
  }}
  const jobs=await many<any>(`SELECT job_type,status,COUNT(*)::int count FROM platform_jobs WHERE guild_id=$1 AND status IN ('FAILED','RUNNING','QUEUED') GROUP BY job_type,status`,[guildId]);
  return {checkedAt:new Date().toISOString(),issues,jobs,limitations:'Checks role/channel existence, guild Manage Roles permission and assignable-role hierarchy. Channel-specific permission overwrites require separate checks.'};
 });
}
