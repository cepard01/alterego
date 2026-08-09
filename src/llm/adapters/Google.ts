// Google Gemini generateContent adapter (v1 §11).

import { ProviderConfig } from '@alterego/config';
import { LLMError, LLMRequest, LLMResponse } from '../Types.js';
import { HttpAdapterDeps, pickModel, ProviderAdapter } from './Provider.js';

function buildRequestBody(request: LLMRequest, model: string): Record<string, unknown> {
  const contents: Array<Record<string, unknown>> = [];
  const systemInstructions = request.systemPrompt;
  for (const message of request.messages) {
    if (message.role === 'system' || message.role === 'tool') continue;
    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    });
  }
  if (contents.length === 0) contents.push({ role: 'user', parts: [{ text: '' }] });
  const body: Record<string, unknown> = { contents };
  if (systemInstructions) body.systemInstruction = { parts: [{ text: systemInstructions }] };
  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools.map((tool) => ({
      functionDeclarations: [{ name: tool.name, description: tool.description, parameters: tool.parameters }],
    }));
  }
  body.generationConfig = {
    temperature: request.temperature ?? 0.7,
    maxOutputTokens: request.maxTokens ?? 4096,
  };
  return body;
}

function parseResponse(json: Record<string, unknown>, latencyMs: number, provider: string, model: string): LLMResponse {
  const candidates = (json.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined) ?? [];
  const parts = candidates[0]?.content?.parts ?? [];
  const text = parts.map((part) => part.text ?? '').join('');
  const rawUsage = json.usageMetadata as { promptTokenCount?: number; candidatesTokenCount?: number } | undefined;
  const usage = {
    promptTokens: rawUsage?.promptTokenCount ?? 0,
    completionTokens: rawUsage?.candidatesTokenCount ?? 0,
    totalTokens: (rawUsage?.promptTokenCount ?? 0) + (rawUsage?.candidatesTokenCount ?? 0),
  };
  return { text, usage, provider, model, latencyMs };
}

export class GoogleAdapter implements ProviderAdapter {
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
    const baseUrl = this.config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    const url = `${baseUrl.replace(/\/$/, '')}/models/${resolvedModel}:generateContent`;
    const started = Date.now();
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.config.apiKey,
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


