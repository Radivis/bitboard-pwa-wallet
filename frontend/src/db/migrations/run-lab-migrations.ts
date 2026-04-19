import type { Kysely } from 'kysely'
import { runMigrationsToLatest } from './run-migrator'
import { labMigrationProvider } from './lab-migration-provider'
import {
  SCHEMA_MIGRATION_RETRY_DELAY_MS,
  SCHEMA_MIGRATION_RETRY_MAX_ATTEMPTS,
  withRetries,
} from './retry-async'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lab migrator accepts evolving schema
export async function runLabMigrations(db: Kysely<any>): Promise<void> {
  await withRetries(() => runMigrationsToLatest(db, labMigrationProvider), {
    maxAttempts: SCHEMA_MIGRATION_RETRY_MAX_ATTEMPTS,
    delayMs: SCHEMA_MIGRATION_RETRY_DELAY_MS,
  })
}
