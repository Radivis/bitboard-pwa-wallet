import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { WalletLayout } from '@/components/WalletLayout'
import { DESIGN_NETWORK_DRAWER_ID } from '@/components/design/DesignNetworkDrawer'
import { DESIGN_SIDE_DRAWER_ID } from '@/components/design/DesignSideDrawer'
import { DESIGN_WALLET_DRAWER_ID } from '@/components/design/DesignWalletDrawer'
import { InfomodeProvider } from '@/components/infomode/InfomodeProvider'
import { createTestQueryClient } from '@/test-utils/test-utils'
import { useWalletStore } from '@/stores/walletStore'

vi.mock('@/db/storage-adapter', () => ({
  sqliteStorage: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}))

const walletListState = vi.hoisted(() => ({
  wallets: [] as { walletId: number; name: string; createdAt: string }[],
}))

const prepareActiveWalletSwitchMock = vi.hoisted(() => vi.fn())

vi.mock('@/db', async () => {
  const actual = await vi.importActual<typeof import('@/db')>('@/db')
  return {
    ...actual,
    useWallets: () => ({ data: walletListState.wallets }),
    useWallet: (walletId: number | null) => {
      const wallet = walletListState.wallets.find((entry) => entry.walletId === walletId) ?? null
      return { data: wallet, isSuccess: wallet != null }
    },
  }
})

vi.mock('@/lib/wallet/prepare-active-wallet-switch', () => ({
  prepareActiveWalletSwitch: prepareActiveWalletSwitchMock,
}))

function renderSetupLayout() {
  const queryClient = createTestQueryClient()
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <InfomodeProvider>
          <Outlet />
        </InfomodeProvider>
      </QueryClientProvider>
    ),
  })
  const setupRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'setup',
    component: () => (
      <WalletLayout>
        <div>setup</div>
      </WalletLayout>
    ),
  })
  const destinationPaths = ['wallet', 'wallet/send', 'wallet/receive', 'wallet/management', 'lab/blocks', 'library', 'guides', 'settings']
  const destinationRoutes = destinationPaths.map((path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => <div>{path}</div>,
    }),
  )
  const router = createRouter({
    routeTree: rootRoute.addChildren([setupRoute, ...destinationRoutes]),
    history: createMemoryHistory({ initialEntries: ['/setup'] }),
  })

  return render(<RouterProvider router={router} />)
}

describe('WalletLayout side drawer', () => {
  beforeEach(() => {
    walletListState.wallets = []
    prepareActiveWalletSwitchMock.mockReset()
    prepareActiveWalletSwitchMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    useWalletStore.setState({
      walletStatus: 'none',
      activeWalletId: null,
      networkMode: 'testnet',
      loadedDescriptorWallet: null,
    })
  })

  it('hamburger opens and closes the drawer without the old theme toggle', async () => {
    const user = userEvent.setup()
    renderSetupLayout()

    const menuButton = await screen.findByRole('button', { name: 'Menu' })
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    expect(menuButton).toHaveAttribute('aria-controls', DESIGN_SIDE_DRAWER_ID)
    expect(screen.queryByRole('group', { name: 'Theme selection' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument()

    await user.click(menuButton)

    const drawer = screen.getByRole('dialog', { name: 'Menu' })
    expect(menuButton).toHaveAttribute('aria-expanded', 'true')
    expect(within(drawer).getByRole('link', { name: 'Wallet' })).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: 'Dark mode' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Theme selection' })).not.toBeInTheDocument()

    await user.click(menuButton)

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument()
    })
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
  })

  it('network badge opens the network drawer and closes the menu', async () => {
    const user = userEvent.setup()
    useWalletStore.setState({
      walletStatus: 'unlocked',
      activeWalletId: 1,
      networkMode: 'testnet',
      loadedDescriptorWallet: null,
    })
    renderSetupLayout()

    const menuButton = await screen.findByRole('button', { name: 'Menu' })
    await user.click(menuButton)
    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeInTheDocument()

    const networkButton = screen.getByRole('button', { name: 'Network, Testnet 4' })
    expect(networkButton).toHaveAttribute('aria-controls', DESIGN_NETWORK_DRAWER_ID)
    await user.click(networkButton)

    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Network' })).toBeInTheDocument()
    expect(networkButton).toHaveAttribute('aria-expanded', 'true')
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
  })

  it('wallet icon opens the wallet drawer and closes the menu and network drawer', async () => {
    const user = userEvent.setup()
    walletListState.wallets = [
      { walletId: 1, name: 'Alpha', createdAt: '2026-01-01T00:00:00.000Z' },
      { walletId: 2, name: 'Beta', createdAt: '2026-01-02T00:00:00.000Z' },
    ]
    useWalletStore.setState({
      walletStatus: 'unlocked',
      activeWalletId: 1,
      networkMode: 'testnet',
      loadedDescriptorWallet: null,
    })
    renderSetupLayout()

    const menuButton = await screen.findByRole('button', { name: 'Menu' })
    await user.click(menuButton)
    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeInTheDocument()

    const walletsButton = screen.getByRole('button', { name: 'Wallets' })
    expect(walletsButton).toHaveAttribute('aria-controls', DESIGN_WALLET_DRAWER_ID)
    await user.click(walletsButton)

    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Select wallet' })).toBeInTheDocument()
    expect(walletsButton).toHaveAttribute('aria-expanded', 'true')
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')

    const networkButton = screen.getByRole('button', { name: 'Network, Testnet 4' })
    await user.click(networkButton)

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Select wallet' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('dialog', { name: 'Network' })).toBeInTheDocument()
    expect(walletsButton).toHaveAttribute('aria-expanded', 'false')

    await user.click(walletsButton)

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Network' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('dialog', { name: 'Select wallet' })).toBeInTheDocument()
  })

  it('switches to another wallet without leaving the current route', async () => {
    const user = userEvent.setup()
    walletListState.wallets = [
      { walletId: 1, name: 'Alpha', createdAt: '2026-01-01T00:00:00.000Z' },
      { walletId: 2, name: 'Beta', createdAt: '2026-01-02T00:00:00.000Z' },
    ]
    useWalletStore.setState({
      walletStatus: 'unlocked',
      activeWalletId: 1,
      networkMode: 'testnet',
      loadedDescriptorWallet: null,
    })
    renderSetupLayout()

    const walletsButton = await screen.findByRole('button', { name: 'Wallets' })
    await user.click(walletsButton)
    await user.click(screen.getByRole('button', { name: 'Alpha' }))

    expect(prepareActiveWalletSwitchMock).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Select wallet' })).not.toBeInTheDocument()
    })
    expect(screen.getByText('setup')).toBeInTheDocument()

    await user.click(walletsButton)
    await user.click(screen.getByRole('button', { name: 'Beta' }))

    await waitFor(() => {
      expect(prepareActiveWalletSwitchMock).toHaveBeenCalledWith(2)
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Select wallet' })).not.toBeInTheDocument()
    })
    expect(screen.getByText('setup')).toBeInTheDocument()
    expect(prepareActiveWalletSwitchMock).toHaveBeenCalledTimes(1)
  })
})
