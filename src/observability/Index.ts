// Observability — structured logging, metrics, cost tracking, health checks
// (v1 §16). Subscribes to the event bus for its standard pipeline metrics.

export { JsonLogger, createMemorySink } from './Logger.js';
export type { LogFields, LogSink, Logger } from './Logger.js';
export { attachPipelineMetrics, messageLifecycleLatency, MetricsRegistry } from './Metrics.js';
export type { Counter, Gauge, Histogram } from './Metrics.js';
export { HealthRegistry } from './Health.js';
export type { HealthCheckFn, HealthStatus } from './Health.js';
export { TokenCostTracker } from './TokenTracking.js';
export type { CostTotals, TokenCostTrackerOptions } from './TokenTracking.js';
export { ObservabilityService } from './ObservabilityService.js';
export type { ObservabilityOptions } from './ObservabilityService.js';

