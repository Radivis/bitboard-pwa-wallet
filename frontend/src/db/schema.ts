import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely'
import type { KdfVersion } from '@/lib/encrypted-blob-types'

export type { KdfVersion }

/** SQLite BOOLEAN columns: bindings use `0`/`1`, not JS `boolean`, in some drivers. */
export const SQLITE_FALSE = 0
export const SQLITE_TRUE = 1

export interface Database {
  wallets: WalletsTable
  settings: SettingsTable
  wallet_secrets: WalletSecretsTable
  library_history: LibraryHistoryTable
  library_articles: LibraryArticlesTable
}

interface WalletsTable {
  wallet_id: Generated<number>
  name: string
  created_at: string
  /** SQLite BOOLEAN; JS `boolean` when selected, bind `0`/`1` on insert/update (driver limitation). Omit on insert to use DB default `false`. */
  no_mnemonic_backup: ColumnType<boolean, number | undefined, number>
}

export type Wallet = Selectable<WalletsTable>
export type NewWallet = Insertable<WalletsTable>
export type WalletUpdate = Updateable<WalletsTable>

interface SettingsTable {
  key: string
  value: string
}

export type Setting = Selectable<SettingsTable>

interface WalletSecretsTable {
  wallet_secrets_id: Generated<number>
  wallet_id: number
  /** Monotonic row version for optimistic-concurrency writes. */
  revision: number
  /** Payload ciphertext: JSON of WalletSecretsPayload only. */
  encrypted_data: Uint8Array
  iv: Uint8Array
  salt: Uint8Array
  kdf_version: KdfVersion
  /** Separate mnemonic ciphertext (split storage layout). */
  mnemonic_encrypted_data: Uint8Array
  mnemonic_iv: Uint8Array
  mnemonic_salt: Uint8Array
  mnemonic_kdf_version: KdfVersion
  created_at: string
  updated_at: string
}

export type WalletSecret = Selectable<WalletSecretsTable>
export type NewWalletSecret = Insertable<WalletSecretsTable>
export type WalletSecretUpdate = Updateable<WalletSecretsTable>

interface LibraryHistoryTable {
  library_history_id: Generated<number>
  accessed_at: string
  access_path: string
}

export type LibraryHistoryRow = Selectable<LibraryHistoryTable>
export type NewLibraryHistoryRow = Insertable<LibraryHistoryTable>

interface LibraryArticlesTable {
  article_slug: string
  /** SQLite BOOLEAN; JS `boolean` when selected, bind `0`/`1` on insert/update (driver limitation). */
  is_favorite: ColumnType<boolean, number, number>
}

export type LibraryArticleRow = Selectable<LibraryArticlesTable>
export type NewLibraryArticleRow = Insertable<LibraryArticlesTable>
export type LibraryArticleUpdate = Updateable<LibraryArticlesTable>
