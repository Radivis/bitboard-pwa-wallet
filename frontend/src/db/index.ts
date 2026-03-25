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
export type {
  Wallet,
  NewWallet,
  WalletUpdate,
  Setting,
  LibraryHistoryRow,
  NewLibraryHistoryRow,
} from './schema'
export {
  recordLibraryHistoryAccess,
  listLibraryHistory,
  pruneLibraryHistory,
  LIBRARY_HISTORY_MAX_ROWS,
} from './library-history'
export {
  saveWalletSecrets,
  loadWalletSecrets,
  deleteWalletSecrets,
  getWalletSecretsEncrypted,
  putWalletSecretsEncrypted,
  persistNewWalletWithSecrets,
} from './wallet-persistence'
export type {
  WalletSecrets,
  DescriptorWalletData,
  EncryptedWalletSecretsBlob,
} from './wallet-persistence'
export {
  getLabDatabase,
  ensureLabMigrated,
  destroyLabDatabase,
} from './lab-database'
export type { Block, Utxo, LabAddress } from './lab-schema'
