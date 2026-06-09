import { getEncryptionWorker } from '@/workers/encryption-factory'
import type { EncryptedBlob } from '@/lib/shared/encrypted-blob-types'

/** Re-export so wallet-persistence and tests keep the same import shape. */
export type { EncryptedBlob } from '@/lib/shared/encrypted-blob-types'

/**
 * Encrypts plaintext using the active wallet secrets session in the encryption worker.
 */
export async function encryptData(plaintext: string): Promise<EncryptedBlob> {
  return getEncryptionWorker().encryptData(plaintext)
}

/**
 * Decrypts data encrypted with {@link encryptData} via the active wallet secrets session.
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
