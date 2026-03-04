import { deriveKeyBytes } from './kdf'

export interface EncryptedBlob {
  ciphertext: Uint8Array
  iv: Uint8Array
  salt: Uint8Array
}

const SALT_LENGTH_BYTES = 16
const IV_LENGTH_BYTES = 12

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const rawKey = await deriveKeyBytes(password, salt)

  return crypto.subtle.importKey(
    'raw',
    rawKey,
    'AES-GCM',
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypts plaintext using Argon2id KDF + AES-256-GCM.
 *
 * @param password - User password for key derivation
 * @param plaintext - Data to encrypt (will be UTF-8 encoded)
 * @returns Encrypted blob with ciphertext, IV, and salt
 *
 * @remarks
 * - Key derivation uses Argon2id (64 MB, 3 iterations, parallelism 4) via WASM worker
 * - Generates random 96-bit IV and 128-bit salt per call
 * - AES-GCM provides authenticated encryption (tamper detection)
 */
export async function encryptData(
  password: string,
  plaintext: string
): Promise<EncryptedBlob> {
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
}

/**
 * Decrypts data encrypted with {@link encryptData}.
 *
 * @param password - User password (must match encryption password)
 * @param encrypted - Encrypted blob from encryptData()
 * @returns Decrypted plaintext string
 *
 * @throws {Error} If password is incorrect or data is corrupted
 */
export async function decryptData(
  password: string,
  encrypted: EncryptedBlob
): Promise<string> {
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
}
