import { describe, expect, it, vi } from 'vitest'
import { delay, withRetries } from '../retry-async'

describe('withRetries', () => {
  it('returns on first success', async () => {
    const fn = vi.fn().mockResolvedValue(42)
    const result = await withRetries(fn, { maxAttempts: 3, delayMs: 0 })
    expect(result).toBe(42)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries then succeeds', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('a')).mockResolvedValueOnce(7)
    const result = await withRetries(fn, { maxAttempts: 3, delayMs: 0 })
    expect(result).toBe(7)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('throws last error after max attempts', async () => {
    const err = new Error('final')
    const fn = vi.fn().mockRejectedValue(err)
    await expect(withRetries(fn, { maxAttempts: 2, delayMs: 0 })).rejects.toThrow('final')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('delay', () => {
  it('resolves after the given ms', async () => {
    vi.useFakeTimers()
    const p = delay(1000)
    await vi.advanceTimersByTimeAsync(1000)
    await expect(p).resolves.toBeUndefined()
    vi.useRealTimers()
  })
})
