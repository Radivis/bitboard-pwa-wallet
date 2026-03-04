import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { pbkdf2Sync } from 'node:crypto'
import type { Kysely } from 'kysely'
import type { Database } from '../schema'
import { createTestDatabase } from '../test-helpers'

/**
 * Wallet persistence tests using PBKDF2 mock for fast execution.
 * 
 * IMPORTANT: These tests use PBKDF2 as a stand-in for Argon2id KDF.
 * The actual Argon2id algorithm is tested in crypto/src/tests.rs.
 * 
 * These tests validate:
 * - Database CRUD operations for wallet_secrets table
 * - Correct integration of encryption with persistence
 * - Error handling for missing wallets and decryption failures
 * - Round-trip save/load of encrypted wallet secrets
 */
vi.mock('../kdf', () => ({
  // Fast PBKDF2 stand-in for Argon2id (only for unit tests)
  // Production uses real Argon2id via WASM worker
  deriveKeyBytes: async (password: string, salt: Uint8Array): Promise<Uint8Array> => {
    return new Uint8Array(pbkdf2Sync(password, salt, 1000, 32, 'sha256'))
  },
}))

import { saveWalletSecrets, loadWalletSecrets, deleteWalletSecrets } from '../wallet-persistence'

describe('Wallet Persistence with Encryption', () => {
  let db: Kysely<Database>
  const password = 'test-password-12345'
  let walletId: number

  const sampleSecrets = {
    mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    externalDescriptor: "wpkh([fingerprint/84'/0'/0'/0]xpub.../0/*)",
    internalDescriptor: "wpkh([fingerprint/84'/0'/0'/0]xpub.../1/*)",
    changeSet: '{"network":"signet","last_reveal":{"0":5}}',
  }

  beforeEach(async () => {
    db = await createTestDatabase()
    const result = await db
      .insertInto('wallets')
      .values({ name: 'Test Wallet', network: 'signet', created_at: new Date().toISOString() })
      .executeTakeFirstOrThrow()
    walletId = Number(result.insertId)
  })

  afterEach(async () => {
    await db.destroy()
  })

  describe('saveWalletSecrets', () => {
    it('saves encrypted wallet secrets to SQLite', async () => {
      await saveWalletSecrets(db, password, walletId, sampleSecrets)

      const record = await db
        .selectFrom('wallet_secrets')
        .selectAll()
        .where('wallet_id', '=', walletId)
        .executeTakeFirst()

      expect(record).toBeDefined()
      expect(record!.wallet_id).toBe(walletId)
      expect(record!.encrypted_data.byteLength).toBeGreaterThan(0)
      expect(record!.iv.byteLength).toBe(12)
      expect(record!.salt.byteLength).toBe(16)
      expect(record!.created_at).toBeDefined()
      expect(record!.updated_at).toBeDefined()
    })

    it('updates existing wallet secrets on re-save', async () => {
      await saveWalletSecrets(db, password, walletId, sampleSecrets)

      const firstRecord = await db
        .selectFrom('wallet_secrets')
        .selectAll()
        .where('wallet_id', '=', walletId)
        .executeTakeFirst()
      const firstUpdatedAt = firstRecord!.updated_at

      await new Promise(resolve => setTimeout(resolve, 10))

      const updatedSecrets = { ...sampleSecrets, mnemonic: 'different mnemonic words here' }
      await saveWalletSecrets(db, password, walletId, updatedSecrets)

      const count = await db
        .selectFrom('wallet_secrets')
        .select(db.fn.countAll().as('count'))
        .where('wallet_id', '=', walletId)
        .executeTakeFirstOrThrow()
      expect(Number(count.count)).toBe(1)

      const secondRecord = await db
        .selectFrom('wallet_secrets')
        .selectAll()
        .where('wallet_id', '=', walletId)
        .executeTakeFirst()
      expect(secondRecord!.updated_at > firstUpdatedAt).toBe(true)
    })

    it('throws error if walletId does not exist', async () => {
      await expect(saveWalletSecrets(db, password, 999, sampleSecrets))
        .rejects.toThrow(/wallet.*not found/i)
    })
  })

  describe('loadWalletSecrets', () => {
    it('loads and decrypts wallet secrets with correct password', async () => {
      await saveWalletSecrets(db, password, walletId, sampleSecrets)

      const loaded = await loadWalletSecrets(db, password, walletId)

      expect(loaded).toEqual(sampleSecrets)
    })

    it('throws error when loading with wrong password', async () => {
      await saveWalletSecrets(db, password, walletId, sampleSecrets)

      await expect(loadWalletSecrets(db, 'wrong-password', walletId))
        .rejects.toThrow()
    })

    it('throws error when wallet secrets do not exist', async () => {
      await expect(loadWalletSecrets(db, password, 999))
        .rejects.toThrow(/secrets.*not found/i)
    })

    it('correctly handles unicode in secrets', async () => {
      const unicodeSecrets = {
        ...sampleSecrets,
        mnemonic: 'test mnemonic with émojis 🔐 and 中文',
      }

      await saveWalletSecrets(db, password, walletId, unicodeSecrets)
      const loaded = await loadWalletSecrets(db, password, walletId)

      expect(loaded.mnemonic).toBe(unicodeSecrets.mnemonic)
    })
  })

  describe('deleteWalletSecrets', () => {
    it('deletes wallet secrets from SQLite', async () => {
      await saveWalletSecrets(db, password, walletId, sampleSecrets)

      await deleteWalletSecrets(db, walletId)

      const record = await db
        .selectFrom('wallet_secrets')
        .selectAll()
        .where('wallet_id', '=', walletId)
        .executeTakeFirst()
      expect(record).toBeUndefined()
    })

    it('does not throw if secrets do not exist', async () => {
      await expect(deleteWalletSecrets(db, 999)).resolves.not.toThrow()
    })
  })

  describe('multiple wallets', () => {
    it('keeps secrets separate for different wallets', async () => {
      const result2 = await db
        .insertInto('wallets')
        .values({ name: 'Second Wallet', network: 'testnet', created_at: new Date().toISOString() })
        .executeTakeFirstOrThrow()
      const walletId2 = Number(result2.insertId)

      const secrets1 = { ...sampleSecrets, mnemonic: 'first wallet mnemonic' }
      const secrets2 = { ...sampleSecrets, mnemonic: 'second wallet mnemonic' }

      await saveWalletSecrets(db, 'password1', walletId, secrets1)
      await saveWalletSecrets(db, 'password2', walletId2, secrets2)

      const loaded1 = await loadWalletSecrets(db, 'password1', walletId)
      const loaded2 = await loadWalletSecrets(db, 'password2', walletId2)

      expect(loaded1.mnemonic).toBe('first wallet mnemonic')
      expect(loaded2.mnemonic).toBe('second wallet mnemonic')
    })
  })
})
