// Shared types for World State, Psychology, and Cognitive Load (v2 §2, §8; v3 §6).

/** Structural slice of identity's CalendarEntry used for calendar overrides (v3 §5). */
export interface CalendarOverride {
  activity?: string;
  locationContext?: string;
  availabilityDelta?: number;
}

/** Narrow bridge so psychology doesn't import identity directly. */
export interface CalendarBridge {
  calendarActiveAt(instant: string, agentId: string): Promise<Array<{ title: string; worldStateOverride?: CalendarOverride }>>;
}

export interface WorldStateTickInput {
  agentId: string;
  at?: string;
}

export interface PsychologyTurnInput {
  userId: string;
  /** Sentiment of the user's latest message — drives asymmetric trust/comfort. */
  sentiment?: 'positive' | 'neutral' | 'negative';
  /** Topic novelty — spikes curiosity/interest, decays on repetition. */
  topicNovelty?: 'novel' | 'repetitive' | 'neutral';
  /** External stress push from World State (0-1). */
  externalStress?: number;
  /** Fatigue added by this turn; defaults to a small increment. */
  fatigueIncrement?: number;
}

export interface CognitiveLoadInput {
  unreadCount: number;
  activeConversationCount: number;
  /** Average message length in tokens — proxy for complexity (v3 §6). */
  recentComplexityAvg: number;
}

export interface CognitiveLoadScore {
  score: number;
  contributingFactors: {
    unreadCount: number;
    activeConversationCount: number;
    recentComplexityAvg: number;
  };
  computedAt: string;
}

export const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
