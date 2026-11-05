import type {
  LoadLifecyclePhase,
  SyncLifecyclePhase,
} from '@/lib/wallet/lifecycle/rail-lifecycle-types'
import type { DashboardRailId } from '@/components/wallet/RailSyncControl'
import { RailLifecycleErrorBannerBlock } from '@/components/wallet/RailLifecycleErrorBannerBlock'

const SYNC_WARNING_TITLES: Record<DashboardRailId, string> = {
  onchain: 'On-chain sync completed with warnings',
  lightning: 'Lightning sync completed with warnings',
  arkade: 'Arkade sync completed with warnings',
  bark: 'Bark sync completed with warnings',
}

export type RailSyncWarningBannerProps = {
  rail: DashboardRailId
  syncPhase: SyncLifecyclePhase
  loadPhase: LoadLifecyclePhase
  warningMessages: readonly string[]
  onRetry: () => void
  isRetrying?: boolean
}

export function RailSyncWarningBanner({
  rail,
  syncPhase,
  loadPhase,
  warningMessages,
  onRetry,
  isRetrying = false,
}: RailSyncWarningBannerProps) {
  if (
    warningMessages.length === 0 ||
    syncPhase === 'sync-error' ||
    syncPhase === 'syncing' ||
    loadPhase !== 'loaded'
  ) {
    return null
  }

  return (
    <RailLifecycleErrorBannerBlock
      rail={rail}
      variant="sync-warning"
      title={SYNC_WARNING_TITLES[rail]}
      errorMessage={warningMessages.map((message) => (
        <p key={message}>{message}</p>
      ))}
      onRetry={onRetry}
      isRetrying={isRetrying}
      retryLabel="Sync again"
    />
  )
}
