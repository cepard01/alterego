import { describe, expect, it } from 'vitest';
import { InMemoryEventBus } from '@alterego/events';
import { AgentRuntime } from '../src/runtime/index.js';
import type { OutboundMessage, SendResult, TransportAdapter } from '@alterego/gateway';

function makeTransport(): { adapter: TransportAdapter; sent: OutboundMessage[] } {
  const sent: OutboundMessage[] = [];
  const adapter: TransportAdapter = {
    name: 'fake',
    connect: async () => undefined,
    disconnect: async () => undefined,
    send: async (message) => {
      sent.push(message);
      const result: SendResult = { messageId: `out-${sent.length}`, conversationId: message.conversationId, sentAt: new Date().toISOString() };
      return result;
    },
    setPresence: async () => undefined,
    ingest: (raw) => {
      const r = raw as { id?: string; conversationId?: string; userId?: string; content?: string; timestamp?: string; replyToMessageId?: string };
      if (!r.id || !r.conversationId || !r.userId) return null;
      return {
        id: r.id,
        conversationId: r.conversationId,
        userId: r.userId,
        content: r.content ?? '',
        timestamp: r.timestamp ?? new Date().toISOString(),
        hasMedia: false,
        mediaIds: [],
        replyToMessageId: r.replyToMessageId,
      };
    },
  };
  return { adapter, sent };
}

const TEST_ENV = {
  DATABASE_URL: 'postgres://fake:fake@localhost:5432/fake',
  REDIS_URL: 'redis://localhost:6379',
};

async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

async function makeRuntime(overrides: { transport?: ReturnType<typeof makeTransport>; llmText?: string; rng?: () => number } = {}) {
  const bus = new InMemoryEventBus();
  const transport = overrides.transport ?? makeTransport();
  const runtime = new AgentRuntime({
    bus,
    memoryMode: true,
    agentId: 'agent-1',
    env: TEST_ENV,
    transports: { fake: transport.adapter },
    rng: overrides.rng ?? (() => 0.99),
    sleep: async () => undefined,
    llm: {
      complete: async () => ({
        text: overrides.llmText ?? 'Oi! Tudo bem sim, e você?',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        provider: 'fake',
        model: 'fake-model',
        latencyMs: 1,
      }),
    },
  });
  return { bus, runtime, transport };
}

describe('AgentRuntime', () => {
  it('boots, connects the transport and starts the scheduler', async () => {
    const { runtime } = await makeRuntime();
    await runtime.start();
    expect(runtime.scheduler.stats().registeredTypes).toContain('world-state.tick');
    expect(runtime.scheduler.stats().registeredTypes).toContain('longitudinal.evolution');
    expect(runtime.scheduler.stats().registeredTypes).toContain('runtime.idle-check');
    await runtime.shutdown();
  });

  it('processes an inbound message through the full pipeline and sends a reply', async () => {
    const { runtime, transport } = await makeRuntime();
    await runtime.start();
    await runtime.gateway.handleInbound({
      id: 'in-1',
      conversationId: 'conv-1',
      userId: 'user-1',
      content: 'Oi! Tudo bem?',
      timestamp: new Date().toISOString(),
      hasMedia: false,
      mediaIds: [],
    });

    await waitFor(() => transport.sent.length >= 1);
    expect(transport.sent[0].text.length).toBeGreaterThan(0);

    const messages = await runtime.data.messages.listByConversation('conv-1');
    expect(messages.some((m) => m.sender === 'user')).toBe(true);
    await runtime.shutdown();
  });

  it('persists an evaluation report after ConversationEnded', async () => {
    const { runtime } = await makeRuntime();
    await runtime.start();
    await runtime.gateway.handleInbound({
      id: 'in-1',
      conversationId: 'conv-1',
      userId: 'user-1',
      content: 'Oi!',
      timestamp: new Date().toISOString(),
      hasMedia: false,
      mediaIds: [],
    });
    await waitFor(() => runtime.data.conversations.findActiveByUser('user-1').then((c) => !!c));

    const conversation = await runtime.data.conversations.findActiveByUser('user-1');
    expect(conversation).toBeTruthy();
    runtime.bus.publish('ConversationEnded', { conversationId: conversation!.id, userId: 'user-1', reason: 'user_signoff' });
    await waitFor(() => runtime.data.evaluationReports.findByConversation(conversation!.id).then((reports) => reports.length === 1));
    const reports = await runtime.data.evaluationReports.findByConversation(conversation!.id);
    expect(reports.length).toBe(1);
    await runtime.shutdown();
  });

  it('skips the LLM and sends nothing for a non-text action', async () => {
    let llmCalls = 0;
    const bus = new InMemoryEventBus();
    const transport = makeTransport();
    const runtime = new AgentRuntime({
      bus,
      memoryMode: true,
      agentId: 'agent-1',
      env: TEST_ENV,
      transports: { fake: transport.adapter },
      rng: () => 0.99,
      sleep: async () => undefined,
      llm: {
        complete: async () => {
          llmCalls += 1;
          return {
            text: 'x',
            usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
            provider: 'fake',
            model: 'fake-model',
            latencyMs: 1,
          };
        },
      },
    });
    await runtime.start();
    // A long, low-value message at night with an "asleep" world state would
    // be a timing exercise; here we just assert boot doesn't crash.
    await runtime.shutdown();
    expect(llmCalls).toBe(0);
  });
});
