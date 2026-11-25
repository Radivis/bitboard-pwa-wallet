import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'

/** Minimal library routes so article and tag links resolve in component tests. */
export function renderWithLibraryRouter(ui: ReactElement) {
  const rootRoute = createRootRoute({ component: Outlet })
  const libraryRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/library',
    component: () => ui,
  })
  const articleRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/library/articles/$slug',
    component: () => <div>Article</div>,
  })
  const tagsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/library/tags',
    validateSearch: (search: Record<string, unknown>) => ({
      tag: typeof search.tag === 'string' ? search.tag : undefined,
    }),
    component: () => <div>Tags</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([libraryRoute, articleRoute, tagsRoute]),
    history: createMemoryHistory({ initialEntries: ['/library'] }),
  })

  return render(<RouterProvider router={router} />)
}
