// Message Gateway — WhatsApp transport normalization and outbound sends (v1 §3).

export { MessageGateway } from './Gateway.js';
export type { GatewayOptions } from './Gateway.js';
export { CloudApiAdapter } from './adapters/CloudApi.js';
export { BaileysAdapter } from './adapters/Baileys.js';
export type { InboundMedia, InboundMessage, OutboundMessage, PresenceState, SendResult, TransportAdapter } from './Types.js';

