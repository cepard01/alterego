// Idle timers — schedules a close-check per conversation after activity
// and emits ConversationEnded when a conversation goes idle (v1 §12).

import { AppConfig, ConfigService } from '@alterego/config';
import { EventBus } from '@alterego/events';
import { Logger } from '@alterego/observability';
import { SchedulerService } from './Scheduler.js';

export const IDLE_CHECK_JOB = 'conversation.idle-check';

export interface IdleTimerOptions {
  bus: EventBus;
  scheduler: SchedulerService;
  config: Readonly<AppConfig> | ConfigService;
  logger?: Logger;
}

export class IdleTimer {
  private readonly bus: EventBus;
  private readonly scheduler: SchedulerService;
  private readonly config: Readonly<AppConfig>;
  private readonly idleMs: number;
  private readonly logger?: Logger;
  private detach: Array<() => void> = [];

  constructor(options: IdleTimerOptions) {
    this.bus = options.bus;
    this.scheduler = options.scheduler;
    this.config = options.config instanceof ConfigService ? options.config.get() : options.config;
    this.idleMs = this.config.scheduler.idleConversationMs;
    this.logger = options.logger;
  }

  start(): void {
    this.scheduler.register(IDLE_CHECK_JOB, async (payload) => {
      const conversationId = String(payload.conversationId);
      const userId = String(payload.userId);
      const lastActivity = String(payload.lastActivityAt);
      const idleSince = Date.now() - new Date(lastActivity).getTime();
      if (idleSince >= this.idleMs) {
        this.bus.publish('ConversationEnded', {
          conversationId,
          userId,
          reason: 'inactivity',
        });
        this.logger?.debug('conversation closed by idle timer', { conversationId, userId });
      }
    });
    this.detach.push(
      this.bus.subscribe('MessageReceived', (event) => {
        void this.scheduler.schedule({
          type: IDLE_CHECK_JOB,
          payload: {
            conversationId: event.payload.conversationId,
            userId: event.payload.userId,
            lastActivityAt: event.payload.timestamp,
          },
          runAt: new Date(Date.now() + this.idleMs).toISOString(),
        });
      }),
    );
  }

  stop(): void {
    this.detach.forEach((detach) => detach());
    this.detach = [];
    this.scheduler.unregister(IDLE_CHECK_JOB);
  }
}

