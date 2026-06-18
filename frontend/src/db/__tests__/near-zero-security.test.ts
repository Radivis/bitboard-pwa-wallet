import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../schema'
import { createTestDatabase } from '../test-helpers'
import { useNearZeroSecurityStore } from '@/stores/nearZeroSecurityStore'
import { decryptDataWithPassword } from '../encryption'
import { saveWalletSecrets, loadWalletSecrets } from '../wallet-persistence'
import { TEST_MNEMONIC_12 } from '@/test-utils/test-providers'
import {
  beginWalletSecretsSession,
  endWalletSecretsSession,
  isWalletSecretsSessionActive,
} from '@/lib/wallet/wallet-secrets-session'

vi.mock('@/workers/encryption-factory', async () => {
  const { getMockEncryptionWorker } = await import('./mock-encryption-worker')
  return {
    getEncryptionWorker: () => getMockEncryptionWorker(),
  }
})

import {
  NEAR_ZERO_SETTINGS_KEY_ACTIVE,
  NEAR_ZERO_SETTINGS_KEY_WRAPPED,
  NEAR_ZERO_WRAPPER_PASSWORD,
  generateAndPersistNearZeroSession,
  tryLoadNearZeroSessionIntoMemory,
  clearNearZeroSecuritySettings,
  upgradeNearZeroToUserPassword,
  serializeEncryptedBlobForSettings,
  deserializeEncryptedBlobFromSettings,
} from '../near-zero-security'

describe('near-zero security', () => {
  let walletDb: Kysely<Database>

  beforeEach(async () => {
    walletDb = await createTestDatabase()
    await endWalletSecretsSession()
    useNearZeroSecurityStore.setState({ active: false })
  })

  afterEach(async () => {
    await walletDb.destroy()
  })

  it('serializeEncryptedBlobForSettings round-trips', async () => {
    const { encryptDataWithPassword, decryptDataWithPassword } = await import('../encryption')
    const blob = await encryptDataWithPassword('pw', 'hello')
    const serializedBlob = serializeEncryptedBlobForSettings(blob)
    const back = deserializeEncryptedBlobFromSettings(serializedBlob)
    const plain = await decryptDataWithPassword('pw', back)
    expect(plain).toBe('hello')
  })

  it('generateAndPersistNearZeroSession stores wrapped secret and sets session', async () => {
    await generateAndPersistNearZeroSession(walletDb)

    const active = await walletDb
      .selectFrom('settings')
      .selectAll()
      .where('key', '=', NEAR_ZERO_SETTINGS_KEY_ACTIVE)
      .executeTakeFirst()
    expect(active?.value).toBe('1')

    const wrapped = await walletDb
      .selectFrom('settings')
      .selectAll()
      .where('key', '=', NEAR_ZERO_SETTINGS_KEY_WRAPPED)
      .executeTakeFirst()
    expect(wrapped?.value).toBeTruthy()

    expect(await isWalletSecretsSessionActive()).toBe(true)
    const blob = deserializeEncryptedBlobFromSettings(wrapped!.value)
    const decrypted = await decryptDataWithPassword(NEAR_ZERO_WRAPPER_PASSWORD, blob)
    expect(decrypted).toBeTruthy()
    expect(useNearZeroSecurityStore.getState().active).toBe(true)
  })

  it('tryLoadNearZeroSessionIntoMemory restores session after clear', async () => {
    await generateAndPersistNearZeroSession(walletDb)
    expect(await isWalletSecretsSessionActive()).toBe(true)
    await endWalletSecretsSession()
    useNearZeroSecurityStore.setState({ active: false })

    const ok = await tryLoadNearZeroSessionIntoMemory(walletDb)
    expect(ok).toBe(true)
    expect(await isWalletSecretsSessionActive()).toBe(true)
    expect(useNearZeroSecurityStore.getState().active).toBe(true)
  })

  it('tryLoadNearZeroSessionIntoMemory returns false when not configured', async () => {
    const ok = await tryLoadNearZeroSessionIntoMemory(walletDb)
    expect(ok).toBe(false)
    expect(await isWalletSecretsSessionActive()).toBe(false)
  })

  it('upgradeNearZeroToUserPassword with no wallets sets user password and clears near-zero settings', async () => {
    await generateAndPersistNearZeroSession(walletDb)
    await upgradeNearZeroToUserPassword({
      walletDb,
      newPassword: 'user-strong-password-ok',
    })

    expect(await isWalletSecretsSessionActive()).toBe(true)
    expect(useNearZeroSecurityStore.getState().active).toBe(false)

    const activeRow = await walletDb
      .selectFrom('settings')
      .select('key')
      .where('key', '=', NEAR_ZERO_SETTINGS_KEY_ACTIVE)
      .executeTakeFirst()
    expect(activeRow).toBeUndefined()
  })

  it('upgradeNearZeroToUserPassword re-encrypts wallet secrets', async () => {
    await generateAndPersistNearZeroSession(walletDb)
    expect(await isWalletSecretsSessionActive()).toBe(true)

    const insert = await walletDb
      .insertInto('wallets')
      .values({ name: 'W', created_at: new Date().toISOString() })
      .executeTakeFirstOrThrow()
    const walletId = Number(insert.insertId)

    const sampleSecrets = {
      mnemonic: TEST_MNEMONIC_12,
      descriptorWallets: [],
      lightningNwcConnections: [],
    }
    await saveWalletSecrets({ walletDb, walletId, secrets: sampleSecrets })

    await upgradeNearZeroToUserPassword({
      walletDb,
      newPassword: 'new-user-password-xx',
    })

    await beginWalletSecretsSession('new-user-password-xx')
    const loaded = await loadWalletSecrets(walletDb, walletId)
    expect(loaded.mnemonic).toBe(TEST_MNEMONIC_12)
  })

  it('clearNearZeroSecuritySettings removes keys', async () => {
    await generateAndPersistNearZeroSession(walletDb)
    await clearNearZeroSecuritySettings(walletDb)

    const keys = await walletDb.selectFrom('settings').select('key').execute()
    expect(keys.map((k) => k.key)).not.toContain(NEAR_ZERO_SETTINGS_KEY_ACTIVE)
    expect(keys.map((k) => k.key)).not.toContain(NEAR_ZERO_SETTINGS_KEY_WRAPPED)
    expect(useNearZeroSecurityStore.getState().active).toBe(false)
  })
})
