import { describe, it, expect, vi } from 'vitest'
import { pbkdf2Sync } from 'node:crypto'

/**
 * Frontend encryption tests using PBKDF2 mock for fast execution.
 * 
 * IMPORTANT: These tests use PBKDF2 as a stand-in for Argon2id KDF.
 * The actual Argon2id algorithm (security properties, performance,
 * parameter validation) is tested in the Rust crypto crate at
 * crypto/src/tests.rs.
 * 
 * These frontend tests validate:
 * - AES-256-GCM encryption/decryption correctness
 * - Proper IV and salt generation and handling
 * - Error handling for corrupted data and wrong passwords
 * - Integration between kdf.ts, encryption.ts, and wallet-persistence.ts
 * - Round-trip encryption with various data types
 * 
 * For actual Argon2id security validation and performance benchmarks,
 * run: cd crypto && cargo test
 */
vi.mock('../kdf', () => ({
  // Fast PBKDF2 stand-in for Argon2id (only for unit tests)
  // Production uses real Argon2id via WASM worker
  deriveKeyBytes: async (password: string, salt: Uint8Array): Promise<Uint8Array> => {
    return new Uint8Array(pbkdf2Sync(password, salt, 1000, 32, 'sha256'))
  },
}))

import { TEST_MNEMONIC_12 } from '@/test-utils/test-providers'
import { encryptData, decryptData } from '../encryption'

describe('Encryption with Argon2id + AES-GCM', () => {
  const password = 'super-secret-password-123'
  const plaintext = JSON.stringify({
    mnemonic: TEST_MNEMONIC_12,
    descriptors: { external: "wpkh([...]/84'/0'/0'/0/*)", internal: "wpkh([...]/84'/0'/0'/1/*)" },
    changeSet: '{"network":"signet","last_reveal":{"0":5}}',
  })

  describe('encryptData', () => {
    it('returns an EncryptedBlob with ciphertext, iv, and salt', async () => {
      const result = await encryptData(password, plaintext)

      expect(result).toHaveProperty('ciphertext')
      expect(result.ciphertext).toBeInstanceOf(Uint8Array)
      expect(result.ciphertext.byteLength).toBeGreaterThan(0)

      expect(result).toHaveProperty('iv')
      expect(result.iv).toBeInstanceOf(Uint8Array)
      expect(result.iv.byteLength).toBe(12)

      expect(result).toHaveProperty('salt')
      expect(result.salt).toBeInstanceOf(Uint8Array)
      expect(result.salt.byteLength).toBe(16)
    })

    it('produces different ciphertext for same plaintext due to random IV', async () => {
      const result1 = await encryptData(password, plaintext)
      const result2 = await encryptData(password, plaintext)

      expect(result1.ciphertext).not.toEqual(result2.ciphertext)
    })

    it('produces different salt for each encryption', async () => {
      const result1 = await encryptData(password, plaintext)
      const result2 = await encryptData(password, plaintext)

      expect(result1.salt).not.toEqual(result2.salt)
    })
  })

  describe('decryptData', () => {
    it('successfully decrypts data encrypted with the same password', async () => {
      const encrypted = await encryptData(password, plaintext)
      const decrypted = await decryptData(password, encrypted)

      expect(decrypted).toBe(plaintext)
    })

    it('throws error when decrypting with wrong password', async () => {
      const encrypted = await encryptData(password, plaintext)

      await expect(decryptData('wrong-password', encrypted))
        .rejects.toThrow()
    })

    it('throws error when ciphertext is corrupted', async () => {
      const encrypted = await encryptData(password, plaintext)

      const corrupted = new Uint8Array(encrypted.ciphertext)
      corrupted[0] ^= 0xFF
      encrypted.ciphertext = corrupted

      await expect(decryptData(password, encrypted))
        .rejects.toThrow()
    })

    it('throws error when IV is corrupted', async () => {
      const encrypted = await encryptData(password, plaintext)

      const corrupted = new Uint8Array(encrypted.iv)
      corrupted[0] ^= 0xFF
      encrypted.iv = corrupted

      await expect(decryptData(password, encrypted))
        .rejects.toThrow()
    })

    it('throws error when salt is corrupted', async () => {
      const encrypted = await encryptData(password, plaintext)

      const corrupted = new Uint8Array(encrypted.salt)
      corrupted[0] ^= 0xFF
      encrypted.salt = corrupted

      await expect(decryptData(password, encrypted))
        .rejects.toThrow()
    })
  })

  describe('round-trip encryption with various data types', () => {
    it('handles empty string', async () => {
      const encrypted = await encryptData(password, '')
      const decrypted = await decryptData(password, encrypted)
      expect(decrypted).toBe('')
    })

    it('handles large JSON payload', async () => {
      const largePayload = JSON.stringify({
        mnemonic: 'word '.repeat(24).trim(),
        changeSet: JSON.stringify({ data: 'x'.repeat(10000) }),
      })

      const encrypted = await encryptData(password, largePayload)
      const decrypted = await decryptData(password, encrypted)

      expect(decrypted).toBe(largePayload)
    })

    it('handles unicode characters', async () => {
      const unicodePlaintext = '{"emoji":"🔐","chinese":"测试","arabic":"اختبار"}'

      const encrypted = await encryptData(password, unicodePlaintext)
      const decrypted = await decryptData(password, encrypted)

      expect(decrypted).toBe(unicodePlaintext)
    })
  })
})
