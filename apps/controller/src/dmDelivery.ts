import {recordDmDelivery,discordDmsMuted,muteDiscordDms} from '@bom/db';
import {DM_MUTE_PREFIX,DM_MUTE_HOURS,withDmMute} from '@bom/shared';

export async function sendBotDm(recipient:any,payload:any) {
  const uid=String(recipient.id);
  if(await discordDmsMuted(uid)){await recordDmDelivery(uid,'controller','MUTED');throw new Error('suppressed_by_dm_mute');}
  try{const message=await recipient.send(withDmMute(payload,uid));await recordDmDelivery(uid,'controller','SENT',String(message.id));return message;}
  catch(e:any){await recordDmDelivery(uid,'controller',Number(e.code)===50007?'BLOCKED':'FAILED',undefined,String(e.code??'delivery_error'));throw e;}
}

/** Installed separately so DM controls run before any guild-only routing. */
export function installDmMuteControls(client:any) {
  client.on('interactionCreate',async(i:any)=>{
    if(!i.isButton?.()||!String(i.customId).startsWith(DM_MUTE_PREFIX))return;
    try {
      const [action,owner]=String(i.customId).slice(DM_MUTE_PREFIX.length).split(':');
      if(i.guildId||owner!==String(i.user.id)) {
        await i.reply({content:'This DM control belongs to its recipient.',flags:64});return;
      }
      if(action==='open') {
        await i.reply({content:'How long would you like to mute all bot DMs?',components:[{type:1,components:DM_MUTE_HOURS.map(hours=>({type:2,style:2,label:`${hours} hour${hours===1?'':'s'}`,custom_id:`${DM_MUTE_PREFIX}${hours}:${owner}`}))}]});return;
      }
      const hours=Number(action);
      if(!(DM_MUTE_HOURS as readonly number[]).includes(hours)) {
        await i.reply({content:'Choose 1, 3, 12, or 24 hours.'});return;
      }
      await i.deferUpdate();
      const until=await muteDiscordDms(owner,hours);
      await i.editReply({content:`Bot DMs are muted until <t:${Math.floor(until.getTime()/1000)}:F> (<t:${Math.floor(until.getTime()/1000)}:R>). Messages skipped while muted will not be resent.`,components:[]});
    }catch(error) {
      console.error('[dm-mute] control failed',error);
      const body={content:'Unable to save your DM mute. Please try again.',components:[]};
      if(i.deferred||i.replied)await i.editReply(body).catch(()=>{});
      else await i.reply(body).catch(()=>{});
    }
  });
}
