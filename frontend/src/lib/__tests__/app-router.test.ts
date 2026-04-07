import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  navigateToLibraryIfOnWalletRoute,
  registerAppRouter,
} from '@/lib/app-router'
import { usePostLockPrivacyRedirectStore } from '@/stores/postLockPrivacyRedirectStore'

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
    expect(navigate).toHaveBeenCalledWith({ to: '/library/', replace: true })
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
