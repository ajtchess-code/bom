import type { APIEmbed, WebhookMessageCreateOptions, WebhookMessageEditOptions } from 'discord.js';
import type { Message } from 'discord.js-selfbot-v13';
import {priorityForMessage,policyFor,type RoutePolicy} from './policy.js';
import { splitContent, truncate } from './text.js';
import type { AttachmentService } from './attachments.js';

export interface BuiltRelayPayload {
  chunks: string[];
  username: string;
  avatarURL?: string;
  embeds: APIEmbed[];
  priority?:number;
  alertRoles?:string[];
  files: NonNullable<WebhookMessageCreateOptions['files']>;
}
const labelText=(value:unknown)=>String(value??'').replace(/[\r\n\x00-\x1f]/g,' ').replace(/[\\*_`~|<>]/g,'\\$&');
export function safeUsername(name: string): string {
  const clean = name.replace(/[\x00-\x1f\x7f]/g, '').trim();
  return /discord|clyde/i.test(clean) || clean.length < 2 ? 'Message Relay' : truncate(clean, 80);
}
export function budgetEmbeds(embeds: APIEmbed[]): APIEmbed[] {
  let budget = 6000;
  const output: APIEmbed[] = [];
  const take = (s: string | undefined, max: number) => {
    if (!s || budget <= 0) return undefined;
    const value = truncate(s, Math.min(max, budget)); budget -= value.length; return value;
  };
  for (const raw of embeds.slice(0, 10)) {
    if (budget <= 0) break;
    const e: APIEmbed = {};
    const title = take(raw.title, 256); if (title) e.title = title;
    const description = take(raw.description, 4096); if (description) e.description = description;
    const author = take(raw.author?.name, 256); if (author) e.author = { name: author, ...(raw.author?.icon_url?{icon_url:raw.author.icon_url}:{}), ...(raw.author?.url?{url:raw.author.url}:{}) };
    const footer = take(raw.footer?.text, 2048); if (footer) e.footer = { text: footer };
    if (raw.url) e.url = raw.url;
    if(raw.timestamp)e.timestamp=raw.timestamp;
    if (raw.color !== undefined) e.color = raw.color;
    if (raw.image?.url) e.image = { url: raw.image.url };
    if (raw.thumbnail?.url) e.thumbnail = { url: raw.thumbnail.url };
    for (const f of (raw.fields ?? []).slice(0, 25)) {
      if (budget < 2) break;
      const name = take(f.name, Math.min(256, budget - 1));
      const value = take(f.value, 1024);
      if (name && value) (e.fields ??= []).push({ name, value, inline: f.inline ?? false });
    }
    if (e.title || e.description || e.author || e.footer || e.fields?.length || e.image || e.thumbnail) output.push(e);
  }
  return output;
}
export function cleanContent(message: Message): string {
  let content = message.content ?? '';
  for (const role of message.mentions.roles.values()) content = content.replaceAll(`<@&${role.id}>`, `@${role.name}`);
  for (const user of message.mentions.users.values()) {
    const name = message.guild?.members.cache.get(user.id)?.displayName ?? user.globalName ?? user.username;
    content = content.replaceAll(`<@${user.id}>`, `@${name}`).replaceAll(`<@!${user.id}>`, `@${name}`);
  }
  for (const channel of message.mentions.channels.values()) content = content.replaceAll(`<#${channel.id}>`, `#${'name' in channel ? channel.name : channel.id}`);
  return content.replace(/<@!?\d+>/g,'@unknown user').replace(/<@&\d+>/g,'@unknown role').replace(/<#\d+>/g,'#unavailable-channel').replace(/@everyone/g,'@everyone\u200b').replace(/@here/g,'@here\u200b');
}
export async function buildRelayPayload(message: Message, service: AttachmentService, options: { urlsOnly?: boolean;policy?:RoutePolicy;relayLabel?:string;now?:number } = {}): Promise<BuiltRelayPayload> {
  const forwarded = options.urlsOnly
    ? { files: [], fallbackUrls: [...message.attachments.values()].map(a => a.url) }
    : await service.download(message);
  let content = cleanContent(message);
  // Angle brackets suppress a second automatic preview for embeds copied below.
  for (const embed of message.embeds) if (embed.url) content = content.split(embed.url).join(`<${embed.url}>`);
  const extras = [...forwarded.fallbackUrls.map(url => `<${url}>`)];
  for (const sticker of message.stickers.values()) extras.push(`[Sticker: ${sticker.name}] ${sticker.url}`);
  const poll = (message as Message & { poll?: { question?: { text?: string }; answers?: { values(): IterableIterator<{ text?: string }> } } }).poll;
  if (poll) extras.push(`Poll: ${poll.question?.text ?? 'Open the source message to view this poll.'}`);
  content = [content, ...extras].filter(Boolean).join('\n');
  const author = message.member?.displayName ?? message.author.globalName ?? message.author.username;
  const avatarURL=message.member?.displayAvatarURL?.()||message.author.displayAvatarURL?.()||message.author.defaultAvatarURL;
  const channelName = 'name' in message.channel ? message.channel.name : message.channel.id;
  const policy=policyFor(options.policy),now=options.now??Date.now(),priority=priorityForMessage(message,policy);
  // The relayed post is just the message. Source, timing and delivery details live
  // in the Intel dashboard's live feed. Replies keep one small context line.
  let replyLine='';
  if(message.reference?.messageId){try{const reply=await message.fetchReference();const who=reply.member?.displayName??reply.author.globalName??reply.author.username;replyLine=`-# ↪ replying to **${labelText(truncate(who,80))}**: ${labelText(truncate((cleanContent(reply)||'[attachment]').replace(/\s+/g,' '),120))}`;}catch{replyLine='-# ↪ replying to an earlier message';}}
  if(replyLine)content=[replyLine,content].filter(Boolean).join('\n');
  const attachments=[...message.attachments.values()];
  const images:APIEmbed[]=attachments.filter(a=>a.contentType?.startsWith('image/')).slice(0,4).map(a=>({url:message.url,image:{url:a.name&&forwarded.files.some(f=>f.name===a.name)?'attachment://'+a.name:a.url}}));
  const copied=message.embeds.slice(0,Math.max(0,9-images.length)).map(e=>{const raw=e.toJSON() as APIEmbed;if(policy.compact){delete raw.thumbnail;if(raw.description)raw.description=truncate(raw.description,900);}return raw;});
  return {chunks:splitContent(content,1900),username:safeUsername(author),...(avatarURL?{avatarURL}:{}),priority:priority.priority,embeds:budgetEmbeds([...images,...copied]),files:forwarded.files};
}
export function createOptionsForPart(payload: BuiltRelayPayload, index: number): WebhookMessageCreateOptions {
  return { content: partContent(payload,index), username: payload.username, ...(payload.avatarURL ? { avatarURL: payload.avatarURL } : {}), allowedMentions: { parse: [],roles:index===0?payload.alertRoles??[]:[] }, ...(index === 0 ? { embeds: payload.embeds, files: payload.files } : {}) };
}
export function editOptionsForPart(payload: BuiltRelayPayload, index: number): WebhookMessageEditOptions {
  return { content: partContent(payload,index), allowedMentions: { parse: [] }, embeds: index === 0 ? payload.embeds : [], attachments: [], files: index === 0 ? payload.files : [] };
}

function partContent(payload:BuiltRelayPayload,index:number){const count=payload.chunks.length;return [index===0?(payload.alertRoles??[]).map(id=>`<@&${id}>`).join(' '):'',count>1?`**Part ${index+1}/${count}**`:'',payload.chunks[index]??''].filter(Boolean).join('\n');}
