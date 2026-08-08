// Data access layer — repositories + migrations for every persisted entity
// (v1 §4/§14, v2 & v3 additions). No other package writes raw SQL.

export { createDb, createRedis, MemoryDb, PostgresDb } from './db.js';
export type { Db, QueryResultLike, Tx } from './db.types.js';
export { runMigrations } from './migrate.js';
export type { MigrationRecord } from './migrate.js';
export { DataService } from './data.service.js';
export type { DataServiceOptions } from './data.service.js';

export { UserRepository, RelationshipRepository, InteractionHistoryRepository } from './repositories/users.repo.js';
export {
  ConversationRepository,
  MediaRepository,
  MessageRepository,
  SessionRepository,
} from './repositories/conversations.repo.js';
export { DEFAULT_RANK_WEIGHTS, KnowledgeRepository, MemoryRepository, rankMemory } from './repositories/memory.repo.js';
export type { MemoryRankInput, MemoryRankWeights } from './repositories/memory.repo.js';
export {
  BehaviorProfileRepository,
  PersonalityRepository,
  ReminderRepository,
  StickerRepository,
  TaskQueueRepository,
} from './repositories/behavior.repo.js';
export {
  EvaluationReportRepository,
  PsychologyStateRepository,
  ThoughtRepository,
  WorldStateRepository,
} from './repositories/simulation.repo.js';
export {
  SocialClusterRepository,
  SocialGraphEdgeRepository,
  SocialGraphNodeRepository,
} from './repositories/social.repo.js';
export {
  CalendarEntryRepository,
  GoalRepository,
  IdentityProfileRepository,
  InventoryItemRepository,
  TimelineEventRepository,
} from './repositories/identity.repo.js';
export {
  IdentityEvolutionProposalRepository,
  MemoryContradictionRepository,
  RecoveryPlanRepository,
} from './repositories/v3.repo.js';

export type {
  BehaviorProfile,
  CalendarEntry,
  Conversation,
  EvaluationReport,
  Goal,
  IdentityEvolutionProposal,
  IdentityProfile,
  InteractionHistory,
  InventoryItem,
  Knowledge,
  Media,
  Memory,
  MemoryContradiction,
  Message,
  Personality,
  PsychologyState,
  RecoveryPlan,
  Relationship,
  Reminder,
  Session,
  SocialCluster,
  SocialGraphEdge,
  SocialGraphNode,
  Sticker,
  TaskQueue,
  Thought,
  TimelineEvent,
  User,
  WorldState,
} from './types.js';
