import { getEncryptionWorker } from '@/workers/encryption-factory'
import type { EncryptedBlob } from '@/lib/encrypted-blob-types'

/** Re-export so wallet-persistence and tests keep the same import shape. */
export type { EncryptedBlob } from '@/lib/encrypted-blob-types'

/**
 * Encrypts plaintext using Argon2id KDF + AES-256-GCM.
 * Key derivation and encryption run in the encryption worker; key material never touches the main thread.
 *
 * @param password - User password for key derivation
 * @param plaintext - Data to encrypt (will be UTF-8 encoded)
 * @returns Encrypted blob with ciphertext, IV, and salt
 */
export async function encryptData(
  password: string,
  plaintext: string
): Promise<EncryptedBlob> {
  return getEncryptionWorker().encryptData(password, plaintext)
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
  return getEncryptionWorker().decryptData(password, encrypted)
}
