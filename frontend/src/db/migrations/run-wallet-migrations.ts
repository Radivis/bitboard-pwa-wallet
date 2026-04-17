import type { Kysely } from 'kysely'
import { runMigrationsToLatest } from './run-migrator'
import { walletMigrationProvider } from './wallet-migration-provider'
import { tryWriteWalletMigrationFailureReport } from './wallet-migration-failure-report'
import { withRetries } from './retry-async'

/** Retries help with intermittent OPFS / worker / SQLite hiccups. */
export const WALLET_MIGRATION_RETRY_MAX_ATTEMPTS = 3
export const WALLET_MIGRATION_RETRY_DELAY_MS = 2000

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- wallet migrator accepts evolving schema
export async function runWalletMigrations(db: Kysely<any>): Promise<void> {
  try {
    await withRetries(() => runMigrationsToLatest(db, walletMigrationProvider), {
      maxAttempts: WALLET_MIGRATION_RETRY_MAX_ATTEMPTS,
      delayMs: WALLET_MIGRATION_RETRY_DELAY_MS,
    })
  } catch (lastError) {
    await tryWriteWalletMigrationFailureReport({
      attempts: WALLET_MIGRATION_RETRY_MAX_ATTEMPTS,
      lastError,
    })
    throw lastError
  }
}
