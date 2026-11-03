/** Wire-format controls work in discord.js and direct Discord REST sends. */
export const DM_MUTE_HOURS = [1, 3, 12, 24] as const;
export const DM_MUTE_PREFIX = 'bom:dm-mute:';
export function dmMuteRow(userId:string) {
  return {type:1, components:[{type:2, style:2, label:'Mute DMs', custom_id:`${DM_MUTE_PREFIX}open:${userId}`}]};
}
export function withDmMute(payload:any,userId:string) {
  const body=typeof payload==='string'?{content:payload}:{...payload};
  const rows=(body.components??[]).map((c:any)=>c.toJSON?c.toJSON():c);
  if(rows.some((r:any)=>r.components?.some((c:any)=>String(c.custom_id??'').startsWith(DM_MUTE_PREFIX))))return {...body,components:rows};
  const mute=dmMuteRow(userId);
  // Preserve every existing control, including a full five-row legacy message.
  if(rows.length>=5 && !(Number(body.flags??0)&32768)) {
    const index=rows.findIndex((r:any)=>r.type===1&&r.components?.length<5&&r.components.every((c:any)=>c.type===2));
    if(index<0)throw new Error('DM controls have no room for Mute DMs');
    rows[index]={...rows[index],components:[...rows[index].components,...mute.components]};
  }else rows.push(mute);
  return {...body,components:rows};
}
