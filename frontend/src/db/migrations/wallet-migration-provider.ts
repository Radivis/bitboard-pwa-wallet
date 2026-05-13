import type { MigrationProvider } from 'kysely/migration'
import * as initialWalletSchema from './wallet/20260417120000_initial_wallet_schema'

export const walletMigrationProvider: MigrationProvider = {
  async getMigrations() {
    return {
      '20260417120000_initial_wallet_schema': initialWalletSchema,
    }
  },
}
