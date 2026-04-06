import type { Kysely } from 'kysely'
import type { Database } from './schema'
import type { KdfVersion } from './schema'
import { encryptData, decryptData } from './encryption'
import {
  parseWalletSecretsJson,
  type DescriptorWalletData,
  type WalletSecrets,
} from '@/lib/wallet-domain-types'

export type { DescriptorWalletData, WalletSecrets }

/** Encrypted blob shape for reading/writing without decryption (used by descriptor-wallet-manager with crypto worker). */
export interface EncryptedWalletSecretsBlob {
  ciphertext: Uint8Array
  iv: Uint8Array
  salt: Uint8Array
  /** 1 = CI, 2 = production. */
  kdfVersion: KdfVersion
}

/**
 * Reads the encrypted wallet secrets row for a wallet (no decryption).
 * Used when delegating decrypt/resolve to the crypto worker.
 *
 * @throws {Error} If no secrets exist for the wallet ID
 */
export async function getWalletSecretsEncrypted(
  walletDb: Kysely<Database>,
  walletId: number
): Promise<EncryptedWalletSecretsBlob> {
  const record = await walletDb
    .selectFrom('wallet_secrets')
    .select(['encrypted_data', 'iv', 'salt', 'kdf_version'])
    .where('wallet_id', '=', walletId)
    .executeTakeFirst()

  if (!record) {
    throw new Error(`Wallet secrets for wallet ${walletId} not found`)
  }

  return {
    ciphertext: record.encrypted_data,
    iv: record.iv,
    salt: record.salt,
    kdfVersion: record.kdf_version as KdfVersion,
  }
}

/**
 * Writes encrypted wallet secrets for a wallet (no encryption on main thread).
 * Used after crypto worker returns encryptedBlobToStore from resolveDescriptorWallet or updateDescriptorWalletChangeset.
 *
 * @throws {Error} If the wallet ID does not exist in the `wallets` table
 */
export async function putWalletSecretsEncrypted(
  walletDb: Kysely<Database>,
  walletId: number,
  encrypted: EncryptedWalletSecretsBlob
): Promise<void> {
  await assertWalletExists(walletDb, walletId)

  const now = new Date().toISOString()
  const kdfVersion = encrypted.kdfVersion
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
        kdf_version: kdfVersion,
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
        kdf_version: kdfVersion,
        created_at: now,
        updated_at: now,
      })
      .execute()
  }
}

export type PutWalletSecretsEncryptedFn = (
  db: Kysely<Database>,
  walletId: number,
  encrypted: EncryptedWalletSecretsBlob
) => Promise<void>

/**
 * Inserts a wallet row via the given callback, then persists encrypted secrets.
 * If the secrets write fails, the wallet row is removed and the error is rethrown,
 * so the wallet list never contains an entry without secrets.
 *
 * @param walletDb - Kysely wallet database instance
 * @param insertWalletRow - Callback that inserts the wallet row and returns the new wallet_id
 * @param encryptedBlob - Encrypted blob to store (from crypto worker)
 * @param putSecrets - Secrets writer (default: putWalletSecretsEncrypted). Inject for tests.
 * @returns The new wallet_id on success
 */
export async function persistNewWalletWithSecrets(params: {
  walletDb: Kysely<Database>
  insertWalletRow: () => Promise<number>
  encryptedBlob: EncryptedWalletSecretsBlob
  putSecrets?: PutWalletSecretsEncryptedFn
}): Promise<number> {
  const {
    walletDb,
    insertWalletRow,
    encryptedBlob,
    putSecrets = putWalletSecretsEncrypted,
  } = params
  const walletId = await insertWalletRow()
  try {
    await putSecrets(walletDb, walletId, encryptedBlob)
    return walletId
  } catch (err) {
    await walletDb.deleteFrom('wallets').where('wallet_id', '=', walletId).execute()
    throw err
  }
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
export async function saveWalletSecrets(params: {
  walletDb: Kysely<Database>
  password: string
  walletId: number
  secrets: WalletSecrets
}): Promise<void> {
  const { walletDb, password, walletId, secrets } = params
  await assertWalletExists(walletDb, walletId)

  const plaintext = JSON.stringify(secrets)
  const encrypted = await encryptData(password, plaintext)

  const now = new Date().toISOString()
  const kdfVersion = encrypted.kdfVersion
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
        kdf_version: kdfVersion,
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
        kdf_version: kdfVersion,
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
    kdfVersion: record.kdf_version as KdfVersion,
  })

  return parseWalletSecretsJson(plaintext)
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

/**
 * Returns wallet IDs that have a `wallet_secrets` row, ascending order.
 */
export async function listWalletIdsWithSecrets(
  walletDb: Kysely<Database>,
): Promise<number[]> {
  const rows = await walletDb
    .selectFrom('wallet_secrets')
    .select('wallet_id')
    .orderBy('wallet_id', 'asc')
    .execute()
  return rows.map((r) => r.wallet_id)
}

/**
 * Decrypts every wallet secrets blob with `oldPassword`, re-encrypts with `newPassword`,
 * and persists all rows in a single database transaction (all-or-nothing).
 *
 * @throws {Error} If there are no rows in `wallet_secrets`, or decryption fails (wrong password).
 */
export async function reencryptAllWalletSecretsWithNewPassword(params: {
  walletDb: Kysely<Database>
  oldPassword: string
  newPassword: string
}): Promise<void> {
  const { walletDb, oldPassword, newPassword } = params

  const walletIds = await listWalletIdsWithSecrets(walletDb)
  if (walletIds.length === 0) {
    throw new Error('No wallet secrets to re-encrypt')
  }

  const decrypted: { walletId: number; secrets: WalletSecrets }[] = []
  for (const walletId of walletIds) {
    const secrets = await loadWalletSecrets(walletDb, oldPassword, walletId)
    decrypted.push({ walletId, secrets })
  }

  const blobs: { walletId: number; encrypted: EncryptedWalletSecretsBlob }[] = []
  for (const { walletId, secrets } of decrypted) {
    const plaintext = JSON.stringify(secrets)
    const encrypted = await encryptData(newPassword, plaintext)
    blobs.push({
      walletId,
      encrypted: {
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        salt: encrypted.salt,
        kdfVersion: encrypted.kdfVersion,
      },
    })
  }

  await walletDb.transaction().execute(async (trx) => {
    for (const { walletId, encrypted } of blobs) {
      await putWalletSecretsEncrypted(trx, walletId, encrypted)
    }
  })
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
