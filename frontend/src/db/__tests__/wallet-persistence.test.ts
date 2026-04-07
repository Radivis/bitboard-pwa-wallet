import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../schema'
import { createTestDatabase } from '../test-helpers'

/**
 * Wallet persistence tests using mock encryption worker for fast execution.
 *
 * IMPORTANT: The mock uses PBKDF2 + AES-GCM. Production uses the encryption worker with Argon2id WASM.
 *
 * These tests validate:
 * - Database CRUD operations for wallet_secrets table
 * - Correct integration of encryption with persistence
 * - Error handling for missing wallets and decryption failures
 * - Round-trip save/load of encrypted wallet secrets
 */
vi.mock('@/workers/encryption-factory', async () => {
  const { getMockEncryptionWorker } = await import('./mock-encryption-worker')
  return {
    getEncryptionWorker: () => getMockEncryptionWorker(),
  }
})

import { TEST_MNEMONIC_12 } from '@/test-utils/test-providers'
import {
  saveWalletSecrets,
  loadWalletSecrets,
  loadWalletSecretsPayload,
  deleteWalletSecrets,
  reencryptAllWalletSecretsWithNewPassword,
  listWalletIdsWithSecrets,
  getWalletSecretsEncrypted,
  getWalletSecretsEncryptedWithRevision,
  putSplitWalletSecretsEncrypted,
  putSplitWalletSecretsEncryptedIfRevisionMatches,
  updateWalletSecretsPayloadWithRetry,
  updateWalletSecretsEncryptedPayloadWithRetry,
} from '../wallet-persistence'

