// Entity shapes for every persisted record in the system.
// Sources: v1 §4 (Data Models), v2 §Data Model Additions, v3 §Data Model Additions.
// JSON columns hold free-form data; Postgres types are assigned in migrations.

// ── v1 entities ──────────────────────────────────────────────────────────────

export interface User {
  id: string;
  phoneNumber: string;
  displayName: string;
  timezone: string;
  locale: string;
  createdAt: string;
  lastSeenAt: string;
  optInStatus: 'none' | 'pending' | 'opted_in' | 'opted_out';
}

export interface Conversation {
  id: string;
  userId: string;
  status: 'active' | 'idle' | 'ended';
  startedAt: string;
  lastMessageAt: string;
  currentTopic: string | null;
  turnCount: number;
}

export interface Message {
  id: string;
  conversationId: string;
  sender: 'user' | 'agent';
  content: string;
  mediaId?: string;
  timestamp: string;
  isRead: boolean;
  replyToMessageId?: string;
}

export interface Media {
  id: string;
  messageId: string;
  type: 'image' | 'audio' | 'video' | 'document' | 'sticker';
  storageUrl: string;
  mimeType: string;
  caption: string | null;
  transcript: string | null;
  analysisSummary: string | null;
  durationMs?: number;
  sizeBytes: number;
}

export interface Memory {
  id: string;
  userId: string;
  type: 'fact' | 'preference' | 'event' | 'summary';
  content: string;
  embeddingVector: number[] | null;
  importance: number;
  confidence: number;
  source: 'user_stated' | 'inferred' | 'agent_generated' | 'false_memory_simulated';
  verificationStatus: 'unverified' | 'confirmed' | 'contradicted';
  createdAt: string;
  lastAccessedAt: string;
  expiresAt: string | null;
  sourceMessageId?: string;
  lastConfidenceDecayAt: string;
}

export interface Relationship {
  userId: string;
  familiarityLevel: number;
  trustScore: number;
  tonePreference: string;
  sharedContext: string[]; // inside jokes, recurring topics
  interactionCount: number;
  updatedAt: string;
}

export interface Personality {
  id: string;
  name: string;
  tone: string;
  humorStyle: string;
  verbosity: number;
  emojiFrequency: number;
  vocabularyProfile: Record<string, unknown>;
  quirks: string[];
  version: number;
  updatedAt: string;
}

export interface Session {
  id: string;
  conversationId: string;
  openedAt: string;
  closedAt: string | null;
  closeReason: string | null;
}

export interface Knowledge {
  id: string;
  topic: string;
  content: string;
  embeddingVector: number[] | null;
  source: string;
  confidence: number;
}

export interface BehaviorProfile {
  id: string;
  name: string;
  replyLatencyCurve: Record<string, unknown>;
  ignoreProbability: number;
  multiMessageProbability: number;
  topicChangeTolerance: number;
  questionAskingRate: number;
  activityCurve: Record<string, unknown>;
  updatedAt: string;
}

export interface Reminder {
  id: string;
  userId: string;
  triggerAt: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'fired' | 'cancelled';
  createdAt: string;
}

export interface TaskQueue {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  runAt: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  retryCount: number;
  maxRetries: number;
  error?: string;
  updatedAt: string;
}

export interface InteractionHistory {
  userId: string;
  date: string;
  messageCount: number;
  avgResponseTime: number;
  sentimentTrend: number;
}

// ── v2 entities ──────────────────────────────────────────────────────────────

export interface WorldState {
  id: string;
  agentId: string;
  activity: string;
  locationContext: string;
  availability: number;
  energyLevel: number;
  stressLevel: number;
  focusLevel: number;
  deviceBattery: number;
  sleepState: string;
  currentActivityDetail: string;
  updatedAt: string;
}

export interface Thought {
  id: string;
  userId: string;
  category: 'thought' | 'interpretation' | 'prediction';
  content: string;
  confidence: number;
  relatedMemoryIds: string[];
  relatedMessageId?: string;
  createdAt: string;
  verifiedAt: string | null;
  verificationResult: 'confirmed' | 'contradicted' | 'expired' | null;
  source: 'user_stated' | 'inferred' | 'agent_generated' | 'false_memory_simulated';
  verificationStatus: 'unverified' | 'confirmed' | 'contradicted';
  lastConfidenceDecayAt: string;
}

export interface SocialGraphNode {
  userId: string;
  displayName: string;
  createdAt: string;
}

