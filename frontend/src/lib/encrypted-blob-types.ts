/** KDF version: 1 = CI (2 iter, 1 par), 2 = production (3 iter, 4 par). */
export type KdfVersion = 1 | 2

/** Encrypted payload: ciphertext, IV, salt, and optional KDF version (Comlink-transferable). */
export interface EncryptedBlob {
  ciphertext: Uint8Array
  iv: Uint8Array
  salt: Uint8Array
  /** Omitted or 1 = CI; 2 = production. */
  kdfVersion: KdfVersion
}
