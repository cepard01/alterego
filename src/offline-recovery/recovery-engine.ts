// RecoveryEngine — runs once at startup (v3 §8): detects the downtime gap,
// analyzes the backlog, scores freshness, reconstructs context, plans a
// recovery response per conversation and staggers execution via the
// scheduler instead of sending everything at once on boot.

import type { Message, RecoveryPlan } from '@whatsapp-ai-agent/data';
import type { SchedulerService } from '@whatsapp-ai-agent/scheduler';
import type { EventBus } from '@whatsapp-ai-agent/events';
import { BacklogAnalyzer } from './backlog-analyzer.js';
import { ContextReconstructor, ReconstructedContext } from './context-reconstructor.js';
import { FreshnessResult, FreshnessScorer } from './freshness-scorer.js';

export const RECOVERY_SEND_JOB = 'recovery.send';

export interface RecoveryDataPort {
  recoveryPlans: {
    create(plan: Omit<RecoveryPlan, 'id' | 'status'> & { id?: string }): Promise<RecoveryPlan>;
    findPending(limit?: number): Promise<RecoveryPlan[]>;
    setStatus(id: string, status: RecoveryPlan['status']): Promise<void>;
  };
  messages: {
    unreadByConversation(conversationId: string): Promise<Message[]>;
  };
}

export interface RecoveryInput {
  bootTime: string;
  lastActiveAt: string;
  conversations: Array<{ id: string; userId: string; lastMessageAt: string }>;
  /** userId -> 0-1 relationship strength. */
  relationshipStrength: (userId: string) => number;
  /** conversationId -> 0-1 topic staleness. */
  topicStaleness?: (conversationId: string) => number;
  summarize?: (messages: Message[]) => string;
  /** Called when a recovery response is due (staggered). */
  onRecoveryDue: (plan: RecoveryPlan) => Promise<void>;
  /** Stagger spread; defaults to a natural 1-12 minute window. */
  staggerRangeMs?: [number, number];
  now?: () => number;
}

export interface RecoveryRunResult {
  gapMs: number;
  plans: RecoveryPlan[];
  skippedCount: number;
}

/** Gaps shorter than this are normal operation, not recovery. */
const MIN_GAP_MS = 30 * 60 * 1000;

export class RecoveryEngine {
  private readonly reconstructedByPlanId = new Map<string, ReconstructedContext>();
  private recoveryDueHandler: ((plan: RecoveryPlan) => Promise<void>) | null = null;

  constructor(
    private readonly bus: EventBus,
    private readonly data: RecoveryDataPort,
    private readonly scheduler: Pick<SchedulerService, 'register' | 'schedule'>,
    private readonly scorer: FreshnessScorer = new FreshnessScorer(),
    private readonly analyzer: BacklogAnalyzer = new BacklogAnalyzer(),
    private readonly reconstructor: ContextReconstructor = new ContextReconstructor(),
  ) {
    this.scheduler.register(RECOVERY_SEND_JOB, async (payload) => {
      const planId = String(payload.planId ?? '');
      const plan = (await this.data.recoveryPlans.findPending()).find((p) => p.id === planId);
      if (!plan) return;
      await this.recoveryDueHandler?.(plan);
      await this.data.recoveryPlans.setStatus(plan.id, 'executed');
    });
  }

  async runOnBoot(input: RecoveryInput): Promise<RecoveryRunResult> {
    const now = input.now?.() ?? Date.now();
    this.recoveryDueHandler = input.onRecoveryDue;
    const bootTime = new Date(input.bootTime).getTime();
    const lastActiveAt = new Date(input.lastActiveAt).getTime();
    const gapMs = Math.max(0, bootTime - lastActiveAt);

    if (gapMs < MIN_GAP_MS) {
      return { gapMs, plans: [], skippedCount: 0 };
    }

    const backlogs = this.analyzer.analyze({
      lastActiveAt: input.lastActiveAt,
      conversations: input.conversations,
      unreadMessages: (await this.collectUnread(input.conversations)).flat(),
    });

    const plans: RecoveryPlan[] = [];
    let skippedCount = 0;
    const stagger = input.staggerRangeMs ?? [60_000, 720_000];

    for (const backlog of backlogs) {
      const freshness = this.scorer.score({
        gapMs,
        relationshipStrength: input.relationshipStrength(backlog.userId),
        topicStaleness: input.topicStaleness ? input.topicStaleness(backlog.conversationId) : 0,
        unreadCount: backlog.unread.length,
        hasUnansweredQuestion: backlog.unansweredQuestions.length > 0,
      });

      const context = this.reconstructor.reconstruct({
        strategy: freshness.strategy,
        gapMs,
        messages: backlog.unread,
        unansweredQuestions: backlog.unansweredQuestions,
        summarize: input.summarize,
      });

      let plan: RecoveryPlan | null = null;
      if (freshness.strategy === 'skip_silently') {
        skippedCount += 1;
      } else {
        const scheduledResponseAt = new Date(now + this.staggerDelay(backlogs.length, indexOf(backlogs, backlog), stagger)).toISOString();
        plan = await this.data.recoveryPlans.create({
          conversationId: backlog.conversationId,
          gapDurationMs: gapMs,
          freshnessScore: freshness.freshness,
          strategy: freshness.strategy,
          reconstructedContextType: context.type,
          scheduledResponseAt,
        });
        plans.push(plan);
        this.reconstructedByPlanId.set(plan.id, context);
        await this.scheduler.schedule({
          type: RECOVERY_SEND_JOB,
          payload: { planId: plan.id },
          runAt: scheduledResponseAt,
        });
        this.bus.publish('RecoveryPlanCreated', {
          planId: plan.id,
          conversationId: plan.conversationId,
          strategy: plan.strategy,
        });
      }
    }

    return { gapMs, plans, skippedCount };
  }

  /** Reconstructed context for a plan — consumed by the pipeline when it fires. */
  contextFor(planId: string): ReconstructedContext | undefined {
    return this.reconstructedByPlanId.get(planId);
  }

  private async collectUnread(conversations: RecoveryInput['conversations']): Promise<Message[][]> {
    const results = await Promise.all(conversations.map((c) => this.data.messages.unreadByConversation(c.id)));
    return results;
  }

  private staggerDelay(total: number, index: number, range: [number, number]): number {
    const [min, max] = range;
    const progress = total <= 1 ? 0 : index / (total - 1);
    return Math.round(min + progress * (max - min));
  }
}

function indexOf<T>(list: T[], item: T): number {
  return list.indexOf(item);
}
