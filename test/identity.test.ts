import { describe, expect, it } from 'vitest';
import { ConfigService } from '@whatsapp-ai-agent/config';
import { InMemoryEventBus } from '@whatsapp-ai-agent/events';
import { DataService } from '@whatsapp-ai-agent/data';
import { IdentityService } from '../src/identity/index.js';

function makeService(): IdentityService {
  const bus = new InMemoryEventBus();
  const config = new ConfigService(bus, {
    env: { DATABASE_URL: 'postgres://localhost:5432/test', REDIS_URL: 'redis://localhost:6379' },
    quiet: true,
  });
  return new IdentityService(new DataService(config, undefined, { memoryMode: true }));
}

describe('IdentityService', () => {
  it('seeds and snapshots an identity profile', async () => {
    const service = makeService();
    await service.ensureProfile('agent-1', {
      name: 'Ana',
      age: 27,
      backgroundSummary: 'designer gráfica de Lisboa',
      education: ['Design de Comunicação'],
      occupation: 'designer gráfica',
      hometown: 'Lisboa',
      interests: ['fotografia', 'bass', 'trilhas'],
      values: ['independência', 'curiosidade'],
      beliefs: [],
      skills: ['illustrator', 'bateria'],
      familySummary: 'irmã mais nova',
    });

    const snapshot = await service.snapshot('agent-1');
    expect(snapshot?.name).toBe('Ana');
    expect(snapshot?.age).toBe(27);
    expect(snapshot?.interests).toContain('fotografia');
  });

  it('records and retrieves timeline events', async () => {
    const service = makeService();
    await service.addTimelineEvent({
      agentId: 'agent-1',
      eventType: 'trip',
      title: 'Trekking em Patagônia',
      description: 'uma semana no parque Torres del Paine',
      occurredAt: '2026-03-10T00:00:00.000Z',
      relatedIdentityFields: ['interests'],
      relatedMemoryIds: [],
      importanceScore: 0.8,
    });

    const events = await service.timelineSince('agent-1', '2026-01-01T00:00:00.000Z');
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Trekking em Patagônia');

    const empty = await service.timelineSince('agent-1', '2026-12-01T00:00:00.000Z');
    expect(empty).toHaveLength(0);
  });

  it('tracks goals and resolves them into timeline + inventory', async () => {
    const service = makeService();
    const goal = await service.addGoal({
      agentId: 'agent-1',
      category: 'purchase',
      title: 'Comprar uma moto',
      description: 'guardar para uma moto usada',
      targetDate: '2027-01-01T00:00:00.000Z',
    });
    await service.updateGoalProgress(goal.id, 0.5);
    const goals = await service.activeGoals('agent-1');
    expect(goals).toHaveLength(1);
    expect(goals[0].progress).toBe(0.5);

    const result = await service.resolveGoal(goal, {
      status: 'achieved',
      timelineEvent: {
        eventType: 'purchase',
        title: 'Comprei a moto',
        description: 'uma Yamaha 125 usada',
        occurredAt: new Date().toISOString(),
        relatedIdentityFields: ['interests'],
        importanceScore: 0.7,
      },
      inventoryItem: {
        category: 'vehicle',
        name: 'Yamaha 125',
        description: 'moto usada',
        sentiment: 'favorite',
        stillOwned: true,
      },
    });

    expect(result.timelineEvent).toBeDefined();
    expect(result.inventoryItem).toBeDefined();
    const resolved = await service.activeGoals('agent-1');
    expect(resolved).toHaveLength(0);
    const owned = await service.inventory('agent-1');
    expect(owned.map((item) => item.name)).toContain('Yamaha 125');
    expect(owned[0].linkedGoalId).toBe(goal.id);
  });

  it('finds active calendar entries at a given instant', async () => {
    const service = makeService();
    await service.addCalendarEntry({
      agentId: 'agent-1',
      type: 'one_off',
      title: 'Dentista',
      category: 'appointment',
      startAt: '2026-08-10T14:00:00.000Z',
      endAt: '2026-08-10T15:00:00.000Z',
      worldStateOverride: { activity: 'appointment', availabilityDelta: -1 },
    });

    const active = await service.calendarActiveAt('2026-08-10T14:30:00.000Z', 'agent-1');
    expect(active).toHaveLength(1);
    expect(active[0].title).toBe('Dentista');

    const none = await service.calendarActiveAt('2026-08-10T16:00:00.000Z', 'agent-1');
    expect(none).toHaveLength(0);
  });
});
