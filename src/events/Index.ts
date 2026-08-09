// Event Bus & Contracts — central pub/sub backbone every other package
// communicates through. Implements v1 §13 Event System.

export {
  EVENT_TYPES,
} from './Events.js';
export type {
  EventPayloadMap,
  AgentBootedPayload,
  BehaviorDecision,
  BehaviorDecidedPayload,
  ConfigChangedPayload,
  ConversationEndedPayload,
  ConversationStartedPayload,
  EvaluationReportCreatedPayload,
  EventPayload,
  EventType,
  IdentityEvolutionProposedPayload,
  LLMCompletedPayload,
  MediaAnalyzedPayload,
  MediaKind,
  MediaReceivedPayload,
  MemoryContradictionPayload,
  MemoryCreatedPayload,
  MemoryExpiredPayload,
  MemoryKind,
  MemoryUpdatedPayload,
  MessageReceivedPayload,
  PsychologyUpdatedPayload,
  RecoveryPlanCreatedPayload,
  RelationshipEdgeUpdatedPayload,
  ReminderCreatedPayload,
  ReminderFiredPayload,
  ResponseQueuedPayload,
  ResponseSentPayload,
  StickerSentPayload,
  ThoughtCategory,
  ThoughtCreatedPayload,
  ThoughtVerifiedPayload,
  TokenUsage,
  WorldStateUpdatedPayload,
} from './Events.js';

export { InMemoryEventBus } from './EventBus.js';
export type { AppEvent, EventBus, EventBusOptions, EventHandler, PublishOptions, Unsubscribe } from './EventBus.js';

