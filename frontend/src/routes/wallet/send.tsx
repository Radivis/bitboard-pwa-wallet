import { lazy, Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { LoadingSpinner } from '@/components/LoadingSpinner'

/** Code-split: keep the heavy send flow out of the main dev/prod entry graph (E2E `/setup` cold start). */
const SendPageLazy = lazy(() =>
  import('@/pages/wallet/SendPage').then((m) => ({ default: m.SendPage })),
)

function SendRouteShell() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <LoadingSpinner text="Loading..." />
        </div>
      }
    >
      <SendPageLazy />
    </Suspense>
  )
}

export const Route = createFileRoute('/wallet/send')({
  component: SendRouteShell,
})
