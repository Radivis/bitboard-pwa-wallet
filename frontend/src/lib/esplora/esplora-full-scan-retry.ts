import { errorMessage } from '@/lib/shared/utils'

/**
 * One retry of the whole scan for fast transport failures (handshake, reset, 429).
 * A per-request timeout is not retried here: the WASM budget was already spent,
 * and a second 30s wait keeps the dashboard on "Syncing…" past the regtest send check.
 * The funded-wallet test retries that case from the dashboard banner.
 */
export const DEFAULT_ESPLORA_FULL_SCAN_MAX_ATTEMPTS = 2

const DEFAULT_BASE_DELAY_MS = 1000
const DEFAULT_MAX_DELAY_MS = 8000
const BACKOFF_JITTER_MAX_MS = 300

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * Heuristic: public Esplora often fails transiently (429, handshake, reset).
 * Avoid retrying likely permanent errors (bad request, 404) by keeping this list explicit.
 */
function isEsploraFullScanRequestTimeout(normalizedDetail: string): boolean {
  return (
    normalizedDetail.includes('timeout') ||
    normalizedDetail.includes('timed out') ||
    normalizedDetail.includes('timedout')
  )
}

export function isRetryableEsploraFullScanError(detail: string): boolean {
  const normalizedDetail = detail.toLowerCase()
  if (!normalizedDetail) return false
  if (isEsploraFullScanRequestTimeout(normalizedDetail)) return false
  const patterns = [
    '429',
    '502',
    '503',
    '504',
    '408',
    'rate limit',
    'too many',
    'network',
    'failed to fetch',
    'networkerror',
    'econnreset',
    'eproto',
    'handshake',
    'ssl',
    'aborted',
    'bad gateway',
    'service unavailable',
    'connection reset',
    'connection refused',
    'error sending request',
    'error trying to connect',
  ]
  return patterns.some((pattern) => normalizedDetail.includes(pattern))
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
      const errorMessageText = errorMessage(err) ?? String(err)
      const isLast = attempt === maxAttempts - 1
      if (isLast || !isRetryableEsploraFullScanError(errorMessageText)) {
        throw err
      }
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt)
      const jitter = Math.floor(Math.random() * BACKOFF_JITTER_MAX_MS)
      await sleepMs(backoff + jitter)
    }
  }
  throw lastErr
}
