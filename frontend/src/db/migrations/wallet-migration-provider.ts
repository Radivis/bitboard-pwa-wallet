import type { MigrationProvider } from 'kysely'
import * as initialWalletSchema from './wallet/20260417120000_initial_wallet_schema'
import * as walletSecretsKdfPhc from './wallet/20260417150000_wallet_secrets_kdf_phc'

export const walletMigrationProvider: MigrationProvider = {
  async getMigrations() {
    return {
      '20260417120000_initial_wallet_schema': initialWalletSchema,
      '20260417150000_wallet_secrets_kdf_phc': walletSecretsKdfPhc,
    }
  },
}
