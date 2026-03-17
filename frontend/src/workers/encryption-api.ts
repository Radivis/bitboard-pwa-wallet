/** KDF version: 1 = CI (2 iter, 1 par), 2 = production (3 iter, 4 par). */
export type KdfVersion = 1 | 2

/** Encrypted payload: ciphertext, IV, salt, and optional KDF version (Comlink-transferable). */
export interface EncryptedBlob {
  ciphertext: Uint8Array
  iv: Uint8Array
  salt: Uint8Array
  /** Omitted or 1 = CI; 2 = production. */
  kdfVersion?: KdfVersion
}

export interface EncryptionService {
  deriveKeyBytes(password: string, salt: Uint8Array, kdfVersion?: KdfVersion): Promise<Uint8Array>;
  encryptData(password: string, plaintext: string): Promise<EncryptedBlob>;
  decryptData(password: string, encrypted: EncryptedBlob): Promise<string>;
  /** Sets the port for worker-to-worker secrets channel (decrypt/encrypt). Call once from main thread. */
  setSecretsPort(port: MessagePort): Promise<void>;
}
