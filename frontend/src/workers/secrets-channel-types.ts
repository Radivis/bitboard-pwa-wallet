/**
 * Types for the worker-to-worker secrets channel (encryption worker ↔ crypto worker).
 * Communication uses Comlink RPC over a MessagePort; main thread never reads this channel.
 */

/** KDF version: 1 = CI, 2 = production. */
export type KdfVersion = 1 | 2;

export interface EncryptedBlobMessage {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  salt: Uint8Array;
  /** Omitted or 1 = CI; 2 = production. */
  kdfVersion?: KdfVersion;
}

/** API exposed by the encryption worker on the secrets port for the crypto worker. */
export interface SecretsChannelService {
  decrypt(password: string, encryptedBlob: EncryptedBlobMessage): Promise<string>;
  encrypt(password: string, plaintext: string): Promise<EncryptedBlobMessage>;
}
