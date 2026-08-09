// OpenRouter adapter — OpenAI-compatible endpoint (v1 §11).

import { ProviderConfig } from '@alterego/config';
import { OpenAiCompatibleAdapter } from './OpenAICompatible.js';
import { HttpAdapterDeps } from './Provider.js';

export class OpenRouterAdapter extends OpenAiCompatibleAdapter {
  constructor(name: string, config: ProviderConfig, deps: HttpAdapterDeps = {}) {
    super(name, { ...config, baseUrl: config.baseUrl ?? 'https://openrouter.ai/api/v1' }, deps);
  }
}

