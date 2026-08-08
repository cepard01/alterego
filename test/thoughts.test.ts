import { describe, expect, it } from 'vitest';
import { ConfigService } from '@whatsapp-ai-agent/config';
import { InMemoryEventBus } from '@whatsapp-ai-agent/events';
import { DataService } from '@whatsapp-ai-agent/data';
import { FalseMemorySimulator, ThoughtGenerator, ThoughtVerifier } from '../src/thoughts/index.js';
import type { LlmCompleter } from '../src/thoughts/index.js';

function makeServices() {
  const bus = new InMemoryEventBus();
  const config = new ConfigService(bus, {
    env: { DATABASE_URL: 'postgres://localhost:5432/test', REDIS_URL: 'redis://localhost:6379' },
    quiet: true,
  });
  return { bus, data: new DataService(config, undefined, { memoryMode: true }) };
}

describe('ThoughtGenerator', () => {
  it('writes LLM-produced thoughts and emits ThoughtCreated', async () => {
    const { bus, data } = makeServices();
    const llm: LlmCompleter = {
      complete: async () => ({
        content: JSON.stringify({
          thoughts: [
            { category: 'interpretation', content: 'Isso provavelmente significa estresse no trabalho', confidence: 0.6, relatedMemoryIds: [] },
            { category: 'prediction', content: 'Vai voltar a falar disso no fim de semana', confidence: 0.4, relatedMemoryIds: [] },
          ],
        }),
      }),
    };
    const generator = new ThoughtGenerator(bus, data.thoughts, llm, { generationChance: 1 });
    const created = await generator.generateAfterTurn({
      userId: 'user-1',
      conversationId: 'conv-1',
      transcript: [{ role: 'user', content: 'tô exausto, muita coisa no trabalho' }],
    });

    expect(created).toHaveLength(2);
    expect(created[0].category).toBe('interpretation');
    expect(created[0].source).toBe('agent_generated');

    const stored = await data.thoughts.listByUser('user-1');
    expect(stored).toHaveLength(2);
  });

  it('falls back to deterministic thoughts when the LLM fails', async () => {
    const { bus, data } = makeServices();
    const llm: LlmCompleter = { complete: async () => { throw new Error('provider down'); } };
    const generator = new ThoughtGenerator(bus, data.thoughts, llm, { generationChance: 1 });
    const created = await generator.generateAfterTurn({
      userId: 'user-1',
      conversationId: 'conv-1',
      transcript: [
        { role: 'user', content: 'a gente precisa conversar sobre o orçamento da viagem que planejamos para o feriado' },
      ],
    });
    expect(created.length).toBeGreaterThanOrEqual(1);
    expect(created[0].category).toBe('thought');
  });
});

describe('ThoughtVerifier', () => {
  it('confirms predictions matching the observed outcome', async () => {
    const { bus, data } = makeServices();
    const verifier = new ThoughtVerifier(bus, data.thoughts);
    await data.thoughts.create({
      userId: 'user-1',
      category: 'prediction',
      content: 'Eles vão falar sobre a viagem de novo',
      confidence: 0.5,
      relatedMemoryIds: [],
      source: 'agent_generated',
      verificationStatus: 'unverified',
    });

    let verified: string | undefined;
    bus.subscribe('ThoughtVerified', ({ payload }) => {
      verified = payload.verificationResult;
    });

    const results = await verifier.verifyAgainstOutcome('user-1', 'falamos da viagem e decidimos a data');
    expect(results).toHaveLength(1);
    expect(results[0].verificationStatus).toBe('confirmed');
    expect(verified).toBe('confirmed');
  });

  it('marks contradicting outcomes as contradicted', async () => {
    const { bus, data } = makeServices();
    const verifier = new ThoughtVerifier(bus, data.thoughts);
    const thought = await data.thoughts.create({
      userId: 'user-1',
      category: 'prediction',
      content: 'Vão comprar os ingressos na sexta',
      confidence: 0.5,
      relatedMemoryIds: [],
      source: 'agent_generated',
      verificationStatus: 'unverified',
    });

    const results = await verifier.verifyAgainstOutcome('user-1', 'não compramos nada, desistimos');
    expect(results).toHaveLength(1);
    expect(results[0].verificationStatus).toBe('contradicted');
    const stored = await data.thoughts.findById(thought.id);
    expect(stored?.verificationResult).toBe('contradicted');
  });

  it('decays confidence of old unverified thoughts and expires the lowest', async () => {
    const { data } = makeServices();
    const verifier = new ThoughtVerifier(new InMemoryEventBus(), data.thoughts);
    const old = await data.thoughts.create({
      userId: 'user-1',
      category: 'thought',
      content: 'Detalhe antigo qualquer',
      confidence: 0.5,
      relatedMemoryIds: [],
      source: 'agent_generated',
      verificationStatus: 'unverified',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const weak = await data.thoughts.create({
      userId: 'user-1',
      category: 'thought',
      content: 'Detalhe bem fraco',
      confidence: 0.22,
      relatedMemoryIds: [],
      source: 'agent_generated',
      verificationStatus: 'unverified',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    await verifier.decayConfidence('user-1', '2026-06-01T00:00:00.000Z');

    const afterOld = await data.thoughts.findById(old.id);
    expect(afterOld?.confidence).toBeCloseTo(0.45, 5);
    const afterWeak = await data.thoughts.findById(weak.id);
    expect(afterWeak?.verificationStatus).toBe('expired');
  });
});

describe('FalseMemorySimulator', () => {
  it('does not plant false memories on consequential facts', async () => {
    const { bus, data } = makeServices();
    const simulator = new FalseMemorySimulator(bus, data.thoughts, { chancePerSession: 1 });
    const created = await simulator.maybePlantFalseMemory('user-1', [
      { id: 'mem-1', content: 'A irmã dela se chama Ana e mora em Lisboa' },
    ]);
    expect(created).toBeUndefined();
  });

  it('plants a subtle low-confidence alteration on a low-stakes memory', async () => {
    const { bus, data } = makeServices();
    const simulator = new FalseMemorySimulator(bus, data.thoughts, { chancePerSession: 1 });
    const created = await simulator.maybePlantFalseMemory('user-1', [
      { id: 'mem-1', content: 'Almoçamos juntos no dia 5 de junho' },
    ]);
    expect(created).toBeDefined();
    expect(created!.confidence).toBeLessThan(0.3);
    expect(created!.source).toBe('false_memory_simulated');
    expect(created!.relatedMemoryIds).toEqual(['mem-1']);
    expect(created!.content).not.toBe('Almoçamos juntos no dia 5 de junho');
  });
});
