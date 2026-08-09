// DB abstraction contracts — shared by PostgresDb, MemoryDb and SqliteDb.
// Kept in their own module so the three implementations don't import each
// other.

export interface QueryResultLike {
  rows: unknown[];
  rowCount: number | null;
}

export interface Db {
  /** Runs a single query. Never interpolate user input into `text` — use $params. */
  query(text: string, params?: unknown[]): Promise<QueryResultLike>;
  /** Runs several statements inside one transaction. */
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface Tx {
  query(text: string, params?: unknown[]): Promise<QueryResultLike>;
}

/** Storage backend for DataService. */
export type DbMode = 'postgres' | 'memory' | 'sqlite';
