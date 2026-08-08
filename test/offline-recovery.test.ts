import { describe, expect, it } from 'vitest';
import { ConfigService } from '@whatsapp-ai-agent/config';
import { InMemoryEventBus } from '@whatsapp-ai-agent/events';
import { DataService } from '@whatsapp-ai-agent/data';
import { RecoveryEngine } from '../src/offline-recovery/index.js';
import { ContextReconstructor } from '../src/offline-recovery/index.js';
import { FreshnessScorer } from '../src/offline-recovery/index.js';
import type { Message } from '@whatsapp-ai-agent/data';

const HOUR = 3_600_000;

function makeMessage(conversationId: string, content: string, offsetHours: number): Message {
  const timestamp = new Date(Date.now() - offsetHours * HOUR).toISOString();
  return {
    id: `m-${content.length}-${offsetHours}`,
    conversationId,
    sender: 'user',
    content,
    timestamp,
    isRead: false,
  };
}

function makeData() {
  const bus = new InMemoryEventBus();
  const config = new ConfigService(bus, {
    env: { DATABASE_URL: 'postgres://localhost:5432/test', REDIS_URL: 'redis://localhost:6379' },
    quiet: true,
  });
  return new DataService(config, undefined, { memoryMode: true });
}

function makeScheduler() {
  const calls: { registered: string[]; scheduled: Array<{ type: string; payload: Record<string, unknown>; runAt?: string }> } = {
    registered: [],
    scheduled: [],
  };
  return {
    calls,
    register: (type: string) => {
      calls.registered.push(type);
    },
    schedule: async (job: { type: string; payload: Record<string, unknown>; runAt?: string }) => {
      calls.scheduled.push(job);
    },
  };
}

describe('FreshnessScorer', () => {
  const scorer = new FreshnessScorer();

  it('responds normally to a short gap with high freshness', () => {
    const result = scorer.score({ gapMs: 30 * 60 * 1000, relationshipStrength: 0.7, topicStaleness: 0.1, unreadCount: 1, hasUnansweredQuestion: false });
    expect(result.strategy).toBe('respond_normally');
    expect(result.freshness).toBeGreaterThan(0.5);
  });

  it('uses summary awareness for a medium gap', () => {
    const result = scorer.score({ gapMs: 6 * HOUR, relationshipStrength: 0.7, topicStaleness: 0.1, unreadCount: 2, hasUnansweredQuestion: true });
    expect(result.strategy).toBe('respond_with_summary_awareness');
  });

  it('skips silently when freshness is low and there is no question', () => {
    const result = scorer.score({ gapMs: 100 * HOUR, relationshipStrength: 0.1, topicStaleness: 0.8, unreadCount: 1, hasUnansweredQuestion: false });
    expect(result.strategy).toBe('skip_silently');
  });

  it('reopens selectively for a long gap with volume and a question', () => {
    const result = scorer.score({ gapMs: 100 * HOUR, relationshipStrength: 0.6, topicStaleness: 0.2, unreadCount: 4, hasUnansweredQuestion: true });
    expect(result.strategy).toBe('reopen_selectively');
  });

  it('soft-acknowledges a multi-day gap when the thread still matters', () => {
    const result = scorer.score({ gapMs: 48 * HOUR, relationshipStrength: 0.8, topicStaleness: 0.2, unreadCount: 2, hasUnansweredQuestion: true });
    expect(result.strategy).toBe('respond_with_soft_acknowledgment');
  });
});

