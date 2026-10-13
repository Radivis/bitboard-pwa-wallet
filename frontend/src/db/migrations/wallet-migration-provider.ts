import type { MigrationProvider } from 'kysely/migration'
import * as initialWalletSchema from './wallet/20260417120000_initial_wallet_schema'
import * as dataMigrationTables from './wallet/20261011120000_data_migration_tables'

export const walletMigrationProvider: MigrationProvider = {
  async getMigrations() {
    return {
      '20260417120000_initial_wallet_schema': initialWalletSchema,
      '20261011120000_data_migration_tables': dataMigrationTables,
    }
  },
}
