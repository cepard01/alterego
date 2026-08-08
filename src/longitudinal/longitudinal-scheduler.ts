// LongitudinalScheduler — wires the periodic evolution pass into the
// scheduler (v3 §9). Weekly by default; the pass itself decides what (if
// anything) is worth proposing.

import type { SchedulerService } from '@alterego/scheduler';
import { LONGITUDINAL_EVOLUTION_JOB } from './identity-evolution.js';

export interface SchedulerInput {
  runPass: () => Promise<unknown>;
  intervalMs?: number;
}

export class LongitudinalScheduler {
  constructor(private readonly scheduler: Pick<SchedulerService, 'register' | 'scheduleRecurring'>) {}

  start(input: SchedulerInput): void {
    const intervalMs = input.intervalMs ?? 7 * 24 * 60 * 60 * 1000;
    this.scheduler.register(LONGITUDINAL_EVOLUTION_JOB, async () => {
      await input.runPass();
    });
    this.scheduler.scheduleRecurring(LONGITUDINAL_EVOLUTION_JOB, intervalMs);
  }
}
