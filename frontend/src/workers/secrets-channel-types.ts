/**
 * Types for the worker-to-worker secrets channel (encryption worker ↔ crypto worker).
 * Communication uses Comlink RPC over a MessagePort; main thread never reads this channel.
 */

import type { EncryptedBlob, KdfVersion } from '@/lib/encrypted-blob-types'

export type { KdfVersion }

/** Same shape as {@link EncryptedBlob}; name kept for channel-specific call sites. */
export type EncryptedBlobMessage = EncryptedBlob

/** API exposed by the encryption worker on the secrets port for the crypto worker. */
export interface SecretsChannelService {
  decrypt(password: string, encryptedBlob: EncryptedBlobMessage): Promise<string>;
  encrypt(password: string, plaintext: string): Promise<EncryptedBlobMessage>;
}
