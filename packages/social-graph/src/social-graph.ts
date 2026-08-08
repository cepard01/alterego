// SocialGraphService â€” relationship graph across users (v2 Â§4). Built
// incrementally from what users mention; edges are tentative until
// corroborated by repeated, consistent mentions. Also stores per-contact
// behavior variance (v2 Â§11).

import type { EventBus } from '@whatsapp-ai-agent/events';
import type { SocialCluster, SocialGraphEdge, SocialGraphNode } from '@whatsapp-ai-agent/data';

interface SocialRepo {
  socialNodes: {
    upsert(node: SocialGraphNode): Promise<SocialGraphNode>;
  };
  socialEdges: {
    upsert(edge: Omit<SocialGraphEdge, 'lastConfirmedAt' | 'strength'> & { strength?: number }): Promise<SocialGraphEdge>;
    find(fromUserId: string, toUserId: string): Promise<SocialGraphEdge | undefined>;
    edgesForUser(userId: string): Promise<SocialGraphEdge[]>;
    reinforce(fromUserId: string, toUserId: string, delta?: number): Promise<void>;
  };
  socialClusters: {
    create(cluster: Omit<SocialCluster, 'id'> & { id?: string }): Promise<SocialCluster>;
    list(): Promise<SocialCluster[]>;
  };
}

export interface MentionInput {
  fromUserId: string;
  fromDisplayName: string;
  mentionedUserId: string;
  mentionedDisplayName: string;
  edgeType?: SocialGraphEdge['edgeType'];
  sharedInterest?: string;
  sharedEvent?: string;
  sharedJoke?: string;
}

const TENTATIVE_STRENGTH = 0.1;
const REINFORCE_DELTA = 0.05;
const CORROBORATION_BONUS = 0.08;

export class SocialGraphService {
  constructor(
    private readonly bus: EventBus,
    private readonly repo: SocialRepo,
  ) {}

  /**
   * A user mentioned another person (v2 Â§4). Creates the node, then creates a
   * tentative edge or reinforces an existing one. Corroboration: a repeated,
   * consistent mention (same edge type) is what moves strength meaningfully.
   */
  async noteMention(input: MentionInput): Promise<SocialGraphEdge> {
    await this.repo.socialNodes.upsert({ userId: input.fromUserId, displayName: input.fromDisplayName, createdAt: '' });
    await this.repo.socialNodes.upsert({ userId: input.mentionedUserId, displayName: input.mentionedDisplayName, createdAt: '' });

    const existing = await this.repo.socialEdges.find(input.fromUserId, input.mentionedUserId);
    const edgeType = input.edgeType ?? existing?.edgeType ?? 'unknown';

    if (!existing) {
      const edge = await this.repo.socialEdges.upsert({
        fromUserId: input.fromUserId,
        toUserId: input.mentionedUserId,
        edgeType,
        sharedJokes: input.sharedJoke ? [input.sharedJoke] : [],
        sharedInterests: input.sharedInterest ? [input.sharedInterest] : [],
        sharedEvents: input.sharedEvent ? [input.sharedEvent] : [],
        interactionFrequency: 0,
      });
      this.emitUpdate(edge);
      return edge;
    }

    // Corroboration: consistent edge type across mentions gets the bonus;
    // changed edge type counts as weaker evidence.
    const consistent = existing.edgeType === edgeType;
    const delta = consistent ? REINFORCE_DELTA + CORROBORATION_BONUS : REINFORCE_DELTA;
    await this.repo.socialEdges.reinforce(input.fromUserId, input.mentionedUserId, delta);

    const updated = await this.repo.socialEdges.upsert({
      fromUserId: input.fromUserId,
      toUserId: input.mentionedUserId,
      edgeType,
      strength: Math.min(1, (existing?.strength ?? TENTATIVE_STRENGTH) + delta),
      sharedJokes: this.mergeUnique(existing.sharedJokes, input.sharedJoke),
      sharedInterests: this.mergeUnique(existing.sharedInterests, input.sharedInterest),
      sharedEvents: this.mergeUnique(existing.sharedEvents, input.sharedEvent),
      interactionFrequency: (existing?.interactionFrequency ?? 0) + 1,
      effectiveVerbosity: existing?.effectiveVerbosity,
      effectiveEnergy: existing?.effectiveEnergy,
    });
    this.emitUpdate(updated);
    return updated;
  }

  /**
   * Social relevance term for memory ranking (v2 Â§4): memories connected to
   * people mentioned in the current conversation rank higher.
   */
  async socialRelevance(userId: string, mentionedUserIds: string[]): Promise<Map<string, number>> {
    const edges = await this.repo.socialEdges.edgesForUser(userId);
    const boost = new Map<string, number>();
    for (const edge of edges) {
      if (mentionedUserIds.includes(edge.toUserId) || mentionedUserIds.includes(edge.fromUserId)) {
        boost.set(edge.toUserId === userId ? edge.fromUserId : edge.toUserId, edge.strength);
      }
    }
    return boost;
  }

  /** Per-contact behavior variance (v2 Â§11): baseline override for this edge. */
  async setPerContactVariance(fromUserId: string, toUserId: string, variance: { verbosity?: number; energy?: number }): Promise<void> {
    const existing = await this.repo.socialEdges.find(fromUserId, toUserId);
    if (!existing) return;
    await this.repo.socialEdges.upsert({
      ...existing,
      effectiveVerbosity: variance.verbosity,
      effectiveEnergy: variance.energy,
    });
  }

  async perContactVariance(fromUserId: string, toUserId: string): Promise<{ verbosity?: number; energy?: number }> {
    const edge = await this.repo.socialEdges.find(fromUserId, toUserId);
    if (!edge) return {};
    return { verbosity: edge.effectiveVerbosity, energy: edge.effectiveEnergy };
  }

  edgesForUser(userId: string): Promise<SocialGraphEdge[]> {
    return this.repo.socialEdges.edgesForUser(userId);
  }

  createCluster(cluster: Omit<SocialCluster, 'id'> & { id?: string }): Promise<SocialCluster> {
    return this.repo.socialClusters.create(cluster);
  }

  listClusters(): Promise<SocialCluster[]> {
    return this.repo.socialClusters.list();
  }

  private mergeUnique(list: string[], item?: string): string[] {
    if (!item || list.includes(item)) return list;
    return [...list, item];
  }

  private emitUpdate(edge: SocialGraphEdge): void {
    this.bus.publish('RelationshipEdgeUpdated', {
      fromUserId: edge.fromUserId,
      toUserId: edge.toUserId,
      changes: { strength: edge.strength, edgeType: edge.edgeType },
    });
  }
}
