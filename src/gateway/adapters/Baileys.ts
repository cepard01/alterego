// Baileys transport adapter — WhatsApp Web device pairing.
// The Baileys SDK is not vendored in this repo (heavy native deps); the
// adapter shape below is the contract, and the agent-runtime wiring layer
// injects a functional implementation that uses @whiskeysockets/baileys.

import { InboundMessage, OutboundMessage, PresenceState, SendResult, TransportAdapter } from '../types.js';

// TODO(gateway): implement with @whiskeysockets/baileys once the runtime
// environment provides the SDK. The interface is already the contract.
export class BaileysAdapter implements TransportAdapter {
  readonly name = 'baileys';

  async connect(): Promise<void> {
    throw new Error('BaileysAdapter is a stub; wire @whiskeysockets/baileys in agent-runtime');
  }

  async disconnect(): Promise<void> {
    throw new Error('BaileysAdapter is a stub');
  }

  async send(_message: OutboundMessage): Promise<SendResult> {
    throw new Error('BaileysAdapter is a stub');
  }

  async setPresence(_conversationId: string, _state: PresenceState): Promise<void> {
    throw new Error('BaileysAdapter is a stub');
  }

  ingest(_raw: Record<string, unknown>): InboundMessage | null {
    return null;
  }
}
