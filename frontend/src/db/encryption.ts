import { getEncryptionWorker } from '@/workers/encryption-factory'
import type { EncryptedBlob } from '@/lib/shared/encrypted-blob-types'

/** Re-export so wallet-persistence and tests keep the same import shape. */
export type { EncryptedBlob } from '@/lib/shared/encrypted-blob-types'

/**
 * Encrypts plaintext using Argon2id KDF + AES-256-GCM using
 * the active wallet secrets session in the encryption worker.
 * Key derivation and encryption run in the encryption worker
 * key material never touches the main thread.
 *
 * @param plaintext - Data to encrypt (will be UTF-8 encoded)
 * @returns Encrypted blob with ciphertext, IV, and salt
 */
export async function encryptData(plaintext: string): Promise<EncryptedBlob> {
  return getEncryptionWorker().encryptData(plaintext)
}

/**
 * Decrypts data encrypted with {@link encryptData} via the active wallet secrets session.
 *
 * @param encrypted - Encrypted blob from encryptData()
 * @returns Decrypted plaintext string
 *
 * @throws {Error} If password is incorrect or data is corrupted
 */
export async function decryptData(encrypted: EncryptedBlob): Promise<string> {
  return getEncryptionWorker().decryptData(encrypted)
}

/** One-shot encrypt with an explicit password (near-zero wrapper, change-password, tests). */
export async function encryptDataWithPassword(
  password: string,
  plaintext: string,
): Promise<EncryptedBlob> {
  return getEncryptionWorker().encryptDataWithPassword(password, plaintext)
}

/** One-shot decrypt with an explicit password. */
export async function decryptDataWithPassword(
  password: string,
  encrypted: EncryptedBlob,
): Promise<string> {
  return getEncryptionWorker().decryptDataWithPassword(password, encrypted)
}
