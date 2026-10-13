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
  /** Upper bound for one transform run; defaults to {@link DEFAULT_TRANSFORM_TIMEOUT_MS}. */
  transformTimeoutMs?: number
}

/**
 * A transform decrypts and re-encrypts with Argon2id, which takes seconds. Anything far
 * beyond that is a stuck worker that would otherwise hold the critical section forever.
 */
const DEFAULT_TRANSFORM_TIMEOUT_MS = 60_000

const WORKER_DETACHED_ERROR_MESSAGE =
  'Wallet secrets update was abandoned because its worker was detached'

const TRANSFORM_TIMED_OUT_ERROR_MESSAGE =
  'Wallet secrets update was abandoned because its transform did not finish in time'

function rejectWhenTimedOut<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<never>((_resolve, reject) => {
    timeoutTimer = setTimeout(
      () => reject(new Error(TRANSFORM_TIMED_OUT_ERROR_MESSAGE)),
      timeoutMs,
    )
  })
  return Promise.race([work, timedOut]).finally(() => {
    clearTimeout(timeoutTimer)
  })
}

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
          rejectWhenTimedOut(
            rejectWhenDetached(transform(currentPayload), options.detachSignal),
            options.transformTimeoutMs ?? DEFAULT_TRANSFORM_TIMEOUT_MS,
          ),
      })
    },
  }
}
