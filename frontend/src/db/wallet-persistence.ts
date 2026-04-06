import type { Kysely } from 'kysely'
import type { Database } from './schema'
import type { KdfVersion } from './schema'
import { encryptData, decryptData } from './encryption'
import {
  assembleWalletSecrets,
  parseWalletPayloadJson,
  type DescriptorWalletData,
  type WalletSecrets,
  type WalletSecretsPayload,
} from '@/lib/wallet-domain-types'

export type { DescriptorWalletData, WalletSecrets }
export type { WalletSecretsPayload } from '@/lib/wallet-domain-types'

/** Encrypted blob shape for reading/writing without decryption (used by descriptor-wallet-manager with crypto worker). */
export interface EncryptedWalletSecretsBlob {
  ciphertext: Uint8Array
  iv: Uint8Array
  salt: Uint8Array
  /** 1 = CI, 2 = production. */
  kdfVersion: KdfVersion
}

/** Encrypted wallet row: payload ciphertext (WalletSecretsPayload JSON) and separate mnemonic ciphertext. */
export interface SplitWalletSecretsEncryptedBlobs {
  payload: EncryptedWalletSecretsBlob
  mnemonic: EncryptedWalletSecretsBlob
}

function rowToPayloadBlob(record: {
  encrypted_data: Uint8Array
  iv: Uint8Array
  salt: Uint8Array
  kdf_version: number
}): EncryptedWalletSecretsBlob {
  return {
    ciphertext: record.encrypted_data,
    iv: record.iv,
    salt: record.salt,
    kdfVersion: record.kdf_version as KdfVersion,
  }
}

function rowToMnemonicBlob(record: {
  wallet_id: number
  mnemonic_encrypted_data: Uint8Array
  mnemonic_iv: Uint8Array
  mnemonic_salt: Uint8Array
  mnemonic_kdf_version: number
}): EncryptedWalletSecretsBlob {
  return {
    ciphertext: record.mnemonic_encrypted_data,
    iv: record.mnemonic_iv,
    salt: record.mnemonic_salt,
    kdfVersion: record.mnemonic_kdf_version as KdfVersion,
  }
}

/** Reads encrypted wallet secrets for a wallet (no decryption). Requires split payload + mnemonic columns. */
export async function getWalletSecretsEncrypted(
  walletDb: Kysely<Database>,
  walletId: number
): Promise<SplitWalletSecretsEncryptedBlobs> {
  const record = await walletDb
    .selectFrom('wallet_secrets')
    .select([
      'wallet_id',
      'encrypted_data',
      'iv',
      'salt',
      'kdf_version',
      'mnemonic_encrypted_data',
      'mnemonic_iv',
      'mnemonic_salt',
      'mnemonic_kdf_version',
    ])
    .where('wallet_id', '=', walletId)
    .executeTakeFirst()

  if (!record) {
    throw new Error(`Wallet secrets for wallet ${walletId} not found`)
  }

  return {
    payload: rowToPayloadBlob(record),
    mnemonic: rowToMnemonicBlob(record),
  }
}

export type PutSplitWalletSecretsEncryptedInput = {
  payload: EncryptedWalletSecretsBlob
  /** When set, updates mnemonic columns; omit to leave them unchanged (payload-only update). */
  mnemonic?: EncryptedWalletSecretsBlob
}

/**
 * Writes encrypted split blobs. When `mnemonic` is omitted, mnemonic columns are not updated.
 */
