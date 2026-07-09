import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  LIBRARY_INDEX_PATH,
  navigateAwayFromWalletUnlockPrompt,
  navigateToLibraryIfOnWalletRoute,
  registerAppRouter,
} from '@/lib/shared/app-router'
import { usePostLockPrivacyRedirectStore } from '@/stores/postLockPrivacyRedirectStore'
import {
  recordNonWalletNavigationLeaving,
  resetNonWalletNavigationHistoryForTests,
} from '@/lib/navigation/non-wallet-navigation-history'

describe('navigateToLibraryIfOnWalletRoute', () => {
  beforeEach(() => {
    usePostLockPrivacyRedirectStore.getState().dismissPrivacyRedirectBanner()
  })

  it('navigates to library with replace when path is under /wallet', () => {
    const navigate = vi.fn()
    registerAppRouter({
      state: { location: { pathname: '/wallet/send' } },
      navigate,
    })
    navigateToLibraryIfOnWalletRoute()
    expect(navigate).toHaveBeenCalledWith({ to: LIBRARY_INDEX_PATH, replace: true })
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
    navigateToLibraryIfOnWalletRoute()
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

  it('falls back to library index when no non-wallet history exists', () => {
    const navigate = vi.fn()
    registerAppRouter({
      state: { location: { pathname: '/wallet' } },
      navigate,
    })

    navigateAwayFromWalletUnlockPrompt()

    expect(navigate).toHaveBeenCalledWith({ to: LIBRARY_INDEX_PATH, replace: true })
  })
})
