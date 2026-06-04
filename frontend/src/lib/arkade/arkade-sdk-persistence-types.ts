/** Wire format version for {@link BitboardArkadeSdkPersistenceV1}. */
export const BITBOARD_ARKADE_SDK_PERSISTENCE_VERSION = 1 as const

/** Snapshot of SDK `InMemoryWalletRepository` public fields. */
export interface SerializedInMemoryWalletRepositoryV1 {
  version: number
  walletState: unknown
  vtxosByAddress: unknown
  utxosByAddress: unknown
  txsByAddress: unknown
}

/** Snapshot of SDK `InMemoryContractRepository` public fields. */
export interface SerializedInMemoryContractRepositoryV1 {
  version: number
  contractData: unknown
  collections: unknown
  contractsByScript: unknown
}

/**
 * Full Arkade SDK local state persisted inside encrypted `wallet_secrets`.
 * Source of truth for VTXOs/contracts when the operator is offline.
 */
export interface BitboardArkadeSdkPersistenceV1 {
  version: typeof BITBOARD_ARKADE_SDK_PERSISTENCE_VERSION
  wallet: SerializedInMemoryWalletRepositoryV1
  contract: SerializedInMemoryContractRepositoryV1
}

/** Max UTF-8 byte length for `sdkPersistenceJson` (VTXO-heavy wallets). */
export const ARKADE_SDK_PERSISTENCE_JSON_MAX_BYTES = 10 * 1024 * 1024
