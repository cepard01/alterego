// Scheduler types — durable job queue worker (v1 §12).

export interface ScheduledJob {
  type: string;
  payload: Record<string, unknown>;
  runAt?: string;
  maxRetries?: number;
}

export interface ClaimedJob {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  runAt: string;
  retryCount: number;
  maxRetries: number;
}

/**
 * Durable queue the scheduler drains. Implementations must survive restarts
 * (Postgres-backed); `data`'s TaskQueueRepository structurally satisfies this.
 */
export interface JobQueue {
  enqueue(task: ScheduledJob): Promise<ClaimedJob>;
  claimDue(now: string, limit?: number): Promise<ClaimedJob[]>;
  complete(id: string): Promise<void>;
  fail(id: string, error: string, retry: boolean): Promise<void>;
}

export interface JobContext {
  taskId: string;
  type: string;
  attempt: number;
  maxRetries: number;
}

export type JobHandler = (payload: Record<string, unknown>, context: JobContext) => Promise<void>;

export interface SchedulerStats {
  registeredTypes: string[];
  pending: number;
  running: number;
  failed: number;
  completed: number;
  lastTickAt: string | null;
}
