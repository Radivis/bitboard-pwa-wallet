import type { Kysely } from 'kysely'
import type { Database } from './schema'
import { encryptData, decryptData } from './encryption'
import type { AddressType, BitcoinNetwork } from '@/workers/crypto-types'

/** Data for a single descriptor wallet (one network + address type + account combo). */
export interface DescriptorWalletData {
  network: BitcoinNetwork
  addressType: AddressType
  accountId: number
  externalDescriptor: string
  internalDescriptor: string
  changeSet: string
}

/** Sensitive wallet data that must be stored encrypted. */
export interface WalletSecrets {
  mnemonic: string
  descriptorWallets: DescriptorWalletData[]
}

/**
 * Encrypts and persists wallet secrets to the `wallet_secrets` table.
 *
 * If secrets already exist for the given wallet, they are re-encrypted and updated.
 *
 * @param walletDb - Kysely wallet database instance
 * @param password - User password for encryption
 * @param walletId - ID of the wallet in the `wallets` table
 * @param secrets - Sensitive wallet data to encrypt and store
 *
 * @throws {Error} If the wallet ID does not exist in the `wallets` table
 */
export async function saveWalletSecrets(
  walletDb: Kysely<Database>,
  password: string,
  walletId: number,
  secrets: WalletSecrets
): Promise<void> {
  await assertWalletExists(walletDb, walletId)

  const plaintext = JSON.stringify(secrets)
  const encrypted = await encryptData(password, plaintext)

  const now = new Date().toISOString()
  const existing = await walletDb
    .selectFrom('wallet_secrets')
    .select('wallet_secrets_id')
    .where('wallet_id', '=', walletId)
    .executeTakeFirst()

  if (existing) {
    await walletDb
      .updateTable('wallet_secrets')
      .set({
        encrypted_data: encrypted.ciphertext,
        iv: encrypted.iv,
        salt: encrypted.salt,
        updated_at: now,
      })
      .where('wallet_secrets_id', '=', existing.wallet_secrets_id)
      .execute()
  } else {
    await walletDb
      .insertInto('wallet_secrets')
      .values({
        wallet_id: walletId,
        encrypted_data: encrypted.ciphertext,
        iv: encrypted.iv,
        salt: encrypted.salt,
        created_at: now,
        updated_at: now,
      })
      .execute()
  }
}

/**
 * Loads and decrypts wallet secrets from the `wallet_secrets` table.
 *
 * @param walletDb - Kysely wallet database instance
 * @param password - User password for decryption (must match encryption password)
 * @param walletId - ID of the wallet whose secrets to load
 * @returns Decrypted wallet secrets
 *
 * @throws {Error} If no secrets exist for the wallet ID
 * @throws {Error} If the password is incorrect or data is corrupted
 */
export async function loadWalletSecrets(
  walletDb: Kysely<Database>,
  password: string,
  walletId: number
): Promise<WalletSecrets> {
  const record = await walletDb
    .selectFrom('wallet_secrets')
    .selectAll()
    .where('wallet_id', '=', walletId)
    .executeTakeFirst()

  if (!record) {
    throw new Error(`Wallet secrets for wallet ${walletId} not found`)
  }

  const plaintext = await decryptData(password, {
    ciphertext: record.encrypted_data,
    iv: record.iv,
    salt: record.salt,
  })

  return JSON.parse(plaintext)
}

/**
 * Deletes encrypted wallet secrets from the `wallet_secrets` table.
 *
 * No-op if no secrets exist for the given wallet.
 */
export async function deleteWalletSecrets(
  walletDb: Kysely<Database>,
  walletId: number
): Promise<void> {
  await walletDb
    .deleteFrom('wallet_secrets')
    .where('wallet_id', '=', walletId)
    .execute()
}

async function assertWalletExists(walletDb: Kysely<Database>, walletId: number): Promise<void> {
  const wallet = await walletDb
    .selectFrom('wallets')
    .select('wallet_id')
    .where('wallet_id', '=', walletId)
    .executeTakeFirst()

  if (!wallet) {
    throw new Error(`Wallet with id ${walletId} not found`)
  }
}
