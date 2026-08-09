// MikroORM entity definitions for every persisted record.
// v1 §4, v2 §Data Model Additions, v3 §Data Model Additions.

import { defineEntity } from '@mikro-orm/core';

function entity(name: string, table: string, properties: Record<string, unknown>): any {
  return defineEntity({ name, tableName: table, properties } as never);
}

export const UserEntity = entity('User', 'users', {
  id: { type: 'string', primary: true },
  phoneNumber: { type: 'string', name: 'phone_number' },
  displayName: { type: 'string', name: 'display_name' },
  timezone: { type: 'string' },
  locale: { type: 'string' },
  createdAt: { type: 'string', name: 'created_at' },
  lastSeenAt: { type: 'string', name: 'last_seen_at' },
  optInStatus: { type: 'string', name: 'opt_in_status', enum: ['none', 'pending', 'opted_in', 'opted_out'] },
});

export const ConversationEntity = entity('Conversation', 'conversations', {
  id: { type: 'string', primary: true },
  userId: { type: 'string', name: 'user_id' },
  status: { type: 'string', enum: ['active', 'idle', 'ended'] },
  startedAt: { type: 'string', name: 'started_at' },
  lastMessageAt: { type: 'string', name: 'last_message_at' },
  currentTopic: { type: 'string', name: 'current_topic', nullable: true },
  turnCount: { type: 'int', name: 'turn_count' },
});

export const MessageEntity = entity('Message', 'messages', {
  id: { type: 'string', primary: true },
  conversationId: { type: 'string', name: 'conversation_id' },
  sender: { type: 'string', enum: ['user', 'agent'] },
  content: { type: 'string' },
  mediaId: { type: 'string', name: 'media_id', nullable: true },
  timestamp: { type: 'string' },
  isRead: { type: 'boolean', name: 'is_read' },
  replyToMessageId: { type: 'string', name: 'reply_to_message_id', nullable: true },
});

export const MediaEntity = entity('Media', 'media', {
  id: { type: 'string', primary: true },
  messageId: { type: 'string', name: 'message_id' },
  type: { type: 'string', enum: ['image', 'audio', 'video', 'document', 'sticker'] },
  storageUrl: { type: 'string', name: 'storage_url' },
  mimeType: { type: 'string', name: 'mime_type' },
  caption: { type: 'string', nullable: true },
  transcript: { type: 'string', nullable: true },
  analysisSummary: { type: 'string', name: 'analysis_summary', nullable: true },
  durationMs: { type: 'int', name: 'duration_ms', nullable: true },
  sizeBytes: { type: 'int', name: 'size_bytes' },
});

export const MemoryEntity = entity('Memory', 'memory', {
  id: { type: 'string', primary: true },
  userId: { type: 'string', name: 'user_id' },
  type: { type: 'string', enum: ['fact', 'preference', 'event', 'summary'] },
  content: { type: 'string' },
  embeddingVector: { type: 'json', name: 'embedding_vector', nullable: true },
  importance: { type: 'float' },
  confidence: { type: 'float' },
  source: { type: 'string', enum: ['user_stated', 'inferred', 'agent_generated', 'false_memory_simulated'] },
  verificationStatus: { type: 'string', name: 'verification_status', enum: ['unverified', 'confirmed', 'contradicted'] },
  createdAt: { type: 'string', name: 'created_at' },
  lastAccessedAt: { type: 'string', name: 'last_accessed_at' },
  expiresAt: { type: 'string', name: 'expires_at', nullable: true },
  sourceMessageId: { type: 'string', name: 'source_message_id', nullable: true },
  lastConfidenceDecayAt: { type: 'string', name: 'last_confidence_decay_at' },
});