export interface SocialGraphEdge {
  fromUserId: string;
  toUserId: string;
  edgeType: 'friend' | 'family' | 'coworker' | 'unknown';
  strength: number;
  sharedJokes: string[];
  sharedInterests: string[];
  sharedEvents: string[];
  interactionFrequency: number;
  lastConfirmedAt: string;
  /** Per-contact behavior variance (v2 §11) — null means fall back to the global baseline. */
  effectiveVerbosity?: number;
  effectiveEnergy?: number;
}

export interface SocialCluster {
  id: string;
  memberUserIds: string[];
  clusterLabel: string;
  cohesionScore: number;
}

export interface Sticker {
  id: string;
  packId: string;
  fileUrl: string;
  emotionTags: string[];
  intentTags: string[];
  humorLevel: number;
  contextTags: string[];
  usageFrequency: number;
  replyProbabilityWeight: number;
  preferredContactIds: string[];
  lastUsedAt: string | null;
}

export interface PsychologyState {
  userId: string;
  curiosity: number;
  trust: number;
  patience: number;
  interest: number;
  socialEnergy: number;
  empathy: number;
  confidence: number;
  stress: number;
  comfort: number;
  conversationFatigue: number;
  updatedAt: string;
}

export interface EvaluationReport {
  id: string;
  conversationId: string;
  metrics: Record<string, number>;
  humanLikenessScore: number;
  createdAt: string;
}

// ── v3 entities ──────────────────────────────────────────────────────────────

export interface IdentityProfile {
  id: string;
  agentId: string;
  name: string;
  age: number;
  backgroundSummary: string;
  education: string[];
  occupation: string;
  hometown: string;
  interests: string[];
  values: string[];
  beliefs: string[];
  skills: string[];
  familySummary: string;
  version: number;
  createdAt: string;
  lastEvolvedAt: string;
}

export interface TimelineEvent {
  id: string;
  agentId: string;
  eventType: 'milestone' | 'achievement' | 'trip' | 'change' | 'purchase';
  title: string;
  description: string;
  occurredAt: string;
  occurredRangeEnd?: string;
  relatedIdentityFields: string[];
  relatedMemoryIds: string[];
  importanceScore: number;
}

export interface InventoryItem {
  id: string;
  agentId: string;
  category: 'device' | 'instrument' | 'vehicle' | 'book' | 'clothing' | 'other';
  name: string;
  description: string;
  acquiredAt: string | null;
  sentiment: 'neutral' | 'favorite' | 'frustrating';
  linkedGoalId?: string;
  stillOwned: boolean;
}

export interface Goal {
  id: string;
  agentId: string;
  category: 'dream' | 'project' | 'purchase' | 'skill' | 'plan';
  title: string;
  description: string;
  status: 'active' | 'paused' | 'achieved' | 'abandoned';
  progress: number;
  targetDate?: string;
  createdAt: string;
  resolvedAt: string | null;
  resolutionLink: { timelineEventId?: string; inventoryItemId?: string } | null;
}

export interface CalendarEntry {
  id: string;
  agentId: string;
  type: 'recurring' | 'one_off';
  title: string;
  category: 'work' | 'school' | 'social' | 'appointment' | 'trip' | 'free_time';
  recurrenceRule?: string;
  startAt: string;
  endAt: string;
  worldStateOverride: { activity: string; availabilityDelta: number };
}

export interface MemoryContradiction {
  id: string;
  memoryIdA: string;
  memoryIdB?: string;
  messageId?: string;
  detectedAt: string;
  resolution: 'unresolved' | 'reinterpreted' | 'corrected' | 'ignored';
}

export interface RecoveryPlan {
  id: string;
  conversationId: string;
  gapDurationMs: number;
  freshnessScore: number;
  strategy:
    | 'respond_normally'
    | 'respond_with_summary_awareness'
    | 'respond_with_soft_acknowledgment'
    | 'skip_silently'
    | 'reopen_selectively';
  reconstructedContextType: 'raw' | 'summary' | 'summary_plus_questions';
  scheduledResponseAt: string | null;
  status: 'pending' | 'executed' | 'skipped';
}

export interface IdentityEvolutionProposal {
  id: string;
  agentId: string;
  fieldChanged: string;
  oldValue: string;
  newValue: string;
  supportingEvidence: string[];
  confidence: number;
  status: 'proposed' | 'auto_committed' | 'manually_approved' | 'rejected';
  createdAt: string;
  resolvedAt: string | null;
}
