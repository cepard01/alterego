// Provider adapter interface — every adapter translates the canonical
// LLMRequest into its vendor's wire format and back (v1 §11).

import { ModelConfig, ProviderConfig } from '@whatsapp-ai-agent/config';
import { LLMRequest, LLMResponse } from '../types.js';

export interface ProviderAdapter {
  readonly name: string;
  complete(request: LLMRequest, model: string): Promise<LLMResponse>;
}

export interface HttpAdapterDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/** Pick the best model for the request's capability requirements. */
export function pickModel(
  provider: ProviderConfig,
  requestedCapabilities: string[],
  preferredModel?: string,
): ModelConfig | undefined {
  const candidates = Object.values(provider.models).filter((model) =>
    requestedCapabilities.every((cap) => model.capabilities.includes(cap as never)),
  );
  if (preferredModel) {
    const preferred = provider.models[preferredModel];
    if (preferred && candidates.some((m) => m.id === preferred.id)) return preferred;
  }
  return candidates[0];
}
