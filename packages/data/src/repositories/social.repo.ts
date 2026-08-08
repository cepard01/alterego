// Repositories for v2 social-graph entities: SocialGraphNode, SocialGraphEdge,
// SocialCluster.

import { Db } from '../db.js';
import { SocialCluster, SocialGraphEdge, SocialGraphNode } from '../types.js';
import { newId, nowIso, parseJson, firstRow } from './base.js';

export class SocialGraphNodeRepository {
  constructor(private readonly db: Db) {}

  async upsert(node: SocialGraphNode): Promise<SocialGraphNode> {
    const row: SocialGraphNode = { ...node, createdAt: nowIso() };
    await this.db.query(
      `INSERT INTO social_graph_nodes (user_id, display_name, created_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name`,
      [row.userId, row.displayName, row.createdAt],
    );
    return row;
  }

  async find(userId: string): Promise<SocialGraphNode | undefined> {
    return firstRow<SocialGraphNode>(
      (await this.db.query('SELECT * FROM social_graph_nodes WHERE user_id = $1', [userId])).rows,
    );
  }
}

export class SocialGraphEdgeRepository {
  constructor(private readonly db: Db) {}

  async upsert(edge: Omit<SocialGraphEdge, 'lastConfirmedAt' | 'strength'> & { strength?: number }): Promise<SocialGraphEdge> {
    const row: SocialGraphEdge = {
      ...edge,
      strength: edge.strength ?? 0.1,
      lastConfirmedAt: nowIso(),
    };
    await this.db.query(
      `INSERT INTO social_graph_edges (from_user_id, to_user_id, edge_type, strength, shared_jokes, shared_interests, shared_events, interaction_frequency, last_confirmed_at, effective_verbosity, effective_energy)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10, $11)
       ON CONFLICT (from_user_id, to_user_id) DO UPDATE SET
         edge_type = EXCLUDED.edge_type,
         strength = EXCLUDED.strength,
         shared_jokes = EXCLUDED.shared_jokes,
         shared_interests = EXCLUDED.shared_interests,
         shared_events = EXCLUDED.shared_events,
         interaction_frequency = EXCLUDED.interaction_frequency,
         last_confirmed_at = EXCLUDED.last_confirmed_at,
         effective_verbosity = EXCLUDED.effective_verbosity,
         effective_energy = EXCLUDED.effective_energy`,
      [
        row.fromUserId,
        row.toUserId,
        row.edgeType,
        row.strength,
        JSON.stringify(row.sharedJokes),
        JSON.stringify(row.sharedInterests),
        JSON.stringify(row.sharedEvents),
        row.interactionFrequency,
        row.lastConfirmedAt,
        row.effectiveVerbosity ?? null,
        row.effectiveEnergy ?? null,
      ],
    );
    return row;
  }

  async find(fromUserId: string, toUserId: string): Promise<SocialGraphEdge | undefined> {
    const row = firstRow<Record<string, unknown>>(
      (await this.db.query(
        'SELECT * FROM social_graph_edges WHERE from_user_id = $1 AND to_user_id = $2',
        [fromUserId, toUserId],
      )).rows,
    );
    if (!row) return undefined;
    return this.mapEdge(row);
  }

  /** Edges a user participates in (either direction) — social relevance input (v2 §4). */
  async edgesForUser(userId: string): Promise<SocialGraphEdge[]> {
    const rows = (
      await this.db.query('SELECT * FROM social_graph_edges WHERE from_user_id = $1 OR to_user_id = $1', [userId])
    ).rows;
    return rows.map((row) => this.mapEdge(row as Record<string, unknown>));
  }

  private mapEdge(row: Record<string, unknown>): SocialGraphEdge {
    return {
      fromUserId: String(row.from_user_id),
      toUserId: String(row.to_user_id),
      edgeType: row.edge_type as SocialGraphEdge['edgeType'],
      strength: Number(row.strength),
      sharedJokes: parseJson<string[]>(row.shared_jokes, []),
      sharedInterests: parseJson<string[]>(row.shared_interests, []),
      sharedEvents: parseJson<string[]>(row.shared_events, []),
      interactionFrequency: Number(row.interaction_frequency),
      lastConfirmedAt: String(row.last_confirmed_at),
      effectiveVerbosity: row.effective_verbosity === null || row.effective_verbosity === undefined ? undefined : Number(row.effective_verbosity),
      effectiveEnergy: row.effective_energy === null || row.effective_energy === undefined ? undefined : Number(row.effective_energy),
    };
  }

  async reinforce(fromUserId: string, toUserId: string, delta = 0.05): Promise<void> {
    const edge = await this.find(fromUserId, toUserId);
    if (!edge) return;
    await this.db.query(
      'UPDATE social_graph_edges SET strength = $1, interaction_frequency = $2, last_confirmed_at = $3 WHERE from_user_id = $4 AND to_user_id = $5',
      [Math.min(1, edge.strength + delta), edge.interactionFrequency + 1, nowIso(), fromUserId, toUserId],
    );
  }
}

export class SocialClusterRepository {
  constructor(private readonly db: Db) {}

  async create(cluster: Omit<SocialCluster, 'id'> & { id?: string }): Promise<SocialCluster> {
    const row: SocialCluster = { ...cluster, id: cluster.id ?? newId() };
    await this.db.query(
      'INSERT INTO social_clusters (id, member_user_ids, cluster_label, cohesion_score) VALUES ($1, $2::jsonb, $3, $4)',
      [row.id, JSON.stringify(row.memberUserIds), row.clusterLabel, row.cohesionScore],
    );
    return row;
  }

  async list(): Promise<SocialCluster[]> {
    const rows = (await this.db.query('SELECT * FROM social_clusters')).rows;
    return rows.map((row) => ({
      id: String((row as Record<string, unknown>).id),
      memberUserIds: parseJson<string[]>((row as Record<string, unknown>).member_user_ids, []),
      clusterLabel: String((row as Record<string, unknown>).cluster_label),
      cohesionScore: Number((row as Record<string, unknown>).cohesion_score),
    }));
  }
}