describe('ContextReconstructor', () => {
  const reconstructor = new ContextReconstructor();
  const messages = Array.from({ length: 15 }, (_, i) => makeMessage('c1', `msg ${i}`, 20 - i));

  it('loads raw messages for a short gap', () => {
    const ctx = reconstructor.reconstruct({ strategy: 'respond_normally', gapMs: 30 * 60 * 1000, messages, unansweredQuestions: [] });
    expect(ctx.type).toBe('raw');
    expect(ctx.summary).toBeNull();
  });

  it('compresses overflow for a medium gap', () => {
    const ctx = reconstructor.reconstruct({ strategy: 'respond_with_summary_awareness', gapMs: 10 * HOUR, messages, unansweredQuestions: ['Vai?'] });
    expect(ctx.type).toBe('summary');
    expect(ctx.summary).toContain('Resumo do período offline');
    expect(ctx.messages.length).toBeLessThanOrEqual(12);
  });

  it('keeps only summary + questions for a long gap', () => {
    const ctx = reconstructor.reconstruct({ strategy: 'respond_with_soft_acknowledgment', gapMs: 100 * HOUR, messages, unansweredQuestions: ['Vai?'] });
    expect(ctx.type).toBe('summary_plus_questions');
    expect(ctx.unansweredQuestions).toEqual(['Vai?']);
    expect(ctx.summary).toContain('msg');
  });
});

describe('RecoveryEngine', () => {
  it('does nothing when the gap is below the threshold', async () => {
    const bus = new InMemoryEventBus();
    const data = makeData();
    const scheduler = makeScheduler();
    const engine = new RecoveryEngine(bus, data, scheduler);
    const result = await engine.runOnBoot({
      bootTime: new Date(Date.now()).toISOString(),
      lastActiveAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      conversations: [],
      relationshipStrength: () => 0.5,
      onRecoveryDue: async () => undefined,
    });
    expect(result.plans).toHaveLength(0);
    expect(scheduler.calls.scheduled).toHaveLength(0);
  });

  it('plans recovery for backlogged conversations and staggers the sends', async () => {
    const bus = new InMemoryEventBus();
    const data = makeData();
    const scheduler = makeScheduler();
    const engine = new RecoveryEngine(bus, data, scheduler);
    const plans = await data.recoveryPlans.findPending();

    expect(plans).toHaveLength(0);
    await data.messages.create(makeMessage('c1', 'Você ainda vai no show?', 5));
    await data.messages.create(makeMessage('c2', 'oi', 30));

    const result = await engine.runOnBoot({
      bootTime: new Date(Date.now()).toISOString(),
      lastActiveAt: new Date(Date.now() - 4 * HOUR).toISOString(),
      conversations: [
        { id: 'c1', userId: 'u1', lastMessageAt: new Date(Date.now() - 5 * HOUR).toISOString() },
        { id: 'c2', userId: 'u2', lastMessageAt: new Date(Date.now() - 30 * HOUR).toISOString() },
      ],
      relationshipStrength: (userId) => (userId === 'u1' ? 0.7 : 0.1),
      onRecoveryDue: async () => undefined,
      staggerRangeMs: [0, 0],
    });

    expect(result.gapMs).toBe(4 * HOUR);
    expect(result.plans.length).toBeGreaterThanOrEqual(1);
    expect(scheduler.calls.registered).toContain('recovery.send');
    expect(scheduler.calls.scheduled.length).toBe(result.plans.length);
    const due = await data.recoveryPlans.findPending();
    expect(due.length).toBe(result.plans.length);
    expect(due[0].status).toBe('pending');
    const created = await data.recoveryPlans.findPending();
    expect(created.every((p) => typeof p.strategy === 'string')).toBe(true);
  });

  it('marks skipped conversations and does not schedule them', async () => {
    const bus = new InMemoryEventBus();
    const data = makeData();
    const scheduler = makeScheduler();
    const engine = new RecoveryEngine(bus, data, scheduler);
    await data.messages.create(makeMessage('c1', 'lembra daquele jogo antigo?', 500));

    const result = await engine.runOnBoot({
      bootTime: new Date(Date.now()).toISOString(),
      lastActiveAt: new Date(Date.now() - 400 * HOUR).toISOString(),
      conversations: [{ id: 'c1', userId: 'u1', lastMessageAt: new Date(Date.now() - 500 * HOUR).toISOString() }],
      relationshipStrength: () => 0.05,
      topicStaleness: () => 0.9,
      onRecoveryDue: async () => undefined,
      staggerRangeMs: [0, 0],
    });

    expect(result.skippedCount).toBe(1);
    expect(result.plans).toHaveLength(0);
    expect(scheduler.calls.scheduled).toHaveLength(0);
  });
});
