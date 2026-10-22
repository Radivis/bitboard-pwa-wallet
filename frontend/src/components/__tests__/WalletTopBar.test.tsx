import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { WalletTopBar, type WalletTopBarProps } from '@/components/WalletTopBar'
import { InfomodeProvider } from '@/components/infomode/InfomodeProvider'
import { createTestQueryClient } from '@/test-utils/test-utils'
import { useNearZeroSecurityStore } from '@/stores/nearZeroSecurityStore'
import { usePostLockPrivacyRedirectStore } from '@/stores/postLockPrivacyRedirectStore'
import { useWalletStore } from '@/stores/walletStore'

const dbState = vi.hoisted(() => ({
  wallets: [] as { walletId: number; name: string }[],
  activeWallet: null as { walletId: number; name: string } | null,
}))

const orchestrateLockMock = vi.hoisted(() => vi.fn())

vi.mock('@/db', () => ({
  useWallets: () => ({ data: dbState.wallets }),
  useWallet: () => ({
    data: dbState.activeWallet,
    isSuccess: dbState.activeWallet != null,
  }),
}))

vi.mock('@/lib/wallet/lifecycle/lock-lifecycle-orchestrator', () => ({
  orchestrateLock: orchestrateLockMock,
}))

vi.mock('@/components/WalletUnlock', () => ({
  WalletUnlock: ({ onUnlockSuccess }: { onUnlockSuccess?: () => void }) => (
    <div role="dialog" aria-label="Unlock Wallet">
      <button type="button" onClick={() => onUnlockSuccess?.()}>
        Complete unlock
      </button>
    </div>
  ),
}))

vi.mock('@/db/storage-adapter', () => ({
  sqliteStorage: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}))

function TopBarHarness() {
  const [sideDrawerOpen, setSideDrawerOpen] = useState(false)
  const [networkDrawerOpen, setNetworkDrawerOpen] = useState(false)
  const barProps: WalletTopBarProps = {
    sideDrawerOpen,
    networkDrawerOpen,
    onToggleSideDrawer: () => {
      setNetworkDrawerOpen(false)
      setSideDrawerOpen((open) => !open)
    },
    onToggleNetworkDrawer: () => {
      setSideDrawerOpen(false)
      setNetworkDrawerOpen((open) => !open)
    },
  }
  return (
    <>
      <WalletTopBar {...barProps} />
      <Outlet />
    </>
  )
}

async function renderTopBar(initialPath = '/library') {
  const queryClient = createTestQueryClient()
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <InfomodeProvider>
          <TopBarHarness />
        </InfomodeProvider>
      </QueryClientProvider>
    ),
  })
  const libraryRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'library',
    component: () => <Link to="/settings">Open settings</Link>,
  })
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'settings',
    component: () => <div>Settings page</div>,
  })
  const receiveRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'wallet/receive',
    component: () => <div>Receive page</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([libraryRoute, settingsRoute, receiveRoute]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  const view = render(<RouterProvider router={router} />)
  await screen.findByRole('button', { name: 'Home' })
  return view
}

