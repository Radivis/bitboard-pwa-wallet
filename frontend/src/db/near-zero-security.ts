import type { Kysely } from 'kysely'
import type { Database } from './schema'
import type { EncryptedBlob } from '@/lib/shared/encrypted-blob-types'
import { encryptDataWithPassword, decryptDataWithPassword } from './encryption'
import {
  listWalletIdsWithSecrets,
  loadWalletSecrets,
  putSplitWalletSecretsEncrypted,
} from './wallet-persistence'
import { useNearZeroSecurityStore } from '@/stores/nearZeroSecurityStore'
import { beginWalletSecretsSession } from '@/lib/wallet/wallet-secrets-session'

/**
 * Public, fixed passphrase used only to wrap the random session secret in SQLite.
 * Documented as offering no meaningful security (see Near-zero security mode).
 */
export const NEAR_ZERO_WRAPPER_PASSWORD = '!Near 0 Security!'

export const NEAR_ZERO_SETTINGS_KEY_ACTIVE = 'near_zero_security_active'
export const NEAR_ZERO_SETTINGS_KEY_WRAPPED = 'near_zero_wrapped_session_secret'

/** Random session secret length (bytes) before encoding. */
const NEAR_ZERO_SESSION_SECRET_BYTES = 32

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64)
  const decodedBytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    decodedBytes[i] = binary.charCodeAt(i)
  }
  return decodedBytes
}

export function serializeEncryptedBlobForSettings(blob: EncryptedBlob): string {
  return JSON.stringify({
    ciphertext: uint8ToBase64(blob.ciphertext),
    iv: uint8ToBase64(blob.iv),
    salt: uint8ToBase64(blob.salt),
    kdfPhc: blob.kdfPhc,
  })
}

export function deserializeEncryptedBlobFromSettings(json: string): EncryptedBlob {
  const parsedBlob = JSON.parse(json) as Record<string, unknown>
  const { ciphertext, iv, salt, kdfPhc } = parsedBlob
  if (typeof ciphertext !== 'string' || typeof iv !== 'string' || typeof salt !== 'string') {
    throw new Error('Settings encrypted blob is missing ciphertext, iv, or salt')
  }
  if (typeof kdfPhc !== 'string' || kdfPhc.length === 0) {
    throw new Error('Settings encrypted blob is missing kdfPhc')
  }
  return {
    ciphertext: base64ToUint8(ciphertext),
    iv: base64ToUint8(iv),
    salt: base64ToUint8(salt),
    kdfPhc,
  }
}

function generateRandomSessionSecret(): string {
  const bytes = new Uint8Array(NEAR_ZERO_SESSION_SECRET_BYTES)
  crypto.getRandomValues(bytes)
  return uint8ToBase64(bytes)
}

async function upsertSetting(
  walletDb: Kysely<Database>,
  key: string,
  value: string,
): Promise<void> {
  await walletDb
    .insertInto('settings')
    .values({ key, value })
    .onConflict((oc) => oc.column('key').doUpdateSet({ value }))
    .execute()
}

async function deleteSetting(walletDb: Kysely<Database>, key: string): Promise<void> {
  await walletDb.deleteFrom('settings').where('key', '=', key).execute()
}

/**
 * Creates a random session secret, wraps it with {@link NEAR_ZERO_WRAPPER_PASSWORD},
 * persists to settings, loads it into the session store, and marks near-zero mode active.
 */
export async function generateAndPersistNearZeroSession(
  walletDb: Kysely<Database>,
): Promise<void> {
  const sessionSecret = generateRandomSessionSecret()
  const wrapped = await encryptDataWithPassword(NEAR_ZERO_WRAPPER_PASSWORD, sessionSecret)
  const serialized = serializeEncryptedBlobForSettings(wrapped)

  await upsertSetting(walletDb, NEAR_ZERO_SETTINGS_KEY_ACTIVE, '1')
  await upsertSetting(walletDb, NEAR_ZERO_SETTINGS_KEY_WRAPPED, serialized)

  await beginWalletSecretsSession(sessionSecret)
  useNearZeroSecurityStore.getState().setNearZeroSecurityActive(true)
}

