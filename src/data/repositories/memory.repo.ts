// Repositories for memory-related entities: Memory (v1 §5 + v3 §7 confidence
// fields), Knowledge. Memory ranking blends similarity, importance, recency
// and social relevance per v1 §5 / v2 §4 / v3 §7.

import { Db } from '../db.js';
import { Knowledge, Memory } from '../types.js';
import { camelToSnake, newId, nowIso, parseJson, firstRow } from './base.js';

export interface MemoryRankInput {
  similarity?: number;
  importance: number;
  recencyDecay: number;
  socialRelevance?: number;
}

export interface MemoryRankWeights {
  similarity: number;
  importance: number;
  recencyDecay: number;
  socialRelevance: number;
}

export const DEFAULT_RANK_WEIGHTS: MemoryRankWeights = {
  similarity: 0.5,
  importance: 0.25,
  recencyDecay: 0.15,
  socialRelevance: 0.1,
};

/** v1 §5: score = similarity*w1 + importance*w2 + recency_decay*w3 (+ social*w4). */
export function rankMemory(entry: MemoryRankInput, weights: MemoryRankWeights = DEFAULT_RANK_WEIGHTS): number {
  const similarity = entry.similarity ?? 0.5;
  const socialRelevance = entry.socialRelevance ?? 0;
  return (
    similarity * weights.similarity +
    entry.importance * weights.importance +
    entry.recencyDecay * weights.recencyDecay +
    socialRelevance * weights.socialRelevance
  );
}

export class MemoryRepository {
  constructor(private readonly db: Db) {}

  async deleteByUser(userId: string): Promise<number> {
    await this.db.query('DELETE FROM memory WHERE user_id = $1', [userId]);
    return 0;
  }

