import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EncryptionService } from '../encryption-api'

let exposedEncryptionService: EncryptionService | null = null

const deriveArgon2KeyCiMock = vi.fn(() => new Uint8Array(32).fill(1))
const deriveArgon2KeyProdMock = vi.fn(() => new Uint8Array(32).fill(2))

vi.mock('comlink', () => ({
  expose: (api: EncryptionService) => {
    exposedEncryptionService = api
  },
}))

vi.mock('@/wasm-pkg/bitboard_encryption/bitboard_encryption', () => ({
  derive_argon2_key_ci: deriveArgon2KeyCiMock,
  derive_argon2_key: deriveArgon2KeyProdMock,
}))

async function encryptWithRawKey(
  rawKey: Uint8Array,
  plaintext: string,
  iv: Uint8Array,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    rawKey as BufferSource,
    'AES-GCM',
    false,
    ['encrypt'],
  )
  const plaintextBytes = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    plaintextBytes,
  )
  return new Uint8Array(ciphertext)
}

describe('encryption.worker KDF version handling', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    exposedEncryptionService = null
    vi.resetModules()
    await import('../encryption.worker')
  })

  it('decrypts correctly for kdfVersion=1 (CI profile)', async () => {
    expect(exposedEncryptionService).toBeTruthy()
    const plaintext = 'wallet-secrets-ci'
    const iv = new Uint8Array(12).fill(7)
    const ciphertext = await encryptWithRawKey(
      new Uint8Array(32).fill(1),
      plaintext,
      iv,
    )

    const decrypted = await exposedEncryptionService!.decryptData('pw', {
      ciphertext,
      iv,
      salt: new Uint8Array(16),
      kdfVersion: 1,
    })

    expect(decrypted).toBe(plaintext)
    expect(deriveArgon2KeyCiMock).toHaveBeenCalledTimes(1)
    expect(deriveArgon2KeyProdMock).not.toHaveBeenCalled()
  })

  it('decrypts correctly for kdfVersion=2 (production profile)', async () => {
    expect(exposedEncryptionService).toBeTruthy()
    const plaintext = 'wallet-secrets-prod'
    const iv = new Uint8Array(12).fill(9)
    const ciphertext = await encryptWithRawKey(
      new Uint8Array(32).fill(2),
      plaintext,
      iv,
    )

    const decrypted = await exposedEncryptionService!.decryptData('pw', {
      ciphertext,
      iv,
      salt: new Uint8Array(16),
      kdfVersion: 2,
    })

    expect(decrypted).toBe(plaintext)
    expect(deriveArgon2KeyProdMock).toHaveBeenCalledTimes(1)
    expect(deriveArgon2KeyCiMock).not.toHaveBeenCalled()
  })

  it('fails decryption when kdfVersion does not match ciphertext profile', async () => {
    expect(exposedEncryptionService).toBeTruthy()
    const iv = new Uint8Array(12).fill(11)
    const ciphertext = await encryptWithRawKey(
      new Uint8Array(32).fill(1),
      'profile-mismatch',
      iv,
    )

    await expect(
      exposedEncryptionService!.decryptData('pw', {
        ciphertext,
        iv,
        salt: new Uint8Array(16),
        kdfVersion: 2,
      }),
    ).rejects.toThrow('Decryption failed: incorrect password or corrupted data')
  })
})
