// In-memory JobQueue — for tests and single-process dev. Not durable:
// use data's TaskQueueRepository in production.

import { randomUUID } from 'node:crypto';
import { ClaimedJob, JobQueue, ScheduledJob } from './Types.js';

export class InMemoryJobQueue implements JobQueue {
  private readonly jobs = new Map<string, ClaimedJob>();

  async enqueue(task: ScheduledJob): Promise<ClaimedJob> {
    const job: ClaimedJob = {
      id: randomUUID(),
      type: task.type,
      payload: task.payload,
      runAt: task.runAt ?? new Date().toISOString(),
      retryCount: 0,
      maxRetries: task.maxRetries ?? 3,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  async claimDue(now: string, limit = 20): Promise<ClaimedJob[]> {
    const due = [...this.jobs.values()]
      .filter((job) => job.runAt <= now)
      .sort((a, b) => a.runAt.localeCompare(b.runAt))
      .slice(0, limit);
    return due.map((job) => ({ ...job }));
  }

  async complete(id: string): Promise<void> {
    this.jobs.delete(id);
  }

  async fail(id: string, error: string, retry: boolean): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    if (retry && job.retryCount < job.maxRetries) {
      this.jobs.set(id, { ...job, retryCount: job.retryCount + 1, runAt: new Date(Date.now() + 60_000).toISOString() });
    } else {
      this.jobs.delete(id);
    }
  }

  size(): number {
    return this.jobs.size;
  }
}

