// MikroOrmDbContext — lazy MikroORM wrapper that implements the Db interface.
// Schema creation and EntityManager init happen on first query/transaction.

import { MikroORM } from '@mikro-orm/sqlite';
import { Db, QueryResultLike, Tx } from './db.types.js';
import { createMikroOrm } from './mikro-orm.js';

export class MikroOrmDbContext implements Db {
  private em: any = null;
  private orm: any = null;
  private initPromise: Promise<void> | null = null;

  constructor(
    private readonly sqlitePath: string,
    private readonly logger?: { debug?(message: string, meta?: Record<string, unknown>): void; warn?(message: string, meta?: Record<string, unknown>): void },
  ) {}

  private async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const result = await createMikroOrm({ sqlitePath: this.sqlitePath });
        this.em = result.em;
        this.orm = result.orm;
      })().catch((error) => {
        this.initPromise = null;
        throw error;
      });
    }
    await this.initPromise;
  }

  async query(text: string, params?: unknown[]): Promise<QueryResultLike> {
    await this.ensureInitialized();
    const { sql, bind } = translate(text, params ?? []);
    const result = await this.em.execute(sql, bind);
    if (Array.isArray(result)) {
      return { rows: result as unknown[], rowCount: result.length };
    }
    if (result && typeof result === 'object' && 'rows' in result) {
      return result as QueryResultLike;
    }
    return { rows: [], rowCount: 0 };
  }

  async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    await this.ensureInitialized();
    return this.em.transactional(async () => {
      const tx: Tx = {
        query: (text, params) => this.query(text, params),
      };
      return fn(tx);
    });
  }

  async close(): Promise<void> {
    if (!this.orm) return;
    await this.orm.close();
    this.orm = null;
    this.em = null;
    this.initPromise = null;
  }
}

function translate(sql: string, params: unknown[]): { sql: string; bind: unknown[] } {
  const bind: unknown[] = [];
  let out = '';
  let i = 0;
  const n = sql.length;

  while (i < n) {
    if (sql[i] === '$' && /[0-9]/.test(sql[i + 1] ?? '')) {
      let j = i + 1;
      while (j < n && /[0-9]/.test(sql[j])) j++;
      const index = Number(sql.slice(i + 1, j)) - 1;
      bind.push(index >= 0 && index < params.length ? params[index] : null);
      out += '?';
      i = j;
      continue;
    }
    out += sql[i];
    i++;
  }

  return { sql: out, bind };
}
