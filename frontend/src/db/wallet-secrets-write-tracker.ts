/**
 * Tracks in-flight encrypted `wallet_secrets` payload updates (CAS retry helpers).
 * Lock/switch flows await these so optimistic UI updates are not dropped mid-write.
 */
const pendingWalletSecretsWrites = new Set<Promise<unknown>>()

export const WALLET_SECRETS_FLUSH_TIMEOUT_MS = 60_000

const DEADLINE_REACHED = Symbol('wallet-secrets-flush-deadline-reached')

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
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined
  const deadlineReached = new Promise<typeof DEADLINE_REACHED>((resolve) => {
    deadlineTimer = setTimeout(() => resolve(DEADLINE_REACHED), WALLET_SECRETS_FLUSH_TIMEOUT_MS)
  })
  try {
    while (pendingWalletSecretsWrites.size > 0) {
      const snapshot = [...pendingWalletSecretsWrites]
      const outcome = await Promise.race([Promise.allSettled(snapshot), deadlineReached])
      if (outcome === DEADLINE_REACHED) {
        reportFlushTimeout()
        return
      }
    }
  } finally {
    clearTimeout(deadlineTimer)
  }
}

function reportFlushTimeout(): void {
  if (!import.meta.env.DEV) {
    return
  }
  console.error('[wallet-secrets] awaitInFlightWalletSecretsWrites timed out', {
    pending: pendingWalletSecretsWrites.size,
  })
}
