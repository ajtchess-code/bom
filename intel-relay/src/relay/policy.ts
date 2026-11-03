import {z} from 'zod';
export const routePolicySchema=z.object({
 excludedCategories:z.array(z.string().regex(/^\d{15,22}$/)).max(500).default([]),
 excludedNamePatterns:z.array(z.string().trim().min(1).max(100)).max(30).default([]),
 excludedTypes:z.array(z.string().max(40)).max(30).default([]),
 deletionMode:z.enum(['remove','mark']).default('remove'),
 compact:z.boolean().default(true),showSourceLinks:z.boolean().default(true),
 staleAfterSeconds:z.number().int().min(30).max(86400).default(300),
 burstWindowSeconds:z.number().int().min(0).max(60).default(0),
 burstThreshold:z.number().int().min(2).max(100).default(6),
 watchlist:z.array(z.string().trim().min(2).max(100)).max(100).default([]),
 urgentWatchlist:z.array(z.string().trim().min(2).max(100)).max(50).default([]),
 alertRoleIds:z.array(z.string().regex(/^\d{15,22}$/)).max(5).default([]),
 alertCooldownSeconds:z.number().int().min(30).max(86400).default(300),
 voiceShowStatus:z.boolean().default(true),voicePageChannels:z.number().int().min(1).max(3).default(3),
});
export type RoutePolicy=z.infer<typeof routePolicySchema>;
export function policyFor(value:unknown):RoutePolicy{return routePolicySchema.parse(value??{});}
export function routeIsPaused(config:{pausedUntil?:number;paused?:boolean},now=Date.now()){return Boolean(config.paused||(config.pausedUntil??0)>now);}
export function patternMatches(name:string,pattern:string){
 const escaped=pattern.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*');
 return new RegExp('^'+escaped+'$','iu').test(name);
}
export function channelDecision(channel:any,config:any):{included:boolean;reason:string}{
 const guildId=channel.guild?.id??channel.guildId;
 if(!guildId||!config.relayGuildIds?.has(guildId))return {included:false,reason:'Server is not actively monitored by this route'};
 const policy=policyFor(config.policy);
 const parent=channel.parent??channel.guild?.channels?.cache?.get(channel.parentId)??null,parentId=channel.parentId??parent?.id;
 if(channel.isThread?.()&&!parent&&policy.excludedCategories.length)return {included:false,reason:'Thread category unavailable; cannot validate category exclusions'};
 const categoryId=channel.isThread?.()?(parent?.parentId??parent?.parent?.id):parentId;
 if(config.excludedChannelIds?.has(channel.id)||Boolean(parentId&&config.excludedChannelIds?.has(parentId)))return {included:false,reason:'Channel or parent explicitly excluded'};
 if(policy.excludedCategories.includes(categoryId))return {included:false,reason:'Category excluded'};
 if(policy.excludedTypes.includes(String(channel.type)))return {included:false,reason:'Channel type excluded'};
 if(policy.excludedNamePatterns.some(pattern=>patternMatches(String(channel.name??''),pattern)))return {included:false,reason:'Channel name matches an exclusion'};
 if(!config.autoChannels&&!config.relayChannelIds?.has(channel.id)&&!Boolean(channel.isThread?.()&&config.relayChannelIds?.has(parentId)))return {included:false,reason:'Channel is not selected'};
 return {included:true,reason:'Included'};
}
export function messagePriority(content:string,policy:RoutePolicy):{priority:number;label:string;matches:string[]}{
 const text=content.normalize('NFKC').toLocaleLowerCase();
 const urgent=policy.urgentWatchlist.filter(x=>text.includes(x.normalize('NFKC').toLocaleLowerCase()));
 const matched=policy.watchlist.filter(x=>text.includes(x.normalize('NFKC').toLocaleLowerCase()));
 return urgent.length?{priority:2,label:'URGENT',matches:urgent}:matched.length?{priority:1,label:'WATCH',matches:matched}:{priority:0,label:'ROUTINE',matches:[]};
}
export function priorityForMessage(message:any,policy:RoutePolicy){return messagePriority([message.content,message.member?.displayName,message.author?.globalName,message.author?.username,message.guild?.name,message.channel?.name].filter(Boolean).join('\n'),policy);}
