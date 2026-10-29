import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { PostLockPrivacyBanner } from '@/components/PostLockPrivacyBanner'
import { usePostLockPrivacyRedirectStore } from '@/stores/postLockPrivacyRedirectStore'
import { useWalletStore } from '@/stores/walletStore'

vi.mock('@/db', () => ({
  useWallet: () => ({ data: { name: 'Alpha' }, isSuccess: true }),
}))

vi.mock('@/db/storage-adapter', () => ({
  sqliteStorage: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}))

function renderBanner() {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <PostLockPrivacyBanner />
        <Outlet />
      </>
    ),
  })
  const libraryRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'library',
    component: () => <div>Library page</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([libraryRoute]),
    history: createMemoryHistory({ initialEntries: ['/library'] }),
  })
  return render(<RouterProvider router={router} />)
}

describe('PostLockPrivacyBanner', () => {
  beforeEach(() => {
    usePostLockPrivacyRedirectStore.getState().dismissPrivacyRedirectBanner()
    useWalletStore.setState({
      walletStatus: 'locked',
      activeWalletId: 1,
      networkMode: 'testnet',
      loadedDescriptorWallet: null,
    })
  })

  it('explains the privacy redirect while the wallet is locked', async () => {
    usePostLockPrivacyRedirectStore.getState().setPrivacyRedirectFromLock('/wallet/receive')
    renderBanner()

    expect(await screen.findByRole('region', { name: 'Wallet lock privacy notice' })).toBeInTheDocument()
    expect(screen.getByText('Wallet locked — moved to start for privacy')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unlock wallet and go to previous page' })).toBeInTheDocument()
  })

  it('stays hidden when the wallet is unlocked', async () => {
    usePostLockPrivacyRedirectStore.getState().setPrivacyRedirectFromLock('/wallet/receive')
    useWalletStore.setState({ walletStatus: 'unlocked', activeWalletId: 1 })
    renderBanner()

    expect(await screen.findByText('Library page')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Wallet lock privacy notice' })).not.toBeInTheDocument()
  })
})
