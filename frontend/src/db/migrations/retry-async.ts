/**
 * Retries an async operation with a fixed delay between attempts (for intermittent storage / worker glitches).
 */

/** Shared retry policy for Kysely schema migrations (wallet and lab databases). */
export const SCHEMA_MIGRATION_RETRY_MAX_ATTEMPTS = 3
export const SCHEMA_MIGRATION_RETRY_DELAY_MS = 2000

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export async function withRetries<T>(
  operation: () => Promise<T>,
  options: { maxAttempts: number; delayMs: number },
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (attempt < options.maxAttempts) {
        await delay(options.delayMs)
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}
