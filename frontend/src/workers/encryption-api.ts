import type { EncryptedBlob } from '@/lib/encrypted-blob-types'
import { ARGON2_KDF_PHC_PRODUCTION } from '@/lib/kdf-phc-constants'

export type { EncryptedBlob }

export interface EncryptionService {
  setSecretsPort(port: MessagePort): Promise<void>
  deriveKeyBytes(
    password: string,
    salt: Uint8Array,
    kdfPhc?: string,
  ): Promise<Uint8Array>
  encryptData(password: string, plaintext: string): Promise<EncryptedBlob>
  decryptData(password: string, encrypted: EncryptedBlob): Promise<string>
}

/** Default KDF PHC when callers omit it (production Argon2id profile). */
export const DEFAULT_KDF_PHC_FOR_DERIVE = ARGON2_KDF_PHC_PRODUCTION
