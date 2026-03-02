import { ReactElement, ReactNode } from 'react'
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
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from '../contexts/ThemeContext'

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
 * inside a root route that provides QueryClient and Theme context.
 */
export function createTestRouter(
  element: ReactElement,
  { initialPath = '/', queryClient }: TestRouterOptions = {},
) {
  const testQueryClient = queryClient ?? createTestQueryClient()

  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={testQueryClient}>
        <ThemeProvider>
          <Outlet />
        </ThemeProvider>
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
 * QueryClient and Theme providers.
 */
export function renderWithRouter(
  ui: ReactElement,
  { initialPath, queryClient, ...options }: RenderWithRouterOptions = {},
) {
  const router = createTestRouter(ui, { initialPath, queryClient })
  return render(<RouterProvider router={router} />, options)
}

// ---------------------------------------------------------------------------
// Legacy wrapper using BrowserRouter (for old tests that depend on
// react-router-dom -- remove along with old pages in Phase 5)
// ---------------------------------------------------------------------------

interface LegacyProvidersProps {
  children: ReactNode
  queryClient?: QueryClient
}

function LegacyProviders({ children, queryClient }: LegacyProvidersProps) {
  const testQueryClient = queryClient ?? createTestQueryClient()

  return (
    <QueryClientProvider client={testQueryClient}>
      <BrowserRouter>
        <ThemeProvider>{children}</ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

interface LegacyRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient
}

export function legacyRender(
  ui: ReactElement,
  { queryClient, ...options }: LegacyRenderOptions = {},
) {
  return render(ui, {
    wrapper: ({ children }) => (
      <LegacyProviders queryClient={queryClient}>{children}</LegacyProviders>
    ),
    ...options,
  })
}

// Re-export everything from testing-library
export * from '@testing-library/react'

// Default render uses the legacy wrapper so existing tests keep passing.
// New tests should use renderWithRouter instead.
export { legacyRender as render }
export { default as userEvent } from '@testing-library/user-event'
