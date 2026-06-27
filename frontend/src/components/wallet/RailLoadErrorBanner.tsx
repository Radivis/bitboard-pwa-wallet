import type { LoadLifecyclePhase } from '@/lib/wallet/lifecycle/rail-lifecycle-types'
import type { DashboardRailId } from '@/components/wallet/RailSyncControl'
import { RailLifecycleErrorBannerBlock } from '@/components/wallet/RailLifecycleErrorBannerBlock'

const LOAD_ERROR_TITLES: Record<DashboardRailId, string> = {
  onchain: "Couldn't load on-chain wallet",
  lightning: "Couldn't load Lightning connections",
  arkade: "Couldn't open Arkade session",
}

export type RailLoadErrorBannerProps = {
  rail: DashboardRailId
  loadPhase: LoadLifecyclePhase
  errorMessage: string | null
  onRetry: () => void
  isRetrying?: boolean
}

export function RailLoadErrorBanner({
  rail,
  loadPhase,
  errorMessage,
  onRetry,
  isRetrying = false,
}: RailLoadErrorBannerProps) {
  if (loadPhase !== 'load-error') {
    return null
  }

  return (
    <RailLifecycleErrorBannerBlock
      rail={rail}
      variant="load"
      title={LOAD_ERROR_TITLES[rail]}
      errorMessage={errorMessage ?? 'Load failed'}
      onRetry={onRetry}
      isRetrying={isRetrying}
    />
  )
}
