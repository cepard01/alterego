import { describe, expect, it } from 'vitest';
import { ConfigService } from '@whatsapp-ai-agent/config';
import { InMemoryEventBus } from '@whatsapp-ai-agent/events';
import { DataService } from '@whatsapp-ai-agent/data';
import { IdentityEvolutionService, InterestDriftDetector, LongitudinalScheduler } from '../src/longitudinal/index.js';
import type { Thought } from '@whatsapp-ai-agent/data';

function makeThought(agentId: string, content: string, day: string): Thought {
  return {
    id: `t-${content.length}-${day}`,
    userId: agentId,
    category: 'interpretation',
    content,
    confidence: 0.7,
    relatedMemoryIds: [],
    createdAt: `${day}T12:00:00.000Z`,
    verifiedAt: null,
    verificationResult: null,
    source: 'inferred',
    verificationStatus: 'unverified',
    lastConfidenceDecayAt: `${day}T12:00:00.000Z`,
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

async function seedProfile(data: ReturnType<typeof makeData>) {
  return data.identityProfiles.upsert({
    id: 'agent-1',
    agentId: 'agent-1',
    name: 'Mariana',
    age: 29,
    backgroundSummary: '',
    education: [],
    occupation: 'designer',
    hometown: 'Porto Alegre',
    interests: ['fotografia'],
    values: [],
    beliefs: [],
    skills: [],
    familySummary: '',
    version: 1,
    lastEvolvedAt: new Date(0).toISOString(),
  });
}

describe('InterestDriftDetector', () => {
  const detector = new InterestDriftDetector();

  it('requires multi-session evidence before proposing anything', () => {
    const thoughts = [makeThought('a', 'gostei de fotografia hoje', '2026-01-01')];
    const proposals = detector.detect({ interests: [{ keyword: 'fotografia', salience: 0.5 }], thoughts });
    expect(proposals).toHaveLength(0);
  });

  it('proposes a small bounded drift with repeated evidence', () => {
    const thoughts = [
      makeThought('a', 'fotografia ficou boa demais', '2026-01-01'),
      makeThought('a', 'planejando uma sessão de fotografia no parque', '2026-01-08'),
      makeThought('a', 'comprei uma lente nova de fotografia', '2026-01-15'),
    ];
    const proposals = detector.detect({ interests: [{ keyword: 'fotografia', salience: 0.5 }], thoughts });
    expect(proposals).toHaveLength(1);
    expect(proposals[0].newSalience).toBeGreaterThan(0.5);
    expect(proposals[0].newSalience - proposals[0].oldSalience).toBeLessThanOrEqual(0.2);
  });

  it('decays salience when evidence signals waning interest', () => {
    const thoughts = [
      makeThought('a', 'cansei de fotografia', '2026-01-01'),
      makeThought('a', 'larguei a fotografia por ora', '2026-01-08'),
      makeThought('a', 'abandonei a fotografia', '2026-01-15'),
    ];
    const proposals = detector.detect({ interests: [{ keyword: 'fotografia', salience: 0.8 }], thoughts });
    expect(proposals).toHaveLength(1);
    expect(proposals[0].newSalience).toBeLessThan(0.8);
  });
});

describe('IdentityEvolutionService', () => {
  it('auto-commits interest drift with enough sessions and applies it to the profile', async () => {
    const bus = new InMemoryEventBus();
    const data = makeData();
    const service = new IdentityEvolutionService(bus, data);
    await seedProfile(data);
    const thoughts = [
      makeThought('agent-1', 'fotografia é demais', '2026-01-01'),
      makeThought('agent-1', 'mais fotografia no fim de semana', '2026-01-08'),
      makeThought('agent-1', 'fotografia de novo, adorei', '2026-01-15'),
      makeThought('agent-1', 'fotografia virou rotina', '2026-01-22'),
      makeThought('agent-1', 'fotografia semanal', '2026-01-29'),
    ];

    const result = await service.runPass({
      agentId: 'agent-1',
      interests: [{ keyword: 'fotografia', salience: 0.5 }],
      thoughts,
      autoCommitSessions: 5,
      now: () => Date.parse('2026-02-01T00:00:00Z'),
    });

    expect(result.proposals.length).toBeGreaterThanOrEqual(1);
    const drift = result.proposals.find((p) => p.fieldChanged.startsWith('interest:'));
    expect(drift).toBeTruthy();
    expect(result.committed).toContain(drift!.id);
    const profile = await data.identityProfiles.findByAgent('agent-1');
    expect(profile?.version).toBe(2);
  });

  it('surfaces weak-evidence drift for manual review instead of committing', async () => {
    const bus = new InMemoryEventBus();
    const data = makeData();
    const service = new IdentityEvolutionService(bus, data);
    await seedProfile(data);
    const thoughts = [
      makeThought('agent-1', 'fotografia legal', '2026-01-01'),
      makeThought('agent-1', 'fotografia de novo', '2026-01-08'),
      makeThought('agent-1', 'mais fotografia', '2026-01-15'),
    ];

    const result = await service.runPass({
      agentId: 'agent-1',
      interests: [{ keyword: 'fotografia', salience: 0.5 }],
      thoughts,
      autoCommitSessions: 5,
    });

    const drift = result.proposals.find((p) => p.fieldChanged.startsWith('interest:'));
    expect(drift?.status).toBe('proposed');
    expect(result.surfaced).toContain(drift!.id);
    expect(result.committed).not.toContain(drift!.id);
  });

  it('resolves completed goals into timeline events and inventory items', async () => {
    const bus = new InMemoryEventBus();
    const data = makeData();
    const service = new IdentityEvolutionService(bus, data);
    await seedProfile(data);
    await data.goals.create({
      id: 'goal-1',
      agentId: 'agent-1',
      category: 'purchase',
      title: 'Comprar uma câmera',
      description: 'Economizando para uma câmera nova',
      status: 'active',
      progress: 1,
    });

    const result = await service.runPass({ agentId: 'agent-1', interests: [], thoughts: [], now: () => Date.now() });

    const goalProposal = result.proposals.find((p) => p.fieldChanged.startsWith('goal:'));
    expect(goalProposal).toBeTruthy();
    expect(result.committed).toContain(goalProposal!.id);
    const timeline = await data.timelineEvents.listSince('agent-1', '1970-01-01T00:00:00.000Z');
    expect(timeline.some((e) => e.title.includes('câmera'))).toBe(true);
    const inventory = await data.inventoryItems.listByAgent('agent-1');
    expect(inventory.some((i) => i.name === 'Comprar uma câmera')).toBe(true);
    const goals = await data.goals.listActive('agent-1');
    expect(goals).toHaveLength(0);
  });

  it('proposes but never auto-commits the personality aging nudge', async () => {
    const bus = new InMemoryEventBus();
    const data = makeData();
    const service = new IdentityEvolutionService(bus, data);
    await seedProfile(data);
    const profile = await data.identityProfiles.findByAgent('agent-1');

    const result = await service.runPass({
      agentId: 'agent-1',
      interests: [],
      thoughts: [],
      agingMinIntervalMs: 0,
      now: () => Date.now(),
    });
    void profile;
    const aging = result.proposals.find((p) => p.fieldChanged === 'personality_version');
    expect(aging?.status).toBe('proposed');
    expect(result.committed).not.toContain(aging!.id);
  });
});

describe('LongitudinalScheduler', () => {
  it('registers the evolution job and schedules it recurring', () => {
    let registered: string | null = null;
    const scheduled: Array<{ type: string; intervalMs: number }> = [];
    const scheduler = {
      register: (type: string) => {
        registered = type;
      },
      scheduleRecurring: (type: string, intervalMs: number) => {
        scheduled.push({ type, intervalMs });
      },
    };
    let runs = 0;
    new LongitudinalScheduler(scheduler).start({
      intervalMs: 7 * 24 * 60 * 60 * 1000,
      runPass: async () => {
        runs += 1;
      },
    });
    expect(registered).toBe('longitudinal.evolution');
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].intervalMs).toBe(7 * 24 * 60 * 60 * 1000);
    void runs;
  });
});
