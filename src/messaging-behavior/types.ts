// Shared types for the Human Messaging Model (v2 §5, §10).

import type { OutboundMessage, SendResult } from '@whatsapp-ai-agent/gateway';
import type { SimulatedAction } from '@whatsapp-ai-agent/human-simulation';

export type PlannedMessageKind = 'text' | 'sticker' | 'reaction';

export interface PlannedMessage {
  kind: PlannedMessageKind;
  text?: string;
  stickerId?: string;
  fileUrl?: string;
  emoji?: string;
  replyToMessageId?: string;
  /** Pause before this message starts (after prior event completes). */
  delayMs: number;
  /** Per-message simulated typing duration (WhatsApp typing indicator). */
  typingMs: number;
}

export interface PendingReminder {
  triggerAt: string;
  payload: Record<string, unknown>;
}

export interface MessagePlan {
  messages: PlannedMessage[];
  reminders: PendingReminder[];
  totalDurationMs: number;
}

export interface PlanInput {
  action: SimulatedAction;
  userId: string;
  conversationId: string;
  /** Main outbound text (already shaped by the LLM + prompt builder). */
  text?: string;
  /**
   * Self-correction simulation (v2 §5): the LLM produced both parts in one
   * call; this is the follow-up "wait I meant—" message.
   */
  correction?: string;
  /** Deferred answer (v2 §5): unanswered question to circle back to later. */
  deferredQuestion?: string;
  /** Force a bubble count override (personality verbosity). */
  bubbleCount?: number;
  replyToMessageId?: string;
}

/** Structural slice of the gateway — one method is enough for the planner stage. */
export interface Sender {
  send(message: OutboundMessage): Promise<SendResult>;
  setPresence(conversationId: string, state: 'typing'): Promise<void>;
}

/** Structural slice of scheduler for one-shot reminder jobs. */
export interface ReminderScheduler {
  register(type: string, handler: (payload: Record<string, unknown>) => Promise<void> | void): void;
  schedule(job: { type: string; payload: Record<string, unknown>; runAt: string }): Promise<void>;
}

export interface ReminderRepo {
  create(reminder: { userId: string; triggerAt: string; payload: Record<string, unknown>; id?: string }): Promise<{ id: string }>;
}

export type { OutboundMessage, SendResult };