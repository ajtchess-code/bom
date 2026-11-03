import {channelDecision,routeIsPaused} from './policy.js';
import type { Message } from 'discord.js-selfbot-v13';
import type { AppConfig } from '../config/env.js';

export function shouldRelay(message: Message, config: AppConfig): boolean {
  if (!message.guild || message.system || message.author.id === message.client.user?.id || message.webhookId) return false;
  if(routeIsPaused(config))return false;
  if (config.ignoreBots && message.author.bot) return false;
  return channelDecision({id:message.channel.id,name:'name' in message.channel?message.channel.name:'',type:message.channel.type,guild:message.guild,parentId:'parentId' in message.channel?message.channel.parentId:null,parent:'parent' in message.channel?message.channel.parent:null,isThread:()=>message.channel.isThread()},config).included;
}
