// Repositories for v3 continuity entities: MemoryContradiction, RecoveryPlan,
// IdentityEvolutionProposal.

import { Db } from '../db.types.js';
import { IdentityEvolutionProposal, MemoryContradiction, RecoveryPlan } from '../types.js';
import { newId, nowIso, parseJson, firstRow } from './base.js';

export class MemoryContradictionRepository {
  constructor(private readonly db: Db) {}

  async create(contradiction: Omit<MemoryContradiction, 'id' | 'detectedAt' | 'resolution'> & {
    id?: string;
  }): Promise<MemoryContradiction> {
    const row: MemoryContradiction = {
      id: contradiction.id ?? newId(),
      memoryIdA: contradiction.memoryIdA,
      memoryIdB: contradiction.memoryIdB,
      messageId: contradiction.messageId,
      detectedAt: nowIso(),
      resolution: 'unresolved',
    };
    await this.db.query(
      `INSERT INTO memory_contradictions (id, memory_id_a, memory_id_b, message_id, detected_at, resolution)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [row.id, row.memoryIdA, row.memoryIdB ?? null, row.messageId ?? null, row.detectedAt, row.resolution],
    );
    return row;
  }

  async resolve(id: string, resolution: MemoryContradiction['resolution']): Promise<void> {
    await this.db.query('UPDATE memory_contradictions SET resolution = $1 WHERE id = $2', [resolution, id]);
  }

  async findUnresolved(limit = 50): Promise<MemoryContradiction[]> {
    const rows = (
      await this.db.query("SELECT * FROM memory_contradictions WHERE resolution = 'unresolved' ORDER BY detected_at ASC LIMIT $1", [limit])
    ).rows;
    return rows.map((row) => ({
      id: String((row as Record<string, unknown>).id),
      memoryIdA: String((row as Record<string, unknown>).memory_id_a),
      memoryIdB: (row as Record<string, unknown>).memory_id_b === null ? undefined : String((row as Record<string, unknown>).memory_id_b),
      messageId: (row as Record<string, unknown>).message_id === null ? undefined : String((row as Record<string, unknown>).message_id),
      detectedAt: String((row as Record<string, unknown>).detected_at),
      resolution: (row as Record<string, unknown>).resolution as MemoryContradiction['resolution'],
    }));
  }
}

export class RecoveryPlanRepository {
  constructor(private readonly db: Db) {}

  async create(plan: Omit<RecoveryPlan, 'id' | 'status'> & { id?: string }): Promise<RecoveryPlan> {
    const row: RecoveryPlan = { ...plan, id: plan.id ?? newId(), status: 'pending' };
    await this.db.query(
      `INSERT INTO recovery_plans (id, conversation_id, gap_duration_ms, freshness_score, strategy, reconstructed_context_type, scheduled_response_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        row.id,
        row.conversationId,
        row.gapDurationMs,
        row.freshnessScore,
        row.strategy,
        row.reconstructedContextType,
        row.scheduledResponseAt,
        row.status,
      ],
    );
    return row;
  }

  async findPending(limit = 50): Promise<RecoveryPlan[]> {
    const rows = (
      await this.db.query("SELECT * FROM recovery_plans WHERE status = 'pending' ORDER BY scheduled_response_at ASC NULLS LAST LIMIT $1", [limit])
    ).rows;
    return rows.map((row) => this.mapRow(row as Record<string, unknown>));
  }

  async setStatus(id: string, status: RecoveryPlan['status']): Promise<void> {
    await this.db.query('UPDATE recovery_plans SET status = $1 WHERE id = $2', [status, id]);
  }

  private mapRow(row: Record<string, unknown>): RecoveryPlan {
    return {
      id: String(row.id),
      conversationId: String(row.conversation_id),
      gapDurationMs: Number(row.gap_duration_ms),
      freshnessScore: Number(row.freshness_score),
      strategy: row.strategy as RecoveryPlan['strategy'],
      reconstructedContextType: row.reconstructed_context_type as RecoveryPlan['reconstructedContextType'],
      scheduledResponseAt: row.scheduled_response_at === null ? null : String(row.scheduled_response_at),
      status: row.status as RecoveryPlan['status'],
    };
  }
}

export class IdentityEvolutionProposalRepository {
  constructor(private readonly db: Db) {}

  async create(proposal: Omit<IdentityEvolutionProposal, 'id' | 'createdAt' | 'resolvedAt' | 'status'> & {
    id?: string;
    status?: IdentityEvolutionProposal['status'];
  }): Promise<IdentityEvolutionProposal> {
    const row: IdentityEvolutionProposal = {
      id: proposal.id ?? newId(),
      agentId: proposal.agentId,
      fieldChanged: proposal.fieldChanged,
      oldValue: proposal.oldValue,
      newValue: proposal.newValue,
      supportingEvidence: proposal.supportingEvidence,
      confidence: proposal.confidence,
      status: proposal.status ?? 'proposed',
      createdAt: nowIso(),
      resolvedAt: null,
    };
    await this.db.query(
      `INSERT INTO identity_evolution_proposals (id, agent_id, field_changed, old_value, new_value, supporting_evidence, confidence, status, created_at, resolved_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)`,
      [
        row.id,
        row.agentId,
        row.fieldChanged,
        row.oldValue,
        row.newValue,
        JSON.stringify(row.supportingEvidence),
        row.confidence,
        row.status,
        row.createdAt,
        null,
      ],
    );
    return row;
  }

  async listByStatus(status: IdentityEvolutionProposal['status'], limit = 100): Promise<IdentityEvolutionProposal[]> {
    const rows = (
      await this.db.query('SELECT * FROM identity_evolution_proposals WHERE status = $1 ORDER BY created_at DESC LIMIT $2', [status, limit])
    ).rows;
    return rows.map((row) => this.mapRow(row as Record<string, unknown>));
  }

  async setStatus(id: string, status: IdentityEvolutionProposal['status']): Promise<void> {
    await this.db.query('UPDATE identity_evolution_proposals SET status = $1, resolved_at = $2 WHERE id = $3', [
      status,
      nowIso(),
      id,
    ]);
  }

  private mapRow(row: Record<string, unknown>): IdentityEvolutionProposal {
    return {
      id: String(row.id),
      agentId: String(row.agent_id),
      fieldChanged: String(row.field_changed),
      oldValue: String(row.old_value),
      newValue: String(row.new_value),
      supportingEvidence: parseJson<string[]>(row.supporting_evidence, []),
      confidence: Number(row.confidence),
      status: row.status as IdentityEvolutionProposal['status'],
      createdAt: String(row.created_at),
      resolvedAt: row.resolved_at === null ? null : String(row.resolved_at),
    };
  }
}
