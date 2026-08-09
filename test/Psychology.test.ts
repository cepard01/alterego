import { describe, expect, it } from 'vitest';
import { ConfigService } from '@alterego/config';
import { InMemoryEventBus } from '@alterego/events';
import { DataService } from '@alterego/data';
import { CognitiveLoadService, PsychologyService, WorldStateService } from '../src/psychology/Index.js';
import type { CalendarBridge } from '../src/psychology/Index.js';

function makeServices() {
  const bus = new InMemoryEventBus();
  const config = new ConfigService(bus, {
    env: { DATABASE_URL: 'postgres://localhost:5432/test', REDIS_URL: 'redis://localhost:6379' },
    quiet: true,
  });
  const data = new DataService(config, undefined, { memoryMode: true });
  const calendar: CalendarBridge = { calendarActiveAt: async () => [] };
  const worldState = new WorldStateService(bus, data.worldState, calendar);
  const psychology = new PsychologyService(bus, data.psychology);
  const cognitiveLoad = new CognitiveLoadService();
  return { bus, data, worldState, psychology, cognitiveLoad, calendar };
}

describe('WorldStateService', () => {
  it('seeds and advances a bounded world state', async () => {
    const { worldState } = makeServices();
    const seeded = await worldState.tick({ agentId: 'agent-1', at: '2026-08-08T14:00:00.000Z' });
    expect(seeded.activity).toBe('idle');
    expect(seeded.energyLevel).toBeGreaterThanOrEqual(0);
    expect(seeded.energyLevel).toBeLessThanOrEqual(1);
    expect(seeded.deviceBattery).toBeGreaterThanOrEqual(0);
    expect(seeded.deviceBattery).toBeLessThanOrEqual(100);
  });

  it('sleeps deterministically at night', async () => {
    const { worldState } = makeServices();
    const state = await worldState.tick({ agentId: 'agent-1', at: '2026-08-08T03:00:00.000Z' });
    expect(state.sleepState).toBe('asleep');
    expect(state.activity).toBe('sleeping');
    expect(state.availability).toBe(0);
  });

  it('calendar override takes priority over probabilistic ticks', async () => {
    const { worldState, calendar } = makeServices();
    calendar.calendarActiveAt = async () => [
      { title: 'Dentista', worldStateOverride: { activity: 'appointment', availabilityDelta: -0.5 } },
    ];
    const state = await worldState.tick({ agentId: 'agent-1', at: '2026-08-10T14:30:00.000Z' });
    expect(state.activity).toBe('appointment');
    expect(state.availability).toBeCloseTo(0.2, 5);
  });

  it('emits WorldStateUpdated on tick', async () => {
    const { bus, worldState } = makeServices();
    let received = 0;
    bus.subscribe('WorldStateUpdated', () => {
      received += 1;
    });
    await worldState.tick({ agentId: 'agent-1', at: '2026-08-08T14:00:00.000Z' });
    expect(received).toBe(1);
  });
});

describe('PsychologyService', () => {
  it('evolves trust asymmetrically: slow growth, sharp drop', async () => {
    const { psychology } = makeServices();
    for (let i = 0; i < 5; i += 1) {
      await psychology.noteTurn('user-1', { sentiment: 'positive' });
    }
    const positive = await psychology.get('user-1');
    expect(positive.trust).toBeGreaterThan(0.3);

    await psychology.noteTurn('user-1', { sentiment: 'negative' });
    const negative = await psychology.get('user-1');
    expect(negative.trust).toBeLessThan(positive.trust);
  });

  it('spikes curiosity on novel topics, decays on repetition', async () => {
    const { psychology } = makeServices();
    await psychology.noteTurn('user-1', { topicNovelty: 'novel' });
    const novel = await psychology.get('user-1');
    expect(novel.curiosity).toBeCloseTo(0.58, 5);

    for (let i = 0; i < 3; i += 1) {
      await psychology.noteTurn('user-1', { topicNovelty: 'repetitive' });
    }
    const repetitive = await psychology.get('user-1');
    expect(repetitive.curiosity).toBeLessThan(novel.curiosity);
  });

  it('fatigue rises during a session and resets on ConversationEnded', async () => {
    const { bus, psychology } = makeServices();
    for (let i = 0; i < 10; i += 1) {
      await psychology.noteTurn('user-1');
    }
    const fatigued = await psychology.get('user-1');
    expect(fatigued.conversationFatigue).toBeCloseTo(0.3, 5);

    bus.publish('ConversationEnded', { conversationId: 'conv-1', userId: 'user-1', reason: 'inactivity' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const reset = await psychology.get('user-1');
    expect(reset.conversationFatigue).toBe(0);
  });

  it('external stress from World State raises the internal stress variable', async () => {
    const { psychology } = makeServices();
    await psychology.noteTurn('user-1', { externalStress: 0.9 });
    const stressed = await psychology.get('user-1');
    expect(stressed.stress).toBeGreaterThan(0.3);
  });

  it('emits PsychologyUpdated with the changed variables', async () => {
    const { bus, psychology } = makeServices();
    let received: Record<string, number> | undefined;
    bus.subscribe('PsychologyUpdated', ({ payload }) => {
      received = payload.changes;
    });
    await psychology.noteTurn('user-1', { sentiment: 'negative' });
    expect(received?.trust).toBeLessThan(0.3);
    expect(received?.conversationFatigue).toBeGreaterThan(0);
  });
});

describe('CognitiveLoadService', () => {
  it('scores 0 with no load and rises with volume', async () => {
    const service = new CognitiveLoadService();
    expect(service.recompute({ unreadCount: 0, activeConversationCount: 0, recentComplexityAvg: 0 }).score).toBe(0);

    const high = service.recompute({ unreadCount: 40, activeConversationCount: 6, recentComplexityAvg: 250 });
    expect(high.score).toBeGreaterThan(0.8);
    expect(high.score).toBeLessThanOrEqual(1);
  });

  it('keeps a bounded rolling log', async () => {
    const service = new CognitiveLoadService();
    for (let i = 0; i < 150; i += 1) {
      service.recompute({ unreadCount: i % 10, activeConversationCount: 2, recentComplexityAvg: 50 });
    }
    expect(service.recentScores()).toHaveLength(100);
  });

  it('reports contributing factors', async () => {
    const service = new CognitiveLoadService();
    const score = service.recompute({ unreadCount: 10, activeConversationCount: 2, recentComplexityAvg: 80 });
    expect(score.contributingFactors.unreadCount).toBe(10);
  });
});

