import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { Route as SettingsRoute } from '@/routes/settings'

function validateDataBackupsSearch(
  search: Record<string, unknown>,
): { section?: 'data-backups' } {
  if (search.section === 'data-backups') return { section: 'data-backups' }
  return {}
}

function renderSettingsTree(initialPath: string) {
  const SettingsLayout = SettingsRoute.options.component
  if (SettingsLayout == null) {
    throw new Error('Settings route is missing a component')
  }

  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  })
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'settings',
    validateSearch: validateDataBackupsSearch,
    component: SettingsLayout,
  })
  const settingsIndexRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/',
    component: () => <div>settings main</div>,
  })
  const settingsSecurityRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: 'security',
    validateSearch: validateDataBackupsSearch,
    component: () => <div>settings security</div>,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      settingsRoute.addChildren([settingsIndexRoute, settingsSecurityRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })

  return render(<RouterProvider router={router} />)
}

describe('Settings data-backups deep link', () => {
  it('opens Security when /settings?section=data-backups is loaded', async () => {
    renderSettingsTree('/settings?section=data-backups')

    await waitFor(() => {
      expect(screen.getByText('settings security')).toBeInTheDocument()
    })
    expect(screen.queryByText('settings main')).not.toBeInTheDocument()
  })
})
