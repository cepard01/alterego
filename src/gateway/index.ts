// Message Gateway — WhatsApp transport normalization and outbound sends (v1 §3).

export { MessageGateway } from './gateway.js';
export type { GatewayOptions } from './gateway.js';
export { CloudApiAdapter } from './adapters/cloud-api.js';
export { BaileysAdapter } from './adapters/baileys.js';
export type { InboundMedia, InboundMessage, OutboundMessage, PresenceState, SendResult, TransportAdapter } from './types.js';
