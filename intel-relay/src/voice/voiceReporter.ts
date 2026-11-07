import type {Client,Guild} from 'discord.js-selfbot-v13';
import type {AppConfig} from '../config/env.js';
import type {RelayDatabase} from '../database/database.js';
import type {Logger} from '../logging/logger.js';
import type {ManagedWebhook} from '../webhooks/webhookClient.js';
import {missingMessage} from '../relay/relayService.js';
import {renderVoiceCards,type VoiceCardChannel} from './voiceCard.js';
import {truncate} from '../relay/text.js';
import {channelDecision,policyFor,routeIsPaused,messagePriority} from '../relay/policy.js';
export function voiceChanges(before:VoiceCardChannel[],after:VoiceCardChannel[]):string[]{
 const map=(rows:VoiceCardChannel[])=>new Map(rows.flatMap(c=>c.members.map(m=>[c.guildId+':'+m.id,{name:m.name,channel:c.channelName,id:c.channelId}])));
 const old=map(before),next=map(after),changes:string[]=[];
 for(const [id,item] of next){const previous=old.get(id);if(!previous)changes.push(`Joined: ${item.name} → ${item.channel}`);else if(previous.id!==item.id)changes.push(`Moved: ${item.name} · ${previous.channel} → ${item.channel}`);}
 for(const [id,item] of old)if(!next.has(id))changes.push(`Left: ${item.name} · ${item.channel}`);
 return changes;
}
export class VoiceReporter{
 private timer:NodeJS.Timeout|null=null;private tail:Promise<void>=Promise.resolve();private stopped=false;
 public health={lastSampleAt:null as string|null,lastDeliveryAt:null as string|null,stale:false,error:null as string|null,pages:0};
 public constructor(private readonly client:Client,private readonly config:AppConfig,private readonly db:RelayDatabase,private readonly webhook:ManagedWebhook|null,private readonly logger:Logger,private readonly relayLabel='Intel Relay'){}
 public schedule(){if(!this.webhook||this.stopped)return;if(this.timer)clearTimeout(this.timer);this.timer=setTimeout(()=>{this.timer=null;void this.sync()},this.config.voiceDebounceMs??10000);this.timer.unref?.();}
 public sync(force=false):Promise<void>{if(this.stopped||routeIsPaused(this.config))return Promise.resolve();const next=this.tail.then(()=>this.performSync(force));this.tail=next.catch((e:any)=>{const reason=String(e?.code==='ENOSPC'?'The server disk is full.':e?.message??e).slice(0,300);this.health.error=`Voice delivery failed: ${reason}`;this.logger.error('Voice refresh failed; will retry.',{reason,code:e?.code??null});});return this.tail;}
 private async performSync(force=false){
  if(!this.webhook||this.webhook.disabled)return;
  const policy=policyFor(this.config.policy),now=Date.now();
  const connected=this.config.sourceAvailable?.()??(typeof this.client.isReady==='function'?this.client.isReady():true);
  const guilds=this.voiceGuilds(),available=connected&&(guilds.length>0||this.client.guilds.cache.size===0);
  const previousRaw=this.db.getSetting('voice_status_snapshot');let previous:VoiceCardChannel[]=[];try{previous=JSON.parse(previousRaw??'[]')}catch{}
  const snapshot=available?this.getSnapshot(guilds):previous,serialized=JSON.stringify(snapshot);
  this.health.stale=!available;this.health.error=available?null:'Source connection unavailable; showing last observed voice state.';
  if(available){this.health.lastSampleAt=new Date(now).toISOString();this.db.setSetting('voice_last_sample_at',this.health.lastSampleAt);}
  let ids:string[]=[];try{ids=JSON.parse(this.db.getSetting('voice_status_message_ids')??'[]')}catch{}
  const legacy=this.db.getSetting('voice_status_message_id');if(!ids.length&&legacy)ids=[legacy];
  const username=[...this.relayLabel.trim()].slice(0,80).join('')||'Intel Relay',identity='voice-v3:'+username;
  if(ids.length&&this.db.getSetting('voice_status_identity')!==identity){for(const id of ids){try{await this.webhook.delete(id)}catch(error){if(!missingMessage(error))throw error;}}ids=[];this.saveIds(ids);}
  const mode=available?'live':'stale',lastDelivery=Number(this.db.getSetting('voice_last_delivery_at')??0);
  if(!force&&serialized===previousRaw&&ids.length&&this.db.getSetting('voice_status_mode')===mode&&now-lastDelivery<policy.staleAfterSeconds*1000)return;
  const changes=voiceChanges(previous,snapshot),total=snapshot.reduce((n,c)=>n+c.members.length,0),lastObserved=this.db.getSetting('voice_last_sample_at');
  const footer={text:`${available?'Observed':'STALE · source unavailable'} ${lastObserved??'unknown'} · ${total} in voice`};
  const common={allowedMentions:{parse:[] as never[]},attachments:[]};
  const payloads:any[]=[];
  if(!snapshot.length)payloads.push({...common,content:null,embeds:[{title:available?'No One In Voice':'Voice data unavailable',description:available?undefined:'Source connection is unavailable. This does not mean everyone disconnected.',color:available?0x2C313A:0xED4245,footer,author:{name:username}}]});
  else{
   try{
    const cards=await renderVoiceCards(snapshot,{label:username,showStatus:policy.voiceShowStatus,pageChannels:policy.voicePageChannels});
    // Each page has its own stable destination message; no occupied channels are discarded.
    for(let i=0;i<cards.files.length;i++){const file=cards.files[i]!;payloads.push({...common,content:i===0&&changes.length?truncate(changes.join('\n'),1800):null,files:[file],embeds:[{title:`${username} · Voice ${i+1}/${cards.files.length}${available?'':' · STALE'}`,color:available?0xD9AA3C:0xED4245,image:{url:'attachment://'+file.name},footer}]});}
   }catch{
    this.logger.warn('Voice artwork unavailable; using complete text pages.');
    const blocks=snapshot.map(c=>`**${c.guildName} / ${c.channelName} · ${c.members.length}**\n`+c.members.map(m=>`• ${m.name}`).join('\n'));
    const text=blocks.join('\n\n');for(let start=0;start<text.length;start+=1800)payloads.push({...common,content:text.slice(start,start+1800),embeds:[{title:`${username} · ${available?'Voice':'STALE voice state'}`,color:available?0xD9AA3C:0xED4245,footer}]});
   }
  }
  for(let page=0;page<payloads.length;page++){
   const id=ids[page];if(id){try{await this.webhook.edit(id,payloads[page]);continue}catch(error){if(!missingMessage(error))throw error;}}
   ids[page]=(await this.webhook.send({...payloads[page],username})).id;this.saveIds(ids);
  }
  for(const id of ids.slice(payloads.length)){try{await this.webhook.delete(id)}catch(error){if(!missingMessage(error))throw error;}}
  ids=ids.slice(0,payloads.length);this.saveIds(ids);this.db.setSetting('voice_status_snapshot',serialized);this.db.setSetting('voice_status_identity',identity);this.db.setSetting('voice_status_mode',mode);this.db.setSetting('voice_last_delivery_at',String(now));
  this.health.lastDeliveryAt=new Date(now).toISOString();this.health.pages=ids.length;
  this.db.audit?.('voice_delivered',undefined,{pages:ids.length,participants:total,changes:changes.length,stale:!available});
 }
 private saveIds(ids:string[]){this.db.setSetting('voice_status_message_ids',JSON.stringify(ids));if(ids[0])this.db.setSetting('voice_status_message_id',ids[0]);else this.db.deleteSetting('voice_status_message_id');}
 public async stop(){this.stopped=true;if(this.timer)clearTimeout(this.timer);this.timer=null;await this.tail;}
 private voiceGuilds():Guild[]{return [...this.client.guilds.cache.values()].filter(g=>this.config.voiceGuildIds?.has(g.id));}
 private getSnapshot(guilds:Guild[]):VoiceCardChannel[]{
  const snapshot:VoiceCardChannel[]=[];
  for(const guild of guilds){
   const channels=[...guild.channels.cache.values()].filter(c=>c.isVoice()).sort((a,b)=>('rawPosition' in a?a.rawPosition:0)-('rawPosition' in b?b.rawPosition:0));
   for(const channel of channels){if(!channel.isVoice())continue;
    if(!channelDecision({id:channel.id,name:channel.name,type:channel.type,guild,parentId:channel.parentId,parent:channel.parent,isThread:()=>false},{...this.config,relayGuildIds:this.config.voiceGuildIds,autoChannels:true}).included)continue;
    const self=this.client.user?guild.members?.cache?.get(this.client.user.id):null;
    if(self&&channel.permissionsFor&&!channel.permissionsFor(self)?.has('VIEW_CHANNEL'))continue;
    const members=[...guild.voiceStates.cache.values()].filter(s=>s.channelId===channel.id).map(s=>({id:s.id,name:s.member?.displayName??this.client.users?.cache.get(s.id)?.username??s.id,avatar:s.member?.displayAvatarURL?.({format:'png',size:64})??'',muted:Boolean(s.selfMute||s.serverMute),deafened:Boolean(s.selfDeaf||s.serverDeaf),streaming:Boolean(s.streaming),priority:messagePriority(s.member?.displayName??this.client.users?.cache.get(s.id)?.username??s.id,policyFor(this.config.policy)).priority})).sort((a,b)=>a.name.localeCompare(b.name));
    if(members.length)snapshot.push({guildId:guild.id,guildName:guild.name,channelId:channel.id,channelName:channel.name,members});
   }
  }
  return snapshot;
 }
}