export const RelationshipEntity = entity('Relationship', 'relationships', {
  userId: { type: 'string', name: 'user_id', primary: true },
  familiarityLevel: { type: 'float', name: 'familiarity_level' },
  trustScore: { type: 'float', name: 'trust_score' },
  tonePreference: { type: 'string', name: 'tone_preference' },
  sharedContext: { type: 'json', name: 'shared_context' },
  interactionCount: { type: 'int', name: 'interaction_count' },
  updatedAt: { type: 'string', name: 'updated_at' },
});

export const PersonalityEntity = entity('Personality', 'personalities', {
  id: { type: 'string', primary: true },
  name: { type: 'string' },
  tone: { type: 'string' },
  humorStyle: { type: 'string', name: 'humor_style' },
  verbosity: { type: 'float' },
  emojiFrequency: { type: 'float', name: 'emoji_frequency' },
  vocabularyProfile: { type: 'json', name: 'vocabulary_profile' },
  quirks: { type: 'json' },
  version: { type: 'int' },
  updatedAt: { type: 'string', name: 'updated_at' },
});

export const SessionEntity = entity('Session', 'sessions', {
  id: { type: 'string', primary: true },
  conversationId: { type: 'string', name: 'conversation_id' },
  openedAt: { type: 'string', name: 'opened_at' },
  closedAt: { type: 'string', name: 'closed_at', nullable: true },
  closeReason: { type: 'string', name: 'close_reason', nullable: true },
});

export const KnowledgeEntity = entity('Knowledge', 'knowledge', {
  id: { type: 'string', primary: true },
  topic: { type: 'string' },
  content: { type: 'string' },
  embeddingVector: { type: 'json', name: 'embedding_vector', nullable: true },
  source: { type: 'string' },
  confidence: { type: 'float' },
});

export const BehaviorProfileEntity = entity('BehaviorProfile', 'behavior_profiles', {
  id: { type: 'string', primary: true },
  name: { type: 'string' },
  replyLatencyCurve: { type: 'json', name: 'reply_latency_curve' },
  ignoreProbability: { type: 'float', name: 'ignore_probability' },
  multiMessageProbability: { type: 'float', name: 'multi_message_probability' },
  topicChangeTolerance: { type: 'float', name: 'topic_change_tolerance' },
  questionAskingRate: { type: 'float', name: 'question_asking_rate' },
  activityCurve: { type: 'json', name: 'activity_curve' },
  updatedAt: { type: 'string', name: 'updated_at' },
});

export const ReminderEntity = entity('Reminder', 'reminders', {
  id: { type: 'string', primary: true },
  userId: { type: 'string', name: 'user_id' },
  triggerAt: { type: 'string', name: 'trigger_at' },
  payload: { type: 'json' },
  status: { type: 'string', enum: ['pending', 'fired', 'cancelled'] },
  createdAt: { type: 'string', name: 'created_at' },
});

export const TaskQueueEntity = entity('TaskQueue', 'task_queue', {
  id: { type: 'string', primary: true },
  type: { type: 'string' },
  payload: { type: 'json' },
  runAt: { type: 'string', name: 'run_at' },
  status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed'] },
  retryCount: { type: 'int', name: 'retry_count' },
  maxRetries: { type: 'int', name: 'max_retries' },
  error: { type: 'string', nullable: true },
  updatedAt: { type: 'string', name: 'updated_at' },
});

export const InteractionHistoryEntity = entity('InteractionHistory', 'interaction_history', {
  userId: { type: 'string', name: 'user_id', primary: true },
  date: { type: 'string', primary: true },
  messageCount: { type: 'int', name: 'message_count' },
  avgResponseTime: { type: 'float', name: 'avg_response_time' },
  sentimentTrend: { type: 'float', name: 'sentiment_trend' },
});

export const WorldStateEntity = entity('WorldState', 'world_state', {
  id: { type: 'string', primary: true },
  agentId: { type: 'string', name: 'agent_id' },
  activity: { type: 'string' },
  locationContext: { type: 'string', name: 'location_context' },
  availability: { type: 'float' },
  energyLevel: { type: 'float', name: 'energy_level' },
  stressLevel: { type: 'float', name: 'stress_level' },
  focusLevel: { type: 'float', name: 'focus_level' },
  deviceBattery: { type: 'int', name: 'device_battery' },
  sleepState: { type: 'string', name: 'sleep_state' },
  currentActivityDetail: { type: 'string', name: 'current_activity_detail' },
  updatedAt: { type: 'string', name: 'updated_at' },
});

