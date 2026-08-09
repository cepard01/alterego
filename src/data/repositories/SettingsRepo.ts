// SettingsRepository — key/value store for panel-tunable settings (LLM
// provider, agent persona, etc.). Values are JSON strings; the schema's
// `settings` table lives in schema-sqlite.ts and 0005_local_settings.sql.

import { Db } from '../DbTypes.js';
import { nowIso } from './Base.js';

export class SettingsRepository {
  constructor(private readonly db: Db) {}

  async get<T>(key: string): Promise<T | undefined> {
    const rows = (await this.db.query('SELECT value FROM settings WHERE key = $1', [key])).rows;
    const value = rows[0] as { value?: string } | undefined;
    if (!value?.value) return undefined;
    try {
      return JSON.parse(value.value) as T;
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.db.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
      [key, JSON.stringify(value ?? null), nowIso()],
    );
  }

  async remove(key: string): Promise<void> {
    await this.db.query('DELETE FROM settings WHERE key = $1', [key]);
  }

  async all(): Promise<Array<{ key: string; value: unknown }>> {
    const rows = (await this.db.query('SELECT key, value FROM settings ORDER BY key')).rows;
    return rows.map((row) => {
      const r = row as { key: string; value?: string };
      try {
        return { key: r.key, value: r.value ? JSON.parse(r.value) : undefined };
      } catch {
        return { key: r.key, value: undefined };
      }
    });
  }
}


