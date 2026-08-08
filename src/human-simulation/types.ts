// Shared types for the Human Simulation Engine (v2 §1, §6, §7).

import type { Thought, WorldState } from '@alterego/data';

export type SimulatedActionType =
  | 'reply'
  | 'ignore'
  | 'emoji_reaction'
  | 'sticker'
  | 'delayed_reply'
  | 'multi_message'
  | 'go_idle'
  | 'appear_offline'
  | 'change_subject'
  | 'forget_on_purpose'
  | 'appear_distracted';

export interface TimingPlan {
  readDelayMs: number;
  typingStartDelayMs: number;
  typingDurationMs: number;
  sendDelayMs: number;
  totalDelayMs: number;
}

export interface ReasoningThought {
  category: 'thought' | 'interpretation' | 'prediction';
  content: string;
  confidence: number;
  relatedMemoryIds: string[];
}

export interface SimulatedAction {
  type: SimulatedActionType;
  timing: TimingPlan;
  confidence: number;
  /** Internal only — never surfaced to the user (v2 §1). */
  reasoning: ReasoningThought[];
  params: Record<string, unknown>;
}

export interface DecideInput {
  userId: string;
  conversationId: string;
  messageId?: string;
  messageContent: string;
  /** 0-1 — how much this message matters (user urgency, emotional weight). */
  messageImportance: number;
  /** 0-1 — token-length proxy for parsing effort. */
  messageComplexity: number;
  hasMedia: boolean;
  worldState?: WorldState;
  /** 0-1 cognitive load score (v3 §6). */
  cognitiveLoad: number;
  relationshipStrength: number;
  recentThoughts: Thought[];
  /** Topics already covered this session — drives change_subject. */
  recentTopics?: string[];
  conversationLength: number;
  responseLengthChars?: number;
  ignoreProbabilityBaseline?: number;
  multiMessageProbabilityBaseline?: number;
  wordsPerMinute?: number;
  /** hour (0-23) — from activity curve modulation (v2 §7). */
  timeOfDay?: number;
}

export interface TimingInput {
  availability: number;
  focusLevel: number;
  activity: string;
  relationshipImportance: number;
  messageImportance: number;
  messageComplexity: number;
  timeOfDay?: number;
  dayOfWeek?: number;
  responseLengthChars?: number;
  wordsPerMinute?: number;
  /** hour -> multiplier map from BehaviorProfile.activity_curve (v2 §7). */
  activityCurve?: Record<string, unknown>;
}

export interface StickerSelectionInput {
  intent: string;
  emotion: string;
  userId: string;
  contextTag: string;
  /** Avoid repeating the same sticker back-to-back (v2 §6 recency penalty). */
  lastUsedStickerId?: string;
  humorLevel?: number;
}
