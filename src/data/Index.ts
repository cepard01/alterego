// Data access layer — repositories + migrations for every persisted entity
// (v1 §4/§14, v2 & v3 additions). No other package writes raw SQL.

export { createDb, createMikroDb, MemoryDb, PostgresDb, MikroOrmDbContext } from './Db.js';
export type { Db, QueryResultLike, Tx } from './DbTypes.js';
export { runMigrations } from './Migrate.js';
export type { MigrationRecord } from './Migrate.js';
export { DataService } from './DataService.js';
export type { DataServiceOptions } from './DataService.js';

export { UserRepository, RelationshipRepository, InteractionHistoryRepository } from './repositories/UsersRepo.js';
export {
  ConversationRepository,
  MediaRepository,
  MessageRepository,
  SessionRepository,
} from './repositories/ConversationsRepo.js';
export { DEFAULT_RANK_WEIGHTS, KnowledgeRepository, MemoryRepository, rankMemory } from './repositories/MemoryRepo.js';
export type { MemoryRankInput, MemoryRankWeights } from './repositories/MemoryRepo.js';
export {
  BehaviorProfileRepository,
  PersonalityRepository,
  ReminderRepository,
  StickerRepository,
  TaskQueueRepository,
} from './repositories/BehaviorRepo.js';
export {
  EvaluationReportRepository,
  PsychologyStateRepository,
  ThoughtRepository,
  WorldStateRepository,
} from './repositories/SimulationRepo.js';
export {
  SocialClusterRepository,
  SocialGraphEdgeRepository,
  SocialGraphNodeRepository,
} from './repositories/SocialRepo.js';
export {
  CalendarEntryRepository,
  GoalRepository,
  IdentityProfileRepository,
  InventoryItemRepository,
  TimelineEventRepository,
} from './repositories/IdentityRepo.js';
export {
  IdentityEvolutionProposalRepository,
  MemoryContradictionRepository,
  RecoveryPlanRepository,
} from './repositories/V3Repo.js';

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
} from './Types.js';

