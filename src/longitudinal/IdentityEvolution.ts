// IdentityEvolutionService — periodic, governed evolution passes (v3 §9).
// Every proposed change is logged with its justification; small changes with
// strong multi-session evidence auto-commit, larger ones stay 'proposed'
// for manual review in the admin dashboard. Nothing evolves silently.

import type {
  Goal,
  IdentityEvolutionProposal,
  IdentityProfile,
  InventoryItem,
  Thought,
  TimelineEvent,
} from '@alterego/data';
import type { EventBus } from '@alterego/events';
import { DriftProposal, InterestDriftDetector, InterestBaseline } from './InterestDrift.js';

export interface EvolutionDataPort {
  identityProfiles: {
    findByAgent(agentId: string): Promise<IdentityProfile | undefined>;
    upsert(profile: Omit<IdentityProfile, 'id' | 'createdAt' | 'lastEvolvedAt' | 'version'> & {
      id?: string;
      version?: number;
      lastEvolvedAt?: string;
    }): Promise<IdentityProfile>;
  };
  goals: {
    listActive(agentId: string): Promise<Goal[]>;
    resolve(id: string, status: 'achieved' | 'abandoned', resolutionLink: Goal['resolutionLink']): Promise<void>;
  };
  timelineEvents: {
    create(event: Omit<TimelineEvent, 'id'> & { id?: string }): Promise<TimelineEvent>;
  };
  inventoryItems: {
    create(item: Omit<InventoryItem, 'id'> & { id?: string }): Promise<InventoryItem>;
  };
  identityEvolutionProposals: {
    create(proposal: Omit<IdentityEvolutionProposal, 'id' | 'createdAt' | 'resolvedAt' | 'status'> & {
      id?: string;
      status?: IdentityEvolutionProposal['status'];
    }): Promise<IdentityEvolutionProposal>;
    listByStatus(status: IdentityEvolutionProposal['status'], limit?: number): Promise<IdentityEvolutionProposal[]>;
    setStatus(id: string, status: IdentityEvolutionProposal['status']): Promise<void>;
  };
}

export interface EvolutionPassInput {
  agentId: string;
  /** Interest salience baselines from the stored identity. */
  interests: InterestBaseline[];
  /** Recent thoughts — the evidence source for drift and topic patterns. */
  thoughts: Thought[];
  /** Sessions at/above which a drift proposal auto-commits. */
  autoCommitSessions?: number;
  /** Minimum interval before the personality aging nudge is re-proposed. */
  agingMinIntervalMs?: number;
  now?: () => number;
}

export interface EvolutionPassResult {
  proposals: IdentityEvolutionProposal[];
  committed: string[];
  surfaced: string[];
}

export const LONGITUDINAL_EVOLUTION_JOB = 'longitudinal.evolution';

export class IdentityEvolutionService {
  private readonly created = new Map<string, IdentityEvolutionProposal>();

  constructor(
    private readonly bus: EventBus,
    private readonly data: EvolutionDataPort,
    private readonly driftDetector: InterestDriftDetector = new InterestDriftDetector(),
  ) {}

  async runPass(input: EvolutionPassInput): Promise<EvolutionPassResult> {
    const now = input.now?.() ?? Date.now();
    const autoCommitSessions = input.autoCommitSessions ?? 5;
    const proposals: IdentityEvolutionProposal[] = [];
    const committed: string[] = [];
    const surfaced: string[] = [];

    for (const drift of this.driftDetector.detect(input)) {
      const proposal = await this.record(`interest:${drift.keyword}`, drift.oldSalience.toFixed(2), drift.newSalience.toFixed(2), [], drift.confidence, input.agentId);
      proposals.push(proposal);
      if (drift.evidenceSessions >= autoCommitSessions) {
        await this.commit(proposal);
        committed.push(proposal.id);
      } else {
        surfaced.push(proposal.id);
      }
    }

    for (const goal of (await this.data.goals.listActive(input.agentId)).filter((g) => g.progress >= 1)) {
      const proposal = await this.record(
        `goal:${goal.id}`,
        `${goal.status} (${Math.round(goal.progress * 100)}%)`,
        'achieved',
        [`goal:${goal.id}`],
        0.95,
        input.agentId,
      );
      proposals.push(proposal);
      await this.commit(proposal);
      committed.push(proposal.id);
    }

    const profile = await this.data.identityProfiles.findByAgent(input.agentId);
    if (profile) {
      const agingMinIntervalMs = input.agingMinIntervalMs ?? 180 * 24 * 60 * 60 * 1000;
      if (now - Date.parse(profile.lastEvolvedAt) >= agingMinIntervalMs) {
        const proposal = await this.record(
          'personality_version',
          String(profile.version),
          String(profile.version + 1),
          [],
          0.6,
          input.agentId,
        );
        proposals.push(proposal);
        surfaced.push(proposal.id);
      }
    }

    return { proposals, committed, surfaced };
  }

