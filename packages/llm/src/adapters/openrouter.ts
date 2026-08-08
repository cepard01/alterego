// OpenRouter adapter — OpenAI-compatible endpoint (v1 §11).

import { ProviderConfig } from '@whatsapp-ai-agent/config';
import { OpenAiCompatibleAdapter } from './openai-compatible.js';
import { HttpAdapterDeps } from './provider.js';

export class OpenRouterAdapter extends OpenAiCompatibleAdapter {
  constructor(name: string, config: ProviderConfig, deps: HttpAdapterDeps = {}) {
    super(name, { ...config, baseUrl: config.baseUrl ?? 'https://openrouter.ai/api/v1' }, deps);
  }
}
