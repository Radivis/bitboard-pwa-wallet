import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isRetryableEsploraFullScanError,
  withEsploraFullScanRetries,
} from '@/lib/esplora-full-scan-retry'

describe('isRetryableEsploraFullScanError', () => {
  it('returns true for rate limit and HTTP 5xx patterns', () => {
    expect(isRetryableEsploraFullScanError('HTTP status 429')).toBe(true)
    expect(isRetryableEsploraFullScanError('status 503')).toBe(true)
    expect(isRetryableEsploraFullScanError('Failed to fetch')).toBe(true)
    expect(isRetryableEsploraFullScanError('connection timeout')).toBe(true)
  })

  it('returns false for empty or likely permanent errors', () => {
    expect(isRetryableEsploraFullScanError('')).toBe(false)
    expect(isRetryableEsploraFullScanError('Invalid descriptor')).toBe(false)
  })
})

describe('withEsploraFullScanRetries', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('succeeds on first call without delay', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const p = withEsploraFullScanRetries(fn, { maxAttempts: 3 })
    await expect(p).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on retryable error then succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('HTTP status 429'))
      .mockResolvedValueOnce('recovered')
    const p = withEsploraFullScanRetries(fn, { maxAttempts: 3, baseDelayMs: 100 })
    const advance = async () => {
      await vi.advanceTimersByTimeAsync(500)
    }
    const resultP = p.then((r) => r)
    await advance()
    await expect(resultP).resolves.toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('does not retry non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Invalid witness'))
    const p = withEsploraFullScanRetries(fn, { maxAttempts: 3 })
    await expect(p).rejects.toThrow('Invalid witness')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
