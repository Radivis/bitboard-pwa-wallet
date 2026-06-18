/**
 * Fast mock encryption worker for unit tests (PBKDF2 + AES-GCM).
 * Production uses the real encryption worker with Argon2id WASM.
 */
import { pbkdf2Sync } from 'node:crypto'
import type { EncryptedBlob } from '@/lib/shared/encrypted-blob-types'
import { ARGON2_KDF_PHC_PRODUCTION } from '@/lib/shared/kdf-phc-constants'

const SALT_LENGTH_BYTES = 16
const IV_LENGTH_BYTES = 12

let sessionPassword: string | null = null

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const rawKey = new Uint8Array(
    pbkdf2Sync(password, salt, 1000, 32, 'sha256')
  )
  return crypto.subtle.importKey(
    'raw',
    rawKey as BufferSource,
    'AES-GCM',
    false,
    ['encrypt', 'decrypt']
  )
}

async function encryptWithPassword(password: string, plaintext: string): Promise<EncryptedBlob> {
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
    kdfPhc: ARGON2_KDF_PHC_PRODUCTION,
  }
}

async function decryptWithPassword(password: string, encrypted: EncryptedBlob): Promise<string> {
  const key = await deriveKey(password, encrypted.salt)
  try {
    const plaintextBytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: encrypted.iv as unknown as BufferSource },
      key,
      encrypted.ciphertext as unknown as BufferSource
    )
    return new TextDecoder().decode(plaintextBytes)
  } catch {
    throw new Error('Decryption failed: incorrect password or corrupted data')
  }
}

function requireSessionPassword(): string {
  if (sessionPassword == null) {
    throw new Error('Wallet secrets session is not active — unlock the wallet first')
  }
  return sessionPassword
}

export function getMockEncryptionWorker() {
  return {
    setSecretsPort: async (_port: MessagePort): Promise<void> => {},

    async beginSecretsSession(password: string): Promise<void> {
      sessionPassword = password
    },

    async endSecretsSession(): Promise<void> {
      sessionPassword = null
    },

    async isSecretsSessionActive(): Promise<boolean> {
      return sessionPassword != null
    },

    deriveKeyBytes: async (
      password: string,
      salt: Uint8Array,
      _kdfPhc: string,
    ): Promise<Uint8Array> =>
      new Uint8Array(pbkdf2Sync(password, salt, 1000, 32, 'sha256')),

    async encryptData(plaintext: string): Promise<EncryptedBlob> {
      return encryptWithPassword(requireSessionPassword(), plaintext)
    },

    async decryptData(encrypted: EncryptedBlob): Promise<string> {
      return decryptWithPassword(requireSessionPassword(), encrypted)
    },

    async encryptDataWithPassword(password: string, plaintext: string): Promise<EncryptedBlob> {
      return encryptWithPassword(password, plaintext)
    },

    async decryptDataWithPassword(password: string, encrypted: EncryptedBlob): Promise<string> {
      return decryptWithPassword(password, encrypted)
    },
  }
}

/** Reset mock session between tests. */
export function resetMockEncryptionWorkerSession(): void {
  sessionPassword = null
}
