import type { Kysely } from 'kysely'
import type { Database } from './schema'
import type { EncryptedBlob } from '@/lib/encrypted-blob-types'
import {
  ARGON2_KDF_PHC_CI,
  ARGON2_KDF_PHC_PRODUCTION,
} from '@/lib/kdf-phc-constants'
import { encryptData, decryptData } from './encryption'
import {
  listWalletIdsWithSecrets,
  reencryptAllWalletSecretsWithNewPassword,
} from './wallet-persistence'
import { useSessionStore } from '@/stores/sessionStore'
import { useNearZeroSecurityStore } from '@/stores/nearZeroSecurityStore'

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
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

function kdfPhcFromLegacySettings(o: {
  kdfPhc?: string
  kdfVersion?: number
}): string {
  if (o.kdfPhc !== undefined && o.kdfPhc.length > 0) {
    return o.kdfPhc
  }
  if (o.kdfVersion === 1) {
    return ARGON2_KDF_PHC_CI
  }
  return ARGON2_KDF_PHC_PRODUCTION
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
  const o = JSON.parse(json) as {
    ciphertext: string
    iv: string
    salt: string
    kdfPhc?: string
    kdfVersion?: number
  }
  return {
    ciphertext: base64ToUint8(o.ciphertext),
    iv: base64ToUint8(o.iv),
    salt: base64ToUint8(o.salt),
    kdfPhc: kdfPhcFromLegacySettings(o),
  }
}

function generateSessionSecretR(): string {
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
  const r = generateSessionSecretR()
  const wrapped = await encryptData(NEAR_ZERO_WRAPPER_PASSWORD, r)
  const serialized = serializeEncryptedBlobForSettings(wrapped)

  await upsertSetting(walletDb, NEAR_ZERO_SETTINGS_KEY_ACTIVE, '1')
  await upsertSetting(walletDb, NEAR_ZERO_SETTINGS_KEY_WRAPPED, serialized)

  useSessionStore.getState().setPassword(r)
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
    const r = await decryptData(NEAR_ZERO_WRAPPER_PASSWORD, blob)
    useSessionStore.getState().setPassword(r)
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
  oldPassword: string
  newPassword: string
}): Promise<void> {
  const { walletDb, oldPassword, newPassword } = params
  const ids = await listWalletIdsWithSecrets(walletDb)
  if (ids.length > 0) {
    await reencryptAllWalletSecretsWithNewPassword({
      walletDb,
      oldPassword,
      newPassword,
    })
  }
  useSessionStore.getState().setPassword(newPassword)
  await clearNearZeroSecuritySettings(walletDb)
}
