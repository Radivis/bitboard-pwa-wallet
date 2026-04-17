import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../schema'
import { createTestDatabase } from '../test-helpers'
import { ARGON2_KDF_PHC_CI } from '@/lib/kdf-phc-constants'

const decryptDataMock = vi.fn()

vi.mock('../encryption', () => ({
  encryptData: vi.fn(),
  decryptData: (...args: unknown[]) => decryptDataMock(...args),
}))

import { loadWalletSecrets } from '../wallet-persistence'

describe('wallet secrets schema boundary', () => {
  let walletDb: Kysely<Database>
  let walletId: number

  beforeEach(async () => {
    vi.clearAllMocks()
    walletDb = await createTestDatabase()
    const walletInsert = await walletDb
      .insertInto('wallets')
      .values({ name: 'Schema Boundary Wallet', created_at: new Date().toISOString() })
      .executeTakeFirstOrThrow()
    walletId = Number(walletInsert.insertId)

    await walletDb
      .insertInto('wallet_secrets')
      .values({
        wallet_id: walletId,
        revision: 0,
        encrypted_data: new Uint8Array([1, 2, 3]),
        iv: new Uint8Array(12),
        salt: new Uint8Array(16),
        kdf_phc: ARGON2_KDF_PHC_CI,
        mnemonic_encrypted_data: new Uint8Array([1]),
        mnemonic_iv: new Uint8Array(12),
        mnemonic_salt: new Uint8Array(16),
        mnemonic_kdf_phc: ARGON2_KDF_PHC_CI,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute()
  })

  afterEach(async () => {
    await walletDb.destroy()
  })

  it('rejects decrypted payload that fails schema validation', async () => {
    decryptDataMock.mockResolvedValueOnce(
      JSON.stringify({
        descriptorWallets: [{ network: 'testnet' }],
        lightningNwcConnections: [],
      }),
    )

    await expect(loadWalletSecrets(walletDb, 'pw', walletId)).rejects.toThrow(
      'Invalid wallet secrets payload: schema validation failed',
    )
  })
})
