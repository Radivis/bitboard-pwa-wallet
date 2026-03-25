import { QueryClientProvider } from '@tanstack/react-query'
import { appQueryClient } from '@/lib/app-query-client'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { lazy, Suspense, useEffect } from 'react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { ThemeSynchronizer } from '@/stores/themeStore'
import { WalletLayout } from '@/components/WalletLayout'
import { AppInitializer } from '@/components/AppInitializer'
import { DatabaseReadyGate } from '@/components/DatabaseReadyGate'
import { InfomodeHintToast } from '@/components/InfomodeHintToast'
import { InfomodeProvider } from '@/components/infomode/InfomodeProvider'
import { LabRouteNavigationProvider } from '@/components/LabRouteNavigationController'
import { checkDatabaseHealth } from '@/db'

// Disable in CI: devtools overlay intercepts pointer events and breaks E2E tests.
const TanStackRouterDevtools =
  import.meta.env.DEV && !import.meta.env.CI
    ? lazy(() =>
        import('@tanstack/react-router-devtools').then((module) => ({
          default: module.TanStackRouterDevtools,
        })),
      )
    : () => null

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  useEffect(() => {
    checkDatabaseHealth().then((result) => {
      if (!result.ok) {
        toast.warning(
          'Database unavailable — wallet data may not persist. Try reloading or use a supported browser.',
          { description: result.error.message },
        )
      }
    })
  }, [])

  return (
    <QueryClientProvider client={appQueryClient}>
      <InfomodeProvider>
        <DatabaseReadyGate>
          <LabRouteNavigationProvider>
            <InfomodeHintToast />
            <ThemeSynchronizer />
            <AppInitializer>
              <WalletLayout>
                <Outlet />
              </WalletLayout>
            </AppInitializer>
          </LabRouteNavigationProvider>
        </DatabaseReadyGate>
      </InfomodeProvider>
      <Toaster position="top-center" richColors />
      <Suspense>
        <TanStackRouterDevtools position="bottom-right" />
      </Suspense>
    </QueryClientProvider>
  )
}
