// Repositories for behavior-related entities: Personality, BehaviorProfile,
// Sticker, Reminder, TaskQueue.

import { Db } from '../db.types.js';
import { BehaviorProfile, Personality, Reminder, Sticker, TaskQueue } from '../types.js';
import { camelToSnake, newId, nowIso, parseJson, firstRow } from './base.js';

export class PersonalityRepository {
  constructor(private readonly db: Db) {}

  async create(personality: Omit<Personality, 'id' | 'updatedAt' | 'version'> & { id?: string }): Promise<Personality> {
    const row: Personality = {
      id: personality.id ?? newId(),
      name: personality.name,
      tone: personality.tone,
      humorStyle: personality.humorStyle,
      verbosity: personality.verbosity,
      emojiFrequency: personality.emojiFrequency,
      vocabularyProfile: personality.vocabularyProfile,
      quirks: personality.quirks,
      version: 1,
      updatedAt: nowIso(),
    };
    await this.db.query(
      `INSERT INTO personalities (id, name, tone, humor_style, verbosity, emoji_frequency, vocabulary_profile, quirks, version, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)`,
      [
        row.id,
        row.name,
        row.tone,
        row.humorStyle,
        row.verbosity,
        row.emojiFrequency,
        JSON.stringify(row.vocabularyProfile),
        JSON.stringify(row.quirks),
        row.version,
        row.updatedAt,
      ],
    );
    return row;
  }

  async findByName(name: string): Promise<Personality | undefined> {
    const row = firstRow<Record<string, unknown>>(
      (await this.db.query('SELECT * FROM personalities WHERE name = $1', [name])).rows,
    );
    return row ? this.mapRow(row) : undefined;
  }

  async findLatest(): Promise<Personality | undefined> {
    const row = firstRow<Record<string, unknown>>(
      (await this.db.query('SELECT * FROM personalities ORDER BY updated_at DESC LIMIT 1')).rows,
    );
    return row ? this.mapRow(row) : undefined;
  }

  async update(id: string, changes: Partial<Pick<Personality, 'tone' | 'humorStyle' | 'verbosity' | 'emojiFrequency' | 'vocabularyProfile' | 'quirks'>>): Promise<void> {
    const entries = Object.entries(changes);
    if (entries.length === 0) return;
    const sets = entries.map(([key], index) => `${camelToSnake(key)} = $${index + 1}::jsonb`);
    await this.db.query(`UPDATE personalities SET ${sets.join(', ')}, version = version + 1, updated_at = $${entries.length + 1} WHERE id = $${entries.length + 2}`, [
      ...entries.map(([, value]) => JSON.stringify(value)),
      nowIso(),
      id,
    ]);
  }

  private mapRow(row: Record<string, unknown>): Personality {
    return {
      id: String(row.id),
      name: String(row.name),
      tone: String(row.tone),
      humorStyle: String(row.humor_style),
      verbosity: Number(row.verbosity),
      emojiFrequency: Number(row.emoji_frequency),
      vocabularyProfile: parseJson<Record<string, unknown>>(row.vocabulary_profile, {}),
      quirks: parseJson<string[]>(row.quirks, []),
      version: Number(row.version),
      updatedAt: String(row.updated_at),
    };
  }
}

export class BehaviorProfileRepository {
  constructor(private readonly db: Db) {}

  async create(profile: Omit<BehaviorProfile, 'id' | 'updatedAt'> & { id?: string }): Promise<BehaviorProfile> {
    const row: BehaviorProfile = {
      id: profile.id ?? newId(),
      name: profile.name,
      replyLatencyCurve: profile.replyLatencyCurve,
      ignoreProbability: profile.ignoreProbability,
      multiMessageProbability: profile.multiMessageProbability,
      topicChangeTolerance: profile.topicChangeTolerance,
      questionAskingRate: profile.questionAskingRate,
      activityCurve: profile.activityCurve,
      updatedAt: nowIso(),
    };
    await this.db.query(
      `INSERT INTO behavior_profiles (id, name, reply_latency_curve, ignore_probability, multi_message_probability, topic_change_tolerance, question_asking_rate, activity_curve, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8::jsonb, $9)`,
      [
        row.id,
        row.name,
        JSON.stringify(row.replyLatencyCurve),
        row.ignoreProbability,
        row.multiMessageProbability,
        row.topicChangeTolerance,
        row.questionAskingRate,
        JSON.stringify(row.activityCurve),
        row.updatedAt,
      ],
    );
    return row;
  }

