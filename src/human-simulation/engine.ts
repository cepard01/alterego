// HumanSimulationEngine — the "is this even a moment where a human would
// engage, and as what kind of person-right-now?" decision (v2 §1). It does
// not talk to the LLM; its output becomes a Behavior Rule downstream.

import type { EventBus } from '@whatsapp-ai-agent/events';
import { DecideInput, ReasoningThought, SimulatedAction, SimulatedActionType } from './types.js';
import { TimingModel } from './timing-model.js';
import { StickerSelector } from './sticker-selector.js';

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export class HumanSimulationEngine {
  private readonly rng: () => number;

  constructor(
    private readonly bus: EventBus,
    private readonly timingModel: TimingModel,
    private readonly stickerSelector?: StickerSelector,
    rng: () => number = Math.random,
  ) {
    this.rng = rng;
  }

  async decide(input: DecideInput): Promise<SimulatedAction> {
    const world = input.worldState;
    const action = await this.selectAction(input);

    const timing = this.timingModel.computeDelay({
      availability: world?.availability ?? 0.7,
      focusLevel: world?.focusLevel ?? 0.6,
      activity: world?.activity ?? 'idle',
      relationshipImportance: input.relationshipStrength,
      messageImportance: input.messageImportance,
      messageComplexity: input.messageComplexity,
      timeOfDay: input.timeOfDay,
      responseLengthChars: input.responseLengthChars,
      wordsPerMinute: input.wordsPerMinute,
    });

    if (input.messageId) {
      this.bus.publish('BehaviorDecided', {
        messageId: input.messageId,
        conversationId: input.conversationId,
        decision: action.type,
        params: { ...action.params, confidence: action.confidence, totalDelayMs: timing.totalDelayMs },
      });
    }

    return { ...action, timing };
  }

  private async selectAction(input: DecideInput): Promise<Omit<SimulatedAction, 'timing'>> {
    const world = input.worldState;
    const availability = world?.availability ?? 0.7;
    const focus = world?.focusLevel ?? 0.6;
    const energy = world?.energyLevel ?? 0.7;
    const sleepState = world?.sleepState ?? 'awake';
    const night = (input.timeOfDay ?? 12) >= 23 || (input.timeOfDay ?? 12) < 7;
    const importance = input.messageImportance;

    const reasoning: ReasoningThought[] = [];

    // Asleep: the agent physically isn't there.
    if (sleepState === 'asleep') {
      reasoning.push({ category: 'thought', content: 'Estou dormindo — só respondo se for urgente.', confidence: 0.9, relatedMemoryIds: [] });
      if (importance > 0.75) {
        return { type: 'delayed_reply', confidence: 0.8, reasoning, params: { reason: 'asleep_but_important' } };
      }
      return { type: 'go_idle', confidence: 0.95, reasoning, params: { reason: 'asleep' } };
    }

    // Drowsy or dead battery at night: appear offline.
    if (sleepState === 'drowsy' || (night && energy < 0.2)) {
      reasoning.push({ category: 'thought', content: 'Bateria baixa, quase dormindo — finjo que não vi.', confidence: 0.7, relatedMemoryIds: [] });
      return { type: 'appear_offline', confidence: 0.7, reasoning, params: { reason: 'drowsy' } };
    }

    // Forget on purpose: weak relationship, and the user references shared
    // history the agent would rather not engage with.
    if (input.relationshipStrength < 0.2 && /\b(lembra|lembra-se|aquilo|aquele)\b/i.test(input.messageContent) && this.rng() < 0.3) {
      reasoning.push({ category: 'interpretation', content: 'Prefiro não trazer essa memória à tona agora.', confidence: 0.6, relatedMemoryIds: [] });
      return { type: 'forget_on_purpose', confidence: 0.6, reasoning, params: { reason: 'low_trust' } };
    }

    // Change subject: repetitive topic and the agent is curious about
    // something new.
    const repetitive = (input.recentTopics ?? []).some((topic) =>
      topic.split(/\s+/).some((word) => word.length > 4 && input.messageContent.toLowerCase().includes(word.toLowerCase())),
    );
    if (repetitive && this.rng() < 0.25) {
      reasoning.push({ category: 'thought', content: 'A gente já falou disso várias vezes — melhor mudar de assunto.', confidence: 0.7, relatedMemoryIds: [] });
      return { type: 'change_subject', confidence: 0.7, reasoning, params: { reason: 'repetitive' } };
    }

    // Busy with very low availability: delay or ignore.
    if (availability < 0.15) {
      reasoning.push({ category: 'thought', content: 'Estou ocupado — respondo quando der.', confidence: 0.75, relatedMemoryIds: [] });
      if (importance > 0.6 || this.rng() < 0.5) {
        return { type: 'delayed_reply', confidence: 0.7, reasoning, params: { reason: 'busy' } };
      }
      return { type: 'ignore', confidence: 0.7, reasoning, params: { reason: 'busy' } };
    }

    // Volume-driven pressure (v3 §6): high load biases toward terse engagement.
    if (input.cognitiveLoad > 0.7 && this.rng() < 0.35) {
      reasoning.push({ category: 'thought', content: 'Muita coisa acontecendo ao mesmo tempo — resposta curta e distraída.', confidence: 0.65, relatedMemoryIds: [] });
      return { type: 'appear_distracted', confidence: 0.65, reasoning, params: { reason: 'cognitive_load' } };
    }

    // Baseline ignore probability (Behavior Profile) anchored + load/fatigue.
    const ignoreBaseline = input.ignoreProbabilityBaseline ?? 0.05;
    const ignoreRoll = ignoreBaseline + input.cognitiveLoad * 0.2 + (1 - availability) * 0.1;
    if (this.rng() < ignoreRoll) {
      reasoning.push({ category: 'thought', content: 'Vou deixar essa pra lá por enquanto.', confidence: 0.6, relatedMemoryIds: [] });
      return { type: 'ignore', confidence: 0.6, reasoning, params: { reason: 'baseline_ignore' } };
    }

    // Multi-message: baseline + social energy + high interest.
    const multiBaseline = input.multiMessageProbabilityBaseline ?? 0.2;
    if (this.rng() < multiBaseline && input.conversationLength > 2) {
      reasoning.push({ category: 'thought', content: 'Vou mandar em várias mensagens, mais natural.', confidence: 0.6, relatedMemoryIds: [] });
      return { type: 'multi_message', confidence: 0.6, reasoning, params: { reason: 'baseline_multi' } };
    }

    // Sticker/emoji: familiarity + casual context + low focus bias toward
    // non-composed output (v2 §6 action selector).
    const familiar = input.relationshipStrength > 0.5;
    const lowFocus = focus < 0.4;
    const casual = /(kkk|haha|legal|que bom|kk|rs|hue)/i.test(input.messageContent) || input.messageContent.length < 60;
    if (familiar && (lowFocus || casual) && this.rng() < (casual ? 0.25 : 0.12)) {
      if (this.stickerSelector) {
        const sticker = await this.stickerSelector.select({
          intent: 'joke',
          emotion: 'happy',
          userId: input.userId,
          contextTag: 'casual',
        });
        if (sticker) {
          reasoning.push({ category: 'thought', content: 'Esse sticker cai bem aqui.', confidence: 0.8, relatedMemoryIds: [] });
          return { type: 'sticker', confidence: 0.8, reasoning, params: { stickerId: sticker.id, fileUrl: sticker.fileUrl } };
        }
      }
      reasoning.push({ category: 'thought', content: 'Uma reação rápida resolve.', confidence: 0.7, relatedMemoryIds: [] });
      return { type: 'emoji_reaction', confidence: 0.7, reasoning, params: { emoji: '😂' } };
    }

    // Low focus while replying: appear distracted.
    if (focus < 0.3) {
      reasoning.push({ category: 'thought', content: 'Distraído — resposta mais curta e menos atenta.', confidence: 0.7, relatedMemoryIds: [] });
      return { type: 'appear_distracted', confidence: 0.7, reasoning, params: { reason: 'low_focus' } };
    }

    // Default: plain reply.
    reasoning.push({ category: 'thought', content: 'Dá pra responder normalmente agora.', confidence: clamp01(0.5 + availability * 0.3), relatedMemoryIds: [] });
    return { type: 'reply', confidence: 0.8, reasoning, params: {} };
  }
}

export type { SimulatedAction, SimulatedActionType };
