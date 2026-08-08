// Token & cost tracking — every LLM call rolls up into per-user/day and
// per-provider/day totals so runaway spend on this research project is
// visible before it hurts (v1 §16).

import { AppConfig, ProviderConfig } from '@whatsapp-ai-agent/config';
import { EventBus, TokenUsage } from '@whatsapp-ai-agent/events';

export interface CostTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  calls: number;
}

export interface TokenCostTrackerOptions {
  /** USD per 1000 tokens override table: provider -> { input, output }. */
  pricing?: Record<string, { inputPer1k: number; outputPer1k: number }>;
}

export class TokenCostTracker {
  private readonly byUserDay = new Map<string, CostTotals>();
  private readonly byProvider = new Map<string, CostTotals>();
  private readonly byConversation = new Map<string, CostTotals>();
  private readonly pricing: Record<string, { inputPer1k: number; outputPer1k: number }>;
  private readonly unsubscribe: () => void;

  constructor(bus: EventBus, config: Readonly<AppConfig>, options: TokenCostTrackerOptions = {}) {
    const providerPricing: Record<string, { inputPer1k: number; outputPer1k: number }> = {};
    for (const [name, provider] of Object.entries(config.llm.providers)) {
      providerPricing[name] = {
        inputPer1k: (provider as ProviderConfig).pricing.inputPer1k,
        outputPer1k: (provider as ProviderConfig).pricing.outputPer1k,
      };
    }
    this.pricing = { ...providerPricing, ...options.pricing };

    this.unsubscribe = bus.subscribe('LLMCompleted', (event) => {
      const { provider, usage, userId, conversationId } = event.payload;
      const day = new Date(event.timestamp).toISOString().slice(0, 10);

      if (userId) {
        this.add(this.byUserDay, `${userId}:${day}`, provider, usage);
      }
      this.add(this.byProvider, `${provider}:${day}`, provider, usage);
      if (conversationId) {
        this.add(this.byConversation, conversationId, provider, usage);
      }
    });
  }

  close(): void {
    this.unsubscribe();
  }

  /** Totals for a single user on a single day (ISO date string). */
  forUserDay(userId: string, day: string): CostTotals {
    return this.totals(this.byUserDay.get(`${userId}:${day}`));
  }

  /** Totals for a provider on a single day. */
  forProviderDay(provider: string, day: string): CostTotals {
    return this.totals(this.byProvider.get(`${provider}:${day}`));
  }

  forConversation(conversationId: string): CostTotals {
    return this.totals(this.byConversation.get(conversationId));
  }

  total(): CostTotals {
    let promptTokens = 0;
    let completionTokens = 0;
    let costUsd = 0;
    let calls = 0;
    for (const totals of this.byProvider.values()) {
      promptTokens += totals.promptTokens;
      completionTokens += totals.completionTokens;
      costUsd += totals.costUsd;
      calls += totals.calls;
    }
    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      costUsd,
      calls,
    };
  }

  private add(map: Map<string, CostTotals>, key: string, provider: string, usage: TokenUsage): void {
    const current = map.get(key);
    const inputPer1k = this.pricing[provider]?.inputPer1k ?? 0;
    const outputPer1k = this.pricing[provider]?.outputPer1k ?? 0;
    const costUsd = (usage.promptTokens / 1000) * inputPer1k + (usage.completionTokens / 1000) * outputPer1k;
    map.set(key, {
      promptTokens: (current?.promptTokens ?? 0) + usage.promptTokens,
      completionTokens: (current?.completionTokens ?? 0) + usage.completionTokens,
      totalTokens: (current?.totalTokens ?? 0) + usage.totalTokens,
      costUsd: (current?.costUsd ?? 0) + costUsd,
      calls: (current?.calls ?? 0) + 1,
    });
  }

  private totals(value: CostTotals | undefined): CostTotals {
    return value ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, calls: 0 };
  }
}
