// MikroORM bootstrap — initializes the ORM, creates the schema, and exposes
// the EntityManager. Used by DataService for the SQLite/local path.

import { defineConfig, MikroORM } from '@mikro-orm/sqlite';
import { EntityManager } from '@mikro-orm/core';
import { Entities } from './entities/index.js';

export interface MikroOrmConfig {
  /** SQLite file path or ':memory:' for tests. */
  sqlitePath: string;
  /** If true, drop and recreate the schema on boot (tests only). */
  reset?: boolean;
}

export async function createMikroOrm(config: MikroOrmConfig): Promise<{ orm: MikroORM; em: EntityManager }> {
  const orm = (await MikroORM.init(
    defineConfig({
      dbName: config.sqlitePath,
      entities: Entities as never,
      debug: process.env.NODE_ENV === 'development',
      allowGlobalContext: true,
    }),
  )) as unknown as MikroORM & { em: EntityManager };

  if (config.reset) {
    const sg = orm.config.getExtension('@mikro-orm/schema-generator') as {
      update(): Promise<void>;
      dropSchema(): Promise<void>;
    };
    await sg.dropSchema();
    await sg.update();
  } else {
    const sg = orm.config.getExtension('@mikro-orm/schema-generator') as {
      update(): Promise<void>;
    };
    await sg.update();
  }

  return { orm, em: orm.em };
}
