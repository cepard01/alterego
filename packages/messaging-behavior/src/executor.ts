// ResponseExecutor — applies a MessagePlan with real pacing against the
// gateway (v2 §10: "Response Planner + Typing Simulation" stage). Also
// produces Reminders for deferred answers and fires them at their trigger
// time via the scheduler.

import type { EventBus } from '@whatsapp-ai-agent/events';
import type { SendResult } from '@whatsapp-ai-agent/gateway';
import { MessagePlan, PendingReminder, ReminderRepo, ReminderScheduler, Sender } from './types.js';

export const REMINDER_FIRE_JOB = 'reminder.fire';

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class ResponseExecutor {
  constructor(
    private readonly bus: EventBus,
    private readonly sender: Sender,
    private readonly reminders: ReminderRepo,
    private readonly scheduler?: ReminderScheduler,
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
  ) {
    if (this.scheduler) {
      this.scheduler.register(REMINDER_FIRE_JOB, async (payload) => {
        this.bus.publish('ReminderFired', {
          reminderId: String(payload.reminderId ?? ''),
          userId: String(payload.userId ?? ''),
        });
      });
    }
  }

  async execute(plan: MessagePlan, input: { userId: string; conversationId: string }): Promise<SendResult[]> {
    const results: SendResult[] = [];
    for (const message of plan.messages) {
      if (message.delayMs > 0) await this.sleep(message.delayMs);
      if (message.typingMs > 0) {
        await this.sender.setPresence(input.conversationId, 'typing').catch(() => undefined);
        await this.sleep(message.typingMs);
      }
      switch (message.kind) {
        case 'sticker': {
          const result = await this.sender.send({
            conversationId: input.conversationId,
            userId: input.userId,
            text: '',
            mediaId: message.stickerId,
          });
          results.push(result);
          this.bus.publish('StickerSent', {
            stickerId: String(message.stickerId),
            messageId: result.messageId,
            conversationId: input.conversationId,
          });
          break;
        }
        case 'reaction':
          await this.sender.send({
            conversationId: input.conversationId,
            userId: input.userId,
            text: String(message.emoji ?? ''),
          });
          break;
        case 'text':
        default: {
          const result = await this.sender.send({
            conversationId: input.conversationId,
            userId: input.userId,
            text: message.text ?? '',
            replyToMessageId: message.replyToMessageId,
          });
          results.push(result);
        }
      }
    }
    return results;
  }

  /** Write a deferred-answer Reminder and arm its scheduler job (v2 §5). */
  async defer(reminder: PendingReminder, userId: string): Promise<{ id: string } | undefined> {
    if (!this.scheduler) return undefined;
    const created = await this.reminders.create({ userId, triggerAt: reminder.triggerAt, payload: reminder.payload });
    await this.scheduler.schedule({
      type: REMINDER_FIRE_JOB,
      payload: { reminderId: created.id, userId, reminderPayload: reminder.payload },
      runAt: reminder.triggerAt,
    });
    this.bus.publish('ReminderCreated', { reminderId: created.id, userId, triggerAt: reminder.triggerAt });
    return created;
  }
}
