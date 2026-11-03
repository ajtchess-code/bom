import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

export const webhookSchema = z.string().trim().regex(/^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d+\/[\w-]+$/, 'Enter a complete Discord webhook URL.');
const blankDefault = (value: unknown) => value === '' ? undefined : value;
const schema = z.object({
  DASHBOARD_PASSWORD: z.string().min(16, 'Set a dashboard password of at least 16 characters.'),
  DASHBOARD_HOST: z.string().default('127.0.0.1'),
  DASHBOARD_PORT: z.preprocess(blankDefault, z.coerce.number().int().min(1).max(65535).default(3000)),
  PUBLIC_ORIGIN: z.string().url().refine(value => { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && u.origin === value; }, 'Use an origin without a trailing slash or path.').optional(),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
  DATA_DIR: z.string().default('./data'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});
const result = schema.safeParse(process.env);
if (!result.success) throw new Error(result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n'));
export const serverConfig = { ...result.data, dataDir: path.resolve(result.data.DATA_DIR) };
export interface AppConfig {
  policy?: import('../relay/policy.js').RoutePolicy;
  relayLabel?:string;
  paused?:boolean;
  pausedUntil?:number;
  sourceAvailable?:()=>boolean;
  autoChannels?: boolean;
  discordToken: string;
  relayWebhookUrl: string;
  voiceWebhookUrl: string | null;
  relayGuildIds: Set<string>;
  relayChannelIds: Set<string>;
  excludedChannelIds: Set<string>;
  voiceGuildIds: Set<string>;
  ignoreBots: boolean;
  voiceDebounceMs: number;
  mappingRetentionDays: number;
  maxAttachmentBytes: number;
}