  private async record(
    fieldChanged: string,
    oldValue: string,
    newValue: string,
    supportingEvidence: string[],
    confidence: number,
    agentId: string,
  ): Promise<IdentityEvolutionProposal> {
    const proposal = await this.data.identityEvolutionProposals.create({
      agentId,
      fieldChanged,
      oldValue,
      newValue,
      supportingEvidence,
      confidence,
    });
    this.created.set(proposal.id, proposal);
    this.bus.publish('IdentityEvolutionProposed', {
      proposalId: proposal.id,
      fieldChanged: proposal.fieldChanged,
      status: proposal.status,
    });
    return proposal;
  }

  /** Apply an approved proposal to the identity cluster. Auto-commit only
   *  applies small, evidence-backed changes; personality_version is never
   *  committed silently. */
  async commit(proposal: IdentityEvolutionProposal | string): Promise<void> {
    const id = typeof proposal === 'string' ? proposal : proposal.id;
    const found = typeof proposal === 'string' ? this.created.get(id) : proposal;
    if (!found) return;

    const profile = await this.data.identityProfiles.findByAgent(found.agentId);
    if (profile && found.fieldChanged.startsWith('interest:')) {
      const keyword = found.fieldChanged.slice('interest:'.length);
      const newSalience = Number(found.newValue);
      let interests = [...profile.interests];
      if (newSalience >= 0.6 && !interests.includes(keyword)) interests.push(keyword);
      if (newSalience < 0.2) interests = interests.filter((i) => i !== keyword);
      await this.data.identityProfiles.upsert({
        ...profile,
        interests,
        version: profile.version + 1,
        lastEvolvedAt: new Date().toISOString(),
      });
    }

    if (profile && found.fieldChanged.startsWith('goal:')) {
      const goalId = found.fieldChanged.slice('goal:'.length);
      const [goal] = (await this.data.goals.listActive(found.agentId)).filter((g) => g.id === goalId);
      if (goal) {
        const timeline = await this.data.timelineEvents.create({
          agentId: found.agentId,
          eventType: 'achievement',
          title: `Concluído: ${goal.title}`,
          description: goal.description,
          occurredAt: new Date().toISOString(),
          relatedIdentityFields: ['goals'],
          relatedMemoryIds: [],
          importanceScore: Math.min(1, goal.progress),
        });
        const inventoryItem =
          goal.category === 'purchase'
            ? await this.data.inventoryItems.create({
                agentId: found.agentId,
                category: 'other',
                name: goal.title,
                description: `Adquirido ao concluir o objetivo: ${goal.title}`,
                acquiredAt: new Date().toISOString(),
                sentiment: 'favorite',
                linkedGoalId: goal.id,
                stillOwned: true,
              })
            : undefined;
        await this.data.goals.resolve(goal.id, 'achieved', {
          timelineEventId: timeline.id,
          inventoryItemId: inventoryItem?.id,
        });
      }
    }

    await this.data.identityEvolutionProposals.setStatus(id, 'auto_committed');
    this.bus.publish('IdentityEvolutionProposed', {
      proposalId: id,
      fieldChanged: found.fieldChanged,
      status: 'auto_committed',
    });
  }
}

