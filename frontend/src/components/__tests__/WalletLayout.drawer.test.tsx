import { describe, expect, it, vi } from 'vitest'
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
import { createTestQueryClient } from '@/test-utils/test-utils'

vi.mock('@/db/storage-adapter', () => ({
  sqliteStorage: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}))

function renderSetupLayout() {
  const queryClient = createTestQueryClient()
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <Outlet />
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
  const destinationPaths = ['wallet', 'wallet/send', 'wallet/receive', 'wallet/management', 'lab/blocks', 'library', 'settings']
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
})
