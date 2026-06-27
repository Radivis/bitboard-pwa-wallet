import type {
  LoadLifecyclePhase,
  SyncLifecyclePhase,
} from '@/lib/wallet/lifecycle/rail-lifecycle-types'
import type { DashboardRailId } from '@/components/wallet/RailSyncControl'
import { RailLifecycleErrorBannerBlock } from '@/components/wallet/RailLifecycleErrorBannerBlock'

const SYNC_ERROR_TITLES: Record<DashboardRailId, string> = {
  onchain: 'On-chain sync failed',
  lightning: 'Lightning sync failed',
  arkade: 'Arkade operator sync failed',
}

export type RailSyncErrorBannerProps = {
  rail: DashboardRailId
  syncPhase: SyncLifecyclePhase
  loadPhase: LoadLifecyclePhase
  errorMessage: string | null
  onRetry: () => void
  isRetrying?: boolean
}

export function RailSyncErrorBanner({
  rail,
  syncPhase,
  loadPhase,
  errorMessage,
  onRetry,
  isRetrying = false,
}: RailSyncErrorBannerProps) {
  if (syncPhase !== 'sync-error' || loadPhase !== 'loaded') {
    return null
  }

  return (
    <RailLifecycleErrorBannerBlock
      rail={rail}
      variant="sync"
      title={SYNC_ERROR_TITLES[rail]}
      errorMessage={errorMessage ?? 'Sync failed'}
      onRetry={onRetry}
      isRetrying={isRetrying}
      retryLabel="Sync again"
    />
  )
}