/**
 * If near-zero mode is stored in the DB, unwraps the session secret and puts it in the session store.
 * @returns true if a session password was loaded from near-zero settings
 */
export async function tryLoadNearZeroSessionIntoMemory(
  walletDb: Kysely<Database>,
): Promise<boolean> {
  const activeRow = await walletDb
    .selectFrom('settings')
    .select('value')
    .where('key', '=', NEAR_ZERO_SETTINGS_KEY_ACTIVE)
    .executeTakeFirst()

  if (activeRow?.value !== '1') {
    useNearZeroSecurityStore.getState().setNearZeroSecurityActive(false)
    return false
  }

  const wrappedRow = await walletDb
    .selectFrom('settings')
    .select('value')
    .where('key', '=', NEAR_ZERO_SETTINGS_KEY_WRAPPED)
    .executeTakeFirst()

  if (!wrappedRow?.value) {
    useNearZeroSecurityStore.getState().setNearZeroSecurityActive(false)
    return false
  }

  try {
    const blob = deserializeEncryptedBlobFromSettings(wrappedRow.value)
    const decryptedSessionSecret = await decryptDataWithPassword(
      NEAR_ZERO_WRAPPER_PASSWORD,
      blob,
    )
    await beginWalletSecretsSession(decryptedSessionSecret)
    useNearZeroSecurityStore.getState().setNearZeroSecurityActive(true)
    return true
  } catch {
    useNearZeroSecurityStore.getState().setNearZeroSecurityActive(false)
    return false
  }
}

/** Removes near-zero settings rows and clears the in-memory near-zero flag (does not clear session password). */
export async function clearNearZeroSecuritySettings(
  walletDb: Kysely<Database>,
): Promise<void> {
  await deleteSetting(walletDb, NEAR_ZERO_SETTINGS_KEY_ACTIVE)
  await deleteSetting(walletDb, NEAR_ZERO_SETTINGS_KEY_WRAPPED)
  useNearZeroSecurityStore.getState().setNearZeroSecurityActive(false)
}

/** Read-only check for tests / diagnostics (does not touch session store). */
export async function isNearZeroSecurityConfiguredInDb(
  walletDb: Kysely<Database>,
): Promise<boolean> {
  const activeRow = await walletDb
    .selectFrom('settings')
    .select('value')
    .where('key', '=', NEAR_ZERO_SETTINGS_KEY_ACTIVE)
    .executeTakeFirst()
  return activeRow?.value === '1'
}

/**
 * Re-encrypts all wallet secrets with the user-chosen password (when present), updates session,
 * and removes near-zero settings. Safe when there are no wallets yet (only session + flags change).
 */
export async function upgradeNearZeroToUserPassword(params: {
  walletDb: Kysely<Database>
  newPassword: string
}): Promise<void> {
  const { walletDb, newPassword } = params
  const ids = await listWalletIdsWithSecrets(walletDb)
  if (ids.length > 0) {
    for (const walletId of ids) {
      const secrets = await loadWalletSecrets(walletDb, walletId)
      const payloadEnc = await encryptDataWithPassword(
        newPassword,
        JSON.stringify({
          descriptorWallets: secrets.descriptorWallets,
          lightningNwcConnections: secrets.lightningNwcConnections,
          arkadeOperatorConnections: secrets.arkadeOperatorConnections ?? [],
          activeArkadeConnectionIdByNetwork: secrets.activeArkadeConnectionIdByNetwork ?? {},
        }),
      )
      const mnemonicEnc = await encryptDataWithPassword(newPassword, secrets.mnemonic)
      await putSplitWalletSecretsEncrypted(walletDb, walletId, {
        payload: payloadEnc,
        mnemonic: mnemonicEnc,
      })
    }
  }
  await beginWalletSecretsSession(newPassword)
  await clearNearZeroSecuritySettings(walletDb)
}
