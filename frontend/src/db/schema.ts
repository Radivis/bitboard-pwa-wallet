import type { Generated, Insertable, Selectable, Updateable } from 'kysely'

export interface Database {
  wallets: WalletsTable
  settings: SettingsTable
  wallet_secrets: WalletSecretsTable
}

interface WalletsTable {
  wallet_id: Generated<number>
  name: string
  created_at: string
}

export type Wallet = Selectable<WalletsTable>
export type NewWallet = Insertable<WalletsTable>
export type WalletUpdate = Updateable<WalletsTable>

interface SettingsTable {
  key: string
  value: string
}

export type Setting = Selectable<SettingsTable>

/** KDF version: 1 = CI (2 iter, 1 par), 2 = production (3 iter, 4 par). */
export type KdfVersion = 1 | 2

interface WalletSecretsTable {
  wallet_secrets_id: Generated<number>
  wallet_id: number
  encrypted_data: Uint8Array
  iv: Uint8Array
  salt: Uint8Array
  kdf_version: KdfVersion
  created_at: string
  updated_at: string
}

export type WalletSecret = Selectable<WalletSecretsTable>
export type NewWalletSecret = Insertable<WalletSecretsTable>
export type WalletSecretUpdate = Updateable<WalletSecretsTable>
