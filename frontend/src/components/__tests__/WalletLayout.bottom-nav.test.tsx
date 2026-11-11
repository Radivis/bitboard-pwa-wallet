import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
import { SECTION_SUB_NAV_ID, WalletLayout } from '@/components/WalletLayout'
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

vi.mock('@/db', async () => {
  const actual = await vi.importActual<typeof import('@/db')>('@/db')
  return {
    ...actual,
    useWallets: () => ({ data: [] }),
    useWallet: () => ({ data: null, isSuccess: false }),
  }
})

vi.mock('@/lib/wallet/prepare-active-wallet-switch', () => ({
  prepareActiveWalletSwitch: vi.fn(),
}))

function renderWalletLayout() {
  const queryClient = createTestQueryClient()
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <InfomodeProvider>
          <WalletLayout>
            <Outlet />
          </WalletLayout>
        </InfomodeProvider>
      </QueryClientProvider>
    ),
  })
  const walletRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'wallet',
    component: () => <div>wallet page</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([walletRoute]),
    history: createMemoryHistory({ initialEntries: ['/wallet'] }),
  })

  return render(<RouterProvider router={router} />)
}

function sectionNav() {
  const nav = document.getElementById(SECTION_SUB_NAV_ID)
  expect(nav).not.toBeNull()
  return nav as HTMLElement
}

describe('WalletLayout section nav toggle', () => {
  beforeEach(() => {
    useWalletStore.setState({
      walletStatus: 'none',
      activeWalletId: null,
      networkMode: 'testnet',
      loadedDescriptorWallet: null,
    })
  })

  afterEach(() => {
    useWalletStore.setState({
      walletStatus: 'none',
      activeWalletId: null,
      networkMode: 'testnet',
      loadedDescriptorWallet: null,
    })
  })

  it('hides the section nav and keeps the toggle, then shows the nav again', async () => {
    const user = userEvent.setup()
    renderWalletLayout()

    const hideButton = await screen.findByRole('button', { name: 'Hide navigation' })
    const nav = sectionNav()
    expect(hideButton).toHaveAttribute('aria-expanded', 'true')
    expect(hideButton).toHaveAttribute('aria-controls', SECTION_SUB_NAV_ID)
    expect(nav.contains(hideButton)).toBe(false)
    expect(nav).toHaveAttribute('aria-hidden', 'false')
    expect(nav.className).not.toContain('translate-y-full')
    expect(nav.className).toContain('pt-5')
    expect(hideButton.style.bottom).toBe('calc(var(--section-nav-height, 1.25rem) - 1.25rem)')
    expect(hideButton.className).toContain('bg-transparent')
    expect(screen.getByRole('main').className).toContain('pb-32')
    expect(screen.getByRole('navigation', { name: 'Wallet' })).toBe(nav)

    await user.click(hideButton)

    const showButton = screen.getByRole('button', { name: 'Show navigation' })
    expect(showButton).toHaveAttribute('aria-expanded', 'false')
    expect(showButton).toHaveAttribute('data-direction', 'up')
    expect(showButton.querySelector('span')).toHaveClass('rotate-180')
    expect(showButton.style.bottom).toBe('0.5rem')
    expect(showButton.className).toContain('--design-elevation-nav-bar')
    expect(showButton.className).not.toContain('bg-transparent')
    expect(sectionNav()).toHaveAttribute('aria-hidden', 'true')
    expect(sectionNav().className).toContain('translate-y-full')
    expect(screen.queryByRole('navigation', { name: 'Wallet' })).not.toBeInTheDocument()
    expect(screen.getByRole('main').className).toContain('pb-12')

    await user.click(showButton)

    const restoredButton = screen.getByRole('button', { name: 'Hide navigation' })
    expect(restoredButton).toHaveAttribute('aria-expanded', 'true')
    expect(restoredButton.querySelector('span')).not.toHaveClass('rotate-180')
    expect(sectionNav()).toHaveAttribute('aria-hidden', 'false')
    expect(sectionNav().className).not.toContain('translate-y-full')
    expect(screen.getByRole('navigation', { name: 'Wallet' })).toBeInTheDocument()
  })
})
