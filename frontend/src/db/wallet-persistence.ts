import { sql, type Kysely } from 'kysely'
import type { Database } from './schema'
import { encryptData, decryptData } from './encryption'
import { trackWalletSecretsWrite } from '@/db/wallet-secrets-write-tracker'
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
  /** Argon2id PHC parameter prefix; see `kdf-phc-constants.ts`. */
  kdfPhc: string
}

/** Encrypted wallet row: payload ciphertext (WalletSecretsPayload JSON) and separate mnemonic ciphertext. */
export interface SplitWalletSecretsEncryptedBlobs {
  payload: EncryptedWalletSecretsBlob
  mnemonic: EncryptedWalletSecretsBlob
}

export interface SplitWalletSecretsEncryptedWithRevision
  extends SplitWalletSecretsEncryptedBlobs {
  revision: number
}

export const WALLET_SECRETS_CAS_MAX_RETRIES = 8

function rowToPayloadBlob(record: {
  encrypted_data: Uint8Array
  iv: Uint8Array
  salt: Uint8Array
  kdf_phc: string
}): EncryptedWalletSecretsBlob {
  return {
    ciphertext: record.encrypted_data,
    iv: record.iv,
    salt: record.salt,
    kdfPhc: record.kdf_phc,
  }
}

function rowToMnemonicBlob(record: {
  wallet_id: number
  mnemonic_encrypted_data: Uint8Array
  mnemonic_iv: Uint8Array
  mnemonic_salt: Uint8Array
  mnemonic_kdf_phc: string
}): EncryptedWalletSecretsBlob {
  return {
    ciphertext: record.mnemonic_encrypted_data,
    iv: record.mnemonic_iv,
    salt: record.mnemonic_salt,
    kdfPhc: record.mnemonic_kdf_phc,
  }
}

/** Reads encrypted wallet secrets for a wallet (no decryption). Requires split payload + mnemonic columns. */
export async function getWalletSecretsEncrypted(
  walletDb: Kysely<Database>,
  walletId: number
): Promise<SplitWalletSecretsEncryptedBlobs> {
  const withRevision = await getWalletSecretsEncryptedWithRevision(walletDb, walletId)
  return {
    payload: withRevision.payload,
    mnemonic: withRevision.mnemonic,
  }
}

/** Reads encrypted wallet secrets plus optimistic-concurrency revision (no decryption). */
export async function getWalletSecretsEncryptedWithRevision(
  walletDb: Kysely<Database>,
  walletId: number
): Promise<SplitWalletSecretsEncryptedWithRevision> {
  const record = await walletDb
    .selectFrom('wallet_secrets')
    .select([
      'wallet_id',
      'revision',
      'encrypted_data',
      'iv',
      'salt',
      'kdf_phc',
      'mnemonic_encrypted_data',
      'mnemonic_iv',
      'mnemonic_salt',
      'mnemonic_kdf_phc',
    ])
    .where('wallet_id', '=', walletId)
    .executeTakeFirst()

  if (!record) {
    throw new Error(`Wallet secrets for wallet ${walletId} not found`)
  }

  return {
    payload: rowToPayloadBlob(record),
    mnemonic: rowToMnemonicBlob(record),
    revision: record.revision,
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
  const kdfPhc = blobs.payload.kdfPhc
  const existing = await walletDb
    .selectFrom('wallet_secrets')
    .select(['wallet_secrets_id', 'revision'])
    .where('wallet_id', '=', walletId)
    .executeTakeFirst()

  const baseSet = {
    encrypted_data: blobs.payload.ciphertext,
    iv: blobs.payload.iv,
    salt: blobs.payload.salt,
    kdf_phc: kdfPhc,
    updated_at: now,
  }

  const mnemonicSet =
    blobs.mnemonic !== undefined
      ? {
          mnemonic_encrypted_data: blobs.mnemonic.ciphertext,
          mnemonic_iv: blobs.mnemonic.iv,
          mnemonic_salt: blobs.mnemonic.salt,
          mnemonic_kdf_phc: blobs.mnemonic.kdfPhc,
        }
      : {}

  if (existing) {
    await walletDb
      .updateTable('wallet_secrets')
      .set({
        ...baseSet,
        ...mnemonicSet,
        revision: sql<number>`revision + 1`,
      })
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
        revision: 0,
        encrypted_data: blobs.payload.ciphertext,
        iv: blobs.payload.iv,
        salt: blobs.payload.salt,
        kdf_phc: kdfPhc,
        mnemonic_encrypted_data: m.ciphertext,
        mnemonic_iv: m.iv,
        mnemonic_salt: m.salt,
        mnemonic_kdf_phc: m.kdfPhc,
        created_at: now,
        updated_at: now,
      })
      .execute()
  }
}

