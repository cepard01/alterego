// HeuristicScorer — deterministic post-session metrics (v2 §9), computed
// without an LLM so results are testable and stable. The optional LLM-judge
// pass (EvaluatorService) augments these, never replaces them.

import type { Message } from '@alterego/data';

export interface ReplyTimingExpectation {
  meanMs: number;
  stdDevMs: number;
}

export interface HeuristicInput {
  messages: Message[];
  /** Number of detected memory contradictions in this session (v3 §7). */
  contradictionCount?: number;
  /** Expected reply delay distribution from the Timing Model (v2 §7). */
  expectedReplyDelays?: ReplyTimingExpectation;
  /** Historical per-action-type decision rates, e.g. { reply: 0.7, ignore: 0.05 } */
  behaviorHistory?: Record<string, number>;
  /** Observed per-action-type counts this session. */
  behaviorObserved?: Record<string, number>;
  /** Personality emoji-frequency target (0-1, v1 §7). */
  emojiFrequencyTarget?: number;
  /** Expected number of stickers per 100 messages. */
  stickerPerHundredTarget?: number;
}

export interface HeuristicResult {
  naturalness: number;
  behaviorConsistency: number;
  personalityConsistency: number;
  memoryConsistency: number;
  conversationFlow: number;
  latencyRealism: number;
  mediaUsage: number;
}

export const HUMAN_LIKENESS_WEIGHTS: Record<keyof HeuristicResult, number> = {
  naturalness: 0.25,
  behaviorConsistency: 0.15,
  personalityConsistency: 0.15,
  memoryConsistency: 0.15,
  conversationFlow: 0.1,
  latencyRealism: 0.1,
  mediaUsage: 0.1,
};

const MAX_SINGLE_BUBBLE_CHARS = 400;
const ROBOTIC_DELAY_MS = 1000;
const UNNATURAL_DELAY_MS = 30 * 60 * 1000;
const INTERRUPTION_WINDOW_MS = 2000;

export class HeuristicScorer {
  score(input: HeuristicInput): HeuristicResult {
    return {
      naturalness: this.naturalness(input.messages),
      behaviorConsistency: this.behaviorConsistency(input.behaviorHistory, input.behaviorObserved),
      personalityConsistency: 100,
      memoryConsistency: this.memoryConsistency(input.contradictionCount ?? 0),
      conversationFlow: this.conversationFlow(input.messages),
      latencyRealism: this.latencyRealism(input.messages, input.expectedReplyDelays),
      mediaUsage: this.mediaUsage(input.messages, input.emojiFrequencyTarget, input.stickerPerHundredTarget),
    };
  }

  private naturalness(messages: Message[]): number {
    const agentReplies = messages.filter((m) => m.sender === 'agent');
    if (agentReplies.length === 0) return 100;
    let penalties = 0;
    for (const reply of agentReplies) {
      if (reply.content.length > MAX_SINGLE_BUBBLE_CHARS) penalties += 1;
      const delay = this.delayBefore(reply, messages);
      if (delay !== null && (delay < ROBOTIC_DELAY_MS || delay > UNNATURAL_DELAY_MS)) penalties += 1;
    }
    return Math.max(0, 100 - (penalties / agentReplies.length) * 60);
  }

  private conversationFlow(messages: Message[]): number {
    const users = messages.filter((m) => m.sender === 'user').length;
    const agents = messages.filter((m) => m.sender === 'agent').length;
    const balance = users === 0 || agents === 0 ? 0.5 : Math.min(users, agents) / Math.max(users, agents);

    let interruptions = 0;
    for (let i = 1; i < messages.length; i++) {
      const prev = messages[i - 1];
      const curr = messages[i];
      if (prev.sender === 'agent' && curr.sender === 'user') {
        const gap = Date.parse(curr.timestamp) - Date.parse(prev.timestamp);
        if (gap < INTERRUPTION_WINDOW_MS) interruptions += 1;
      }
    }
    const interruptionPenalty = interruptions > 0 ? Math.min(0.3, interruptions * 0.1) : 0;
    return Math.max(0, Math.round(50 + 50 * balance - interruptionPenalty * 100));
  }

  private latencyRealism(messages: Message[], expected?: ReplyTimingExpectation): number {
    if (!expected || expected.stdDevMs <= 0) return 100;
    const delays = messages
      .filter((m) => m.sender === 'agent')
      .map((m) => this.delayBefore(m, messages))
      .filter((d): d is number => d !== null);
    if (delays.length === 0) return 100;
    const avgDeviation =
      delays.reduce((sum, d) => sum + Math.min(2.5, Math.abs(d - expected.meanMs) / expected.stdDevMs) / 2.5, 0) /
      delays.length;
    return Math.max(0, Math.round(100 - 40 * avgDeviation));
  }

  private mediaUsage(messages: Message[], emojiTarget = 0.3, stickerPerHundredTarget = 2): number {
    const agentMessages = messages.filter((m) => m.sender === 'agent');
    if (agentMessages.length === 0) return 100;
    const emojiCount = agentMessages.reduce(
      (sum, m) => sum + (m.content.match(/\p{Extended_Pictographic}/gu) ?? []).length,
      0,
    );
    const actualEmoji = emojiCount / agentMessages.length;
    const stickerCount = messages.filter((m) => m.sender === 'agent' && m.mediaId).length;
    const actualStickerPerHundred = (stickerCount / agentMessages.length) * 100;

    const emojiScore = Math.max(0, 1 - Math.abs(actualEmoji - emojiTarget) / Math.max(emojiTarget, 0.01));
    const stickerScore = Math.max(
      0,
      1 - Math.abs(actualStickerPerHundred - stickerPerHundredTarget) / Math.max(stickerPerHundredTarget, 1),
    );
    return Math.round(((emojiScore + stickerScore) / 2) * 100);
  }

  private memoryConsistency(contradictionCount: number): number {
    return Math.max(0, Math.round(100 - contradictionCount * 50));
  }

  private behaviorConsistency(history?: Record<string, number>, observed?: Record<string, number>): number {
    if (!history || !observed || Object.keys(history).length === 0) return 100;
    const totalObserved = Object.values(observed).reduce((a, b) => a + b, 0);
    if (totalObserved === 0) return 100;
    let deviation = 0;
    for (const [type, rate] of Object.entries(history)) {
      const expected = rate * totalObserved;
      const actual = observed[type] ?? 0;
      deviation += Math.abs(actual - expected) / Math.max(1, totalObserved);
    }
    return Math.max(0, Math.round(100 - 100 * Math.min(1, deviation)));
  }

  private delayBefore(reply: Message, messages: Message[]): number | null {
    const index = messages.indexOf(reply);
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].sender === 'user') {
        return Date.parse(reply.timestamp) - Date.parse(messages[i].timestamp);
      }
    }
    return null;
  }
}
