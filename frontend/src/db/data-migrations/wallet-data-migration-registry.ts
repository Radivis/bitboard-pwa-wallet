import type { HistoricalSignetOnchainChain } from '@/lib/wallet/historical-signet-onchain-chain'
import {
  applySignetNetworkSplitToPayload,
  repairMutinynetArkadeOperatorUrl,
} from '@/lib/wallet/signet-network-split-migration'
import type { WalletSecretsPayload } from '@/lib/wallet/wallet-domain-types'
import {
  MUTINYNET_ARKADE_OPERATOR_URL_REPAIR_DATA_MIGRATION_NAME,
  SIGNET_NETWORK_SPLIT_DATA_MIGRATION_NAME,
} from './data-migration-names'

/** Device-level facts that wallet migrations may depend on. */
export interface WalletDataMigrationContext {
  historicalSignetOnchainChain: HistoricalSignetOnchainChain
}

export interface WalletDataMigration {
  name: string
  migrate: (
    payload: WalletSecretsPayload,
    context: WalletDataMigrationContext,
  ) => WalletSecretsPayload
}

/** Applied in this order. Append new migrations at the end. */
export const WALLET_DATA_MIGRATIONS: readonly WalletDataMigration[] = [
  {
    name: SIGNET_NETWORK_SPLIT_DATA_MIGRATION_NAME,
    migrate: (payload, context) =>
      applySignetNetworkSplitToPayload(payload, context.historicalSignetOnchainChain),
  },
  {
    name: MUTINYNET_ARKADE_OPERATOR_URL_REPAIR_DATA_MIGRATION_NAME,
    migrate: (payload) => repairMutinynetArkadeOperatorUrl(payload),
  },
]
