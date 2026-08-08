// Observability service — wires logger, metrics, cost tracking and health into
// a single entry point that auto-subscribes to the event bus (v1 §16).

import { AppConfig, ConfigService, LogLevel } from '@whatsapp-ai-agent/config';
import { EventBus } from '@whatsapp-ai-agent/events';
import { JsonLogger, LogSink, Logger } from './logger.js';
import { attachPipelineMetrics, messageLifecycleLatency, MetricsRegistry } from './metrics.js';
import { HealthRegistry } from './health.js';
import { TokenCostTracker, TokenCostTrackerOptions } from './token-tracking.js';

export interface ObservabilityOptions {
  sink?: LogSink;
  pricing?: TokenCostTrackerOptions['pricing'];
}

export class ObservabilityService {
  readonly logger: Logger;
  readonly metrics: MetricsRegistry;
  readonly health: HealthRegistry;
  readonly costTracker: TokenCostTracker;

  private readonly detach: Array<() => void> = [];

  constructor(bus: EventBus, config: Readonly<AppConfig> | ConfigService, options: ObservabilityOptions = {}) {
    const resolved: Readonly<AppConfig> = config instanceof ConfigService ? config.get() : config;
    const level: LogLevel = resolved.log.level;
    this.logger = new JsonLogger({ level, perModule: resolved.log.perModule, sink: options.sink });
    this.metrics = new MetricsRegistry();
    this.health = new HealthRegistry();
    this.costTracker = new TokenCostTracker(bus, resolved, { pricing: options.pricing });

    this.detach.push(attachPipelineMetrics(bus, this.metrics));
    this.detach.push(messageLifecycleLatency(bus, this.metrics));
    this.detach.push(
      bus.subscribeAll((event) => {
        this.logger.withCorrelationId(event.correlationId ?? '').debug('event', {
          event: event.type,
          payload: event.payload,
        });
      }),
    );
  }

  close(): void {
    this.costTracker.close();
    this.detach.forEach((detach) => detach());
  }
}
