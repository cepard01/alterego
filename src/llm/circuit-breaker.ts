// Circuit breaker per provider — prevents hammering a degraded service (v1 §11).

import { Logger } from '@whatsapp-ai-agent/observability';

export interface CircuitBreakerOptions {
  /** Default threshold used when a provider has no specific config. */
  threshold: number;
  /** Default cooldown used when a provider has no specific config (ms). */
  cooldownMs: number;
  logger?: Logger;
  /** Per-provider overrides. */
  providers?: Record<string, { threshold: number; cooldownMs: number }>;
}

interface BreakerState {
  consecutiveFailures: number;
  openedAt: number | null;
  threshold: number;
  cooldownMs: number;
}

export class CircuitBreaker {
  private readonly states = new Map<string, BreakerState>();

  constructor(private readonly options: CircuitBreakerOptions) {}

  private stateFor(provider: string): BreakerState {
    const existing = this.states.get(provider);
    if (existing) return existing;
    const providerConfig = this.options.providers?.[provider];
    const state: BreakerState = {
      consecutiveFailures: 0,
      openedAt: null,
      threshold: providerConfig?.threshold ?? this.options.threshold,
      cooldownMs: providerConfig?.cooldownMs ?? this.options.cooldownMs,
    };
    this.states.set(provider, state);
    return state;
  }

  /** True if calls to this provider are currently blocked. */
  isOpen(provider: string): boolean {
    const state = this.states.get(provider);
    if (!state?.openedAt) return false;
    if (Date.now() - state.openedAt >= state.cooldownMs) {
      // Half-open: allow a probe through; if it fails again, re-open.
      this.states.set(provider, { ...state, openedAt: null });
      return false;
    }
    return true;
  }

  recordSuccess(provider: string): void {
    const state = this.stateFor(provider);
    this.states.set(provider, { ...state, consecutiveFailures: 0, openedAt: null });
  }

  recordFailure(provider: string): void {
    const state = this.stateFor(provider);
    const consecutiveFailures = state.consecutiveFailures + 1;
    if (consecutiveFailures >= state.threshold) {
      this.states.set(provider, { ...state, consecutiveFailures, openedAt: Date.now() });
      this.options.logger?.warn('circuit-breaker opened', { provider, consecutiveFailures });
    } else {
      this.states.set(provider, { ...state, consecutiveFailures, openedAt: null });
    }
  }

  /** Reset all state (e.g., after config reload). */
  reset(): void {
    this.states.clear();
  }

  failures(provider: string): number {
    return this.states.get(provider)?.consecutiveFailures ?? 0;
  }
}
