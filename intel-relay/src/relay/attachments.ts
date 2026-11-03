import type { MessageAttachment, Message } from 'discord.js-selfbot-v13';
import type { AttachmentPayload } from 'discord.js';
import type { Logger } from '../logging/logger.js';

export interface ForwardedAttachments {
  files: AttachmentPayload[];
  fallbackUrls: string[];
}

export class AttachmentService {
  public constructor(
    private readonly maxAttachmentBytes: number,
    private readonly logger: Logger,
  ) {}

  public async download(message: Message): Promise<ForwardedAttachments> {
    const files: AttachmentPayload[] = [];
    const fallbackUrls: string[] = [];
    const attachments = [...message.attachments.values()].slice(0, 10);

    for (const attachment of attachments) {
      if (attachment.size > this.maxAttachmentBytes) {
        this.logger.warn('Attachment exceeds configured relay size; using source URL.', {
          messageId: message.id,
          attachment: attachment.name,
          size: attachment.size,
        });
        fallbackUrls.push(attachment.url);
        continue;
      }

      try {
        const buffer = await this.fetchAttachment(attachment);
        files.push({ attachment: buffer, name: attachment.name ?? "attachment" });
      } catch (error) {
        this.logger.warn('Could not download attachment; using source URL.', {
          messageId: message.id,
          attachment: attachment.name,
          error: error instanceof Error ? error.message : String(error),
        });
        fallbackUrls.push(attachment.url);
      }
    }

    return { files, fallbackUrls };
  }

  private async fetchAttachment(attachment: MessageAttachment): Promise<Buffer> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      const response = await fetch(attachment.url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const lengthHeader = response.headers.get('content-length');
      if (lengthHeader && Number(lengthHeader) > this.maxAttachmentBytes) {
        throw new Error('Attachment exceeds configured maximum size.');
      }

      if (!response.body) throw new Error('Attachment response has no body.');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > this.maxAttachmentBytes) { await reader.cancel(); throw new Error('Attachment exceeds configured maximum size.'); }
          chunks.push(value);
        }
        return Buffer.concat(chunks);
      } finally { reader.releaseLock(); }
    } finally {
      clearTimeout(timeout);
    }
  }
}
