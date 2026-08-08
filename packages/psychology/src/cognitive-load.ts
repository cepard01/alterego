// CognitiveLoadService — volume-driven degradation (v3 §6). Distinct from
// Energy/Stress/Focus: captures "40 unread messages across 6 conversations".
// Ephemeral by design — a rolling log of recent scores, not persisted state.

import { clamp01, CognitiveLoadInput, CognitiveLoadScore } from './types.js';

const LOG_SIZE = 100;

export class CognitiveLoadService {
  private current: CognitiveLoadScore = {
    score: 0,
    contributingFactors: { unreadCount: 0, activeConversationCount: 0, recentComplexityAvg: 0 },
    computedAt: new Date().toISOString(),
  };
  private log: CognitiveLoadScore[] = [];

  /** Recompute on each World State tick (v3 §6). */
  recompute(input: CognitiveLoadInput): CognitiveLoadScore {
    const { unreadCount, activeConversationCount, recentComplexityAvg } = input;

    // Each factor saturates: 30+ unread ~ full weight, 5+ conversations ~
    // full weight, 200+ tokens avg ~ full weight. Combined load is a bounded
    // 0-1 score — no open-ended randomness, purely input-driven.
    const unreadFactor = 1 - Math.exp(-unreadCount / 15);
    const concurrencyFactor = 1 - Math.exp(-activeConversationCount / 3);
    const complexityFactor = 1 - Math.exp(-recentComplexityAvg / 100);

    const score = clamp01(0.45 * unreadFactor + 0.35 * concurrencyFactor + 0.2 * complexityFactor);

    this.current = { score, contributingFactors: { unreadCount, activeConversationCount, recentComplexityAvg }, computedAt: new Date().toISOString() };
    this.log.push(this.current);
    if (this.log.length > LOG_SIZE) this.log.shift();
    return this.current;
  }

  score(): CognitiveLoadScore {
    return this.current;
  }

  /** Rolling log for the Evaluation module (v3 §6). */
  recentScores(): CognitiveLoadScore[] {
    return [...this.log];
  }
}
