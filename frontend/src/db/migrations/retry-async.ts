/**
 * Retries an async operation with a fixed delay between attempts (for intermittent storage / worker glitches).
 */
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
