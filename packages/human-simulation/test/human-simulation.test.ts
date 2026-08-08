import { describe, expect, it } from 'vitest';
import { ConfigService } from '@whatsapp-ai-agent/config';
import { InMemoryEventBus } from '@whatsapp-ai-agent/events';
import { DataService } from '@whatsapp-ai-agent/data';
import { HumanSimulationEngine, StickerSelector, TimingModel } from '../src/index.js';
import type { DecideInput } from '../src/index.js';

function makeInput(overrides: Partial<DecideInput> = {}): DecideInput {
  return {
    userId: 'user-1',
    conversationId: 'conv-1',
    messageId: 'msg-1',
    messageContent: 'oi! tudo bem?',
    messageImportance: 0.5,
    messageComplexity: 0.2,
    hasMedia: false,
    cognitiveLoad: 0,
    relationshipStrength: 0.6,
    recentThoughts: [],
    conversationLength: 5,
    responseLengthChars: 120,
    timeOfDay: 14,
    ...overrides,
  };
}

function makeEngine(bus = new InMemoryEventBus(), rng: () => number = () => 0.5) {
  const config = new ConfigService(bus, {
    env: { DATABASE_URL: 'postgres://localhost:5432/test', REDIS_URL: 'redis://localhost:6379' },
    quiet: true,
  });
  const data = new DataService(config, undefined, { memoryMode: true });
  return new HumanSimulationEngine(bus, new TimingModel(), new StickerSelector(data.stickers), rng);
}

describe('HumanSimulationEngine', () => {
  it('replies normally in a healthy state', async () => {
    const engine = makeEngine();
    const action = await engine.decide(makeInput({ ignoreProbabilityBaseline: 0, multiMessageProbabilityBaseline: 0 }));
    expect(action.type).toBe('reply');
    expect(action.timing.totalDelayMs).toBeGreaterThan(0);
    expect(action.reasoning.length).toBeGreaterThan(0);
  });

  it('goes idle while asleep', async () => {
    const engine = makeEngine();
    const action = await engine.decide(
      makeInput({ worldState: { id: 'w1', agentId: 'agent-1', activity: 'sleeping', locationContext: 'home', availability: 0, energyLevel: 0.3, stressLevel: 0.1, focusLevel: 0, deviceBattery: 40, sleepState: 'asleep', currentActivityDetail: 'dormindo', updatedAt: new Date().toISOString() } }),
    );
    expect(action.type).toBe('go_idle');
  });

  it('delays replies when very busy and the message is important', async () => {
    const engine = makeEngine();
    const action = await engine.decide(
      makeInput({
        messageImportance: 0.9,
        worldState: { id: 'w1', agentId: 'agent-1', activity: 'working', locationContext: 'home', availability: 0.05, energyLevel: 0.5, stressLevel: 0.5, focusLevel: 0.7, deviceBattery: 60, sleepState: 'awake', currentActivityDetail: 'no trabalho', updatedAt: new Date().toISOString() },
      }),
    );
    expect(action.type).toBe('delayed_reply');
  });

  it('appears offline when drowsy at night', async () => {
    const engine = makeEngine();
    const action = await engine.decide(
      makeInput({
        timeOfDay: 2,
        worldState: { id: 'w1', agentId: 'agent-1', activity: 'idle', locationContext: 'home', availability: 0.2, energyLevel: 0.1, stressLevel: 0.2, focusLevel: 0.1, deviceBattery: 15, sleepState: 'drowsy', currentActivityDetail: 'quase dormindo', updatedAt: new Date().toISOString() },
      }),
    );
    expect(action.type).toBe('appear_offline');
  });

  it('emits BehaviorDecided when a messageId is present', async () => {
    const bus = new InMemoryEventBus();
    const engine = makeEngine(bus);
    let decision: string | undefined;
    bus.subscribe('BehaviorDecided', ({ payload }) => {
      decision = payload.decision;
    });
    await engine.decide(makeInput());
    expect(decision).toBeDefined();
  });

  it('can pick a sticker when one matches the context', async () => {
    const bus = new InMemoryEventBus();
    const config = new ConfigService(bus, {
      env: { DATABASE_URL: 'postgres://localhost:5432/test', REDIS_URL: 'redis://localhost:6379' },
      quiet: true,
    });
    const data = new DataService(config, undefined, { memoryMode: true });
    await data.stickers.create({
      packId: 'pack-1',
      fileUrl: 'https://example.com/st1.webp',
      emotionTags: ['happy'],
      intentTags: ['joke'],
      humorLevel: 0.7,
      contextTags: ['casual', 'playful'],
      replyProbabilityWeight: 0.6,
      preferredContactIds: [],
    });
    // rng 0.1: passes the ignore/multi gates and the sticker roll (0.25).
    const engine = new HumanSimulationEngine(bus, new TimingModel(), new StickerSelector(data.stickers), () => 0.1);
    const action = await engine.decide(
      makeInput({ messageContent: 'kkkkk que legal!', relationshipStrength: 0.8, ignoreProbabilityBaseline: 0, multiMessageProbabilityBaseline: 0 }),
    );
    expect(action.type).toBe('sticker');
    expect(action.params.stickerId).toBeDefined();
  });
});

