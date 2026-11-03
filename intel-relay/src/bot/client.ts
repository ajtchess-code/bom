import {installSourceReadOnly} from '../security/sourceReadOnly.js';
import { Client } from 'discord.js-selfbot-v13';

export function createDiscordClient(): Client {
  const client=new Client({ failIfNotExists: false,DMChannelVoiceStatusSync:0, allowedMentions: { parse: [] } });
  installSourceReadOnly(client);
  return client;
}
