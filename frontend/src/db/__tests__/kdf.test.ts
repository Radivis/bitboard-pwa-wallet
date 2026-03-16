import { describe, it, expect, vi } from 'vitest'
import { deriveKeyBytes } from '../kdf'

vi.mock('@/workers/crypto-factory', () => ({
  getCryptoWorker: () => ({
    deriveArgon2Key: async (_password: string, _salt: Uint8Array) =>
      new Uint8Array(32).fill(0xab),
  }),
}))

describe('kdf', () => {
  it('deriveKeyBytes returns 32 bytes from worker', async () => {
    const salt = new Uint8Array(16).fill(1)
    const key = await deriveKeyBytes('test-password', salt)
    expect(key).toBeInstanceOf(Uint8Array)
    expect(key.length).toBe(32)
  })
})
