import { describe, expect, it, vi } from 'vitest'
import {
  isPersistedChainMismatchError,
  withPersistedChainMismatchRetry,
} from '@/lib/wallet/persisted-chain-mismatch'

describe('isPersistedChainMismatchError', () => {
  it('detects network mismatch messages', () => {
    expect(
      isPersistedChainMismatchError(new Error('Wallet error: Network mismatch')),
    ).toBe(true)
  })

  it('returns false for unrelated errors', () => {
    expect(isPersistedChainMismatchError(new Error('timeout'))).toBe(false)
  })

  it('detects descriptor mismatch messages', () => {
    expect(
      isPersistedChainMismatchError(
        new Error(
          'Wallet error: Descriptor mismatch for External keychain: loaded tr([aaa/0/*]), expected tr([bbb/0/*])',
        ),
      ),
    ).toBe(true)
  })
})

describe('withPersistedChainMismatchRetry', () => {
  it('retries with useEmptyChain when persisted chain mismatches', async () => {
    const open = vi
      .fn()
      .mockRejectedValueOnce(new Error('Genesis hash mismatch'))
      .mockResolvedValueOnce({ id: 'session' })

    const { result, usedEmptyChainFallback } =
      await withPersistedChainMismatchRetry(open, {
        network: 'bitcoin',
        useEmptyChain: false,
      })

    expect(result).toEqual({ id: 'session' })
    expect(usedEmptyChainFallback).toBe(true)
    expect(open).toHaveBeenCalledTimes(2)
    expect(open.mock.calls[1][0]).toMatchObject({ useEmptyChain: true })
  })

  it('does not retry when useEmptyChain is already true', async () => {
    const open = vi.fn().mockRejectedValue(new Error('Network mismatch'))

    await expect(
      withPersistedChainMismatchRetry(open, { useEmptyChain: true }),
    ).rejects.toThrow('Network mismatch')
    expect(open).toHaveBeenCalledTimes(1)
  })
})