/**
 * CAS update for encrypted split blobs.
 * Returns true when updated, false when revision mismatch (concurrent writer won).
 */
export async function putSplitWalletSecretsEncryptedIfRevisionMatches(
  walletDb: Kysely<Database>,
  walletId: number,
  blobs: PutSplitWalletSecretsEncryptedInput,
  expectedRevision: number,
): Promise<boolean> {
  await assertWalletExists(walletDb, walletId)
  const now = new Date().toISOString()
  const kdfPhc = blobs.payload.kdfPhc
  const baseSet = {
    encrypted_data: blobs.payload.ciphertext,
    iv: blobs.payload.iv,
    salt: blobs.payload.salt,
    kdf_phc: kdfPhc,
    updated_at: now,
    revision: sql<number>`revision + 1`,
  }
  const mnemonicSet =
    blobs.mnemonic !== undefined
      ? {
          mnemonic_encrypted_data: blobs.mnemonic.ciphertext,
          mnemonic_iv: blobs.mnemonic.iv,
          mnemonic_salt: blobs.mnemonic.salt,
          mnemonic_kdf_phc: blobs.mnemonic.kdfPhc,
        }
      : {}

  const result = await walletDb
    .updateTable('wallet_secrets')
    .set({ ...baseSet, ...mnemonicSet })
    .where('wallet_id', '=', walletId)
    .where('revision', '=', expectedRevision)
    .executeTakeFirst()
  return Number(result.numUpdatedRows) === 1
}

function logWalletSecretsConflictRetry(attempt: number, maxRetries: number): void {
  if (import.meta.env.DEV) {
    console.debug('[wallet-persistence] CAS conflict; retrying', {
      attempt,
      maxRetries,
    })
  }
}

function walletSecretsConflictError(maxRetries: number): Error {
  return new Error(
    `Failed to update encrypted wallet secrets after ${maxRetries} CAS retries`,
  )
}

async function updateWalletSecretsPayloadWithRetryImpl(params: {
  walletDb: Kysely<Database>
  walletId: number
  password: string
  transform: (
    payload: WalletSecretsPayload,
  ) => WalletSecretsPayload | Promise<WalletSecretsPayload>
  maxRetries?: number
}): Promise<void> {
  const {
    walletDb,
    walletId,
    password,
    transform,
    maxRetries = WALLET_SECRETS_CAS_MAX_RETRIES,
  } = params

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const current = await getWalletSecretsEncryptedWithRevision(walletDb, walletId)
    const payloadPlaintext = await decryptData(password, current.payload)
    const payload = parseWalletPayloadJson(payloadPlaintext)
    const nextPayload = await transform(payload)
    const encryptedPayload = await encryptData(password, JSON.stringify(nextPayload))
    const updated = await putSplitWalletSecretsEncryptedIfRevisionMatches(
      walletDb,
      walletId,
      {
        payload: {
          ciphertext: encryptedPayload.ciphertext,
          iv: encryptedPayload.iv,
          salt: encryptedPayload.salt,
          kdfPhc: encryptedPayload.kdfPhc,
        },
      },
      current.revision,
    )
    if (updated) return
    logWalletSecretsConflictRetry(attempt, maxRetries)
  }
  throw walletSecretsConflictError(maxRetries)
}

