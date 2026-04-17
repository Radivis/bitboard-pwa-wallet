import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../schema'
import { createTestDatabase } from '../test-helpers'
import { persistNewWalletWithSecrets } from '../wallet-persistence'
import { ARGON2_KDF_PHC_CI } from '@/lib/kdf-phc-constants'

/**
 * Integration test: when secrets write fails, persistNewWalletWithSecrets (used by create/import)
 * must roll back the wallet row so the wallet list has no entry without secrets.
 */
describe('Create/import rollback on secrets write failure', () => {
  let walletDb: Kysely<Database>

  beforeEach(async () => {
    walletDb = await createTestDatabase()
  })

  afterEach(async () => {
    await walletDb.destroy()
  })

  it('removes wallet row when putSplitWalletSecretsEncrypted fails so wallet list has no entry without secrets', async () => {
    const putSecretsFails = vi.fn().mockRejectedValue(new Error('secrets write failed'))
    const dummyBlob = {
      ciphertext: new Uint8Array(0),
      iv: new Uint8Array(12),
      salt: new Uint8Array(16),
      kdfPhc: ARGON2_KDF_PHC_CI,
    }

    await expect(
      persistNewWalletWithSecrets({
        walletDb,
        insertWalletRow: async () => {
          const result = await walletDb
            .insertInto('wallets')
            .values({
              name: `Wallet ${Date.now()}`,
              created_at: new Date().toISOString(),
            })
            .executeTakeFirstOrThrow()
          return Number(result.insertId)
        },
        encryptedBlobs: {
          payload: dummyBlob,
          mnemonic: dummyBlob,
        },
        putSecrets: putSecretsFails,
      }),
    ).rejects.toThrow('secrets write failed')

    const wallets = await walletDb.selectFrom('wallets').selectAll().execute()
    expect(wallets).toHaveLength(0)
  })
})
