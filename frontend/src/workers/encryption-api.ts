import type { EncryptedBlob } from '@/lib/shared/encrypted-blob-types'
import { ARGON2_KDF_PHC_PRODUCTION } from '@/lib/shared/kdf-phc-constants'

export type { EncryptedBlob }

export interface EncryptionService {
  setSecretsPort(port: MessagePort): Promise<void>
  beginSecretsSession(password: string): Promise<void>
  endSecretsSession(): Promise<void>
  isSecretsSessionActive(): Promise<boolean>
  deriveKeyBytes(
    password: string,
    salt: Uint8Array,
    kdfPhc: string,
  ): Promise<Uint8Array>
  encryptData(plaintext: string): Promise<EncryptedBlob>
  decryptData(encrypted: EncryptedBlob): Promise<string>
  /** One-shot encrypt without an active wallet session (near-zero wrapper, tests). */
  encryptDataWithPassword(password: string, plaintext: string): Promise<EncryptedBlob>
  /** One-shot decrypt without an active wallet session. */
  decryptDataWithPassword(password: string, encrypted: EncryptedBlob): Promise<string>
  /** ML-DSA-65 signed manifest JSON (pretty-printed). */
  signWalletBackupManifest(
    sqliteBytes: Uint8Array,
    password: string,
    salt: Uint8Array,
    kdfPhc: string,
  ): Promise<string>
  /** Throws if signature invalid or password wrong. */
  verifyWalletBackupManifest(
    sqliteBytes: Uint8Array,
    password: string,
    manifestJson: string,
  ): Promise<void>
}

/** Default KDF PHC when callers omit it (production Argon2id profile). */
export const DEFAULT_KDF_PHC_FOR_DERIVE = ARGON2_KDF_PHC_PRODUCTION
