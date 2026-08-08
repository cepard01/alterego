// OpenAI-compatible HTTP adapter — used for OpenAI, OpenRouter and any
// compatible endpoint. Ollama exposes an OpenAI-compatible API on /v1.

import { ProviderConfig } from '@whatsapp-ai-agent/config';
import { LLMError, LLMRequest, LLMResponse } from '../types.js';
import { HttpAdapterDeps, pickModel, ProviderAdapter } from './provider.js';

function buildRequestBody(request: LLMRequest, model: string): Record<string, unknown> {
  const messages: Array<Record<string, unknown>> = [];
  if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt });
  for (const message of request.messages) {
    if (message.role === 'tool') {
      messages.push({ role: 'tool', content: message.content, tool_call_id: message.toolCallId });
    } else {
      messages.push({ role: message.role, content: message.content });
    }
  }
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: request.maxTokens ?? 4096,
    temperature: request.temperature ?? 0.7,
  };
  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools.map((tool) => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }));
  }
  return body;
}

function parseResponse(json: Record<string, unknown>, latencyMs: number, provider: string, model: string): LLMResponse {
  const choice = (json.choices as Array<{ message?: Record<string, unknown> }> | undefined)?.[0];
  const message = choice?.message ?? {};
  const rawUsage = json.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
  const usage = {
    promptTokens: rawUsage?.prompt_tokens ?? 0,
    completionTokens: rawUsage?.completion_tokens ?? 0,
    totalTokens: rawUsage?.total_tokens ?? (rawUsage?.prompt_tokens ?? 0) + (rawUsage?.completion_tokens ?? 0),
  };
  const toolCalls = (message.tool_calls as Array<Record<string, unknown>> | undefined)?.map((call) => ({
    id: String(call.id ?? ''),
    name: String((call.function as { name?: string } | undefined)?.name ?? ''),
    arguments: JSON.parse(String((call.function as { arguments?: string } | undefined)?.arguments ?? '{}')),
  }));
  return {
    text: String(message.content ?? ''),
    toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
    usage,
    provider,
    model,
    latencyMs,
  };
}

export class OpenAiCompatibleAdapter implements ProviderAdapter {
  readonly name: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    name: string,
    private readonly config: ProviderConfig,
    deps: HttpAdapterDeps = {},
  ) {
    this.name = name;
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  async complete(request: LLMRequest, model: string): Promise<LLMResponse> {
    const modelConfig = pickModel(this.config, request.capabilityRequirements ?? ['text'], model);
    const resolvedModel = modelConfig?.id ?? model;
    const baseUrl = this.config.baseUrl ?? 'https://api.openai.com/v1';
    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    const started = Date.now();
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(buildRequestBody(request, resolvedModel)),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (error) {
      throw new LLMError(this.name, `request to ${this.name} failed: ${String(error)}`, { cause: error });
    }
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new LLMError(this.name, `${this.name} returned ${response.status}: ${detail.slice(0, 300)}`, {
        status: response.status,
        retryable: response.status >= 500 || response.status === 429,
      });
    }
    const json = (await response.json()) as Record<string, unknown>;
    return parseResponse(json, latencyMs, this.name, resolvedModel);
  }
}
