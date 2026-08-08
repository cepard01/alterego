// Observability — structured logging, metrics, cost tracking, health checks
// (v1 §16). Subscribes to the event bus for its standard pipeline metrics.

export { JsonLogger, createMemorySink } from './logger.js';
export type { LogFields, LogSink, Logger } from './logger.js';
export { attachPipelineMetrics, messageLifecycleLatency, MetricsRegistry } from './metrics.js';
export type { Counter, Gauge, Histogram } from './metrics.js';
export { HealthRegistry } from './health.js';
export type { HealthCheckFn, HealthStatus } from './health.js';
export { TokenCostTracker } from './token-tracking.js';
export type { CostTotals, TokenCostTrackerOptions } from './token-tracking.js';
export { ObservabilityService } from './observability.service.js';
export type { ObservabilityOptions } from './observability.service.js';
