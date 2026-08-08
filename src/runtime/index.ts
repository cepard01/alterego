// Agent Runtime (composition root) — wires every package together, starts
// the gateway connection, runs the offline-recovery boot sequence, and
// starts the scheduler's tick loop. Thin wiring only — no domain logic here.

import { AppConfig, ConfigService } from '@whatsapp-ai-agent/config';
import { EventBus, InMemoryEventBus, MessageReceivedPayload } from '@whatsapp-ai-agent/events';
import { DataService } from '@whatsapp-ai-agent/data';
import { SchedulerService } from '@whatsapp-ai-agent/scheduler';
import { JsonLogger, Logger } from '@whatsapp-ai-agent/observability';
import { MessageGateway, TransportAdapter } from '@whatsapp-ai-agent/gateway';
import { LLMRouter, LLMRequest, LLMResponse } from '@whatsapp-ai-agent/llm';
import { IdentityService } from '@whatsapp-ai-agent/identity';
import type { PersonalitySnapshot } from '@whatsapp-ai-agent/personality';
import { WorldStateService, PsychologyService, CognitiveLoadService } from '@whatsapp-ai-agent/psychology';
import { ThoughtGenerator } from '@whatsapp-ai-agent/thoughts';
import { SocialGraphService } from '@whatsapp-ai-agent/social-graph';
import { HumanSimulationEngine, SimulatedAction, StickerSelector, TimingModel } from '@whatsapp-ai-agent/human-simulation';
import { ResponsePlanner, ResponseExecutor, Sender } from '@whatsapp-ai-agent/messaging-behavior';
import { ConversationManager, ConversationStateManager, ContextBuilder, PromptBuilder, ConversationPipeline } from '@whatsapp-ai-agent/conversation';
import { RecoveryEngine } from '@whatsapp-ai-agent/offline-recovery';
import { EvaluatorService } from '@whatsapp-ai-agent/evaluation';
import { IdentityEvolutionService, LongitudinalScheduler } from '@whatsapp-ai-agent/longitudinal';

type SimulatedActionLike = Pick<SimulatedAction, 'type' | 'timing' | 'confidence' | 'params' | 'reasoning'>;

const WORLD_STATE_TICK_INTERVAL_MS = 5 * 60 * 1000;
const IDLE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const IDLE_TIMEOUT_MS = 45 * 60 * 1000;
const LONGITUDINAL_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export interface LlmCompleterLike {
  complete(request: LLMRequest): Promise<LLMResponse>;
}

export interface AgentRuntimeOptions {
  bus?: EventBus;
  config?: Readonly<AppConfig> | ConfigService;
  logger?: Logger;
  /** In-memory data for tests/demos; defaults to real Postgres. */
  memoryMode?: boolean;
  transports?: Record<string, TransportAdapter>;
  llm?: LlmCompleterLike;
  agentId?: string;
  tickIntervalMs?: number;
  /** Env vars for the ConfigService (defaults to process.env). */
  env?: Record<string, string | undefined>;
  /** Random source for the human-simulation engine and world state (tests/demos). */
  rng?: () => number;
  /** Sleep implementation for realistic typing/pacing delays (tests/demos). */
  sleep?: (ms: number) => Promise<void>;
}

export class AgentRuntime {
  readonly bus: EventBus;
  readonly config: ConfigService;
  readonly data: DataService;
  readonly scheduler: SchedulerService;
  readonly gateway: MessageGateway;
  readonly logger?: Logger;

  readonly worldState: WorldStateService;
  readonly psychology: PsychologyService;
  readonly cognitiveLoad: CognitiveLoadService;
  readonly identity: IdentityService;
  readonly thoughts: ThoughtGenerator;
  readonly socialGraph: SocialGraphService;
  readonly engine: HumanSimulationEngine;
  readonly conversation: ConversationManager;
  readonly conversationState: ConversationStateManager;
  readonly pipeline: ConversationPipeline;
  readonly recovery: RecoveryEngine;
  readonly evaluator: EvaluatorService;
  readonly evolution: IdentityEvolutionService;
  readonly longitudinal: LongitudinalScheduler;

  private readonly llm: LlmCompleterLike;
  private readonly executor: ResponseExecutor;
  private readonly planner = new ResponsePlanner();
  private readonly agentId: string;
  private lastActivityAt = new Map<string, number>();
  private started = false;

