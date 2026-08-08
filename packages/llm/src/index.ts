// LLM Router — provider-agnostic completion with capability routing,
// automatic fallback and per-provider circuit breakers (v1 §11).

export { LLMRouter } from './router.js';
export type { LLMRouterOptions } from './router.js';
export { CircuitBreaker } from './circuit-breaker.js';
export type { CircuitBreakerOptions } from './circuit-breaker.js';
export { AnthropicAdapter } from './adapters/anthropic.js';
export { GoogleAdapter } from './adapters/google.js';
export { OllamaAdapter } from './adapters/ollama.js';
export { OpenAiCompatibleAdapter } from './adapters/openai-compatible.js';
export { OpenRouterAdapter } from './adapters/openrouter.js';
export { pickModel } from './adapters/provider.js';
export type { HttpAdapterDeps, ProviderAdapter } from './adapters/provider.js';
export { LLMError } from './types.js';
export type {
  LLMMessage,
  LLMRequest,
  LLMResponse,
  LLMRouterStats,
  LLMToolCall,
  LLMToolDefinition,
  LLMUsage,
  LLMRole,
} from './types.js';
