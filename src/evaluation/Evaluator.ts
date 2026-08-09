// EvaluatorService — post-session scoring of naturalness, consistency and
// human-likeness (v2 §9). Subscribes to ConversationEnded, runs a heuristic
// pass (always) plus an optional LLM-judge pass (when a router is provided),
// and writes an EvaluationReport.

import type { EvaluationReport, Message } from '@alterego/data';
import type { EventBus } from '@alterego/events';
import type { LLMRequest } from '@alterego/llm';
import { HeuristicResult, HeuristicScorer, HUMAN_LIKENESS_WEIGHTS, ReplyTimingExpectation } from './Heuristics.js';

export interface EvaluationDataPort {
  evaluationReports: {
    create(report: Omit<EvaluationReport, 'id' | 'createdAt'> & { id?: string }): Promise<EvaluationReport>;
  };
  messages: {
    listByConversation(conversationId: string, limit?: number, offset?: number): Promise<Message[]>;
  };
}

export interface LlmJudge {
  complete(request: LLMRequest): Promise<{ text: string }>;
}

export interface EvaluateInput {
  conversationId: string;
  messages?: Message[];
  contradictionCount?: number;
  expectedReplyDelays?: ReplyTimingExpectation;
  behaviorHistory?: Record<string, number>;
  behaviorObserved?: Record<string, number>;
  emojiFrequencyTarget?: number;
  stickerPerHundredTarget?: number;
}

export interface EvaluationResult {
  report: EvaluationReport;
  metrics: HeuristicResult;
  /** Scores overridden by the LLM judge, if it produced anything. */
  judged: string[];
}

const JUDGE_PROMPT = (transcript: string): string =>
  [
    'Você é um avaliador de simulação humana em conversas de WhatsApp.',
    'Avalie o transcript abaixo e responda APENAS com JSON válido:',
    '{"naturalness": 0-100, "personality_consistency": 0-100}',
    'naturalness: quão natural é o ritmo, o tamanho das mensagens e o vocabulário.',
    'personality_consistency: quão consistente é o estilo com uma pessoa única.',
    'TRANSCRIPT:\n' + transcript,
  ].join('\n');

export class EvaluatorService {
  constructor(
    private readonly bus: EventBus,
    private readonly data: EvaluationDataPort,
    private readonly scorer: HeuristicScorer = new HeuristicScorer(),
    private readonly llm?: LlmJudge,
  ) {
    this.bus.subscribe('ConversationEnded', ({ payload }) => {
      void this.evaluate({ conversationId: payload.conversationId }).catch(() => undefined);
    });
  }

  async evaluate(input: EvaluateInput): Promise<EvaluationResult> {
    const messages = input.messages ?? (await this.data.messages.listByConversation(input.conversationId));
    const metrics = this.scorer.score({
      messages,
      contradictionCount: input.contradictionCount ?? 0,
      expectedReplyDelays: input.expectedReplyDelays,
      behaviorHistory: input.behaviorHistory,
      behaviorObserved: input.behaviorObserved,
      emojiFrequencyTarget: input.emojiFrequencyTarget,
      stickerPerHundredTarget: input.stickerPerHundredTarget,
    });

    const judged: string[] = [];
    if (this.llm) {
      const text = await this.safeJudge(messages);
      if (text) {
        const parsed = this.parseJudge(text);
        if (parsed) {
          if (typeof parsed.naturalness === 'number') {
            metrics.naturalness = parsed.naturalness;
            judged.push('naturalness');
          }
          if (typeof parsed.personality_consistency === 'number') {
            metrics.personalityConsistency = parsed.personality_consistency;
            judged.push('personalityConsistency');
          }
        }
      }
    }

    const humanLikenessScore = this.composite(metrics);
    const report = await this.data.evaluationReports.create({
      conversationId: input.conversationId,
      metrics: { ...metrics } as unknown as Record<string, number>,
      humanLikenessScore,
    });
    this.bus.publish('EvaluationReportCreated', {
      reportId: report.id,
      conversationId: report.conversationId,
      humanLikenessScore: report.humanLikenessScore,
    });
    return { report, metrics, judged };
  }

  composite(metrics: HeuristicResult): number {
    const totalWeight = Object.values(HUMAN_LIKENESS_WEIGHTS).reduce((a, b) => a + b, 0);
    let weighted = 0;
    for (const [key, weight] of Object.entries(HUMAN_LIKENESS_WEIGHTS)) {
      weighted += (metrics as unknown as Record<string, number>)[key] * weight;
    }
    return Math.max(0, Math.min(100, Math.round(weighted / totalWeight)));
  }

  private async safeJudge(messages: Message[]): Promise<string | null> {
    if (messages.length === 0) return null;
    try {
      const transcript = messages.map((m) => `${m.sender === 'user' ? 'Usuário' : 'Você'}: ${m.content}`).join('\n');
      const response = await this.llm!.complete({
        systemPrompt: 'Você responde apenas com JSON válido.',
        messages: [{ role: 'user', content: JUDGE_PROMPT(transcript) }],
        capabilityRequirements: ['text'],
      });
      return response.text;
    } catch {
      return null;
    }
  }

  private parseJudge(text: string): { naturalness?: number; personality_consistency?: number } | null {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]) as Record<string, unknown>;
      const result: { naturalness?: number; personality_consistency?: number } = {};
      if (typeof parsed.naturalness === 'number') result.naturalness = parsed.naturalness;
      if (typeof parsed.personality_consistency === 'number') result.personality_consistency = parsed.personality_consistency;
      return result;
    } catch {
      return null;
    }
  }
}

