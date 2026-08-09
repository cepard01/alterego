import { describe, expect, it, vi } from 'vitest';
import { InMemoryEventBus } from '@alterego/events';
import { AppConfig } from '@alterego/config';
import { MessageGateway } from '../src/gateway/Index.js';
import { InboundMessage, OutboundMessage, SendResult, TransportAdapter } from '../src/gateway/Types.js';

function makeConfig(): AppConfig {
  return {
    env: 'test',
    database: { url: 'postgres://localhost/test' },
    redis: { url: 'redis://localhost:6379' },
    log: { level: 'error', perModule: {} },
    llm: { defaultProvider: 'openai', defaultModel: 'gpt-4o-mini', providers: {} },
    featureFlags: {},
    rateLimits: { perUserPerMinute: 2, globalPerMinute: 100 },
    memory: { tokenBudgets: {}, maxRecentMessages: 20, topKMemories: 8, conversationMemoryTtlHours: 72 },
    scheduler: { tickIntervalMs: 1000, idleConversationMs: 60_000 },
    media: { enabled: true, maxOutboundBytes: 16_000_000 },
    whatsapp: { provider: 'cloud-api', sessionPath: './x', cloudApiPhoneNumberId: '123', cloudApiToken: 't', cloudApiWebhookSecret: 's' },
    admin: { enabled: false, port: 3001, host: '127.0.0.1', token: '' },
    data: { mode: 'memory', sqlitePath: '' },
    evaluation: { enabled: true },
  };
}

class FakeTransport implements TransportAdapter {
  readonly name = 'fake';
  sent: OutboundMessage[] = [];
  presence: Array<{ conversationId: string; state: string }> = [];
  connected = false;

  async connect(): Promise<void> {
    this.connected = true;
  }
  async disconnect(): Promise<void> {
    this.connected = false;
  }
  async send(message: OutboundMessage): Promise<SendResult> {
    this.sent.push(message);
    return { messageId: `sent-${this.sent.length}`, conversationId: message.conversationId, sentAt: new Date().toISOString() };
  }
  async setPresence(conversationId: string, state: string): Promise<void> {
    this.presence.push({ conversationId, state });
  }
  ingest(raw: Record<string, unknown>): InboundMessage | null {
    if (!raw.text) return null;
    return {
      id: `in-${raw.id}`,
      conversationId: `c-${raw.id}`,
      userId: 'u1',
      content: String(raw.text),
      timestamp: new Date().toISOString(),
      hasMedia: false,
    };
  }
}

describe('MessageGateway', () => {
  it('emits MessageReceived for valid inbound text', async () => {
    const bus = new InMemoryEventBus();
    const transport = new FakeTransport();
    const gateway = new MessageGateway({ bus, config: makeConfig(), transports: { fake: transport } });
    await gateway.connect();

    const seen: string[] = [];
    bus.subscribe('MessageReceived', (event) => { seen.push(event.payload.content); });

    await gateway.handleInbound({ id: '1', text: 'oi tudo bem?' });
    expect(seen).toEqual(['oi tudo bem?']);
  });

  it('drops empty and rate-limited inbound messages', async () => {
    const bus = new InMemoryEventBus();
    const transport = new FakeTransport();
    const gateway = new MessageGateway({ bus, config: makeConfig(), transports: { fake: transport } });
    await gateway.connect();

    const received = vi.fn();
    bus.subscribe('MessageReceived', received);

    await gateway.handleInbound({ id: '1', text: '' });
    expect(received).not.toHaveBeenCalled();

    await gateway.handleInbound({ id: '2', text: 'a' });
    await gateway.handleInbound({ id: '3', text: 'b' });
    await gateway.handleInbound({ id: '4', text: 'c' }); // third message in the window → rate limited
    expect(received).toHaveBeenCalledTimes(2);
  });

  it('emits MediaReceived for media attachments', async () => {
    const bus = new InMemoryEventBus();
    const transport = new FakeTransport();
    const gateway = new MessageGateway({ bus, config: makeConfig(), transports: { fake: transport } });
    await gateway.connect();

    const mediaSeen: string[] = [];
    bus.subscribe('MediaReceived', (event) => { mediaSeen.push(`${event.payload.mediaId}:${event.payload.type}`); });

    transport.ingest = () => ({
      id: 'in-9',
      conversationId: 'c-9',
      userId: 'u1',
      content: '',
      timestamp: new Date().toISOString(),
      hasMedia: true,
      media: [{ mediaId: 'm1', type: 'image' }],
    });

    await gateway.handleInbound({ id: '9', text: '' });
    expect(mediaSeen).toEqual(['m1:image']);
  });

  it('sends outbound messages and emits ResponseSent', async () => {
    const bus = new InMemoryEventBus();
    const transport = new FakeTransport();
    const gateway = new MessageGateway({ bus, config: makeConfig(), transports: { fake: transport } });
    await gateway.connect();

    const sent: string[] = [];
    bus.subscribe('ResponseSent', (event) => { sent.push(event.payload.messageId); });

    const result = await gateway.send({ conversationId: 'c1', userId: 'u1', text: 'resposta' });
    expect(result.messageId).toBe('sent-1');
    expect(transport.sent).toHaveLength(1);
    expect(sent).toEqual(['sent-1']);
  });

  it('controls presence for the human simulation layer', async () => {
    const bus = new InMemoryEventBus();
    const transport = new FakeTransport();
    const gateway = new MessageGateway({ bus, config: makeConfig(), transports: { fake: transport } });
    await gateway.connect();

    await gateway.setPresence('c1', 'offline');
    expect(transport.presence).toEqual([{ conversationId: 'c1', state: 'offline' }]);
  });
});