  async findByName(name: string): Promise<BehaviorProfile | undefined> {
    const row = firstRow<Record<string, unknown>>(
      (await this.db.query('SELECT * FROM behavior_profiles WHERE name = $1', [name])).rows,
    );
    return row ? this.mapRow(row) : undefined;
  }

  async update(id: string, changes: Partial<Pick<BehaviorProfile, 'ignoreProbability' | 'multiMessageProbability' | 'topicChangeTolerance' | 'questionAskingRate' | 'replyLatencyCurve' | 'activityCurve'>>): Promise<void> {
    const entries = Object.entries(changes);
    if (entries.length === 0) return;
    const sets = entries.map(([key], index) => `${camelToSnake(key)} = $${index + 1}::jsonb`);
    await this.db.query(`UPDATE behavior_profiles SET ${sets.join(', ')}, updated_at = $${entries.length + 1} WHERE id = $${entries.length + 2}`, [
      ...entries.map(([, value]) => JSON.stringify(value)),
      nowIso(),
      id,
    ]);
  }

  private mapRow(row: Record<string, unknown>): BehaviorProfile {
    return {
      id: String(row.id),
      name: String(row.name),
      replyLatencyCurve: parseJson<Record<string, unknown>>(row.reply_latency_curve, {}),
      ignoreProbability: Number(row.ignore_probability),
      multiMessageProbability: Number(row.multi_message_probability),
      topicChangeTolerance: Number(row.topic_change_tolerance),
      questionAskingRate: Number(row.question_asking_rate),
      activityCurve: parseJson<Record<string, unknown>>(row.activity_curve, {}),
      updatedAt: String(row.updated_at),
    };
  }
}

export class StickerRepository {
  constructor(private readonly db: Db) {}

  async create(sticker: Omit<Sticker, 'id' | 'usageFrequency' | 'lastUsedAt'> & { id?: string }): Promise<Sticker> {
    const row: Sticker = {
      id: sticker.id ?? newId(),
      packId: sticker.packId,
      fileUrl: sticker.fileUrl,
      emotionTags: sticker.emotionTags,
      intentTags: sticker.intentTags,
      humorLevel: sticker.humorLevel,
      contextTags: sticker.contextTags,
      usageFrequency: 0,
      replyProbabilityWeight: sticker.replyProbabilityWeight,
      preferredContactIds: sticker.preferredContactIds,
      lastUsedAt: null,
    };
    await this.db.query(
      `INSERT INTO stickers (id, pack_id, file_url, emotion_tags, intent_tags, humor_level, context_tags, usage_frequency, reply_probability_weight, preferred_contact_ids, last_used_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7::jsonb, $8, $9, $10::jsonb, $11)`,
      [
        row.id,
        row.packId,
        row.fileUrl,
        JSON.stringify(row.emotionTags),
        JSON.stringify(row.intentTags),
        row.humorLevel,
        JSON.stringify(row.contextTags),
        row.usageFrequency,
        row.replyProbabilityWeight,
        JSON.stringify(row.preferredContactIds),
        null,
      ],
    );
    return row;
  }

  async list(): Promise<Sticker[]> {
    const rows = (await this.db.query('SELECT * FROM stickers')).rows;
    return rows.map((row) => this.mapRow(row as Record<string, unknown>));
  }

  async registerUsage(id: string): Promise<void> {
    await this.db.query('UPDATE stickers SET usage_frequency = usage_frequency + 1, last_used_at = $1 WHERE id = $2', [
      nowIso(),
      id,
    ]);
  }

  private mapRow(row: Record<string, unknown>): Sticker {
    return {
      id: String(row.id),
      packId: String(row.pack_id),
      fileUrl: String(row.file_url),
      emotionTags: parseJson<string[]>(row.emotion_tags, []),
      intentTags: parseJson<string[]>(row.intent_tags, []),
      humorLevel: Number(row.humor_level),
      contextTags: parseJson<string[]>(row.context_tags, []),
      usageFrequency: Number(row.usage_frequency),
      replyProbabilityWeight: Number(row.reply_probability_weight),
      preferredContactIds: parseJson<string[]>(row.preferred_contact_ids, []),
      lastUsedAt: row.last_used_at === null ? null : String(row.last_used_at),
    };
  }
}

export class ReminderRepository {
  constructor(private readonly db: Db) {}

