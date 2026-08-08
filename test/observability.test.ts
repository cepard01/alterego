import { describe, expect, it, vi } from 'vitest';
import { InMemoryEventBus } from '@alterego/events';
import {
  attachPipelineMetrics,
  createMemorySink,
  HealthRegistry,
  JsonLogger,
  messageLifecycleLatency,
  MetricsRegistry,
  ObservabilityService,
} from '../src/observability/index.js';

const bus = () => new InMemoryEventBus();

describe('JsonLogger', () => {
  it('logs structured JSON with level filtering', () => {
    const { sink, lines } = createMemorySink();
    const logger = new JsonLogger({ level: 'info', sink });
    logger.debug('hidden');
    logger.info('visible', { userId: 'u1' });
    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toMatchObject({ level: 'info', message: 'visible', userId: 'u1' });
  });

  it('applies per-module verbosity and child fields', () => {
    const { sink, lines } = createMemorySink();
    const logger = new JsonLogger({ level: 'info', perModule: { gateway: 'debug' }, sink });
    logger.child({ module: 'gateway' }).debug('gateway detail');
    logger.debug('no module debug');
    const records = lines();
    expect(records).toHaveLength(1);
    expect(records[0].message).toBe('gateway detail');
    expect(records[0].module).toBe('gateway');
  });

  it('threads correlation ids through child loggers', () => {
    const { sink, lines } = createMemorySink();
    const logger = new JsonLogger({ level: 'info', sink });
    logger.withCorrelationId('corr-42').info('event handled');
    expect(lines()[0].correlationId).toBe('corr-42');
  });
});

describe('MetricsRegistry + pipeline metrics', () => {
  it('derives reply/ignore and latency metrics from bus events', () => {
    const registry = new MetricsRegistry();
    const busInstance = bus();
    attachAndRun(registry, busInstance);
    expect(registry.counter('behavior.decisions', { decision: 'reply' }).value()).toBe(2);
    expect(registry.counter('behavior.decisions', { decision: 'ignore' }).value()).toBe(1);
    expect(registry.counter('message.inbound').value()).toBe(1);
    expect(registry.counter('message.outbound').value()).toBe(1);
    const summary = registry.histogram('llm.latency', { provider: 'openai' }).summary();
    expect(summary.count).toBe(1);
    expect(summary.sum).toBe(250);
  });

  function attachAndRun(registry: MetricsRegistry, busInstance: InMemoryEventBus): void {
    attachPipelineMetrics(busInstance, registry);
    busInstance.publish('BehaviorDecided', {
      messageId: 'm1', conversationId: 'c1', decision: 'reply', params: {},
    });
    busInstance.publish('BehaviorDecided', {
      messageId: 'm2', conversationId: 'c1', decision: 'reply', params: {},
    });
    busInstance.publish('BehaviorDecided', {
      messageId: 'm3', conversationId: 'c1', decision: 'ignore', params: {},
    });
    busInstance.publish('MessageReceived', {
      conversationId: 'c1', messageId: 'm1', userId: 'u1', content: 'oi',
      timestamp: new Date().toISOString(), hasMedia: false, mediaIds: [],
    });
    busInstance.publish('ResponseSent', { messageId: 'm1', conversationId: 'c1' });
    busInstance.publish('LLMCompleted', {
      requestId: 'r1', provider: 'openai', model: 'gpt-4o-mini', latencyMs: 250,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });
  }
});

describe('ObservabilityService', () => {
  it('tracks per-user token and cost rollups from LLMCompleted events', () => {
    const busInstance = bus();
    const config = {
      env: 'test', log: { level: 'info', perModule: {} }, llm: {
        defaultProvider: 'openai', defaultModel: 'gpt-4o-mini',
        providers: { openai: { pricing: { inputPer1k: 0.15, outputPer1k: 0.6 } } },
      },
    } as never;
    const service = new ObservabilityService(busInstance, config, { sink: () => {} });

    busInstance.publish('LLMCompleted', {
      requestId: 'r1', provider: 'openai', model: 'gpt-4o-mini', latencyMs: 10,
      usage: { promptTokens: 2000, completionTokens: 1000, totalTokens: 3000 },
      userId: 'u1',
    });
    busInstance.publish('LLMCompleted', {
      requestId: 'r2', provider: 'openai', model: 'gpt-4o-mini', latencyMs: 10,
      usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
      userId: 'u1',
    });

    const day = new Date().toISOString().slice(0, 10);
    const totals = service.costTracker.forUserDay('u1', day);
    expect(totals.promptTokens).toBe(3000);
    expect(totals.completionTokens).toBe(1500);
    expect(totals.calls).toBe(2);
    expect(totals.costUsd).toBeCloseTo(0.15 * 3 + 0.6 * 1.5, 5);
    service.close();
  });

  it('computes message lifecycle latency', () => {
    const busInstance = bus();
    const registry = new MetricsRegistry();
    messageLifecycleLatency(busInstance, registry);
    busInstance.publish('MessageReceived', {
      conversationId: 'c1', messageId: 'm1', userId: 'u1', content: 'hi',
      timestamp: new Date().toISOString(), hasMedia: false, mediaIds: [],
    });
    busInstance.publish('ResponseSent', { messageId: 'm1', conversationId: 'c1' });
    expect(registry.histogram('message.lifecycle.latency').summary().count).toBe(1);
  });

  it('health registry reports failures', async () => {
    const registry = new HealthRegistry();
    registry.register('whatsapp', () => {
      throw new Error('connection dropped');
    });
    const status = await registry.run('whatsapp');
    expect(status.ok).toBe(false);
    expect(status.detail).toBe('connection dropped');
  });
});
