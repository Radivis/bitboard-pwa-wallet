import { Migrator, type MigrationProvider } from 'kysely'
import type { Kysely } from 'kysely'

export const SCHEMA_MIGRATIONS_TABLE = 'schema_migrations'
export const SCHEMA_MIGRATIONS_LOCK_TABLE = 'schema_migrations_lock'

/**
 * Runs Kysely {@link Migrator} with shared table names. Throws on failure
 * (Kysely returns errors in the result set instead of throwing).
 */
export async function runMigrationsToLatest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Migrator runs against evolving schema shapes
  db: Kysely<any>,
  provider: MigrationProvider,
): Promise<void> {
  const migrator = new Migrator({
    db,
    provider,
    migrationTableName: SCHEMA_MIGRATIONS_TABLE,
    migrationLockTableName: SCHEMA_MIGRATIONS_LOCK_TABLE,
  })
  const { error, results } = await migrator.migrateToLatest()
  const failedResult = results?.find((r) => r.status === 'Error')
  if (error) {
    const message = failedResult
      ? `Migration "${failedResult.migrationName}" failed`
      : 'Wallet or lab schema migration failed'
    throw new Error(message, { cause: error })
  }
  if (failedResult) {
    throw new Error(`Migration "${failedResult.migrationName}" failed (unknown error)`)
  }
}
