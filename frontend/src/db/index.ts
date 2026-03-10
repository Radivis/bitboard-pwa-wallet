export {
  getDatabase,
  ensureMigrated,
  destroyDatabase,
  checkDatabaseHealth,
} from './database'
export type { DatabaseHealthResult } from './database'
export { sqliteStorage } from './storage-adapter'
export {
  useWallets,
  useWallet,
  useAddWallet,
  useUpdateWallet,
  useDeleteWallet,
} from './hooks'
export { walletKeys } from './query-keys'
export type { Wallet, NewWallet, WalletUpdate, Setting } from './schema'
export {
  saveWalletSecrets,
  loadWalletSecrets,
  deleteWalletSecrets,
} from './wallet-persistence'
export type { WalletSecrets, DescriptorWalletData } from './wallet-persistence'
export {
  getRegtestDatabase,
  ensureRegtestMigrated,
  destroyRegtestDatabase,
} from './regtest-database'
export type { Block, Utxo, RegtestAddress } from './regtest-schema'
