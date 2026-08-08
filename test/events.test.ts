import { describe, expect, it, vi } from 'vitest';
import { InMemoryEventBus } from '../src/events/event-bus.js';
import type { AppEvent, EventBus } from '../src/events/event-bus.js';

describe('InMemoryEventBus', () => {
  it('publishes and delivers events with envelope fields', () => {
    const bus: EventBus = new InMemoryEventBus();
    const handler = vi.fn();
    bus.subscribe('MessageReceived', handler);

    bus.publish('MessageReceived', {
      conversationId: 'c1',
      messageId: 'm1',
      userId: 'u1',
      content: 'oi',
      timestamp: new Date().toISOString(),
      hasMedia: false,
      mediaIds: [],
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const event: AppEvent = handler.mock.calls[0][0];
    expect(event.type).toBe('MessageReceived');
    expect(event.payload.conversationId).toBe('c1');
    expect(event.timestamp).toBeGreaterThan(0);
    expect(event.id).toMatch(/^evt-/);
  });

  it('does not deliver an event to subscribers of other types', () => {
    const bus = new InMemoryEventBus();
    const handler = vi.fn();
    bus.subscribe('ResponseSent', handler);
    bus.publish('MessageReceived', {
      conversationId: 'c1',
      messageId: 'm1',
      userId: 'u1',
      content: '',
      timestamp: new Date().toISOString(),
      hasMedia: false,
      mediaIds: [],
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('supports unsubscribe', () => {
    const bus = new InMemoryEventBus();
    const handler = vi.fn();
    const unsubscribe = bus.subscribe('ConversationStarted', handler);
    unsubscribe();
    bus.publish('ConversationStarted', { conversationId: 'c1', userId: 'u1' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('supports subscribeOnce', () => {
    const bus = new InMemoryEventBus();
    const handler = vi.fn();
    bus.subscribeOnce('ConversationStarted', handler);
    bus.publish('ConversationStarted', { conversationId: 'c1', userId: 'u1' });
    bus.publish('ConversationStarted', { conversationId: 'c2', userId: 'u1' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('delivers to subscribeAll handlers regardless of type', () => {
    const bus = new InMemoryEventBus();
    const handler = vi.fn();
    bus.subscribeAll(handler);
    bus.publish('AgentBooted', { bootTime: new Date().toISOString(), lastActiveAt: null });
    bus.publish('ConfigChanged', { key: 'a', oldValue: 1, newValue: 2 });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('routes handler errors to onError instead of throwing to publisher', () => {
    const onError = vi.fn();
    const bus = new InMemoryEventBus({ onError });
    bus.subscribe('AgentBooted', () => {
      throw new Error('boom');
    });
    expect(() =>
      bus.publish('AgentBooted', { bootTime: new Date().toISOString(), lastActiveAt: null }),
    ).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('routes async handler rejections to onError', async () => {
    const onError = vi.fn();
    const bus = new InMemoryEventBus({ onError });
    bus.subscribe('AgentBooted', async () => {
      throw new Error('async boom');
    });
    bus.publish('AgentBooted', { bootTime: new Date().toISOString(), lastActiveAt: null });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('keeps a bounded replay log with correlation ids', () => {
    const bus = new InMemoryEventBus({ logCapacity: 3 });
    bus.publish('AgentBooted', { bootTime: new Date().toISOString(), lastActiveAt: null });
    bus.publish('AgentBooted', { bootTime: new Date().toISOString(), lastActiveAt: null }, { correlationId: 'corr-1' });
    bus.publish('AgentBooted', { bootTime: new Date().toISOString(), lastActiveAt: null });
    const log = bus.getEventLog();
    expect(log).toHaveLength(3);
    expect(log[0].correlationId).toBeUndefined();
    expect(log[1].correlationId).toBe('corr-1');
    expect(log[2].correlationId).toBeUndefined();
  });

  it('throws when publishing after close', () => {
    const bus = new InMemoryEventBus();
    bus.close();
    expect(() => bus.publish('AgentBooted', { bootTime: new Date().toISOString(), lastActiveAt: null })).toThrow();
  });
});