export const ThoughtEntity = entity('Thought', 'thoughts', {
  id: { type: 'string', primary: true },
  userId: { type: 'string', name: 'user_id' },
  category: { type: 'string', enum: ['thought', 'interpretation', 'prediction'] },
  content: { type: 'string' },
  confidence: { type: 'float' },
  relatedMemoryIds: { type: 'json', name: 'related_memory_ids' },
  relatedMessageId: { type: 'string', name: 'related_message_id', nullable: true },
  createdAt: { type: 'string', name: 'created_at' },
  verifiedAt: { type: 'string', name: 'verified_at', nullable: true },
  verificationResult: { type: 'string', name: 'verification_result', enum: ['confirmed', 'contradicted', 'expired'], nullable: true },
  source: { type: 'string', enum: ['user_stated', 'inferred', 'agent_generated', 'false_memory_simulated'] },
  verificationStatus: { type: 'string', name: 'verification_status', enum: ['unverified', 'confirmed', 'contradicted'] },
  lastConfidenceDecayAt: { type: 'string', name: 'last_confidence_decay_at' },
});

export const SocialGraphNodeEntity = entity('SocialGraphNode', 'social_graph_nodes', {
  userId: { type: 'string', name: 'user_id', primary: true },
  displayName: { type: 'string', name: 'display_name' },
  createdAt: { type: 'string', name: 'created_at' },
});

export const SocialGraphEdgeEntity = entity('SocialGraphEdge', 'social_graph_edges', {
  fromUserId: { type: 'string', name: 'from_user_id', primary: true },
  toUserId: { type: 'string', name: 'to_user_id', primary: true },
  edgeType: { type: 'string', name: 'edge_type', enum: ['friend', 'family', 'coworker', 'unknown'] },
  strength: { type: 'float' },
  sharedJokes: { type: 'json', name: 'shared_jokes' },
  sharedInterests: { type: 'json', name: 'shared_interests' },
  sharedEvents: { type: 'json', name: 'shared_events' },
  interactionFrequency: { type: 'float', name: 'interaction_frequency' },
  lastConfirmedAt: { type: 'string', name: 'last_confirmed_at' },
  effectiveVerbosity: { type: 'float', name: 'effective_verbosity', nullable: true },
  effectiveEnergy: { type: 'float', name: 'effective_energy', nullable: true },
});

export const SocialClusterEntity = entity('SocialCluster', 'social_clusters', {
  id: { type: 'string', primary: true },
  memberUserIds: { type: 'json', name: 'member_user_ids' },
  clusterLabel: { type: 'string', name: 'cluster_label' },
  cohesionScore: { type: 'float', name: 'cohesion_score' },
});

export const StickerEntity = entity('Sticker', 'stickers', {
  id: { type: 'string', primary: true },
  packId: { type: 'string', name: 'pack_id' },
  fileUrl: { type: 'string', name: 'file_url' },
  emotionTags: { type: 'json', name: 'emotion_tags' },
  intentTags: { type: 'json', name: 'intent_tags' },
  humorLevel: { type: 'float', name: 'humor_level' },
  contextTags: { type: 'json', name: 'context_tags' },
  usageFrequency: { type: 'int', name: 'usage_frequency' },
  replyProbabilityWeight: { type: 'float', name: 'reply_probability_weight' },
  preferredContactIds: { type: 'json', name: 'preferred_contact_ids' },
  lastUsedAt: { type: 'string', name: 'last_used_at', nullable: true },
});