describe('WalletTopBar', () => {
  beforeEach(() => {
    dbState.wallets = []
    dbState.activeWallet = null
    orchestrateLockMock.mockReset()
    orchestrateLockMock.mockResolvedValue(undefined)
    useWalletStore.setState({
      walletStatus: 'none',
      activeWalletId: null,
      networkMode: 'testnet',
      loadedDescriptorWallet: null,
    })
    usePostLockPrivacyRedirectStore.getState().dismissPrivacyRedirectBanner()
    useNearZeroSecurityStore.setState({ active: false })
    document.title = ''
  })

  afterEach(() => {
    document.title = ''
  })

  it('hides back on the first history entry and goes back after a later page', async () => {
    const user = userEvent.setup()
    await renderTopBar()

    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Home' }).tagName).toBe('BUTTON')
    expect(screen.queryByRole('link', { name: 'Home' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Open settings' }))
    expect(await screen.findByText('Settings page')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(await screen.findByRole('link', { name: 'Open settings' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
  })

  it('keeps the current page when the home logo is clicked', async () => {
    const user = userEvent.setup()
    await renderTopBar()

    await user.click(screen.getByRole('button', { name: 'Home' }))

    expect(screen.getByRole('link', { name: 'Open settings' })).toBeInTheDocument()
  })

  it('shows the network badge only while the wallet is unlocked', async () => {
    useWalletStore.setState({ walletStatus: 'locked', activeWalletId: 1 })
    const { unmount } = await renderTopBar()

    expect(screen.queryByRole('button', { name: 'Network, Testnet 4' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unlock wallet' })).toBeInTheDocument()
    unmount()

    useWalletStore.setState({ walletStatus: 'unlocked', activeWalletId: 1 })
    await renderTopBar()

    expect(screen.getByRole('button', { name: 'Network, Testnet 4' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lock Wallet' })).toBeInTheDocument()
  })

  it('shows the wallet icon and medium-screen name only when there is more than one wallet', async () => {
    dbState.wallets = [{ walletId: 1, name: 'Alpha' }]
    dbState.activeWallet = { walletId: 1, name: 'Alpha' }
    useWalletStore.setState({ walletStatus: 'unlocked', activeWalletId: 1 })
    const { unmount } = await renderTopBar()

    expect(screen.queryByRole('button', { name: 'Wallets' })).not.toBeInTheDocument()
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
    unmount()

    dbState.wallets = [
      { walletId: 1, name: 'Alpha' },
      { walletId: 2, name: 'Beta' },
    ]
    await renderTopBar()

    const walletName = screen.getByText('Alpha')
    expect(walletName.className).toContain('hidden')
    expect(walletName.className).toContain('md:block')
    expect(walletName.previousElementSibling).toHaveAttribute('aria-label', 'Wallets')
    expect(walletName.nextElementSibling?.querySelector('button')).toHaveAttribute(
      'aria-label',
      'Lock Wallet',
    )
  })

  it('locks an unlocked wallet and opens unlock when the wallet is locked', async () => {
    const user = userEvent.setup()
    useWalletStore.setState({ walletStatus: 'unlocked', activeWalletId: 1 })
    const { unmount } = await renderTopBar()

    const lockButton = screen.getByRole('button', { name: 'Lock Wallet' })
    expect(lockButton.querySelector('.lucide-lock-keyhole-open')).toBeInTheDocument()
    await user.click(lockButton)
    expect(orchestrateLockMock).toHaveBeenCalledTimes(1)
    unmount()

    useWalletStore.setState({ walletStatus: 'locked', activeWalletId: 1 })
    await renderTopBar()

    const unlockButton = screen.getByRole('button', { name: 'Unlock wallet' })
    expect(unlockButton.querySelector('.lucide-lock-keyhole')).toBeInTheDocument()
    await user.click(unlockButton)
    expect(screen.getByRole('dialog', { name: 'Unlock Wallet' })).toBeInTheDocument()
    expect(orchestrateLockMock).toHaveBeenCalledTimes(1)
  })

  it('returns to the page left at lock after the header unlock succeeds', async () => {
    const user = userEvent.setup()
    useWalletStore.setState({ walletStatus: 'locked', activeWalletId: 1 })
    usePostLockPrivacyRedirectStore.getState().setPrivacyRedirectFromLock('/wallet/receive')
    await renderTopBar()

    await user.click(screen.getByRole('button', { name: 'Unlock wallet' }))
    await user.click(screen.getByRole('button', { name: 'Complete unlock' }))

    expect(await screen.findByText('Receive page')).toBeInTheDocument()
    expect(usePostLockPrivacyRedirectStore.getState().privacyRedirect).toBeNull()
  })

  it('returns without a password when near-zero mode is active', async () => {
    const user = userEvent.setup()
    useWalletStore.setState({ walletStatus: 'locked', activeWalletId: 1 })
    usePostLockPrivacyRedirectStore.getState().setPrivacyRedirectFromLock('/wallet/receive')
    useNearZeroSecurityStore.setState({ active: true })
    await renderTopBar()

    await user.click(screen.getByRole('button', { name: 'Unlock wallet' }))

    expect(screen.queryByRole('dialog', { name: 'Unlock Wallet' })).not.toBeInTheDocument()
    expect(await screen.findByText('Receive page')).toBeInTheDocument()
  })

  it('hides the lock when there is no wallet', async () => {
    await renderTopBar()

    expect(screen.queryByRole('button', { name: 'Lock Wallet' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unlock wallet' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Network, Testnet 4' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Bitcoin Codex', level: 1 })).toBeInTheDocument()
  })
})
