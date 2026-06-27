import type { ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SyncLifecyclePhase } from '@/lib/wallet/lifecycle/rail-lifecycle-types'

export type DashboardRailId = 'onchain' | 'lightning' | 'arkade'

const RAIL_SYNC_ERROR_CAPTION_DEFERRED = 'Sync failed — see details below'

function formatLastSyncedCaption(lastSyncedAt: Date | string): string {
  const date =
    lastSyncedAt instanceof Date ? lastSyncedAt : new Date(lastSyncedAt)
  return `Last synced: ${date.toLocaleString()}`
}

export type RailSyncControlProps = {
  rail: DashboardRailId
  syncLabel: string
  syncPhase: SyncLifecyclePhase
  lastSyncedAt: Date | string | null
  onSync: () => void
  isSyncPending?: boolean
  /** When false, sync control and caption are hidden (rail not configured). */
  railConfigured?: boolean
  /** Shown in caption when syncPhase is sync-error (unless detail is deferred to a banner). */
  syncErrorMessage?: string | null
  /** When true, caption stays short; full `syncErrorMessage` belongs in `RailSyncErrorBanner`. */
  syncErrorDetailInBanner?: boolean
  secondaryAction?: ReactNode
}

export function RailSyncControl({
  rail,
  syncLabel,
  syncPhase,
  lastSyncedAt,
  onSync,
  isSyncPending = false,
  railConfigured = true,
  syncErrorMessage = null,
  syncErrorDetailInBanner = false,
  secondaryAction,
}: RailSyncControlProps) {
  if (!railConfigured) {
    return null
  }

  const isSyncing = syncPhase === 'syncing' || isSyncPending
  const isSyncError = syncPhase === 'sync-error'
  const lastSyncedIso =
    lastSyncedAt != null
      ? lastSyncedAt instanceof Date
        ? lastSyncedAt.toISOString()
        : new Date(lastSyncedAt).toISOString()
      : undefined

  return (
    <div className="mt-3 flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid={`rail-sync-${rail}`}
          onClick={onSync}
          disabled={isSyncing}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`}
            aria-hidden
          />
          {isSyncing ? 'Syncing…' : syncLabel}
        </Button>
        {secondaryAction}
      </div>
      <p
        className={`text-xs ${isSyncError ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}
        data-testid={`rail-sync-${rail}-caption`}
        {...(lastSyncedIso != null
          ? { 'data-rail-last-synced-at': lastSyncedIso }
          : {})}
      >
        {isSyncError
          ? syncErrorDetailInBanner
            ? RAIL_SYNC_ERROR_CAPTION_DEFERRED
            : syncErrorMessage ?? 'Sync failed — use Sync to retry'
          : lastSyncedAt != null
            ? formatLastSyncedCaption(lastSyncedAt)
            : 'Not synced yet'}
      </p>
    </div>
  )
}
