// LLM Router — provider-agnostic completion with capability routing,
// automatic fallback and per-provider circuit breakers (v1 §11).

export { LLMRouter } from './Router.js';
export type { LLMRouterOptions } from './Router.js';
export { CircuitBreaker } from './CircuitBreaker.js';
export type { CircuitBreakerOptions } from './CircuitBreaker.js';
export { AnthropicAdapter } from './adapters/Anthropic.js';
export { GoogleAdapter } from './adapters/Google.js';
export { OllamaAdapter } from './adapters/Ollama.js';
export { OpenAiCompatibleAdapter } from './adapters/OpenAICompatible.js';
export { OpenRouterAdapter } from './adapters/OpenRouter.js';
export { pickModel } from './adapters/Provider.js';
export type { HttpAdapterDeps, ProviderAdapter } from './adapters/Provider.js';
export { LLMError } from './Types.js';
export type {
  LLMMessage,
  LLMRequest,
  LLMResponse,
  LLMRouterStats,
  LLMToolCall,
  LLMToolDefinition,
  LLMUsage,
  LLMRole,
} from './Types.js';

