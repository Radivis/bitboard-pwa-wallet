import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { ThemeSynchronizer } from '@/stores/themeStore'
import { WalletLayout } from '@/components/WalletLayout'

const TanStackRouterDevtools = import.meta.env.DEV
  ? lazy(() =>
      import('@tanstack/react-router-devtools').then((module) => ({
        default: module.TanStackRouterDevtools,
      })),
    )
  : () => null

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeSynchronizer />
      <WalletLayout>
        <Outlet />
      </WalletLayout>
      <Suspense>
        <TanStackRouterDevtools position="bottom-right" />
      </Suspense>
    </QueryClientProvider>
  )
}
