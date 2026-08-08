// Event contracts — the typed vocabulary of every event that flows on the Event Bus.
// Sources: v1 §13, v2 §3/§4/§8/§9, v3 §7/§8/§9. All payloads are plain data so this
// package can stay dependency-free; richer types live in the domain packages.

export const EVENT_TYPES = [
  'AgentBooted',
  'MessageReceived',
  'MediaReceived',
  'MediaAnalyzed',
  'MemoryCreated',
  'MemoryUpdated',
  'MemoryExpired',
  'ConversationStarted',
  'ConversationEnded',
  'BehaviorDecided',
  'LLMCompleted',
  'ResponseQueued',
  'ResponseSent',
  'ConfigChanged',
  'ReminderCreated',
  'ReminderFired',
  'WorldStateUpdated',
  'PsychologyUpdated',
  'ThoughtCreated',
  'ThoughtVerified',
  'RelationshipEdgeUpdated',
  'StickerSent',
  'EvaluationReportCreated',
  'MemoryContradiction',
  'RecoveryPlanCreated',
  'IdentityEvolutionProposed',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/** Decision vocabulary from v2 ch. 1 (Supersedes v1 §13's reply|ignore|delay). */
export type BehaviorDecision =
  | 'reply'
  | 'ignore'
  | 'emoji_reaction'
  | 'sticker'
  | 'delayed_reply'
  | 'multi_message'
  | 'go_idle'
  | 'appear_offline'
  | 'change_subject'
  | 'forget_on_purpose'
  | 'appear_distracted';

export type MediaKind = 'image' | 'audio' | 'video' | 'document' | 'sticker';
export type MemoryKind = 'fact' | 'preference' | 'event' | 'summary';
export type ThoughtCategory = 'thought' | 'interpretation' | 'prediction';
export type TokenUsage = { promptTokens: number; completionTokens: number; totalTokens: number };

export interface AgentBootedPayload {
  bootTime: string;
  lastActiveAt: string | null;
}

export interface MessageReceivedPayload {
  conversationId: string;
  messageId: string;
  userId: string;
  content: string;
  timestamp: string;
  hasMedia: boolean;
  mediaIds: string[];
  replyToMessageId?: string;
}

export interface MediaReceivedPayload {
  messageId: string;
  mediaId: string;
  type: MediaKind;
}

export interface MediaAnalyzedPayload {
  mediaId: string;
  analysisSummary: string;
  transcript?: string;
}

export interface MemoryCreatedPayload {
  memoryId: string;
  userId: string;
  type: MemoryKind;
  importance: number;
}

export interface MemoryUpdatedPayload {
  memoryId: string;
  changes: Record<string, unknown>;
}

export interface MemoryExpiredPayload {
  memoryId: string;
  userId: string;
  reason: 'pruned' | 'expired' | 'superseded';
}

export interface ConversationStartedPayload {
  conversationId: string;
  userId: string;
}

export interface ConversationEndedPayload {
  conversationId: string;
  userId: string;
  reason: 'inactivity' | 'user_signoff' | 'agent_close' | 'error';
}

export interface BehaviorDecidedPayload {
  messageId: string;
  conversationId: string;
  decision: BehaviorDecision;
  params: Record<string, unknown>;
}

export interface LLMCompletedPayload {
  requestId: string;
  provider: string;
  model: string;
  latencyMs: number;
  usage: TokenUsage;
  /** For per-user cost rollup (v1 §16). */
  userId?: string;
  conversationId?: string;
}

export interface ResponseQueuedPayload {
  messageId: string;
  conversationId: string;
  sendAt: string;
}

export interface ResponseSentPayload {
  messageId: string;
  conversationId: string;
}

export interface ConfigChangedPayload {
  key: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface ReminderCreatedPayload {
  reminderId: string;
  userId: string;
  triggerAt: string;
}

export interface ReminderFiredPayload {
  reminderId: string;
  userId: string;
}

export interface WorldStateUpdatedPayload {
  activity: string;
  availability: number;
  energyLevel: number;
  stressLevel: number;
  focusLevel: number;
  updatedAt: string;
}

export interface PsychologyUpdatedPayload {
  userId: string;
  changes: Record<string, number>;
}

export interface ThoughtCreatedPayload {
  thoughtId: string;
  userId: string;
  category: ThoughtCategory;
  confidence: number;
}

export interface ThoughtVerifiedPayload {
  thoughtId: string;
  verificationResult: 'confirmed' | 'contradicted' | 'expired';
}

export interface RelationshipEdgeUpdatedPayload {
  fromUserId: string;
  toUserId: string;
  changes: Record<string, unknown>;
}

export interface StickerSentPayload {
  stickerId: string;
  messageId: string;
  conversationId: string;
}

export interface EvaluationReportCreatedPayload {
  reportId: string;
  conversationId: string;
  humanLikenessScore: number;
}

export interface MemoryContradictionPayload {
  contradictionId: string;
  memoryIdA: string;
  memoryIdB?: string;
  messageId?: string;
  detectedAt: string;
}

export interface RecoveryPlanCreatedPayload {
  planId: string;
  conversationId: string;
  strategy:
    | 'respond_normally'
    | 'respond_with_summary_awareness'
    | 'respond_with_soft_acknowledgment'
    | 'skip_silently'
    | 'reopen_selectively';
}

export interface IdentityEvolutionProposedPayload {
  proposalId: string;
  fieldChanged: string;
  status: 'proposed' | 'auto_committed' | 'manually_approved' | 'rejected';
}

/** Maps every EventType to its payload type. */
export interface EventPayloadMap {
  AgentBooted: AgentBootedPayload;
  MessageReceived: MessageReceivedPayload;
  MediaReceived: MediaReceivedPayload;
  MediaAnalyzed: MediaAnalyzedPayload;
  MemoryCreated: MemoryCreatedPayload;
  MemoryUpdated: MemoryUpdatedPayload;
  MemoryExpired: MemoryExpiredPayload;
  ConversationStarted: ConversationStartedPayload;
  ConversationEnded: ConversationEndedPayload;
  BehaviorDecided: BehaviorDecidedPayload;
  LLMCompleted: LLMCompletedPayload;
  ResponseQueued: ResponseQueuedPayload;
  ResponseSent: ResponseSentPayload;
  ConfigChanged: ConfigChangedPayload;
  ReminderCreated: ReminderCreatedPayload;
  ReminderFired: ReminderFiredPayload;
  WorldStateUpdated: WorldStateUpdatedPayload;
  PsychologyUpdated: PsychologyUpdatedPayload;
  ThoughtCreated: ThoughtCreatedPayload;
  ThoughtVerified: ThoughtVerifiedPayload;
  RelationshipEdgeUpdated: RelationshipEdgeUpdatedPayload;
  StickerSent: StickerSentPayload;
  EvaluationReportCreated: EvaluationReportCreatedPayload;
  MemoryContradiction: MemoryContradictionPayload;
  RecoveryPlanCreated: RecoveryPlanCreatedPayload;
  IdentityEvolutionProposed: IdentityEvolutionProposedPayload;
}

export type EventPayload<E extends EventType> = EventPayloadMap[E];
