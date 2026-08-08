// Repositories for v3 identity entities: IdentityProfile, TimelineEvent,
// InventoryItem, Goal, CalendarEntry.

import { Db } from '../db.js';
import { CalendarEntry, Goal, IdentityProfile, InventoryItem, TimelineEvent } from '../types.js';
import { camelToSnake, newId, nowIso, parseJson, firstRow } from './base.js';

export class IdentityProfileRepository {
  constructor(private readonly db: Db) {}

  async upsert(profile: Omit<IdentityProfile, 'id' | 'createdAt' | 'lastEvolvedAt' | 'version'> & {
    id?: string;
    version?: number;
  }): Promise<IdentityProfile> {
    const row: IdentityProfile = {
      id: profile.id ?? newId(),
      agentId: profile.agentId,
      name: profile.name,
      age: profile.age,
      backgroundSummary: profile.backgroundSummary,
      education: profile.education,
      occupation: profile.occupation,
      hometown: profile.hometown,
      interests: profile.interests,
      values: profile.values,
      beliefs: profile.beliefs,
      skills: profile.skills,
      familySummary: profile.familySummary,
      version: profile.version ?? 1,
      createdAt: nowIso(),
      lastEvolvedAt: nowIso(),
    };
    await this.db.query(
      `INSERT INTO identity_profiles (id, agent_id, name, age, background_summary, education, occupation, hometown, interests, values, beliefs, skills, family_summary, version, created_at, last_evolved_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $15, $16)
       ON CONFLICT (agent_id) DO UPDATE SET
         name = EXCLUDED.name, age = EXCLUDED.age, background_summary = EXCLUDED.background_summary,
         education = EXCLUDED.education, occupation = EXCLUDED.occupation, hometown = EXCLUDED.hometown,
         interests = EXCLUDED.interests, values = EXCLUDED.values, beliefs = EXCLUDED.beliefs,
         skills = EXCLUDED.skills, family_summary = EXCLUDED.family_summary,
         version = EXCLUDED.version, last_evolved_at = EXCLUDED.last_evolved_at`,
      [
        row.id,
        row.agentId,
        row.name,
        row.age,
        row.backgroundSummary,
        JSON.stringify(row.education),
        row.occupation,
        row.hometown,
        JSON.stringify(row.interests),
        JSON.stringify(row.values),
        JSON.stringify(row.beliefs),
        JSON.stringify(row.skills),
        row.familySummary,
        row.version,
        row.createdAt,
        row.lastEvolvedAt,
      ],
    );
    return row;
  }

  async findByAgent(agentId: string): Promise<IdentityProfile | undefined> {
    const row = firstRow<Record<string, unknown>>(
      (await this.db.query('SELECT * FROM identity_profiles WHERE agent_id = $1', [agentId])).rows,
    );
    return row ? this.mapRow(row) : undefined;
  }

  async updateField(agentId: string, field: keyof Pick<IdentityProfile, 'name' | 'age' | 'occupation' | 'hometown' | 'backgroundSummary' | 'familySummary'>, value: string | number): Promise<void> {
    await this.db.query(
      `UPDATE identity_profiles SET ${camelToSnake(field)} = $1, version = version + 1, last_evolved_at = $2 WHERE agent_id = $3`,
      [value, nowIso(), agentId],
    );
  }

  async updateListField(agentId: string, field: 'education' | 'interests' | 'values' | 'beliefs' | 'skills', value: string[]): Promise<void> {
    await this.db.query(
      `UPDATE identity_profiles SET ${camelToSnake(field)} = $1::jsonb, version = version + 1, last_evolved_at = $2 WHERE agent_id = $3`,
      [JSON.stringify(value), nowIso(), agentId],
    );
  }

  private mapRow(row: Record<string, unknown>): IdentityProfile {
    return {
      id: String(row.id),
      agentId: String(row.agent_id),
      name: String(row.name),
      age: Number(row.age),
      backgroundSummary: String(row.background_summary),
      education: parseJson<string[]>(row.education, []),
      occupation: String(row.occupation),
      hometown: String(row.hometown),
      interests: parseJson<string[]>(row.interests, []),
      values: parseJson<string[]>(row.values, []),
      beliefs: parseJson<string[]>(row.beliefs, []),
      skills: parseJson<string[]>(row.skills, []),
      familySummary: String(row.family_summary),
      version: Number(row.version),
      createdAt: String(row.created_at),
      lastEvolvedAt: String(row.last_evolved_at),
    };
  }
}

