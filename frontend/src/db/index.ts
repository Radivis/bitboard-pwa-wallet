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
  useLibraryFavorites,
  useSetArticleFavorite,
  useLibraryHistory,
} from './hooks'
export { walletKeys, libraryKeys } from './query-keys'
export type {
  Wallet,
  NewWallet,
  WalletUpdate,
  Setting,
  LibraryHistoryRow,
  NewLibraryHistoryRow,
  LibraryArticleRow,
  NewLibraryArticleRow,
  LibraryArticleUpdate,
} from './schema'
export {
  getFavoriteBySlug,
  getAllFavoriteSlugs,
  setArticleFavorite,
} from './library-articles'
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
