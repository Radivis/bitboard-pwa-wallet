import { describe, expect, it, vi } from 'vitest'
import {
  navigateToLibraryIfOnWalletRoute,
  registerAppRouter,
} from '@/lib/app-router'

describe('navigateToLibraryIfOnWalletRoute', () => {
  it('navigates to library with replace when path is under /wallet', () => {
    const navigate = vi.fn()
    registerAppRouter({
      state: { location: { pathname: '/wallet/send' } },
      navigate,
    })
    navigateToLibraryIfOnWalletRoute()
    expect(navigate).toHaveBeenCalledWith({ to: '/library/', replace: true })
  })

  it('does not navigate when not on a wallet route', () => {
    const navigate = vi.fn()
    registerAppRouter({
      state: { location: { pathname: '/library/' } },
      navigate,
    })
    navigateToLibraryIfOnWalletRoute()
    expect(navigate).not.toHaveBeenCalled()
  })
})
