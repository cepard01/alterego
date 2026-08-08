// SchedulerService — durable job worker: claims due jobs from the queue,
// runs registered handlers, applies retry/backoff (v1 §12).

import { ConfigService, AppConfig } from '@alterego/config';
import { EventBus } from '@alterego/events';
import { Logger } from '@alterego/observability';
import { ClaimedJob, JobContext, JobHandler, JobQueue, SchedulerStats } from './types.js';

export interface SchedulerOptions {
  bus: EventBus;
  config: Readonly<AppConfig> | ConfigService;
  queue: JobQueue;
  logger?: Logger;
  /** Override the tick interval (tests). */
  tickIntervalMs?: number;
  now?: () => number;
}

export class SchedulerService {
  private readonly bus: EventBus;
  private readonly config: Readonly<AppConfig>;
  private readonly queue: JobQueue;
  private readonly logger?: Logger;
  private readonly tickIntervalMs: number;
  private readonly now: () => number;
  private readonly handlers = new Map<string, JobHandler>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = new Set<string>();
  private lastTickAt: string | null = null;
  private completedCount = 0;
  private failedCount = 0;

  constructor(options: SchedulerOptions) {
    this.bus = options.bus;
    this.config = options.config instanceof ConfigService ? options.config.get() : options.config;
    this.queue = options.queue;
    this.logger = options.logger;
    this.tickIntervalMs = options.tickIntervalMs ?? this.config.scheduler.tickIntervalMs;
    this.now = options.now ?? Date.now;
  }

  register(type: string, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }

  unregister(type: string): void {
    this.handlers.delete(type);
  }

  /** Enqueue a job for execution at `runAt` (default: as soon as possible). */
  async schedule(job: { type: string; payload: Record<string, unknown>; runAt?: string; maxRetries?: number }): Promise<void> {
    await this.queue.enqueue(job);
    this.logger?.debug('scheduled job', { type: job.type, runAt: job.runAt ?? 'now' });
  }

  /** Recurring job: re-enqueued `intervalMs` after each successful run. */
  scheduleRecurring(type: string, intervalMs: number, payload: Record<string, unknown> = {}): void {
    const runAt = new Date(this.now() + intervalMs).toISOString();
    void this.schedule({ type, payload, runAt });
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.tickIntervalMs);
    this.timer.unref?.();
    this.logger?.info('scheduler started', { tickIntervalMs: this.tickIntervalMs });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.logger?.info('scheduler stopped');
  }

  /** One drain cycle — claims due jobs and runs their handlers. */
  async tick(): Promise<void> {
    this.lastTickAt = new Date(this.now()).toISOString();
    const due = await this.queue.claimDue(new Date(this.now()).toISOString(), 20);
    await Promise.all(due.map((task) => this.runTask(task)));
  }

  private async runTask(task: ClaimedJob): Promise<void> {
    if (this.running.has(task.id)) return;
    this.running.add(task.id);
    try {
      const handler = this.handlers.get(task.type);
      if (!handler) {
        await this.queue.fail(task.id, `no handler registered for job type "${task.type}"`, false);
        return;
      }
      const context: JobContext = {
        taskId: task.id,
        type: task.type,
        attempt: task.retryCount + 1,
        maxRetries: task.maxRetries,
      };
      await handler(task.payload, context);
      await this.queue.complete(task.id);
      this.completedCount += 1;
      this.logger?.debug('job completed', { type: task.type, id: task.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger?.warn('job failed', { type: task.type, id: task.id, error: message });
      const shouldRetry = task.retryCount < task.maxRetries;
      await this.queue.fail(task.id, message, shouldRetry);
      this.failedCount += 1;
    } finally {
      this.running.delete(task.id);
    }
  }

  stats(): SchedulerStats {
    return {
      registeredTypes: [...this.handlers.keys()],
      pending: this.running.size,
      running: this.running.size,
      failed: this.failedCount,
      completed: this.completedCount,
      lastTickAt: this.lastTickAt,
    };
  }
}
