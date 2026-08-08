// FreshnessScorer — per-conversation score and strategy (v3 §8). Decides
// how to handle a conversation after a downtime gap. All thresholds are
// fixed so behaviour is deterministic and testable.

export type FreshnessStrategy =
  | 'respond_normally'
  | 'respond_with_summary_awareness'
  | 'respond_with_soft_acknowledgment'
  | 'skip_silently'
  | 'reopen_selectively';

export interface FreshnessInput {
  /** Milliseconds since the last message in this conversation. */
  gapMs: number;
  /** 0-1 social-graph relationship strength (v2 §4). */
  relationshipStrength: number;
  /** 0-1 — has the subject clearly moved on / resolved itself? */
  topicStaleness: number;
  /** Number of unread messages accumulated during the gap. */
  unreadCount: number;
  /** A direct question left hanging weighs toward NOT skipping. */
  hasUnansweredQuestion: boolean;
}

export interface FreshnessResult {
  freshness: number;
  strategy: FreshnessStrategy;
  gapHours: number;
}

// Weights from v3 §8: recency * w1 + relationship * w2 - staleness * w3
// - gap_penalty * w4 + question_bonus.
const W1 = 0.35;
const W2 = 0.3;
const W3 = 0.25;
const W4 = 0.2;
const QUESTION_BONUS = 0.4;

export class FreshnessScorer {
  score(input: FreshnessInput): FreshnessResult {
    const gapHours = input.gapMs / 3_600_000;
    const recency = Math.max(0, 1 - gapHours / 48);
    const gapPenalty = Math.min(1, gapHours / 72);
    const questionBonus = input.hasUnansweredQuestion ? QUESTION_BONUS : 0;

    const freshness = Math.min(
      1,
      Math.max(
        0,
        recency * W1 +
          input.relationshipStrength * W2 -
          input.topicStaleness * W3 -
          gapPenalty * W4 +
          questionBonus,
      ),
    );

    const strategy = this.chooseStrategy(input, gapHours, freshness);
    return { freshness, strategy, gapHours };
  }

  private chooseStrategy(input: FreshnessInput, gapHours: number, freshness: number): FreshnessStrategy {
    if (input.unreadCount >= 3 && gapHours > 24 && freshness >= 0.3) {
      return 'reopen_selectively';
    }
    if (input.hasUnansweredQuestion && gapHours <= 24 && freshness >= 0.35) {
      return gapHours <= 2 ? 'respond_normally' : 'respond_with_summary_awareness';
    }
    if (input.hasUnansweredQuestion && freshness >= 0.4) {
      return 'respond_with_soft_acknowledgment';
    }
    if (gapHours <= 2) {
      return freshness >= 0.4 ? 'respond_normally' : 'skip_silently';
    }
    if (gapHours <= 24) {
      return freshness >= 0.5 ? 'respond_with_summary_awareness' : 'skip_silently';
    }
    if (gapHours <= 72) {
      return freshness >= 0.45 ? 'respond_with_soft_acknowledgment' : 'skip_silently';
    }
    return 'skip_silently';
  }
}
