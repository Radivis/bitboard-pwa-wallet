import { describe, it, expect, beforeEach } from 'vitest'
import {
  getLatestNonWalletPath,
  getNonWalletNavigationHistoryForTests,
  recordNonWalletNavigationLeaving,
  resetNonWalletNavigationHistoryForTests,
} from '@/lib/navigation/non-wallet-navigation-history'

describe('non-wallet-navigation-history', () => {
  beforeEach(() => {
    resetNonWalletNavigationHistoryForTests()
  })

  it('records non-wallet pathnames when leaving them', () => {
    recordNonWalletNavigationLeaving('/settings')
    recordNonWalletNavigationLeaving('/library/history')
    expect(getLatestNonWalletPath()).toBe('/library/history')
  })

  it('does not record wallet routes', () => {
    recordNonWalletNavigationLeaving('/wallet/management')
    expect(getLatestNonWalletPath()).toBeNull()
  })

  it('skips duplicate consecutive entries', () => {
    recordNonWalletNavigationLeaving('/settings')
    recordNonWalletNavigationLeaving('/settings')
    expect(getNonWalletNavigationHistoryForTests()).toEqual(['/settings'])
  })

  it('ignores empty previous pathname', () => {
    recordNonWalletNavigationLeaving('')
    expect(getLatestNonWalletPath()).toBeNull()
  })
})
