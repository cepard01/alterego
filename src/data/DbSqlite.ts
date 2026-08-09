// SqliteDb — file-backed local persistence using node:sqlite (built into
// Node 22.5+, stable in 24). No native build step, no server process. Implements
// the same Db interface as PostgresDb/MemoryDb, so every repository works
// unchanged. The SQL translator bridges the small Postgres dialect the
// repositories use: $n params, ::jsonb/::vector casts, now(), and the
// pgvector similarity operator (which degrades to recency ordering).

import { DatabaseSync } from 'node:sqlite';
import { Logger } from '@alterego/observability';
import { Db, QueryResultLike, Tx } from './DbTypes.js';
import { createSchema } from './SchemaSqlite.js';

const CAST_RE = /^::(jsonb|vector|text|int|float|bool|bigint)/i;

function bindParam(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return value;
}

/**
 * Translates repository SQL into SQLite SQL: replaces $n placeholders with
 * ?, strips ::cast suffixes, and rewrites the pgvector cosine-similarity
 * ordering into a recency ordering (there is no vector index in SQLite).
 * Never sees user input — repos interpolate nothing into `text`.
 */
export function translate(sql: string, params: unknown[]): { sql: string; bind: unknown[] } {
  const bind: unknown[] = [];
  let out = '';
  let i = 0;
  let inString = false;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];
    if (inString) {
      out += ch;
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          out += "'";
          i++;
        } else {
          inString = false;
        }
      }
      i++;
      continue;
    }
    if (ch === "'") {
      inString = true;
      out += ch;
      i++;
      continue;
    }
    if (ch === '$' && /[0-9]/.test(sql[i + 1] ?? '')) {
      let j = i + 1;
      while (j < n && /[0-9]/.test(sql[j])) j++;
      const index = Number(sql.slice(i + 1, j)) - 1;
      bind.push(bindParam(index >= 0 && index < params.length ? params[index] : null));
      out += '?';
      i = j;
      continue;
    }
    const cast = CAST_RE.exec(sql.slice(i, i + 12));
    if (cast) {
      i += cast[0].length;
      continue;
    }
    out += ch;
    i++;
  }

  out = out.replace(/embedding_vector\s*<=>\s*\?\s+ASC/gi, 'created_at DESC');
  return { sql: out, bind };
}

export class SqliteDb implements Db {
  private readonly db: DatabaseSync;
  private readonly logger?: Logger;
  private txChain: Promise<unknown> = Promise.resolve();

  constructor(filename: string, logger?: Logger) {
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = OFF');
    this.db.function('now', () => new Date().toISOString());
    createSchema(this.db);
    this.logger = logger;
  }

  async query(text: string, params?: unknown[]): Promise<QueryResultLike> {
    const { sql, bind } = translate(text, params ?? []);
    const statement = this.db.prepare(sql);
    const rows = (statement as any).all(...bind) as Array<Record<string, unknown>>;
    const plain = rows.map((row: Record<string, unknown>) => ({ ...row }));
    return { rows: plain, rowCount: plain.length };
  }

  async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const run = this.txChain.then(async () => {
      this.db.exec('BEGIN');
      try {
        const result = await fn({ query: (text, params) => this.query(text, params) });
        this.db.exec('COMMIT');
        return result;
      } catch (error) {
        try {
          this.db.exec('ROLLBACK');
        } catch {
          // no active transaction — nothing to roll back
        }
        throw error;
      }
    });
    this.txChain = run.catch(() => undefined);
    return run;
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