export const PsychologyStateEntity = entity('PsychologyState', 'psychology_state', {
  userId: { type: 'string', name: 'user_id', primary: true },
  curiosity: { type: 'float' },
  trust: { type: 'float' },
  patience: { type: 'float' },
  interest: { type: 'float' },
  socialEnergy: { type: 'float', name: 'social_energy' },
  empathy: { type: 'float' },
  confidence: { type: 'float' },
  stress: { type: 'float' },
  comfort: { type: 'float' },
  conversationFatigue: { type: 'float', name: 'conversation_fatigue' },
  updatedAt: { type: 'string', name: 'updated_at' },
});

export const EvaluationReportEntity = entity('EvaluationReport', 'evaluation_reports', {
  id: { type: 'string', primary: true },
  conversationId: { type: 'string', name: 'conversation_id' },
  metrics: { type: 'json' },
  humanLikenessScore: { type: 'float', name: 'human_likeness_score' },
  createdAt: { type: 'string', name: 'created_at' },
});

export const IdentityProfileEntity = entity('IdentityProfile', 'identity_profiles', {
  id: { type: 'string', primary: true },
  agentId: { type: 'string', name: 'agent_id' },
  name: { type: 'string' },
  age: { type: 'int' },
  backgroundSummary: { type: 'string', name: 'background_summary' },
  education: { type: 'json' },
  occupation: { type: 'string' },
  hometown: { type: 'string' },
  interests: { type: 'json' },
  values: { type: 'json' },
  beliefs: { type: 'json' },
  skills: { type: 'json' },
  familySummary: { type: 'string', name: 'family_summary' },
  version: { type: 'int' },
  createdAt: { type: 'string', name: 'created_at' },
  lastEvolvedAt: { type: 'string', name: 'last_evolved_at' },
});

export const TimelineEventEntity = entity('TimelineEvent', 'timeline_events', {
  id: { type: 'string', primary: true },
  agentId: { type: 'string', name: 'agent_id' },
  eventType: { type: 'string', name: 'event_type', enum: ['milestone', 'achievement', 'trip', 'change', 'purchase'] },
  title: { type: 'string' },
  description: { type: 'string' },
  occurredAt: { type: 'string', name: 'occurred_at' },
  occurredRangeEnd: { type: 'string', name: 'occurred_range_end', nullable: true },
  relatedIdentityFields: { type: 'json', name: 'related_identity_fields' },
  relatedMemoryIds: { type: 'json', name: 'related_memory_ids' },
  importanceScore: { type: 'float', name: 'importance_score' },
});

export const InventoryItemEntity = entity('InventoryItem', 'inventory_items', {
  id: { type: 'string', primary: true },
  agentId: { type: 'string', name: 'agent_id' },
  category: { type: 'string', enum: ['device', 'instrument', 'vehicle', 'book', 'clothing', 'other'] },
  name: { type: 'string' },
  description: { type: 'string' },
  acquiredAt: { type: 'string', name: 'acquired_at', nullable: true },
  sentiment: { type: 'string', enum: ['neutral', 'favorite', 'frustrating'] },
  linkedGoalId: { type: 'string', name: 'linked_goal_id', nullable: true },
  stillOwned: { type: 'boolean', name: 'still_owned' },
});

export const GoalEntity = entity('Goal', 'goals', {
  id: { type: 'string', primary: true },
  agentId: { type: 'string', name: 'agent_id' },
  category: { type: 'string', enum: ['dream', 'project', 'purchase', 'skill', 'plan'] },
  title: { type: 'string' },
  description: { type: 'string' },
  status: { type: 'string', enum: ['active', 'paused', 'achieved', 'abandoned'] },
  progress: { type: 'float' },
  targetDate: { type: 'string', name: 'target_date', nullable: true },
  createdAt: { type: 'string', name: 'created_at' },
  resolvedAt: { type: 'string', name: 'resolved_at', nullable: true },
  resolutionLink: { type: 'json', name: 'resolution_link', nullable: true },
});

