import { InMemoryEventBus } from '@alterego/events';
import { AppConfig } from '@alterego/config';
import { describe, expect, it, vi } from 'vitest';
import { LLMRouter } from '../src/llm/index.js';
import { LLMResponse } from '../src/llm/types.js';
import { ProviderAdapter } from '../src/llm/adapters/provider.js';

function makeConfig(overrides: Partial<AppConfig['llm']> = {}): AppConfig {
  return {
    env: 'test',
    database: { url: 'postgres://localhost/test' },
    redis: { url: 'redis://localhost:6379' },
    log: { level: 'error', perModule: {} },
    llm: {
      defaultProvider: 'primary',
      defaultModel: 'model-a',
      providers: {
        primary: {
          apiKey: 'k1',
          priority: 1,
          timeoutMs: 30_000,
          breakerThreshold: 2,
          breakerCooldownMs: 10_000,
          pricing: { inputPer1k: 0, outputPer1k: 0 },
          models: {
            'model-a': { id: 'model-a', capabilities: ['text'], maxTokens: 512 },
            'model-vision': { id: 'model-vision', capabilities: ['text', 'vision'], maxTokens: 512 },
          },
        },
        fallback: {
          apiKey: 'k2',
          priority: 2,
          timeoutMs: 30_000,
          breakerThreshold: 2,
          breakerCooldownMs: 10_000,
          pricing: { inputPer1k: 0, outputPer1k: 0 },
          models: { 'model-b': { id: 'model-b', capabilities: ['text'], maxTokens: 512 } },
        },
      },
      ...overrides,
    },
    featureFlags: {},
    rateLimits: { perUserPerMinute: 20, globalPerMinute: 200 },
    memory: { tokenBudgets: {}, maxRecentMessages: 20, topKMemories: 8, conversationMemoryTtlHours: 72 },
    scheduler: { tickIntervalMs: 60_000, idleConversationMs: 60_000 },
    media: { enabled: true, maxOutboundBytes: 16_000_000 },
    whatsapp: { provider: 'baileys', sessionPath: './x', cloudApiPhoneNumberId: '', cloudApiToken: '', cloudApiWebhookSecret: '' },
    admin: { enabled: false, port: 3001, host: '127.0.0.1', token: '' },
    data: { mode: 'memory', sqlitePath: '' },
    evaluation: { enabled: true },
  };
}

function adapterFor(name: string, respond: (model: string) => Promise<LLMResponse> | LLMResponse): ProviderAdapter {
  return {
    name,
    complete: async (_req, model) => respond(model),
  };
}

describe('LLMRouter', () => {
  it('completes against the preferred provider and emits LLMCompleted', async () => {
    const bus = new InMemoryEventBus();
    const router = new LLMRouter({
      bus,
      config: makeConfig(),
      adapters: {
        primary: adapterFor('primary', (model) => ({
          text: 'hello',
          usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
          provider: 'primary',
          model,
          latencyMs: 42,
        })),
        fallback: adapterFor('fallback', () => {
          throw new Error('should not be called');
        }),
      },
    });
    const seen: string[] = [];
    bus.subscribe('LLMCompleted', (event) => { seen.push(`${event.payload.provider}:${event.payload.model}`); });

    const response = await router.complete({
      messages: [{ role: 'user', content: 'hi' }],
      userId: 'u1',
    });

    expect(response.text).toBe('hello');
    expect(response.provider).toBe('primary');
    expect(seen).toEqual(['primary:model-a']);
  });

  it('falls back to the secondary provider when the primary fails', async () => {
    const router = new LLMRouter({
      bus: new InMemoryEventBus(),
      config: makeConfig(),
      adapters: {
        primary: adapterFor('primary', () => {
          throw new Error('boom');
        }),
        fallback: adapterFor('fallback', () => ({
          text: 'from fallback',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          provider: 'fallback',
          model: 'model-b',
          latencyMs: 7,
        })),
      },
    });

    const response = await router.complete({ messages: [{ role: 'user', content: 'hi' }] });
    expect(response.text).toBe('from fallback');
    expect(response.provider).toBe('fallback');
  });

  it('throws when every provider fails', async () => {
    const router = new LLMRouter({
      bus: new InMemoryEventBus(),
      config: makeConfig(),
      adapters: {
        primary: adapterFor('primary', () => {
          throw new Error('boom');
        }),
        fallback: adapterFor('fallback', () => {
          throw new Error('also boom');
        }),
      },
    });

    await expect(router.complete({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(/all providers failed/);
  });

  it('opens the circuit breaker after repeated failures and skips that provider', async () => {
    let primaryCalls = 0;
    const router = new LLMRouter({
      bus: new InMemoryEventBus(),
      config: makeConfig(),
      adapters: {
        primary: adapterFor('primary', () => {
          primaryCalls += 1;
          throw new Error('degraded');
        }),
        fallback: adapterFor('fallback', () => ({
          text: 'ok',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          provider: 'fallback',
          model: 'model-b',
          latencyMs: 5,
        })),
      },
    });

    // breakerThreshold: 2 → first two failures count, third call sees the open breaker.
    await router.complete({ messages: [{ role: 'user', content: '1' }] }).catch(() => undefined);
    await router.complete({ messages: [{ role: 'user', content: '2' }] }).catch(() => undefined);
    const callsBeforeOpen = primaryCalls;
    await router.complete({ messages: [{ role: 'user', content: '3' }] });
    expect(primaryCalls).toBe(callsBeforeOpen); // no new primary call: circuit open

    const stats = router.stats();
    expect(stats.find((s) => s.provider === 'primary')?.open).toBe(true);
  });

  it('routes to a model supporting the requested capability', async () => {
    const bus = new InMemoryEventBus();
    const usedModels: string[] = [];
    const router = new LLMRouter({
      bus,
      config: makeConfig(),
      adapters: {
        primary: adapterFor('primary', (model) => {
          usedModels.push(model);
          return {
            text: 'vision ok',
            usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
            provider: 'primary',
            model,
            latencyMs: 1,
          };
        }),
        fallback: adapterFor('fallback', (model) => {
          usedModels.push(model);
          return {
            text: 'no vision here',
            usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
            provider: 'fallback',
            model,
            latencyMs: 1,
          };
        }),
      },
    });

    const response = await router.complete({
      messages: [{ role: 'user', content: 'describe this image' }],
      capabilityRequirements: ['vision'],
    });
    expect(response.provider).toBe('primary');
    expect(usedModels).toContain('model-vision');
  });
});
