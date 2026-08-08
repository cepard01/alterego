import { describe, expect, it } from 'vitest';
import { ConfigService } from '@whatsapp-ai-agent/config';
import { InMemoryEventBus } from '@whatsapp-ai-agent/events';
import { DataService } from '@whatsapp-ai-agent/data';
import { EvaluatorService, HeuristicScorer } from '../src/evaluation/index.js';
import type { Message } from '@whatsapp-ai-agent/data';

const MINUTE = 60_000;

function msg(sender: 'user' | 'agent', content: string, offsetMinutes: number): Message {
  return {
    id: `m-${sender}-${content.length}-${offsetMinutes}`,
    conversationId: 'c1',
    sender,
    content,
    timestamp: new Date(Date.now() - offsetMinutes * MINUTE).toISOString(),
    isRead: true,
  };
}

function transcript(): Message[] {
  return [
    msg('user', 'Oi! Tudo bem?', 10),
    msg('agent', 'Oi! Tudo ótimo, e você?', 8),
    msg('user', 'Preciso de ajuda com um projeto.', 7),
    msg('agent', 'Claro! Me conta mais sobre ele.', 5),
  ];
}

describe('HeuristicScorer', () => {
  const scorer = new HeuristicScorer();

  it('scores a natural exchange highly', () => {
    const result = scorer.score({ messages: transcript(), contradictionCount: 0 });
    expect(result.naturalness).toBeGreaterThan(80);
    expect(result.conversationFlow).toBeGreaterThan(80);
    expect(result.memoryConsistency).toBe(100);
  });

  it('penalizes robotic reply delays', () => {
    const now = Date.now();
    const at = (offsetMs: number) => new Date(now - offsetMs).toISOString();
    const fast: Message[] = [
      { id: 'a', conversationId: 'c1', sender: 'user', content: 'Oi', timestamp: at(5000), isRead: true },
      { id: 'b', conversationId: 'c1', sender: 'agent', content: 'Oi', timestamp: at(4500), isRead: true },
      { id: 'c', conversationId: 'c1', sender: 'user', content: 'Tudo bem?', timestamp: at(4400), isRead: true },
    ];
    const result = scorer.score({ messages: fast });
    expect(result.naturalness).toBeLessThan(80);
  });

  it('penalizes oversized single bubbles', () => {
    const long = [
      msg('user', 'Oi', 10),
      msg('agent', 'x'.repeat(600), 9),
    ];
    const result = scorer.score({ messages: long });
    expect(result.naturalness).toBeLessThan(80);
  });

  it('measures latency realism against the expected distribution', () => {
    const result = scorer.score({
      messages: transcript(),
      expectedReplyDelays: { meanMs: 2 * MINUTE, stdDevMs: 30_000 },
    });
    expect(result.latencyRealism).toBeGreaterThan(0);
    expect(result.latencyRealism).toBeLessThanOrEqual(100);
  });

  it('penalizes contradiction-heavy sessions', () => {
    const result = scorer.score({ messages: transcript(), contradictionCount: 3 });
    expect(result.memoryConsistency).toBe(0);
  });

  it('detects behavior outliers against history', () => {
    const result = scorer.score({
      messages: transcript(),
      behaviorHistory: { reply: 0.9, ignore: 0.1 },
      behaviorObserved: { reply: 5, ignore: 5 },
    });
    expect(result.behaviorConsistency).toBeLessThan(70);
  });
});

describe('EvaluatorService', () => {
  function makeService(llm?: { text: string }) {
    const bus = new InMemoryEventBus();
    const config = new ConfigService(bus, {
      env: { DATABASE_URL: 'postgres://localhost:5432/test', REDIS_URL: 'redis://localhost:6379' },
      quiet: true,
    });
    const data = new DataService(config, undefined, { memoryMode: true });
    const evaluator = new EvaluatorService(bus, data, undefined, llm ? { complete: async () => ({ text: llm.text }) } : undefined);
    return { bus, data, evaluator };
  }

  it('writes a report with a composite human-likeness score and publishes the event', async () => {
    const { bus, data, evaluator } = makeService();
    const published: unknown[] = [];
    bus.subscribe('EvaluationReportCreated', (e) => published.push(e.payload));

    const result = await evaluator.evaluate({ conversationId: 'c1', messages: transcript() });
    expect(result.report.humanLikenessScore).toBeGreaterThan(0);
    expect(result.report.humanLikenessScore).toBeLessThanOrEqual(100);
    expect(published).toHaveLength(1);
    const found = await data.evaluationReports.findByConversation('c1');
    expect(found).toHaveLength(1);
    expect(found[0].metrics.naturalness).toBe(result.metrics.naturalness);
  });

  it('merges LLM-judge scores into the composite', async () => {
    const { evaluator } = makeService({ text: '{"naturalness": 42, "personality_consistency": 88}' });
    const result = await evaluator.evaluate({ conversationId: 'c1', messages: transcript() });
    expect(result.judged).toContain('naturalness');
    expect(result.metrics.naturalness).toBe(42);
    expect(result.metrics.personalityConsistency).toBe(88);
  });

  it('falls back to heuristics when the judge returns garbage', async () => {
    const { evaluator } = makeService({ text: 'não sei avaliar isso' });
    const result = await evaluator.evaluate({ conversationId: 'c1', messages: transcript() });
    expect(result.judged).toHaveLength(0);
    expect(result.metrics.naturalness).toBeGreaterThan(50);
  });

  it('evaluates on ConversationEnded automatically', async () => {
    const { bus, data, evaluator } = makeService();
    await data.messages.create({ ...msg('user', 'Olá', 5), conversationId: 'c1', id: 'x1' });
    await data.messages.create({ ...msg('agent', 'Olá!', 4), conversationId: 'c1', id: 'x2' });

    bus.publish('ConversationEnded', { conversationId: 'c1', userId: 'u1', reason: 'inactivity' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const reports = await data.evaluationReports.findByConversation('c1');
    expect(reports.length).toBe(1);
    expect(evaluator.composite(reports[0].metrics as never)).toBeGreaterThan(0);
  });
});
