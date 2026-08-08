// Anthropic Messages API adapter (v1 §11).

import { ProviderConfig } from '@whatsapp-ai-agent/config';
import { LLMError, LLMRequest, LLMResponse } from '../types.js';
import { HttpAdapterDeps, pickModel, ProviderAdapter } from './provider.js';

function buildRequestBody(request: LLMRequest, model: string): Record<string, unknown> {
  const system = request.systemPrompt;
  const messages = request.messages
    .filter((message) => message.role !== 'system')
    .map((message) => {
      if (message.role === 'tool') {
        return {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: message.toolCallId, content: message.content }],
        };
      }
      if (message.toolCalls && message.toolCalls.length > 0) {
        return {
          role: 'assistant',
          content: message.toolCalls.map((call) => ({
            type: 'tool_use',
            id: call.id,
            name: call.name,
            input: call.arguments,
          })),
        };
      }
      return { role: message.role, content: message.content };
    });
  const body: Record<string, unknown> = {
    model,
    max_tokens: request.maxTokens ?? 4096,
    temperature: request.temperature ?? 0.7,
    messages,
  };
  if (system) body.system = system;
  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }
  return body;
}

function parseResponse(json: Record<string, unknown>, latencyMs: number, provider: string, model: string): LLMResponse {
  const content = (json.content as Array<Record<string, unknown>> | undefined) ?? [];
  const text = content
    .filter((block) => block.type === 'text')
    .map((block) => String(block.text ?? ''))
    .join('');
  const toolCalls = content
    .filter((block) => block.type === 'tool_use')
    .map((block) => ({
      id: String(block.id ?? ''),
      name: String(block.name ?? ''),
      arguments: (block.input as Record<string, unknown>) ?? {},
    }));
  const rawUsage = json.usage as { input_tokens?: number; output_tokens?: number } | undefined;
  const usage = {
    promptTokens: rawUsage?.input_tokens ?? 0,
    completionTokens: rawUsage?.output_tokens ?? 0,
    totalTokens: (rawUsage?.input_tokens ?? 0) + (rawUsage?.output_tokens ?? 0),
  };
  return { text, toolCalls: toolCalls.length > 0 ? toolCalls : undefined, usage, provider, model, latencyMs };
}

export class AnthropicAdapter implements ProviderAdapter {
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
    const baseUrl = this.config.baseUrl ?? 'https://api.anthropic.com/v1';
    const url = `${baseUrl.replace(/\/$/, '')}/messages`;
    const started = Date.now();
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
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
