import { getDatabase } from '@/db/database'
import {
  getWalletSecretsEncrypted,
  updateWalletSecretsEncryptedPayloadWithRetry,
  type EncryptedWalletSecretsBlob,
} from '@/db/wallet-persistence'

/** Maps the current payload ciphertext to the next one. May run again after a conflict. */
export type EncryptedPayloadTransform = (
  currentPayload: EncryptedWalletSecretsBlob,
) => Promise<EncryptedWalletSecretsBlob>

/**
 * Main-thread DB bridge: ciphertext only — no decrypt on this path.
 * There is deliberately no "write this blob" method: a blob computed before the write
 * would overwrite whatever another writer committed in between.
 */
export interface EncryptedWalletSecretsHost {
  readEncryptedPayload(walletId: number): Promise<EncryptedWalletSecretsBlob>
  /**
   * Read, transform, and CAS-write as one same-tab critical section.
   * On a conflict the transform runs again on the newer ciphertext.
   */
  updateEncryptedPayload(walletId: number, transform: EncryptedPayloadTransform): Promise<void>
}

export type EncryptedWalletSecretsHostOptions = {
  /** Aborted when the worker using this host is terminated. */
  detachSignal?: AbortSignal
}

const WORKER_DETACHED_ERROR_MESSAGE =
  'Wallet secrets update was abandoned because its worker was detached'

/**
 * A terminated worker never settles its Comlink calls. Without this, its transform
 * would hold the wallet-secrets critical section forever.
 */
function rejectWhenDetached<T>(work: Promise<T>, detachSignal?: AbortSignal): Promise<T> {
  if (detachSignal == null) {
    return work
  }
  if (detachSignal.aborted) {
    return Promise.reject(new Error(WORKER_DETACHED_ERROR_MESSAGE))
  }
  let onDetach: () => void = () => undefined
  const detached = new Promise<never>((_resolve, reject) => {
    onDetach = () => reject(new Error(WORKER_DETACHED_ERROR_MESSAGE))
    detachSignal.addEventListener('abort', onDetach, { once: true })
  })
  return Promise.race([work, detached]).finally(() => {
    detachSignal.removeEventListener('abort', onDetach)
  })
}

export function createEncryptedWalletSecretsHost(
  options: EncryptedWalletSecretsHostOptions = {},
): EncryptedWalletSecretsHost {
  return {
    async readEncryptedPayload(walletId) {
      const encrypted = await getWalletSecretsEncrypted(getDatabase(), walletId)
      return encrypted.payload
    },
    async updateEncryptedPayload(walletId, transform) {
      await updateWalletSecretsEncryptedPayloadWithRetry({
        walletDb: getDatabase(),
        walletId,
        transform: (currentPayload) =>
          rejectWhenDetached(transform(currentPayload), options.detachSignal),
      })
    },
  }
}
