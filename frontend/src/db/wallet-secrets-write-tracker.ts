/**
 * Tracks in-flight encrypted `wallet_secrets` payload updates (CAS retry helpers).
 * Lock/switch flows await these so optimistic UI updates are not dropped mid-write.
 */
const pendingWalletSecretsWrites = new Set<Promise<unknown>>()

const WALLET_SECRETS_FLUSH_TIMEOUT_MS = 60_000

export function trackWalletSecretsWrite<T>(promise: Promise<T>): Promise<T> {
  pendingWalletSecretsWrites.add(promise)
  // Return the `finally` promise so its rejection is never discarded (voiding `.finally()`
  // leaves a sibling promise that rejects with the same reason and triggers unhandledrejection).
  return promise.finally(() => {
    pendingWalletSecretsWrites.delete(promise)
  })
}

/**
 * Waits until all tracked writes finish (e.g. before purging session state on lock).
 * Times out so a hung write cannot block lock forever.
 */
export async function awaitInFlightWalletSecretsWrites(): Promise<void> {
  const deadline = Date.now() + WALLET_SECRETS_FLUSH_TIMEOUT_MS
  while (pendingWalletSecretsWrites.size > 0) {
    if (Date.now() > deadline) {
      if (import.meta.env.DEV) {
        console.error(
          '[wallet-secrets] awaitInFlightWalletSecretsWrites timed out',
          { pending: pendingWalletSecretsWrites.size },
        )
      }
      break
    }
    const snapshot = [...pendingWalletSecretsWrites]
    await Promise.allSettled(snapshot)
  }
}
