import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../schema'
import { createTestDatabase } from '../test-helpers'

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
        encrypted_data: new Uint8Array([1, 2, 3]),
        iv: new Uint8Array(12),
        salt: new Uint8Array(16),
        kdf_version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute()
  })

  afterEach(async () => {
    await walletDb.destroy()
  })

  it('rejects decrypted secrets that fail schema validation', async () => {
    decryptDataMock.mockResolvedValueOnce(
      JSON.stringify({
        mnemonic: 'not enough fields',
        descriptorWallets: [{ network: 'testnet' }],
      }),
    )

    await expect(loadWalletSecrets(walletDb, 'pw', walletId)).rejects.toThrow(
      'Invalid wallet secrets: schema validation failed',
    )
  })
})
