import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/components/UpgradeFromNearZeroPasswordModal', () => ({
  UpgradeFromNearZeroPasswordModal: () => null,
}))

import {
  NEAR_ZERO_BANNER_SESSION_DISMISS_KEY,
  NearZeroSecurityBanner,
} from '@/components/NearZeroSecurityBanner'
import {
  noMnemonicBackupBannerSessionDismissKey,
  NoMnemonicBackupBanner,
} from '@/components/NoMnemonicBackupBanner'

const routerMocks = vi.hoisted(() => ({
  pathname: '/wallet',
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useLocation: () => ({ pathname: routerMocks.pathname, search: '', hash: '' }),
}))

vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: (selector: (s: { password: string | null }) => unknown) =>
    selector({ password: 'secret' }),
}))

const nearZeroState = vi.hoisted(() => ({ active: true }))
vi.mock('@/stores/nearZeroSecurityStore', () => ({
  useNearZeroSecurityStore: (selector: (s: typeof nearZeroState) => unknown) =>
    selector(nearZeroState),
}))

const walletMocks = vi.hoisted(() => ({
  activeWalletId: 1 as number | null,
}))
vi.mock('@/stores/walletStore', () => ({
  useWalletStore: (selector: (s: typeof walletMocks & { activeWalletId: number | null }) => unknown) =>
    selector({
      ...walletMocks,
      activeWalletId: walletMocks.activeWalletId,
    }),
}))

vi.mock('@/db', () => ({
  useWalletNoMnemonicBackupFlag: () => ({ data: true }),
}))

describe('security banners: dismiss reset on /wallet/receive', () => {
  beforeEach(() => {
    sessionStorage.clear()
    routerMocks.pathname = '/wallet'
    nearZeroState.active = true
    walletMocks.activeWalletId = 1
  })

  it('NearZeroSecurityBanner shows again on Receive after session dismiss was set on another route', () => {
    sessionStorage.setItem(NEAR_ZERO_BANNER_SESSION_DISMISS_KEY, '1')
    const { rerender } = render(<NearZeroSecurityBanner />)
    expect(
      screen.queryByText(/Near-zero security mode is active/i),
    ).not.toBeInTheDocument()

    routerMocks.pathname = '/wallet/receive'
    rerender(<NearZeroSecurityBanner />)
    expect(
      screen.getByText(/Near-zero security mode is active/i),
    ).toBeInTheDocument()
    expect(sessionStorage.getItem(NEAR_ZERO_BANNER_SESSION_DISMISS_KEY)).toBeNull()
  })

  it('NoMnemonicBackupBanner shows again on Receive after session dismiss was set on another route', () => {
    const key = noMnemonicBackupBannerSessionDismissKey(1)
    sessionStorage.setItem(key, '1')
    const { rerender } = render(<NoMnemonicBackupBanner />)
    expect(
      screen.queryByText(/Seed phrase not backed up for this wallet/i),
    ).not.toBeInTheDocument()

    routerMocks.pathname = '/wallet/receive'
    rerender(<NoMnemonicBackupBanner />)
    expect(
      screen.getByText(/Seed phrase not backed up for this wallet/i),
    ).toBeInTheDocument()
    expect(sessionStorage.getItem(key)).toBeNull()
  })
})
