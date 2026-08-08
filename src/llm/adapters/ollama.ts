// Ollama local adapter — OpenAI-compatible endpoint on localhost (v1 §11).

import { ProviderConfig } from '@alterego/config';
import { OpenAiCompatibleAdapter } from './openai-compatible.js';
import { HttpAdapterDeps } from './provider.js';

export class OllamaAdapter extends OpenAiCompatibleAdapter {
  constructor(name: string, config: ProviderConfig, deps: HttpAdapterDeps = {}) {
    super(name, { ...config, baseUrl: config.baseUrl ?? 'http://localhost:11434/v1', apiKey: config.apiKey || 'ollama' }, deps);
  }
}
