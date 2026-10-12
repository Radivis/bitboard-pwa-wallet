import type { Kysely } from 'kysely'
import { ensureSchemaMigrated, getDatabase } from '@/db/database'
import {
  SCHEMA_MIGRATION_RETRY_DELAY_MS,
  SCHEMA_MIGRATION_RETRY_MAX_ATTEMPTS,
  withRetries,
} from '@/db/migrations/retry-async'
import { tryWriteWalletMigrationFailureReport } from '@/db/migrations/wallet-migration-failure-report'
import type { Database } from '@/db/schema'
import {
  listWalletIdsWithSecrets,
  updateWalletSecretsPayloadWithRetry,
} from '@/db/wallet-persistence'
import { parseHistoricalSignetOnchainChain } from '@/lib/wallet/historical-signet-onchain-chain'
import type { WalletSecretsPayload } from '@/lib/wallet/wallet-domain-types'
import { SIGNET_NETWORK_SPLIT_DATA_MIGRATION_NAME } from './data-migration-names'
import {
  readDeviceDataMigrationResult,
  runDeviceDataMigrations,
} from './device-data-migrations'
import {
  listAppliedWalletDataMigrationNames,
  recordWalletDataMigrationsApplied,
} from './wallet-data-migration-markers'
import {
  WALLET_DATA_MIGRATIONS,
  type WalletDataMigration,
  type WalletDataMigrationContext,
} from './wallet-data-migration-registry'

/**
 * Brings every wallet's encrypted payload up to date. Needs an active wallet
 * secrets session. Must finish before any rail reads a payload, because an
 * unmigrated payload's `signet` rows would be read as public Signet.
 */
export async function runPendingWalletDataMigrations(walletDb: Kysely<Database>): Promise<void> {
  try {
    await withRetries(() => runPendingWalletDataMigrationsOnce(walletDb), {
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

async function runPendingWalletDataMigrationsOnce(walletDb: Kysely<Database>): Promise<void> {
  await runDeviceDataMigrations(walletDb)
  const context = await readWalletDataMigrationContext(walletDb)
  for (const walletId of await listWalletIdsWithSecrets(walletDb)) {
    await migrateWalletIfPending(walletDb, walletId, context)
  }
}

export async function runPendingWalletDataMigrationsForUnlock(): Promise<void> {
  await ensureSchemaMigrated()
  await runPendingWalletDataMigrations(getDatabase())
}

async function readWalletDataMigrationContext(
  walletDb: Kysely<Database>,
): Promise<WalletDataMigrationContext> {
  const historicalSignetOnchainChain = parseHistoricalSignetOnchainChain(
    await readDeviceDataMigrationResult(walletDb, SIGNET_NETWORK_SPLIT_DATA_MIGRATION_NAME),
  )
  if (historicalSignetOnchainChain == null) {
    throw new Error('Signet network split device migration has no valid result')
  }
  return { historicalSignetOnchainChain }
}

async function listPendingWalletDataMigrations(
  walletDb: Kysely<Database>,
  walletId: number,
): Promise<WalletDataMigration[]> {
  const appliedNames = await listAppliedWalletDataMigrationNames(walletDb, walletId)
  return WALLET_DATA_MIGRATIONS.filter((migration) => !appliedNames.has(migration.name))
}

/**
 * Pending migrations are re-read inside the CAS transform, which runs under the
 * wallet writer lock, so a concurrent runner cannot apply the same migration twice.
 * The payload is re-encrypted even when no row changed, so `updated_at` does not
 * reveal whether the wallet held affected data.
 */
async function migrateWalletIfPending(
  walletDb: Kysely<Database>,
  walletId: number,
  context: WalletDataMigrationContext,
): Promise<void> {
  const pendingBeforeLock = await listPendingWalletDataMigrations(walletDb, walletId)
  if (pendingBeforeLock.length === 0) return

  let appliedMigrationNames: string[] = []
  await updateWalletSecretsPayloadWithRetry({
    walletDb,
    walletId,
    transform: async (payload) => {
      const pendingMigrations = await listPendingWalletDataMigrations(walletDb, walletId)
      appliedMigrationNames = pendingMigrations.map((migration) => migration.name)
      return applyWalletDataMigrations(payload, pendingMigrations, context)
    },
    writeAlongsideInTransaction: (transaction) =>
      recordWalletDataMigrationsApplied(transaction, walletId, appliedMigrationNames),
  })
}

function applyWalletDataMigrations(
  payload: WalletSecretsPayload,
  migrations: readonly WalletDataMigration[],
  context: WalletDataMigrationContext,
): WalletSecretsPayload {
  let migratedPayload = payload
  for (const migration of migrations) {
    try {
      migratedPayload = migration.migrate(migratedPayload, context)
    } catch (migrationError) {
      throw new Error(`Migration "${migration.name}" failed`, { cause: migrationError })
    }
  }
  return migratedPayload
}