export class TimelineEventRepository {
  constructor(private readonly db: Db) {}

  async create(event: Omit<TimelineEvent, 'id'> & { id?: string }): Promise<TimelineEvent> {
    const row: TimelineEvent = { ...event, id: event.id ?? newId() };
    await this.db.query(
      `INSERT INTO timeline_events (id, agent_id, event_type, title, description, occurred_at, occurred_range_end, related_identity_fields, related_memory_ids, importance_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)`,
      [
        row.id,
        row.agentId,
        row.eventType,
        row.title,
        row.description,
        row.occurredAt,
        row.occurredRangeEnd ?? null,
        JSON.stringify(row.relatedIdentityFields),
        JSON.stringify(row.relatedMemoryIds),
        row.importanceScore,
      ],
    );
    return row;
  }

  /** Events after a date — the backbone of context reconstruction for long gaps. */
  async listSince(agentId: string, since: string, limit = 50): Promise<TimelineEvent[]> {
    const rows = (
      await this.db.query(
        'SELECT * FROM timeline_events WHERE agent_id = $1 AND occurred_at > $2 ORDER BY occurred_at DESC LIMIT $3',
        [agentId, since, limit],
      )
    ).rows;
    return rows.map((row) => this.mapRow(row as Record<string, unknown>));
  }

  async findById(id: string): Promise<TimelineEvent | undefined> {
    const row = firstRow<Record<string, unknown>>(
      (await this.db.query('SELECT * FROM timeline_events WHERE id = $1', [id])).rows,
    );
    return row ? this.mapRow(row) : undefined;
  }

  private mapRow(row: Record<string, unknown>): TimelineEvent {
    return {
      id: String(row.id),
      agentId: String(row.agent_id),
      eventType: row.event_type as TimelineEvent['eventType'],
      title: String(row.title),
      description: String(row.description),
      occurredAt: String(row.occurred_at),
      occurredRangeEnd: row.occurred_range_end === null ? undefined : String(row.occurred_range_end),
      relatedIdentityFields: parseJson<string[]>(row.related_identity_fields, []),
      relatedMemoryIds: parseJson<string[]>(row.related_memory_ids, []),
      importanceScore: Number(row.importance_score),
    };
  }
}

export class InventoryItemRepository {
  constructor(private readonly db: Db) {}

