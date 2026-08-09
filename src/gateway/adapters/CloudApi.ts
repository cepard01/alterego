// Cloud API transport — WhatsApp Business Cloud API over HTTP (v1 §3).
// https://developers.facebook.com/docs/whatsapp/cloud-api

import { MediaKind } from '@alterego/events';
import { InboundMessage, OutboundMessage, PresenceState, SendResult, TransportAdapter } from '../types.js';

interface CloudApiConfig {
  phoneNumberId: string;
  token: string;
  webhookSecret: string;
}

const MEDIA_KIND_BY_MIME: Record<string, MediaKind> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'audio/ogg': 'audio',
  'audio/mpeg': 'audio',
  'audio/amr': 'audio',
  'video/mp4': 'video',
  'text/plain': 'document',
  'application/pdf': 'document',
};

export class CloudApiAdapter implements TransportAdapter {
  readonly name = 'cloud-api';
  private readonly baseUrl = 'https://graph.facebook.com/v19.0';

  constructor(
    private readonly config: CloudApiConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async connect(): Promise<void> {
    if (!this.config.token || !this.config.phoneNumberId) {
      throw new Error('Cloud API requires phoneNumberId and token in config');
    }
  }

  async disconnect(): Promise<void> {}

  async send(message: OutboundMessage): Promise<SendResult> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/${this.config.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: message.userId,
          type: 'text',
          text: { body: message.text, preview_url: false },
          context: message.replyToMessageId ? { message_id: message.replyToMessageId } : undefined,
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Cloud API send failed: ${response.status} ${await response.text().catch(() => '')}`);
    }
    const json = (await response.json()) as { messages?: Array<{ id: string }> };
    return {
      messageId: json.messages?.[0]?.id ?? `wa-${Date.now()}`,
      conversationId: message.conversationId,
      sentAt: new Date().toISOString(),
    };
  }

  async setPresence(conversationId: string, state: PresenceState): Promise<void> {
    const url = `${this.baseUrl}/${this.config.phoneNumberId}/messages`;
    const body =
      state === 'typing'
        ? { messaging_product: 'whatsapp', to: conversationId, type: 'text', text: { body: '' } }
        : null;
    if (!body) return;
    await this.fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => undefined);
  }

  /** Parse a Cloud API webhook payload (messages part only). */
  ingest(raw: Record<string, unknown>): InboundMessage | null {
    const entry = (raw.entry as Array<{ changes?: Array<{ value?: Record<string, unknown> }> }> | undefined)?.[0];
    const value = entry?.changes?.[0]?.value;
    if (!value) return null;
    const message = (value.messages as Array<Record<string, unknown>> | undefined)?.[0];
    if (!message) return null;
    const from = String(message.from ?? '');
    const id = String(message.id ?? `wa-in-${Date.now()}`);
    const text = (message.text as { body?: string } | undefined)?.body ?? '';
    const media: InboundMessage['media'] = [];
    const mediaType = message.type as string;
    if (mediaType && mediaType !== 'text') {
      const file = message[mediaType] as Record<string, unknown> | undefined;
      const kind = MEDIA_KIND_BY_MIME[String(file?.mime_type ?? '')] ?? 'document';
      media.push({
        mediaId: String(file?.id ?? id),
        type: kind,
        mimeType: String(file?.mime_type ?? ''),
        sizeBytes: typeof file?.file_size === 'string' ? Number(file.file_size) : undefined,
      });
    }
    return {
      id,
      conversationId: id,
      userId: from,
      phoneNumber: from,
      content: text,
      timestamp: new Date().toISOString(),
      hasMedia: media.length > 0,
      media,
      replyToMessageId: (message.context as { id?: string } | undefined)?.id,
      raw: { type: mediaType },
    };
  }
}
