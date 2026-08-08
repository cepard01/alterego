// Metrics registry — counters, gauges, histograms plus a bus subscriber that
// derives the pipeline metrics v1 §16 asks for (latency, reply-vs-ignore,
// messages per conversation) from existing events.

import { AppEvent, EventBus } from '@whatsapp-ai-agent/events';

export interface Counter {
  inc(by?: number): void;
  value(): number;
}

export interface Gauge {
  set(value: number): void;
  value(): number;
}

export interface Histogram {
  observe(value: number): void;
  /** Returns [value, count] — sum of observations and number of observations. */
  summary(): { sum: number; count: number };
}

export class MetricsRegistry {
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly histograms = new Map<string, { sum: number; count: number }>();

  counter(name: string, labels: Record<string, string> = {}): Counter {
    const key = this.key(name, labels);
    if (!this.counters.has(key)) this.counters.set(key, 0);
    return {
      inc: (by = 1) => this.counters.set(key, (this.counters.get(key) ?? 0) + by),
      value: () => this.counters.get(key) ?? 0,
    };
  }

  gauge(name: string, labels: Record<string, string> = {}): Gauge {
    const key = this.key(name, labels);
    if (!this.gauges.has(key)) this.gauges.set(key, 0);
    return {
      set: (value) => this.gauges.set(key, value),
      value: () => this.gauges.get(key) ?? 0,
    };
  }

  histogram(name: string, labels: Record<string, string> = {}): Histogram {
    const key = this.key(name, labels);
    if (!this.histograms.has(key)) this.histograms.set(key, { sum: 0, count: 0 });
    return {
      observe: (value) => {
        const current = this.histograms.get(key) ?? { sum: 0, count: 0 };
        this.histograms.set(key, { sum: current.sum + value, count: current.count + 1 });
      },
      summary: () => this.histograms.get(key) ?? { sum: 0, count: 0 },
    };
  }

  snapshot(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [name, value] of this.counters) out[`counter:${name}`] = value;
    for (const [name, value] of this.gauges) out[`gauge:${name}`] = value;
    for (const [name, value] of this.histograms) out[`histogram:${name}`] = value;
    return out;
  }

  private key(name: string, labels: Record<string, string>): string {
    if (Object.keys(labels).length === 0) return name;
    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${labelStr}}`;
  }
}

/**
 * Subscribes to the bus and maintains the standard pipeline metrics:
 * - llm.latency / llm.tokens / llm.cost
 * - behavior.decisions{decision=reply|ignore|delayed_reply|...}
 * - message.inbound / message.outbound / conversation.started / conversation.ended
 */
export function attachPipelineMetrics(bus: EventBus, registry: MetricsRegistry): () => void {
  const unsubscribes: Array<() => void> = [];

  unsubscribes.push(
    bus.subscribe('LLMCompleted', (event) => {
      const { latencyMs, usage } = event.payload;
      registry.histogram('llm.latency', { provider: event.payload.provider }).observe(latencyMs);
      registry.counter('llm.tokens', { kind: 'prompt' }).inc(usage.promptTokens);
      registry.counter('llm.tokens', { kind: 'completion' }).inc(usage.completionTokens);
      registry.counter('llm.calls').inc();
    }),
  );

  unsubscribes.push(
    bus.subscribe('BehaviorDecided', (event) => {
      registry.counter('behavior.decisions', { decision: event.payload.decision }).inc();
    }),
  );

  unsubscribes.push(
    bus.subscribe('MessageReceived', () => registry.counter('message.inbound').inc()),
  );

  unsubscribes.push(
    bus.subscribe('ResponseSent', () => registry.counter('message.outbound').inc()),
  );

  unsubscribes.push(
    bus.subscribe('ConversationStarted', () => registry.counter('conversation.started').inc()),
  );

  unsubscribes.push(
    bus.subscribe('ConversationEnded', () => registry.counter('conversation.ended').inc()),
  );

  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}

export function messageLifecycleLatency(bus: EventBus, registry: MetricsRegistry): () => void {
  const pending = new Map<string, number>();
  const unsubscribes: Array<() => void> = [];

  unsubscribes.push(
    bus.subscribe('MessageReceived', (event) => {
      pending.set(event.payload.messageId, event.timestamp);
    }),
  );

  unsubscribes.push(
    bus.subscribe('ResponseSent', (event) => {
      const started = pending.get(event.payload.messageId);
      if (started !== undefined) {
        registry.histogram('message.lifecycle.latency').observe(event.timestamp - started);
        pending.delete(event.payload.messageId);
      }
    }),
  );

  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}
