import { Kysely, SqliteDialect } from 'kysely'
import Database from 'better-sqlite3'
import type { Database as DbSchema } from './schema'
import { runWalletMigrations } from './migrations/run-wallet-migrations'

export async function createTestDatabase(): Promise<Kysely<DbSchema>> {
  const db = new Kysely<DbSchema>({
    dialect: new SqliteDialect({
      database: new Database(':memory:'),
    }),
  })
  await runWalletMigrations(db)
  return db
}
