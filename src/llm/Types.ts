// LLM types — canonical request/response shapes (v1 §11).
// Provider adapters translate between these and their vendor formats.

import { LlmCapability } from '@alterego/config';

export type { LlmCapability };

export type LLMRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LLMMessage {
  role: LLMRole;
  content: string;
  /** For role === 'tool': id of the tool call this result answers. */
  toolCallId?: string;
  /** For role === 'assistant': tool calls the model requested. */
  toolCalls?: LLMToolCall[];
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  /** JSON Schema of the arguments object. */
  parameters: Record<string, unknown>;
}

export interface LLMRequest {
  messages: LLMMessage[];
  systemPrompt?: string;
  tools?: LLMToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  preferredProvider?: string;
  /** Route to a model that supports these capabilities. */
  capabilityRequirements?: LlmCapability[];
  /** Optional correlation metadata for the LLMCompleted event. */
  userId?: string;
  conversationId?: string;
  requestId?: string;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  text: string;
  toolCalls?: LLMToolCall[];
  usage: LLMUsage;
  provider: string;
  model: string;
  latencyMs: number;
}

export class LLMError extends Error {
  readonly provider: string;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(provider: string, message: string, options: { status?: number; retryable?: boolean; cause?: unknown } = {}) {
    super(message);
    this.name = 'LLMError';
    this.provider = provider;
    this.status = options.status;
    this.retryable = options.retryable ?? options.status === undefined;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

export interface LLMRouterStats {
  provider: string;
  failures: number;
  open: boolean;
}
