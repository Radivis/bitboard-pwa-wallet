export { awaitInFlightWalletSecretsWrites } from './wallet-secrets-write-tracker'
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
  useWalletNoMnemonicBackupFlag,
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
  loadWalletSecretsPayload,
  deleteWalletSecrets,
  getWalletSecretsEncrypted,
  getWalletSecretsEncryptedWithRevision,
  putSplitWalletSecretsEncrypted,
  putSplitWalletSecretsEncryptedIfRevisionMatches,
  updateWalletSecretsPayloadWithRetry,
  updateWalletSecretsEncryptedPayloadWithRetry,
  WALLET_SECRETS_CAS_MAX_RETRIES,
  persistNewWalletWithSecrets,
  listWalletIdsWithSecrets,
  reencryptAllWalletSecretsWithNewPassword,
} from './wallet-persistence'
export {
  setWalletNoMnemonicBackupFlag,
  clearWalletNoMnemonicBackupFlag,
  walletHasNoMnemonicBackupFlag,
  noMnemonicBackupSettingsKey,
} from './no-mnemonic-backup-settings'
export {
  NEAR_ZERO_WRAPPER_PASSWORD,
  NEAR_ZERO_SETTINGS_KEY_ACTIVE,
  NEAR_ZERO_SETTINGS_KEY_WRAPPED,
  serializeEncryptedBlobForSettings,
  deserializeEncryptedBlobFromSettings,
  generateAndPersistNearZeroSession,
  tryLoadNearZeroSessionIntoMemory,
  clearNearZeroSecuritySettings,
  isNearZeroSecurityConfiguredInDb,
  upgradeNearZeroToUserPassword,
} from './near-zero-security'
export type {
  WalletSecrets,
  WalletSecretsPayload,
  DescriptorWalletData,
  EncryptedWalletSecretsBlob,
  SplitWalletSecretsEncryptedBlobs,
  SplitWalletSecretsEncryptedWithRevision,
} from './wallet-persistence'
export {
  getLabDatabase,
  ensureLabMigrated,
  destroyLabDatabase,
} from './lab-database'
export type { Block, Utxo, LabAddress } from './lab-schema'
