import { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createRouter,
  createMemoryHistory,
  RouterProvider,
  createRootRoute,
  createRoute,
  Outlet,
} from '@tanstack/react-router'

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

interface TestRouterOptions {
  initialPath?: string
  queryClient?: QueryClient
}

/**
 * Creates a TanStack Router instance for testing, rendering the given element
 * inside a root route that provides QueryClient context.
 */
export function createTestRouter(
  element: ReactElement,
  { initialPath = '/', queryClient }: TestRouterOptions = {},
) {
  const testQueryClient = queryClient ?? createTestQueryClient()

  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={testQueryClient}>
        <Outlet />
      </QueryClientProvider>
    ),
  })

  const testRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: initialPath,
    component: () => element,
  })

  const routeTree = rootRoute.addChildren([testRoute])

  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
}

interface RenderWithRouterOptions extends Omit<RenderOptions, 'wrapper'> {
  initialPath?: string
  queryClient?: QueryClient
}

/**
 * Renders a component inside a TanStack Router test harness with
 * QueryClient provider.
 */
export function renderWithRouter(
  ui: ReactElement,
  { initialPath, queryClient, ...options }: RenderWithRouterOptions = {},
) {
  const router = createTestRouter(ui, { initialPath, queryClient })
  return render(<RouterProvider router={router} />, options)
}

export * from '@testing-library/react'

export { renderWithRouter as render }
export { default as userEvent } from '@testing-library/user-event'
