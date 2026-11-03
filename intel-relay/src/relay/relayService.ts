import {splitContent} from './text.js';
import {createHash} from 'node:crypto';
import {policyFor,priorityForMessage,routeIsPaused} from './policy.js';
import type { Message } from 'discord.js-selfbot-v13';
import type { AppConfig } from '../config/env.js';
import type { RelayDatabase } from '../database/database.js';
import type { Logger } from '../logging/logger.js';
import type { ManagedWebhook } from '../webhooks/webhookClient.js';
import type { AttachmentService } from './attachments.js';
import { shouldRelay } from './filters.js';
import { buildRelayPayload, createOptionsForPart, editOptionsForPart, type BuiltRelayPayload } from './payloadBuilder.js';

export function missingMessage(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === 10008; }
function fileRejected(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (('status' in error && (error.status === 413 || error.status === 400)) || ('code' in error && error.code === 40005));
}
export class RelayService {
  private readonly jobs = new Map<string, Promise<void>>();
  private stopping = false;
  private burstTimer:NodeJS.Timeout|null=null;
  private burst:Array<{message:Message;resolve:()=>void;reject:(e:unknown)=>void}>=[];
  public constructor(private readonly config: AppConfig, private readonly db: RelayDatabase, private readonly webhook: ManagedWebhook, private readonly attachments: AttachmentService, private readonly logger: Logger) {}
  private enqueue(id: string, work: () => Promise<void>): Promise<void> {
    if (this.stopping) return Promise.resolve();
    const next = (this.jobs.get(id) ?? Promise.resolve()).then(work).catch(error => this.logger.error('Relay operation failed; saved mapping retained.', error));
    this.jobs.set(id, next);
    void next.finally(() => { if (this.jobs.get(id) === next) this.jobs.delete(id); });
    return next;
  }
  public create(message: Message): Promise<void> {
    if (!shouldRelay(message, this.config)) return Promise.resolve();
    return this.enqueue(message.id, async () => {
      const hash=this.hash(message);
      if(this.db.getSetting(`deleted:${message.id}`)||this.db.getSetting(`delete:${message.id}`))return;
      if(this.db.fingerprint(message.id)===hash&&this.db.sourceStatus(message.id)==='delivered'){this.db.audit('duplicate_suppressed',message.id);return;}
      const policy=policyFor(this.config.policy),priority=priorityForMessage(message,policy);
      if(!this.stopping&&policy.burstWindowSeconds&&priority.priority===0&&!message.attachments.size&&!message.stickers.size&&!message.embeds.length&&!message.reference)await this.queueBurst(message);else await this.write(message,false);
    });
  }
  public update(message: Message): Promise<void> {
    if (!shouldRelay(message, this.config)) return Promise.resolve();
    const operationKey=this.db.getSetting(`burst-for:${message.id}`)??message.id;
    return this.enqueue(operationKey, async () => {
      if (this.db.getSetting(`deleted:${message.id}`)||!this.db.hasRelay(message.id)) return;
      const groupKey=this.db.getSetting(`burst-for:${message.id}`);if(groupKey&&groupKey!==operationKey){await this.enqueue(groupKey,()=>this.updateBurst(message));return;}
      if(this.db.fingerprint(message.id)===this.hash(message)&&this.db.sourceStatus(message.id)==='delivered'){this.db.audit('duplicate_suppressed',message.id);return;}
      if(this.db.getSetting(`burst-for:${message.id}`)){await this.updateBurst(message);return;}
      await this.write(message, true);
    });
  }
  private hash(message:Message){return createHash('sha256').update(JSON.stringify({content:message.content,edited:message.editedTimestamp,attachments:[...message.attachments.values()].map(a=>[a.id,a.url]),embeds:message.embeds.map(e=>e.toJSON())})).digest('hex');}
  private async write(message:Message,editing:boolean):Promise<void>{
    if(routeIsPaused(this.config)){this.db.audit('delivery_paused',message.id);return;}
    const policy=policyFor(this.config.policy),priority=priorityForMessage(message,policy);
    this.db.recordSource(message,this.hash(message),priority.priority);
    try{
      let payload=await buildRelayPayload(message,this.attachments,{policy,relayLabel:this.config.relayLabel??'Intel Relay'});
      const lastAlert=Number(this.db.getSetting('last_alert_at')??0);
      const alert=priority.priority>0&&policy.alertRoleIds.length>0&&Date.now()-lastAlert>policy.alertCooldownSeconds*1000;
      if(alert){payload.alertRoles=policy.alertRoleIds;this.db.setSetting('last_alert_at',String(Date.now()));}
      try{await this.apply(message,payload,editing);}catch(error){
        if(!payload.files.length||!fileRejected(error))throw error;
        this.db.audit('delivery_attachment_fallback',message.id);
        payload=await buildRelayPayload(message,this.attachments,{urlsOnly:true,policy,relayLabel:this.config.relayLabel??'Intel Relay'});
        await this.apply(message,payload,true);
      }
      if(this.webhook.health?.guildId)this.db.setSetting('destination_guild_id',this.webhook.health.guildId);if(this.webhook.health?.channelId)this.db.setSetting('destination_channel_id',this.webhook.health.channelId);
      this.db.delivery(message.id,'delivered',{parts:this.db.getRelayParts(message.id).map(p=>p.destinationMessageId),destinationLinks:this.db.getRelayParts(message.id).map(p=>`https://discord.com/channels/${this.webhook.health?.guildId??'@me'}/${this.webhook.health?.channelId??'0'}/${p.destinationMessageId}`),sourceAt:message.createdTimestamp});
    }catch(error:any){this.db.delivery(message.id,'failed',{code:error?.code??null,status:error?.status??null,reason:'Destination delivery failed; check route diagnostics.'});throw error;}
  }
  private queueBurst(message:Message):Promise<void>{
    this.db.recordSource(message,this.hash(message),0);
    return new Promise((resolve,reject)=>{this.burst.push({message,resolve,reject});if(this.burst.length>=100){if(this.burstTimer)clearTimeout(this.burstTimer);this.burstTimer=null;void this.flushBurst();}else if(!this.burstTimer){this.burstTimer=setTimeout(()=>{this.burstTimer=null;void this.flushBurst();},policyFor(this.config.policy).burstWindowSeconds*1000);this.burstTimer.unref?.();}});
  }
  private async flushBurst():Promise<void>{
    const pending=this.burst.splice(0),policy=policyFor(this.config.policy);
    const groups=new Map<string,typeof pending>();for(const item of pending){const key=`${item.message.channel.id}:${item.message.author.id}`;groups.set(key,[...(groups.get(key)??[]),item]);}
    for(const group of groups.values()){
      if(routeIsPaused(this.config)){for(const item of group){this.db.delivery(item.message.id,'paused');item.resolve();}continue;}
      try{
        if(group.length<policy.burstThreshold){for(const item of group)await this.write(item.message,false);}
        else{
          const first=group[0]!.message,groupId=first.id;
          const entries=group.map(({message:m})=>({id:m.id,author:m.member?.displayName??m.author.username,content:m.content,url:m.url,sourceAt:m.createdTimestamp,deleted:false}));
          this.db.setSetting(`burst:${groupId}`,JSON.stringify(entries));
          const digest=this.burstMessage(first,entries);await this.write(digest,false);
          const ids=this.db.getRelayParts(groupId).map(p=>p.destinationMessageId);
          for(const {message:m} of group){this.db.recordSource(m,this.hash(m),0);this.db.replaceRelayParts(m.id,m.channel.id,m.guild!.id,ids);this.db.setSetting(`burst-for:${m.id}`,groupId);this.db.delivery(m.id,'delivered',{burst:groupId});}
          this.db.audit('burst_summary',groupId,{messages:group.length});
        }
        for(const item of group)item.resolve();
      }catch(error){for(const item of group){this.db.audit('delivery_burst_failed',item.message.id);item.reject(error);}}
    }
  }
  private burstMessage(first:Message,entries:any[]):Message{
    const content=`**Activity summary · ${entries.length} messages**\n`+entries.map(e=>`• **${String(e.author).replace(/[\*_`]/g,'')}** <t:${Math.floor((e.sourceAt??Date.now())/1000)}:T>: ${e.deleted?'[source deleted]':String(e.content||'[attachment]').slice(0,700)}\n  [Open Source](${e.url})`).join('\n');
    return new Proxy(first,{get(target,key){if(key==='content')return content;if(key==='embeds')return [];if(key==='attachments')return new Map();return Reflect.get(target,key,target)}});
  }
  private async updateBurst(message:Message,deleted=false):Promise<void>{
    const groupId=this.db.getSetting(`burst-for:${message.id}`);if(!groupId)return;
    const entries=JSON.parse(this.db.getSetting(`burst:${groupId}`)??'[]');
    for(const e of entries)if(e.id===message.id){e.content=message.content;e.deleted=deleted;}
    const anchor=new Proxy(message,{get(target,key){if(key==='id')return groupId;return Reflect.get(target,key,target)}});
    const payload=await buildRelayPayload(this.burstMessage(anchor,entries),this.attachments,{policy:policyFor(this.config.policy),relayLabel:this.config.relayLabel??'Intel Relay'});
    await this.apply(anchor,payload,true);
    const ids=this.db.getRelayParts(groupId).map(p=>p.destinationMessageId);for(const entry of entries)this.db.replaceRelayParts(entry.id,message.channel.id,message.guild!.id,ids);
    this.db.setSetting(`burst:${groupId}`,JSON.stringify(entries));
    this.db.recordSource(message,this.hash(message),0);this.db.delivery(message.id,'delivered',{burst:groupId,edited:true});
  }
  private async apply(message: Message, payload: BuiltRelayPayload, editing: boolean): Promise<void> {
    const ids = this.db.getRelayParts(message.id).map(p => p.destinationMessageId);
    const persist = () => this.db.replaceRelayParts(message.id, message.channel.id, message.guild!.id, ids);
    let previous:any=null;try{previous=JSON.parse(this.db.getSetting(`relay-identity:${message.id}`)??'null');}catch{}
    const identityStyleKey=`relay-author-style:${message.id}`;
    const changeIdentity=ids.length>0&&(this.db.getSetting(identityStyleKey)!=='author-v2'||!previous||previous.username!==payload.username||previous.avatarURL!==payload.avatarURL);
    const retiredKey=`relay-retired:${message.id}`;
    let retired:string[]=[];try{retired=JSON.parse(this.db.getSetting(retiredKey)??'[]');}catch{}

    for (let index = 0; index < payload.chunks.length; index++) {
      const old = ids[index];
      if(old&&changeIdentity){
        // Discord message edits cannot change a webhook message's sender identity.
        const replacement=(await this.webhook.send(createOptionsForPart(payload,index),payload.priority??0)).id;
        retired.push(old);this.db.setSetting(retiredKey,JSON.stringify(retired));
        ids[index]=replacement;persist();
        this.db.audit('relay_identity_refreshed',message.id,{part:index});
      } else if (old) {
        try { await this.webhook.edit(old, editOptionsForPart(payload, index),payload.priority??0); }
        catch (error) {
          if (!missingMessage(error)) throw error;
          ids[index] = (await this.webhook.send(createOptionsForPart(payload, index),payload.priority??0)).id;
          persist();
        }
      } else {
        ids.push((await this.webhook.send(createOptionsForPart(payload, index),payload.priority??0)).id);
        persist(); // Keep each successfully sent part even if a later request fails.
      }
    }
    while (ids.length > payload.chunks.length) {
      try { await this.webhook.delete(ids[ids.length - 1]!); } catch (error) { if (!missingMessage(error)) throw error; }
      ids.pop(); persist();
    }
    this.db.setSetting(`relay-identity:${message.id}`,JSON.stringify({username:payload.username,...(payload.avatarURL?{avatarURL:payload.avatarURL}:{})}));
    this.db.setSetting(identityStyleKey,'author-v2');
    const remaining:string[]=[];
    for(const old of retired){try{await this.webhook.delete(old);}catch(error){if(!missingMessage(error))remaining.push(old);}}
    if(remaining.length){this.db.setSetting(retiredKey,JSON.stringify(remaining));this.db.audit('relay_identity_cleanup_pending',message.id,{parts:remaining.length});}else this.db.deleteSetting(retiredKey);
    this.db.audit(editing ? 'relay_update' : 'relay_create', message.id, { parts: ids.length });
  }
  public delete(id: string): Promise<void> {
    if(routeIsPaused(this.config)||(!this.db.hasRelay(id)&&!this.jobs.has(id)))return Promise.resolve();
    this.db.setSetting(`delete:${id}`, 'pending');
    const operationKey=this.db.getSetting(`burst-for:${id}`)??id;
    return this.enqueue(operationKey, async () => {
      const actualGroup=this.db.getSetting(`burst-for:${id}`);if(actualGroup&&actualGroup!==operationKey){await this.delete(id);return;}
      const burstId=this.db.getSetting(`burst-for:${id}`);
      if(burstId){
        const entries=JSON.parse(this.db.getSetting(`burst:${burstId}`)??'[]');for(const e of entries)if(e.id===id)e.deleted=true;
        const retained=policyFor(this.config.policy).deletionMode==='remove'?entries.filter((e:any)=>e.id!==id):entries;
        const content='**Activity summary**\n'+retained.map((e:any)=>`• ${e.author}: ${e.deleted?'[source deleted]':String(e.content).slice(0,700)}\n  [Open Source](${e.url})`).join('\n');
        const record=this.db.sourceRecord(id);
        if(record){const anchor={id:burstId,channel:{id:record.channel_id},guild:{id:record.guild_id}} as Message;
          const identity=JSON.parse(this.db.getSetting(`relay-identity:${burstId}`)??'{}');
          await this.apply(anchor,{chunks:splitContent(content,1900),username:identity.username??'Message Relay',...(identity.avatarURL?{avatarURL:identity.avatarURL}:{}),embeds:[],files:[]},true);
          const ids=this.db.getRelayParts(burstId).map(p=>p.destinationMessageId);for(const entry of entries)this.db.replaceRelayParts(entry.id,record.channel_id,record.guild_id,ids);
        }
        this.db.setSetting(`burst:${burstId}`,JSON.stringify(entries));this.db.markDeleted(id);this.db.setSetting(`deleted:${id}`,'1');this.db.deleteSetting(`delete:${id}`);return;
      }
      if(policyFor(this.config.policy).deletionMode==='mark'){
        for(const part of this.db.getRelayParts(id))await this.webhook.edit(part.destinationMessageId,{content:'**Source message deleted** · retained as an Intel history marker.',embeds:[],attachments:[],allowedMentions:{parse:[]}});
        this.db.markDeleted(id);this.db.setSetting(`deleted:${id}`,'1');this.db.deleteSetting(`delete:${id}`);this.db.delivery(id,'deleted',{mode:'mark'});return;
      }
      for (const part of this.db.getRelayParts(id)) {
        try { await this.webhook.delete(part.destinationMessageId); } catch (error) { if (!missingMessage(error)) throw error; }
      }
      this.db.markDeleted(id);this.db.setSetting(`deleted:${id}`,'1');
      this.db.deleteRelay(id);
      this.db.deleteSetting(`delete:${id}`);
      this.db.audit('relay_delete', id);this.db.delivery(id,'deleted',{mode:'remove'});
    });
  }
  public async retryDeletes(): Promise<void> { await Promise.all(this.db.pendingDeletes().map(id => this.delete(id))); }
  public async stop(): Promise<void> { this.stopping=true;if(this.burstTimer)clearTimeout(this.burstTimer);this.burstTimer=null;await this.flushBurst();await Promise.all(this.jobs.values()); }
}
