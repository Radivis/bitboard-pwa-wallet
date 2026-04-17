import type { Kysely } from 'kysely'
import { runMigrationsToLatest } from './run-migrator'
import { labMigrationProvider } from './lab-migration-provider'
import { withRetries } from './retry-async'

/** Same retry policy as wallet; lab data is non-critical and can be reset in the UI. */
const LAB_MIGRATION_RETRY_MAX_ATTEMPTS = 3
const LAB_MIGRATION_RETRY_DELAY_MS = 2000

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lab migrator accepts evolving schema
export async function runLabMigrations(db: Kysely<any>): Promise<void> {
  await withRetries(() => runMigrationsToLatest(db, labMigrationProvider), {
    maxAttempts: LAB_MIGRATION_RETRY_MAX_ATTEMPTS,
    delayMs: LAB_MIGRATION_RETRY_DELAY_MS,
  })
}