export async function putSplitWalletSecretsEncrypted(
  walletDb: Kysely<Database>,
  walletId: number,
  blobs: PutSplitWalletSecretsEncryptedInput,
): Promise<void> {
  await assertWalletExists(walletDb, walletId)

  const now = new Date().toISOString()
  const kdfVersion = blobs.payload.kdfVersion
  const existing = await walletDb
    .selectFrom('wallet_secrets')
    .select('wallet_secrets_id')
    .where('wallet_id', '=', walletId)
    .executeTakeFirst()

  const baseSet = {
    encrypted_data: blobs.payload.ciphertext,
    iv: blobs.payload.iv,
    salt: blobs.payload.salt,
    kdf_version: kdfVersion,
    updated_at: now,
  }

  const mnemonicSet =
    blobs.mnemonic !== undefined
      ? {
          mnemonic_encrypted_data: blobs.mnemonic.ciphertext,
          mnemonic_iv: blobs.mnemonic.iv,
          mnemonic_salt: blobs.mnemonic.salt,
          mnemonic_kdf_version: blobs.mnemonic.kdfVersion,
        }
      : {}

  if (existing) {
    await walletDb
      .updateTable('wallet_secrets')
      .set({ ...baseSet, ...mnemonicSet })
      .where('wallet_secrets_id', '=', existing.wallet_secrets_id)
      .execute()
  } else {
    if (blobs.mnemonic === undefined) {
      throw new Error('New wallet secrets row requires both payload and mnemonic ciphertexts')
    }
    const m = blobs.mnemonic
    await walletDb
      .insertInto('wallet_secrets')
      .values({
        wallet_id: walletId,
        encrypted_data: blobs.payload.ciphertext,
        iv: blobs.payload.iv,
        salt: blobs.payload.salt,
        kdf_version: kdfVersion,
        mnemonic_encrypted_data: m.ciphertext,
        mnemonic_iv: m.iv,
        mnemonic_salt: m.salt,
        mnemonic_kdf_version: m.kdfVersion,
        created_at: now,
        updated_at: now,
      })
      .execute()
  }
}

/**
 * Inserts a wallet row via the given callback, then persists encrypted secrets (split format).
 */
export async function persistNewWalletWithSecrets(params: {
  walletDb: Kysely<Database>
  insertWalletRow: () => Promise<number>
  encryptedBlobs: SplitWalletSecretsEncryptedBlobs
  putSecrets?: (
    db: Kysely<Database>,
    walletId: number,
    blobs: PutSplitWalletSecretsEncryptedInput,
  ) => Promise<void>
}): Promise<number> {
  const {
    walletDb,
    insertWalletRow,
    encryptedBlobs,
    putSecrets = putSplitWalletSecretsEncrypted,
  } = params
  const walletId = await insertWalletRow()
  try {
    await putSecrets(walletDb, walletId, {
      payload: encryptedBlobs.payload,
      mnemonic: encryptedBlobs.mnemonic,
    })
    return walletId
  } catch (err) {
    await walletDb.deleteFrom('wallets').where('wallet_id', '=', walletId).execute()
    throw err
  }
}

/**
 * Encrypts and persists wallet secrets in split format.
 */
export async function saveWalletSecrets(params: {
  walletDb: Kysely<Database>
  password: string
  walletId: number
  secrets: WalletSecrets
}): Promise<void> {
  const { walletDb, password, walletId, secrets } = params
  await assertWalletExists(walletDb, walletId)

  const payload: WalletSecretsPayload = {
    descriptorWallets: secrets.descriptorWallets,
    lightningNwcConnections: secrets.lightningNwcConnections,
  }
  const payloadEnc = await encryptData(password, JSON.stringify(payload))
  const mnemonicEnc = await encryptData(password, secrets.mnemonic)

  await putSplitWalletSecretsEncrypted(walletDb, walletId, {
    payload: {
      ciphertext: payloadEnc.ciphertext,
      iv: payloadEnc.iv,
      salt: payloadEnc.salt,
      kdfVersion: payloadEnc.kdfVersion,
    },
    mnemonic: {
      ciphertext: mnemonicEnc.ciphertext,
      iv: mnemonicEnc.iv,
      salt: mnemonicEnc.salt,
      kdfVersion: mnemonicEnc.kdfVersion,
    },
  })
}

/**
 * Loads and decrypts wallet payload only (no mnemonic). Requires split-format row.
 */