export const CalendarEntryEntity = entity('CalendarEntry', 'calendar_entries', {
  id: { type: 'string', primary: true },
  agentId: { type: 'string', name: 'agent_id' },
  type: { type: 'string', enum: ['recurring', 'one_off'] },
  title: { type: 'string' },
  category: { type: 'string', enum: ['work', 'school', 'social', 'appointment', 'trip', 'free_time'] },
  recurrenceRule: { type: 'string', name: 'recurrence_rule', nullable: true },
  startAt: { type: 'string', name: 'start_at' },
  endAt: { type: 'string', name: 'end_at' },
  worldStateOverride: { type: 'json', name: 'world_state_override' },
});

export const MemoryContradictionEntity = entity('MemoryContradiction', 'memory_contradictions', {
  id: { type: 'string', primary: true },
  memoryIdA: { type: 'string', name: 'memory_id_a' },
  memoryIdB: { type: 'string', name: 'memory_id_b', nullable: true },
  messageId: { type: 'string', name: 'message_id', nullable: true },
  detectedAt: { type: 'string', name: 'detected_at' },
  resolution: { type: 'string', enum: ['unresolved', 'reinterpreted', 'corrected', 'ignored'] },
});

export const RecoveryPlanEntity = entity('RecoveryPlan', 'recovery_plans', {
  id: { type: 'string', primary: true },
  conversationId: { type: 'string', name: 'conversation_id' },
  gapDurationMs: { type: 'int', name: 'gap_duration_ms' },
  freshnessScore: { type: 'float', name: 'freshness_score' },
  strategy: {
    type: 'string',
    enum: ['respond_normally', 'respond_with_summary_awareness', 'respond_with_soft_acknowledgment', 'skip_silently', 'reopen_selectively'],
  },
  reconstructedContextType: { type: 'string', name: 'reconstructed_context_type', enum: ['raw', 'summary', 'summary_plus_questions'] },
  scheduledResponseAt: { type: 'string', name: 'scheduled_response_at', nullable: true },
  status: { type: 'string', enum: ['pending', 'executed', 'skipped'] },
});

export const IdentityEvolutionProposalEntity = entity('IdentityEvolutionProposal', 'identity_evolution_proposals', {
  id: { type: 'string', primary: true },
  agentId: { type: 'string', name: 'agent_id' },
  fieldChanged: { type: 'string', name: 'field_changed' },
  oldValue: { type: 'string', name: 'old_value' },
  newValue: { type: 'string', name: 'new_value' },
  supportingEvidence: { type: 'json', name: 'supporting_evidence' },
  confidence: { type: 'float' },
  status: { type: 'string', enum: ['proposed', 'auto_committed', 'manually_approved', 'rejected'] },
  createdAt: { type: 'string', name: 'created_at' },
  resolvedAt: { type: 'string', name: 'resolved_at', nullable: true },
});

export const SettingsEntity = entity('Settings', 'settings', {
  key: { type: 'string', primary: true },
  value: { type: 'json' },
  updatedAt: { type: 'string', name: 'updated_at' },
});

export const Entities = [
  UserEntity,
  ConversationEntity,
  MessageEntity,
  MediaEntity,
  MemoryEntity,
  RelationshipEntity,
  PersonalityEntity,
  SessionEntity,
  KnowledgeEntity,
  BehaviorProfileEntity,
  ReminderEntity,
  TaskQueueEntity,
  InteractionHistoryEntity,
  WorldStateEntity,
  ThoughtEntity,
  SocialGraphNodeEntity,
  SocialGraphEdgeEntity,
  SocialClusterEntity,
  StickerEntity,
  PsychologyStateEntity,
  EvaluationReportEntity,
  IdentityProfileEntity,
  TimelineEventEntity,
  InventoryItemEntity,
  GoalEntity,
  CalendarEntryEntity,
  MemoryContradictionEntity,
  RecoveryPlanEntity,
  IdentityEvolutionProposalEntity,
  SettingsEntity,
] as const;

