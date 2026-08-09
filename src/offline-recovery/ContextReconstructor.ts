// ContextReconstructor — how much history to load per gap length (v3 §8):
// raw messages (short gap) / compressed summary (medium gap) / summary +
// unanswered questions only (long gap).

import type { Message } from '@alterego/data';
import type { FreshnessStrategy } from './FreshnessScorer.js';

export type ReconstructedContextType = 'raw' | 'summary' | 'summary_plus_questions';

export interface ReconstructedContext {
  type: ReconstructedContextType;
  /** Raw messages to inject (kept small for medium/long gaps). */
  messages: Message[];
  /** Compressed summary of the missed span (medium/long gaps). */
  summary: string | null;
  /** Explicit questions left hanging during the gap (long gaps). */
  unansweredQuestions: string[];
}

const RAW_MESSAGE_CAP = 12;
const SUMMARY_MESSAGE_CAP = 5;

export interface ReconstructorInput {
  strategy: FreshnessStrategy;
  gapMs: number;
  messages: Message[];
  unansweredQuestions: string[];
  /** Compression hook — falls back to a coarse head/tail summary. */
  summarize?: (messages: Message[]) => string;
}

export class ContextReconstructor {
  reconstruct(input: ReconstructorInput): ReconstructedContext {
    const gapHours = input.gapMs / 3_600_000;
    const sorted = [...input.messages].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    // Long gap: summary + unanswered questions only.
    if (gapHours > 72) {
      return {
        type: 'summary_plus_questions',
        messages: sorted.slice(-RAW_MESSAGE_CAP),
        summary: this.summarize(input, sorted),
        unansweredQuestions: input.unansweredQuestions,
      };
    }

    // Medium gap: raw messages beyond a cap compressed into a summary.
    if (gapHours > 2) {
      const kept = sorted.slice(-RAW_MESSAGE_CAP);
      const overflow = sorted.slice(0, -RAW_MESSAGE_CAP);
      return {
        type: 'summary',
        messages: kept,
        summary: overflow.length > 0 ? this.summarize(input, overflow) : null,
        unansweredQuestions: input.unansweredQuestions.slice(0, SUMMARY_MESSAGE_CAP),
      };
    }

    // Short gap: raw messages as normal.
    return {
      type: 'raw',
      messages: sorted.slice(-RAW_MESSAGE_CAP),
      summary: null,
      unansweredQuestions: [],
    };
  }

  private summarize(input: ReconstructorInput, messages: Message[]): string {
    if (input.summarize) return input.summarize(messages);
    const head = messages.slice(0, 3);
    const tail = messages.slice(-3);
    const parts = [...head, ...tail].map((m) => `${m.sender === 'user' ? 'Usuário' : 'Você'}: ${m.content.slice(0, 120)}`);
    return `Resumo do período offline (${messages.length} mensagens): ${parts.join(' | ')}`;
  }
}

