// Repositories for user-centric v1 entities: User, Relationship, InteractionHistory.

import { Db } from '../db.js';
import { InteractionHistory, Relationship, User } from '../types.js';
import { camelToSnake, newId, nowIso, parseJson, firstRow, toJson } from './base.js';

export class UserRepository {
  constructor(private readonly db: Db) {}

  async create(user: Omit<User, 'createdAt' | 'lastSeenAt'>): Promise<User> {
    const createdAt = nowIso();
    const row: User = {
      ...user,
      id: user.id ?? newId(),
      createdAt,
      lastSeenAt: createdAt,
    };
    await this.db.query(
      `INSERT INTO users (id, phone_number, display_name, timezone, locale, created_at, last_seen_at, opt_in_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [row.id, row.phoneNumber, row.displayName, row.timezone, row.locale, row.createdAt, row.lastSeenAt, row.optInStatus],
    );
    return row;
  }

  async findById(id: string): Promise<User | undefined> {
    const row = firstRow<Record<string, unknown>>(
      (await this.db.query('SELECT * FROM users WHERE id = $1', [id])).rows,
    );
    return row ? this.mapRow(row) : undefined;
  }

  async findByPhone(phoneNumber: string): Promise<User | undefined> {
    const row = firstRow<Record<string, unknown>>(
      (await this.db.query('SELECT * FROM users WHERE phone_number = $1', [phoneNumber])).rows,
    );
    return row ? this.mapRow(row) : undefined;
  }

  async update(id: string, changes: Partial<Pick<User, 'displayName' | 'timezone' | 'locale' | 'optInStatus' | 'lastSeenAt'>>): Promise<void> {
    const entries = Object.entries(changes);
    if (entries.length === 0) return;
    const sets = entries.map(([key, _], index) => `${camelToSnake(key)} = $${index + 1}`);
    await this.db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${entries.length + 1}`, [
      ...entries.map(([, value]) => value),
      id,
    ]);
  }

  /** Cascades delete across users, conversations, memory, etc. (forget-me mechanism). */
  async deleteById(id: string): Promise<void> {
    await this.db.query('DELETE FROM users WHERE id = $1', [id]);
  }

  private mapRow(row: Record<string, unknown>): User {
    return {
      id: String(row.id),
      phoneNumber: String(row.phone_number),
      displayName: String(row.display_name),
      timezone: String(row.timezone),
      locale: String(row.locale),
      createdAt: String(row.created_at),
      lastSeenAt: String(row.last_seen_at),
      optInStatus: row.opt_in_status as User['optInStatus'],
    };
  }
}

export class RelationshipRepository {
  constructor(private readonly db: Db) {}

  async upsert(relationship: Omit<Relationship, 'updatedAt'>): Promise<Relationship> {
    const row: Relationship = { ...relationship, updatedAt: nowIso() };
    await this.db.query(
      `INSERT INTO relationships (user_id, familiarity_level, trust_score, tone_preference, shared_context, interaction_count, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO UPDATE SET
         familiarity_level = EXCLUDED.familiarity_level,
         trust_score = EXCLUDED.trust_score,
         tone_preference = EXCLUDED.tone_preference,
         shared_context = EXCLUDED.shared_context,
         interaction_count = EXCLUDED.interaction_count,
         updated_at = EXCLUDED.updated_at`,
      [
        row.userId,
        row.familiarityLevel,
        row.trustScore,
        row.tonePreference,
        toJson(row.sharedContext),
        row.interactionCount,
        row.updatedAt,
      ],
    );
    return row;
  }

  async find(userId: string): Promise<Relationship | undefined> {
    const row = firstRow<Record<string, unknown>>(
      (await this.db.query('SELECT * FROM relationships WHERE user_id = $1', [userId])).rows,
    );
    if (!row) return undefined;
    return {
      userId: String(row.user_id),
      familiarityLevel: Number(row.familiarity_level),
      trustScore: Number(row.trust_score),
      tonePreference: String(row.tone_preference),
      sharedContext: parseJson<string[]>(row.shared_context, []),
      interactionCount: Number(row.interaction_count),
      updatedAt: String(row.updated_at),
    };
  }

  async updateScore(userId: string, changes: Partial<Pick<Relationship, 'familiarityLevel' | 'trustScore' | 'tonePreference'>>): Promise<void> {
    const entries = Object.entries(changes);
    if (entries.length === 0) return;
    const sets = entries.map(([key], index) => `${camelToSnake(key)} = $${index + 1}`);
    await this.db.query(`UPDATE relationships SET ${sets.join(', ')}, updated_at = $${entries.length + 1} WHERE user_id = $${entries.length + 2}`, [
      ...entries.map(([, value]) => value),
      nowIso(),
      userId,
    ]);
  }
}

export class InteractionHistoryRepository {
  constructor(private readonly db: Db) {}

  async increment(userId: string, date: string, messages: number, avgResponseTime: number, sentimentTrend: number): Promise<void> {
    await this.db.query(
      `INSERT INTO interaction_history (user_id, date, message_count, avg_response_time, sentiment_trend)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, date) DO UPDATE SET
         message_count = interaction_history.message_count + EXCLUDED.message_count,
         avg_response_time = (interaction_history.avg_response_time * interaction_history.message_count + EXCLUDED.avg_response_time * EXCLUDED.message_count) / (interaction_history.message_count + EXCLUDED.message_count),
         sentiment_trend = interaction_history.sentiment_trend + EXCLUDED.sentiment_trend`,
      [userId, date, messages, avgResponseTime, sentimentTrend],
    );
  }

  async list(userId: string, days = 30): Promise<InteractionHistory[]> {
    const rows = (await this.db.query('SELECT * FROM interaction_history WHERE user_id = $1 ORDER BY date DESC LIMIT $2', [userId, days])).rows;
    return rows.map((row) => ({
      userId: String((row as Record<string, unknown>).user_id),
      date: String((row as Record<string, unknown>).date),
      messageCount: Number((row as Record<string, unknown>).message_count),
      avgResponseTime: Number((row as Record<string, unknown>).avg_response_time),
      sentimentTrend: Number((row as Record<string, unknown>).sentiment_trend),
    }));
  }
}
