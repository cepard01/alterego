// Repositories for v2 simulation entities: WorldState, PsychologyState,
// Thought, EvaluationReport.

import { Db } from '../DbTypes.js';
import { EvaluationReport, PsychologyState, Thought, WorldState } from '../Types.js';
import { camelToSnake, newId, nowIso, parseJson, firstRow } from './Base.js';

export class WorldStateRepository {
  constructor(private readonly db: Db) {}

  async upsert(state: Omit<WorldState, 'id' | 'updatedAt'> & { id?: string }): Promise<WorldState> {
    const row: WorldState = {
      id: state.id ?? newId(),
      agentId: state.agentId,
      activity: state.activity,
      locationContext: state.locationContext,
      availability: state.availability,
      energyLevel: state.energyLevel,
      stressLevel: state.stressLevel,
      focusLevel: state.focusLevel,
      deviceBattery: state.deviceBattery,
      sleepState: state.sleepState,
      currentActivityDetail: state.currentActivityDetail,
      updatedAt: nowIso(),
    };
    await this.db.query(
      `INSERT INTO world_state (id, agent_id, activity, location_context, availability, energy_level, stress_level, focus_level, device_battery, sleep_state, current_activity_detail, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (agent_id) DO UPDATE SET
         activity = EXCLUDED.activity,
         location_context = EXCLUDED.location_context,
         availability = EXCLUDED.availability,
         energy_level = EXCLUDED.energy_level,
         stress_level = EXCLUDED.stress_level,
         focus_level = EXCLUDED.focus_level,
         device_battery = EXCLUDED.device_battery,
         sleep_state = EXCLUDED.sleep_state,
         current_activity_detail = EXCLUDED.current_activity_detail,
         updated_at = EXCLUDED.updated_at`,
      [
        row.id,
        row.agentId,
        row.activity,
        row.locationContext,
        row.availability,
        row.energyLevel,
        row.stressLevel,
        row.focusLevel,
        row.deviceBattery,
        row.sleepState,
        row.currentActivityDetail,
        row.updatedAt,
      ],
    );
    return row;
  }

  async findByAgent(agentId: string): Promise<WorldState | undefined> {
    const row = firstRow<Record<string, unknown>>(
      (await this.db.query('SELECT * FROM world_state WHERE agent_id = $1', [agentId])).rows,
    );
    if (!row) return undefined;
    return {
      id: String(row.id),
      agentId: String(row.agent_id),
      activity: String(row.activity),
      locationContext: String(row.location_context),
      availability: Number(row.availability),
      energyLevel: Number(row.energy_level),
      stressLevel: Number(row.stress_level),
      focusLevel: Number(row.focus_level),
      deviceBattery: Number(row.device_battery),
      sleepState: String(row.sleep_state),
      currentActivityDetail: String(row.current_activity_detail),
      updatedAt: String(row.updated_at),
    };
  }
}

export class PsychologyStateRepository {
  constructor(private readonly db: Db) {}

  async upsert(state: Omit<PsychologyState, 'updatedAt'>): Promise<PsychologyState> {
    const row: PsychologyState = { ...state, updatedAt: nowIso() };
    await this.db.query(
      `INSERT INTO psychology_state (user_id, curiosity, trust, patience, interest, social_energy, empathy, confidence, stress, comfort, conversation_fatigue, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (user_id) DO UPDATE SET
         curiosity = EXCLUDED.curiosity, trust = EXCLUDED.trust, patience = EXCLUDED.patience,
         interest = EXCLUDED.interest, social_energy = EXCLUDED.social_energy, empathy = EXCLUDED.empathy,
         confidence = EXCLUDED.confidence, stress = EXCLUDED.stress, comfort = EXCLUDED.comfort,
         conversation_fatigue = EXCLUDED.conversation_fatigue, updated_at = EXCLUDED.updated_at`,
      [
        row.userId,
        row.curiosity,
        row.trust,
        row.patience,
        row.interest,
        row.socialEnergy,
        row.empathy,
        row.confidence,
        row.stress,
        row.comfort,
        row.conversationFatigue,
        row.updatedAt,
      ],
    );
    return row;
  }

  async find(userId: string): Promise<PsychologyState | undefined> {
    const row = firstRow<Record<string, unknown>>(
      (await this.db.query('SELECT * FROM psychology_state WHERE user_id = $1', [userId])).rows,
    );
    if (!row) return undefined;
    return {
      userId: String(row.user_id),
      curiosity: Number(row.curiosity),
      trust: Number(row.trust),
      patience: Number(row.patience),
      interest: Number(row.interest),
      socialEnergy: Number(row.social_energy),
      empathy: Number(row.empathy),
      confidence: Number(row.confidence),
      stress: Number(row.stress),
      comfort: Number(row.comfort),
      conversationFatigue: Number(row.conversation_fatigue),
      updatedAt: String(row.updated_at),
    };
  }

  /** Updates a subset of psychology variables (v2 §8 evolution). */
  async updateVariables(userId: string, changes: Partial<Omit<PsychologyState, 'userId' | 'updatedAt'>>): Promise<void> {
    const entries = Object.entries(changes);
    if (entries.length === 0) return;
    const sets = entries.map(([key], index) => `${camelToSnake(key)} = $${index + 1}`);
    await this.db.query(`UPDATE psychology_state SET ${sets.join(', ')}, updated_at = $${entries.length + 1} WHERE user_id = $${entries.length + 2}`, [
      ...entries.map(([, value]) => value),
      nowIso(),
      userId,
    ]);
  }
}

