import { QueryClientProvider } from '@tanstack/react-query'
import { appQueryClient } from '@/lib/app-query-client'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { ThemeSynchronizer } from '@/stores/themeStore'
import { WalletLayout } from '@/components/WalletLayout'
import { AppInitializer } from '@/components/AppInitializer'
import { DatabaseReadyGate } from '@/components/DatabaseReadyGate'
import { InfomodeHintToast } from '@/components/InfomodeHintToast'
import { InfomodeProvider } from '@/components/infomode/InfomodeProvider'
// Disable in CI: devtools overlay intercepts pointer events and breaks E2E tests.
// Set VITE_HIDE_ROUTER_DEVTOOLS=1 when you want a dev build without the floating panel (e.g. screenshots).
const showTanStackRouterDevtools =
  import.meta.env.DEV &&
  !import.meta.env.CI &&
  import.meta.env.VITE_HIDE_ROUTER_DEVTOOLS !== '1' &&
  import.meta.env.VITE_HIDE_ROUTER_DEVTOOLS !== 'true'

const TanStackRouterDevtools = showTanStackRouterDevtools
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
  return (
    <QueryClientProvider client={appQueryClient}>
      <InfomodeProvider>
        <DatabaseReadyGate>
          <InfomodeHintToast />
          <ThemeSynchronizer />
          <AppInitializer>
            <WalletLayout>
              <Outlet />
            </WalletLayout>
          </AppInitializer>
        </DatabaseReadyGate>
      </InfomodeProvider>
      <Toaster position="top-center" richColors />
      <Suspense>
        <TanStackRouterDevtools position="bottom-right" />
      </Suspense>
    </QueryClientProvider>
  )
}
