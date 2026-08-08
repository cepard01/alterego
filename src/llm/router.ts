// LLMRouter — provider-agnostic completion with capability routing,
// automatic fallback and per-provider circuit breakers (v1 §11).

import { AppConfig, ConfigService, LlmCapability } from '@whatsapp-ai-agent/config';
import { EventBus, LLMCompletedPayload } from '@whatsapp-ai-agent/events';
import { Logger } from '@whatsapp-ai-agent/observability';
import { pickModel, ProviderAdapter } from './adapters/provider.js';
import { AnthropicAdapter } from './adapters/anthropic.js';
import { GoogleAdapter } from './adapters/google.js';
import { OllamaAdapter } from './adapters/ollama.js';
import { OpenAiCompatibleAdapter } from './adapters/openai-compatible.js';
import { OpenRouterAdapter } from './adapters/openrouter.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { LLMError, LLMRequest, LLMResponse, LLMRouterStats } from './types.js';

export interface LLMRouterOptions {
  bus: EventBus;
  config: Readonly<AppConfig> | ConfigService;
  logger?: Logger;
  /** Override the default adapter registry (testing, custom providers). */
  adapters?: Record<string, ProviderAdapter>;
}

export class LLMRouter {
  private readonly bus: EventBus;
  private readonly config: Readonly<AppConfig>;
  private readonly logger?: Logger;
  private readonly adapters: Map<string, ProviderAdapter>;
  private readonly breaker: CircuitBreaker;
  private requestCounter = 0;

  constructor(options: LLMRouterOptions) {
    this.bus = options.bus;
    this.config = options.config instanceof ConfigService ? options.config.get() : options.config;
    this.logger = options.logger;
    this.breaker = new CircuitBreaker({
      threshold: 3,
      cooldownMs: 60_000,
      logger: options.logger,
      providers: Object.fromEntries(
        Object.entries(this.config.llm.providers).map(([name, config]) => [
          name,
          { threshold: config.breakerThreshold, cooldownMs: config.breakerCooldownMs },
        ]),
      ),
    });
    this.adapters = new Map();
    if (options.adapters) {
      for (const [name, adapter] of Object.entries(options.adapters)) this.adapters.set(name, adapter);
      return;
    }
    for (const [name, providerConfig] of Object.entries(this.config.llm.providers)) {
      if (this.adapters.has(name)) continue;
      if (name === 'openai' || name === 'azure' || name === 'together' || name === 'groq') {
        this.adapters.set(name, new OpenAiCompatibleAdapter(name, providerConfig));
      } else if (name === 'anthropic' || name === 'claude') {
        this.adapters.set(name, new AnthropicAdapter(name, providerConfig));
      } else if (name === 'google' || name === 'gemini') {
        this.adapters.set(name, new GoogleAdapter(name, providerConfig));
      } else if (name === 'openrouter') {
        this.adapters.set(name, new OpenRouterAdapter(name, providerConfig));
      } else if (name === 'ollama') {
        this.adapters.set(name, new OllamaAdapter(name, providerConfig));
      } else {
        this.adapters.set(name, new OpenAiCompatibleAdapter(name, providerConfig));
      }
    }
  }

  /** Providers in fallback order: preferred first, then by config priority. */
  private providerOrder(preferred?: string): string[] {
    const ordered = Object.entries(this.config.llm.providers).sort(([, a], [, b]) => a.priority - b.priority);
    const names = ordered.map(([name]) => name);
    if (preferred && names.includes(preferred)) {
      names.splice(names.indexOf(preferred), 1);
      names.unshift(preferred);
    }
    return names;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const requestId = request.requestId ?? `req-${++this.requestCounter}`;
    const capabilities: LlmCapability[] = request.capabilityRequirements?.length
      ? request.capabilityRequirements
      : ['text'];
    const attempts: Array<{ provider: string; error: LLMError }> = [];
    const order = this.providerOrder(request.preferredProvider);

    for (const provider of order) {
      const providerConfig = this.config.llm.providers[provider];
      if (!providerConfig) continue;
      const adapter = this.adapters.get(provider);
      if (!adapter) continue;
      const resolvedModel = pickModel(
        providerConfig,
        capabilities,
        this.config.llm.defaultModel,
      );
      if (!resolvedModel) continue;
      if (this.breaker.isOpen(provider)) {
        this.logger?.debug('skipping provider, circuit open', { provider });
        continue;
      }

      const started = Date.now();
      try {
        const response = await adapter.complete(request, resolvedModel.id);
        this.breaker.recordSuccess(provider);
        this.emitCompleted(requestId, provider, response, request);
        return response;
      } catch (error) {
        const llmError = error instanceof LLMError ? error : new LLMError(provider, String(error), { cause: error });
        attempts.push({ provider, error: llmError });
        this.breaker.recordFailure(provider);
        this.logger?.warn('llm attempt failed, trying fallback', {
          provider,
          error: llmError.message,
          remaining: order.length - attempts.length,
        });
      }
    }

    throw new LLMError(
      'router',
      `all providers failed (${attempts.length} attempted): ${attempts.map((a) => `${a.provider}: ${a.error.message}`).join('; ')}`,
    );
  }

  private emitCompleted(requestId: string, provider: string, response: LLMResponse, request: LLMRequest): void {
    const payload: LLMCompletedPayload = {
      requestId,
      provider,
      model: response.model,
      latencyMs: response.latencyMs,
      usage: response.usage,
    };
    if (request.userId) payload.userId = request.userId;
    if (request.conversationId) payload.conversationId = request.conversationId;
    this.bus.publish('LLMCompleted', payload);
  }

  stats(): LLMRouterStats[] {
    const providerNames = [...this.adapters.keys()];
    return providerNames.map((provider) => ({
      provider,
      failures: this.breaker.failures(provider),
      open: this.breaker.isOpen(provider),
    }));
  }
}
