// Repository helpers — id generation and row casting. Ids are generated in
// TypeScript (crypto.randomUUID) rather than RETURNING clauses so the same SQL
// runs identically on Postgres and the in-memory test Db.

import { randomUUID } from 'node:crypto';

export function newId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Parses a jsonb column that may come back as a string (MemoryDb) or object (Postgres). */
export function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function firstRow<T>(rows: unknown[]): T | undefined {
  return rows[0] as T | undefined;
}

export function camelToSnake(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** Returns the numeric value of a COUNT(*) alias from an aggregate query. */
export function countValue(rows: unknown[], alias = 'count'): number {
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? Number(row[alias] ?? 0) : 0;
}