  constructor(options: AgentRuntimeOptions = {}) {
    this.bus = options.bus ?? new InMemoryEventBus();
    this.config = options.config instanceof ConfigService ? options.config : new ConfigService(this.bus, { env: (options.env ?? process.env) as NodeJS.ProcessEnv, quiet: true });
    this.logger = options.logger ?? new JsonLogger({ level: 'info', sink: (line) => console.log(line) });
    this.agentId = options.agentId ?? 'agent-1';

    this.data = new DataService(this.config, this.logger, { memoryMode: options.memoryMode ?? false });
    this.scheduler = new SchedulerService({ bus: this.bus, config: this.config, queue: this.data.taskQueue, logger: this.logger });
    this.gateway = new MessageGateway({ bus: this.bus, config: this.config, logger: this.logger, transports: options.transports });
    this.llm = options.llm ?? new LLMRouter({ bus: this.bus, config: this.config, logger: this.logger });

    this.identity = new IdentityService(this.data);
    this.worldState = new WorldStateService(this.bus, this.data.worldState, {
      calendarActiveAt: (at, agentId) => this.data.calendarEntries.findActiveAt(at, agentId),
    }, options.rng);
    this.psychology = new PsychologyService(this.bus, this.data.psychology);
    this.cognitiveLoad = new CognitiveLoadService();
    this.thoughts = new ThoughtGenerator(this.bus, this.data.thoughts, {
      complete: async (request) => {
        const response = await this.llm.complete({
          userId: request.userId,
          conversationId: request.conversationId,
          systemPrompt: request.system,
          messages: [{ role: 'user', content: request.prompt }],
          capabilityRequirements: (request.capabilities ?? ['text']) as never,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
        });
        return { content: response.text };
      },
    });
    this.socialGraph = new SocialGraphService(this.bus, {
      socialNodes: this.data.socialNodes,
      socialEdges: this.data.socialEdges,
      socialClusters: this.data.socialClusters,
    });

    const timing = new TimingModel();
    const stickers = new StickerSelector(this.data.stickers);
    this.engine = new HumanSimulationEngine(this.bus, timing, stickers, options.rng);

    this.conversationState = new ConversationStateManager();
    this.conversation = new ConversationManager(this.bus, {
      conversations: this.data.conversations,
      sessions: this.data.sessions,
      messages: this.data.messages,
    }, this.conversationState);

    const sender: Sender = {
      send: (message) => this.gateway.send(message),
      setPresence: (conversationId, state) => this.gateway.setPresence(conversationId, state),
    };
    this.executor = new ResponseExecutor(this.bus, sender, this.data.reminders, this.scheduler, options.sleep);

    this.pipeline = new ConversationPipeline({
      state: this.conversationState,
      contextBuilder: new ContextBuilder(),
      promptBuilder: new PromptBuilder(),
      llm: this.llm,
    });

    this.recovery = new RecoveryEngine(this.bus, {
      recoveryPlans: this.data.recoveryPlans,
      messages: this.data.messages,
    }, this.scheduler);

    this.evaluator = new EvaluatorService(this.bus, this.data, undefined, this.llm);
    this.evolution = new IdentityEvolutionService(this.bus, this.data);
    this.longitudinal = new LongitudinalScheduler(this.scheduler);

    this.bus.subscribe('MessageReceived', ({ payload }) => {
      void this.onMessageReceived(payload).catch((error) => {
        this.logger?.error('failed to process message', { error: String(error) });
      });
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    await this.gateway.connect();

    this.worldState.start(this.scheduler);
    this.longitudinal.start({ runPass: () => this.runEvolutionPass(), intervalMs: LONGITUDINAL_INTERVAL_MS });
    this.registerIdleCheck();

    await this.runOfflineRecovery();
    this.scheduler.start();
  }

  async shutdown(): Promise<void> {
    this.scheduler.stop();
    await this.gateway.disconnect();
  }

  /** The v2 §10 pipeline, wired end to end for one inbound message. */
  private async onMessageReceived(payload: MessageReceivedPayload): Promise<void> {
    this.lastActivityAt.set(payload.userId, Date.now());

    const turn = await this.conversation.handleUserMessage(payload);

    const [world, psychology, recentThoughts, activeGoals] = await Promise.all([
      this.worldState.tick({ agentId: this.agentId, at: payload.timestamp }),
      this.psychology.noteTurn(payload.userId, { sentiment: 'neutral' }),
      this.data.thoughts.listRecent(payload.userId, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), 10),
      this.data.goals.listActive(this.agentId),
    ]);
    void activeGoals;

    const relationship = await this.data.socialEdges.find(this.agentId, payload.userId).then((edge) => edge?.strength ?? 0).catch(() => 0);

    const action = await this.engine.decide({
      userId: payload.userId,
      conversationId: payload.conversationId,
      messageId: payload.messageId,
      messageContent: payload.content,
      messageImportance: this.estimateImportance(payload),
      messageComplexity: Math.min(1, payload.content.length / 500),
      hasMedia: payload.hasMedia,
      worldState: world,
      cognitiveLoad: this.cognitiveLoad.score().score,
      relationshipStrength: relationship,
      recentThoughts,
      recentTopics: this.conversationState.recentTopics(turn.conversation.id),
      conversationLength: turn.conversation.turnCount,
      timeOfDay: new Date(payload.timestamp).getHours(),
    });

    if (!this.pipeline.needsText(action)) {
      if (action.type === 'sticker') {
        await this.sendSticker(payload, action);
      }
      return;
    }

    const contextInput = {
      identity: await this.identity.snapshot(this.agentId),
      personality: await this.currentPersonalitySnapshot(),
      relationship: relationship > 0 ? { name: 'este contato', strength: relationship, familiarity: relationship, verbosity: 0.5, energy: 0.5 } : undefined,
      behavior: {
        activity: world.activity,
        availability: world.availability,
        energyLevel: world.energyLevel,
        stressLevel: world.stressLevel,
        focusLevel: world.focusLevel,
        fatigue: psychology.conversationFatigue,
        cognitiveLoad: this.cognitiveLoad.score().score,
      },
      recentMessages: (await this.data.messages.listByConversation(turn.conversation.id, 8)).map((m) => ({
        sender: m.sender,
        content: m.content,
        timestamp: m.timestamp,
      })),
      memories: [],
      privateThoughts: recentThoughts.slice(0, 3).map((t) => ({ content: t.content, category: t.category, confidence: t.confidence })),
      time: {
        now: payload.timestamp,
        dayOfWeek: new Date(payload.timestamp).toLocaleDateString('pt-BR', { weekday: 'long' }),
        timeOfDay: new Date(payload.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      },
      worldState: world,
      currentMessage: payload.content,
    };

    const result = await this.pipeline.run({
      personalityName: (await this.identity.snapshot(this.agentId))?.name ?? 'eu',
      action,
      ...contextInput,
    });

    if (result.text) {
      const plan = this.planner.plan({
        action,
        userId: payload.userId,
        conversationId: payload.conversationId,
        text: result.text,
      });
      await this.executor.execute(plan, { userId: payload.userId, conversationId: payload.conversationId });
    }

    this.thoughts.generateAfterTurn({
      userId: payload.userId,
      conversationId: payload.conversationId,
      transcript: [
        { role: 'user' as const, content: payload.content, messageId: payload.messageId },
        ...(result.text ? [{ role: 'agent' as const, content: result.text }] : []),
      ],
      recentTopics: this.conversationState.recentTopics(turn.conversation.id),
    }).catch(() => undefined);
  }

  private async sendSticker(payload: MessageReceivedPayload, action: SimulatedActionLike): Promise<void> {
    const stickerId = String(action.params.stickerId ?? '');
    const sticker = (await this.data.stickers.list()).find((s) => s.id === stickerId);
    const plan = this.planner.plan({
      action: {
        type: 'sticker',
        timing: action.timing,
        confidence: action.confidence,
        reasoning: action.reasoning ?? [],
        params: { stickerId, fileUrl: sticker?.fileUrl ?? '' },
      },
      userId: payload.userId,
      conversationId: payload.conversationId,
      text: undefined,
    });
    await this.executor.execute(plan, { userId: payload.userId, conversationId: payload.conversationId });
  }

  private async runOfflineRecovery(): Promise<void> {
    const active = await this.data.conversations.listActive(100);
    if (active.length === 0) return;

    const bootTime = new Date().toISOString();
    const lastActiveAt = active.reduce((latest, c) => (c.lastMessageAt > latest ? c.lastMessageAt : latest), active[0].lastMessageAt);
    await this.recovery.runOnBoot({
      bootTime,
      lastActiveAt,
      conversations: active.map((c) => ({ id: c.id, userId: c.userId, lastMessageAt: c.lastMessageAt })),
      relationshipStrength: () => 0.4,
      onRecoveryDue: async () => undefined,
      now: Date.now,
    });
  }

  private async runEvolutionPass(): Promise<void> {
    const profile = await this.data.identityProfiles.findByAgent(this.agentId);
    if (!profile) return;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const thoughts = await this.data.thoughts.listRecent(this.agentId, since, 50);
    await this.evolution.runPass({
      agentId: this.agentId,
      interests: profile.interests.map((keyword) => ({ keyword, salience: 0.5 })),
      thoughts,
    });
  }

  private async currentPersonalitySnapshot(): Promise<PersonalitySnapshot | undefined> {
    const p = await this.data.personalities.findLatest().catch(() => undefined);
    if (!p) return undefined;
    return {
      name: p.name,
      version: p.version,
      tone: p.tone,
      humorStyle: p.humorStyle,
      verbosity: p.verbosity,
      emojiFrequency: p.emojiFrequency,
      energyBaseline: 0.5,
      responseLengthBias: 'balanced',
      decisionTone: 'direct',
      quirks: p.quirks,
    };
  }

  private registerIdleCheck(): void {
    this.scheduler.register('runtime.idle-check', async () => {
      const now = Date.now();
      for (const [userId, last] of this.lastActivityAt) {
        if (now - last > IDLE_TIMEOUT_MS) {
          const conversation = await this.data.conversations.findActiveByUser(userId);
          if (conversation) {
            this.bus.publish('ConversationEnded', { conversationId: conversation.id, userId, reason: 'inactivity' });
          }
        }
      }
    });
    this.scheduler.scheduleRecurring('runtime.idle-check', IDLE_CHECK_INTERVAL_MS);
  }

  private estimateImportance(payload: MessageReceivedPayload): number {
    let importance = 0.5;
    if (/[?？]/.test(payload.content)) importance += 0.15;
    if (payload.hasMedia) importance += 0.1;
    if (payload.content.toLowerCase().includes('urgente') || payload.content.toLowerCase().includes('emergência')) importance += 0.3;
    return Math.min(1, importance);
  }
}
