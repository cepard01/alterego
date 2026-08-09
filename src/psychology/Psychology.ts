// PsychologyService — per-relationship slow-evolving variables (v2 §8).
// Each variable has its own decay/growth function; conversation fatigue
// resets on ConversationEnded. Emits PsychologyUpdated after each turn.

import type { EventBus } from '@alterego/events';
import type { PsychologyState } from '@alterego/data';
import { clamp01, PsychologyTurnInput } from './Types.js';

interface PsychologyRepo {
  upsert(state: Omit<PsychologyState, 'updatedAt'>): Promise<PsychologyState>;
  find(userId: string): Promise<PsychologyState | undefined>;
  updateVariables(userId: string, changes: Partial<Omit<PsychologyState, 'userId' | 'updatedAt'>>): Promise<void>;
}

type Variables = Omit<PsychologyState, 'userId' | 'updatedAt'>;

const BASELINE: Variables = {
  curiosity: 0.5,
  trust: 0.3,
  patience: 0.5,
  interest: 0.5,
  socialEnergy: 0.5,
  empathy: 0.5,
  confidence: 0.5,
  stress: 0.3,
  comfort: 0.4,
  conversationFatigue: 0,
};

export class PsychologyService {
  constructor(
    private readonly bus: EventBus,
    private readonly repo: PsychologyRepo,
  ) {
    // conversation_fatigue resets on session close (v2 §8).
    this.bus.subscribe('ConversationEnded', async ({ payload }) => {
      await this.resetFatigue(payload.userId);
    });
  }

  async get(userId: string): Promise<PsychologyState> {
    const existing = await this.repo.find(userId);
    if (existing) return existing;
    const created = await this.repo.upsert({ userId, ...BASELINE });
    return created;
  }

  /** Evolve the variables after one conversational turn (v2 §8). */
  async noteTurn(userId: string, input: Partial<PsychologyTurnInput> = {}): Promise<PsychologyState> {
    const current = await this.get(userId);
    const changes: Partial<Variables> = {};

    // Asymmetric trust/comfort: slow growth, sharp drop on negative (v2 §8).
    const sentiment = input.sentiment ?? 'neutral';
    if (sentiment === 'positive') {
      changes.trust = clamp01(current.trust + 0.02);
      changes.comfort = clamp01(current.comfort + 0.02);
      changes.socialEnergy = clamp01(current.socialEnergy + 0.01);
      changes.stress = clamp01(current.stress - 0.01);
    } else if (sentiment === 'negative') {
      changes.trust = clamp01(current.trust - 0.1);
      changes.comfort = clamp01(current.comfort - 0.08);
      changes.socialEnergy = clamp01(current.socialEnergy - 0.02);
      changes.stress = clamp01(current.stress + 0.05);
    } else {
      changes.stress = clamp01(current.stress - 0.005);
    }

    // Topic-sensitive curiosity/interest (v2 §8).
    const novelty = input.topicNovelty ?? 'neutral';
    if (novelty === 'novel') {
      changes.curiosity = clamp01(current.curiosity + 0.08);
      changes.interest = clamp01(current.interest + 0.06);
    } else if (novelty === 'repetitive') {
      changes.curiosity = clamp01(current.curiosity - 0.05);
      changes.interest = clamp01(current.interest - 0.05);
    }

    // Fatigue rises within a session; patience erodes as fatigue grows.
    const fatigueIncrement = input.fatigueIncrement ?? 0.03;
    const conversationFatigue = clamp01(current.conversationFatigue + fatigueIncrement);
    changes.conversationFatigue = conversationFatigue;
    changes.patience = clamp01(current.patience - 0.01 - conversationFatigue * 0.02);

    // External stress from World State feeds the internal variable.
    if (input.externalStress !== undefined) {
      changes.stress = clamp01((changes.stress ?? current.stress) * 0.7 + input.externalStress * 0.3);
    }

    await this.repo.updateVariables(userId, changes);
    this.bus.publish('PsychologyUpdated', { userId, changes });
    const updated = await this.repo.find(userId);
    return updated ?? { userId, ...BASELINE, ...changes, updatedAt: new Date().toISOString() };
  }

  /** Called on ConversationEnded — only fatigue resets; others persist. */
  private async resetFatigue(userId: string): Promise<void> {
    const current = await this.repo.find(userId);
    if (!current || current.conversationFatigue === 0) return;
    const changes: Partial<Variables> = {
      conversationFatigue: 0,
      // Patience partially recovers once the session pressure is gone.
      patience: clamp01(current.patience + 0.05),
    };
    await this.repo.updateVariables(userId, changes);
    this.bus.publish('PsychologyUpdated', { userId, changes });
  }
}

