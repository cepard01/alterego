import { AppConfig } from '@alterego/config';
import { InMemoryEventBus } from '@alterego/events';
import { describe, expect, it, vi } from 'vitest';
import { IdleTimer, InMemoryJobQueue, SchedulerService } from '../src/scheduler/index.js';

function makeConfig(overrides: Partial<AppConfig['scheduler']> = {}): AppConfig {
  return {
    env: 'test',
    database: { url: 'postgres://localhost/test' },
    redis: { url: 'redis://localhost:6379' },
    log: { level: 'error', perModule: {} },
    llm: { defaultProvider: 'openai', defaultModel: 'gpt-4o-mini', providers: {} },
    featureFlags: {},
    rateLimits: { perUserPerMinute: 20, globalPerMinute: 200 },
    memory: { tokenBudgets: {}, maxRecentMessages: 20, topKMemories: 8, conversationMemoryTtlHours: 72 },
    scheduler: { tickIntervalMs: 1000, idleConversationMs: 60_000, ...overrides },
    media: { enabled: true, maxOutboundBytes: 16_000_000 },
    whatsapp: { provider: 'baileys', sessionPath: './x', cloudApiPhoneNumberId: '', cloudApiToken: '', cloudApiWebhookSecret: '' },
    admin: { enabled: false, port: 3001, token: '' },
    evaluation: { enabled: true },
  };
}

describe('SchedulerService', () => {
  it('runs due jobs through registered handlers', async () => {
    const queue = new InMemoryJobQueue();
    const scheduler = new SchedulerService({
      bus: new InMemoryEventBus(),
      config: makeConfig(),
      queue,
      tickIntervalMs: 10,
    });
    const handler = vi.fn(async () => undefined);
    scheduler.register('test.job', handler);

    await scheduler.schedule({ type: 'test.job', payload: { n: 1 }, runAt: new Date(Date.now() - 1000).toISOString() });
    await scheduler.tick();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toEqual({ n: 1 });
    expect(handler.mock.calls[0][1].attempt).toBe(1);
    expect(queue.size()).toBe(0);
  });

  it('skips jobs that are not yet due', async () => {
    const queue = new InMemoryJobQueue();
    const scheduler = new SchedulerService({
      bus: new InMemoryEventBus(),
      config: makeConfig(),
      queue,
    });
    const handler = vi.fn(async () => undefined);
    scheduler.register('test.job', handler);

    await scheduler.schedule({ type: 'test.job', payload: {}, runAt: new Date(Date.now() + 60_000).toISOString() });
    await scheduler.tick();

    expect(handler).not.toHaveBeenCalled();
  });

  it('fails a job permanently when retries are exhausted', async () => {
    const queue = new InMemoryJobQueue();
    const scheduler = new SchedulerService({
      bus: new InMemoryEventBus(),
      config: makeConfig(),
      queue,
    });
    const handler = vi.fn(async () => {
      throw new Error('always broken');
    });
    scheduler.register('test.job', handler);

    await scheduler.schedule({ type: 'test.job', payload: {}, maxRetries: 0, runAt: new Date(Date.now() - 1000).toISOString() });
    await scheduler.tick();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(scheduler.stats().failed).toBe(1);
    expect(queue.size()).toBe(0); // deleted, not requeued
  });

  it('re-enqueues failed jobs with backoff when retries remain', async () => {
    const queue = new InMemoryJobQueue();
    const scheduler = new SchedulerService({
      bus: new InMemoryEventBus(),
      config: makeConfig(),
      queue,
    });
    let calls = 0;
    scheduler.register('test.job', async () => {
      calls += 1;
      if (calls === 1) throw new Error('transient');
    });

    await scheduler.schedule({ type: 'test.job', payload: {}, maxRetries: 2, runAt: new Date(Date.now() - 1000).toISOString() });
    await scheduler.tick();

    expect(calls).toBe(1);
    expect(queue.size()).toBe(1); // requeued with backoff
    expect(scheduler.stats().failed).toBe(1);
  });

  it('recurring jobs re-enqueue themselves after a run', async () => {
    const queue = new InMemoryJobQueue();
    const scheduler = new SchedulerService({
      bus: new InMemoryEventBus(),
      config: makeConfig(),
      queue,
    });
    scheduler.register('test.recurring', async () => undefined);
    scheduler.scheduleRecurring('test.recurring', 5_000);
    await scheduler.tick();
    expect(queue.size()).toBe(1); // next occurrence
  });

  it('start() and stop() manage the tick loop', async () => {
    const queue = new InMemoryJobQueue();
    const scheduler = new SchedulerService({
      bus: new InMemoryEventBus(),
      config: makeConfig(),
      queue,
      tickIntervalMs: 5,
    });
    const handler = vi.fn(async () => undefined);
    scheduler.register('test.job', handler);
    await scheduler.schedule({ type: 'test.job', payload: {}, runAt: new Date().toISOString() });

    scheduler.start();
    await new Promise((resolve) => setTimeout(resolve, 30));
    scheduler.stop();
    const countAfterStart = handler.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(handler.mock.calls.length).toBe(countAfterStart);
    expect(countAfterStart).toBeGreaterThan(0);
  });
});

describe('IdleTimer', () => {
  it('emits ConversationEnded when a conversation goes idle', async () => {
    const bus = new InMemoryEventBus();
    const queue = new InMemoryJobQueue();
    const scheduler = new SchedulerService({
      bus,
      config: makeConfig({ idleConversationMs: 1_000 }),
      queue,
    });
    const idleTimer = new IdleTimer({
      bus,
      scheduler,
      config: makeConfig({ idleConversationMs: 1_000 }),
    });
    idleTimer.start();

    const ended: string[] = [];
    bus.subscribe('ConversationEnded', (event) => ended.push(event.payload.conversationId));

    bus.publish('MessageReceived', {
      conversationId: 'c1',
      messageId: 'm1',
      userId: 'u1',
      content: 'oi',
      timestamp: new Date(Date.now() - 10_000).toISOString(),
      hasMedia: false,
      mediaIds: [],
    });

    // Simulate the check firing well after the idle threshold.
    await scheduler.schedule({
      type: 'conversation.idle-check',
      payload: { conversationId: 'c1', userId: 'u1', lastActivityAt: new Date(Date.now() - 10_000).toISOString() },
    });
    await scheduler.tick();

    expect(ended).toEqual(['c1']);
    idleTimer.stop();
  });
});
