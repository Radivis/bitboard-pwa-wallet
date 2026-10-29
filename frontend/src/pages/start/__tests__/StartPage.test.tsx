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
import { InfomodeProvider } from '@/components/infomode/InfomodeProvider'
import { StartPage } from '@/pages/start/StartPage'
import { usePostLockPrivacyRedirectStore } from '@/stores/postLockPrivacyRedirectStore'

const walletsState = vi.hoisted(() => ({
  wallets: undefined as { walletId: number }[] | undefined,
}))

vi.mock('@/db', () => ({
  useWallets: () => ({ data: walletsState.wallets }),
  useWallet: () => ({ data: null, isSuccess: false }),
}))

vi.mock('@/db/storage-adapter', () => ({
  sqliteStorage: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}))

function renderStartPage() {
  const rootRoute = createRootRoute({
    component: () => (
      <InfomodeProvider>
        <Outlet />
      </InfomodeProvider>
    ),
  })
  const paths = ['/', 'wallet', 'setup', 'lab/blocks', 'library', 'guides', 'settings']
  const routes = paths.map((path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: path === '/' ? StartPage : () => <div>{path}</div>,
    }),
  )
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(<RouterProvider router={router} />)
}

describe('StartPage', () => {
  beforeEach(() => {
    walletsState.wallets = undefined
    usePostLockPrivacyRedirectStore.getState().dismissPrivacyRedirectBanner()
  })

  it('links each area, and sends Wallet to setup when no wallet exists', async () => {
    walletsState.wallets = []
    renderStartPage()

    expect(await screen.findByRole('link', { name: 'Wallet' })).toHaveAttribute('href', '/setup')
    expect(screen.getByRole('link', { name: 'Lab' })).toHaveAttribute('href', '/lab/blocks')
    expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute('href', '/library')
    expect(screen.getByRole('link', { name: 'Guides' })).toHaveAttribute('href', '/guides')
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
    expect(screen.getByRole('heading', { name: 'Bitcoin Codex' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'App areas' }).className).toContain(
      'max-w-[648px]',
    )
  })

  it('links Wallet to the wallet when one exists', async () => {
    walletsState.wallets = [{ walletId: 1 }]
    renderStartPage()

    expect(await screen.findByRole('link', { name: 'Wallet' })).toHaveAttribute('href', '/wallet')
  })
})
