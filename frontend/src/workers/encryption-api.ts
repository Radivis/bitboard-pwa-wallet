/** Encrypted payload: ciphertext, IV, and salt (Comlink-transferable). */
export interface EncryptedBlob {
  ciphertext: Uint8Array
  iv: Uint8Array
  salt: Uint8Array
}

export interface EncryptionService {
  deriveKeyBytes(password: string, salt: Uint8Array): Promise<Uint8Array>;
  encryptData(password: string, plaintext: string): Promise<EncryptedBlob>;
  decryptData(password: string, encrypted: EncryptedBlob): Promise<string>;
  /** Sets the port for worker-to-worker secrets channel (decrypt/encrypt). Call once from main thread. */
  setSecretsPort(port: MessagePort): Promise<void>;
}
