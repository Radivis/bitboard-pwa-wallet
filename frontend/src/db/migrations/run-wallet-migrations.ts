import type { Kysely } from 'kysely'
import { runMigrationsToLatest } from './run-migrator'
import { walletMigrationProvider } from './wallet-migration-provider'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- wallet migrator accepts evolving schema
export async function runWalletMigrations(db: Kysely<any>): Promise<void> {
  await runMigrationsToLatest(db, walletMigrationProvider)
}
