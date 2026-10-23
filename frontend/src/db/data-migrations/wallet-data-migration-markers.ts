import type { Kysely } from 'kysely'
import type { Database } from '@/db/schema'
import { WALLET_DATA_MIGRATIONS } from './wallet-data-migration-registry'

export async function listAppliedWalletDataMigrationNames(
  walletDb: Kysely<Database>,
  walletId: number,
): Promise<Set<string>> {
  const markerRows = await walletDb
    .selectFrom('wallet_data_migrations')
    .select('migration_name')
    .where('wallet_id', '=', walletId)
    .execute()
  return new Set(markerRows.map((markerRow) => markerRow.migration_name))
}

export async function recordWalletDataMigrationsApplied(
  walletDb: Kysely<Database>,
  walletId: number,
  migrationNames: readonly string[],
): Promise<void> {
  if (migrationNames.length === 0) return
  const appliedAt = new Date().toISOString()
  await walletDb
    .insertInto('wallet_data_migrations')
    .values(
      migrationNames.map((migrationName) => ({
        wallet_id: walletId,
        migration_name: migrationName,
        applied_at: appliedAt,
      })),
    )
    .execute()
}

/** For new wallets: their payload is created in the current format. */
export async function recordAllWalletDataMigrationsApplied(
  walletDb: Kysely<Database>,
  walletId: number,
): Promise<void> {
  await recordWalletDataMigrationsApplied(
    walletDb,
    walletId,
    WALLET_DATA_MIGRATIONS.map((migration) => migration.name),
  )
}

export async function deleteWalletDataMigrationMarkers(
  walletDb: Kysely<Database>,
  walletId: number,
): Promise<void> {
  await walletDb.deleteFrom('wallet_data_migrations').where('wallet_id', '=', walletId).execute()
}
