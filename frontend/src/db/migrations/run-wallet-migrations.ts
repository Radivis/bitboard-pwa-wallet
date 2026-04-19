import type { Kysely } from 'kysely'
import { runMigrationsToLatest } from './run-migrator'
import { walletMigrationProvider } from './wallet-migration-provider'
import { tryWriteWalletMigrationFailureReport } from './wallet-migration-failure-report'
import {
  SCHEMA_MIGRATION_RETRY_DELAY_MS,
  SCHEMA_MIGRATION_RETRY_MAX_ATTEMPTS,
  withRetries,
} from './retry-async'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- wallet migrator accepts evolving schema
export async function runWalletMigrations(db: Kysely<any>): Promise<void> {
  try {
    await withRetries(() => runMigrationsToLatest(db, walletMigrationProvider), {
      maxAttempts: SCHEMA_MIGRATION_RETRY_MAX_ATTEMPTS,
      delayMs: SCHEMA_MIGRATION_RETRY_DELAY_MS,
    })
  } catch (lastError) {
    await tryWriteWalletMigrationFailureReport({
      attempts: SCHEMA_MIGRATION_RETRY_MAX_ATTEMPTS,
      lastError,
    })
    throw lastError
  }
}
