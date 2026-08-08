// DataService — the single entry point to every repository. One instance per
// process, created from the config; all SQL stays inside this package.

import { ConfigService } from '@whatsapp-ai-agent/config';
import { Logger } from '@whatsapp-ai-agent/observability';
import { createDb, Db } from './db.js';
import { UserRepository, RelationshipRepository, InteractionHistoryRepository } from './repositories/users.repo.js';
import {
  ConversationRepository,
  MediaRepository,
  MessageRepository,
  SessionRepository,
} from './repositories/conversations.repo.js';
import { KnowledgeRepository, MemoryRepository } from './repositories/memory.repo.js';
import {
  BehaviorProfileRepository,
  PersonalityRepository,
  ReminderRepository,
  StickerRepository,
  TaskQueueRepository,
} from './repositories/behavior.repo.js';
import {
  EvaluationReportRepository,
  PsychologyStateRepository,
  ThoughtRepository,
  WorldStateRepository,
} from './repositories/simulation.repo.js';
import {
  SocialClusterRepository,
  SocialGraphEdgeRepository,
  SocialGraphNodeRepository,
} from './repositories/social.repo.js';
import {
  CalendarEntryRepository,
  GoalRepository,
  IdentityProfileRepository,
  InventoryItemRepository,
  TimelineEventRepository,
} from './repositories/identity.repo.js';
import {
  IdentityEvolutionProposalRepository,
  MemoryContradictionRepository,
  RecoveryPlanRepository,
} from './repositories/v3.repo.js';

export interface DataServiceOptions {
  /** Use the in-memory Db (tests, dry runs) instead of Postgres. */
  memoryMode?: boolean;
}

export class DataService {
  readonly db: Db;

  readonly users: UserRepository;
  readonly relationships: RelationshipRepository;
  readonly interactionHistory: InteractionHistoryRepository;
  readonly conversations: ConversationRepository;
  readonly messages: MessageRepository;
  readonly sessions: SessionRepository;
  readonly media: MediaRepository;
  readonly memory: MemoryRepository;
  readonly knowledge: KnowledgeRepository;
  readonly personalities: PersonalityRepository;
  readonly behaviorProfiles: BehaviorProfileRepository;
  readonly stickers: StickerRepository;
  readonly reminders: ReminderRepository;
  readonly taskQueue: TaskQueueRepository;
  readonly worldState: WorldStateRepository;
  readonly psychology: PsychologyStateRepository;
  readonly thoughts: ThoughtRepository;
  readonly evaluationReports: EvaluationReportRepository;
  readonly socialNodes: SocialGraphNodeRepository;
  readonly socialEdges: SocialGraphEdgeRepository;
  readonly socialClusters: SocialClusterRepository;
  readonly identityProfiles: IdentityProfileRepository;
  readonly timelineEvents: TimelineEventRepository;
  readonly inventoryItems: InventoryItemRepository;
  readonly goals: GoalRepository;
  readonly calendarEntries: CalendarEntryRepository;
  readonly memoryContradictions: MemoryContradictionRepository;
  readonly recoveryPlans: RecoveryPlanRepository;
  readonly identityEvolutionProposals: IdentityEvolutionProposalRepository;

  constructor(config: ConfigService, logger?: Logger, options: DataServiceOptions = {}) {
    this.db = createDb(config.get().database.url, logger, options.memoryMode);

    this.users = new UserRepository(this.db);
    this.relationships = new RelationshipRepository(this.db);
    this.interactionHistory = new InteractionHistoryRepository(this.db);
    this.conversations = new ConversationRepository(this.db);
    this.messages = new MessageRepository(this.db);
    this.sessions = new SessionRepository(this.db);
    this.media = new MediaRepository(this.db);
    this.memory = new MemoryRepository(this.db);
    this.knowledge = new KnowledgeRepository(this.db);
    this.personalities = new PersonalityRepository(this.db);
    this.behaviorProfiles = new BehaviorProfileRepository(this.db);
    this.stickers = new StickerRepository(this.db);
    this.reminders = new ReminderRepository(this.db);
    this.taskQueue = new TaskQueueRepository(this.db);
    this.worldState = new WorldStateRepository(this.db);
    this.psychology = new PsychologyStateRepository(this.db);
    this.thoughts = new ThoughtRepository(this.db);
    this.evaluationReports = new EvaluationReportRepository(this.db);
    this.socialNodes = new SocialGraphNodeRepository(this.db);
    this.socialEdges = new SocialGraphEdgeRepository(this.db);
    this.socialClusters = new SocialClusterRepository(this.db);
    this.identityProfiles = new IdentityProfileRepository(this.db);
    this.timelineEvents = new TimelineEventRepository(this.db);
    this.inventoryItems = new InventoryItemRepository(this.db);
    this.goals = new GoalRepository(this.db);
    this.calendarEntries = new CalendarEntryRepository(this.db);
    this.memoryContradictions = new MemoryContradictionRepository(this.db);
    this.recoveryPlans = new RecoveryPlanRepository(this.db);
    this.identityEvolutionProposals = new IdentityEvolutionProposalRepository(this.db);
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}
