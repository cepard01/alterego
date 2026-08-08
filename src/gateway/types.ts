// Gateway types — transport-agnostic message shapes (v1 §3 Message Gateway).

export interface InboundMedia {
  mediaId: string;
  type: 'image' | 'audio' | 'video' | 'document' | 'sticker';
  mimeType?: string;
  sizeBytes?: number;
  storageUrl?: string;
}

export interface InboundMessage {
  id: string;
  conversationId: string;
  userId: string;
  /** Phone number in E.164 form when known. */
  phoneNumber?: string;
  content: string;
  timestamp: string;
  hasMedia: boolean;
  media?: InboundMedia[];
  replyToMessageId?: string;
  /** Raw transport envelope (for debugging/replay), redacted. */
  raw?: Record<string, unknown>;
}

export interface OutboundMessage {
  conversationId: string;
  userId: string;
  text: string;
  replyToMessageId?: string;
  mediaId?: string;
  /** When present, sends typing/presence signals around the message. */
  simulateHuman?: { typingMs: number; readDelayMs?: number };
}

export interface SendResult {
  messageId: string;
  conversationId: string;
  sentAt: string;
}

export type PresenceState = 'online' | 'offline' | 'typing' | 'read';

/**
 * A WhatsApp transport. Implementations: Baileys (device pairing) and
 * Cloud API (webhook-based). The gateway core only ever sees this interface.
 */
export interface TransportAdapter {
  readonly name: string;
  /** Connect (and, for Baileys, authenticate the device). */
  connect(): Promise<void>;
  /** Disconnect cleanly. */
  disconnect(): Promise<void>;
  /** Send an outbound message. */
  send(message: OutboundMessage): Promise<SendResult>;
  /** Update presence (appear offline/online, typing, read receipts). */
  setPresence(conversationId: string, state: PresenceState): Promise<void>;
  /** Handle an inbound envelope; returns null when the gateway should ignore it. */
  ingest(raw: Record<string, unknown>): InboundMessage | null;
}
