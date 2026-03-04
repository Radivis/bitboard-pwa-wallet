import { Kysely, SqliteDialect } from 'kysely'
import Database from 'better-sqlite3'
import type { Database as DbSchema } from './schema'
import { migrateToLatest } from './migrations'

export async function createTestDatabase(): Promise<Kysely<DbSchema>> {
  const db = new Kysely<DbSchema>({
    dialect: new SqliteDialect({
      database: new Database(':memory:'),
    }),
  })
  await migrateToLatest(db)
  return db
}
