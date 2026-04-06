import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../schema'
import { createTestDatabase } from '../test-helpers'
import { useSessionStore } from '@/stores/sessionStore'
import { useNearZeroSecurityStore } from '@/stores/nearZeroSecurityStore'
import { decryptData } from '../encryption'
import { saveWalletSecrets, loadWalletSecrets } from '../wallet-persistence'
import { TEST_MNEMONIC_12 } from '@/test-utils/test-providers'

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
    useSessionStore.setState({ password: null })
    useNearZeroSecurityStore.setState({ active: false })
  })

  afterEach(async () => {
    await walletDb.destroy()
  })

  it('serializeEncryptedBlobForSettings round-trips', async () => {
    const { encryptData } = await import('../encryption')
    const blob = await encryptData('pw', 'hello')
    const s = serializeEncryptedBlobForSettings(blob)
    const back = deserializeEncryptedBlobFromSettings(s)
    const plain = await decryptData('pw', back)
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

    const r = useSessionStore.getState().password
    expect(r).toBeTruthy()
    const blob = deserializeEncryptedBlobFromSettings(wrapped!.value)
    const decrypted = await decryptData(NEAR_ZERO_WRAPPER_PASSWORD, blob)
    expect(decrypted).toBe(r)
    expect(useNearZeroSecurityStore.getState().active).toBe(true)
  })

  it('tryLoadNearZeroSessionIntoMemory restores session after clear', async () => {
    await generateAndPersistNearZeroSession(walletDb)
    const savedR = useSessionStore.getState().password
    useSessionStore.setState({ password: null })
    useNearZeroSecurityStore.setState({ active: false })

    const ok = await tryLoadNearZeroSessionIntoMemory(walletDb)
    expect(ok).toBe(true)
    expect(useSessionStore.getState().password).toBe(savedR)
    expect(useNearZeroSecurityStore.getState().active).toBe(true)
  })

  it('tryLoadNearZeroSessionIntoMemory returns false when not configured', async () => {
    const ok = await tryLoadNearZeroSessionIntoMemory(walletDb)
    expect(ok).toBe(false)
    expect(useSessionStore.getState().password).toBeNull()
  })

  it('upgradeNearZeroToUserPassword with no wallets sets user password and clears near-zero settings', async () => {
    await generateAndPersistNearZeroSession(walletDb)
    const oldR = useSessionStore.getState().password!

    await upgradeNearZeroToUserPassword({
      walletDb,
      oldPassword: oldR,
      newPassword: 'user-strong-password-ok',
    })

    expect(useSessionStore.getState().password).toBe('user-strong-password-ok')
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
    const r = useSessionStore.getState().password!

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
    await saveWalletSecrets({ walletDb, password: r, walletId, secrets: sampleSecrets })

    await upgradeNearZeroToUserPassword({
      walletDb,
      oldPassword: r,
      newPassword: 'new-user-password-xx',
    })

    const loaded = await loadWalletSecrets(walletDb, 'new-user-password-xx', walletId)
    expect(loaded.mnemonic).toBe(TEST_MNEMONIC_12)
    await expect(loadWalletSecrets(walletDb, r, walletId)).rejects.toThrow()
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