export class ThoughtRepository {
  constructor(private readonly db: Db) {}

  async create(thought: Omit<Thought, 'id' | 'createdAt' | 'verifiedAt' | 'verificationResult' | 'lastConfidenceDecayAt'> & {
    id?: string;
    createdAt?: string;
    lastConfidenceDecayAt?: string;
  }): Promise<Thought> {
    const row: Thought = {
      id: thought.id ?? newId(),
      userId: thought.userId,
      category: thought.category,
      content: thought.content,
      confidence: thought.confidence,
      relatedMemoryIds: thought.relatedMemoryIds,
      relatedMessageId: thought.relatedMessageId,
      createdAt: thought.createdAt ?? nowIso(),
      verifiedAt: null,
      verificationResult: null,
      source: thought.source,
      verificationStatus: thought.verificationStatus,
      lastConfidenceDecayAt: thought.lastConfidenceDecayAt ?? thought.createdAt ?? nowIso(),
    };
    await this.db.query(
      `INSERT INTO thoughts (id, user_id, category, content, confidence, related_memory_ids, related_message_id, created_at, source, verification_status, last_confidence_decay_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)`,
      [
        row.id,
        row.userId,
        row.category,
        row.content,
        row.confidence,
        JSON.stringify(row.relatedMemoryIds),
        row.relatedMessageId ?? null,
        row.createdAt,
        row.source,
        row.verificationStatus,
        row.lastConfidenceDecayAt,
      ],
    );
    return row;
  }

  async findById(id: string): Promise<Thought | undefined> {
    const row = firstRow<Record<string, unknown>>(
      (await this.db.query('SELECT * FROM thoughts WHERE id = $1', [id])).rows,
    );
    return row ? this.mapRow(row) : undefined;
  }

  async listByUser(userId: string, limit = 50): Promise<Thought[]> {
    const rows = (
      await this.db.query('SELECT * FROM thoughts WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [userId, limit])
    ).rows;
    return rows.map((row) => this.mapRow(row as Record<string, unknown>));
  }

  async deleteByUser(userId: string): Promise<void> {
    await this.db.query('DELETE FROM thoughts WHERE user_id = $1', [userId]);
  }

  /** Recent thoughts used by the Human Simulation Engine's reasoning field. */
  async listRecent(userId: string, since: string, limit = 20): Promise<Thought[]> {
    const rows = (
      await this.db.query(
        'SELECT * FROM thoughts WHERE user_id = $1 AND created_at > $2 ORDER BY created_at DESC LIMIT $3',
        [userId, since, limit],
      )
    ).rows;
    return rows.map((row) => this.mapRow(row as Record<string, unknown>));
  }

  async setVerification(id: string, result: 'confirmed' | 'contradicted' | 'expired'): Promise<void> {
    await this.db.query('UPDATE thoughts SET verification_result = $1, verified_at = $2, verification_status = $1 WHERE id = $3', [
      result,
      nowIso(),
      id,
    ]);
  }

  /** Confidence decay over time (v3 §7) — certainty drops, not importance. */
  async updateConfidence(id: string, confidence: number): Promise<void> {
    await this.db.query('UPDATE thoughts SET confidence = $1, last_confidence_decay_at = $2 WHERE id = $3', [
      confidence,
      nowIso(),
      id,
    ]);
  }

  private mapRow(row: Record<string, unknown>): Thought {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      category: row.category as Thought['category'],
      content: String(row.content),
      confidence: Number(row.confidence),
      relatedMemoryIds: parseJson<string[]>(row.related_memory_ids, []),
      relatedMessageId: row.related_message_id === null ? undefined : String(row.related_message_id),
      createdAt: String(row.created_at),
      verifiedAt: row.verified_at === null ? null : String(row.verified_at),
      verificationResult: row.verification_result === null ? null : (row.verification_result as Thought['verificationResult']),
      source: row.source as Thought['source'],
      verificationStatus: row.verification_status as Thought['verificationStatus'],
      lastConfidenceDecayAt: String(row.last_confidence_decay_at),
    };
  }
}

export class EvaluationReportRepository {
  constructor(private readonly db: Db) {}

  async create(report: Omit<EvaluationReport, 'id' | 'createdAt'> & { id?: string }): Promise<EvaluationReport> {
    const row: EvaluationReport = {
      id: report.id ?? newId(),
      conversationId: report.conversationId,
      metrics: report.metrics,
      humanLikenessScore: report.humanLikenessScore,
      createdAt: nowIso(),
    };
    await this.db.query(
      `INSERT INTO evaluation_reports (id, conversation_id, metrics, human_likeness_score, created_at)
       VALUES ($1, $2, $3::jsonb, $4, $5)`,
      [row.id, row.conversationId, JSON.stringify(row.metrics), row.humanLikenessScore, row.createdAt],
    );
    return row;
  }

  async findByConversation(conversationId: string): Promise<EvaluationReport[]> {
    const rows = (
      await this.db.query(
        'SELECT * FROM evaluation_reports WHERE conversation_id = $1 ORDER BY created_at DESC',
        [conversationId],
      )
    ).rows;
    return rows.map((row) => ({
      id: String((row as Record<string, unknown>).id),
      conversationId: String((row as Record<string, unknown>).conversation_id),
      metrics: parseJson<Record<string, number>>((row as Record<string, unknown>).metrics, {}),
      humanLikenessScore: Number((row as Record<string, unknown>).human_likeness_score),
      createdAt: String((row as Record<string, unknown>).created_at),
    }));
  }
}


