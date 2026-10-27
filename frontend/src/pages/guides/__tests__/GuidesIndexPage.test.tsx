import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { GuidesIndexPage } from '@/pages/guides/GuidesIndexPage'

function renderGuidesIndex() {
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/guides',
    component: GuidesIndexPage,
  })
  const destinations = ['/guides/how-to-get-bitcoin', '/guides/introduction'].map((path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => <div>{path}</div>,
    }),
  )
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, ...destinations]),
    history: createMemoryHistory({ initialEntries: ['/guides'] }),
  })
  return render(<RouterProvider router={router} />)
}

describe('GuidesIndexPage', () => {
  it('links How to get Bitcoin and Introduction', async () => {
    renderGuidesIndex()

    expect(await screen.findByRole('heading', { name: 'Guides' })).toBeInTheDocument()
    expect(screen.getByText('Practical step by step instructions')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'How to get Bitcoin' })).toHaveAttribute(
      'href',
      '/guides/how-to-get-bitcoin',
    )
    expect(screen.getByRole('link', { name: 'Introduction' })).toHaveAttribute(
      'href',
      '/guides/introduction',
    )
  })
})
