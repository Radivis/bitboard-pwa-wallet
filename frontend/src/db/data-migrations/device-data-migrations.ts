import type { Kysely } from 'kysely'
import type { Database } from '@/db/schema'
import {
  parseHistoricalSignetOnchainChain,
  setConfiguredHistoricalSignetOnchainChain,
} from '@/lib/wallet/historical-signet-onchain-chain'
import { migrateSignetNetworkSplitDeviceSettings } from '@/lib/wallet/signet-network-split-migration'
import { SIGNET_NETWORK_SPLIT_DATA_MIGRATION_NAME } from './data-migration-names'

interface DeviceDataMigration {
  name: string
  /** Rewrites plaintext device settings. The returned result is stored in plaintext. */
  run: (transaction: Kysely<Database>) => Promise<string | null>
  /** Loads the stored result into main-thread memory on every app start. */
  hydrate: (result: string | null) => void
}

const DEVICE_DATA_MIGRATIONS: readonly DeviceDataMigration[] = [
  {
    name: SIGNET_NETWORK_SPLIT_DATA_MIGRATION_NAME,
    run: migrateSignetNetworkSplitDeviceSettings,
    hydrate: (result) =>
      setConfiguredHistoricalSignetOnchainChain(parseHistoricalSignetOnchainChain(result)),
  },
]

/** Runs every device data migration that has not run yet, then hydrates all results. */
export async function runDeviceDataMigrations(walletDb: Kysely<Database>): Promise<void> {
  for (const migration of DEVICE_DATA_MIGRATIONS) {
    const result = await applyDeviceDataMigrationOnce(walletDb, migration)
    migration.hydrate(result)
  }
}

export async function readDeviceDataMigrationResult(
  walletDb: Kysely<Database>,
  migrationName: string,
): Promise<string | null> {
  const migrationRow = await walletDb
    .selectFrom('device_data_migrations')
    .select('result')
    .where('migration_name', '=', migrationName)
    .executeTakeFirst()
  return migrationRow?.result ?? null
}

async function applyDeviceDataMigrationOnce(
  walletDb: Kysely<Database>,
  migration: DeviceDataMigration,
): Promise<string | null> {
  return walletDb.transaction().execute(async (transaction) => {
    const appliedRow = await transaction
      .selectFrom('device_data_migrations')
      .select('result')
      .where('migration_name', '=', migration.name)
      .executeTakeFirst()
    if (appliedRow) return appliedRow.result

    const result = await migration.run(transaction)
    await transaction
      .insertInto('device_data_migrations')
      .values({
        migration_name: migration.name,
        applied_at: new Date().toISOString(),
        result,
      })
      .execute()
    return result
  })
}
