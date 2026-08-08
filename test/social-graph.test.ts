import { describe, expect, it } from 'vitest';
import { ConfigService } from '@whatsapp-ai-agent/config';
import { InMemoryEventBus } from '@whatsapp-ai-agent/events';
import { DataService } from '@whatsapp-ai-agent/data';
import { SocialGraphService } from '../src/social-graph/index.js';

function makeService() {
  const bus = new InMemoryEventBus();
  const config = new ConfigService(bus, {
    env: { DATABASE_URL: 'postgres://localhost:5432/test', REDIS_URL: 'redis://localhost:6379' },
    quiet: true,
  });
  return new SocialGraphService(bus, new DataService(config, undefined, { memoryMode: true }));
}

describe('SocialGraphService', () => {
  it('creates a tentative edge on first mention', async () => {
    const service = makeService();
    const edge = await service.noteMention({
      fromUserId: 'user-1',
      fromDisplayName: 'Ana',
      mentionedUserId: 'user-2',
      mentionedDisplayName: 'Carlos',
      edgeType: 'friend',
      sharedInterest: 'fotografia',
    });
    expect(edge.strength).toBeCloseTo(0.1, 5);
    expect(edge.edgeType).toBe('friend');
    expect(edge.sharedInterests).toEqual(['fotografia']);
  });

  it('corroboration bonus strengthens repeated consistent mentions', async () => {
    const service = makeService();
    await service.noteMention({ fromUserId: 'user-1', fromDisplayName: 'Ana', mentionedUserId: 'user-2', mentionedDisplayName: 'Carlos' });
    await service.noteMention({ fromUserId: 'user-1', fromDisplayName: 'Ana', mentionedUserId: 'user-2', mentionedDisplayName: 'Carlos', edgeType: 'friend' });
    const edges = await service.edgesForUser('user-1');
    const edge = edges.find((e) => e.toUserId === 'user-2')!;
    expect(edge.strength).toBeGreaterThan(0.1);
    expect(edge.interactionFrequency).toBe(1);
  });

  it('boosts memory ranking for mentioned people (social relevance)', async () => {
    const service = makeService();
    await service.noteMention({ fromUserId: 'user-1', fromDisplayName: 'Ana', mentionedUserId: 'user-2', mentionedDisplayName: 'Carlos', edgeType: 'friend' });
    await service.noteMention({ fromUserId: 'user-1', fromDisplayName: 'Ana', mentionedUserId: 'user-3', mentionedDisplayName: 'Bia' });

    const boost = await service.socialRelevance('user-1', ['user-2', 'user-9']);
    expect(boost.get('user-2')).toBeGreaterThan(0);
    expect(boost.has('user-3')).toBe(false);
    expect(boost.has('user-9')).toBe(false);
  });

  it('stores per-contact behavior variance on the edge (v2 §11)', async () => {
    const service = makeService();
    await service.noteMention({ fromUserId: 'user-1', fromDisplayName: 'Ana', mentionedUserId: 'user-2', mentionedDisplayName: 'Carlos' });
    await service.setPerContactVariance('user-1', 'user-2', { verbosity: 0.8, energy: 0.7 });
    const variance = await service.perContactVariance('user-1', 'user-2');
    expect(variance).toEqual({ verbosity: 0.8, energy: 0.7 });

    const untouched = await service.perContactVariance('user-1', 'user-3');
    expect(untouched).toEqual({});
  });

  it('emits RelationshipEdgeUpdated on mention', async () => {
    const bus = new InMemoryEventBus();
    const config = new ConfigService(bus, {
      env: { DATABASE_URL: 'postgres://localhost:5432/test', REDIS_URL: 'redis://localhost:6379' },
      quiet: true,
    });
    const service = new SocialGraphService(bus, new DataService(config, undefined, { memoryMode: true }));
    let received = 0;
    bus.subscribe('RelationshipEdgeUpdated', () => {
      received += 1;
    });
    await service.noteMention({ fromUserId: 'user-1', fromDisplayName: 'Ana', mentionedUserId: 'user-2', mentionedDisplayName: 'Carlos' });
    expect(received).toBe(1);
  });

  it('creates and lists clusters', async () => {
    const service = makeService();
    await service.createCluster({ memberUserIds: ['user-1', 'user-2'], clusterLabel: 'amigos da faculdade', cohesionScore: 0.7 });
    const clusters = await service.listClusters();
    expect(clusters).toHaveLength(1);
    expect(clusters[0].clusterLabel).toBe('amigos da faculdade');
  });
});
