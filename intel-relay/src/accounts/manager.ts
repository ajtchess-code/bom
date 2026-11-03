import {routePolicySchema,policyFor,routeIsPaused,channelDecision} from '../relay/policy.js';
import {buildRelayPayload} from '../relay/payloadBuilder.js';
import {primarySourceGuilds} from './sourceGuilds.js';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import type { Client } from 'discord.js-selfbot-v13';
import { createDiscordClient } from '../bot/client.js';
import { registerEvents } from '../bot/events/registerEvents.js';
import type { AppConfig } from '../config/env.js';
import { RelayDatabase } from '../database/database.js';
import { Logger } from '../logging/logger.js';
import { AttachmentService } from '../relay/attachments.js';
import { RelayService } from '../relay/relayService.js';
import { VoiceReporter } from '../voice/voiceReporter.js';
import { ManagedWebhook } from '../webhooks/webhookClient.js';
import { AccountStore, type Account, type SubRelay } from './store.js';
const webhook = z.string().regex(/^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d+\/[\w-]+$/);
const ids = z.array(z.string().regex(/^\d{15,22}$/)).max(5000);
export const subRelayInput=z.object({policy:routePolicySchema.default(policyFor({})),paused:z.boolean().default(false),pausedUntil:z.number().int().min(0).default(0),id:z.string().uuid().optional(),name:z.string().trim().min(1).max(80),guildId:z.string().regex(/^\d{15,22}$/),webhook,voiceWebhook:z.union([webhook,z.literal('')]).default(''),channels:ids.default([]),excludedChannels:ids.default([]),autoChannels:z.boolean().default(false),ignoreBots:z.boolean().default(false),enabled:z.boolean().default(true)});
const input = z.object({ policy:routePolicySchema.default(policyFor({})),paused:z.boolean().default(false),pausedUntil:z.number().int().min(0).default(0),monitoredGuildIds:ids.optional(),autoChannels:z.boolean().default(false), guildId:z.union([z.string().regex(/^\d{15,22}$/),z.literal('')]).default(''),subRelays:z.array(subRelayInput).max(50).default([]), name: z.string().trim().min(1).max(80), token: z.string().trim().min(20).max(512), webhook, voiceWebhook: z.union([webhook, z.literal('')]).default(''), channels: ids.default([]), excludedChannels: ids.default([]), voiceGuilds: ids.default([]), ignoreBots: z.boolean().default(false), enabled: z.boolean().default(false) });
interface Runtime { routeId:string; config:AppConfig; children:Runtime[]; client: Client; db: RelayDatabase; relay: RelayService; voice: VoiceReporter; hooks: ManagedWebhook[]; unregister: () => void; status: string; error: string | null; }
export class AccountManager {
  private accounts: Account[];
  private readonly controlDb:RelayDatabase;
  private running = new Map<string, Runtime>();
  private searchAfter = new Map<string, number>();
  private tail: Promise<unknown> = Promise.resolve();
  public constructor(private store: AccountStore, private logger: Logger) { this.accounts = store.load();this.controlDb=new RelayDatabase(path.join(store.directory,'intel-control.sqlite')); }
  private mutate<T>(fn: () => Promise<T>): Promise<T> { const p = this.tail.then(fn); this.tail = p.catch(() => undefined); return p; }
  private routeStatus(a:Account,s?:SubRelay){
    const r=this.running.get(a.id), enabled=a.enabled&&(s?.enabled??true), guildId=s?.guildId??a.guildId;
    const connected=Boolean(r?.client.isReady()),available=!guildId||Boolean(r?.client.guilds.cache.has(guildId));
    const route=s?r?.children?.find(c=>c.routeId===s.id):r;
    const hasSources=s||guildId?true:(a.monitoredGuildIds?.length??a.channels.length)>0;
    const paused=routeIsPaused(s??a),delayed=route?.hooks?.some(h=>h.pending>0&&h.health.lastAttempt&&Date.now()-Date.parse(h.health.lastAttempt)>60000),permissionMissing=route?.hooks?.some(h=>h.health.error?.includes('permission')),deliveryError=route?.hooks?.some(h=>h.health.state==='error'||h.health.state==='blocked');
    return {paused,pausedUntil:(s??a).pausedUntil??0,voiceHealth:route?.voice?.health??null,sourceReadOnly:true,destinationGuildIds:(process.env.DESTINATION_GUILD_IDS??'').split(',').filter(Boolean),delivery:route?.hooks?.map((h,i)=>({kind:i?'voice':'relay',...h.health}))??[],active:enabled&&connected&&available&&hasSources&&!paused&&!deliveryError,status:!enabled?'disabled':paused?'paused':!connected?(r?.status??'stopped'):!available?'server_unavailable':!hasSources?'no_sources':permissionMissing?'permission_missing':deliveryError?'delivery_error':delayed?'delayed':'active',sharedConnection:true};
  }
  public list() { return this.accounts.map(a => ({ id: a.id, name: a.name,policy:policyFor(a.policy),paused:a.paused??false,pausedUntil:a.pausedUntil??0,monitoredGuildIds:primarySourceGuilds(a,this.running.get(a.id)?.client??{guilds:{cache:new Map()}}), guildId:a.guildId??'',subRelays:(a.subRelays??[]).map(s=>({id:s.id,name:s.name,guildId:s.guildId,policy:policyFor(s.policy),channels:s.channels,excludedChannels:s.excludedChannels,enabled:s.enabled,autoChannels:s.autoChannels??false,ignoreBots:s.ignoreBots??false,...this.routeStatus(a,s),hasWebhook:Boolean(s.webhook),hasVoiceWebhook:Boolean(s.voiceWebhook)})), autoChannels:a.autoChannels??false,routeStatus:this.routeStatus(a),enabled: a.enabled, ignoreBots: a.ignoreBots, channels: a.channels, excludedChannels: a.excludedChannels, voiceGuilds: a.voiceGuilds, hasToken: true, hasWebhook: Boolean(a.webhook), hasVoiceWebhook: Boolean(a.voiceWebhook), status: this.running.get(a.id)?.status ?? 'stopped', connected: this.running.get(a.id)?.client.isReady() ?? false, error: this.running.get(a.id)?.error ?? null, username: this.running.get(a.id)?.client.user?.username ?? null })); }
  public initialize(): Promise<void> { return this.mutate(async () => { for (const a of this.accounts) if (a.enabled) await this.start(a); }); }
  public save(id: string | null, raw: unknown,actor='dashboard',restoring=false): Promise<string> { return this.mutate(async () => {
    const old = id ? this.accounts.find(a => a.id === id) : undefined;
    if (id && !old) throw new Error('Account not found.');
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('Invalid account input.');
    const body = raw as Record<string, unknown>;
    const rawSubs=body.subRelays===undefined?old?.subRelays??[]:body.subRelays;
    if(!Array.isArray(rawSubs))throw new Error('Invalid sub-relays.');
    const subRelays=rawSubs.map((s:any)=>{const prev=(old?.subRelays??[]).find(x=>x.id===s.id)??(restoring?s:undefined);if(s.id&&!prev)throw new Error('Sub-relay not found.');return {...prev,...s,id:prev?.id??randomUUID(),webhook:s.webhook||prev?.webhook,voiceWebhook:s.clearVoiceWebhook?'':s.voiceWebhook||prev?.voiceWebhook||''};});
    const next = input.parse({ ...old, ...body,subRelays, token: body.token || old?.token, webhook: body.webhook || old?.webhook, voiceWebhook: body.clearVoiceWebhook ? '' : body.voiceWebhook || old?.voiceWebhook || '' });
    if (this.accounts.some(a => a.id !== id && a.token === next.token)) throw new Error('This token is already configured.');
    const sources=[...(next.guildId?[next.guildId]:next.monitoredGuildIds??[]),...next.subRelays.map(s=>s.guildId)];if(new Set(sources).size!==sources.length)throw new Error('Each source server must have one route.');
    const proposed=[{...next,id:'primary'},...next.subRelays];
    for(const other of this.accounts.filter(a=>a.id!==id))for(const otherRoute of [other,...(other.subRelays??[])])for(const route of proposed){
      const sameDestination=route.webhook===otherRoute.webhook;
      const routeSources=route.guildId?[route.guildId]:next.monitoredGuildIds??[];
      const otherSources=otherRoute.guildId?[otherRoute.guildId]:other.monitoredGuildIds??[];
      if(sameDestination&&(routeSources.some(source=>otherSources.includes(source))||route.channels.some(channel=>otherRoute.channels.includes(channel))))throw new Error('Overlapping routes to the same destination are not allowed.');
    }
    const account: Account = { ...next,subRelays:next.subRelays.map(s=>({...s,id:s.id!})), id: old?.id ?? randomUUID() };
    if (old) await this.stop(old.id);
    const nextAccounts = [...this.accounts.filter(a => a.id !== account.id), account];
    if(old)this.recordRevision(old,actor);
    this.store.save(nextAccounts); this.accounts = nextAccounts;
    this.recordRevision(account,actor);
    if (account.enabled) await this.start(account);
    return account.id;
  }); }
  public remove(id: string): Promise<void> { return this.mutate(async () => { if (!this.accounts.some(a => a.id === id)) throw new Error('Account not found.'); await this.stop(id); const remaining = this.accounts.filter(a => a.id !== id); this.store.save(remaining); this.accounts = remaining; }); }
  public toggle(id: string, enabled: boolean): Promise<void> { return this.mutate(async () => {
    const a = this.accounts.find(a => a.id === id); if (!a) throw new Error('Account not found.');
    await this.stop(id); a.enabled = enabled; this.store.save(this.accounts); if (enabled) await this.start(a);
  }); }
  private async start(a: Account): Promise<void> {
    this.logger.protect(a.token); this.logger.protect(a.webhook); this.logger.protect(a.voiceWebhook);
    const client = createDiscordClient();
    client.on('ready',()=>{const sources=primarySourceGuilds(a,client);r.config.relayGuildIds=new Set(sources.length?sources:['0']);for(const route of [r,...r.children])for(const hook of route.hooks)hook.blockSourceGuilds([...sources,...(a.subRelays??[]).map(s=>s.guildId)]);const excluded=new Set((a.subRelays??[]).map(s=>s.guildId));const voices=(a.voiceGuilds.length?a.voiceGuilds:sources).filter(id=>!excluded.has(id));r.config.voiceGuildIds=new Set(voices.length?voices:['0']);if(a.monitoredGuildIds===undefined&&!a.guildId){a.monitoredGuildIds=sources;this.store.save(this.accounts);}});
    const buildRoute=(route:{id:string;name:string;guildId?:string;webhook:string;voiceWebhook:string;channels:string[];excludedChannels:string[];autoChannels?:boolean;ignoreBots?:boolean;voiceGuilds?:string[]}):Runtime=>{
      this.logger.protect(route.webhook);this.logger.protect(route.voiceWebhook);
      const destination=createHash('sha256').update(route.webhook+'|'+route.voiceWebhook+'|'+(route.guildId??'')).digest('hex').slice(0,16);
      const legacyDestination=createHash('sha256').update(a.webhook+'|'+a.voiceWebhook).digest('hex').slice(0,16);const db=new RelayDatabase(path.join(this.store.directory,route.id==='primary'&&!a.guildId?`${a.id}-${legacyDestination}.sqlite`:`${a.id}-${route.id}-${destination}.sqlite`));
      const config:AppConfig={policy:policyFor((route as any).policy),relayLabel:route.name,paused:(route as any).paused??false,pausedUntil:(route as any).pausedUntil??0,sourceAvailable:()=>client.isReady()&&[...config.voiceGuildIds].some(id=>client.guilds.cache.has(id)),autoChannels:route.autoChannels??false,discordToken:a.token,relayWebhookUrl:route.webhook,voiceWebhookUrl:route.voiceWebhook||null,relayGuildIds:new Set(route.guildId?[route.guildId]:['0']),relayChannelIds:new Set(route.channels),excludedChannelIds:new Set(route.excludedChannels),voiceGuildIds:new Set(route.guildId?[route.guildId]:route.voiceGuilds??[]),ignoreBots:route.ignoreBots??a.ignoreBots,voiceDebounceMs:10000,mappingRetentionDays:90,maxAttachmentBytes:10*1024*1024};
      const destinationPolicy={allowedGuildIds:new Set((process.env.DESTINATION_GUILD_IDS??'').split(',').map(s=>s.trim()).filter(Boolean)),blockedGuildIds:new Set(route.guildId?[route.guildId]:primarySourceGuilds(a,client))};
      const hook=new ManagedWebhook(route.webhook,this.logger,'relay',destinationPolicy),voiceHook=route.voiceWebhook?new ManagedWebhook(route.voiceWebhook,this.logger,'voice',destinationPolicy):null;
      for(const h of [hook,...(voiceHook?[voiceHook]:[])])h.onEvent=(event,details)=>db.audit(event,undefined,details);
      const relay=new RelayService(config,db,hook,new AttachmentService(config.maxAttachmentBytes,this.logger),this.logger),voice=new VoiceReporter(client,config,db,voiceHook,this.logger,route.name);
      return {routeId:route.id,config,client,db,relay,voice,hooks:[hook,...(voiceHook?[voiceHook]:[])],unregister:registerEvents(client,config,db,relay,voice,this.logger),status:'connecting',error:null,children:[]};
    };
    const r=buildRoute({...a,id:'primary'});
    r.children=(a.subRelays??[]).filter(s=>s.enabled).map(s=>buildRoute(s));
    this.running.set(a.id,r);
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([client.login(a.token), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Login timed out')), 30_000); })]);
      if (client.user?.bot) throw new Error('Expected a user account');
      r.status = 'connected';for(const child of r.children){child.status='connected';await child.voice.sync(true);}
    } catch {
      await this.stop(a.id);
      // A stopped diagnostic entry exposes no credential or upstream error body.
      r.status = 'error';for(const child of r.children)child.status='error'; r.error = 'Login failed or timed out. Check the account token and host connectivity.';
      this.running.set(a.id, r);
      r.unregister = () => undefined;
    } finally { if (timer) clearTimeout(timer); }
  }
  public async stop(id: string): Promise<void> {
    const r = this.running.get(id); if (!r) return;
    this.running.delete(id);
    if (r.status === 'error') return;
    for(const route of [r,...r.children]){route.unregister();await Promise.all([route.relay.stop(),route.voice.stop()]);for(const hook of route.hooks)hook.destroy();route.db.close();}r.client.destroy();
  }
  public guilds(id: string) { const r = this.running.get(id); if (!r?.client.isReady()) throw new Error('Connect this account first.'); return [...r.client.guilds.cache.values()].map(g => ({ id: g.id, name: g.name })).sort((a,b) => a.name.localeCompare(b.name)); }
  public async channels(id: string, guildId: string) {
    const r = this.running.get(id); if (!r?.client.isReady()) throw new Error('Connect this account first.');
    const guild = r.client.guilds.cache.get(guildId); if (!guild) throw new Error('Guild not available to this account.');
    await guild.channels.fetch();
    const member = guild.members.cache.get(r.client.user!.id) ?? await guild.members.fetch(r.client.user!.id);
    return [...guild.channels.cache.values()].filter(c => c.permissionsFor(member)?.has('VIEW_CHANNEL')).map(c => ({ id: c.id, name: c.name, parentId: c.parentId, type: c.type, position: 'rawPosition' in c ? c.rawPosition : 0, selectable: c.isText() || c.isThreadOnly(), readable: c.permissionsFor(member)?.has('READ_MESSAGE_HISTORY') ?? false })).sort((a,b) => a.position - b.position);
  }
  public conversations(id:string){
    const r=this.running.get(id);if(!r?.client.isReady())throw new Error('Connect this account first.');
    return [...r.client.channels.cache.values()].filter(c=>c.type==='DM'||c.type==='GROUP_DM').map(c=>({id:c.id,name:'name' in c&&c.name?c.name:'recipient' in c?c.recipient?.username??'Direct message':'Group message',type:c.type}));
  }
  public async history(id:string,raw:unknown){
    const args=z.object({channelId:z.string().regex(/^\d{15,22}$/),before:z.string().regex(/^\d{15,22}$/).optional(),query:z.string().trim().max(1000).default('')}).parse(raw);
    const r=this.running.get(id);if(!r?.client.isReady())throw new Error('Connect this account first.');
    const channel=r.client.channels.cache.get(args.channelId);
    if(!channel||!channel.isText())throw new Error('Channel not available to this account.');
    if('guild' in channel){const member=channel.guild.members.cache.get(r.client.user!.id)??await channel.guild.members.fetch(r.client.user!.id);const permissions=channel.permissionsFor(member);if(!permissions?.has('VIEW_CHANNEL')||!permissions.has('READ_MESSAGE_HISTORY'))throw new Error('Channel not available to this account.');}
    const rows=await channel.messages.fetch({limit:100,...(args.before?{before:args.before}:{})});
    const values=[...rows.values()].sort((a,b)=>a.id===b.id?0:BigInt(a.id)>BigInt(b.id)?-1:1);
    return {messages:values.filter(m=>!args.query||m.content.toLocaleLowerCase().includes(args.query.toLocaleLowerCase())).map(m=>({id:m.id,content:m.content,author:m.author.username,timestamp:m.createdAt.toISOString(),url:m.url,attachments:[...m.attachments.values()].map(a=>({name:a.name,url:a.url}))})),scanned:values.length,before:values.at(-1)?.id??null,hasMore:values.length===100};
  }
  public async search(id: string, raw: unknown) {
    const args = z.object({ guildId:z.string().regex(/^\d{15,22}$/).optional(), query:z.string().trim().min(1).max(1000), channelId:z.string().regex(/^\d{15,22}$/).optional(), offset:z.number().int().min(0).max(5000).default(0) }).parse(raw);
    const r=this.running.get(id);
    if(!r?.client.isReady()) throw new Error('Connect this account first.');
    const conversation=args.channelId?r.client.channels.cache.get(args.channelId)??await r.client.channels.fetch(args.channelId).catch(()=>null):null;
    const guild=args.guildId?r.client.guilds.cache.get(args.guildId):conversation&&'guild' in conversation?conversation.guild:null;
    if(args.guildId&&!guild) throw new Error('Guild not available to this account.');
    if(!guild&&(!conversation||!['DM','GROUP_DM'].includes(conversation.type)))throw new Error('Channel not available to this account.');
    if(args.channelId&&guild&&(!conversation||!('guild' in conversation)||conversation.guild.id!==guild.id))throw new Error('Channel not available in this server.');
    const account=this.accounts.find(a=>a.id===id);
    if(!account) throw new Error('Account not found.');
    const now=Date.now(), after=this.searchAfter.get(id)??0;
    const empty={messages:[] as {id:string;channelId:string;content:string;author:string;timestamp:string;url:string}[],total:0};
    if(after>now)return {...empty,state:'rate_limited',retryAfterMs:after-now};
    this.searchAfter.set(id,now+2500);
    const params=new URLSearchParams({content:args.query,offset:String(args.offset),sort_by:'timestamp',sort_order:'desc'});
    if(args.channelId)params.set('channel_id',args.channelId);
    let response:Response;
    try { response=await fetch(`https://discord.com/api/v9/${guild?'guilds/'+guild.id:'channels/'+args.channelId}/messages/search?${params}`,{method:'GET',redirect:'error',headers:{Authorization:account.token},signal:AbortSignal.timeout(15000)}); }
    catch { throw new Error('Search unavailable. Try again shortly.'); }
    const body=await response.json().catch(()=>({})) as any;
    if(response.status===429){const retryAfterMs=Math.min(3600000,Math.max(1000,Math.ceil((Number(body.retry_after)||5)*1000)));this.searchAfter.set(id,Date.now()+retryAfterMs);return {...empty,state:'rate_limited',retryAfterMs};}
    if(response.status===202)return {...empty,state:'indexing',retryAfterMs:5000};
    if(!response.ok){this.logger.warn('Discord history search failed.',{status:response.status});throw new Error(response.status===401?'Discord search rejected this account session (HTTP 401). Reconnect the account.':response.status===403?'Discord denied history search (HTTP 403). Check access to this server or conversation.':`Discord history search failed (HTTP ${response.status}). Try again shortly.`);}
    const member=guild?.members?.cache?.get(r.client.user!.id)??await guild?.members?.fetch(r.client.user!.id);
    const messages:typeof empty.messages=[];
    const seen=new Set<string>();
    for(const group of Array.isArray(body.messages)?body.messages:[]){for(const m of Array.isArray(group)?group:[]){
      if(!m.hit||typeof m.id!=='string'||seen.has(m.id))continue;
      const channel=guild?(guild.channels.cache.get(m.channel_id)??r.client.channels?.cache?.get(m.channel_id)??await r.client.channels?.fetch?.(m.channel_id).catch(()=>null)):m.channel_id===conversation?.id?conversation:null;
      if(guild&&'guild' in (channel??{})&&(channel as any).guild.id!==guild.id)continue;
      if(!channel)continue;
      if(guild&&'permissionsFor' in channel){const permissions=channel.permissionsFor(member!);if(!permissions?.has('VIEW_CHANNEL')||!permissions.has('READ_MESSAGE_HISTORY'))continue;}
      seen.add(m.id);messages.push({id:m.id,channelId:m.channel_id,content:String(m.content??'').slice(0,8000),author:String(m.author?.global_name??m.author?.username??'Unknown'),timestamp:String(m.timestamp??''),url:`https://discord.com/channels/${guild?.id??'@me'}/${m.channel_id}/${m.id}`});
    }}
    return {state:'ready',messages,total:Math.max(0,Number(body.total_results)||0),retryAfterMs:0};
  }
  private recordRevision(account:Account,actor:string){const id=this.controlDb.addRevision(account.id,actor,this.publicConfig(account));this.store.saveRevision(id,account);}
  private publicConfig(a:Account):any {
    const {token,webhook,voiceWebhook,...config}=a;
    return {...config,subRelays:(a.subRelays??[]).map(({webhook,voiceWebhook,...s})=>s)};
  }
  private route(accountId:string,routeId='primary'):{account:Account;route:Account|SubRelay;runtime:Runtime|undefined}{
    const account=this.accounts.find(a=>a.id===accountId);if(!account)throw new Error('Account not found.');
    const route=routeId==='primary'?account:account.subRelays?.find(s=>s.id===routeId);if(!route)throw new Error('Sub-relay not found.');
    const parent=this.running.get(accountId),runtime=routeId==='primary'?parent:parent?.children?.find(c=>c.routeId===routeId);
    return {account,route,runtime};
  }
  private withRouteDb<T>(accountId:string,routeId:string,run:(db:RelayDatabase)=>T):T{
    const {account:a,route,runtime}=this.route(accountId,routeId);if(runtime?.status!=='error'&&runtime?.db)return run(runtime.db);
    const destination=createHash('sha256').update(route.webhook+'|'+route.voiceWebhook+'|'+(route.guildId??'')).digest('hex').slice(0,16);
    const legacy=createHash('sha256').update(a.webhook+'|'+a.voiceWebhook).digest('hex').slice(0,16);
    const file=path.join(this.store.directory,routeId==='primary'&&!a.guildId?`${a.id}-${legacy}.sqlite`:`${a.id}-${routeId}-${destination}.sqlite`);
    const db=new RelayDatabase(file);try{return run(db)}finally{db.close();}
  }
  public async tools(accountId:string,raw:unknown,actor='dashboard'){
    const request=z.object({action:z.enum(['configure','pause','resume','refresh','scope','preview','archive','deliveries','summary','diagnostics','save-view','delete-view','views','revisions','restore']),routeId:z.string().max(80).default('primary'),minutes:z.number().int().min(0).max(10080).default(0),policy:routePolicySchema.optional(),draft:z.record(z.string(),z.unknown()).optional(),filters:z.record(z.string(),z.unknown()).default({}),name:z.string().trim().max(80).optional(),id:z.string().max(100).optional(),revisionId:z.number().int().positive().optional(),sample:z.string().max(32000).optional(),scenario:z.enum(['normal','long','edited','attachments','delayed']).default('normal')}).parse(raw);
    const {account,route,runtime}=this.route(accountId,request.routeId),action=request.action;
    if(action==='configure'){
      const policy=policyFor(request.policy??route.policy);
      if(request.routeId==='primary')return {id:await this.save(accountId,{policy},actor)};
      return {id:await this.save(accountId,{subRelays:(account.subRelays??[]).map(s=>s.id===request.routeId?{...s,policy}:s)},actor)};
    }
    if(action==='pause'||action==='resume')return this.mutate(async()=>{
      this.recordRevision(account,actor);
      route.paused=action==='pause'&&!request.minutes;route.pausedUntil=action==='pause'&&request.minutes?Date.now()+request.minutes*60000:0;
      if(runtime){runtime.config.paused=route.paused;runtime.config.pausedUntil=route.pausedUntil;}
      this.store.save(this.accounts);this.recordRevision(account,actor);return {ok:true,paused:routeIsPaused(route),pausedUntil:route.pausedUntil};
    });
    if(action==='refresh'){if(!runtime)throw new Error('Connect this account first.');await runtime.voice.sync(true);return {ok:true};}
    if(action==='archive')return this.withRouteDb(accountId,request.routeId,db=>db.archiveHistory(request.filters));
    if(action==='deliveries')return this.withRouteDb(accountId,request.routeId,db=>({rows:db.deliveryHistory(Number(request.filters.limit)||100,Number(request.filters.offset)||0)}));
    if(action==='summary')return this.withRouteDb(accountId,request.routeId,db=>({...db.operationalSummary(Number(request.filters.days)||1),voice:{stale:runtime?.voice.health.stale??db.getSetting('voice_status_mode')==='stale',lastObserved:runtime?.voice.health.lastSampleAt??db.getSetting('voice_last_sample_at'),pages:runtime?.voice.health.pages??0}}));
    if(action==='views')return {rows:this.controlDb.views()};
    if(action==='save-view'){if(!request.name)throw new Error('Name required.');const id=request.id??randomUUID();this.controlDb.saveView(id,request.name,{...request.filters,accountId,routeId:request.routeId});return {id};}
    if(action==='delete-view'){if(request.id)this.controlDb.removeView(request.id);return {ok:true};}
    if(action==='revisions')return {rows:this.controlDb.revisions(accountId)};
    if(action==='restore'){
      const revision=this.controlDb.revision(accountId,request.revisionId??0),encrypted=this.store.revision(request.revisionId??0);if(!revision)throw new Error('Revision not found.');
      // Retain current credentials; historical snapshots never contain tokens.
      const prior=encrypted?.id===accountId?encrypted:revision;
      const subRelays=(prior.subRelays??[]).map((s:any)=>{const current=account.subRelays?.find(c=>c.id===s.id);return {...s,webhook:current?.webhook??s.webhook,voiceWebhook:current?.voiceWebhook??s.voiceWebhook};});
      return {id:await this.save(accountId,{...prior,token:account.token,webhook:account.webhook,voiceWebhook:account.voiceWebhook,subRelays,enabled:account.enabled},actor,true)};
    }
    if(action==='preview'){
      let text=request.sample??'Example Intel report. Select a watchlist phrase to preview its priority.';if(request.scenario==='long')text=(text+'\n').repeat(30).slice(0,24000);
      const message:any={content:text,id:'preview',createdTimestamp:Date.now(),editedTimestamp:null,member:{displayName:'Captain'},author:{username:'Captain'},guild:{name:'Monitored server',id:'preview',members:{cache:new Map()}},channel:{name:'source-channel',id:'preview',isThread:()=>false},url:'https://discord.com/channels/0/0/0',mentions:{roles:new Map(),users:new Map(),channels:new Map()},embeds:[],attachments:new Map(),stickers:new Map()};
      if(request.scenario==='delayed')message.createdTimestamp=Date.now()-3600000;
      if(request.scenario==='edited'){message.editedTimestamp=Date.now();message.reference={messageId:'preview-parent'};message.fetchReference=async()=>({...message,content:'Previous source message',author:{username:'Earlier captain'}});}
      if(request.scenario==='attachments')message.attachments=new Map([['image',{id:'image',name:'scouting.png',contentType:'image/png',url:'https://cdn.discordapp.com/attachments/0/0/scouting.png',size:320000}],['document',{id:'document',name:'report.txt',contentType:'text/plain',url:'https://cdn.discordapp.com/attachments/0/0/report.txt',size:12000}]]);
      const payload=await buildRelayPayload(message,{download:async()=>({files:[],fallbackUrls:[]})} as any,{policy:request.policy??policyFor(route.policy),relayLabel:route.name});
      return {payload,readOnly:true,notice:'Preview only. Nothing is sent to Discord.'};
    }
    if(!runtime?.client.isReady())throw new Error('Connect this account first.');
    if(action==='diagnostics'){
      const checks:any[]=[];for(const hook of runtime.hooks){try{await hook.verifyDestination();checks.push({ok:true,...hook.health})}catch{checks.push({ok:false,...hook.health})}}
      const scope=await this.scopeRows(account,route,runtime,{});
      return {sourceReadOnly:true,destinationChecks:checks,sourceChannels:scope.rows.filter(c=>c.reason==='View Channel permission missing'||c.included&&!c.readable).map(c=>({id:c.id,name:c.name,missing:c.reason==='View Channel permission missing'?'View Channel':'Read Message History'})),voice:runtime.voice.health,scopeCount:scope.rows.filter(c=>c.included).length};
    }
    return this.scopeRows(account,route,runtime,request.draft??{});
  }
  private async scopeRows(account:Account,route:Account|SubRelay,runtime:Runtime,draft:any){
    const policy=policyFor(draft.policy??route.policy),sources=route===account?(draft.guildId?[String(draft.guildId)]:Array.isArray(draft.monitoredGuildIds)?draft.monitoredGuildIds:primarySourceGuilds(account,runtime.client)):[String(draft.guildId??route.guildId)];
    const config={...runtime.config,policy,autoChannels:draft.autoChannels??route.autoChannels,relayGuildIds:new Set<string>(sources),relayChannelIds:new Set<string>(draft.channels??route.channels),excludedChannelIds:new Set<string>(draft.excludedChannels??route.excludedChannels)};
    const rows:any[]=[];for(const guild of runtime.client.guilds.cache.values()){
      if(!config.relayGuildIds.has(guild.id))continue;await guild.channels.fetch();const self=guild.members.cache.get(runtime.client.user!.id)??await guild.members.fetch(runtime.client.user!.id);
      for(const channel of guild.channels.cache.values()){
        if(!channel.isText()&&!channel.isThreadOnly())continue;
        const permissions=channel.permissionsFor(self),decision=channelDecision(channel,config);
        rows.push({id:channel.id,name:channel.name,guild:guild.name,type:channel.type,included:decision.included&&Boolean(permissions?.has('VIEW_CHANNEL')),reason:permissions?.has('VIEW_CHANNEL')?decision.reason:'View Channel permission missing',readable:Boolean(permissions?.has('READ_MESSAGE_HISTORY'))});
      }
    }
    return {rows,total:rows.length,included:rows.filter(r=>r.included).length,monitoredGuildIds:[...config.relayGuildIds]};
  }
  public async close(): Promise<void> { await this.tail; for (const id of [...this.running.keys()]) await this.stop(id);this.controlDb.close(); }
}