describe('Wallet Persistence with Encryption', () => {
  let walletDb: Kysely<Database>
  const password = 'test-password-12345'
  let walletId: number

  const sampleSecrets = {
    mnemonic: TEST_MNEMONIC_12,
    descriptorWallets: [
      {
        network: 'signet' as const,
        addressType: 'taproot' as const,
        accountId: 0,
        externalDescriptor: "tr([fingerprint/86'/1'/0']xpub.../0/*)",
        internalDescriptor: "tr([fingerprint/86'/1'/0']xpub.../1/*)",
        changeSet: '{"last_reveal":{"0":5}}',
        fullScanDone: false,
      },
    ],
    lightningNwcConnections: [],
  }

  beforeEach(async () => {
    walletDb = await createTestDatabase()
    const result = await walletDb
      .insertInto('wallets')
      .values({ name: 'Test Wallet', created_at: new Date().toISOString() })
      .executeTakeFirstOrThrow()
    walletId = Number(result.insertId)
  })

  afterEach(async () => {
    await walletDb.destroy()
  })

  describe('saveWalletSecrets', () => {
    it('saves encrypted wallet secrets to SQLite', async () => {
      await saveWalletSecrets({
        walletDb,
        password,
        walletId,
        secrets: sampleSecrets,
      })

      const record = await walletDb
        .selectFrom('wallet_secrets')
        .selectAll()
        .where('wallet_id', '=', walletId)
        .executeTakeFirst()

      expect(record).toBeDefined()
      expect(record!.wallet_id).toBe(walletId)
      expect(record!.encrypted_data.byteLength).toBeGreaterThan(0)
      expect(record!.iv.byteLength).toBe(12)
      expect(record!.salt.byteLength).toBe(16)
      expect(record!.mnemonic_encrypted_data!.byteLength).toBeGreaterThan(0)
      expect(record!.mnemonic_iv!.byteLength).toBe(12)
      expect(record!.mnemonic_salt!.byteLength).toBe(16)
      expect(record!.created_at).toBeDefined()
      expect(record!.updated_at).toBeDefined()
    })

    it('updates existing wallet secrets on re-save', async () => {
      await saveWalletSecrets({
        walletDb,
        password,
        walletId,
        secrets: sampleSecrets,
      })

      const firstRecord = await walletDb
        .selectFrom('wallet_secrets')
        .selectAll()
        .where('wallet_id', '=', walletId)
        .executeTakeFirst()
      const firstUpdatedAt = firstRecord!.updated_at

      await new Promise(resolve => setTimeout(resolve, 10))

      const updatedSecrets = { ...sampleSecrets, mnemonic: 'different mnemonic words here' }
      await saveWalletSecrets({
        walletDb,
        password,
        walletId,
        secrets: updatedSecrets,
      })

      const count = await walletDb
        .selectFrom('wallet_secrets')
        .select(walletDb.fn.countAll().as('count'))
        .where('wallet_id', '=', walletId)
        .executeTakeFirstOrThrow()
      expect(Number(count.count)).toBe(1)

      const secondRecord = await walletDb
        .selectFrom('wallet_secrets')
        .selectAll()
        .where('wallet_id', '=', walletId)
        .executeTakeFirst()
      expect(secondRecord!.updated_at > firstUpdatedAt).toBe(true)
    })

    it('throws error if walletId does not exist', async () => {
      await expect(
        saveWalletSecrets({
          walletDb,
          password,
          walletId: 999,
          secrets: sampleSecrets,
        }),
      ).rejects.toThrow(/wallet.*not found/i)
    })
  })

  describe('loadWalletSecrets', () => {
    it('loads and decrypts wallet secrets with correct password', async () => {
      await saveWalletSecrets({
        walletDb,
        password,
        walletId,
        secrets: sampleSecrets,
      })

      const loaded = await loadWalletSecrets(walletDb, password, walletId)

      expect(loaded).toEqual(sampleSecrets)
    })

    it('throws error when loading with wrong password', async () => {
      await saveWalletSecrets({
        walletDb,
        password,
        walletId,
        secrets: sampleSecrets,
      })

      await expect(loadWalletSecrets(walletDb, 'wrong-password', walletId))
        .rejects.toThrow()
    })

    it('throws error when wallet secrets do not exist', async () => {
      await expect(loadWalletSecrets(walletDb, password, 999))
        .rejects.toThrow(/secrets.*not found/i)
    })

    it('loads payload-only without touching mnemonic ciphertext path semantics', async () => {
      await saveWalletSecrets({
        walletDb,
        password,
        walletId,
        secrets: sampleSecrets,
      })
      const payloadOnly = await loadWalletSecretsPayload(walletDb, password, walletId)
      expect(payloadOnly.descriptorWallets).toEqual(sampleSecrets.descriptorWallets)
      expect(payloadOnly.lightningNwcConnections).toEqual(
        sampleSecrets.lightningNwcConnections,
      )
      expect(payloadOnly).not.toHaveProperty('mnemonic')
    })

    it('correctly handles unicode in secrets', async () => {
      const unicodeSecrets = {
        ...sampleSecrets,
        mnemonic: 'test mnemonic with émojis 🔐 and 中文',
      }

      await saveWalletSecrets({
        walletDb,
        password,
        walletId,
        secrets: unicodeSecrets,
      })
      const loaded = await loadWalletSecrets(walletDb, password, walletId)

      expect(loaded.mnemonic).toBe(unicodeSecrets.mnemonic)
      expect(loaded.descriptorWallets).toEqual(unicodeSecrets.descriptorWallets)
    })
  })

  describe('deleteWalletSecrets', () => {
    it('deletes wallet secrets from SQLite', async () => {
      await saveWalletSecrets({
        walletDb,
        password,
        walletId,
        secrets: sampleSecrets,
      })

      await deleteWalletSecrets(walletDb, walletId)

      const record = await walletDb
        .selectFrom('wallet_secrets')
        .selectAll()
        .where('wallet_id', '=', walletId)
        .executeTakeFirst()
      expect(record).toBeUndefined()
    })

    it('does not throw if secrets do not exist', async () => {
      await expect(deleteWalletSecrets(walletDb, 999)).resolves.not.toThrow()
    })
  })

  describe('multiple wallets', () => {
    it('keeps secrets separate for different wallets', async () => {
      const result2 = await walletDb
        .insertInto('wallets')
        .values({ name: 'Second Wallet', created_at: new Date().toISOString() })
        .executeTakeFirstOrThrow()
      const walletId2 = Number(result2.insertId)

      const secrets1 = { ...sampleSecrets, mnemonic: 'first wallet mnemonic' }
      const secrets2 = { ...sampleSecrets, mnemonic: 'second wallet mnemonic' }

      await saveWalletSecrets({
        walletDb,
        password: 'password1',
        walletId,
        secrets: secrets1,
      })
      await saveWalletSecrets({
        walletDb,
        password: 'password2',
        walletId: walletId2,
        secrets: secrets2,
      })

      const loaded1 = await loadWalletSecrets(walletDb, 'password1', walletId)
      const loaded2 = await loadWalletSecrets(walletDb, 'password2', walletId2)

      expect(loaded1.mnemonic).toBe('first wallet mnemonic')
      expect(loaded2.mnemonic).toBe('second wallet mnemonic')
    })
  })

  describe('reencryptAllWalletSecretsWithNewPassword', () => {
    const oldPass = 'old-app-password-12'
    const newPass = 'new-app-password-12'

    it('re-encrypts all wallet secrets and old password no longer works', async () => {
      const result2 = await walletDb
        .insertInto('wallets')
        .values({ name: 'Second Wallet', created_at: new Date().toISOString() })
        .executeTakeFirstOrThrow()
      const walletId2 = Number(result2.insertId)

      const secretsA = { ...sampleSecrets, mnemonic: 'aaa first mnemonic unique' }
      const secretsB = { ...sampleSecrets, mnemonic: 'bbb second mnemonic unique' }

      await saveWalletSecrets({
        walletDb,
        password: oldPass,
        walletId,
        secrets: secretsA,
      })
      await saveWalletSecrets({
        walletDb,
        password: oldPass,
        walletId: walletId2,
        secrets: secretsB,
      })

      const ids = await listWalletIdsWithSecrets(walletDb)
      expect(ids).toEqual([walletId, walletId2])

      await reencryptAllWalletSecretsWithNewPassword({
        walletDb,
        oldPassword: oldPass,
        newPassword: newPass,
      })

      const loaded1 = await loadWalletSecrets(walletDb, newPass, walletId)
      const loaded2 = await loadWalletSecrets(walletDb, newPass, walletId2)
      expect(loaded1.mnemonic).toBe('aaa first mnemonic unique')
      expect(loaded2.mnemonic).toBe('bbb second mnemonic unique')

      await expect(loadWalletSecrets(walletDb, oldPass, walletId)).rejects.toThrow()
      await expect(loadWalletSecrets(walletDb, oldPass, walletId2)).rejects.toThrow()
    })

    it('throws when current password is wrong (no partial writes)', async () => {
      await saveWalletSecrets({
        walletDb,
        password: oldPass,
        walletId,
        secrets: sampleSecrets,
      })

      await expect(
        reencryptAllWalletSecretsWithNewPassword({
          walletDb,
          oldPassword: 'wrong-password',
          newPassword: newPass,
        }),
      ).rejects.toThrow()

      const loaded = await loadWalletSecrets(walletDb, oldPass, walletId)
      expect(loaded).toEqual(sampleSecrets)
    })

    it('throws when there are no wallet_secrets rows', async () => {
      await expect(
        reencryptAllWalletSecretsWithNewPassword({
          walletDb,
          oldPassword: oldPass,
          newPassword: newPass,
        }),
      ).rejects.toThrow(/no wallet secrets/i)
    })
  })

  describe('CAS revision guardrails', () => {
    it('starts at revision 0 and increments on each write', async () => {
      await saveWalletSecrets({
        walletDb,
        password,
        walletId,
        secrets: sampleSecrets,
      })

      let row = await getWalletSecretsEncryptedWithRevision(walletDb, walletId)
      expect(row.revision).toBe(0)

      await saveWalletSecrets({
        walletDb,
        password,
        walletId,
        secrets: { ...sampleSecrets, mnemonic: 'different mnemonic words here' },
      })
      row = await getWalletSecretsEncryptedWithRevision(walletDb, walletId)
      expect(row.revision).toBe(1)
    })

    it('rejects stale expected revision in CAS write', async () => {
      await saveWalletSecrets({
        walletDb,
        password,
        walletId,
        secrets: sampleSecrets,
      })
      const current = await getWalletSecretsEncryptedWithRevision(walletDb, walletId)
      await putSplitWalletSecretsEncrypted(walletDb, walletId, {
        payload: current.payload,
      })

      const staleWriteResult = await putSplitWalletSecretsEncryptedIfRevisionMatches(
        walletDb,
        walletId,
        { payload: current.payload },
        current.revision,
      )
      expect(staleWriteResult).toBe(false)
    })

    it('retries payload update when revision changes during transform', async () => {
      await saveWalletSecrets({
        walletDb,
        password,
        walletId,
        secrets: sampleSecrets,
      })

      let injectedConflict = false
      await updateWalletSecretsPayloadWithRetry({
        walletDb,
        walletId,
        password,
        transform: async (payload) => {
          if (!injectedConflict) {
            injectedConflict = true
            const current = await getWalletSecretsEncrypted(walletDb, walletId)
            await putSplitWalletSecretsEncrypted(walletDb, walletId, {
              payload: current.payload,
            })
          }
          return {
            ...payload,
            lightningNwcConnections: [
              {
                id: 'c1',
                label: 'Conn 1',
                networkMode: 'signet',
                connectionString:
                  'nostr+walletconnect://abc?relay=wss%3A%2F%2Frelay.example.com',
                createdAt: '2020-01-01T00:00:00.000Z',
              },
            ],
          }
        },
      })

      const loaded = await loadWalletSecretsPayload(walletDb, password, walletId)
      expect(loaded.lightningNwcConnections).toHaveLength(1)
      expect(loaded.lightningNwcConnections[0].id).toBe('c1')
      const withRevision = await getWalletSecretsEncryptedWithRevision(walletDb, walletId)
      expect(withRevision.revision).toBeGreaterThanOrEqual(2)
    })

    it('retries encrypted-payload update when revision changes before CAS write', async () => {
      await saveWalletSecrets({
        walletDb,
        password,
        walletId,
        secrets: sampleSecrets,
      })

      let injectedConflict = false
      await updateWalletSecretsEncryptedPayloadWithRetry({
        walletDb,
        walletId,
        transform: async (payloadBlob) => {
          if (!injectedConflict) {
            injectedConflict = true
            await putSplitWalletSecretsEncrypted(walletDb, walletId, {
              payload: payloadBlob,
            })
          }
          return payloadBlob
        },
      })

      const withRevision = await getWalletSecretsEncryptedWithRevision(walletDb, walletId)
      expect(withRevision.revision).toBeGreaterThanOrEqual(2)
    })
  })
})
