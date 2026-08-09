// MessageGateway — normalizes transport events into internal events and
// executes outbound sends with presence control (v1 §3).

import { AppConfig, ConfigService } from '@alterego/config';
import { EventBus } from '@alterego/events';
import { Logger } from '@alterego/observability';
import { RateLimiter, sanitizeMessageText } from '@alterego/security';
import { CloudApiAdapter } from './adapters/CloudApi.js';
import { InboundMessage, OutboundMessage, PresenceState, SendResult, TransportAdapter } from './Types.js';

export interface GatewayOptions {
  bus: EventBus;
  config: Readonly<AppConfig> | ConfigService;
  logger?: Logger;
  /** Override transports (tests) or add custom ones. */
  transports?: Record<string, TransportAdapter>;
}

export class MessageGateway {
  private readonly bus: EventBus;
  private readonly config: Readonly<AppConfig>;
  private readonly logger?: Logger;
  private readonly transports: Map<string, TransportAdapter>;
  private readonly rateLimiter: RateLimiter;

  constructor(options: GatewayOptions) {
    this.bus = options.bus;
    this.config = options.config instanceof ConfigService ? options.config.get() : options.config;
    this.logger = options.logger;
    this.rateLimiter = new RateLimiter({
      perUserPerMinute: this.config.rateLimits.perUserPerMinute,
      globalPerMinute: this.config.rateLimits.globalPerMinute,
    });
    this.transports = new Map();
    if (options.transports) {
      for (const [name, adapter] of Object.entries(options.transports)) this.transports.set(name, adapter);
      return;
    }
    if (this.config.whatsapp.provider === 'cloud-api') {
      this.transports.set(
        'cloud-api',
        new CloudApiAdapter({
          phoneNumberId: this.config.whatsapp.cloudApiPhoneNumberId,
          token: this.config.whatsapp.cloudApiToken,
          webhookSecret: this.config.whatsapp.cloudApiWebhookSecret,
        }),
      );
    }
  }

  get transportName(): string {
    return this.transports.keys().next().value ?? 'none';
  }

  async connect(): Promise<void> {
    for (const adapter of this.transports.values()) {
      await adapter.connect();
    }
    this.bus.publish('AgentBooted', {
      bootTime: new Date().toISOString(),
      lastActiveAt: null,
    });
  }

  async disconnect(): Promise<void> {
    for (const adapter of this.transports.values()) {
      await adapter.disconnect().catch(() => undefined);
    }
  }

  /**
   * Ingest a raw transport envelope (webhook or Baileys event). Sanitizes,
   * rate-limits, then emits MessageReceived (+ MediaReceived per item).
   */
  async handleInbound(raw: Record<string, unknown>): Promise<InboundMessage | null> {
    for (const adapter of this.transports.values()) {
      const inbound = adapter.ingest(raw);
      if (!inbound) continue;

      const sanitized = sanitizeMessageText(inbound.content);
      const decision = this.rateLimiter.check(inbound.userId);
      if (!decision.allowed) {
        this.logger?.warn('inbound message dropped by rate limiter', {
          userId: inbound.userId,
          reason: decision.reason,
        });
        return null;
      }
      if (!sanitized.valid && !inbound.hasMedia) {
        this.logger?.debug('inbound message dropped (empty after sanitization)', { id: inbound.id });
        return null;
      }

      this.bus.publish('MessageReceived', {
        conversationId: inbound.conversationId,
        messageId: inbound.id,
        userId: inbound.userId,
        content: sanitized.content,
        timestamp: inbound.timestamp,
        hasMedia: inbound.hasMedia,
        mediaIds: inbound.media?.map((m) => m.mediaId) ?? [],
        replyToMessageId: inbound.replyToMessageId,
      });
      for (const media of inbound.media ?? []) {
        this.bus.publish('MediaReceived', {
          messageId: inbound.id,
          mediaId: media.mediaId,
          type: media.type,
        });
      }
      return inbound;
    }
    return null;
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const adapter = this.transports.values().next().value;
    if (!adapter) throw new Error('no transport connected');
    if (message.simulateHuman?.typingMs) {
      await adapter.setPresence(message.conversationId, 'typing').catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, message.simulateHuman!.typingMs!));
    }
    const result = await adapter.send(message);
    this.bus.publish('ResponseSent', {
      messageId: result.messageId,
      conversationId: message.conversationId,
    });
    return result;
  }

  async setPresence(conversationId: string, state: PresenceState): Promise<void> {
    const adapter = this.transports.values().next().value;
    if (!adapter) return;
    await adapter.setPresence(conversationId, state).catch(() => undefined);
  }
}