export async function loadWalletSecretsPayload(
  walletDb: Kysely<Database>,
  password: string,
  walletId: number,
): Promise<WalletSecretsPayload> {
  const record = await walletDb
    .selectFrom('wallet_secrets')
    .select([
      'wallet_id',
      'encrypted_data',
      'iv',
      'salt',
      'kdf_version',
      'mnemonic_encrypted_data',
      'mnemonic_iv',
      'mnemonic_salt',
      'mnemonic_kdf_version',
    ])
    .where('wallet_id', '=', walletId)
    .executeTakeFirst()

  if (!record) {
    throw new Error(`Wallet secrets for wallet ${walletId} not found`)
  }
  rowToMnemonicBlob(record)

  const plaintext = await decryptData(password, {
    ciphertext: record.encrypted_data,
    iv: record.iv,
    salt: record.salt,
    kdfVersion: record.kdf_version as KdfVersion,
  })
  return parseWalletPayloadJson(plaintext)
}

/**
 * Loads and decrypts wallet secrets from the `wallet_secrets` table.
 */
export async function loadWalletSecrets(
  walletDb: Kysely<Database>,
  password: string,
  walletId: number,
): Promise<WalletSecrets> {
  const record = await walletDb
    .selectFrom('wallet_secrets')
    .select([
      'encrypted_data',
      'iv',
      'salt',
      'kdf_version',
      'mnemonic_encrypted_data',
      'mnemonic_iv',
      'mnemonic_salt',
      'mnemonic_kdf_version',
    ])
    .where('wallet_id', '=', walletId)
    .executeTakeFirst()

  if (!record) {
    throw new Error(`Wallet secrets for wallet ${walletId} not found`)
  }
  const mnemonicBlob = rowToMnemonicBlob({
    wallet_id: walletId,
    mnemonic_encrypted_data: record.mnemonic_encrypted_data,
    mnemonic_iv: record.mnemonic_iv,
    mnemonic_salt: record.mnemonic_salt,
    mnemonic_kdf_version: record.mnemonic_kdf_version,
  })

  const payloadPlaintext = await decryptData(password, {
    ciphertext: record.encrypted_data,
    iv: record.iv,
    salt: record.salt,
    kdfVersion: record.kdf_version as KdfVersion,
  })
  const mnemonicPlaintext = await decryptData(password, {
    ciphertext: mnemonicBlob.ciphertext,
    iv: mnemonicBlob.iv,
    salt: mnemonicBlob.salt,
    kdfVersion: mnemonicBlob.kdfVersion,
  })
  const payload = parseWalletPayloadJson(payloadPlaintext)
  return assembleWalletSecrets(mnemonicPlaintext, payload)
}

/**
 * Deletes encrypted wallet secrets from the `wallet_secrets` table.
 */
export async function deleteWalletSecrets(
  walletDb: Kysely<Database>,
  walletId: number,
): Promise<void> {
  await walletDb.deleteFrom('wallet_secrets').where('wallet_id', '=', walletId).execute()
}

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

  const blobs: {
    walletId: number
    payload: EncryptedWalletSecretsBlob
    mnemonic: EncryptedWalletSecretsBlob
  }[] = []
  for (const { walletId, secrets } of decrypted) {
    const payload: WalletSecretsPayload = {
      descriptorWallets: secrets.descriptorWallets,
      lightningNwcConnections: secrets.lightningNwcConnections,
    }
    const payloadEnc = await encryptData(newPassword, JSON.stringify(payload))
    const mnemonicEnc = await encryptData(newPassword, secrets.mnemonic)
    blobs.push({
      walletId,
      payload: {
        ciphertext: payloadEnc.ciphertext,
        iv: payloadEnc.iv,
        salt: payloadEnc.salt,
        kdfVersion: payloadEnc.kdfVersion,
      },
      mnemonic: {
        ciphertext: mnemonicEnc.ciphertext,
        iv: mnemonicEnc.iv,
        salt: mnemonicEnc.salt,
        kdfVersion: mnemonicEnc.kdfVersion,
      },
    })
  }

  await walletDb.transaction().execute(async (trx) => {
    for (const { walletId, payload, mnemonic } of blobs) {
      await putSplitWalletSecretsEncrypted(trx, walletId, { payload, mnemonic })
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
