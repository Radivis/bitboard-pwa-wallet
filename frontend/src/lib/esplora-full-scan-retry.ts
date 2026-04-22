import { errorMessage } from '@/lib/utils'

export const DEFAULT_ESPLORA_FULL_SCAN_MAX_ATTEMPTS = 3

const DEFAULT_BASE_DELAY_MS = 1000
const DEFAULT_MAX_DELAY_MS = 8000

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * Heuristic: public Esplora often fails transiently (429, timeouts). Avoid retrying
 * likely permanent errors (bad request, 404) by keeping this list explicit.
 */
export function isRetryableEsploraFullScanError(detail: string): boolean {
  const d = detail.toLowerCase()
  if (!d) return false
  const patterns = [
    '429',
    '502',
    '503',
    '504',
    '408',
    'timeout',
    'timed out',
    'rate limit',
    'too many',
    'network',
    'failed to fetch',
    'networkerror',
    'econnreset',
    'aborted',
    'bad gateway',
    'service unavailable',
    'gateway timeout',
  ]
  return patterns.some((p) => d.includes(p))
}

/**
 * Re-invokes the given operation (typically `fullScanWallet` against Esplora) with
 * exponential backoff for retryable errors.
 */
export async function withEsploraFullScanRetries<T>(
  operation: () => Promise<T>,
  options?: {
    maxAttempts?: number
    baseDelayMs?: number
    maxDelayMs?: number
  },
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_ESPLORA_FULL_SCAN_MAX_ATTEMPTS
  const baseDelayMs = options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS
  const maxDelayMs = options?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS

  let lastErr: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (err) {
      lastErr = err
      const msg = errorMessage(err) ?? String(err)
      const isLast = attempt === maxAttempts - 1
      if (isLast || !isRetryableEsploraFullScanError(msg)) {
        throw err
      }
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt)
      const jitter = Math.floor(Math.random() * 300)
      await sleepMs(backoff + jitter)
    }
  }
  throw lastErr
}
