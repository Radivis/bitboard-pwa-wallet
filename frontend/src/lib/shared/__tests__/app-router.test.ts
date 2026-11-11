import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  START_PATH,
  navigateAwayFromWalletUnlockPrompt,
  navigateToStartIfOnWalletRoute,
  registerAppRouter,
} from '@/lib/shared/app-router'
import { usePostLockPrivacyRedirectStore } from '@/stores/postLockPrivacyRedirectStore'
import {
  recordNonWalletNavigationLeaving,
  resetNonWalletNavigationHistoryForTests,
} from '@/lib/navigation/non-wallet-navigation-history'

describe('navigateToStartIfOnWalletRoute', () => {
  beforeEach(() => {
    usePostLockPrivacyRedirectStore.getState().dismissPrivacyRedirectBanner()
  })

  it('navigates to Start with replace when path is under /wallet', () => {
    const navigate = vi.fn()
    registerAppRouter({
      state: { location: { pathname: '/wallet/send' } },
      navigate,
    })
    navigateToStartIfOnWalletRoute()
    expect(navigate).toHaveBeenCalledWith({ to: START_PATH, replace: true })
    expect(usePostLockPrivacyRedirectStore.getState().privacyRedirect).toEqual({
      returnPath: '/wallet/send',
    })
  })

  it('does not navigate when not on a wallet route', () => {
    const navigate = vi.fn()
    registerAppRouter({
      state: { location: { pathname: '/library/' } },
      navigate,
    })
    navigateToStartIfOnWalletRoute()
    expect(navigate).not.toHaveBeenCalled()
    expect(usePostLockPrivacyRedirectStore.getState().privacyRedirect).toBeNull()
  })
})

describe('navigateAwayFromWalletUnlockPrompt', () => {
  beforeEach(() => {
    resetNonWalletNavigationHistoryForTests()
  })

  it('navigates to the latest non-wallet path when available', () => {
    recordNonWalletNavigationLeaving('/settings')
    const navigate = vi.fn()
    registerAppRouter({
      state: { location: { pathname: '/wallet' } },
      navigate,
    })

    navigateAwayFromWalletUnlockPrompt()

    expect(navigate).toHaveBeenCalledWith({ to: '/settings', replace: true })
  })

  it('falls back to Start when no non-wallet history exists', () => {
    const navigate = vi.fn()
    registerAppRouter({
      state: { location: { pathname: '/wallet' } },
      navigate,
    })

    navigateAwayFromWalletUnlockPrompt()

    expect(navigate).toHaveBeenCalledWith({ to: START_PATH, replace: true })
  })
})
