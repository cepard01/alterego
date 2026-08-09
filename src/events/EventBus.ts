// Event Bus — in-process pub/sub whose interface is shaped like a real broker
// (publish/subscribe, opaque events, replayable log) so the backing transport
// (Redis Streams / NATS / Kafka) can be swapped later without touching callers.
// Source: v1 §13.

import { EventPayload, EventPayloadMap, EventType } from './Events.js';

let nextEventId = 0;

export interface AppEvent<E extends EventType = EventType> {
  /** Globally unique event id, usable for replay/correlation. */
  id: string;
  type: E;
  payload: EventPayload<E>;
  /** Epoch millis when the event was created. */
  timestamp: number;
  /** Correlation id threaded through a message lifecycle (see observability). */
  correlationId?: string;
}

export type EventHandler<E extends EventType> = (event: AppEvent<E>) => void | Promise<void>;

export type Unsubscribe = () => void;

export interface PublishOptions {
  correlationId?: string;
}

export interface EventBusOptions {
  /** Maximum events kept in the in-memory replay log (0 disables the log). */
  logCapacity?: number;
  /** Called when a handler throws/rejects, so the publisher never sees handler errors. */
  onError?: (error: unknown, event: AppEvent) => void;
}

export interface EventBus {
  publish<E extends EventType>(type: E, payload: EventPayloadMap[E], options?: PublishOptions): void;
  subscribe<E extends EventType>(type: E, handler: EventHandler<E>): Unsubscribe;
  subscribeOnce<E extends EventType>(type: E, handler: EventHandler<E>): Unsubscribe;
  /** Subscribes to every event type — used by observability and replay tooling. */
  subscribeAll(handler: EventHandler<EventType>): Unsubscribe;
  /** Read-only access to the bounded replay log (most recent first). */
  getEventLog(): readonly AppEvent[];
  /** Removes all handlers and clears the log. */
  clear(): void;
  /** Removes all handlers and stops the bus. */
  close(): void;
}

export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<EventType, Set<EventHandler<any>>>();
  private allHandlers: EventHandler<EventType>[] = [];
  private readonly eventLog: AppEvent[] = [];
  private readonly logCapacity: number;
  private readonly onError: NonNullable<EventBusOptions['onError']>;
  private closed = false;

  constructor(options: EventBusOptions = {}) {
    this.logCapacity = options.logCapacity ?? 10_000;
    this.onError =
      options.onError ??
      ((error, event) => {
        console.error(`[events] handler for "${event.type}" failed:`, error);
      });
  }

  publish<E extends EventType>(type: E, payload: EventPayloadMap[E], options?: PublishOptions): void {
    if (this.closed) {
      throw new Error(`EventBus is closed; cannot publish "${type}"`);
    }
    const event: AppEvent<E> = {
      id: `evt-${Date.now()}-${(nextEventId++).toString(36)}`,
      type,
      payload,
      timestamp: Date.now(),
      correlationId: options?.correlationId,
    };
    if (this.logCapacity > 0) {
      this.eventLog.push(event);
      if (this.eventLog.length > this.logCapacity) {
        this.eventLog.splice(0, this.eventLog.length - this.logCapacity);
      }
    }
    this.dispatch(event);
  }

  subscribe<E extends EventType>(type: E, handler: EventHandler<E>): Unsubscribe {
    const set = this.handlers.get(type) ?? new Set<EventHandler<any>>();
    set.add(handler);
    this.handlers.set(type, set);
    return () => set.delete(handler);
  }

  subscribeOnce<E extends EventType>(type: E, handler: EventHandler<E>): Unsubscribe {
    const unsubscribe = this.subscribe(type, (event) => {
      unsubscribe();
      return handler(event);
    });
    return unsubscribe;
  }

  subscribeAll(handler: EventHandler<EventType>): Unsubscribe {
    this.allHandlers.push(handler);
    return () => {
      this.allHandlers = this.allHandlers.filter((h) => h !== handler);
    };
  }

  getEventLog(): readonly AppEvent[] {
    return this.eventLog;
  }

  clear(): void {
    this.handlers.clear();
    this.allHandlers = [];
    this.eventLog.length = 0;
  }

  close(): void {
    this.closed = true;
    this.clear();
  }

  private dispatch<E extends EventType>(event: AppEvent<E>): void {
    for (const handler of this.handlers.get(event.type) ?? []) {
      this.runHandler(handler, event);
    }
    for (const handler of this.allHandlers) {
      this.runHandler(handler, event);
    }
  }

  private runHandler(handler: EventHandler<any>, event: AppEvent): void {
    try {
      const result = handler(event);
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch((error) => this.onError(error, event));
      }
    } catch (error) {
      this.onError(error, event);
    }
  }
}

