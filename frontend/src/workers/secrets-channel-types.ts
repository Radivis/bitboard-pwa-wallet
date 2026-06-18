/**
 * Types for the worker-to-worker secrets channel (encryption worker ↔ crypto / arkade workers).
 * Communication uses Comlink RPC over a MessagePort; main thread never reads this channel.
 */

import type { EncryptedBlob } from '@/lib/shared/encrypted-blob-types'

/** Same shape as {@link EncryptedBlob}; name kept for channel-specific call sites. */
export type EncryptedBlobMessage = EncryptedBlob

/** API exposed by the encryption worker on the secrets port for worker peers. */
export interface SecretsChannelService {
  beginSession(password: string): Promise<void>
  endSession(): Promise<void>
  isSessionActive(): Promise<boolean>
  decrypt(encryptedBlob: EncryptedBlobMessage): Promise<string>
  encrypt(plaintext: string): Promise<EncryptedBlobMessage>
}
