/** Encrypted payload: ciphertext, IV, salt, and PHC-style Argon2id parameter string (Comlink-transferable). */
export interface EncryptedBlob {
  ciphertext: Uint8Array
  iv: Uint8Array
  salt: Uint8Array
  /** Argon2id PHC parameter prefix; see `kdf-phc-constants.ts`. */
  kdfPhc: string
}
