import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BookOpen, FlaskConical, Settings, Wallet } from 'lucide-react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { DesignSideDrawer, type DesignDrawerNavItem } from '@/components/design/DesignSideDrawer'

vi.mock('@/db/storage-adapter', () => ({
  sqliteStorage: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}))

const drawerNavItems: DesignDrawerNavItem[] = [
  { to: '/wallet', label: 'Wallet', icon: Wallet, selected: true },
  { to: '/lab/blocks', label: 'Lab', icon: FlaskConical, selected: false, linkPreload: false },
  { to: '/library', label: 'Library', icon: BookOpen, selected: false },
  { to: '/settings', label: 'Settings', icon: Settings, selected: false },
]

function renderDrawer(
  props: {
    open?: boolean
    onOpen?: () => void
    onClose?: () => void
    navItems?: DesignDrawerNavItem[]
  } = {},
) {
  const open = props.open ?? true
  const onOpen = props.onOpen ?? vi.fn()
  const onClose = props.onClose ?? vi.fn()
  const navItems = props.navItems ?? drawerNavItems

  function DrawerRoute() {
    return (
      <DesignSideDrawer open={open} onOpen={onOpen} onClose={onClose} navItems={navItems} />
    )
  }

  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  })
  const routes = ['wallet', 'lab/blocks', 'library', 'settings'].map((path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: DrawerRoute,
    }),
  )
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ['/wallet'] }),
  })

  return {
    onClose,
    onOpen,
    ...render(<RouterProvider router={router} />),
  }
}

describe('DesignSideDrawer', () => {
  it('shows section links and marks the active section selected', async () => {
    renderDrawer()

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Wallet' })).toBeInTheDocument()
    })
    const walletLink = screen.getByRole('link', { name: 'Wallet' })
    expect(walletLink.className).toContain('--design-nav-background-selected')
    expect(walletLink).toHaveAttribute('aria-current', 'page')
    expect(walletLink).toHaveAttribute('href', '/wallet')
    expect(screen.getByRole('link', { name: 'Lab' })).toHaveAttribute('data-status', 'default')
    expect(screen.getByRole('link', { name: 'Lab' })).toHaveAttribute('href', '/lab/blocks')
    expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute('href', '/library')
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
    expect(screen.getByText('Navigation')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Light mode' })).toBeInTheDocument()
  })

  it('closes when a navigation link is chosen', async () => {
    const user = userEvent.setup()
    const { onClose } = renderDrawer()

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('link', { name: 'Settings' }))

    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape and on the backdrop', async () => {
    const user = userEvent.setup()
    const { onClose } = renderDrawer()

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Menu' })).toBeInTheDocument()
    })
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)

    await user.click(screen.getByTestId('design-side-drawer-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
