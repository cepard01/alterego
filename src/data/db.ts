// DB abstraction — every repository talks to this interface; only this file
// knows the Postgres driver. A tiny in-memory implementation exists for tests.

import { Pool, PoolClient } from 'pg';
import { Redis } from 'ioredis';
import { Logger } from '@alterego/observability';
import { Db, DbMode, QueryResultLike, Tx } from './db.types.js';
import { SqliteDb } from './db-sqlite.js';

/** Postgres-backed Db using a pg Pool. */
export class PostgresDb implements Db {
  private readonly pool: Pool;

  constructor(connectionString: string, private readonly logger?: Logger) {
    this.pool = new Pool({ connectionString, max: 10 });
    this.pool.on('error', (error) => {
      this.logger?.error('postgres pool error', { error: error.message });
    });
  }

  async query(text: string, params?: unknown[]): Promise<QueryResultLike> {
    return this.pool.query(text, params);
  }

  async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn({ query: (text, params) => client.query(text, params) });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * In-memory Db used in tests and in the admin panel's "dry run" mode.
 * Supports a small SQL subset: SELECT/INSERT/UPDATE/DELETE on a JSON store.
 * Every repository in this package is written against this same subset.
 */
export class MemoryDb implements Db {
  /** table name -> rows keyed by 'id' */
  private readonly tables = new Map<string, Map<string, Record<string, unknown>>>();
  private readonly logger?: Logger;

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  seed(table: string, rows: Array<Record<string, unknown>>): void {
    const map = this.tables.get(table) ?? new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      map.set(String(row.id), row);
    }
    this.tables.set(table, map);
  }

  getTable(table: string): Map<string, Record<string, unknown>> {
    return this.tables.get(table) ?? new Map<string, Record<string, unknown>>();
  }

  async query(text: string, params?: unknown[]): Promise<QueryResultLike> {
    const rows = this.execute(text, params ?? []);
    return { rows, rowCount: rows.length };
  }