  async create(item: Omit<InventoryItem, 'id'> & { id?: string }): Promise<InventoryItem> {
    const row: InventoryItem = { ...item, id: item.id ?? newId() };
    await this.db.query(
      `INSERT INTO inventory_items (id, agent_id, category, name, description, acquired_at, sentiment, linked_goal_id, still_owned)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        row.id,
        row.agentId,
        row.category,
        row.name,
        row.description,
        row.acquiredAt ?? null,
        row.sentiment,
        row.linkedGoalId ?? null,
        row.stillOwned,
      ],
    );
    return row;
  }

  async listByAgent(agentId: string, onlyOwned = true): Promise<InventoryItem[]> {
    const rows = onlyOwned
      ? (
          await this.db.query('SELECT * FROM inventory_items WHERE agent_id = $1 AND still_owned = true', [agentId])
        ).rows
      : (await this.db.query('SELECT * FROM inventory_items WHERE agent_id = $1', [agentId])).rows;
    return rows.map((row) => this.mapRow(row as Record<string, unknown>));
  }

  private mapRow(row: Record<string, unknown>): InventoryItem {
    return {
      id: String(row.id),
      agentId: String(row.agent_id),
      category: row.category as InventoryItem['category'],
      name: String(row.name),
      description: String(row.description),
      acquiredAt: row.acquired_at === null ? null : String(row.acquired_at),
      sentiment: row.sentiment as InventoryItem['sentiment'],
      linkedGoalId: row.linked_goal_id === null ? undefined : String(row.linked_goal_id),
      stillOwned: Boolean(row.still_owned),
    };
  }
}

export class GoalRepository {
  constructor(private readonly db: Db) {}

  async create(goal: Omit<Goal, 'id' | 'createdAt' | 'resolvedAt' | 'resolutionLink' | 'progress'> & {
    id?: string;
    progress?: number;
  }): Promise<Goal> {
    const row: Goal = {
      id: goal.id ?? newId(),
      agentId: goal.agentId,
      category: goal.category,
      title: goal.title,
      description: goal.description,
      status: goal.status ?? 'active',
      progress: goal.progress ?? 0,
      targetDate: goal.targetDate,
      createdAt: nowIso(),
      resolvedAt: null,
      resolutionLink: null,
    };
    await this.db.query(
      `INSERT INTO goals (id, agent_id, category, title, description, status, progress, target_date, created_at, resolved_at, resolution_link)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        row.id,
        row.agentId,
        row.category,
        row.title,
        row.description,
        row.status,
        row.progress,
        row.targetDate ?? null,
        row.createdAt,
        null,
        null,
      ],
    );
    return row;
  }

  async listActive(agentId: string): Promise<Goal[]> {
    const rows = (
      await this.db.query(
        "SELECT * FROM goals WHERE agent_id = $1 AND status IN ('active', 'paused') ORDER BY created_at ASC",
        [agentId],
      )
    ).rows;
    return rows.map((row) => this.mapRow(row as Record<string, unknown>));
  }

  async findById(id: string): Promise<Goal | undefined> {
    const row = firstRow<Record<string, unknown>>(
      (await this.db.query('SELECT * FROM goals WHERE id = $1', [id])).rows,
    );
    return row ? this.mapRow(row) : undefined;
  }

  async updateProgress(id: string, progress: number): Promise<void> {
    await this.db.query('UPDATE goals SET progress = $1 WHERE id = $2', [progress, id]);
  }

  async resolve(id: string, status: 'achieved' | 'abandoned', resolutionLink: Goal['resolutionLink']): Promise<void> {
    await this.db.query(
      'UPDATE goals SET status = $1, resolved_at = $2, resolution_link = $3::jsonb, progress = 1 WHERE id = $4',
      [status, nowIso(), JSON.stringify(resolutionLink), id],
    );
  }

  private mapRow(row: Record<string, unknown>): Goal {
    return {
      id: String(row.id),
      agentId: String(row.agent_id),
      category: row.category as Goal['category'],
      title: String(row.title),
      description: String(row.description),
      status: row.status as Goal['status'],
      progress: Number(row.progress),
      targetDate: row.target_date === null ? undefined : String(row.target_date),
      createdAt: String(row.created_at),
      resolvedAt: row.resolved_at === null ? null : String(row.resolved_at),
      resolutionLink: row.resolution_link === null ? null : parseJson<Goal['resolutionLink']>(row.resolution_link, null),
    };
  }
}

export class CalendarEntryRepository {
  constructor(private readonly db: Db) {}

  async create(entry: Omit<CalendarEntry, 'id'> & { id?: string }): Promise<CalendarEntry> {
    const row: CalendarEntry = { ...entry, id: entry.id ?? newId() };
    await this.db.query(
      `INSERT INTO calendar_entries (id, agent_id, type, title, category, recurrence_rule, start_at, end_at, world_state_override)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        row.id,
        row.agentId,
        row.type,
        row.title,
        row.category,
        row.recurrenceRule ?? null,
        row.startAt,
        row.endAt,
        JSON.stringify(row.worldStateOverride),
      ],
    );
    return row;
  }

  /** Entries active at a given instant — checked first by the World State tick (v3 §5). */
  async findActiveAt(instant: string, agentId: string): Promise<CalendarEntry[]> {
    const rows = (
      await this.db.query(
        'SELECT * FROM calendar_entries WHERE agent_id = $1 AND start_at <= $2 AND end_at > $2',
        [agentId, instant],
      )
    ).rows;
    return rows.map((row) => this.mapRow(row as Record<string, unknown>));
  }

  private mapRow(row: Record<string, unknown>): CalendarEntry {
    return {
      id: String(row.id),
      agentId: String(row.agent_id),
      type: row.type as CalendarEntry['type'],
      title: String(row.title),
      category: row.category as CalendarEntry['category'],
      recurrenceRule: row.recurrence_rule === null ? undefined : String(row.recurrence_rule),
      startAt: String(row.start_at),
      endAt: String(row.end_at),
      worldStateOverride: parseJson<CalendarEntry['worldStateOverride']>(row.world_state_override, {
        activity: 'idle',
        availabilityDelta: 0,
      }),
    };
  }
}
