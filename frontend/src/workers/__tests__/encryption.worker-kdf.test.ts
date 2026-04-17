import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EncryptionService } from '../encryption-api'
import {
  ARGON2_KDF_PHC_CI,
  ARGON2_KDF_PHC_PRODUCTION,
} from '@/lib/kdf-phc-constants'

let exposedEncryptionService: EncryptionService | null = null

const deriveArgon2KeyFromPhcMock = vi.fn(
  (_password: string, _salt: Uint8Array, phc: string) => {
    if (phc === ARGON2_KDF_PHC_CI) {
      return new Uint8Array(32).fill(1)
    }
    return new Uint8Array(32).fill(2)
  },
)

vi.mock('comlink', () => ({
  expose: (api: EncryptionService) => {
    exposedEncryptionService = api
  },
}))

vi.mock('@/wasm-pkg/bitboard_encryption/bitboard_encryption', () => ({
  deriveArgon2KeyFromPhc: deriveArgon2KeyFromPhcMock,
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

describe('encryption.worker KDF PHC handling', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    exposedEncryptionService = null
    vi.resetModules()
    await import('../encryption.worker')
  })

  it('decrypts correctly for CI PHC profile', async () => {
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
      kdfPhc: ARGON2_KDF_PHC_CI,
    })

    expect(decrypted).toBe(plaintext)
    expect(deriveArgon2KeyFromPhcMock).toHaveBeenCalledWith(
      'pw',
      expect.any(Uint8Array),
      ARGON2_KDF_PHC_CI,
    )
  })

  it('decrypts correctly for production PHC profile', async () => {
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
      kdfPhc: ARGON2_KDF_PHC_PRODUCTION,
    })

    expect(decrypted).toBe(plaintext)
    expect(deriveArgon2KeyFromPhcMock).toHaveBeenCalledWith(
      'pw',
      expect.any(Uint8Array),
      ARGON2_KDF_PHC_PRODUCTION,
    )
  })

  it('fails decryption when kdfPhc does not match ciphertext profile', async () => {
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
        kdfPhc: ARGON2_KDF_PHC_PRODUCTION,
      }),
    ).rejects.toThrow('Decryption failed: incorrect password or corrupted data')
  })
})
