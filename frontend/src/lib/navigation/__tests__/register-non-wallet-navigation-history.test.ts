import { describe, it, expect, beforeEach, vi } from 'vitest'
import { registerNonWalletNavigationHistory } from '@/lib/navigation/register-non-wallet-navigation-history'
import {
  getLatestNonWalletPath,
  resetNonWalletNavigationHistoryForTests,
} from '@/lib/navigation/non-wallet-navigation-history'

describe('registerNonWalletNavigationHistory', () => {
  beforeEach(() => {
    resetNonWalletNavigationHistoryForTests()
  })

  it('records fromLocation on onResolved', () => {
    let listener: ((event: { fromLocation?: { pathname: string } | null }) => void) | null =
      null
    const router = {
      subscribe: vi.fn((eventType, fn) => {
        expect(eventType).toBe('onResolved')
        listener = fn
        return vi.fn()
      }),
    }

    registerNonWalletNavigationHistory(router)
    listener?.({ fromLocation: { pathname: '/settings' } })

    expect(getLatestNonWalletPath()).toBe('/settings')
  })

  it('ignores wallet fromLocation', () => {
    let listener: ((event: { fromLocation?: { pathname: string } | null }) => void) | null =
      null
    const router = {
      subscribe: vi.fn((_eventType, fn) => {
        listener = fn
        return vi.fn()
      }),
    }

    registerNonWalletNavigationHistory(router)
    listener?.({ fromLocation: { pathname: '/wallet' } })

    expect(getLatestNonWalletPath()).toBeNull()
  })
})