  async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return fn({ query: (text, params) => this.query(text, params) });
  }

  async close(): Promise<void> {
    // no-op
  }

  private execute(text: string, params: unknown[]): unknown[] {
    const normalized = text.replace(/\s+/g, ' ').trim();
    const insertMatch = /^INSERT INTO (\w+)/i.exec(normalized);
    if (insertMatch) {
      const table = insertMatch[1];
      const columns = /\(([^)]+)\)\s*VALUES/i.exec(normalized)?.[1].split(',').map((c) => c.trim());
      const valuesMatch = /VALUES\s*\(([^)]*)\)/i.exec(normalized);
      if (!columns || !valuesMatch) throw new Error(`MemoryDb: unsupported INSERT: ${normalized}`);
      const valueExprs = valuesMatch[1].split(',').map((v) => v.trim());
      const row: Record<string, unknown> = {};
      columns.forEach((column, index) => {
        row[column] = this.resolveValue(valueExprs[index], params);
      });
      if (row.id === undefined || row.id === null) {
        row.id = `mem-${Math.random().toString(36).slice(2, 10)}`;
      }
      const map = this.tables.get(table) ?? new Map<string, Record<string, unknown>>();

      // Composite-PK ON CONFLICT ... DO UPDATE (single-column key by `id` is
      // the default). Applies to any row whose conflict columns all match.
      const conflictMatch = /ON CONFLICT \(([^)]+)\) DO UPDATE SET (.+)$/i.exec(normalized);
      if (conflictMatch) {
        const conflictColumns = conflictMatch[1].split(',').map((c) => c.trim());
        const updates = conflictMatch[2]
          .split(',')
          .map((pair) => {
            const [column, expr] = pair.split('=').map((s) => s.trim());
            const excludedMatch = /^EXCLUDED\.(\w+)$/i.exec(expr ?? '');
            return { column, excludedColumn: excludedMatch?.[1] };
          })
          .filter((u): u is { column: string; excludedColumn: string } => Boolean(u.column && u.excludedColumn));
        const existingRow = [...map.values()].find((candidate) =>
          conflictColumns.every((column) => candidate[column] === row[column]),
        );
        if (existingRow) {
          for (const update of updates) {
            existingRow[update.column] = row[update.excludedColumn];
          }
          map.set(String(existingRow.id), existingRow);
          this.tables.set(table, map);
          return [existingRow];
        }
      }

      map.set(String(row.id), row);
      this.tables.set(table, map);
      return [row];
    }

    const selectMatch = /^SELECT .* FROM (\w+)/i.exec(normalized);
    if (selectMatch) {
      const table = selectMatch[1];
      const map = this.tables.get(table) ?? new Map<string, Record<string, unknown>>();
      let rows = [...map.values()];
      const whereMatch = /WHERE (.+)$/i.exec(normalized);
      if (whereMatch) {
        rows = rows.filter((row) => this.whereClauseMatches(whereMatch[1], row, params));
      }
      const countMatch = /COUNT\(\s*\*?\s*\)\s+AS\s+(\w+)/i.exec(normalized);
      if (countMatch) {
        return [{ [countMatch[1]]: rows.length }];
      }
      const orderMatch = /ORDER BY (\w+)\s*(ASC|DESC)?/i.exec(normalized);
      if (orderMatch) {
        const key = orderMatch[1];
        const dir = (orderMatch[2] ?? 'ASC').toUpperCase();
        rows = [...rows].sort((a, b) => {
          const va = a[key];
          const vb = b[key];
          const cmp = va === vb ? 0 : va === null || va === undefined ? 1 : vb === null || vb === undefined ? -1 : va < vb ? -1 : 1;
          return dir === 'DESC' ? -cmp : cmp;
        });
      }
      const limitMatch = /LIMIT (\$\d+|\d+)/i.exec(normalized);
      if (limitMatch) {
        const limit = limitMatch[1].startsWith('$')
          ? Number(params[Number(limitMatch[1].slice(1)) - 1])
          : Number(limitMatch[1]);
        rows = rows.slice(0, limit);
      }
      const offsetMatch = /OFFSET (\$\d+|\d+)/i.exec(normalized);
      if (offsetMatch) {
        const offset = offsetMatch[1].startsWith('$')
          ? Number(params[Number(offsetMatch[1].slice(1)) - 1])
          : Number(offsetMatch[1]);
        rows = rows.slice(offset);
      }
      return rows;
    }

    const updateMatch = /^UPDATE (\w+)/i.exec(normalized);
    if (updateMatch) {
      const table = updateMatch[1];
      const map = this.tables.get(table) ?? new Map<string, Record<string, unknown>>();
      const setMatch = /SET (.+?) WHERE/i.exec(normalized);
      const whereMatch = /WHERE (.+)$/i.exec(normalized);
      if (!setMatch) throw new Error(`MemoryDb: unsupported UPDATE: ${normalized}`);
      const affected: unknown[] = [];
      for (const row of map.values()) {
        if (whereMatch && !this.whereClauseMatches(whereMatch[1], row, params)) continue;
for (const assignment of setMatch[1].split(',')) {
          const [key, expr] = assignment.split('=').map((s) => s.trim());
          row[key] = this.resolveUpdateExpression(expr, params, row) ?? this.resolveValue(expr, params);
        }
        affected.push(row);
      }
      return affected;
    }

    const deleteMatch = /^DELETE FROM (\w+)/i.exec(normalized);
    if (deleteMatch) {
      const table = deleteMatch[1];
      const map = this.tables.get(table) ?? new Map<string, Record<string, unknown>>();
      const whereMatch = /WHERE (.+)$/i.exec(normalized);
      const affected: unknown[] = [];
      for (const [key, row] of map) {
        if (whereMatch && !this.whereClauseMatches(whereMatch[1], row, params)) continue;
        map.delete(key);
        affected.push(row);
      }
      return affected;
    }

    if (/^BEGIN|^COMMIT|^ROLLBACK/i.test(normalized)) return [];
    this.logger?.warn('MemoryDb: unsupported SQL ignored', { sql: normalized });
    return [];
  }

  private whereClauseMatches(where: string, row: Record<string, unknown>, params: unknown[]): boolean {
    const orParts = where.split(/ OR /i);
    for (const orPart of orParts) {
      const andParts = orPart.split(/ AND /i);
      const allMatch = andParts.every((condition) => {
        const comparison = /(\w+)\s*(>=|<=|=|>|<|!=)\s*(\$?\d+|'[^']*'|now\(\)|true|false)/i.exec(condition);
        if (comparison) {
          const [, column, operator, rawExpected] = comparison;
          const actual = row[column];
          const expected =
            rawExpected === 'now()'
              ? new Date().toISOString()
              : rawExpected === 'true'
                ? true
                : rawExpected === 'false'
                  ? false
                  : rawExpected.startsWith('$')
                    ? params[Number(rawExpected.slice(1)) - 1]
                    : rawExpected.replace(/^'|'$/g, '');
          switch (operator) {
            case '=':
              return actual === expected || String(actual) === String(expected);
            case '!=':
              return actual !== expected && String(actual) !== String(expected);
            case '>':
              return this.compareValues(actual, expected) > 0;
            case '>=':
              return this.compareValues(actual, expected) >= 0;
            case '<':
              return this.compareValues(actual, expected) < 0;
            case '<=':
              return this.compareValues(actual, expected) <= 0;
          }
        }
        const isNull = /(\w+)\s+IS\s+NULL/i.exec(condition);
        if (isNull) return row[isNull[1]] === null || row[isNull[1]] === undefined;
        const isNotNull = /(\w+)\s+IS\s+NOT\s+NULL/i.exec(condition);
        if (isNotNull) return row[isNotNull[1]] !== null && row[isNotNull[1]] !== undefined;
        const inClause = /(\w+)\s+IN\s*\(([^)]*)\)/i.exec(condition);
        if (inClause) {
          const values = inClause[2].split(',').map((v) =>
            v.trim().startsWith('$') ? String(params[Number(v.trim().slice(1)) - 1]) : v.trim().replace(/^'|'$/g, ''),
          );
          return values.includes(String(row[inClause[1]]));
        }
        return false;
      });
      if (allMatch) return true;
    }
    return false;
  }

  private compareValues(a: unknown, b: unknown): number {
    const numA = Number(a);
    const numB = Number(b);
    if (!Number.isNaN(numA) && !Number.isNaN(numB) && String(a) !== '' && String(b) !== '') {
      return numA - numB;
    }
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  }

  /**
   * Arithmetic update expressions like `usage_frequency = usage_frequency + 1`.
   * Returns undefined when the expression isn't an increment/decrement form.
   */
  private resolveUpdateExpression(expr: string, params: unknown[], row: Record<string, unknown>): unknown {
    const match = /^(\w+)\s*([+-])\s*(\$?\d+(?:\.\d+)?)$/.exec(expr.trim());
    if (!match) return undefined;
    const [, column, operator, rawAmount] = match;
    const amount = rawAmount.startsWith('$') ? Number(params[Number(rawAmount.slice(1)) - 1]) : Number(rawAmount);
    const base = Number(row[column]) || 0;
    return operator === '+' ? base + amount : base - amount;
  }

  private resolveValue(expr: string, params: unknown[]): unknown {
    const trimmed = expr.trim();
    const paramMatch = /^\$(\d+)/.exec(trimmed);
    if (paramMatch) return params[Number(paramMatch[1]) - 1];
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed === 'null') return null;
    if (trimmed === 'now()') return new Date().toISOString();
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1);
    if (trimmed.startsWith("'") && trimmed.endsWith("')")) return trimmed.slice(1, -2);
    return trimmed;
  }
}

/** Creates a Db from a connection string and mode: Postgres, in-memory (tests) or SQLite (local mode). */
export function createDb(connectionString: string, logger?: Logger, mode: DbMode = 'postgres', sqlitePath = './alterego.db'): Db {
  if (mode === 'sqlite') return new SqliteDb(sqlitePath, logger);
  return mode === 'memory' ? new MemoryDb(logger) : new PostgresDb(connectionString, logger);
}

/** Redis connection shared by packages that need low-latency state (conversation memory). */
export function createRedis(url: string): Redis {
  return new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 });
}