  async create(memory: Omit<Memory, 'id' | 'createdAt' | 'lastAccessedAt' | 'lastConfidenceDecayAt'> & {
    id?: string;
    createdAt?: string;
  }): Promise<Memory> {
    const row: Memory = {
      id: memory.id ?? newId(),
      userId: memory.userId,
      type: memory.type,
      content: memory.content,
      embeddingVector: memory.embeddingVector ?? null,
      importance: memory.importance,
      confidence: memory.confidence,
      source: memory.source,
      verificationStatus: memory.verificationStatus,
      createdAt: memory.createdAt ?? nowIso(),
      lastAccessedAt: nowIso(),
      expiresAt: memory.expiresAt ?? null,
      sourceMessageId: memory.sourceMessageId,
      lastConfidenceDecayAt: nowIso(),
    };
    await this.db.query(
      `INSERT INTO memory (id, user_id, type, content, embedding_vector, importance, confidence, source, verification_status, created_at, last_accessed_at, expires_at, source_message_id, last_confidence_decay_at)
       VALUES ($1, $2, $3, $4, $5::vector, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        row.id,
        row.userId,
        row.type,
        row.content,
        row.embeddingVector ? JSON.stringify(row.embeddingVector) : null,
        row.importance,
        row.confidence,
        row.source,
        row.verificationStatus,
        row.createdAt,
        row.lastAccessedAt,
        row.expiresAt,
        row.sourceMessageId ?? null,
        row.lastConfidenceDecayAt,
      ],
    );
    return row;
  }

  async findById(id: string): Promise<Memory | undefined> {
    const row = firstRow<Record<string, unknown>>(
      (await this.db.query('SELECT * FROM memory WHERE id = $1', [id])).rows,
    );
    return row ? this.mapRow(row) : undefined;
  }

  /** Memories of a given type, most recently created first. */
  async listByUser(userId: string, type?: Memory['type'], limit = 100): Promise<Memory[]> {
    if (type) {
      const rows = (await this.db.query('SELECT * FROM memory WHERE user_id = $1 AND type = $2 ORDER BY created_at DESC LIMIT $3', [userId, type, limit])).rows;
      return rows.map((row) => this.mapRow(row as Record<string, unknown>));
    }
    const rows = (await this.db.query('SELECT * FROM memory WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [userId, limit])).rows;
    return rows.map((row) => this.mapRow(row as Record<string, unknown>));
  }

  /**
   * Retrieves non-expired, non-contradicted memories for a user and ranks them
   * using the v1 §5 formula. When an embedding is supplied, similarity is
   * computed with pgvector; otherwise a neutral similarity is assumed.
   */
  async searchByUser(
    userId: string,
    embedding?: number[],
    topK = 8,
    weights: MemoryRankWeights = DEFAULT_RANK_WEIGHTS,
  ): Promise<Array<Memory & { rankScore: number }>> {
    const now = Date.now();
    let rows: unknown[];
    if (embedding) {
      rows = (
        await this.db.query(
          `SELECT * FROM memory
           WHERE user_id = $1 AND expires_at IS NULL AND verification_status != 'contradicted'
           ORDER BY embedding_vector <=> $2::vector ASC
           LIMIT 50`,
          [userId, JSON.stringify(embedding)],
        )
      ).rows;
    } else {
      rows = (
        await this.db.query(
          `SELECT * FROM memory
           WHERE user_id = $1 AND expires_at IS NULL AND verification_status != 'contradicted'
           ORDER BY created_at DESC LIMIT 50`,
          [userId],
        )
      ).rows;
    }
    const ranked = rows
      .map((row) => {
        const memory = this.mapRow(row as Record<string, unknown>);
        const similarity = embedding ? 1 - this.rawSimilarity(embedding, memory.embeddingVector) : 0.5;
        const recencyDecay = this.recencyDecay(memory.createdAt, now);
        return { ...memory, rankScore: rankMemory({ similarity, importance: memory.importance, recencyDecay }, weights) };
      })
      .sort((a, b) => b.rankScore - a.rankScore)
      .slice(0, topK);
    return ranked;
  }

  async update(id: string, changes: Partial<Pick<Memory, 'importance' | 'confidence' | 'verificationStatus' | 'content' | 'embeddingVector' | 'expiresAt'>>): Promise<void> {
    const entries = Object.entries(changes);
    if (entries.length === 0) return;
    const sets = entries.map(([key], index) => {
      const column = camelToSnake(key);
      return key === 'embeddingVector' ? `${column} = $${index + 1}::vector` : `${column} = $${index + 1}`;
    });
    await this.db.query(`UPDATE memory SET ${sets.join(', ')} WHERE id = $${entries.length + 1}`, [
      ...entries.map(([, value]) => value),
      id,
    ]);
  }

  async touch(id: string): Promise<void> {
    await this.db.query('UPDATE memory SET last_accessed_at = $1 WHERE id = $2', [nowIso(), id]);
  }

  /** Marks a memory contradicted (v3 §7) and records the contradiction. */
  async markContradicted(memoryId: string): Promise<void> {
    await this.db.query("UPDATE memory SET verification_status = 'contradicted' WHERE id = $1", [memoryId]);
  }

  /** Applies confidence decay (v3 §7) — e.g. a background scheduler job. */
  async decayConfidence(memoryId: string, factor: number): Promise<void> {
    await this.db.query('UPDATE memory SET confidence = GREATEST(confidence * $1, 0.1), last_confidence_decay_at = $2 WHERE id = $3', [
      factor,
      nowIso(),
      memoryId,
    ]);
  }

  /** Deletes memories of a given type past their expiry (background sweep). */
  async deleteExpired(limit = 100): Promise<number> {
    const result = await this.db.query(
      'DELETE FROM memory WHERE expires_at IS NOT NULL AND expires_at < now() LIMIT $1',
      [limit],
    );
    return result.rowCount ?? 0;
  }

  /** All unverified memories older than a cutoff — candidates for contradiction re-check. */
  async listUnverified(cutoff: string, limit = 100): Promise<Memory[]> {
    const rows = (
      await this.db.query(
        "SELECT * FROM memory WHERE verification_status = 'unverified' AND created_at < $1 ORDER BY created_at ASC LIMIT $2",
        [cutoff, limit],
      )
    ).rows;
    return rows.map((row) => this.mapRow(row as Record<string, unknown>));
  }

  private mapRow(row: Record<string, unknown>): Memory {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      type: row.type as Memory['type'],
      content: String(row.content),
      embeddingVector: row.embedding_vector === null ? null : this.parseVector(row.embedding_vector),
      importance: Number(row.importance),
      confidence: Number(row.confidence),
      source: row.source as Memory['source'],
      verificationStatus: row.verification_status as Memory['verificationStatus'],
      createdAt: String(row.created_at),
      lastAccessedAt: String(row.last_accessed_at),
      expiresAt: row.expires_at === null ? null : String(row.expires_at),
      sourceMessageId: row.source_message_id === null || row.source_message_id === undefined ? undefined : String(row.source_message_id),
      lastConfidenceDecayAt: String(row.last_confidence_decay_at),
    };
  }

  private parseVector(value: unknown): number[] {
    if (Array.isArray(value)) return value as number[];
    if (typeof value === 'string') {
      const match = /^\[([\d.,eE+-]+)\]$/.exec(value.trim());
      if (match) return match[1].split(',').map(Number);
    }
    return [];
  }

  private rawSimilarity(a: number[], b: number[] | null): number {
    if (!b || a.length === 0 || a.length !== b.length) return 0.5;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  private recencyDecay(createdAt: string, nowMs: number): number {
    const ageMs = nowMs - Date.parse(createdAt);
    if (Number.isNaN(ageMs) || ageMs <= 0) return 1;
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    return Math.max(0, 1 - ageMs / thirtyDays);
  }
}

export class KnowledgeRepository {
  constructor(private readonly db: Db) {}

  async create(knowledge: Omit<Knowledge, 'id'> & { id?: string }): Promise<Knowledge> {
    const row: Knowledge = { ...knowledge, id: knowledge.id ?? newId() };
    await this.db.query(
      `INSERT INTO knowledge (id, topic, content, embedding_vector, source, confidence)
       VALUES ($1, $2, $3, $4::vector, $5, $6)`,
      [
        row.id,
        row.topic,
        row.content,
        row.embeddingVector ? JSON.stringify(row.embeddingVector) : null,
        row.source,
        row.confidence,
      ],
    );
    return row;
  }

  async searchByTopic(topic: string, limit = 10): Promise<Knowledge[]> {
    const rows = (
      await this.db.query('SELECT * FROM knowledge WHERE topic = $1 ORDER BY confidence DESC LIMIT $2', [topic, limit])
    ).rows;
    return rows.map((row) => ({
      id: String((row as Record<string, unknown>).id),
      topic: String((row as Record<string, unknown>).topic),
      content: String((row as Record<string, unknown>).content),
      embeddingVector: null,
      source: String((row as Record<string, unknown>).source),
      confidence: Number((row as Record<string, unknown>).confidence),
    }));
  }
}

export { parseJson };
