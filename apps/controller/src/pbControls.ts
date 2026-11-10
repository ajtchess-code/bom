import {remindPreferredShips} from './preferredShips.js';
import {ButtonBuilder,ButtonStyle,ActionRowBuilder,ModalBuilder,TextInputBuilder,TextInputStyle} from 'discord.js';
import {deferInteractionReply,editInteractionReply} from './interactionReply.js';
import {legacyPanel,pbRow,pbLink} from './pbPresentation.js';
type Deps={guildId:string;base:string;api:(path:string,uid:string,init?:RequestInit)=>Promise<any>;manager:(i:any)=>Promise<boolean>;refresh:()=>Promise<void>;panel:(kind:string,id:string,page:number,uid:string)=>Promise<any>;officerRole:()=>Promise<string|null>};
export async function handleLegacyPBControls(i:any,d:Deps){
 const id=String(i.customId??'');if(!id.startsWith('pb:'))return false;
 const [,action,battleId,pageId,pageRaw]=id.split(':');
 if((i.isModalSubmit?.()&&action==='create-modal')||(i.isButton?.()&&action==='schedule')){await deferInteractionReply(i,{flags:64});await editInteractionReply(i,{content:'Port Battles are scheduled through the dashboard.',components:d.base?[pbRow(pbLink('Schedule a Port Battle',d.base+'/dashboard/port-battles?schedule=1'))]:[]});return true;}
 if(action==='cancel-modal'&&i.isModalSubmit?.()){
  if(!await d.manager(i)){await i.reply({content:'Only Port Battle managers can cancel battles.',flags:64});return true;}
  await deferInteractionReply(i,{flags:64});await d.api(`/port-battles/${battleId}/cancel`,i.user.id,{method:'POST',body:JSON.stringify({reason:i.fields.getTextInputValue('reason')})});await d.refresh();await editInteractionReply(i,'Port Battle cancelled. Pending reminders are stopped and cancellation notices are queued.');return true;
 }
 if(action==='cancel'&&i.isButton?.()){
  if(!await d.manager(i)){await i.reply({content:'Only Port Battle managers can cancel battles.',flags:64});return true;}
  const data=await d.api(`/port-battles/${battleId}`,i.user.id);if(!['OPEN','CLOSED'].includes(data.battle.status)){await i.reply({content:'This battle is no longer scheduled.',flags:64});return true;}
  await i.showModal(new ModalBuilder().setCustomId(`pb:cancel-modal:${battleId}`).setTitle(`Cancel ${String(data.battle.port_name).slice(0,30)}?`).addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason (captains will be notified)').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1500))));return true;
 }
 if(!i.isButton?.())return false;
 if(!['auto','all','preferences','officers','manage','refresh','mine','leave','panel'].includes(action))return false;
 await deferInteractionReply(i,{flags:64});
 if(action==='preferences'){await editInteractionReply(i,{content:'Manage your preferred ships by rate directly in Discord.',components:[new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('pbprefs:open').setLabel('Manage Preferred Ships').setStyle(ButtonStyle.Primary))]});return true;}
 if(action==='panel'){const page=Number(pageRaw);await editInteractionReply(i,await d.panel(battleId,pageId,Number.isInteger(page)?page:0,i.user.id));return true;}
 if(action==='all'||action==='auto'){
  if(action==='all'&&battleId!==d.guildId)return true;
  const [battles,prefs,cat,config]=await Promise.all([action==='auto'?d.api(`/port-battles/${battleId}`,i.user.id).then(x=>[x.battle]):d.api('/port-battles',i.user.id),d.api('/pb-preferences',i.user.id),d.api('/catalogue',i.user.id),d.api('/pb-config',i.user.id)]);let signed=0;const noShips:string[]=[];const skipped:string[]=[];
  for(const b of (Array.isArray(battles)?battles:[]).filter((b:any)=>b.status==='OPEN')){
   const rate=String(b.rate),profile=prefs.rates?.[rate]??{},valid=new Set((cat.ships??[]).filter((s:any)=>String(s.rate??s.level)===rate&&(!Array.isArray(config.preferredShipCatalog?.[rate])||config.preferredShipCatalog[rate].includes(s.name))).map((s:any)=>s.name)),ships=(profile.ships??[]).filter((s:string)=>valid.has(s));
   if(!ships.length){if(action!=='auto')await remindPreferredShips(i.user,d.base,Number(b.rate));noShips.push(b.id);skipped.push(`${b.port_name}: no saved ships for this rate yet`);continue;}
   try{await d.api(`/port-battles/${b.id}/signup`,i.user.id,{method:'POST',body:JSON.stringify({onlyIfAbsent:true,displayName:i.member?.displayName??i.user.globalName??i.user.username,status:'ATTENDING',ships,preferredShips:(profile.preferred??[]).filter((s:string)=>ships.includes(s)),hornCapable:Boolean(prefs.horn_capable&&prefs.horn_requirements_ack),hornPreferred:Boolean(prefs.horn_preferred&&prefs.horn_capable&&prefs.horn_requirements_ack)})});signed++;}catch(e:any){skipped.push(`${b.port_name}: ${String(e.message??'signup unavailable').slice(0,100)}`);}
  }
  await d.refresh();if(action==='auto'&&noShips.length){await editInteractionReply(i,{content:"You haven't saved ships for this rate yet. Pick them once and 1-Click Signup will work from then on.",components:[new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`pb:form:${noShips[0]}`).setLabel('Choose my ships').setStyle(ButtonStyle.Primary))]});return true;}
    await editInteractionReply(i,`Signed up for **${signed}** ${action==='auto'?'selected':'open'} Port Battle${signed===1?'':'s'} using your saved ships. Existing signups were preserved.${skipped.length?'\n\nSkipped:\n'+skipped.join('\n').slice(0,1500):''}`);return true;
 }
 if(action==='refresh'){await d.refresh();await editInteractionReply(i,'Port Battle signups, rosters and index refreshed.');return true;}
 if(action==='leave'){await d.api(`/port-battles/${battleId}/signup`,i.user.id,{method:'DELETE'});await d.refresh();await editInteractionReply(i,'Your signup, ship choices and confirmation for this Port Battle have been removed.');return true;}
 if(action==='mine'){const detail=await d.api(`/port-battles/${battleId}`,i.user.id),self=(detail.signups??[]).find((s:any)=>String(s.user_id)===String(i.user.id));await editInteractionReply(i,self?`**Your Signup — ${detail.battle.port_name}**\nStatus: ${({ATTENDING:'Attending',LATE:'Running late',WAITLIST:'Waitlist',TENSIONING:'Tensioning (not in PB)'} as any)[self.signup_status]??self.signup_status}${self.late_minutes?` (+${self.late_minutes} min)`:''}\nSelected: ${(self.ships??[]).join(', ')||'None'}\nPreferred: ${(self.preferred_ships??[]).join(', ')||'None'}\nConfirmed: ${self.confirmed_ship||'Awaiting assignment'}\n${[self.horn_duty,self.flare_duty,self.formation,self.commander_duty].filter(Boolean).join(' · ')}`:'You are not signed up for this Port Battle.');return true;}
 if(action==='manage'&&!await d.manager(i)){await editInteractionReply(i,'Only Port Battle managers can manage this battle.');return true;}
 const role=action==='officers'?await d.officerRole():null,title=action==='preferences'?'Preferred Ships':action==='officers'?'Port Battle Officers':'Manage Port Battle';const body=action==='preferences'?'Choose the ships you can sail and your favourites for automatic port battle signups. Save them under My Profile & Ships.':action==='officers'?`Port Battle managers: ${role?`<@&${role}>`:'No manager role configured.'}\nConfigure officer access in Port Battle administration.`:'Sign Up a Player · Confirm · Reassign · Close & AAR · Cancel · Delete · Non-Discord signups\nThe fleet dashboard provides the current management controls, invitations, tactical briefs and assignment history.';
 const path=action==='preferences'?'/dashboard/members':action==='officers'?'/dashboard/admin/port-battles':`/dashboard/port-battles?battle=${battleId}`;
 await editInteractionReply(i,legacyPanel(title,body,{base:d.base,guildId:d.guildId,banner:action==='officers'&&d.base?`${d.base}/wosb/pb/pb-officers-banner.png`:null,rows:d.base?[...(action==='manage'?[new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`pb:cancel:${battleId}`).setStyle(ButtonStyle.Danger).setLabel('Cancel Port Battle'))]:[]),pbRow(pbLink(action==='preferences'?'Open My Profile & Ships':action==='officers'?'Officer Settings':'Open Battle Management',d.base+path))]:[]}));return true;
}
