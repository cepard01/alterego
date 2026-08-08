// Migration runner — applies .sql files from infra/db/migrations in order,
// tracking applied versions in schema_migrations. Each file runs in a
// transaction so a failed migration rolls back atomically.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Db } from './db.types.js';

export interface MigrationRecord {
  version: string;
  appliedAt: string;
}

export async function runMigrations(db: Db, migrationsDir: string): Promise<MigrationRecord[]> {
  await db.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );

  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
  const applied = new Set(
    (await db.query('SELECT version FROM schema_migrations')).rows.map((row) => String((row as { version: string }).version)),
  );

  const records: MigrationRecord[] = [];
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version)) continue;
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    await db.transaction(async (tx) => {
      await tx.query(sql);
      await tx.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
    });
    records.push({ version, appliedAt: new Date().toISOString() });
  }
  return records;
}