export function updateWalletSecretsPayloadWithRetry(params: {
  walletDb: Kysely<Database>
  walletId: number
  password: string
  transform: (
    payload: WalletSecretsPayload,
  ) => WalletSecretsPayload | Promise<WalletSecretsPayload>
  maxRetries?: number
}): Promise<void> {
  return trackWalletSecretsWrite(updateWalletSecretsPayloadWithRetryImpl(params))
}

async function updateWalletSecretsEncryptedPayloadWithRetryImpl(params: {
  walletDb: Kysely<Database>
  walletId: number
  transform: (
    payload: EncryptedWalletSecretsBlob,
  ) => EncryptedWalletSecretsBlob | Promise<EncryptedWalletSecretsBlob>
  maxRetries?: number
}): Promise<void> {
  const {
    walletDb,
    walletId,
    transform,
    maxRetries = WALLET_SECRETS_CAS_MAX_RETRIES,
  } = params

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const current = await getWalletSecretsEncryptedWithRevision(walletDb, walletId)
    const nextPayload = await transform(current.payload)
    const updated = await putSplitWalletSecretsEncryptedIfRevisionMatches(
      walletDb,
      walletId,
      { payload: nextPayload },
      current.revision,
    )
    if (updated) return
    logWalletSecretsConflictRetry(attempt, maxRetries)
  }
  throw walletSecretsConflictError(maxRetries)
}

export function updateWalletSecretsEncryptedPayloadWithRetry(params: {
  walletDb: Kysely<Database>
  walletId: number
  transform: (
    payload: EncryptedWalletSecretsBlob,
  ) => EncryptedWalletSecretsBlob | Promise<EncryptedWalletSecretsBlob>
  maxRetries?: number
}): Promise<void> {
  return trackWalletSecretsWrite(
    updateWalletSecretsEncryptedPayloadWithRetryImpl(params),
  )
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
      kdfPhc: payloadEnc.kdfPhc,
    },
    mnemonic: {
      ciphertext: mnemonicEnc.ciphertext,
      iv: mnemonicEnc.iv,
      salt: mnemonicEnc.salt,
      kdfPhc: mnemonicEnc.kdfPhc,
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
      'kdf_phc',
      'mnemonic_encrypted_data',
      'mnemonic_iv',
      'mnemonic_salt',
      'mnemonic_kdf_phc',
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
    kdfPhc: record.kdf_phc,
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
      'kdf_phc',
      'mnemonic_encrypted_data',
      'mnemonic_iv',
      'mnemonic_salt',
      'mnemonic_kdf_phc',
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
    mnemonic_kdf_phc: record.mnemonic_kdf_phc,
  })

  const payloadPlaintext = await decryptData(password, {
    ciphertext: record.encrypted_data,
    iv: record.iv,
    salt: record.salt,
    kdfPhc: record.kdf_phc,
  })
  const mnemonicPlaintext = await decryptData(password, {
    ciphertext: mnemonicBlob.ciphertext,
    iv: mnemonicBlob.iv,
    salt: mnemonicBlob.salt,
    kdfPhc: mnemonicBlob.kdfPhc,
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

/**
 * Removes encrypted secrets and the wallet row (including `no_mnemonic_backup` on `wallets`).
 */
export async function deleteWalletCompletely(
  walletDb: Kysely<Database>,
  walletId: number,
): Promise<void> {
  await deleteWalletSecrets(walletDb, walletId)
  await walletDb.deleteFrom('wallets').where('wallet_id', '=', walletId).execute()
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
        kdfPhc: payloadEnc.kdfPhc,
      },
      mnemonic: {
        ciphertext: mnemonicEnc.ciphertext,
        iv: mnemonicEnc.iv,
        salt: mnemonicEnc.salt,
        kdfPhc: mnemonicEnc.kdfPhc,
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
