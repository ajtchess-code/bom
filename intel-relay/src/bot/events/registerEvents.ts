import type { Client, Message, PartialMessage } from 'discord.js-selfbot-v13';
import type { AppConfig } from '../../config/env.js';
import type { RelayDatabase } from '../../database/database.js';
import type { Logger } from '../../logging/logger.js';
import type { RelayService } from '../../relay/relayService.js';
import type { VoiceReporter } from '../../voice/voiceReporter.js';
export function registerEvents(client: Client, config: AppConfig, db: RelayDatabase, relay: RelayService, voice: VoiceReporter, logger: Logger): () => void {
  const listeners:Array<[string, (...args:any[])=>void]>=[];const on=(event:string,fn:(...args:any[])=>void)=>{listeners.push([event,fn]);client.on(event,fn);};
  const run = (task: Promise<unknown>) => { void task.catch(e => logger.error('Event handler failed.', e)); };
  on('ready', () => { logger.info('User-account relay connected.'); run(voice.sync(true)); run(relay.retryDeletes()); });
  on('messageCreate', message => run(relay.create(message)));
  on('messageUpdate', (_before, after: Message | PartialMessage) => {
    if(!after.guild?.id||!config.relayGuildIds.has(after.guild.id))return;
    run((async () => { const hydrated = after.partial ? await after.fetch() : after; await relay.update(hydrated); })());
  });
  on('messageDelete', message => { if (message.guild) run(relay.delete(message.id)); });
  on('messageDeleteBulk', messages => { for (const message of messages.values()) run(relay.delete(message.id)); });
  on('voiceStateUpdate', (before, after) => {
    if(config.voiceGuildIds.has(after.guild.id)&&(before.channelId!==after.channelId||before.selfMute!==after.selfMute||before.selfDeaf!==after.selfDeaf||before.serverMute!==after.serverMute||before.serverDeaf!==after.serverDeaf||before.streaming!==after.streaming))voice.schedule();
  });
  on('shardDisconnect',()=>voice.schedule());
  on('shardResume',()=>run(voice.sync(true)));
  on('error', error => logger.error('Discord connection error.', error));
  const maintenance = setInterval(() => { db.cleanup(config.mappingRetentionDays); run(relay.retryDeletes()); run(voice.sync()); }, 60_000);
  db.cleanup(config.mappingRetentionDays);
  return () => { clearInterval(maintenance); for(const [event,fn] of listeners)client.removeListener(event,fn); };
}
