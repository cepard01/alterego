// Sticker Selector — invoked when the engine picks `sticker` (v2 §6).
// score = emotion_match*w1 + context_match*w2 + relationship_affinity*w3
//         - recency_penalty

import type { Sticker } from '@whatsapp-ai-agent/data';
import { StickerSelectionInput } from './types.js';

interface StickerRepo {
  list(): Promise<Sticker[]>;
  registerUsage(id: string): Promise<void>;
}

const WEIGHTS = { emotion: 0.35, context: 0.25, affinity: 0.2, replyWeight: 0.2 };
const RECENCY_PENALTY = 0.3;
const MIN_SCORE = 0.15;

function overlap(list: string[], target: string): number {
  return list.some((tag) => tag.toLowerCase() === target.toLowerCase() || tag.toLowerCase().includes(target.toLowerCase())) ? 1 : 0;
}

export class StickerSelector {
  constructor(private readonly repo: StickerRepo) {}

  async select(input: StickerSelectionInput): Promise<Sticker | undefined> {
    const stickers = await this.repo.list();
    if (stickers.length === 0) return undefined;

    let best: Sticker | undefined;
    let bestScore = MIN_SCORE;
    for (const sticker of stickers) {
      if (sticker.id === input.lastUsedStickerId) continue;
      if (sticker.preferredContactIds.length > 0 && !sticker.preferredContactIds.includes(input.userId)) continue;

      const emotionMatch = overlap(sticker.emotionTags, input.emotion);
      const contextMatch = overlap(sticker.contextTags, input.contextTag);
      const intentMatch = overlap(sticker.intentTags, input.intent);
      const humorFit = Math.max(0, 1 - Math.abs((sticker.humorLevel ?? 0.5) - (input.humorLevel ?? 0.5)));

      const score =
        emotionMatch * WEIGHTS.emotion +
        contextMatch * WEIGHTS.context +
        (intentMatch + humorFit) * 0.5 * WEIGHTS.affinity +
        (sticker.replyProbabilityWeight ?? 0.5) * WEIGHTS.replyWeight;

      if (score > bestScore) {
        best = sticker;
        bestScore = score;
      }
    }

    if (best) {
      await this.repo.registerUsage(best.id);
    }
    return best;
  }
}
