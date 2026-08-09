// ResponsePlanner — turns a SimulatedAction + LLM text into the concrete
// sequenced WhatsApp event plan (v2 §5, §10): bubble pacing, self-correction,
// deferred answers.

import { MessagePlan, PlanInput, PlannedMessage } from './types.js';

const CORRECTION_GAP_MS = 2500;
const MAX_BUBBLES = 3;

/** Splits text into natural bubbles at sentence boundaries (v2 §5). */
export function splitBubbles(text: string, count: number): string[] {
  const sentences = text.match(/[^.!?…]+[.!?…]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [text.trim()];
  if (count <= 1 || sentences.length <= 1 || text.length < 40) return [text.trim()];
  const target = Math.min(count, sentences.length);
  const perBubble = Math.ceil(sentences.length / target);
  const bubbles: string[] = [];
  for (let i = 0; i < sentences.length; i += perBubble) {
    bubbles.push(sentences.slice(i, i + perBubble).join(' ').trim());
    if (bubbles.length === target) break;
  }
  return bubbles;
}

export class ResponsePlanner {
  /**
   * Plan the outbound sequence. Pure — no IO; the executor applies it.
   */
  plan(input: PlanInput): MessagePlan {
    const messages: PlannedMessage[] = [];
    const action = input.action;

    if (action.type === 'sticker' && action.params.stickerId) {
      messages.push({
        kind: 'sticker',
        stickerId: String(action.params.stickerId),
        fileUrl: action.params.fileUrl ? String(action.params.fileUrl) : undefined,
        delayMs: 0,
        typingMs: 0,
      });
    } else if (action.type === 'emoji_reaction' && action.params.emoji) {
      messages.push({
        kind: 'reaction',
        emoji: String(action.params.emoji),
        delayMs: 0,
        typingMs: 0,
      });
    } else if (input.text) {
      const typingMs = Math.max(150, Math.round(action.timing.typingDurationMs / 2));

      // Multi-message pacing (v2 §5): split into paced bubbles.
      if (action.type === 'multi_message') {
        const count = Math.min(input.bubbleCount ?? MAX_BUBBLES, MAX_BUBBLES);
        const bubbles = splitBubbles(input.text, count);
        messages.push(...bubbles.map((text, index) => ({
          kind: 'text' as const,
          text,
          delayMs: index === 0 ? 0 : 400 + Math.round(Math.random() * 900),
          typingMs,
          replyToMessageId: index === 0 ? input.replyToMessageId : undefined,
        })));
      } else {
        messages.push({
          kind: 'text',
          text: input.text,
          delayMs: 0,
          typingMs,
          replyToMessageId: input.replyToMessageId,
        });
      }

      // Self-correction (v2 §5): coherent second part, delivered after a gap.
      if (input.correction) {
        messages.push({
          kind: 'text',
          text: input.correction,
          delayMs: CORRECTION_GAP_MS,
          typingMs: Math.max(150, Math.round(action.timing.typingDurationMs / 3)),
        });
      }
    }

    // Deferred answers (v2 §5): skip now, circle back via a Reminder.
    const reminders = input.deferredQuestion
      ? [{
          triggerAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          payload: { conversationId: input.conversationId, userId: input.userId, question: input.deferredQuestion },
        } satisfies { triggerAt: string; payload: Record<string, unknown> }]
      : [];

    const totalDurationMs = messages.reduce((sum, message) => sum + message.delayMs + message.typingMs, 0);
    return { messages, reminders, totalDurationMs };
  }
}