import { describe, expect, it } from 'vitest';
import { InMemoryEventBus } from '@whatsapp-ai-agent/events';
import { ConfigService } from '@whatsapp-ai-agent/config';
import { DataService } from '@whatsapp-ai-agent/data';
import { MemoryManager } from '../src/index.js';

function makeManager(): { manager: MemoryManager; data: DataService } {
  const bus = new InMemoryEventBus();
  const config = new ConfigService(bus, {
    env: { DATABASE_URL: 'postgres://localhost:5432/test', REDIS_URL: 'redis://localhost:6379' },
    quiet: true,
  });
  const data = new DataService(config, undefined, { memoryMode: true });
  const manager = new MemoryManager({ bus, data });
  return { manager, data };
}

describe('MemoryManager', () => {
  it('remembers and recalls a fact', async () => {
    const { manager } = makeManager();
    const memory = await manager.remember({
      userId: 'u1',
      type: 'fact',
      content: 'trabalha em turno noturno',
      importance: 0.9,
      source: 'user_stated',
    });
    expect(memory.id).toBeTruthy();
    expect(memory.verificationStatus).toBe('unverified');

    const recalled = await manager.recall('u1', undefined, undefined, 5);
    expect(recalled.map((m) => m.content)).toContain('trabalha em turno noturno');
  });

  it('emits MemoryCreated events', async () => {
    const bus = new InMemoryEventBus();
    const config = new ConfigService(bus, {
      env: { DATABASE_URL: 'postgres://localhost:5432/test', REDIS_URL: 'redis://localhost:6379' },
      quiet: true,
    });
    const data = new DataService(config, undefined, { memoryMode: true });
    const manager = new MemoryManager({ bus, data });

    const created: string[] = [];
    bus.subscribe('MemoryCreated', (event) => created.push(`${event.payload.type}:${event.payload.userId}`));

    await manager.remember({ userId: 'u1', type: 'preference', content: 'gosta de café sem açúcar' });
    expect(created).toEqual(['preference:u1']);
  });

  it('detects contradictions and marks the old memory contradicted', async () => {
    const bus = new InMemoryEventBus();
    const config = new ConfigService(bus, {
      env: { DATABASE_URL: 'postgres://localhost:5432/test', REDIS_URL: 'redis://localhost:6379' },
      quiet: true,
    });
    const data = new DataService(config, undefined, { memoryMode: true });
    const manager = new MemoryManager({ bus, data });

    const contradictions: string[] = [];
    bus.subscribe('MemoryContradiction', (event) => contradictions.push(event.payload.contradictionId));

    await manager.remember({ userId: 'u1', type: 'fact', content: 'me mudo para São Paulo em junho', confidence: 0.9 });
    await manager.remember({ userId: 'u1', type: 'fact', content: 'minha mudança para São Paulo foi em julho', confidence: 0.9 });

    expect(contradictions.length).toBeGreaterThan(0);
    const memories = await data.memory.listByUser('u1');
    const contradicted = memories.filter((m) => m.verificationStatus === 'contradicted');
    expect(contradicted.length).toBeGreaterThan(0);
  });

  it('does not flag unrelated memories as contradictions', async () => {
    const { manager } = makeManager();
    await manager.remember({ userId: 'u1', type: 'fact', content: 'gosto de correr de manhã', confidence: 0.9 });
    const memory = await manager.remember({ userId: 'u1', type: 'fact', content: 'pedalei vinte quilômetros ontem', confidence: 0.9 });
    expect(memory.verificationStatus).toBe('unverified');
  });

  it('keeps per-turn working memory isolated between turns', async () => {
    const { manager } = makeManager();
    const first = manager.createWorkingMemory();
    first.set('intent', 'greeting');
    const second = manager.createWorkingMemory();
    expect(second.get('intent')).toBeUndefined();
    expect(first.get('intent')).toBe('greeting');
  });

  it('tracks recent conversation messages', async () => {
    const { manager } = makeManager();
    const conversationMemory = manager.getConversationMemory();
    await conversationMemory.append('c1', { role: 'user', content: 'oi', timestamp: new Date().toISOString() });
    await conversationMemory.append('c1', { role: 'agent', content: 'olá!', timestamp: new Date().toISOString() });
    await conversationMemory.setTopicStack('c1', ['trabalho', 'viagem']);

    const recent = await conversationMemory.getRecent('c1', 10);
    expect(recent.map((m) => m.role)).toEqual(['user', 'agent']);
    expect(await conversationMemory.getTopicStack('c1')).toEqual(['trabalho', 'viagem']);
  });
});
