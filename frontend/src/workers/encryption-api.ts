import type { EncryptedBlob, KdfVersion } from '@/lib/encrypted-blob-types'

export type { EncryptedBlob, KdfVersion }

export interface EncryptionService {
  deriveKeyBytes(password: string, salt: Uint8Array, kdfVersion?: KdfVersion): Promise<Uint8Array>;
  encryptData(password: string, plaintext: string): Promise<EncryptedBlob>;
  decryptData(password: string, encrypted: EncryptedBlob): Promise<string>;
  /** Sets the port for worker-to-worker secrets channel (decrypt/encrypt). Call once from main thread. */
  setSecretsPort(port: MessagePort): Promise<void>;
}
