import { describe, expect, it } from 'vitest';
import { ConfigService } from '@alterego/config';
import { InMemoryEventBus } from '@alterego/events';
import { DataService } from '@alterego/data';
import { ResponseExecutor, ResponsePlanner } from '../src/messaging-behavior/index.js';
import type { PlanInput, Sender } from '../src/messaging-behavior/index.js';
import type { SimulatedAction } from '@alterego/human-simulation';

const action: SimulatedAction = {
  type: 'reply',
  timing: { readDelayMs: 1000, typingStartDelayMs: 500, typingDurationMs: 2000, sendDelayMs: 300, totalDelayMs: 3800 },
  confidence: 0.8,
  reasoning: [],
  params: {},
};

function makeInput(overrides: Partial<PlanInput> = {}): PlanInput {
  return { action, userId: 'user-1', conversationId: 'conv-1', text: 'Oi! Tudo bem?', ...overrides };
}

function makeSender(calls: { send: unknown[]; presence: unknown[] }): Sender {
  return {
    send: async (message) => {
      calls.send.push(message);
      return { messageId: `msg-${calls.send.length}`, conversationId: message.conversationId, sentAt: new Date().toISOString() };
    },
    setPresence: async () => {
      calls.presence.push(1);
    },
  };
}

describe('ResponsePlanner', () => {
  it('plans a single bubble for a plain reply', () => {
    const planner = new ResponsePlanner();
    const plan = planner.plan(makeInput());
    expect(plan.messages).toHaveLength(1);
    expect(plan.messages[0].kind).toBe('text');
    expect(plan.messages[0].text).toBe('Oi! Tudo bem?');
    expect(plan.messages[0].typingMs).toBeGreaterThan(0);
    expect(plan.totalDurationMs).toBeGreaterThan(0);
  });

  it('splits a multi_message action into paced bubbles (v2 §5)', () => {
    const planner = new ResponsePlanner();
    const plan = planner.plan(
      makeInput({ action: { ...action, type: 'multi_message' }, text: 'Primeira frase sobre o assunto. Segunda frase completando. E uma terceira pra fechar.' }),
    );
    expect(plan.messages.length).toBeGreaterThanOrEqual(2);
    expect(plan.messages[0].delayMs).toBe(0);
    expect(plan.messages[1].delayMs).toBeGreaterThan(0);
  });

  it('sequences a self-correction follow-up after a gap (v2 §5)', () => {
    const planner = new ResponsePlanner();
    const plan = planner.plan(makeInput({ text: 'Vou chegar lá às 20h.', correction: 'Digo, às 19h30!' }));
    expect(plan.messages).toHaveLength(2);
    expect(plan.messages[1].text).toBe('Digo, às 19h30!');
    expect(plan.messages[1].delayMs).toBeGreaterThanOrEqual(2000);
  });

  it('plans a reminder for a deferred answer (v2 §5)', () => {
    const planner = new ResponsePlanner();
    const plan = planner.plan(makeInput({ deferredQuestion: 'Você ainda quer ver o filme sexta?' }));
    expect(plan.reminders).toHaveLength(1);
    expect(plan.reminders[0].payload.question).toBe('Você ainda quer ver o filme sexta?');
  });

  it('plans a sticker action without text', () => {
    const planner = new ResponsePlanner();
    const plan = planner.plan(makeInput({ action: { ...action, type: 'sticker', params: { stickerId: 'st-1', fileUrl: 'https://x/st.webp' } }, text: undefined }));
    expect(plan.messages).toHaveLength(1);
    expect(plan.messages[0].kind).toBe('sticker');
    expect(plan.messages[0].stickerId).toBe('st-1');
  });
});

describe('ResponseExecutor', () => {
  it('executes messages with typing + pauses through the sender', async () => {
    const bus = new InMemoryEventBus();
    const config = new ConfigService(bus, {
      env: { DATABASE_URL: 'postgres://localhost:5432/test', REDIS_URL: 'redis://localhost:6379' },
      quiet: true,
    });
    const data = new DataService(config, undefined, { memoryMode: true });
    const calls: { send: unknown[]; presence: unknown[] } = { send: [], presence: [] };
    const executor = new ResponseExecutor(
      bus,
      makeSender(calls),
      data.reminders,
      undefined,
      async () => undefined, // instant sleep for tests
    );
    const planner = new ResponsePlanner();
    const plan = planner.plan(makeInput());
    const results = await executor.execute(plan, { userId: 'user-1', conversationId: 'conv-1' });

    expect(results).toHaveLength(1);
    expect(calls.send).toHaveLength(1);
    expect(calls.presence.length).toBeGreaterThanOrEqual(1);
    expect((calls.send[0] as { text: string }).text).toBe('Oi! Tudo bem?');
  });

  it('writes a reminder and arms a fire job for deferred answers', async () => {
    const bus = new InMemoryEventBus();
    const config = new ConfigService(bus, {
      env: { DATABASE_URL: 'postgres://localhost:5432/test', REDIS_URL: 'redis://localhost:6379' },
      quiet: true,
    });
    const data = new DataService(config, undefined, { memoryMode: true });
    const calls: { send: unknown[]; presence: unknown[] } = { send: [], presence: [] };
    const scheduled: Array<{ type: string; runAt: string }> = [];
    const fakeScheduler = {
      register: () => undefined,
      schedule: async (job: { type: string; runAt: string }) => {
        scheduled.push(job);
      },
    };
    const executor = new ResponseExecutor(bus, makeSender(calls), data.reminders, fakeScheduler, async () => undefined);

    let createdId: string | undefined;
    bus.subscribe('ReminderCreated', ({ payload }) => {
      createdId = payload.reminderId;
    });

    const reminder = { triggerAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), payload: { question: 'filme sexta?' } };
    const written = await executor.defer(reminder, 'user-1');
    expect(written?.id).toBeDefined();
    expect(createdId).toBe(written?.id);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].type).toBe('reminder.fire');
    expect(scheduled[0].runAt).toBe(reminder.triggerAt);
  });
});
