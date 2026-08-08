// FalseMemorySimulator — v3 §7. Low-probability, low-confidence memory
// entries that are subtly wrong. Used sparingly, always on low-stakes facts
// (dates/details of non-consequential events), never on consequential facts.

import type { EventBus } from '@alterego/events';
import type { Thought } from '@alterego/data';
import { FalseMemoryOptions } from './types.js';

interface ThoughtRepo {
  create(thought: Omit<Thought, 'id' | 'createdAt' | 'verifiedAt' | 'verificationResult' | 'lastConfidenceDecayAt'> & { id?: string; createdAt?: string }): Promise<Thought>;
}

interface MemorySeed {
  id: string;
  content: string;
}

/** Low-stakes alterations applied to a memory's detail (v3 §7). */
const SUBTLE_ALTERATIONS = [
  (content: string) => content.replace(/(\d{1,2})\s+de\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/i, (_, day: string, month: string) => `${Math.max(1, Number(day) + (Math.random() < 0.5 ? 1 : -1))} de ${month}`),
  (content: string) => content.replace(/(\d{1,2}):(\d{2})/g, (_, h: string, m: string) => `${h}:${m[0]}${Math.floor(Math.random() * 6)}`),
  (content: string) => content.replace(/(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/i, (month: string) => (month === 'junho' ? 'julho' : month === 'julho' ? 'junho' : month)),
];

const LOW_STAKE_MARKERS = ['almoç', 'café', 'filme', 'passei', 'série', 'jogo', 'festa', 'aniversário', 'mercado', 'praia', 'trilh', 'concerto'];

export class FalseMemorySimulator {
  constructor(
    private readonly bus: EventBus,
    private readonly repo: ThoughtRepo,
    private readonly options: FalseMemoryOptions = {},
  ) {}

  /**
   * Called once per session end. Returns the created false-memory thought,
   * or undefined when the roll doesn't hit or no low-stakes seed exists.
   */
  async maybePlantFalseMemory(userId: string, seeds: MemorySeed[]): Promise<Thought | undefined> {
    const chance = this.options.chancePerSession ?? 0.02;
    if (Math.random() > chance) return undefined;

    const candidates = seeds.filter((seed) => LOW_STAKE_MARKERS.some((marker) => seed.content.toLowerCase().includes(marker)));
    if (candidates.length === 0) return undefined;

    const seed = candidates[Math.floor(Math.random() * candidates.length)];
    const alteration = SUBTLE_ALTERATIONS[Math.floor(Math.random() * SUBTLE_ALTERATIONS.length)];
    const altered = alteration(seed.content);
    if (altered === seed.content) return undefined;

    const created = await this.repo.create({
      userId,
      category: 'thought',
      content: `Acho que ${altered.toLowerCase()}`,
      confidence: 0.15 + Math.random() * 0.1,
      relatedMemoryIds: [seed.id],
      source: 'false_memory_simulated',
      verificationStatus: 'unverified',
    });
    this.bus.publish('ThoughtCreated', {
      thoughtId: created.id,
      userId,
      category: created.category,
      confidence: created.confidence,
    });
    return created;
  }
}
