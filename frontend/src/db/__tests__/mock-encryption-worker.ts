/**
 * Fast mock encryption worker for unit tests (PBKDF2 + AES-GCM).
 * Production uses the real encryption worker with Argon2id WASM.
 */
import { pbkdf2Sync } from 'node:crypto'
import type { EncryptedBlob } from '@/workers/encryption-api'

const SALT_LENGTH_BYTES = 16
const IV_LENGTH_BYTES = 12

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const rawKey = new Uint8Array(
    pbkdf2Sync(password, salt, 1000, 32, 'sha256')
  )
  return crypto.subtle.importKey(
    'raw',
    rawKey,
    'AES-GCM',
    false,
    ['encrypt', 'decrypt']
  )
}

export function getMockEncryptionWorker() {
  return {
    deriveKeyBytes: async (password: string, salt: Uint8Array): Promise<Uint8Array> =>
      new Uint8Array(pbkdf2Sync(password, salt, 1000, 32, 'sha256')),

    async encryptData(password: string, plaintext: string): Promise<EncryptedBlob> {
      const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES))
      const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES))
      const key = await deriveKey(password, salt)
      const plaintextBytes = new TextEncoder().encode(plaintext)
      const ciphertextBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        plaintextBytes
      )
      return {
        ciphertext: new Uint8Array(ciphertextBuffer),
        iv,
        salt,
      }
    },

    async decryptData(password: string, encrypted: EncryptedBlob): Promise<string> {
      const key = await deriveKey(password, encrypted.salt)
      try {
        const plaintextBytes = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: encrypted.iv },
          key,
          encrypted.ciphertext
        )
        return new TextDecoder().decode(plaintextBytes)
      } catch {
        throw new Error('Decryption failed: incorrect password or corrupted data')
      }
    },
  }
}