  async create(reminder: Omit<Reminder, 'id' | 'createdAt' | 'status'> & { id?: string }): Promise<Reminder> {
    const row: Reminder = {
      id: reminder.id ?? newId(),
      userId: reminder.userId,
      triggerAt: reminder.triggerAt,
      payload: reminder.payload,
      status: 'pending',
      createdAt: nowIso(),
    };
    await this.db.query(
      `INSERT INTO reminders (id, user_id, trigger_at, payload, status, created_at) VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
      [row.id, row.userId, row.triggerAt, JSON.stringify(row.payload), row.status, row.createdAt],
    );
    return row;
  }

  async findDue(now: string, limit = 50): Promise<Reminder[]> {
    const rows = (
      await this.db.query("SELECT * FROM reminders WHERE status = 'pending' AND trigger_at <= $1 ORDER BY trigger_at ASC LIMIT $2", [now, limit])
    ).rows;
    return rows.map((row) => this.mapRow(row as Record<string, unknown>));
  }

  async listByUser(userId: string, limit = 100): Promise<Reminder[]> {
    const rows = (
      await this.db.query('SELECT * FROM reminders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [userId, limit])
    ).rows;
    return rows.map((row) => this.mapRow(row as Record<string, unknown>));
  }

  async deleteByUser(userId: string): Promise<void> {
    await this.db.query('DELETE FROM reminders WHERE user_id = $1', [userId]);
  }

  async setStatus(id: string, status: Reminder['status']): Promise<void> {
    await this.db.query('UPDATE reminders SET status = $1 WHERE id = $2', [status, id]);
  }

  private mapRow(row: Record<string, unknown>): Reminder {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      triggerAt: String(row.trigger_at),
      payload: parseJson<Record<string, unknown>>(row.payload, {}),
      status: row.status as Reminder['status'],
      createdAt: String(row.created_at),
    };
  }
}

export class TaskQueueRepository {
  constructor(private readonly db: Db) {}

  async enqueue(task: { type: string; payload: Record<string, unknown>; runAt?: string; maxRetries?: number }): Promise<TaskQueue> {
    const row: TaskQueue = {
      id: newId(),
      type: task.type,
      payload: task.payload,
      runAt: task.runAt ?? nowIso(),
      status: 'pending',
      retryCount: 0,
      maxRetries: task.maxRetries ?? 3,
      updatedAt: nowIso(),
    };
    await this.db.query(
      `INSERT INTO task_queue (id, type, payload, run_at, status, retry_count, max_retries, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)`,
      [row.id, row.type, JSON.stringify(row.payload), row.runAt, row.status, row.retryCount, row.maxRetries, row.updatedAt],
    );
    return row;
  }

  async claimDue(now: string, limit = 20): Promise<TaskQueue[]> {
    const rows = (
      await this.db.query(
        "SELECT * FROM task_queue WHERE status = 'pending' AND run_at <= $1 ORDER BY run_at ASC LIMIT $2",
        [now, limit],
      )
    ).rows;
    const tasks = rows.map((row) => this.mapRow(row as Record<string, unknown>));
    for (const task of tasks) {
      await this.db.query("UPDATE task_queue SET status = 'running', updated_at = $1 WHERE id = $2", [nowIso(), task.id]);
    }
    return tasks;
  }

  async complete(id: string): Promise<void> {
    await this.db.query("UPDATE task_queue SET status = 'completed', updated_at = $1 WHERE id = $2", [nowIso(), id]);
  }

  async fail(id: string, error: string, retry = true): Promise<void> {
    if (retry) {
      await this.db.query(
        "UPDATE task_queue SET status = 'pending', retry_count = retry_count + 1, error = $1, run_at = $2, updated_at = $3 WHERE id = $4",
        [error, new Date(Date.now() + 60_000).toISOString(), nowIso(), id],
      );
    } else {
      await this.db.query("UPDATE task_queue SET status = 'failed', error = $1, updated_at = $2 WHERE id = $3", [
        error,
        nowIso(),
        id,
      ]);
    }
  }

  private mapRow(row: Record<string, unknown>): TaskQueue {
    return {
      id: String(row.id),
      type: String(row.type),
      payload: parseJson<Record<string, unknown>>(row.payload, {}),
      runAt: String(row.run_at),
      status: row.status as TaskQueue['status'],
      retryCount: Number(row.retry_count),
      maxRetries: Number(row.max_retries),
      error: row.error === null ? undefined : String(row.error),
      updatedAt: String(row.updated_at),
    };
  }
}