describe('TimingModel', () => {
  it('produces a coherent timing plan', () => {
    const model = new TimingModel();
    const plan = model.computeDelay({
      availability: 0.8,
      focusLevel: 0.9,
      activity: 'idle',
      relationshipImportance: 0.5,
      messageImportance: 0.5,
      messageComplexity: 0.2,
      timeOfDay: 14,
      responseLengthChars: 200,
      wordsPerMinute: 40,
    });
    expect(plan.readDelayMs).toBeGreaterThan(0);
    expect(plan.typingDurationMs).toBeGreaterThan(0);
    expect(plan.totalDelayMs).toBe(plan.readDelayMs + plan.typingStartDelayMs + plan.typingDurationMs + plan.sendDelayMs);
  });

  it('takes longer when busy and typing more', () => {
    const model = new TimingModel();
    const busy = model.computeDelay({ availability: 0.1, focusLevel: 0.2, activity: 'working', relationshipImportance: 0.3, messageImportance: 0.4, messageComplexity: 0.6, responseLengthChars: 500, wordsPerMinute: 40 });
    const free = model.computeDelay({ availability: 0.9, focusLevel: 0.9, activity: 'idle', relationshipImportance: 0.3, messageImportance: 0.4, messageComplexity: 0.2, responseLengthChars: 60, wordsPerMinute: 40 });
    expect(busy.typingDurationMs).toBeGreaterThan(free.typingDurationMs);
  });

  it('applies the activity curve multiplier from the behavior profile (v2 §7)', () => {
    const model = new TimingModel();
    const slow = model.computeDelay({ availability: 0.5, focusLevel: 0.5, activity: 'idle', relationshipImportance: 0.3, messageImportance: 0.5, messageComplexity: 0.2, timeOfDay: 1, activityCurve: { '1': 3 }, responseLengthChars: 100, wordsPerMinute: 40 });
    const normal = model.computeDelay({ availability: 0.5, focusLevel: 0.5, activity: 'idle', relationshipImportance: 0.3, messageImportance: 0.5, messageComplexity: 0.2, timeOfDay: 14, responseLengthChars: 100, wordsPerMinute: 40 });
    expect(slow.readDelayMs).toBeGreaterThan(normal.readDelayMs * 1.5);
  });
});

describe('StickerSelector', () => {
  it('picks the best matching sticker and avoids the last-used one', async () => {
    const bus = new InMemoryEventBus();
    const config = new ConfigService(bus, {
      env: { DATABASE_URL: 'postgres://localhost:5432/test', REDIS_URL: 'redis://localhost:6379' },
      quiet: true,
    });
    const data = new DataService(config, undefined, { memoryMode: true });
    await data.stickers.create({ packId: 'p1', fileUrl: 'a.webp', emotionTags: ['happy'], intentTags: ['joke'], humorLevel: 0.6, contextTags: ['casual'], replyProbabilityWeight: 0.5, preferredContactIds: [] });
    await data.stickers.create({ packId: 'p1', fileUrl: 'c.webp', emotionTags: ['happy'], intentTags: ['joke'], humorLevel: 0.7, contextTags: ['casual'], replyProbabilityWeight: 0.5, preferredContactIds: [] });
    await data.stickers.create({ packId: 'p1', fileUrl: 'b.webp', emotionTags: ['sad'], intentTags: ['comfort'], humorLevel: 0.2, contextTags: ['serious_reply_ok'], replyProbabilityWeight: 0.5, preferredContactIds: [] });

    const selector = new StickerSelector(data.stickers);
    const picked = await selector.select({ intent: 'joke', emotion: 'happy', userId: 'user-1', contextTag: 'casual', humorLevel: 0.7 });
    expect(picked?.fileUrl).toBe('c.webp');

    // Recency: the same sticker is never picked back-to-back (v2 §6).
    const again = await selector.select({ intent: 'joke', emotion: 'happy', userId: 'user-1', contextTag: 'casual', humorLevel: 0.7, lastUsedStickerId: picked?.id });
    expect(again?.fileUrl).toBe('a.webp');
    const fresh = await data.stickers.list();
    expect(fresh.find((s) => s.fileUrl === 'a.webp')?.usageFrequency).toBe(1);
  });

  it('respects preferred contact affinity', async () => {
    const bus = new InMemoryEventBus();
    const config = new ConfigService(bus, {
      env: { DATABASE_URL: 'postgres://localhost:5432/test', REDIS_URL: 'redis://localhost:6379' },
      quiet: true,
    });
    const data = new DataService(config, undefined, { memoryMode: true });
    await data.stickers.create({ packId: 'p1', fileUrl: 'c.webp', emotionTags: ['happy'], intentTags: ['joke'], humorLevel: 0.6, contextTags: ['casual'], replyProbabilityWeight: 0.5, preferredContactIds: ['user-2'] });
    const selector = new StickerSelector(data.stickers);
    const picked = await selector.select({ intent: 'joke', emotion: 'happy', userId: 'user-1', contextTag: 'casual' });
    expect(picked).toBeUndefined();
  });
});
